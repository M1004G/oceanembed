"""
Shared constants. Nothing else lives here — import from this file rather
than redefining these values anywhere else in the codebase.
"""

NUM_DEPTHS = 15
DEPTHS_M = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]

CHANNELS = [
    'sst', 'sss', 'ssh', 'cur_u', 'cur_v', 'wnd_u', 'wnd_v',
    'doy_sin', 'doy_cos', 'lat_sin', 'lat_cos', 'lon_sin', 'lon_cos',
]
IN_CHANNELS = len(CHANNELS)  # 13

DEFAULT_TRAIN_YEARS = (2016, 2017, 2018, 2019, 2020)
DEFAULT_VAL_YEARS = (2021,)
DEFAULT_TEST_YEARS = (2022,)

# NEW — for the final submission model: train on every year in the dataset,
# with no internal held-out split. Used with train.py's val_years=None mode,
# where real ARGO float data (not a slice of the same reanalysis product)
# becomes the only validation signal. Keep DEFAULT_TRAIN_YEARS/DEFAULT_VAL_YEARS
# above untouched — still use those for day-to-day dev/tuning runs.
DEFAULT_FULL_YEARS = (2016, 2017, 2018, 2019, 2020, 2021, 2022)

# NEW — update these two if the files live somewhere else for you or your
# teammate. Centralized here so nothing else in the codebase hardcodes a path.
FINAL_DATASET_PATH = "/content/drive/.shortcut-targets-by-id/1tsQYZqo6gp-L_cpOdxCMpTx2VZ61TUeQ/OceanEmbed_data/processed/final_dataset_2016_2022_full.nc"
ARGO_VALIDATION_PATH = "/content/drive/.shortcut-targets-by-id/1tsQYZqo6gp-L_cpOdxCMpTx2VZ61TUeQ/OceanEmbed_data/argo/argo_validation_aligned_2016_2022.nc"
