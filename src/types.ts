/**
 * Data contract for OceanEmbed.
 *
 * This is the shape the frontend expects from the backend once it's wired up.
 * Everything here is currently produced by src/data/mockOceanData.ts — swap
 * that module for real `fetch` calls without touching the components.
 */

// Matches ds_final.depth exactly (final_dataset_2016_2022_full.nc)
export const STANDARD_DEPTHS_M = [
  0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000,
] as const

export type DepthM = (typeof STANDARD_DEPTHS_M)[number]

export type LayerKind = 'temperature' | 'anomaly'

/**
 * Bounding box matching ds_final.latitude / ds_final.longitude exactly:
 * lat 5.0-23.0N, lon 45.0-100.0E at 0.25 deg -> 73 x 221 grid.
 */
export const DOMAIN_BOUNDS = {
  latMin: 5,
  latMax: 23,
  lonMin: 45,
  lonMax: 100,
}

/** Matches ds_final.ocean_mask (latitude, longitude) bool. */
export interface OceanMask {
  nRows: number
  nCols: number
  /** 1 = ocean (valid), 0 = land (mask out). */
  values: Uint8Array
}

export const GRID_RESOLUTION_DEG = 0.25

/** A single day's reconstructed field for one depth level, as a lat x lon grid. */
export interface DepthGrid {
  depth: DepthM
  /** rows = latitude (south to north), cols = longitude (west to east) */
  values: Float32Array
  nRows: number
  nCols: number
}

export interface DailyReconstruction {
  date: string // ISO yyyy-mm-dd
  /**
   * One per STANDARD_DEPTHS_M, temperature in degC — i.e. `y` already
   * de-normalized: y_raw * y_std[depth] + y_mean[depth]. The frontend
   * always expects real-unit Celsius, never standardized z-scores.
   */
  grids: DepthGrid[]
  anomalyGrids: DepthGrid[] // same shape, anomaly vs climatology in degC
}

export interface ValidationStats {
  depth: DepthM
  rmse: number // degC
  bias: number // degC
  correlation: number // 0-1
}

export interface VerticalProfilePoint {
  depth: DepthM
  temperature: number
  anomaly: number
}

export interface TimeSeriesPoint {
  date: string
  temperature: number
  anomaly: number
}

export interface HeatIndicatorPoint {
  lat: number
  lon: number
  sst: number
  /** Depth (m) of the 26°C isotherm, or null if SST itself is below 26°C. */
  d26: number | null
  /** Ocean Heat Content down to the 26°C isotherm, kJ/cm^2. */
  ohc: number
  /** Tropical Cyclone Heat Potential (same quantity as ohc, standard cyclone-forecasting name/units). */
  tchp: number
}

export interface DetectedAnomaly {
  id: string
  lat: number
  lon: number
  region: string
  depth: DepthM
  intensity: number // degC, signed
  type: 'warm' | 'cold'
  persistenceDays: number
  cellCount: number
}

export interface DownloadRequest {
  mode: 'point' | 'region'
  startDate: string
  endDate: string
  depths: DepthM[]
  parameters: Array<'temperature' | 'anomaly' | 'ohc' | 'tchp'>
  lat?: number
  lon?: number
  latMin?: number
  latMax?: number
  lonMin?: number
  lonMax?: number
}

export interface LatLon {
  lat: number
  lon: number
}
