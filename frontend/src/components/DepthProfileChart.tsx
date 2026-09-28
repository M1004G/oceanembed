import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LatLon, VerticalProfilePoint } from '../types'

interface Props {
  profile: VerticalProfilePoint[]
  point: LatLon
  activeDepth: number
}

export default function DepthProfileChart({ profile, point, activeDepth }: Props) {
  // depth increases downward, so flip it onto the Y axis by using it as
  // domain and reversing the axis rather than the data.
  const data = profile.map((p) => ({ ...p, depth: p.depth }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          Vertical profile
        </h3>
        <span className="font-mono text-xs text-surface/60">
          {point.lat.toFixed(2)}°N, {point.lon.toFixed(2)}°E
        </span>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} layout="vertical" margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#33658a" strokeOpacity={0.25} horizontal={false} />
            <XAxis
              type="number"
              dataKey="temperature"
              stroke="#86bbd8"
              tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10, fill: '#86bbd8' }}
              label={{ value: '°C', position: 'insideBottomRight', fill: '#86bbd8', fontSize: 10, offset: -2 }}
            />
            <YAxis
              type="number"
              dataKey="depth"
              reversed
              stroke="#86bbd8"
              tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10, fill: '#86bbd8' }}
              width={42}
              label={{ value: 'm', angle: -90, position: 'insideLeft', fill: '#86bbd8', fontSize: 10 }}
            />
            <ReferenceLine y={activeDepth} stroke="#f6ae2d" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                background: '#2f4858',
                border: '1px solid #33658a',
                borderRadius: 6,
                fontFamily: 'IBM Plex Mono',
                fontSize: 11,
              }}
              labelStyle={{ color: '#86bbd8' }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(2)}°C`,
                name === 'temperature' ? 'Temperature' : name,
              ]}
              labelFormatter={(d) => `${d} m`}
            />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#f26419"
              strokeWidth={2}
              dot={{ r: 2, fill: '#f6ae2d' }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
