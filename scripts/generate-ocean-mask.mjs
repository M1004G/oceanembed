// One-off build script: converts real Natural Earth coastline data into a
// static ocean/land mask matching our exact 73x221 grid, so the map doesn't
// rely on hand-drawn polygon guesses. Run with: node scripts/generate-ocean-mask.mjs
import { readFileSync, writeFileSync } from 'fs'
import { feature } from 'topojson-client'

const topology = JSON.parse(readFileSync('./node_modules/world-atlas/land-50m.json', 'utf-8'))
const geo = feature(topology, topology.objects.land)

const DOMAIN = { latMin: 5, latMax: 23, lonMin: 45, lonMax: 100 }
const RES = 0.25
const nRows = Math.round((DOMAIN.latMax - DOMAIN.latMin) / RES) + 1
const nCols = Math.round((DOMAIN.lonMax - DOMAIN.lonMin) / RES) + 1

function bboxOfRing(ring) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function pointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Keep only polygons whose bbox overlaps our domain (huge speedup: most of
// the world's coastline is irrelevant to the North Indian Ocean).
const margin = 1 // degrees, small buffer
const relevantPolygons = []
for (const polygon of geo.geometries ? [] : geo.features ?? [geo]) {
  // handled below via generic walk
}

function collectPolygons(g) {
  const polys = []
  const walk = (geom) => {
    if (!geom) return
    if (geom.type === 'Polygon') polys.push(geom.coordinates)
    else if (geom.type === 'MultiPolygon') for (const p of geom.coordinates) polys.push(p)
    else if (geom.type === 'GeometryCollection') geom.geometries.forEach(walk)
    else if (geom.type === 'FeatureCollection') geom.features.forEach((f) => walk(f.geometry))
    else if (geom.type === 'Feature') walk(geom.geometry)
  }
  walk(g)
  return polys
}

const allPolygons = collectPolygons(geo)
for (const polygon of allPolygons) {
  const [exterior] = polygon
  const [minX, minY, maxX, maxY] = bboxOfRing(exterior)
  if (
    maxX < DOMAIN.lonMin - margin ||
    minX > DOMAIN.lonMax + margin ||
    maxY < DOMAIN.latMin - margin ||
    minY > DOMAIN.latMax + margin
  ) {
    continue
  }
  relevantPolygons.push(polygon)
}

console.log(`Relevant land polygons overlapping domain: ${relevantPolygons.length} / ${allPolygons.length}`)

function isLand(lon, lat) {
  for (const polygon of relevantPolygons) {
    const [exterior, ...holes] = polygon
    if (!pointInRing(lon, lat, exterior)) continue
    let inHole = false
    for (const hole of holes) {
      if (pointInRing(lon, lat, hole)) {
        inHole = true
        break
      }
    }
    if (!inHole) return true
  }
  return false
}

const values = new Array(nRows * nCols)
for (let r = 0; r < nRows; r++) {
  const lat = DOMAIN.latMin + r * RES
  for (let c = 0; c < nCols; c++) {
    const lon = DOMAIN.lonMin + c * RES
    values[r * nCols + c] = isLand(lon, lat) ? 0 : 1
  }
}

const oceanCount = values.filter((v) => v === 1).length
console.log(`Grid: ${nRows} x ${nCols} = ${values.length} cells, ${oceanCount} ocean / ${values.length - oceanCount} land`)

writeFileSync(
  './src/data/oceanMaskData.json',
  JSON.stringify({ nRows, nCols, values }),
)
console.log('Wrote src/data/oceanMaskData.json')
