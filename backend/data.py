"""
Dataset classes and the masked, depth-weighted loss function.

MEMORY-SAFE LOADING: each split (train/val/test) is loaded via ONE bulk
read, not per-day. Reading one day at a time from a NetCDF file on a
Drive mount can secretly decompress a huge internal chunk each time
(NetCDF files are usually chunked along the time dimension) — with
thousands of random-order reads that becomes a serious hang, not just
slowness. A single bulk read per split avoids that, and bounds peak
memory to whichever ONE split is largest, rather than all three at once.
"""
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset
import gc
import xarray as xr

from config import NUM_DEPTHS


class OceanSplitDataset(Dataset):
    """
    Loads ONE split's data (a set of years) into memory ONCE, via a single
    bulk read — not per-day, not per-file-open. After construction,
    __getitem__ is just fast in-memory indexing.
    """
    def __init__(self, nc_path, years):
        ds = xr.open_dataset(nc_path)
        all_years = ds["time"].dt.year.values
        time_idx = np.where(np.isin(all_years, years))[0]
    
        X = ds["X"].isel(time=time_idx).values.astype(np.float32)  # (C,T,H,W)
        y = ds["y"].isel(time=time_idx).values.astype(np.float32)  # (T,D,H,W)
        ocean_mask = ds["ocean_mask"].values.astype(bool)
        ds.close()
    
        # CHANGED: transpose still needs to copy (numpy can't avoid this for
        # a real axis swap), but we free the pre-transpose array immediately
        # instead of letting both versions sit in memory together.
        X = np.ascontiguousarray(np.transpose(X, (1, 0, 2, 3)))  # -> (T,C,H,W)
    
        valid = ocean_mask[None, None, :, :] & np.isfinite(y)
    
        # CHANGED: nan_to_num(..., copy=False) modifies X IN PLACE instead of
        # allocating a second full-size array.
        np.nan_to_num(X, nan=0.0, copy=False)
    
        # CHANGED: instead of np.where(valid, y, 0.0) — which allocates a
        # brand-new array — directly zero out invalid positions in y itself
        # via boolean-mask assignment. Same result, no extra copy.
        y[~valid] = 0.0
    
        self.X = X
        self.y = y
        self.valid = valid.astype(np.float32)
        self.ocean_mask = ocean_mask
        self.years = years
    
        # CHANGED: force Python to actually release any leftover intermediate
        # objects right now, rather than waiting for garbage collection to
        # get around to it later (which can lag behind allocations enough to
        # cause an OOM even when the memory WOULD eventually be freed).
        gc.collect()
    
        print(f"  Loaded {len(time_idx)} days, {X.nbytes / 1e9:.2f}GB (X) + "
            f"{y.nbytes / 1e9:.2f}GB (y) for years {years}")
    

    def __len__(self):
        return len(self.X)

    def __getitem__(self, i):
        return (torch.from_numpy(self.X[i]), torch.from_numpy(self.y[i]),
                torch.from_numpy(self.valid[i]))


class PatchOceanDataset(Dataset):
    """
    Wraps an already-loaded OceanSplitDataset and yields RANDOM CROPS
    instead of full grids — the standard fix for overfitting when a
    spatial deep model has more capacity than the effective diversity of
    a small set of full-scene samples supports.

    WHY THIS HELPS: with a limited number of full-grid training days, and
    heavy day-to-day / neighboring-pixel correlation, the model's
    *effective* training diversity is much smaller than the raw day
    count. Cropping random patches from random days turns each epoch
    into thousands of distinct, mostly non-overlapping training views
    instead of the same fixed full scenes every time — directly
    analogous to random-crop augmentation in standard computer vision.

    Validation/test are NOT patched — they still evaluate on the full
    grid, so reported metrics stay directly comparable to before.
    """
    def __init__(self, base_dataset, patch_size=64, patches_per_epoch=None,
                 min_valid_frac=0.1, seed=0):
        self.base = base_dataset
        self.patch_size = patch_size
        self.n_days = len(base_dataset)
        # Default: 4 random patches per day per epoch — tune higher if
        # still overfitting, lower if training gets too slow.
        self.patches_per_epoch = patches_per_epoch or self.n_days * 4
        self.min_valid_frac = min_valid_frac
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return self.patches_per_epoch

    def __getitem__(self, idx):
        day_idx = self.rng.integers(0, self.n_days)
        x, y, valid = self.base[day_idx]
        H, W = x.shape[-2], x.shape[-1]
        ps = self.patch_size

        # Try a few times to land on a patch with enough real ocean data
        # (avoids wasting training steps on mostly-land crops)
        top, left = 0, 0
        for _ in range(10):
            top = self.rng.integers(0, H - ps + 1)
            left = self.rng.integers(0, W - ps + 1)
            v_patch = valid[:, top:top + ps, left:left + ps]
            if v_patch.float().mean() >= self.min_valid_frac:
                break

        x_patch = x[:, top:top + ps, left:left + ps]
        y_patch = y[:, top:top + ps, left:left + ps]
        valid_patch = valid[:, top:top + ps, left:left + ps]
        return x_patch, y_patch, valid_patch


def load_test_set(nc_path, test_years=(2022,)):
    """
    For your VALIDATION TEAMMATE: completely independent of training.
    They call this directly — no need to touch train() or understand
    the training pipeline's internals. Loaded in ONE bulk read, bounded
    to just the test years (not the whole multi-year file).

    Returns a Dataset where each item is (x, y, valid):
      x     : (13, H, W)  input channels (already normalized by data team)
      y     : (15, H, W)  true temperature at 15 depths (Celsius)
      valid : (15, H, W)  1 where there's real ocean data, 0 for land or
                          below-seafloor gaps — EXCLUDE these from any
                          RMSE/Bias/Correlation calculation.
    """
    print(f"Loading test set (years {test_years})...")
    return OceanSplitDataset(nc_path, years=test_years)


def masked_depth_weighted_mse(pred, target, valid):
    """
    pred, target, valid: all (batch, 15, H, W)
    valid: 1 where there's real ocean data at that depth/pixel/day, 0 otherwise
    """
    weights = torch.linspace(1.5, 0.7, NUM_DEPTHS, device=pred.device).view(1, -1, 1, 1)
    se = (pred - target) ** 2 * weights * valid
    denom = valid.sum() + 1e-8
    return se.sum() / denom


def check_gradients(model):
    total_norm = 0.0
    for name, p in model.named_parameters():
        if p.grad is not None:
            g = p.grad.norm().item()
            total_norm += g ** 2
            if g == 0.0:
                print(f"  WARNING: zero gradient in {name}")
            if g > 100.0:
                print(f"  WARNING: large gradient ({g:.1f}) in {name}")
    return total_norm ** 0.5


# =============================================================================
# NEW — load_argo_dataframe: converts the ARGO validation .nc file into the
# flat DataFrame format evaluate_against_argo() (in evaluate.py) expects:
# one row per observation, columns ['time', 'lat', 'lon', 'depth', 'temp'].
#
# I haven't seen the actual argo_validation_aligned_2016_2022.nc file, so
# this is written defensively: it looks for common variable/coordinate name
# variants and tells you exactly what to change if it guesses wrong, rather
# than silently failing. If it raises a KeyError, run
#     xr.open_dataset(ARGO_VALIDATION_PATH)
# once yourself, check the variable/coord names it prints, and add the real
# ones to the *_candidates tuples below — nothing else needs to change.
# =============================================================================
def load_argo_dataframe(
    argo_path,
    temp_var_candidates=("y", "TEMP", "temp", "temperature", "TEMPERATURE"),
    lat_name_candidates=("latitude", "LATITUDE", "lat"),
    lon_name_candidates=("longitude", "LONGITUDE", "lon"),
    depth_name_candidates=("depth", "DEPTH", "PRES", "pressure", "PRESSURE"),
    time_name_candidates=("time", "TIME"),
):
    """
    Handles two common ARGO export shapes automatically:
 
      1. GRIDDED (most likely, given the "aligned" filename — same shape
         family as the main dataset's `y`: dims (time, depth, latitude,
         longitude), sparse/NaN wherever no ARGO profile was nearby).
         Only the non-NaN cells become rows.
 
      2. FLAT / POINT format: 1D arrays of time/lat/lon/depth/temp, one
         row per ARGO measurement.
 
    Returns a DataFrame with columns ['time', 'lat', 'lon', 'depth', 'temp'],
    ready to pass straight into evaluate_against_argo(model, argo_df, nc_path).
 
    MEMORY NOTE: for the gridded case, this deliberately avoids
    xarray's da.to_dataframe(), which materializes EVERY combination of
    time/depth/lat/lon (potentially tens of millions of rows) before
    dropping the NaN ones — that step alone can spike memory by several
    GB. Instead, this finds the indices of actually-valid (non-NaN)
    observations FIRST via np.isfinite, and builds the DataFrame only
    from those.
    """
    ds = xr.open_dataset(argo_path)
 
    def _find(names, container):
        for n in names:
            if n in container:
                return n
        return None
 
    temp_var = _find(temp_var_candidates, ds.data_vars)
    if temp_var is None:
        available = list(ds.data_vars)
        ds.close()
        raise KeyError(
            f"Couldn't find a temperature variable in {argo_path}. "
            f"Available data_vars: {available}. Add the real name to "
            f"temp_var_candidates in load_argo_dataframe() (data.py)."
        )
 
    lat_name = _find(lat_name_candidates, ds.coords) or _find(lat_name_candidates, ds.dims)
    lon_name = _find(lon_name_candidates, ds.coords) or _find(lon_name_candidates, ds.dims)
    depth_name = _find(depth_name_candidates, ds.coords) or _find(depth_name_candidates, ds.dims)
    time_name = _find(time_name_candidates, ds.coords) or _find(time_name_candidates, ds.dims)
 
    missing = [n for n, v in [("lat", lat_name), ("lon", lon_name),
                               ("depth", depth_name), ("time", time_name)] if v is None]
    if missing:
        ds.close()
        raise KeyError(
            f"Couldn't find coordinate(s) {missing} in {argo_path}. "
            f"Available coords: {list(ds.coords)}, dims: {list(ds.dims)}. "
            f"Add the real name(s) to the matching *_name_candidates tuple "
            f"in load_argo_dataframe() (data.py)."
        )
 
    da = ds[temp_var]
 
    if da.ndim == 4:
        # Memory-efficient path: find valid indices BEFORE building any
        # DataFrame, so we never materialize the full combinatorial grid.
        temp_arr = da.values.astype(np.float32)
        valid_idx = np.where(np.isfinite(temp_arr))
        t_idx, d_idx, la_idx, lo_idx = valid_idx
 
        time_coord = np.asarray(ds[time_name].values)
        depth_coord = np.asarray(ds[depth_name].values)
        lat_coord = np.asarray(ds[lat_name].values)
        lon_coord = np.asarray(ds[lon_name].values)
 
        df = pd.DataFrame({
            "time": time_coord[t_idx],
            "lat": lat_coord[la_idx].astype(np.float32),
            "lon": lon_coord[lo_idx].astype(np.float32),
            "depth": depth_coord[d_idx].astype(np.float32),
            "temp": temp_arr[valid_idx],
        })
 
        del temp_arr, valid_idx, t_idx, d_idx, la_idx, lo_idx
        gc.collect()
 
    elif da.ndim == 1:
        df = pd.DataFrame({
            "time": np.asarray(ds[time_name].values),
            "lat": np.asarray(ds[lat_name].values),
            "lon": np.asarray(ds[lon_name].values),
            "depth": np.asarray(ds[depth_name].values),
            "temp": np.asarray(da.values),
        }).dropna(subset=["temp"])
 
    else:
        shape = da.shape
        ds.close()
        raise ValueError(
            f"Unexpected shape {shape} for '{temp_var}' in {argo_path} — "
            f"expected either 1D (flat point format) or 4D "
            f"(time, depth, latitude, longitude)."
        )
 
    ds.close()
    df["time"] = pd.to_datetime(df["time"])
    print(f"Loaded {len(df):,} ARGO observations from {argo_path}")
    return df[["time", "lat", "lon", "depth", "temp"]]
 