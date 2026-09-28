import { useMemo, useState } from 'react'
import OceanMap from '../components/OceanMap'
import { computeHeatIndicators, getHeatContentGrid, DATE_RANGE } from '../data/mockOceanData'
import { buildDateList } from '../utils/dates'
import type { LatLon } from '../types'

export default function CycloneIndicatorsPage() {
  const dateList = useMemo(() => buildDateList(DATE_RANGE.min, DATE_RANGE.max), [])
  const [dateIndex, setDateIndex] = useState(0)
  const [selected, setSelected] = useState<LatLon>({ lat: 12, lon: 70 })

  const currentDate = dateList[dateIndex]
  const heatGrid = useMemo(() => getHeatContentGrid(currentDate), [currentDate])
  const indicators = useMemo(
    () => computeHeatIndicators(currentDate, selected.lat, selected.lon),
    [currentDate, selected],
  )

  // "Hidden heat": SST looks unremarkable but TCHP is elevated -> cyclone-relevant
  // heat is present below a surface that satellites alone wouldn't flag.
  const hiddenHeat = indicators.sst < 29 && indicators.tchp > 60

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-current/40 bg-abyss/60 p-5">
        <section>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Layer</h2>
          <div className="mt-3 rounded-md border border-current/50 bg-abyss px-3 py-2">
            <span className="text-sm text-white">Tropical Cyclone Heat Potential</span>
          </div>
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
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Legend</h2>
          <div className="mt-3 h-2.5 w-full rounded-full bg-gradient-to-r from-abyss via-current via-surface via-warmwater to-hotspot" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-surface/60">
            <span>0</span>
            <span>150 kJ/cm&sup2;</span>
          </div>
        </section>

        <section className="border-t border-current/30 pt-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">Method</h2>
          <p className="mt-2 text-xs leading-relaxed text-surface/60">
            TCHP / OHC is the heat stored between the surface and the 26&deg;C isotherm — the
            standard cyclone-forecasting threshold, since surface heat below that depth
            typically can't fuel intensification. Computed as &rho;&middot;c<sub>p</sub>&middot;&int;(T&minus;26)dz,
            &rho;=1025 kg/m&sup3;, c<sub>p</sub>=4178 J/(kg&middot;K).
          </p>
        </section>

        <p className="mt-auto text-xs leading-relaxed text-surface/45">Click the map to inspect a point.</p>
      </aside>

      <main className="min-h-0 flex-1">
        <OceanMap
          grid={heatGrid}
          layer="temperature"
          colorDomain={{ min: 0, max: 150 }}
          selected={selected}
          onSelect={setSelected}
        />
      </main>

      <section className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-current/40 bg-abyss/60 p-5">
        <div>
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
            Point indicators
          </h3>
          <span className="font-mono text-xs text-surface/60">
            {selected.lat.toFixed(2)}&deg;N, {selected.lon.toFixed(2)}&deg;E
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="SST" value={`${indicators.sst.toFixed(1)}°C`} />
          <Stat label="26°C isotherm depth" value={indicators.d26 !== null ? `${indicators.d26.toFixed(0)} m` : '—'} />
          <Stat label="OHC" value={`${indicators.ohc.toFixed(1)} kJ/cm²`} />
          <Stat label="TCHP" value={`${indicators.tchp.toFixed(1)} kJ/cm²`} accent />
        </div>

        <div
          className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${
            hiddenHeat ? 'border-hotspot bg-hotspot/10 text-hotspot' : 'border-current/30 bg-current/10 text-surface/70'
          }`}
        >
          {hiddenHeat ? (
            <>
              <strong className="font-display">Hidden heat detected.</strong> Surface temperature alone
              looks unremarkable ({indicators.sst.toFixed(1)}°C), but subsurface heat content is
              elevated — this is exactly the kind of signal satellite SST alone would miss, and
              what rapid cyclone intensification tends to feed on.
            </>
          ) : (
            <>No hidden-heat signal at this point — surface and subsurface heat content are consistent.</>
          )}
        </div>

        <p className="text-xs leading-relaxed text-surface/45">
          "Hidden heat" here flags points where SST is below 29°C but TCHP exceeds 60 kJ/cm² — a
          simple illustrative threshold. A production version would compare against
          storm-specific intensification thresholds and historical TCHP climatology.
        </p>
      </section>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-current/30 bg-abyss px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wide text-surface/50">{label}</div>
      <div className={`mt-1 font-mono text-lg ${accent ? 'text-hotspot' : 'text-white'}`}>{value}</div>
    </div>
  )
}
