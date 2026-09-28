"""
ALL model code lives here — both encoders (moved out of the notebook),
the shared decoder, the local residual head, and the wrapper that combines
any encoder with the decoder.

Both encoders return the same interface: (embedding, [s1, s2, s3], original_size)
so either can be passed into OceanEmbedModel interchangeably:
    OceanEmbedModel(Encoder)          # CNN, depthwise-separable convs
    OceanEmbedModel(ViTHybridEncoder) # CNN stem + attention bottleneck
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

from config import NUM_DEPTHS, IN_CHANNELS


def pad_to_multiple(x, multiple=8):
    """Pads spatial dims to nearest multiple of `multiple`. Returns padded tensor + original size for unpadding later."""
    _, _, h, w = x.shape
    pad_h = (multiple - h % multiple) % multiple
    pad_w = (multiple - w % multiple) % multiple
    x_padded = F.pad(x, (0, pad_w, 0, pad_h))  # pad right, bottom only
    return x_padded, (h, w)


def unpad(x, original_size):
    """Crop back to original spatial size after decoder upsampling."""
    h, w = original_size
    return x[:, :, :h, :w]


# =============================================================================
# ENCODER A — plain CNN, depthwise-separable convs (your current default)
# =============================================================================
class DepthwiseSeparableConv(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size=3, padding=1):
        super().__init__()
        self.depthwise = nn.Conv2d(in_channels, in_channels, kernel_size=kernel_size,
                                    padding=padding, groups=in_channels)
        self.pointwise = nn.Conv2d(in_channels, out_channels, kernel_size=1)
        self.bn = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        x = self.depthwise(x)
        x = self.pointwise(x)
        x = self.bn(x)
        x = self.relu(x)
        return x


class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.block = nn.Sequential(
            DepthwiseSeparableConv(in_ch, out_ch),
            DepthwiseSeparableConv(out_ch, out_ch),
        )

    def forward(self, x):
        return self.block(x)


class Encoder(nn.Module):
    """
    Encodes 13-channel surface input (7 physical + 6 positional/temporal)
    into a compact latent embedding.
    Returns (bottleneck_embedding, [skip1, skip2, skip3], original_size)
    """
    def __init__(self, in_channels=IN_CHANNELS, base_channels=32):
        super().__init__()
        c = base_channels

        self.enc1 = ConvBlock(in_channels, c)        # 13 -> 32
        self.pool1 = nn.MaxPool2d(2)

        self.enc2 = ConvBlock(c, c * 2)              # 32 -> 64
        self.pool2 = nn.MaxPool2d(2)

        self.enc3 = ConvBlock(c * 2, c * 4)          # 64 -> 128
        self.pool3 = nn.MaxPool2d(2)

        self.bottleneck = ConvBlock(c * 4, c * 8)    # 128 -> 256 (the embedding)

    def forward(self, x):
        # x shape: (B, 13, H, W) -- pad first since 73x89 isn't divisible by 8
        x, original_size = pad_to_multiple(x, multiple=8)

        s1 = self.enc1(x)
        p1 = self.pool1(s1)

        s2 = self.enc2(p1)
        p2 = self.pool2(s2)

        s3 = self.enc3(p2)
        p3 = self.pool3(s3)

        embedding = self.bottleneck(p3)

        return embedding, [s1, s2, s3], original_size


# =============================================================================
# ENCODER B — CNN stem + Transformer (self-attention) bottleneck
# Drop-in replacement for Encoder -- same interface, same output shapes.
# =============================================================================
class PlainConvBlock(nn.Module):
    """Standard (non-depthwise) conv block — used only inside ViTHybridEncoder's stem."""
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_ch),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.block(x)


class TransformerBottleneck(nn.Module):
    """
    Replaces the plain ConvBlock bottleneck with self-attention.
    Operates on the (B, C, H, W) feature map by treating each spatial
    location as a 'token' -- lets every location attend to every other
    location, capturing long-range dependencies a CNN's local filters miss.
    """
    def __init__(self, in_ch, embed_dim=256, depth=2, n_heads=8):
        super().__init__()
        self.proj_in = nn.Conv2d(in_ch, embed_dim, kernel_size=1)  # match channel dim
        self.pos_embed = None  # created dynamically based on spatial size (set in forward)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim, nhead=n_heads, dim_feedforward=embed_dim * 4,
            batch_first=True, dropout=0.1
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=depth)
        self.embed_dim = embed_dim

    def forward(self, x):
        x = self.proj_in(x)                     # (B, embed_dim, H, W)
        B, C, H, W = x.shape

        tokens = x.flatten(2).transpose(1, 2)    # (B, H*W, embed_dim) -- each pixel is a token

        # Positional embedding: create once, cache for reuse (recreate if spatial size changes)
        if self.pos_embed is None or self.pos_embed.shape[1] != tokens.shape[1]:
            self.pos_embed = nn.Parameter(
                torch.zeros(1, tokens.shape[1], self.embed_dim, device=x.device)
            )
            nn.init.trunc_normal_(self.pos_embed, std=0.02)

        tokens = tokens + self.pos_embed
        tokens = self.transformer(tokens)        # attention across all spatial positions

        out = tokens.transpose(1, 2).reshape(B, C, H, W)  # back to spatial feature map
        return out


class ViTHybridEncoder(nn.Module):
    """
    CNN stem (for skip connections, same shapes as Encoder) +
    Transformer bottleneck (attention instead of plain conv).
    Returns (embedding, [s1, s2, s3], original_size)
    """
    def __init__(self, in_channels=IN_CHANNELS, base_channels=32, embed_dim=256, vit_depth=2, n_heads=8):
        super().__init__()
        c = base_channels

        self.enc1 = PlainConvBlock(in_channels, c)         # 13 -> 32
        self.pool1 = nn.MaxPool2d(2)

        self.enc2 = PlainConvBlock(c, c * 2)                # 32 -> 64
        self.pool2 = nn.MaxPool2d(2)

        self.enc3 = PlainConvBlock(c * 2, c * 4)             # 64 -> 128
        self.pool3 = nn.MaxPool2d(2)

        # Bottleneck replaced with attention instead of ConvBlock
        self.bottleneck = TransformerBottleneck(
            in_ch=c * 4, embed_dim=embed_dim, depth=vit_depth, n_heads=n_heads
        )

    def forward(self, x):
        x, original_size = pad_to_multiple(x, multiple=8)

        s1 = self.enc1(x)
        p1 = self.pool1(s1)

        s2 = self.enc2(p1)
        p2 = self.pool2(s2)

        s3 = self.enc3(p2)
        p3 = self.pool3(s3)

        embedding = self.bottleneck(p3)   # attention-based embedding, same shape as before

        return embedding, [s1, s2, s3], original_size


# =============================================================================
# DECODER — shared trunk + independent per-depth heads (each depth gets its
# own small specialist head, closer to XGBoost's "15 independent models"
# structure than one shared layer serving all 15 depths at once).
# =============================================================================
class UpBlock(nn.Module):
    def __init__(self, in_ch, skip_ch, out_ch):
        super().__init__()
        self.upsample = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)
        self.reduce = nn.Conv2d(in_ch, out_ch, kernel_size=1)
        self.conv = nn.Sequential(
            nn.Conv2d(out_ch + skip_ch, out_ch, kernel_size=3, padding=1),
            nn.GroupNorm(8, out_ch), nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1),
            nn.GroupNorm(8, out_ch), nn.ReLU(inplace=True),
        )

    def forward(self, x, skip):
        x = self.upsample(x)
        x = self.reduce(x)
        if x.shape[-2:] != skip.shape[-2:]:
            x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        return self.conv(torch.cat([x, skip], dim=1))


class UNetDecoder(nn.Module):
    def __init__(self, bottleneck_channels=256, base_channels=32, num_depths=NUM_DEPTHS):
        super().__init__()
        c = base_channels
        self.num_depths = num_depths
        self.up3 = UpBlock(bottleneck_channels, c * 4, c * 4)
        self.up2 = UpBlock(c * 4, c * 2, c * 2)
        self.up1 = UpBlock(c * 2, c, c)

        # One small independent head per depth (2 conv layers, own weights)
        # instead of a single shared nn.Conv2d(c, num_depths, 1)
        self.depth_heads = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(c, c // 2, kernel_size=3, padding=1),
                nn.GroupNorm(4, c // 2), nn.ReLU(inplace=True),
                nn.Conv2d(c // 2, 1, kernel_size=1),
            )
            for _ in range(num_depths)
        ])

    def forward(self, embedding, skips, original_size):
        s1, s2, s3 = skips
        x = self.up3(embedding, s3)
        x = self.up2(x, s2)
        x = self.up1(x, s1)

        outputs = [head(x) for head in self.depth_heads]
        x = torch.cat(outputs, dim=1)

        x = unpad(x, original_size)
        if torch.isnan(x).any():
            raise RuntimeError("Decoder produced NaN output — check upstream encoder/data.")
        return x


class LocalResidualHead(nn.Module):
    """
    Shallow, NO-POOLING branch operating directly on the raw input grid.
    Gives the model a direct per-pixel path to precision that survives
    the U-Net's 8x spatial downsampling. Its output is ADDED to the
    U-Net's output, so the model can use whichever signal (local vs
    spatial-context) helps more.
    """
    def __init__(self, in_channels=IN_CHANNELS, hidden=32, num_depths=NUM_DEPTHS):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, hidden, kernel_size=3, padding=1),
            nn.GroupNorm(8, hidden), nn.ReLU(inplace=True),
            nn.Conv2d(hidden, hidden, kernel_size=1),
            nn.GroupNorm(8, hidden), nn.ReLU(inplace=True),
            nn.Conv2d(hidden, num_depths, kernel_size=1),
        )

    def forward(self, x):
        return self.net(x)


# =============================================================================
# MODEL WRAPPER — works with ANY encoder class matching the interface
# (must return (embedding, [s1, s2, s3], original_size)).
#   OceanEmbedModel(Encoder)           # CNN
#   OceanEmbedModel(ViTHybridEncoder)  # attention bottleneck
# =============================================================================
class OceanEmbedModel(nn.Module):
    def __init__(self, encoder_class, in_channels=IN_CHANNELS, base_channels=32, num_depths=NUM_DEPTHS):
        super().__init__()
        self.encoder = encoder_class(in_channels=in_channels, base_channels=base_channels)
        self.decoder = UNetDecoder(bottleneck_channels=base_channels * 8,
                                    base_channels=base_channels, num_depths=num_depths)
        self.local_head = LocalResidualHead(in_channels=in_channels, num_depths=num_depths)

    def forward(self, x):
        embedding, skips, orig_size = self.encoder(x)
        unet_out = self.decoder(embedding, skips, orig_size)
        local_out = self.local_head(x)
        return unet_out + local_out
