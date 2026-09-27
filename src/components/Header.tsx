import { NavLink } from 'react-router-dom'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `pb-0.5 ${isActive ? 'border-b-2 border-warmwater text-white' : 'text-surface/60 hover:text-surface'}`

export default function Header() {
  return (
    <header className="flex items-center justify-between border-b border-current/40 bg-abyss px-6 py-3">
      <NavLink to="/" className="flex items-baseline gap-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-white">OceanEmbed</h1>
        <span className="hidden font-body text-sm text-surface/80 sm:inline">
          Subsurface reconstruction from satellite-observable surface data
        </span>
      </NavLink>
      <nav className="flex items-center gap-5 font-body text-sm">
        <NavLink to="/explorer" className={navLinkClass}>
          Explorer
        </NavLink>
        <NavLink to="/anomalies" className={navLinkClass}>
          Anomaly detection
        </NavLink>
        <NavLink to="/cyclone" className={navLinkClass}>
          Cyclone indicators
        </NavLink>
        <span className="cursor-default pb-0.5 text-surface/30">Data on demand</span>
      </nav>
    </header>
  )
}
