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

interface BarChartProps {
  data: { name: string; value: number }[]
  title: string
  color?: string
  isSample?: boolean
}

const COLORS = ['#1E3A5F', '#0D9488', '#3D6BA3', '#1DB3AD', '#5A82B4', '#47C1BC', '#7A9BC4', '#2D5080']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className="text-sm font-bold text-navy-600 mt-0.5">{payload[0].value} companies</p>
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
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Distribution across sectors</p>
        </div>
        {isSample && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
            Account records
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RechartsBarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -30 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 48 : 24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9', radius: 4 }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {data.map((_, i) => (
              <Cell key={i} fill={color ?? COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
