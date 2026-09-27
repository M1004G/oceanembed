import type { ValidationStats } from '../types'

export default function StatsStrip({ stats }: { stats: ValidationStats }) {
  const items = [
    { label: 'RMSE', value: `${stats.rmse.toFixed(2)}°C` },
    { label: 'Bias', value: `${stats.bias > 0 ? '+' : ''}${stats.bias.toFixed(2)}°C` },
    { label: 'Correlation', value: stats.correlation.toFixed(2) },
  ]
  return (
    <div className="flex items-center gap-5 border-t border-current/40 bg-abyss/80 px-4 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wide text-surface/50">
        vs Gridded ARGO
      </span>
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] uppercase text-surface/50">{it.label}</span>
          <span className="font-mono text-xs text-warmwater">{it.value}</span>
        </div>
      ))}
    </div>
  )
}
