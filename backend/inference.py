"""
Functions a FRONTEND/dashboard calls directly — give a date (and optionally
a lat/lon), get back a prediction ready to plot. Also includes the marine
heatwave / anomaly detection layer (USP feature) on top of predictions.

Each function here only reads what it needs from disk (one day, or a
bounded climatology window) — safe to call repeatedly from a UI callback
(e.g. a date-slider) without loading the full multi-year file into memory.
"""
import numpy as np
import torch
import xarray as xr

from config import DEPTHS_M


def predict_single_day(model, nc_path, date_str, device=None):
    """
    date_str: e.g. "2022-06-15"
    Returns: (prediction, lat, lon) where
      prediction: numpy array (15, H, W) — temperature at all 15 depths
      lat, lon:   1D coordinate arrays, for plotting axes
    """
    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    model.eval()

    ds = xr.open_dataset(nc_path)
    x = ds["X"].sel(time=date_str).values.astype(np.float32)   # (13, H, W)
    lat = ds["latitude"].values
    lon = ds["longitude"].values
    ds.close()

    x = np.nan_to_num(x, nan=0.0)
    x_tensor = torch.from_numpy(x).unsqueeze(0).to(device)  # (1, 13, H, W)

    with torch.no_grad():
        pred = model(x_tensor).cpu().numpy()[0]  # (15, H, W)

    return pred, lat, lon


def predict_map_at_depth(model, nc_path, date_str, depth_m, device=None):
    """
    Convenience wrapper for the map view of your dashboard: one date, one
    depth, a single 2D map to plot with contourf/imshow.

    depth_m must be one of DEPTHS_M — nearest match is used if not exact.
    Returns: (map_2d, lat, lon, actual_depth_used)
    """
    pred, lat, lon = predict_single_day(model, nc_path, date_str, device)
    depth_idx = int(np.argmin(np.abs(np.array(DEPTHS_M) - depth_m)))
    return pred[depth_idx], lat, lon, DEPTHS_M[depth_idx]


def predict_profile_at_point(model, nc_path, date_str, lat_query, lon_query, device=None):
    """
    Convenience wrapper for the depth-profile view of your dashboard: one
    date, one clicked point on the map, the full 15-depth profile there.

    Returns: (profile, depths_used) where profile is a (15,) array of
    temperatures and depths_used == DEPTHS_M (for x-axis labels).
    """
    pred, lat, lon = predict_single_day(model, nc_path, date_str, device)
    lat_i = int(np.argmin(np.abs(lat - lat_query)))
    lon_i = int(np.argmin(np.abs(lon - lon_query)))
    profile = pred[:, lat_i, lon_i]
    return profile, DEPTHS_M


# =============================================================================
# CLIMATOLOGY + ANOMALY DETECTION — marine heatwave flagging (USP feature).
# Compares a given day's prediction against the historical average for that
# time of year, flags where it's unusually warm.
# =============================================================================
def compute_climatology(nc_path, years, day_of_year, window_days=7):
    """
    Computes the historical average temperature (all 15 depths, full grid)
    for a given day-of-year, averaged across `years` and a +/- window_days
    band around that day-of-year (smooths out day-to-day noise).

    Uses GLORYS ground truth (the 'y' variable), not model predictions —
    climatology should reflect real historical conditions, not the model's
    own outputs.

    Returns: climatology array (15, H, W)
    """
    ds = xr.open_dataset(nc_path)
    doy = ds["time"].dt.dayofyear.values
    years_arr = ds["time"].dt.year.values

    # Circular distance in day-of-year (handles wraparound near Jan 1 / Dec 31)
    diff = np.abs(doy - day_of_year)
    circular_diff = np.minimum(diff, 365 - diff)

    mask = (circular_diff <= window_days) & np.isin(years_arr, years)
    time_idx = np.where(mask)[0]

    if len(time_idx) == 0:
        ds.close()
        raise ValueError(f"No matching days found for day_of_year={day_of_year}, years={years}")

    y_window = ds["y"].isel(time=time_idx).values.astype(np.float32)  # (T,15,H,W)
    ds.close()

    # Average ignoring NaN (below-seafloor gaps) at each pixel/depth independently
    climatology = np.nanmean(y_window, axis=0)  # (15, H, W)
    return climatology


def detect_anomaly(model, nc_path, date_str, climatology_years=(2016, 2017, 2018, 2019, 2020),
                    warm_threshold_c=1.5, device=None):
    """
    Compares this day's PREDICTION against historical climatology for the
    same time of year. Flags grid cells where predicted temperature is
    more than `warm_threshold_c` above the historical average — a simple,
    explainable marine heatwave indicator.

    Returns a dict:
      'anomaly'      : (15, H, W) predicted minus climatology, per depth
      'heatwave_mask': (15, H, W) bool, True where anomaly > warm_threshold_c
      'climatology'  : (15, H, W) the historical baseline used
      'prediction'   : (15, H, W) this day's prediction
      'lat', 'lon'   : coordinate arrays for plotting
    """
    pred, lat, lon = predict_single_day(model, nc_path, date_str, device)

    ds = xr.open_dataset(nc_path)
    day_of_year = int(ds["time"].sel(time=date_str).dt.dayofyear.values)
    ds.close()

    climatology = compute_climatology(nc_path, years=climatology_years, day_of_year=day_of_year)

    anomaly = pred - climatology
    heatwave_mask = anomaly > warm_threshold_c

    n_flagged = int(heatwave_mask[0].sum())  # surface-level count, for a quick printout
    print(f"{date_str}: {n_flagged} surface grid cells flagged as marine-heatwave-level "
          f"warm (> {warm_threshold_c}°C above {climatology_years[0]}-{climatology_years[-1]} climatology)")

    return {
        "anomaly": anomaly,
        "heatwave_mask": heatwave_mask,
        "climatology": climatology,
        "prediction": pred,
        "lat": lat,
        "lon": lon,
    }
