# OceanEmbed

Daily subsurface ocean temperature reconstruction for the North Indian Ocean — 15 depth levels, 0–1000m, 0.25° resolution — learned purely from satellite-observable surface data.

**Team DeepSea** · Smart India Hackathon 2026 · Problem Statement SIH26066 · Disaster Management

## The problem

Satellites give continuous, daily, high-resolution surface data: temperature, salinity, sea surface height, currents, winds. But the processes that matter most for disaster management — the heat that fuels cyclone intensification, the anomalies behind marine heatwaves — happen below the surface, down to 1000m. Direct subsurface measurement comes almost entirely from ARGO floats, spaced ~300km apart, reporting once every ~10 days. Surface conditions can look completely normal while significant subsurface heat accumulates undetected.

OceanEmbed is built to close that gap: a deep learning model that reconstructs the full subsurface temperature field every day, from data satellites already provide.

## Repository structure

```
oceanembed/
├── backend/     Trained models + FastAPI inference service
└── frontend/    React/TypeScript dashboard (Explorer, Anomaly Detection, Cyclone Indicators)
```


## Model & methodology

- **Architecture:** U-Net encoder–decoder. Two interchangeable encoder variants share one decoder:
  - `cnn_unet` — depthwise-separable CNN encoder
  - `vit_unet` — CNN stem + attention (ViT-hybrid) bottleneck
- **Inputs (13 channels):** `sst, sss, ssh, cur_u, cur_v, wnd_u, wnd_v` + positional/temporal embeddings (`doy_sin/cos`, `lat_sin/cos`, `lon_sin/cos`)
- **Output:** temperature at 15 standard depths — `0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000` m
- **Domain:** North Indian Ocean (Arabian Sea + Bay of Bengal), 5–23°N, 45–100°E, 0.25° grid (73 × 221 cells)
- **Training data:** 7 years (2016–2022) of GLORYS global ocean reanalysis as the training target
- **Validation:** independent Gridded ARGO float observations — never seen during training — scored per depth (RMSE, Bias, Correlation), not as a single aggregate number

### Derived intelligence (built on top of the reconstruction)

- **Anomaly & persistence detection** — reconstructed temperature vs. location/month-specific climatology, scored by severity, depth, and duration
- **Hidden heat & cyclone indicators** — Ocean Heat Content and Tropical Cyclone Heat Potential (TCHP), down to the 26°C isotherm — thermal fuel for cyclone intensification that surface temperature alone can't show
- **Interactive 4D exploration** — a linked map, vertical profile, and time-history view let a user move freely across latitude, longitude, depth, and time

## Backend

FastAPI service exposing both trained models.

**Setup:**
```bash
cd backend
pip install -r requirements.txt
export HF_REPO_ID=<your-hf-dataset-repo>
export HF_TOKEN=<your-hf-token>
uvicorn api:app --host 0.0.0.0 --port 8000
```

The dataset (`final_dataset_2016_2022_full.nc`) is pulled from Hugging Face Hub on first request and cached locally — it is not committed to this repo. `best_model_cnn.pt` and `best_model_vit.pt` (trained checkpoints) are committed directly.

**Endpoints:**

| Endpoint | Returns |
|---|---|
| `GET /` | Service status, available depths, available models |
| `GET /predict/map?date=&depth_m=&model=` | 2D temperature map at one depth |
| `GET /predict/profile?date=&lat=&lon=&model=` | Full 15-depth profile at one point |
| `GET /predict/reconstruction?date=&model=` | Complete 15-depth reconstruction for one day (one forward pass) |
| `GET /predict/compare?date=&depth_m=` | Both models' maps at once, for side-by-side comparison |
| `GET /anomaly?date=&warm_threshold_c=&model=` | Per-depth marine-heatwave flags vs. climatology |
| `GET /validate/argo?model=` | Per-depth RMSE/Bias/Correlation against real ARGO data |

Every prediction endpoint takes `model=cnn_unet` or `model=vit_unet` (default `cnn_unet`), so either architecture's output can be inspected independently.

## Frontend

React + TypeScript + Vite dashboard. Four views: a landing page, the 4D Explorer, the Anomaly Detection dashboard, and the Cyclone/Hidden Heat Indicators page.

**Setup:**
```bash
cd frontend
npm install
npm run dev
```
Then open the printed local URL (usually `http://localhost:5173`).

See `frontend/README.md` for the full data-contract documentation, design notes, and exactly which functions in `mockOceanData.ts` to replace with real `fetch` calls once connected to the backend above.

## Grounded in literature

- **Meng et al. (2021)** — *J. Geophysical Research: Oceans* — first to reconstruct 3D subsurface temperature/salinity purely from satellite data via deep learning, at 0.25° resolution. [doi.org/10.1029/2021JC017605](https://doi.org/10.1029/2021JC017605)
- **Adaptive Spatiotemporal Clustering Framework (2026)** — arXiv — validates Attention U-Net/ViT architectures for this task, reporting 12.4–27.2% RMSE improvement over baseline models. [arxiv.org/abs/2605.00860](https://arxiv.org/abs/2605.00860)
- **Su et al. (2023)** — Springer, *AI-Based Subsurface Thermohaline Structure Retrieval* — benchmarks AI-based subsurface retrieval strictly against independent Argo float data. [doi.org/10.1007/978-981-19-6375-9_5](https://doi.org/10.1007/978-981-19-6375-9_5)

**Data provenance:** GLORYS12 reanalysis and DUACS altimetry (Copernicus Marine Service); satellite SST/SSS/current/wind fields; Gridded ARGO (INCOIS), used exclusively for independent validation, never for training.

## Impact

Moves subsurface ocean monitoring from ARGO's ~300km / 10-day-interval coverage to daily, 25km-resolution coverage across the North Indian Ocean — with applications in earlier cyclone intensification signals (TCHP), monsoon/crop-planning context (subsurface Ocean Heat Content), fisheries habitat data, naval thermocline awareness, and coastal power/desalination intake planning.
