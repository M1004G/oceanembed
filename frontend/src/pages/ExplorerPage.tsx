import { useEffect, useMemo, useRef, useState } from 'react'
import ControlPanel from '../components/ControlPanel'
import OceanMap from '../components/OceanMap'
import DepthProfileChart from '../components/DepthProfileChart'
import TimeSeriesChart from '../components/TimeSeriesChart'
import StatsStrip from '../components/StatsStrip'
import {
  getDailyReconstruction,
  getTimeSeries,
  getValidationStats,
  getVerticalProfile,
  DATE_RANGE,
} from '../data/mockOceanData'
import { buildDateList } from '../utils/dates'
import { STANDARD_DEPTHS_M, type DepthM, type LatLon, type LayerKind } from '../types'

export default function ExplorerPage() {
  const dateList = useMemo(() => buildDateList(DATE_RANGE.min, DATE_RANGE.max), [])
  const [dateIndex, setDateIndex] = useState(0)
  const [depth, setDepth] = useState<DepthM>(STANDARD_DEPTHS_M[0])
  const [layer, setLayer] = useState<LayerKind>('temperature')
  const [selected, setSelected] = useState<LatLon>({ lat: 12, lon: 70 })
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<number | null>(null)

  const currentDate = dateList[dateIndex]

  useEffect(() => {
    if (playing) {
      intervalRef.current = window.setInterval(() => {
        setDateIndex((i) => (i + 1) % dateList.length)
      }, 700)
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [playing, dateList.length])

  const reconstruction = useMemo(() => getDailyReconstruction(currentDate), [currentDate])
  const depthIdx = STANDARD_DEPTHS_M.indexOf(depth)
  const activeGrid = layer === 'temperature' ? reconstruction.grids[depthIdx] : reconstruction.anomalyGrids[depthIdx]

  const profile = useMemo(
    () => getVerticalProfile(currentDate, selected.lat, selected.lon),
    [currentDate, selected],
  )
  const series = useMemo(
    () => getTimeSeries(currentDate, selected.lat, selected.lon, depth),
    [currentDate, selected, depth],
  )
  const validationStats = useMemo(() => getValidationStats(), [])
  const activeStats = validationStats[depthIdx]

  return (
    <div className="flex min-h-0 flex-1">
      <ControlPanel
        depth={depth}
        onDepthChange={setDepth}
        dateIndex={dateIndex}
        dateCount={dateList.length}
        currentDate={currentDate}
        onDateIndexChange={(i) => {
          setPlaying(false)
          setDateIndex(i)
        }}
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        layer={layer}
        onLayerChange={setLayer}
      />

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <OceanMap grid={activeGrid} layer={layer} selected={selected} onSelect={setSelected} />
        </div>
        <StatsStrip stats={activeStats} />
      </main>

      <section className="flex w-[380px] shrink-0 flex-col divide-y divide-current/30 border-l border-current/40 bg-abyss/60">
        <div className="h-1/2 min-h-0">
          <DepthProfileChart profile={profile} point={selected} activeDepth={depth} />
        </div>
        <div className="h-1/2 min-h-0">
          <TimeSeriesChart series={series} depth={depth} currentDate={currentDate} />
        </div>
      </section>
    </div>
  )
}
