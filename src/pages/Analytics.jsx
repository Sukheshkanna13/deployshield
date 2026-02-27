import useStore from '@/store/useStore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts'

export default function Analytics() {
  const deployments = useStore(s => s.deployments)

  if (!deployments.length) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <p className="text-[10px] font-display text-muted">No analytics data yet.</p>
        <p className="text-[9px] font-mono text-dim mt-1">Run some deployments on the Dashboard to populate this view.</p>
      </div>
    </div>
  )

  const total    = deployments.length
  const flagged  = deployments.filter(d => d.status === 'FLAGGED').length
  const stable   = total - flagged
  const avgMax   = Math.round(deployments.reduce((a, d) => a + (d.maxScore || 0), 0) / total)
  const totalAlerts = deployments.reduce((a, d) => a + (d.alertCount || 0), 0)
  const avgDur   = Math.round(deployments.reduce((a, d) => a + (d.duration || 0), 0) / total / 1000)

  // Risk score bar data
  const barData = deployments.slice().reverse().map((d, i) => ({
    name: `D${i + 1}`,
    score: d.maxScore || 0,
    type: d.type,
    id: d.id.slice(-6),
  }))

  // Detection rate by service
  const byService = {}
  for (const d of deployments) {
    if (!byService[d.service]) byService[d.service] = { stable: 0, flagged: 0 }
    byService[d.service][d.status === 'FLAGGED' ? 'flagged' : 'stable']++
  }
  const svcData = Object.entries(byService).map(([k, v]) => ({ name: k.replace('-', '\n'), ...v }))

  const ttChart = { background: '#0A1828', border: '1px solid #1A3050', borderRadius: 4, fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: '#8AAFD0' }

  return (
    <div className="p-5 overflow-y-auto h-full">
      <h1 className="text-sm font-display font-bold text-frost mb-1">Analytics</h1>
      <p className="text-[9px] font-mono text-muted mb-5">Deployment health summary across {total} sessions</p>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total Runs',    val: total,       col: 'text-frost'  },
          { label: 'Flagged',       val: flagged,     col: 'text-danger' },
          { label: 'Stable',        val: stable,      col: 'text-ok'     },
          { label: 'Avg Max Risk',  val: avgMax,      col: avgMax >= 50 ? 'text-warn' : 'text-ok' },
          { label: 'Total Alerts',  val: totalAlerts, col: totalAlerts > 0 ? 'text-crit' : 'text-ok' },
        ].map(({ label, val, col }) => (
          <div key={label} className="bg-ink border border-edge rounded-xl p-3">
            <p className="text-[7px] font-display text-muted uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-mono font-bold ${col}`}>{val}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Max risk per deployment */}
        <div className="bg-ink border border-edge rounded-xl p-4">
          <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-3">Max Risk Score per Deployment</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#2A4060', fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false}/>
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#2A4060', fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={ttChart} formatter={v => [`${v}/100`]}/>
              <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell key={i} fill={d.score >= 72 ? '#EF4444' : d.score >= 50 ? '#EAB308' : '#22C55E'}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By service */}
        <div className="bg-ink border border-edge rounded-xl p-4">
          <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-3">Stable vs Flagged by Service</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={svcData}>
              <XAxis dataKey="name" tick={{ fontSize: 7, fill: '#2A4060', fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 8, fill: '#2A4060', fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={ttChart}/>
              <Bar dataKey="stable"  fill="#22C55E" name="Stable"  radius={[2, 2, 0, 0]}/>
              <Bar dataKey="flagged" fill="#EF4444" name="Flagged" radius={[2, 2, 0, 0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detection insight */}
      <div className="mt-4 bg-ink border border-edge rounded-xl p-4">
        <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-3">Detection Summary</p>
        <div className="grid grid-cols-3 gap-4 text-[9px] font-mono">
          <div><p className="text-dim mb-1">Detection Rate</p><p className="text-xl font-bold text-ok">{total ? Math.round((flagged / total) * 100) : 0}%</p><p className="text-[8px] text-muted">of faulty deploys caught</p></div>
          <div><p className="text-dim mb-1">Avg Session Length</p><p className="text-xl font-bold text-signal">{avgDur}s</p><p className="text-[8px] text-muted">per deployment session</p></div>
          <div><p className="text-dim mb-1">Alerts Fired</p><p className="text-xl font-bold text-warn">{totalAlerts}</p><p className="text-[8px] text-muted">across {total} sessions</p></div>
        </div>
      </div>
    </div>
  )
}
