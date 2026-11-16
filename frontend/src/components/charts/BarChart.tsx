import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { chartTheme } from './chartTheme'

interface BarChartProps {
  data: { name: string; value: number }[]
  title: string
  color?: string
  isSample?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className="text-sm font-bold text-singtelGray-900 mt-0.5">{payload[0].value} companies</p>
      </div>
    )
  }
  return null
}

export function BarChart({ data, title, color, isSample }: BarChartProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-singtelGray-900">{title}</h3>
          <p className="text-xs text-singtelGray-500 mt-0.5">Distribution across sectors</p>
        </div>
        {isSample && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-singtelGray-50 text-singtelGray-600 border border-gray-200">
            Account records
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RechartsBarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={chartTheme.axis}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -30 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 48 : 24}
          />
          <YAxis
            tick={chartTheme.axis}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F7F8FA', radius: 4 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {data.map((item, i) => (
              <Cell key={item.name} fill={color ?? (i === 0 ? chartTheme.primary : chartTheme.muted)} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
