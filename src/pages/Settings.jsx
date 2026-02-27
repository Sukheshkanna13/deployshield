import { useState } from 'react'
import useStore from '@/store/useStore'
import { globalRateLimiter } from '@/ai/RateLimiter'

export default function Settings() {
  const settings       = useStore(s => s.settings)
  const ragStatus      = useStore(s => s.ragStatus)
  const updateSettings = useStore(s => s.updateSettings)
  const updateThresh   = useStore(s => s.updateThresholds)
  const [rlStatus, setRlStatus]  = useState(null)
  const [saved, setSaved] = useState(false)

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 overflow-y-auto h-full max-w-2xl">
      <h1 className="text-sm font-display font-bold text-frost mb-1">Settings</h1>
      <p className="text-[9px] font-mono text-muted mb-6">Configure thresholds, API keys, and pipeline behaviour</p>

      {/* API Key */}
      <Section title="Anthropic API">
        <p className="text-[8px] font-display text-muted mb-2">
          Your API key is used for Claude causal analysis and is never stored beyond this session.
          Set VITE_ANTHROPIC_API_KEY in .env.local for production use.
        </p>
        <input type="password" placeholder="sk-ant-..." value={settings.apiKey}
          onChange={e => updateSettings({ apiKey: e.target.value })}
          className="w-full bg-surface border border-edge rounded px-3 py-2 text-[9px] font-mono text-ghost focus:border-signal focus:outline-none"
        />
        <p className="text-[7px] font-mono text-muted mt-1">
          In production: proxy through a backend route. Never expose in client bundle.
        </p>
      </Section>

      {/* Alert Thresholds */}
      <Section title="Alert Thresholds">
        {[
          { key: 'warning',   label: 'WARNING threshold',   col: '#EAB308', desc: 'Score sustained ≥ this for 3 ticks' },
          { key: 'critical',  label: 'CRITICAL threshold',  col: '#F97316', desc: 'Immediate page. Auto-analysis fires.' },
          { key: 'emergency', label: 'EMERGENCY threshold', col: '#EF4444', desc: 'Automated rollback trigger (v2).' },
        ].map(({ key, label, col, desc }) => (
          <div key={key} className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[8px] font-display font-bold" style={{ color: col }}>{label}</label>
              <span className="text-xs font-mono font-bold" style={{ color: col }}>{settings.thresholds[key]}</span>
            </div>
            <input type="range" min={30} max={99} value={settings.thresholds[key]}
              onChange={e => updateThresh({ [key]: Number(e.target.value) })}
              className="w-full accent-signal"
            />
            <p className="text-[7px] font-mono text-dim mt-0.5">{desc}</p>
          </div>
        ))}
      </Section>

      {/* Engine Config */}
      <Section title="Engine Configuration">
        <div className="space-y-3">
          <ConfigRow label="Baseline ticks needed" desc="Ticks before Isolation Forest trains">
            <span className="text-[9px] font-mono text-ghost">{settings.baselineTicks} ({settings.baselineTicks * 5}s)</span>
          </ConfigRow>
          <ConfigRow label="Metric tick interval" desc="How often metrics are collected">
            <span className="text-[9px] font-mono text-ghost">{settings.tickIntervalMs / 1000}s</span>
          </ConfigRow>
          <ConfigRow label="Score interval" desc="How often risk score is updated">
            <span className="text-[9px] font-mono text-ghost">{settings.tickIntervalMs * 3 / 1000}s (every 3 ticks)</span>
          </ConfigRow>
          <ConfigRow label="Auto-analyze on CRITICAL" desc="Automatically call Claude when CRITICAL fires">
            <button onClick={() => updateSettings({ autoAnalyze: !settings.autoAnalyze })}
              className={`px-3 py-1 rounded text-[8px] font-display font-bold border ${settings.autoAnalyze ? 'text-ok border-ok/50 bg-ok/10' : 'text-muted border-edge'}`}>
              {settings.autoAnalyze ? 'ENABLED' : 'DISABLED'}
            </button>
          </ConfigRow>
        </div>
      </Section>

      {/* Rate Limiter Status */}
      <Section title="Rate Limiter (Token Bucket)">
        <p className="text-[8px] font-display text-muted mb-3">
          Anthropic API calls are rate limited to 5 requests/minute with a 10s minimum gap.
          This prevents hitting API limits during live demos.
        </p>
        <button onClick={() => setRlStatus(globalRateLimiter.getStatus())}
          className="text-[9px] font-display text-signal border border-signal/50 px-3 py-1.5 rounded hover:bg-signal/10 transition-colors">
          Check Rate Limiter Status
        </button>
        {rlStatus && (
          <div className="mt-3 bg-surface rounded p-3 font-mono text-[8px] space-y-1">
            <p className="text-ghost">Tokens: <span className="text-ok">{rlStatus.tokens}/{rlStatus.maxTokens}</span></p>
            <p className="text-ghost">Queue: <span className="text-signal">{rlStatus.queueDepth} requests</span></p>
            <p className="text-ghost">In Flight: <span className={rlStatus.inFlight ? 'text-warn' : 'text-ok'}>{rlStatus.inFlight ? 'YES' : 'NO'}</span></p>
            <p className="text-ghost">Next Token In: <span className="text-ghost">{(rlStatus.msUntilNextToken / 1000).toFixed(1)}s</span></p>
          </div>
        )}
      </Section>

      {/* RAG Status */}
      <Section title="RAG Pipeline">
        <div className="space-y-2">
          <ConfigRow label="Status" desc="Vector store initialization">
            <span className={`text-[9px] font-mono ${ragStatus.initialized ? 'text-ok' : 'text-warn'}`}>
              {ragStatus.initialized ? 'INITIALIZED' : 'LOADING'}
            </span>
          </ConfigRow>
          <ConfigRow label="Knowledge Base" desc="AIOPS incidents indexed">
            <span className="text-[9px] font-mono text-ghost">{ragStatus.totalIncidents} incidents</span>
          </ConfigRow>
          <ConfigRow label="Embedding" desc="Vector encoding method">
            <span className="text-[9px] font-mono text-ghost">12-dim Z-score fingerprint</span>
          </ConfigRow>
          <ConfigRow label="Similarity" desc="Retrieval algorithm">
            <span className="text-[9px] font-mono text-ghost">Cosine similarity · top-3 results</span>
          </ConfigRow>
        </div>
      </Section>

      <button onClick={save}
        className="mt-2 px-6 py-2 bg-signal/20 text-signal border border-signal/50 rounded font-display text-[9px] font-bold tracking-wide hover:bg-signal/30 transition-colors">
        {saved ? '✓ SAVED' : 'SAVE SETTINGS'}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6 bg-ink border border-edge rounded-xl p-4">
      <p className="text-[8px] font-display text-signal uppercase tracking-[2px] mb-3">{title}</p>
      {children}
    </div>
  )
}

function ConfigRow({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[9px] font-display text-ghost">{label}</p>
        <p className="text-[7px] font-mono text-muted">{desc}</p>
      </div>
      {children}
    </div>
  )
}
