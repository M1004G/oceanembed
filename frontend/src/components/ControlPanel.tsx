import { STANDARD_DEPTHS_M, type DepthM, type LayerKind } from '../types'

interface Props {
  depth: DepthM
  onDepthChange: (d: DepthM) => void
  dateIndex: number
  dateCount: number
  currentDate: string
  onDateIndexChange: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
  layer: LayerKind
  onLayerChange: (l: LayerKind) => void
}

export default function ControlPanel({
  depth,
  onDepthChange,
  dateIndex,
  dateCount,
  currentDate,
  onDateIndexChange,
  playing,
  onTogglePlay,
  layer,
  onLayerChange,
}: Props) {
  const depthIdx = STANDARD_DEPTHS_M.indexOf(depth)

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-current/40 bg-abyss/60 p-5">
      <section>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          Layer
        </h2>
        <div className="mt-3 flex rounded-md border border-current/50 bg-abyss p-1">
          {(['temperature', 'anomaly'] as LayerKind[]).map((l) => (
            <button
              key={l}
              onClick={() => onLayerChange(l)}
              className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
                layer === l ? 'bg-current text-white' : 'text-surface/70 hover:text-surface'
              }`}
            >
              {l === 'temperature' ? 'Temperature' : 'Anomaly'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
            Depth
          </h2>
          <span className="font-mono text-sm text-warmwater">{depth} m</span>
        </div>
        <input
          type="range"
          className="depth-slider mt-4 w-full"
          min={0}
          max={STANDARD_DEPTHS_M.length - 1}
          step={1}
          value={depthIdx}
          onChange={(e) => onDepthChange(STANDARD_DEPTHS_M[Number(e.target.value)])}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-surface/50">
          <span>0 m</span>
          <span>1000 m</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-surface/60">
          Moves through the water column — the slider's own gradient mirrors the thermocline,
          light near the surface and dark near the seafloor.
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
            Date
          </h2>
          <span className="font-mono text-sm text-hotspot">{currentDate}</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-current text-white transition-colors hover:bg-hotspot"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="1" y="1" width="3.5" height="10" />
                <rect x="7" y="1" width="3.5" height="10" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <polygon points="2,1 11,6 2,11" />
              </svg>
            )}
          </button>
          <input
            type="range"
            className="date-slider flex-1"
            min={0}
            max={dateCount - 1}
            step={1}
            value={dateIndex}
            onChange={(e) => onDateIndexChange(Number(e.target.value))}
          />
        </div>
      </section>

      <section className="border-t border-current/30 pt-4">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          Legend
        </h2>
        {layer === 'temperature' ? (
          <div className="mt-3">
            <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-abyss via-current via-surface via-warmwater to-hotspot" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-surface/60">
              <span>5°C</span>
              <span>32°C</span>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-current via-surface via-abyss via-warmwater to-hotspot" />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-surface/60">
              <span>&minus;2.5°C</span>
              <span>0</span>
              <span>+2.5°C</span>
            </div>
          </div>
        )}
      </section>

      <p className="mt-auto text-xs leading-relaxed text-surface/45">
        Click anywhere on the map to inspect the vertical profile and 28-day history at that
        point.
      </p>
    </aside>
  )
}
