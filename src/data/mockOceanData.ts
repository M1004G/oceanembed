import oceanMaskData from './oceanMaskData.json'
import {
  DOMAIN_BOUNDS,
  GRID_RESOLUTION_DEG,
  STANDARD_DEPTHS_M,
  type DailyReconstruction,
  type DepthGrid,
  type DepthM,
  type DetectedAnomaly,
  type HeatIndicatorPoint,
  type OceanMask,
  type TimeSeriesPoint,
  type ValidationStats,
  type VerticalProfilePoint,
} from '../types'

// ---- small deterministic pseudo-random helpers so the demo is stable ----

function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

function smooth2d(lat: number, lon: number, seed: number, scale: number): number {
  // cheap value-noise-ish function: sum of a few sine waves at different
  // frequencies so fields look like plausible ocean structure, not static.
  const a = Math.sin(lat * scale + seed) * Math.cos(lon * scale * 0.8 + seed * 1.3)
  const b = Math.sin(lat * scale * 2.3 - seed * 0.7) * Math.sin(lon * scale * 1.7 + seed)
  return 0.6 * a + 0.4 * b
}

// Inclusive of both endpoints, matching ds_final exactly: 73 lat x 221 lon.
export const N_ROWS = Math.round(
  (DOMAIN_BOUNDS.latMax - DOMAIN_BOUNDS.latMin) / GRID_RESOLUTION_DEG,
) + 1
export const N_COLS = Math.round(
  (DOMAIN_BOUNDS.lonMax - DOMAIN_BOUNDS.lonMin) / GRID_RESOLUTION_DEG,
) + 1

export function rowToLat(row: number): number {
  return DOMAIN_BOUNDS.latMin + row * GRID_RESOLUTION_DEG
}
export function colToLon(col: number): number {
  return DOMAIN_BOUNDS.lonMin + col * GRID_RESOLUTION_DEG
}
export function latToRow(lat: number): number {
  return Math.round((lat - DOMAIN_BOUNDS.latMin) / GRID_RESOLUTION_DEG)
}
export function lonToCol(lon: number): number {
  return Math.round((lon - DOMAIN_BOUNDS.lonMin) / GRID_RESOLUTION_DEG)
}

/** Rough day-of-year seed so consecutive days drift smoothly (fake seasonality). */
function dayIndex(dateISO: string): number {
  const d = new Date(dateISO + 'T00:00:00Z')
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - start) / 86400000)
}

/** Surface climatology by latitude — warmer near equator, cooler poleward. */
function surfaceClimatology(lat: number, doy: number): number {
  const seasonal = 1.5 * Math.sin((doy / 365) * 2 * Math.PI)
  return 29.5 - (lat / 25) * 4.5 + seasonal
}

/** Vertical thermocline shape: fast drop 0-200m, gentle decay to 1000m. */
function verticalProfileBase(depth: DepthM, sst: number): number {
  if (depth <= 20) return sst - depth * 0.02
  if (depth <= 200) {
    const t = (depth - 20) / (200 - 20)
    return sst - 0.4 - t * (sst - 15)
  }
  const t = Math.min(1, (depth - 200) / (1000 - 200))
  return 15 - t * 10.5
}

/**
 * Real ocean/land mask, precomputed from Natural Earth coastline data by
 * scripts/generate-ocean-mask.mjs (see src/data/oceanMaskData.json).
 * Replace with the real `ocean_mask` variable from ds_final once the API
 * is wired up — see getOceanMask() below.
 */
let cachedMask: OceanMask | null = null
export function getOceanMask(): OceanMask {
  if (cachedMask) return cachedMask
  cachedMask = {
    nRows: oceanMaskData.nRows,
    nCols: oceanMaskData.nCols,
    values: Uint8Array.from(oceanMaskData.values),
  }
  return cachedMask
}

function buildDepthGrid(depth: DepthM, doy: number, tag: number): DepthGrid {
  const values = new Float32Array(N_ROWS * N_COLS)
  const mask = getOceanMask()
  for (let r = 0; r < N_ROWS; r++) {
    const lat = rowToLat(r)
    for (let c = 0; c < N_COLS; c++) {
      const idx = r * N_COLS + c
      if (!mask.values[idx]) {
        values[idx] = NaN
        continue
      }
      const lon = colToLon(c)
      const sst = surfaceClimatology(lat, doy)
      const base = verticalProfileBase(depth, sst)
      const structure = smooth2d(lat, lon, doy * 0.05 + tag, 0.35) * (depth < 100 ? 1.4 : 0.6)
      const meso = smooth2d(lat + 7, lon - 11, doy * 0.09 + tag * 2.1, 0.9) * 0.5
      values[idx] = base + structure + meso
    }
  }
  return { depth, values, nRows: N_ROWS, nCols: N_COLS }
}

function buildAnomalyGrid(temp: DepthGrid, doy: number, tag: number): DepthGrid {
  const values = new Float32Array(temp.values.length)
  const mask = getOceanMask()
  for (let r = 0; r < N_ROWS; r++) {
    const lat = rowToLat(r)
    for (let c = 0; c < N_COLS; c++) {
      const idx = r * N_COLS + c
      if (!mask.values[idx]) {
        values[idx] = NaN
        continue
      }
      const lon = colToLon(c)
      // simulate occasional warm-core / cold-core anomaly blobs
      const blob =
        2.6 *
        Math.exp(
          -(
            Math.pow(lat - (10 + 8 * smooth2d(0, doy, tag, 0.02)), 2) +
            Math.pow(lon - (70 + 15 * smooth2d(doy, 0, tag + 3, 0.02)), 2)
          ) / (2 * 6 * 6),
        )
      const noise = smooth2d(lat * 1.3, lon * 1.3, doy * 0.2 + tag, 0.6) * 0.6
      values[idx] = blob + noise
    }
  }
  return { depth: temp.depth, values, nRows: N_ROWS, nCols: N_COLS }
}

const cache = new Map<string, DailyReconstruction>()

export function getDailyReconstruction(dateISO: string): DailyReconstruction {
  const cached = cache.get(dateISO)
  if (cached) return cached

  const doy = dayIndex(dateISO)
  const tag = doy * 0.013
  const grids = STANDARD_DEPTHS_M.map((d) => buildDepthGrid(d, doy, tag))
  const anomalyGrids = grids.map((g) => buildAnomalyGrid(g, doy, tag))

  const result: DailyReconstruction = { date: dateISO, grids, anomalyGrids }
  cache.set(dateISO, result)
  return result
}

export function getValueAt(grid: DepthGrid, lat: number, lon: number): number {
  const r = Math.min(grid.nRows - 1, Math.max(0, latToRow(lat)))
  const c = Math.min(grid.nCols - 1, Math.max(0, lonToCol(lon)))
  const v = grid.values[r * grid.nCols + c]
  if (!Number.isNaN(v)) return v

  // Clicked on a masked-out land cell: fall back to the nearest ocean cell
  // in a small ring so the UI never shows a blank chart for a coastal click.
  for (let radius = 1; radius <= 4; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= grid.nRows || cc < 0 || cc >= grid.nCols) continue
        const nv = grid.values[rr * grid.nCols + cc]
        if (!Number.isNaN(nv)) return nv
      }
    }
  }
  return NaN
}

export function getVerticalProfile(dateISO: string, lat: number, lon: number): VerticalProfilePoint[] {
  const rec = getDailyReconstruction(dateISO)
  return STANDARD_DEPTHS_M.map((depth, i) => ({
    depth,
    temperature: getValueAt(rec.grids[i], lat, lon),
    anomaly: getValueAt(rec.anomalyGrids[i], lat, lon),
  }))
}

export function getTimeSeries(
  centerDateISO: string,
  lat: number,
  lon: number,
  depth: DepthM,
  windowDays = 14,
): TimeSeriesPoint[] {
  const depthIdx = STANDARD_DEPTHS_M.indexOf(depth)
  const center = new Date(centerDateISO + 'T00:00:00Z')
  const points: TimeSeriesPoint[] = []
  for (let i = -windowDays; i <= windowDays; i++) {
    const d = new Date(center)
    d.setUTCDate(d.getUTCDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const rec = getDailyReconstruction(iso)
    points.push({
      date: iso,
      temperature: getValueAt(rec.grids[depthIdx], lat, lon),
      anomaly: getValueAt(rec.anomalyGrids[depthIdx], lat, lon),
    })
  }
  return points
}

/** Mock validation against Gridded ARGO — plausible skill that degrades with depth. */
export function getValidationStats(): ValidationStats[] {
  return STANDARD_DEPTHS_M.map((depth) => {
    const depthFrac = depth / 1000
    return {
      depth,
      rmse: +(0.35 + depthFrac * 1.1).toFixed(2),
      bias: +((depthFrac - 0.5) * 0.3).toFixed(2),
      correlation: +(0.97 - depthFrac * 0.22).toFixed(2),
    }
  })
}

// Matches ds_final.time exactly (2557 daily steps, 2016-01-01 to 2022-12-31)
export const DATE_RANGE = {
  min: '2016-01-01',
  max: '2022-12-31',
}

/** Rough Arabian Sea / Bay of Bengal split for human-readable labels only. */
export function regionName(lat: number, lon: number): string {
  if (lon < 77) return `Arabian Sea (${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E)`
  return `Bay of Bengal (${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E)`
}

// ---- Hidden heat / cyclone indicators: Ocean Heat Content & TCHP ----
// Standard formulas: OHC / TCHP = rho * cp * integral_0^D26 (T(z) - 26) dz
// rho = 1025 kg/m^3, cp = 4178 J/(kg*K), dz in meters -> J/m^2, converted
// to the conventional kJ/cm^2 unit used in cyclone forecasting (x1e-7).
const SEAWATER_RHO = 1025
const SEAWATER_CP = 4178
const ISOTHERM_C = 26

export function computeHeatIndicators(dateISO: string, lat: number, lon: number): HeatIndicatorPoint {
  const profile = getVerticalProfile(dateISO, lat, lon)
  const sst = profile[0].temperature

  if (sst < ISOTHERM_C || Number.isNaN(sst)) {
    return { lat, lon, sst, d26: null, ohc: 0, tchp: 0 }
  }

  let integral = 0 // degC * m
  let d26: number = profile[profile.length - 1].depth
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]
    const b = profile[i + 1]
    if (Number.isNaN(a.temperature) || Number.isNaN(b.temperature)) break
    if (b.temperature >= ISOTHERM_C) {
      // whole segment is above the isotherm: trapezoidal contribution
      integral += ((a.temperature - ISOTHERM_C + (b.temperature - ISOTHERM_C)) / 2) * (b.depth - a.depth)
    } else if (a.temperature > ISOTHERM_C) {
      // isotherm crossing within this segment: interpolate crossing depth
      const frac = (a.temperature - ISOTHERM_C) / (a.temperature - b.temperature)
      const crossingDepth = a.depth + frac * (b.depth - a.depth)
      integral += ((a.temperature - ISOTHERM_C) / 2) * (crossingDepth - a.depth)
      d26 = crossingDepth
      break
    } else {
      d26 = a.depth
      break
    }
  }

  const ohcJm2 = SEAWATER_RHO * SEAWATER_CP * integral
  const ohcKjCm2 = ohcJm2 * 1e-7
  return { lat, lon, sst, d26, ohc: +ohcKjCm2.toFixed(1), tchp: +ohcKjCm2.toFixed(1) }
}

const heatGridCache = new Map<string, DepthGrid>()

/** Grid of TCHP (kJ/cm^2) across the whole domain for one date — cached per date. */
export function getHeatContentGrid(dateISO: string): DepthGrid {
  const cached = heatGridCache.get(dateISO)
  if (cached) return cached

  const values = new Float32Array(N_ROWS * N_COLS)
  const mask = getOceanMask()
  for (let r = 0; r < N_ROWS; r++) {
    const lat = rowToLat(r)
    for (let c = 0; c < N_COLS; c++) {
      const idx = r * N_COLS + c
      if (!mask.values[idx]) {
        values[idx] = NaN
        continue
      }
      const lon = colToLon(c)
      values[idx] = computeHeatIndicators(dateISO, lat, lon).tchp
    }
  }
  const grid: DepthGrid = { depth: 0, values, nRows: N_ROWS, nCols: N_COLS }
  heatGridCache.set(dateISO, grid)
  return grid
}

// ---- Anomaly detection: threshold + connected-component clustering ----

export function detectAnomalies(
  dateISO: string,
  depth: DepthM,
  thresholdC = 1.2,
  minCellCount = 3,
): DetectedAnomaly[] {
  const rec = getDailyReconstruction(dateISO)
  const depthIdx = STANDARD_DEPTHS_M.indexOf(depth)
  const grid = rec.anomalyGrids[depthIdx]
  const visited = new Uint8Array(grid.nRows * grid.nCols)
  const clusters: DetectedAnomaly[] = []

  for (let r = 0; r < grid.nRows; r++) {
    for (let c = 0; c < grid.nCols; c++) {
      const idx = r * grid.nCols + c
      if (visited[idx]) continue
      const v = grid.values[idx]
      if (Number.isNaN(v) || Math.abs(v) < thresholdC) {
        visited[idx] = 1
        continue
      }
      const sign = v > 0 ? 1 : -1

      // BFS flood fill over same-sign, above-threshold, 4-connected cells
      const startR = r
      const startC = c
      const stack: Array<[number, number]> = [[startR, startC]]
      visited[idx] = 1
      const cells: number[] = []
      let sumR = 0
      let sumC = 0
      let peak = v
      while (stack.length) {
        const [cr, cc] = stack.pop()!
        const curIdx = cr * grid.nCols + cc
        cells.push(curIdx)
        sumR += cr
        sumC += cc
        if (Math.abs(grid.values[curIdx]) > Math.abs(peak)) peak = grid.values[curIdx]

        const neighbors: Array<[number, number]> = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ]
        for (const [nr, nc] of neighbors) {
          if (nr < 0 || nr >= grid.nRows || nc < 0 || nc >= grid.nCols) continue
          const n = nr * grid.nCols + nc
          if (visited[n]) continue
          const nv = grid.values[n]
          if (Number.isNaN(nv) || Math.abs(nv) < thresholdC || Math.sign(nv) !== sign) {
            visited[n] = 1
            continue
          }
          visited[n] = 1
          stack.push([nr, nc])
        }
      }

      if (cells.length < minCellCount) continue

      const centroidR = sumR / cells.length
      const centroidC = sumC / cells.length
      const lat = rowToLat(Math.round(centroidR))
      const lon = colToLon(Math.round(centroidC))

      // depth of strongest anomaly at the centroid
      const profile = getVerticalProfile(dateISO, lat, lon)
      let peakDepth: DepthM = depth
      let peakAbs = -Infinity
      for (const p of profile) {
        if (Number.isNaN(p.anomaly)) continue
        if (Math.abs(p.anomaly) > peakAbs) {
          peakAbs = Math.abs(p.anomaly)
          peakDepth = p.depth
        }
      }

      // persistence: consecutive days (looking back) the centroid stayed
      // above half-threshold at this depth
      let persistenceDays = 1
      const center = new Date(dateISO + 'T00:00:00Z')
      for (let i = 1; i <= 30; i++) {
        const d = new Date(center)
        d.setUTCDate(d.getUTCDate() - i)
        const iso = d.toISOString().slice(0, 10)
        const pastRec = getDailyReconstruction(iso)
        const pastV = getValueAt(pastRec.anomalyGrids[depthIdx], lat, lon)
        if (Number.isNaN(pastV) || Math.sign(pastV) !== sign || Math.abs(pastV) < thresholdC * 0.5) break
        persistenceDays++
      }

      clusters.push({
        id: `${dateISO}-${depth}-${Math.round(centroidR)}-${Math.round(centroidC)}`,
        lat,
        lon,
        region: regionName(lat, lon),
        depth: peakDepth,
        intensity: +peak.toFixed(2),
        type: sign > 0 ? 'warm' : 'cold',
        persistenceDays,
        cellCount: cells.length,
      })
    }
  }

  return clusters.sort((a, b) => Math.abs(b.intensity) - Math.abs(a.intensity)).slice(0, 15)
}
