/**
 * Simple alpha-weighted box blur (radius 1). Smooths the blocky/speckled
 * look of a raw low-resolution grid render without bleeding color across
 * the land/ocean boundary — transparent (land) neighbors contribute zero
 * weight, so coastlines stay crisp while the ocean field itself softens
 * into something that reads as a continuous field rather than static.
 */
export function smoothImageData(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumA = 0
      let weight = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const idx = (ny * width + nx) * 4
          const a = data[idx + 3]
          if (a === 0) continue
          sumR += data[idx] * a
          sumG += data[idx + 1] * a
          sumB += data[idx + 2] * a
          sumA += a
          weight++
        }
      }
      const outIdx = (y * width + x) * 4
      if (sumA === 0) {
        out[outIdx + 3] = 0
        continue
      }
      out[outIdx] = sumR / sumA
      out[outIdx + 1] = sumG / sumA
      out[outIdx + 2] = sumB / sumA
      // average alpha only over the 9-cell window (not weighted) so land
      // edges fade out softly instead of an abrupt hard edge
      out[outIdx + 3] = sumA / weight
    }
  }
  return out
}
