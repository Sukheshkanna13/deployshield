import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import useStore from '@/store/useStore'

const METRICS = [
  { key: 'rate',       label: 'Request Rate', unit: 'req/s', color: '#0EA5E9' },
  { key: 'errorRate',  label: 'Error Rate',   unit: '%',     color: '#EF4444' },
  { key: 'p99',        label: 'P99 Latency',  unit: 'ms',    color: '#F97316' },
  { key: 'saturation', label: 'Saturation',   unit: '%',     color: '#A855F7' },
]

const fmtVal = (v, key) =>
  v == null ? '—' : key === 'errorRate' ? v.toFixed(2) : Math.round(v)

export default function MetricGrid() {
  const history = useStore(s => s.metrics.history)
  const attrs   = useStore(s => s.metrics.attrs)

  const topKey  = attrs[0]?.key
  const data    = history.map((h, i) => ({ ...h, i }))

  return (
    <div className="grid grid-cols-4 gap-2">
      {METRICS.map(m => {
        const isHot = topKey === m.key
        const last  = history.length ? history[history.length - 1][m.key] : null
        return (
          <div key={m.key} className="bg-ink rounded-lg p-2.5 border transition-colors duration-700"
            style={{ borderColor: isHot ? m.color + '55' : '#0D1E35', position: 'relative', overflow: 'hidden' }}>
            {isHot && (
              <div className="absolute top-0 inset-x-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${m.color},transparent)` }}/>
            )}
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[8px] font-display text-dim uppercase tracking-[1px]">{m.label}</span>
              <span className="font-mono text-xs font-medium" style={{ color: isHot ? m.color : '#6A90B0' }}>
                {fmtVal(last, m.key)}
                <span className="text-[8px] text-muted ml-0.5">{m.unit}</span>
              </span>
            </div>
            <ResponsiveContainer width="100%" height={52}>
              <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={m.color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={m.color} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={1.5}
                  fill={`url(#grad-${m.key})`} dot={false} isAnimationActive={false}/>
                <YAxis domain={['auto', 'auto']} hide/>
                <XAxis dataKey="i" hide/>
                <Tooltip
                  contentStyle={{ background: '#0A1828', border: '1px solid #1A3050', borderRadius: 4, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: '#8AAFD0', padding: '4px 8px' }}
                  labelStyle={{ display: 'none' }}
                  formatter={v => [`${fmtVal(v, m.key)} ${m.unit}`]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}
