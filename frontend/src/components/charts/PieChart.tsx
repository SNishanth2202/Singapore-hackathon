import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface PieChartProps {
  data: { name: string; value: number }[]
  title: string
  isSample?: boolean
}

const COLORS = ['#1E3A5F', '#0D9488', '#3D6BA3', '#1DB3AD', '#5A82B4', '#47C1BC', '#7A9BC4', '#9FB8D5']

export function PieChart({ data, title, isSample }: PieChartProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {isSample && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
            Demo
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: '#6B7280' }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
}
