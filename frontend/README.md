# OceanEmbed — Frontend

React + TypeScript + Vite frontend for the OceanEmbed subsurface ocean
reconstruction system. This first build implements the **Interactive 4D
Ocean Exploration** view: a depth/time-scrubbing map of the North Indian
Ocean, plus a vertical profile and 28-day history chart for any point you
click.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a static
production bundle in `dist/`.

## What's real vs. mocked

Everything currently runs on **generated mock data** (`src/data/mockOceanData.ts`) —
smooth synthetic temperature fields with a plausible thermocline shape and a
drifting warm-anomaly blob, at all 15 standard depths, for daily dates
across 2016–2022. Grid, depths, and dates are matched exactly to
`final_dataset_2016_2022_full.nc` (73×221 @ 0.25°, 5–23°N / 45–100°E,
15 depths from 0–1000m, 2016-01-01 to 2022-12-31). It's built to match the
exact data contract described in `src/types.ts`:

- `DailyReconstruction` — one day's temperature + anomaly grids across all
  15 depths, at 0.25° resolution over the Arabian Sea / Bay of Bengal box.
- `ValidationStats` — per-depth RMSE / Bias / Correlation vs. Gridded ARGO.
- `OceanMask` — land cells render as fully transparent on the map instead of
  extrapolated ocean color. Precomputed from real Natural Earth coastline
  data (`scripts/generate-ocean-mask.mjs` → `src/data/oceanMaskData.json`)
  rather than hand-drawn approximations — swap it for the real `ocean_mask`
  variable from `ds_final` once the API exists (same shape: `{nRows, nCols,
  values}`, 1 = ocean).

**Important:** `ds_final.y` is standardized per depth (`y_mean`, `y_std`
variables). Whatever endpoint you build should de-normalize back to
Celsius (`y_raw * y_std[depth] + y_mean[depth]`) before returning — the
frontend always expects real-unit °C, never z-scores.

**To connect your real backend:** replace the functions in
`src/data/mockOceanData.ts` (`getDailyReconstruction`, `getVerticalProfile`,
`getTimeSeries`, `getValidationStats`) with `fetch` calls to your API,
keeping the same return shapes. Nothing in the components needs to change.
A natural API shape:

```
GET /api/reconstruction?date=2024-06-01
GET /api/profile?date=2024-06-01&lat=12&lon=70
GET /api/timeseries?lat=12&lon=70&depth=100&window=14
GET /api/validation
```

## Project structure

```
src/
  types.ts                 data contract shared by mock + real backend
  data/mockOceanData.ts    synthetic data generator (swap for API calls)
  utils/colorScale.ts      palette-driven color scales (temperature + anomaly)
  components/
    Header.tsx
    ControlPanel.tsx       depth slider, date scrubber + play, layer toggle
    OceanMap.tsx           Leaflet map + canvas grid overlay, click-to-inspect
    DepthProfileChart.tsx  vertical temperature profile at selected point
    TimeSeriesChart.tsx    28-day history at selected point + depth
    StatsStrip.tsx         RMSE / Bias / Correlation for the active depth
  App.tsx                  wires state + layout together
```

## Design notes

The five brand colors are used as a literal depth-to-heat scale, not just
decoration:

| Color | Hex | Role |
|---|---|---|
| Abyss | `#2f4858` | deep water, chrome/background |
| Current | `#33658a` | mid-column, primary UI |
| Surface | `#86bbd8` | sea surface, cool accents |
| Warmwater | `#f6ae2d` | rising heat, mid-intensity anomaly |
| Hotspot | `#f26419` | marine heatwave, high-intensity anomaly |

Typefaces: Space Grotesk (headings), IBM Plex Sans (body), IBM Plex Mono
(coordinates, depths, dates — genuine data readouts).

## Not yet built

Data-on-demand (custom CSV/NetCDF export by region/time/depth/parameter) is
intentionally deferred — the nav item is disabled with a "Data on demand"
label as a placeholder. Everything else in the original brief is live:

1. Landing / overview page (`/`)
2. Interactive 4D Explorer (`/explorer`)
3. Subsurface anomaly detection dashboard (`/anomalies`) — map + ranked list combined
4. Hidden heat & cyclone indicators (`/cyclone`) — OHC/TCHP vs. the 26°C isotherm

## Notes on the newer pages

- **Anomaly detection** (`src/pages/AnomalyDashboardPage.tsx`, `detectAnomalies`
  in `mockOceanData.ts`): thresholds the anomaly grid at ±1.2°C, clusters
  adjacent same-sign cells with a flood fill, and reports intensity, peak
  depth, and how many consecutive days each cluster has persisted.
- **Cyclone indicators** (`src/pages/CycloneIndicatorsPage.tsx`,
  `computeHeatIndicators` / `getHeatContentGrid` in `mockOceanData.ts`):
  standard Ocean Heat Content / Tropical Cyclone Heat Potential formula,
  ρ·c_p·∫(T−26)dz down to the 26°C isotherm (ρ=1025 kg/m³, c_p=4178 J/(kg·K)),
  converted to the conventional kJ/cm² unit. "Hidden heat" is flagged with
  an illustrative threshold (SST < 29°C but TCHP > 60 kJ/cm²) — replace with
  real intensification thresholds when you have them.
- The basemap is Esri's free "World Dark Gray Base" tile layer — no API key
  required. (CARTO's previously-used dark tiles now require one.)
- To regenerate the land mask (e.g. at higher resolution) run
  `node scripts/generate-ocean-mask.mjs` — it reads `world-atlas`'s bundled
  Natural Earth coastline data and writes `src/data/oceanMaskData.json`.
  These are dev-only dependencies; nothing coastline-related ships at runtime
  beyond the small precomputed JSON.
