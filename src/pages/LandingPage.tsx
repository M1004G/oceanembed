import { Link } from 'react-router-dom'

const CAPABILITIES = [
  {
    title: 'Daily 3D Ocean Reconstruction',
    body: 'Subsurface temperature from 0–1000m at 0.25° resolution, fusing satellite SST, SSS, SSH, currents and winds through a U-Net encoder–decoder.',
    href: '/explorer',
    status: 'Live',
  },
  {
    title: 'Subsurface Anomaly Detection',
    body: 'Warm and cold regions flagged against location, depth and month-specific climatology, ranked by intensity, depth and persistence.',
    href: '/anomalies',
    status: 'Live',
  },
  {
    title: 'Interactive 4D Ocean Exploration',
    body: 'Move through latitude, longitude, depth and time via linked map, vertical profile and history views.',
    href: '/explorer',
    status: 'Live',
  },
  {
    title: 'Hidden Heat & Cyclone Indicators',
    body: 'Ocean Heat Content and Tropical Cyclone Heat Potential down to the 26°C isotherm — heat a satellite alone would miss.',
    href: '/cyclone',
    status: 'Live',
  },
  {
    title: 'Research Data on Demand',
    body: 'Custom downloads by region, time period, depth and derived parameter.',
    href: null,
    status: 'Coming soon',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="border-b border-current/30 px-8 py-16 sm:px-16">
        <div className="mx-auto max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-surface/60">
            North Indian Ocean · 0–1000m · daily
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">
            See beneath the surface the satellites can't reach.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-surface/80">
            OceanEmbed reconstructs subsurface ocean temperature from satellite-observable
            surface data alone, trained against GLORYS reanalysis and validated against
            independent Gridded ARGO observations — turning sparse point measurements into a
            daily, full-depth picture of the Arabian Sea and Bay of Bengal.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              to="/explorer"
              className="rounded-md bg-hotspot px-5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:bg-warmwater"
            >
              Open the Explorer
            </Link>
            <Link
              to="/anomalies"
              className="rounded-md border border-current/50 px-5 py-2.5 font-display text-sm font-semibold text-surface transition-colors hover:border-surface hover:text-white"
            >
              View anomalies
            </Link>
          </div>
        </div>
      </section>

      <section className="px-8 py-14 sm:px-16">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          System capabilities
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => {
            const content = (
              <div
                className={`flex h-full flex-col rounded-lg border border-current/30 bg-abyss/60 p-5 transition-colors ${
                  c.href ? 'hover:border-surface/60 hover:bg-abyss' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-white">{c.title}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                      c.status === 'Live' ? 'bg-current/60 text-surface' : 'bg-current/20 text-surface/50'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-surface/70">{c.body}</p>
              </div>
            )
            return c.href ? (
              <Link key={c.title} to={c.href}>
                {content}
              </Link>
            ) : (
              <div key={c.title}>{content}</div>
            )
          })}
        </div>
      </section>

      <section className="border-t border-current/30 px-8 py-14 sm:px-16">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          How it works
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Step
            n="01"
            title="Surface inputs"
            body="Daily 0.25° SST, SSS, SSH, currents and winds, enriched with positional and temporal embeddings."
          />
          <Step
            n="02"
            title="U-Net encoder–decoder"
            body="A CNN encoder compresses surface fields to a latent representation; a matching decoder with skip connections reconstructs full spatial detail at all 15 depths at once."
          />
          <Step
            n="03"
            title="Validated against ARGO"
            body="Per-depth RMSE, Bias and Correlation against independent Gridded ARGO observations confirm genuine skill, not memorization."
          />
        </div>
      </section>
    </div>
  )
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span className="font-mono text-sm text-hotspot">{n}</span>
      <h3 className="mt-1 font-display text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-surface/70">{body}</p>
    </div>
  )
}
