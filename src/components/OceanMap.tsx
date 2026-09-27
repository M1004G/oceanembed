import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  CircleMarker,
  Rectangle,
  Tooltip,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { DOMAIN_BOUNDS, type DepthGrid, type LatLon, type LayerKind } from '../types'
import { anomalyColor, temperatureColor } from '../utils/colorScale'
import { smoothImageData } from '../utils/imageSmoothing'

export interface MapPin {
  lat: number
  lon: number
  color: string
  radius: number
  label?: string
}

interface Props {
  grid: DepthGrid
  layer: LayerKind
  selected: LatLon | null
  onSelect: (point: LatLon) => void
  /** Override the sequential color domain (defaults to 5-32 degC for temperature). */
  colorDomain?: { min: number; max: number }
  /** Extra circle markers drawn on top (e.g. detected anomalies). */
  pins?: MapPin[]
  activePinId?: string | null
}

function gridToDataUrl(grid: DepthGrid, layer: LayerKind, colorDomain?: { min: number; max: number }): string {
  const canvas = document.createElement('canvas')
  canvas.width = grid.nCols
  canvas.height = grid.nRows
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(grid.nCols, grid.nRows)

  for (let r = 0; r < grid.nRows; r++) {
    // canvas row 0 is the top (north), our grid row 0 is south -> flip
    const srcRow = grid.nRows - 1 - r
    for (let c = 0; c < grid.nCols; c++) {
      const v = grid.values[srcRow * grid.nCols + c]
      const idx = (r * grid.nCols + c) * 4
      if (Number.isNaN(v)) {
        // land (ocean_mask === 0): fully transparent, let the basemap show through
        img.data[idx + 3] = 0
        continue
      }
      if (layer === 'temperature') {
        const [rr, gg, bb] = colorDomain
          ? temperatureColor(v, colorDomain.min, colorDomain.max)
          : temperatureColor(v)
        img.data[idx] = rr
        img.data[idx + 1] = gg
        img.data[idx + 2] = bb
        img.data[idx + 3] = 235
      } else {
        const [rr, gg, bb, aa] = anomalyColor(v)
        img.data[idx] = rr
        img.data[idx + 1] = gg
        img.data[idx + 2] = bb
        img.data[idx + 3] = aa
      }
    }
  }
  // Smooth twice: softens the raw 0.25 deg grid into something that reads
  // as a continuous field rather than a speckled/static-looking texture.
  const smoothed = smoothImageData(smoothImageData(img.data, grid.nCols, grid.nRows), grid.nCols, grid.nRows)
  img.data.set(smoothed)
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

function ClickCapture({ onSelect }: { onSelect: (p: LatLon) => void }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lon: e.latlng.lng })
    },
  })
  return null
}

const markerIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#f6ae2d;border:2px solid #1c2b33;box-shadow:0 0 0 3px rgba(246,174,45,0.35)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

export default function OceanMap({ grid, layer, selected, onSelect, colorDomain, pins, activePinId }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('')

  useEffect(() => {
    setDataUrl(gridToDataUrl(grid, layer, colorDomain))
  }, [grid, layer, colorDomain])

  const bounds = useMemo(
    (): L.LatLngBoundsExpression => [
      [DOMAIN_BOUNDS.latMin, DOMAIN_BOUNDS.lonMin],
      [DOMAIN_BOUNDS.latMax, DOMAIN_BOUNDS.lonMax],
    ],
    [],
  )

  // Give a little breathing room around the data domain but never let the
  // user pan/zoom away into an unrelated part of the world.
  const maxBounds = useMemo(
    (): L.LatLngBoundsExpression => [
      [DOMAIN_BOUNDS.latMin - 6, DOMAIN_BOUNDS.lonMin - 8],
      [DOMAIN_BOUNDS.latMax + 6, DOMAIN_BOUNDS.lonMax + 8],
    ],
    [],
  )

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      maxBounds={maxBounds}
      maxBoundsViscosity={1.0}
      minZoom={4}
      maxZoom={8}
      className="h-full w-full"
      attributionControl={true}
    >
      <TileLayer
        url="https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
      />
      {dataUrl && (
        <ImageOverlay
          url={dataUrl}
          bounds={bounds}
          opacity={layer === 'temperature' ? 0.85 : 0.9}
          className="[image-rendering:auto]"
        />
      )}
      <Rectangle
        bounds={bounds}
        pathOptions={{ color: '#86bbd8', weight: 1, fillOpacity: 0, dashArray: '5 5', opacity: 0.5 }}
        interactive={false}
      />
      <ClickCapture onSelect={onSelect} />
      {selected && <Marker position={[selected.lat, selected.lon]} icon={markerIcon} />}
      {pins?.map((pin, i) => {
        const isActive = activePinId !== undefined && activePinId === `${pin.lat}-${pin.lon}-${i}`
        return (
          <CircleMarker
            key={i}
            center={[pin.lat, pin.lon]}
            radius={pin.radius}
            pathOptions={{
              color: isActive ? '#ffffff' : pin.color,
              weight: isActive ? 2.5 : 1.5,
              fillColor: pin.color,
              fillOpacity: 0.55,
            }}
          >
            {pin.label && <Tooltip direction="top">{pin.label}</Tooltip>}
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
