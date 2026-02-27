import useStore from '@/store/useStore'
import { format } from 'date-fns'

export default function TopBar() {
  const session    = useStore(s => s.session)
  const ragStatus  = useStore(s => s.ragStatus)
  const scoring    = useStore(s => s.metrics.scoring)

  return (
    <header className="h-10 bg-void border-b border-edge flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-display font-bold text-frost tracking-tight">🛡 DeployShield</span>
        <span className="text-[8px] font-mono text-signal bg-surface px-1.5 py-0.5 rounded border border-edge">AI</span>
        <span className="text-[8px] font-display text-muted">Real-Time Deployment Protection · AMD Instinct + ROCm</span>
      </div>

      <div className="flex items-center gap-3">
        {/* RAG status */}
        <Chip label="RAG" value={ragStatus.initialized ? `${ragStatus.totalIncidents} incidents` : 'loading...'} col={ragStatus.initialized ? 'text-ok' : 'text-muted'} />
        {/* IF status */}
        <Chip label="IF" value={scoring.phase === 'SCORING' ? `${scoring.ifStats?.nTrees || 80}T·${scoring.ifStats?.subsampleSize || 128}S` : scoring.phase} col={scoring.phase === 'SCORING' ? 'text-signal' : 'text-muted'} />
        {/* Active session */}
        {session && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface rounded border border-edge">
            <div className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            <span className="text-[9px] font-mono text-signal">{session.id.slice(-10)}</span>
            <span className={`text-[8px] font-display font-bold ${session.type === 'DEGRADED' ? 'text-danger' : 'text-ok'}`}>
              {session.type === 'DEGRADED' ? 'FAULTY' : 'GOOD'}
            </span>
          </div>
        )}
        <span className="text-[8px] font-mono text-muted">{format(new Date(), 'HH:mm:ss')}</span>
      </div>
    </header>
  )
}

function Chip({ label, value, col }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface rounded border border-edge">
      <span className="text-[8px] font-display text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-[8px] font-mono ${col}`}>{value}</span>
    </div>
  )
}
