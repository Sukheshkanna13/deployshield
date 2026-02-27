import { useState } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import useStore from '@/store/useStore'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

const SEV_COL = { STABLE: '#22C55E', FLAGGED: '#EF4444' }

export default function Deployments() {
  const deployments = useStore(s => s.deployments)
  const clearDeployments = useStore(s => s.clearDeployments)
  const [selected, setSelected] = useState(null)

  const sel = deployments.find(d => d.id === selected)

  return (
    <div className="h-full flex overflow-hidden">
      {/* Table */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-sm font-display font-bold text-frost">Deployment History</h1>
            <p className="text-[9px] font-mono text-muted mt-0.5">{deployments.length} sessions recorded this run</p>
          </div>
          {deployments.length > 0 && (
            <button onClick={clearDeployments}
              className="text-[9px] font-display text-muted hover:text-cloud border border-edge px-2 py-1 rounded">
              Clear All
            </button>
          )}
        </div>

        {deployments.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[10px] font-display text-muted">No deployments recorded yet.</p>
              <p className="text-[9px] font-mono text-dim mt-1">Go to Dashboard and trigger a release.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Header */}
            <div className="grid grid-cols-6 gap-3 px-3 py-2 text-[8px] font-display text-muted uppercase tracking-widest border-b border-edge">
              <span>ID</span><span>Service</span><span>Type</span>
              <span>Status</span><span>Max Risk</span><span>Duration</span>
            </div>
            {/* Rows */}
            {deployments.map(d => {
              const dur = d.endTime ? Math.round((d.endTime - d.startTime) / 1000) : null
              return (
                <div key={d.id} onClick={() => setSelected(d.id === selected ? null : d.id)}
                  className="grid grid-cols-6 gap-3 px-3 py-2.5 border-b border-edge cursor-pointer hover:bg-surface/30 transition-colors"
                  style={{ background: selected === d.id ? '#0A1828' : undefined }}>
                  <span className="text-[9px] font-mono text-ghost">{d.id.slice(-10)}</span>
                  <span className="text-[9px] font-mono text-cloud">{d.service}</span>
                  <span className={`text-[8px] font-display font-bold ${d.type === 'DEGRADED' ? 'text-danger' : 'text-ok'}`}>
                    {d.type === 'DEGRADED' ? 'FAULTY' : 'GOOD'}
                  </span>
                  <span className="text-[8px] font-display font-bold" style={{ color: SEV_COL[d.status] || '#4A7090' }}>
                    {d.status}
                  </span>
                  <span className="text-[9px] font-mono" style={{ color: d.maxScore >= 72 ? '#EF4444' : d.maxScore >= 50 ? '#EAB308' : '#22C55E' }}>
                    {d.maxScore}
                  </span>
                  <span className="text-[9px] font-mono text-dim">{dur ? `${dur}s` : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {sel && (
        <div className="w-[280px] border-l border-edge bg-ink p-4 overflow-y-auto flex-shrink-0">
          <p className="text-[8px] font-display text-muted tracking-widest uppercase mb-3">Deployment Detail</p>
          <p className="text-[9px] font-mono text-ghost mb-4">{sel.id}</p>

          <DetailRow label="Service" value={sel.service} />
          <DetailRow label="Type" value={sel.type === 'DEGRADED' ? '⚠ FAULTY' : '✓ GOOD'} col={sel.type === 'DEGRADED' ? 'text-danger' : 'text-ok'} />
          <DetailRow label="Status" value={sel.status} col={SEV_COL[sel.status] ? undefined : undefined} />
          <DetailRow label="Max Risk" value={sel.maxScore} />
          <DetailRow label="Final Score" value={sel.finalScore} />
          <DetailRow label="Alerts" value={sel.alertCount} />
          <DetailRow label="Duration" value={sel.endTime ? `${Math.round((sel.endTime - sel.startTime) / 1000)}s` : 'n/a'} />
          <DetailRow label="Failure Mode" value={sel.failureMode?.replace('_', ' ')} />
          <DetailRow label="Started" value={format(new Date(sel.startTime), 'HH:mm:ss')} />

          {sel.scoreHistory?.length > 0 && (
            <div className="mt-4">
              <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-2">Score Trajectory</p>
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={sel.scoreHistory.map((s, i) => ({ s, i }))}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="s" stroke="#EF4444" strokeWidth={1.5} fill="url(#sg)" dot={false} isAnimationActive={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, col }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-edge">
      <span className="text-[8px] font-display text-muted">{label}</span>
      <span className={`text-[9px] font-mono ${col || 'text-ghost'}`}>{value ?? '—'}</span>
    </div>
  )
}
