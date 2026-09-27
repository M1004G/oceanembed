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
import type { DepthM, TimeSeriesPoint } from '../types'

interface Props {
  series: TimeSeriesPoint[]
  depth: DepthM
  currentDate: string
}

export default function TimeSeriesChart({ series, depth, currentDate }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-surface">
          28-day history
        </h3>
        <span className="font-mono text-xs text-surface/60">{depth} m</span>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#33658a" strokeOpacity={0.25} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              stroke="#86bbd8"
              tick={{ fontFamily: 'IBM Plex Mono', fontSize: 9, fill: '#86bbd8' }}
              minTickGap={24}
            />
            <YAxis
              stroke="#86bbd8"
              tick={{ fontFamily: 'IBM Plex Mono', fontSize: 10, fill: '#86bbd8' }}
              width={36}
              label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#86bbd8', fontSize: 10 }}
            />
            <ReferenceLine x={currentDate} stroke="#f6ae2d" strokeDasharray="3 3" />
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
                name === 'temperature' ? 'Temperature' : 'Anomaly',
              ]}
            />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#86bbd8"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="anomaly"
              stroke="#f26419"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
