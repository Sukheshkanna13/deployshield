import { useEffect, useState } from 'react'
import RiskGauge from '@/components/dashboard/RiskGauge'
import MetricGrid from '@/components/dashboard/MetricGrid'
import { AttributionBar, AlertFeed, AIPanel } from '@/components/dashboard/DashboardPanels'
import { useDeployment } from '@/hooks/useDeployment'
import { useRAG } from '@/hooks/useRAG'
import useStore from '@/store/useStore'

const FAILURES = ['downstream_fail', 'db_timeout', 'memory_leak', 'cpu_spike']
const FAIL_LABELS = { downstream_fail: 'Downstream Failure', db_timeout: 'DB Timeout', memory_leak: 'Memory Leak', cpu_spike: 'CPU Spike' }

export default function Dashboard() {
  useRAG() // initialise RAG pipeline once
  const { deploy, stopDeploy, manualAnalyze } = useDeployment()
  const session = useStore(s => s.session)
  const scoring = useStore(s => s.metrics.scoring)
  const settings = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)

  // Fetch registered projects from API
  const [projects, setProjects] = useState([])
  useEffect(() => {
    fetch('http://localhost:3001/api/projects')
      .then(r => r.json())
      .then(data => {
        setProjects(data)
        if (data.length > 0 && !settings.selectedService) {
          updateSettings({ selectedService: data[0].name, selectedApiKey: data[0].apiKey })
        }
      })
      .catch(err => console.error('[Dashboard] Failed to fetch projects:', err))
  }, [])

  // Elapsed timer display
  const elapsed = session ? Math.round((Date.now() - session.startTime) / 1000) : 0

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">

      {/* ── Row 1: Gauge + Attribution + AMD Stats ───────────────────── */}
      <div className="flex gap-3 flex-shrink-0">

        {/* Gauge */}
        <div className="bg-ink border border-edge rounded-xl p-3 w-[200px] flex-shrink-0 flex flex-col items-center"
          style={{ borderColor: scoring.score >= 72 ? '#EF444433' : '#0D1E35' }}>
          <Label>Risk Score</Label>
          <RiskGauge score={scoring.score} phase={scoring.phase} progress={scoring.progress} trend={scoring.trend} />
        </div>

        {/* Attribution */}
        <div className="bg-ink border border-edge rounded-xl p-3 flex-1">
          <Label>Causal Attribution · Z-Score Deviation from Baseline</Label>
          <AttributionBar />
        </div>

        {/* AMD Panel */}
        <div className="bg-ink border border-edge rounded-xl p-3 w-[160px] flex-shrink-0">
          <Label>AMD Hardware</Label>
          <div className="space-y-2.5 mt-1">
            {[
              { label: 'Inference', val: '12ms', sub: 'ROCm', note: '47ms CPU', c: '#22C55E' },
              { label: 'GPU Mem', val: '192GB', sub: 'HBM3', c: '#0EA5E9' },
              { label: 'Streams', val: '50+', sub: '/MI300X', c: '#A855F7' },
              { label: 'IF Trees', val: scoring.ifStats?.nTrees || 80, sub: 'built', c: '#F97316' },
            ].map(({ label, val, sub, note, c }) => (
              <div key={label}>
                <div className="text-[7px] font-display text-muted mb-0.5">{label}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-mono font-semibold" style={{ color: c }}>{val}</span>
                  <span className="text-[8px] font-mono text-muted">{sub}</span>
                  {note && <span className="text-[7px] text-dim">{note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: 4 Metric Charts ───────────────────────────────────── */}
      <div className="flex-shrink-0">
        <MetricGrid />
      </div>

      {/* ── Row 3: AI Panel + Alert Feed ────────────────────────────── */}
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="flex-1 min-h-0">
          <AIPanel onAnalyze={manualAnalyze} />
        </div>
        <div className="w-[260px] flex-shrink-0 bg-ink border border-edge rounded-xl p-3 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-2 flex-shrink-0">
            <Label>Alert Log</Label>
            <span className="text-[8px] font-mono text-muted">{useStore.getState().alerts.length} fired</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <AlertFeed />
          </div>
        </div>
      </div>

      {/* ── Bottom Controls ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-t border-edge pt-2.5 flex-shrink-0" style={{ position: 'relative', zIndex: 10 }}>
        <div className="flex gap-2 items-center">
          {/* Service selector — dynamically populated from registered projects */}
          <select value={settings.selectedService}
            onChange={e => {
              const proj = projects.find(p => p.name === e.target.value)
              updateSettings({ selectedService: e.target.value, selectedApiKey: proj?.apiKey || 'test-api-key' })
            }}
            disabled={!!session}
            className="bg-surface text-ghost text-[9px] font-mono border border-edge rounded px-2 py-1.5 disabled:opacity-40">
            {projects.length > 0
              ? projects.map(p => <option key={p.id} value={p.name}>{p.name} {p.sourceType === 'vercel' ? '▲' : '🔥'}</option>)
              : <option value="api-gateway">api-gateway (default)</option>
            }
          </select>

          {/* Failure mode selector */}
          <select value={settings.selectedFailure}
            onChange={e => updateSettings({ selectedFailure: e.target.value })}
            disabled={!!session}
            className="bg-surface text-ghost text-[9px] font-mono border border-edge rounded px-2 py-1.5 disabled:opacity-40">
            {FAILURES.map(f => <option key={f} value={f}>{FAIL_LABELS[f]}</option>)}
          </select>

          <Btn label="▶ Start Monitoring" disabled={!!session} onClick={() => deploy('NORMAL', settings.selectedService, settings.selectedFailure)} color="#22C55E" />
          <Btn label="⚠ Inject Fault" disabled={!!session} onClick={() => deploy('DEGRADED', settings.selectedService, settings.selectedFailure)} color="#EF4444" />
        </div>

        <div className="flex items-center gap-4">
          {session && (
            <div className="flex gap-2 text-[8px] font-mono text-dim">
              <span>⏱ {Math.round((Date.now() - session.startTime) / 1000)}s</span>
              <span>·</span>
              <span>phase: {scoring.phase}</span>
              {scoring.phase === 'LEARNING' && <span>·</span>}
              {scoring.phase === 'LEARNING' && <span>{Math.round((scoring.progress || 0) * 100)}%</span>}
            </div>
          )}
          <Btn label="■ End Session" disabled={!session} onClick={stopDeploy} color="#4A7090" />
        </div>

        <div className="text-[7px] font-mono text-muted text-right">
          <div>IsolationForest · 80 trees · 128 samples · EWMA α=0.32</div>
          <div>RAG · 12-dim fingerprint · cosine similarity · Claude Sonnet</div>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <p className="text-[8px] font-display text-muted tracking-[2px] uppercase mb-2">{children}</p>
}

function Btn({ label, onClick, disabled, color }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-3 py-1.5 rounded text-[9px] font-display font-bold tracking-wide transition-all"
      style={{
        color: disabled ? '#1A2E4A' : color,
        border: `1px solid ${disabled ? '#0D1E35' : color + '80'}`,
        background: disabled ? 'transparent' : color + '15',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}>
      {label}
    </button>
  )
}
