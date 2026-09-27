import { useMemo, useState } from 'react'
import OceanMap, { type MapPin } from '../components/OceanMap'
import { detectAnomalies, getDailyReconstruction, DATE_RANGE } from '../data/mockOceanData'
import { buildDateList } from '../utils/dates'
import { STANDARD_DEPTHS_M, type DepthM } from '../types'

export default function AnomalyDashboardPage() {
  const dateList = useMemo(() => buildDateList(DATE_RANGE.min, DATE_RANGE.max), [])
  const [dateIndex, setDateIndex] = useState(0)
  const [depth, setDepth] = useState<DepthM>(50)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const currentDate = dateList[dateIndex]
  const depthIdx = STANDARD_DEPTHS_M.indexOf(depth)
  const reconstruction = useMemo(() => getDailyReconstruction(currentDate), [currentDate])
  const grid = reconstruction.anomalyGrids[depthIdx]

  const anomalies = useMemo(() => detectAnomalies(currentDate, depth), [currentDate, depth])
  const selected = anomalies.find((a) => a.id === selectedId) ?? null

  const pins: MapPin[] = anomalies.map((a) => ({
    lat: a.lat,
    lon: a.lon,
    color: a.type === 'warm' ? '#f26419' : '#86bbd8',
    radius: 5 + Math.min(10, a.cellCount / 3),
    label: `${a.type === 'warm' ? '+' : ''}${a.intensity}°C · ${a.persistenceDays}d`,
  }))

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-current/40 bg-abyss/60 p-5">
        <section>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Depth</h2>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value) as DepthM)}
            className="mt-3 w-full rounded-md border border-current/50 bg-abyss px-3 py-2 font-mono text-sm text-white"
          >
            {STANDARD_DEPTHS_M.map((d) => (
              <option key={d} value={d}>
                {d} m
              </option>
            ))}
          </select>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Date</h2>
            <span className="font-mono text-sm text-hotspot">{currentDate}</span>
          </div>
          <input
            type="range"
            className="date-slider mt-4 w-full"
            min={0}
            max={dateList.length - 1}
            step={1}
            value={dateIndex}
            onChange={(e) => setDateIndex(Number(e.target.value))}
          />
        </section>

        <section className="border-t border-current/30 pt-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Method</h2>
          <p className="mt-2 text-xs leading-relaxed text-surface/60">
            Cells where the reconstructed temperature deviates &ge;1.2&deg;C from location/depth/month
            climatology are grouped into connected regions. Intensity is the strongest anomaly in the
            region; persistence counts consecutive days it has stayed anomalous.
          </p>
        </section>

        <p className="mt-auto text-xs leading-relaxed text-surface/45">
          Click a row to highlight it on the map.
        </p>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <OceanMap
            grid={grid}
            layer="anomaly"
            selected={null}
            onSelect={() => {}}
            pins={pins}
            activePinId={selected ? `${selected.lat}-${selected.lon}-${anomalies.indexOf(selected)}` : null}
          />
        </div>
      </main>

      <section className="flex w-[380px] shrink-0 flex-col border-l border-current/40 bg-abyss/60">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
            Detected anomalies
          </h3>
          <span className="font-mono text-xs text-surface/60">{anomalies.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {anomalies.length === 0 && (
            <p className="px-2 text-xs text-surface/50">No anomalies above threshold at this depth/date.</p>
          )}
          {anomalies.map((a, i) => {
            const isActive = selected && selected.id === a.id
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                className={`mb-1.5 flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                  isActive ? 'border-hotspot bg-current/50' : 'border-current/30 bg-abyss hover:bg-current/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-white">{a.region}</span>
                  <span
                    className={`font-mono text-xs font-medium ${
                      a.type === 'warm' ? 'text-hotspot' : 'text-surface'
                    }`}
                  >
                    {a.type === 'warm' ? '+' : ''}
                    {a.intensity}&deg;C
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-surface/60">
                  <span>peak {a.depth} m</span>
                  <span>{a.persistenceDays}d persistent</span>
                  <span>{a.cellCount} cells</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
