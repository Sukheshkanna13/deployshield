/* Services Page — Dynamic Project Management */
import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:3001/api/projects'

export function Services() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [testResults, setTestResults] = useState({})
  const [copiedKey, setCopiedKey] = useState(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    sourceType: 'vercel',
    url: '',
    healthCheckPath: '',
    vercelToken: '',
    slackWebhookUrl: ''
  })

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(API)
      const data = await res.json()
      setProjects(data)
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const createProject = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) {
        setForm({ name: '', sourceType: 'vercel', url: '', healthCheckPath: '', vercelToken: '', slackWebhookUrl: '' })
        setShowForm(false)
        fetchProjects()
      }
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const deleteProject = async (id) => {
    if (!confirm('Remove this service?')) return
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' })
      fetchProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  const testConnection = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: { testing: true } }))
    try {
      const res = await fetch(`${API}/${id}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResults(prev => ({ ...prev, [id]: data }))
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { connected: false, error: err.message } }))
    }
  }

  const copyKey = (key) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-sm font-display font-bold text-frost mb-1">Service Catalog</h1>
          <p className="text-[9px] font-mono text-muted">Register your Vercel apps or Prometheus endpoints for real-time monitoring</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-[10px] font-display font-bold tracking-wide transition-all"
          style={{
            color: showForm ? '#94A3B8' : '#22C55E',
            border: `1px solid ${showForm ? '#1E3A5F40' : '#22C55E50'}`,
            background: showForm ? 'transparent' : '#22C55E15'
          }}>
          {showForm ? '✕ Cancel' : '➕ Add Service'}
        </button>
      </div>

      {/* ── Add Service Form ──────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={createProject} className="bg-ink border border-edge rounded-xl p-5 mb-6">
          <p className="text-[8px] font-display text-signal uppercase tracking-[2px] mb-4">New Service Registration</p>

          {/* Source Type Toggle */}
          <div className="flex gap-2 mb-4">
            {[
              { type: 'vercel', label: '▲ Vercel App', color: '#fff' },
              { type: 'prometheus', label: '🔥 Prometheus', color: '#E6522C' }
            ].map(({ type, label, color }) => (
              <button key={type} type="button"
                onClick={() => setForm({ ...form, sourceType: type })}
                className="px-4 py-2 rounded text-[9px] font-display font-bold tracking-wide transition-all"
                style={{
                  color: form.sourceType === type ? color : '#4A7090',
                  border: `1px solid ${form.sourceType === type ? color + '60' : '#1E3A5F40'}`,
                  background: form.sourceType === type ? color + '10' : 'transparent'
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="mb-3">
            <label className="text-[8px] font-display text-muted block mb-1">Service Name</label>
            <input type="text" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. my-vercel-app"
              className="w-full bg-surface border border-edge rounded px-3 py-2 text-[10px] font-mono text-ghost focus:border-signal focus:outline-none" />
          </div>

          {/* URL */}
          <div className="mb-3">
            <label className="text-[8px] font-display text-muted block mb-1">
              {form.sourceType === 'vercel' ? 'Deployed URL' : 'Prometheus / Metrics URL'}
            </label>
            <input type="text" required value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder={form.sourceType === 'vercel' ? 'https://myapp.vercel.app' : 'http://localhost:4000'}
              className="w-full bg-surface border border-edge rounded px-3 py-2 text-[10px] font-mono text-ghost focus:border-signal focus:outline-none" />
          </div>

          {/* Vercel-specific: Health Check Path */}
          {form.sourceType === 'vercel' && (
            <div className="mb-3">
              <label className="text-[8px] font-display text-muted block mb-1">Health Check Path (optional)</label>
              <input type="text" value={form.healthCheckPath}
                onChange={e => setForm({ ...form, healthCheckPath: e.target.value })}
                placeholder="/api/health"
                className="w-full bg-surface border border-edge rounded px-3 py-2 text-[10px] font-mono text-ghost focus:border-signal focus:outline-none" />
              <p className="text-[7px] font-mono text-dim mt-1">API route to probe for latency. Leave empty to probe the root URL.</p>
            </div>
          )}

          {/* Slack Webhook */}
          <div className="mb-4">
            <label className="text-[8px] font-display text-muted block mb-1">Slack Webhook (optional)</label>
            <input type="text" value={form.slackWebhookUrl}
              onChange={e => setForm({ ...form, slackWebhookUrl: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full bg-surface border border-edge rounded px-3 py-2 text-[10px] font-mono text-ghost focus:border-signal focus:outline-none" />
          </div>

          <button type="submit"
            className="px-5 py-2 rounded text-[9px] font-display font-bold tracking-wide transition-all"
            style={{ color: '#22C55E', border: '1px solid #22C55E50', background: '#22C55E15' }}>
            ✓ Register Service
          </button>
        </form>
      )}

      {/* ── Project List ──────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-[9px] font-mono text-muted">Loading services...</p>
      ) : projects.length === 0 && !showForm ? (
        <div className="bg-ink border border-edge border-dashed rounded-xl p-8 text-center">
          <p className="text-[11px] font-display text-muted mb-2">No services registered yet</p>
          <p className="text-[8px] font-mono text-dim mb-4">Add a Vercel app or Prometheus endpoint to start monitoring</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded text-[9px] font-display font-bold text-signal border border-signal/50 bg-signal/10 hover:bg-signal/20 transition-all">
            ➕ Add Your First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {projects.map(project => {
            const test = testResults[project.id]
            const lastDeploy = project.deployments?.[0]

            return (
              <div key={project.id} className="bg-ink border border-edge rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono font-semibold text-cloud">{project.name}</span>
                      <span className={`text-[7px] font-display font-bold px-1.5 py-0.5 rounded ${project.sourceType === 'vercel'
                          ? 'text-white bg-white/10 border border-white/20'
                          : 'text-orange-400 bg-orange-400/10 border border-orange-400/20'
                        }`}>
                        {project.sourceType === 'vercel' ? '▲ VERCEL' : '🔥 PROMETHEUS'}
                      </span>
                    </div>
                    <p className="text-[8px] font-mono text-muted">{project.prometheusUrl}</p>
                    {project.healthCheckPath && (
                      <p className="text-[7px] font-mono text-dim">Health: {project.healthCheckPath}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => testConnection(project.id)}
                      className="px-3 py-1 rounded text-[8px] font-display font-bold text-signal border border-signal/40 hover:bg-signal/10 transition-all">
                      {test?.testing ? '⏳ Testing...' : '⚡ Test'}
                    </button>
                    <button onClick={() => deleteProject(project.id)}
                      className="px-2 py-1 rounded text-[8px] font-display text-dim hover:text-danger border border-edge hover:border-danger/40 transition-all">
                      ✕
                    </button>
                  </div>
                </div>

                {/* Test Result */}
                {test && !test.testing && (
                  <div className={`rounded p-2 mb-3 text-[8px] font-mono ${test.connected ? 'bg-ok/5 border border-ok/20' : 'bg-danger/5 border border-danger/20'
                    }`}>
                    {test.connected ? (
                      <span className="text-ok">✓ Connected · {test.status} {test.statusText} · {test.latency}ms
                        {test.metricsDetected && ' · Prometheus metrics detected'}
                      </span>
                    ) : (
                      <span className="text-danger">✕ {test.error || 'Connection failed'}</span>
                    )}
                  </div>
                )}

                {/* API Key + Snippet */}
                <div className="bg-surface rounded p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[7px] font-display text-muted uppercase tracking-widest">API Key</span>
                    <button onClick={() => copyKey(project.apiKey)}
                      className="text-[7px] font-mono text-signal hover:text-frost transition-colors">
                      {copiedKey === project.apiKey ? '✓ Copied!' : '📋 Copy'}
                    </button>
                  </div>
                  <code className="text-[9px] font-mono text-ghost block break-all">{project.apiKey}</code>
                </div>

                {/* CI/CD Snippet */}
                <details className="group">
                  <summary className="text-[8px] font-display text-dim cursor-pointer hover:text-muted transition-colors">
                    📦 CI/CD Integration Snippet
                  </summary>
                  <div className="mt-2 bg-surface rounded p-3">
                    <code className="text-[8px] font-mono text-ghost block whitespace-pre-wrap">{
                      `# Add to your CI/CD pipeline (GitHub Actions, etc.)
curl -X POST http://localhost:3001/api/webhook/deploy \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${project.apiKey}" \\
  -d '{"service":"${project.name}","environment":"production"}'`
                    }</code>
                  </div>
                </details>

                {/* Last Session Info */}
                {lastDeploy && (
                  <div className="mt-3 flex gap-3 text-[7px] font-mono text-dim">
                    <span>Last: {new Date(lastDeploy.startTime).toLocaleString()}</span>
                    <span>Status: <span className={lastDeploy.status === 'ACTIVE' ? 'text-ok' : 'text-muted'}>{lastDeploy.status}</span></span>
                    {lastDeploy.maxRiskScore != null && <span>Peak Risk: <span className="text-warn">{lastDeploy.maxRiskScore}</span></span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Architecture Info ─────────────────────────────────────────── */}
      <div className="mt-6 bg-ink border border-edge rounded-xl p-4">
        <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-3">Monitoring Pipeline</p>
        <div className="grid grid-cols-3 gap-4 text-[9px] font-mono">
          <PipelineCard label="Data Source" detail="Vercel HTTP Probe · Prometheus /metrics" status="Auto-detected per service" />
          <PipelineCard label="Anomaly Detection" detail="IsolationForest · 80 trees · EWMA α=0.32" status="Trains on first 6 ticks (30s)" />
          <PipelineCard label="AI Analysis" detail="Claude Sonnet · RAG with 12 AIOPS incidents" status="Auto-triggers on CRITICAL alerts" />
        </div>
      </div>
    </div>
  )
}

function PipelineCard({ label, detail, status }) {
  return (
    <div className="bg-surface rounded-lg p-3">
      <p className="text-[8px] font-display text-cloud mb-1">{label}</p>
      <p className="text-[8px] font-mono text-ghost mb-1">{detail}</p>
      <p className="text-[7px] font-display text-ok">{status}</p>
    </div>
  )
}

export default Services
