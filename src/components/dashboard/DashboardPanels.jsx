import useStore from '@/store/useStore'

/* ── AttributionBar ─────────────────────────────────────────────────────── */
export function AttributionBar() {
  const attrs = useStore(s => s.metrics.attrs)
  if (!attrs.length) return (
    <div className="text-[9px] font-display text-muted text-center py-4">Awaiting baseline training...</div>
  )
  const maxZ = Math.max(...attrs.map(a => a.z), 0.001)
  const sevColor = { critical: '#EF4444', warning: '#F97316', elevated: '#EAB308', normal: '#22C55E' }

  return (
    <div className="space-y-2.5">
      {attrs.map((a, i) => {
        const c = sevColor[a.severity] || '#4A7090'
        return (
          <div key={a.key}>
            <div className="flex justify-between mb-1">
              <span className="text-[8px] font-display tracking-wide uppercase"
                style={{ color: i === 0 && a.severity !== 'normal' ? c : '#2A4060' }}>{a.label}</span>
              <span className="text-[8px] font-mono"
                style={{ color: i === 0 && a.severity !== 'normal' ? c : '#2A4060' }}>
                {a.pct > 0 ? '+' : ''}{a.pct}% · Z={a.z}
              </span>
            </div>
            <div className="h-[3px] bg-surface rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(a.z / maxZ) * 100}%`,
                  background: c,
                  boxShadow: a.severity === 'critical' ? `0 0 8px ${c}` : 'none',
                }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── AlertFeed ──────────────────────────────────────────────────────────── */
const SEV_ICON  = { WARNING: '⚠', CRITICAL: '●', EMERGENCY: '⬟' }
const SEV_COLOR = { WARNING: '#EAB308', CRITICAL: '#F97316', EMERGENCY: '#EF4444' }

export function AlertFeed() {
  const alerts = useStore(s => s.alerts)
  if (!alerts.length) return (
    <div className="text-[8px] font-display text-muted tracking-widest text-center py-3">NO ALERTS · NOMINAL</div>
  )
  return (
    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
      {alerts.slice(0, 8).map(a => {
        const c = SEV_COLOR[a.sev]
        return (
          <div key={a.id} className="flex gap-2 p-2 bg-void rounded border-l-2 animate-[slideUp_0.25s_ease]"
            style={{ borderColor: c }}>
            <span style={{ color: c }} className="text-[10px] mt-0.5 flex-shrink-0">{SEV_ICON[a.sev]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2 mb-0.5">
                <span className="text-[8px] font-display font-bold" style={{ color: c }}>{a.sev}</span>
                <span className="text-[7px] font-mono text-muted">{a.ts.toLocaleTimeString()}</span>
              </div>
              <p className="text-[8px] font-mono text-dim truncate">{a.message}</p>
              {a.action && <p className="text-[7px] font-display text-muted mt-0.5 truncate">{a.action}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── AIPanel ────────────────────────────────────────────────────────────── */
export function AIPanel({ onAnalyze }) {
  const ai    = useStore(s => s.ai)
  const score = useStore(s => s.metrics.scoring.score)

  const renderText = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <span key={i} className="block text-[8px] font-display font-bold text-signal tracking-[2px] uppercase mt-3 mb-1 first:mt-0">{p.slice(2, -2)}</span>
        : <span key={i} className="text-[9.5px] font-mono text-ghost leading-relaxed">{p}</span>
    )
  }

  return (
    <div className="bg-void border border-edge rounded-lg p-3 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${ai.loading ? 'bg-signal animate-pulse' : 'bg-muted'}`}/>
          <span className="text-[8px] font-display text-muted tracking-[2px] uppercase">Claude · Causal Analysis</span>
          {ai.retrieved?.length > 0 && (
            <span className="text-[7px] font-mono text-ok bg-surface px-1 py-0.5 rounded">
              RAG: {ai.retrieved.length} incidents
            </span>
          )}
        </div>
        <button onClick={onAnalyze} disabled={ai.loading || score < 5}
          className="text-[8px] font-display font-bold tracking-wide px-2.5 py-1 rounded transition-all"
          style={{
            color:  ai.loading || score < 5 ? '#1A2E4A' : '#0EA5E9',
            border: `1px solid ${ai.loading || score < 5 ? '#0D1E35' : '#0EA5E9'}`,
            background: ai.loading || score < 5 ? 'transparent' : '#0A2540',
            cursor: ai.loading || score < 5 ? 'not-allowed' : 'pointer',
          }}>
          {ai.loading ? 'ANALYZING...' : 'ANALYZE'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {ai.error && <p className="text-[9px] font-mono text-danger">{ai.error}</p>}
        {!ai.text && !ai.loading && (
          <p className="text-[9px] font-display text-muted text-center pt-4">
            {score >= 5 ? 'Click ANALYZE to diagnose the anomaly with RAG context' : 'Deploy a release to begin monitoring'}
          </p>
        )}
        {ai.text && <div>{renderText(ai.text)}{ai.loading && <span className="ai-cursor"/>}</div>}
        {!ai.text && ai.loading && <span className="ai-cursor text-signal"/>}
      </div>

      {/* RAG retrieved incidents */}
      {ai.retrieved?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-edge flex-shrink-0">
          <p className="text-[7px] font-display text-muted uppercase tracking-widest mb-1.5">Retrieved incidents</p>
          <div className="space-y-1">
            {ai.retrieved.map(r => (
              <div key={r.id} className="flex justify-between items-center text-[8px] font-mono">
                <span className="text-dim">{r.metadata.id}</span>
                <span className="text-ok">{(r.similarity * 100).toFixed(0)}% match</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
