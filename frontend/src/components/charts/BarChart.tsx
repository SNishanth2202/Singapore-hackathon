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

const COLORS = ['#1E3A5F', '#0D9488', '#3D6BA3', '#1DB3AD', '#5A82B4', '#47C1BC', '#7A9BC4']

export function BarChart({ data, title, color, isSample }: BarChartProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {isSample && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-600 border border-amber-200">
            sample
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RechartsBarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F3F5" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
            cursor={{ fill: '#F8F9FA' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((_, i) => (
              <Cell key={i} fill={color ?? COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
