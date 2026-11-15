import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface PieChartProps {
  data: { name: string; value: number }[]
  title: string
  isSample?: boolean
}

const COLORS = ['#1E3A5F', '#0D9488', '#3D6BA3', '#1DB3AD', '#5A82B4', '#47C1BC', '#7A9BC4', '#9FB8D5']

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-700">{payload[0].name}</p>
        <p className="text-sm font-bold text-navy-600 mt-0.5">{payload[0].value} companies</p>
        <p className="text-xs text-gray-400">{((payload[0].value / payload[0].payload.total) * 100).toFixed(1)}%</p>
      </div>
    )
  }
  return null
}

export function PieChart({ data, title, isSample }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const enriched = data.map((d) => ({ ...d, total }))

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Geographic breakdown</p>
        </div>
        {isSample && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
            Demo
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ResponsiveContainer width="55%" height={200}>
          <RechartsPieChart>
            <Pie
              data={enriched}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {enriched.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </RechartsPieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {data.slice(0, 6).map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 min-w-0">
              <span
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-xs text-gray-600 truncate flex-1">{d.name}</span>
              <span className="text-xs font-semibold text-gray-700 flex-shrink-0">{d.value}</span>
            </div>
          ))}
          {data.length > 6 && (
            <p className="text-[10px] text-gray-400 pl-4">+{data.length - 6} more</p>
          )}
        </div>
      </div>
    </div>
  )
}
