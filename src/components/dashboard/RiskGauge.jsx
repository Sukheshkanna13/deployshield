const polar = (cx, cy, r, deg) => {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
const arcPath = (cx, cy, r, startDeg, spanDeg) => {
  if (spanDeg <= 0) return ''
  spanDeg = Math.min(spanDeg, 269.9)
  const s = polar(cx, cy, r, startDeg)
  const e = polar(cx, cy, r, startDeg + spanDeg)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${spanDeg > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}
const col = s => s >= 80 ? '#EF4444' : s >= 65 ? '#F97316' : s >= 42 ? '#EAB308' : '#22C55E'

export default function RiskGauge({ score = 0, phase = 'IDLE', progress = 0, trend = 'stable' }) {
  const cx = 100, cy = 92, r = 70
  const START = 225, SWEEP = 270
  const bg   = arcPath(cx, cy, r, START, SWEEP)
  const fill = score > 0 ? arcPath(cx, cy, r, START, SWEEP * (score / 100)) : null
  const c    = col(score)

  const trendIcon = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→'
  const trendCol  = trend === 'rising' ? '#EF4444' : trend === 'falling' ? '#22C55E' : '#4A7090'

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 200 152" className="w-full max-w-[200px]">
        <defs>
          <filter id="glow-g"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        {/* Background track */}
        <path d={bg} fill="none" stroke="#0D1E35" strokeWidth="12" strokeLinecap="round"/>
        {/* Glow beneath */}
        {fill && <path d={fill} fill="none" stroke={c} strokeWidth="20" strokeLinecap="round" opacity="0.1" filter="url(#glow-g)"/>}
        {/* Active arc */}
        {fill && <path d={fill} fill="none" stroke={c} strokeWidth="10" strokeLinecap="round" filter="url(#glow-g)" style={{ transition: 'stroke 1s ease' }}/>}
        {/* Tick marks at 0, 25, 50, 75, 100 */}
        {[0, 25, 50, 75, 100].map(v => {
          const deg = START + SWEEP * v / 100
          const o = polar(cx, cy, r + 10, deg)
          const i = polar(cx, cy, r + 3, deg)
          return <line key={v} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="#1A2E4A" strokeWidth="1.5"/>
        })}
        {/* Center text */}
        {phase === 'IDLE' ? (
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="11" fill="#1A2E4A" fontFamily="'Syne',sans-serif" letterSpacing="2">STANDBY</text>
        ) : phase === 'LEARNING' ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize="9" fill="#1E3D5C" fontFamily="'JetBrains Mono',monospace">LEARNING</text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1E3D5C" fontFamily="'JetBrains Mono',monospace">{Math.round(progress * 100)}%</text>
            <text x={cx} y={cy + 22} textAnchor="middle" fontSize="8" fill="#1A2E4A" fontFamily="'Syne',sans-serif">BASELINE</text>
          </>
        ) : (
          <>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="42" fontWeight="700" fill={c} fontFamily="'JetBrains Mono',monospace" style={{ transition: 'fill 1s ease' }}>{score}</text>
            <text x={cx} y={cy + 19} textAnchor="middle" fontSize="7.5" fill="#2A4060" fontFamily="'Syne',sans-serif" letterSpacing="2.5">RISK INDEX</text>
            <text x={cx + 40} y={cy - 10} textAnchor="middle" fontSize="12" fill={trendCol} fontFamily="'JetBrains Mono',monospace">{trendIcon}</text>
          </>
        )}
        {/* Scale edge labels */}
        {[{ v: '0', d: START }, { v: '100', d: START + SWEEP }].map(({ v, d }) => {
          const pt = polar(cx, cy, r + 22, d)
          return <text key={v} x={pt.x} y={pt.y + 4} textAnchor="middle" fontSize="8" fill="#1A2E4A" fontFamily="'JetBrains Mono',monospace">{v}</text>
        })}
      </svg>

      {/* Status badge */}
      {phase === 'SCORING' && (
        <div className="text-[8px] font-display font-bold tracking-[1.5px] px-3 py-1 rounded"
          style={{ color: c, background: c + '18', border: `1px solid ${c}30` }}>
          {score >= 86 ? 'EMERGENCY' : score >= 72 ? 'CRITICAL' : score >= 50 ? 'WARNING' : 'NOMINAL'}
        </div>
      )}
    </div>
  )
}
