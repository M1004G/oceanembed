"""
Evaluation against your own held-out test set (evaluate_model) and against
real independent ARGO float profiles (evaluate_against_argo) — the two
validation steps from your pipeline plan (Phase 6).
"""
import numpy as np
import torch
from torch.utils.data import DataLoader

import xarray as xr

from config import DEPTHS_M


# =============================================================================
# evaluate_model — reusable by you, your validation teammate, or a frontend
# building a "compare models" view. Works on any OceanSplitDataset (val,
# test, or a patched comparison set).
# =============================================================================
def evaluate_model(model, dataset, batch_size=8, device=None, print_table=True):
    """
    Runs `model` over `dataset` and computes per-depth RMSE, Bias, and
    Correlation on OCEAN-VALID points only.

    Returns a dict: {depth_m: {"rmse":.., "bias":.., "correlation":..}}
    """
    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    model.eval()

    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)

    all_preds, all_targets, all_valid = [], [], []
    with torch.no_grad():
        for x, y, valid in loader:
            pred = model(x.to(device)).cpu().numpy()
            all_preds.append(pred)
            all_targets.append(y.numpy())
            all_valid.append(valid.numpy())

    preds = np.concatenate(all_preds, axis=0)
    targets = np.concatenate(all_targets, axis=0)
    valid = np.concatenate(all_valid, axis=0).astype(bool)

    results = {}
    if print_table:
        print(f"{'Depth (m)':>10} | {'RMSE':>8} | {'Bias':>8} | {'Corr':>8}")
        print("-" * 42)

    for i, d in enumerate(DEPTHS_M):
        v = valid[:, i]
        if v.sum() == 0:
            results[d] = {"rmse": float("nan"), "bias": float("nan"), "correlation": float("nan")}
            continue
        p, t = preds[:, i][v], targets[:, i][v]
        rmse = float(np.sqrt(np.mean((p - t) ** 2)))
        bias = float(np.mean(p - t))
        corr = float(np.corrcoef(p, t)[0, 1]) if np.std(p) > 0 and np.std(t) > 0 else float("nan")
        results[d] = {"rmse": rmse, "bias": bias, "correlation": corr}
        if print_table:
            print(f"{d:>10} | {rmse:>8.3f} | {bias:>8.3f} | {corr:>8.3f}")

    return results


# =============================================================================
# evaluate_against_argo — compares model predictions against REAL, independent
# ARGO float profiles (never used in training). This is the validation step
# that actually matters most for your pitch: GLORYS-trained model checked
# against real-world observations, not just against more GLORYS/reanalysis
# data it was trained to imitate.
# =============================================================================
def evaluate_against_argo(model, argo_df, nc_path, device=None, tolerance_days=1,
                           print_table=True):
    """
    argo_df: a DataFrame with one row per ARGO measurement, columns:
      - 'time'   : datetime of the profile
      - 'lat'    : latitude
      - 'lon'    : longitude
      - 'depth'  : depth in meters (should roughly match DEPTHS_M levels)
      - 'temp'   : observed temperature (°C) — GROUND TRUTH, independent of GLORYS

    Adjust the column names above to match your teammate's actual ARGO
    export format if it differs — that's the only thing that should need
    changing here.

    For each ARGO row: finds the model's prediction for the matching day
    (within `tolerance_days`) at the nearest grid cell, and the nearest
    of the 15 depth levels, then compares.

    Returns the same {depth_m: {"rmse", "bias", "correlation"}} shape as
    evaluate_model(), so both can be plotted/tabulated side by side.
    """
    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    model.eval()

    ds = xr.open_dataset(nc_path)
    lat_grid = ds["latitude"].values
    lon_grid = ds["longitude"].values
    time_grid = ds["time"].values

    preds_by_depth = {d: [] for d in DEPTHS_M}
    obs_by_depth = {d: [] for d in DEPTHS_M}

    # Group by day so each unique day only triggers one forward pass,
    # not one per individual ARGO measurement.
    argo_df = argo_df.copy()
    argo_df["time"] = argo_df["time"].values.astype("datetime64[D]")

    for day, day_rows in argo_df.groupby("time"):
        day = np.datetime64(day, 'D')  # convert pandas Timestamp -> numpy datetime64 first
        time_diffs = np.abs((time_grid.astype("datetime64[D]") - day).astype(int))
        nearest_t = int(np.argmin(time_diffs))
        if time_diffs[nearest_t] > tolerance_days:
            continue  # no sufficiently close model day available — skip this ARGO day

        x = ds["X"].isel(time=nearest_t).values.astype(np.float32)
        x = np.nan_to_num(x, nan=0.0)
        x_tensor = torch.from_numpy(x).unsqueeze(0).to(device)

        with torch.no_grad():
            pred = model(x_tensor).cpu().numpy()[0]  # (15, H, W)

        for _, row in day_rows.iterrows():
            lat_i = int(np.argmin(np.abs(lat_grid - row["lat"])))
            lon_i = int(np.argmin(np.abs(lon_grid - row["lon"])))
            depth_i = int(np.argmin(np.abs(np.array(DEPTHS_M) - row["depth"])))
            nearest_depth = DEPTHS_M[depth_i]

            preds_by_depth[nearest_depth].append(pred[depth_i, lat_i, lon_i])
            obs_by_depth[nearest_depth].append(row["temp"])

    ds.close()

    results = {}
    if print_table:
        print(f"{'Depth (m)':>10} | {'N obs':>7} | {'RMSE':>8} | {'Bias':>8} | {'Corr':>8}")
        print("-" * 52)

    for d in DEPTHS_M:
        p = np.array(preds_by_depth[d])
        t = np.array(obs_by_depth[d])
        if len(p) < 2:
            results[d] = {"rmse": float("nan"), "bias": float("nan"), "correlation": float("nan"), "n": len(p)}
            if print_table:
                print(f"{d:>10} | {len(p):>7} | {'--':>8} | {'--':>8} | {'--':>8}")
            continue

        rmse = float(np.sqrt(np.mean((p - t) ** 2)))
        bias = float(np.mean(p - t))
        corr = float(np.corrcoef(p, t)[0, 1]) if np.std(p) > 0 and np.std(t) > 0 else float("nan")
        results[d] = {"rmse": rmse, "bias": bias, "correlation": corr, "n": len(p)}
        if print_table:
            print(f"{d:>10} | {len(p):>7} | {rmse:>8.3f} | {bias:>8.3f} | {corr:>8.3f}")

    return results
