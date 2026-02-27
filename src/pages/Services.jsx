/* Services Page */
import useStore from '@/store/useStore'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const SERVICES = [
  { name: 'api-gateway',     desc: 'Public-facing REST gateway',          baseline: { rate: 1240, errorRate: 0.75, p99: 172, saturation: 40 } },
  { name: 'payment-svc',     desc: 'Transaction processing + Stripe',     baseline: { rate: 340,  errorRate: 0.42, p99: 89,  saturation: 28 } },
  { name: 'auth-svc',        desc: 'JWT auth + OAuth2 provider',          baseline: { rate: 890,  errorRate: 0.31, p99: 54,  saturation: 35 } },
  { name: 'order-processor', desc: 'Async order queue + DB writes',       baseline: { rate: 180,  errorRate: 1.1,  p99: 340, saturation: 55 } },
]

export function Services() {
  const deployments = useStore(s => s.deployments)

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h1 className="text-sm font-display font-bold text-frost mb-1">Service Catalog</h1>
      <p className="text-[9px] font-mono text-muted mb-6">Baseline profiles for Isolation Forest training per service</p>

      <div className="grid grid-cols-2 gap-4">
        {SERVICES.map(svc => {
          const runs = deployments.filter(d => d.service === svc.name)
          const incidents = runs.filter(d => d.status === 'FLAGGED').length
          const data = Object.entries(svc.baseline).map(([k, v]) => ({ k, v }))
          const COLORS = { rate: '#0EA5E9', errorRate: '#EF4444', p99: '#F97316', saturation: '#A855F7' }

          return (
            <div key={svc.name} className="bg-ink border border-edge rounded-xl p-4">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-cloud">{svc.name}</span>
                <span className={`text-[7px] font-display font-bold px-1.5 py-0.5 rounded ${incidents > 0 ? 'text-danger bg-danger/10' : 'text-ok bg-ok/10'}`}>
                  {incidents > 0 ? `${incidents} INCIDENT${incidents > 1 ? 'S' : ''}` : 'CLEAN'}
                </span>
              </div>
              <p className="text-[8px] font-display text-muted mb-3">{svc.desc}</p>

              <p className="text-[7px] font-display text-dim uppercase tracking-widest mb-2">Baseline Profile</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {Object.entries(svc.baseline).map(([k, v]) => (
                  <div key={k} className="bg-surface rounded p-1.5">
                    <p className="text-[7px] font-display text-muted capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-[10px] font-mono font-semibold text-ghost">{v}</p>
                  </div>
                ))}
              </div>

              <p className="text-[7px] font-display text-dim uppercase tracking-widest mb-2">Run History</p>
              <div className="flex gap-3 text-[8px] font-mono">
                <span className="text-ghost">{runs.length} runs</span>
                <span className="text-ok">{runs.length - incidents} stable</span>
                <span className="text-danger">{incidents} flagged</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-ink border border-edge rounded-xl p-4">
        <p className="text-[8px] font-display text-muted uppercase tracking-widest mb-3">ML Model Architecture</p>
        <div className="grid grid-cols-3 gap-4 text-[9px] font-mono">
          <ModelCard label="Isolation Forest" detail="80 trees · 128 subsample · depth 7" status="Per session · in-browser" />
          <ModelCard label="EWMA Trend Scorer" detail="α=0.32 · 15s update interval" status="Always active during session" />
          <ModelCard label="RAG Knowledge Base" detail="12-dim fingerprint · cosine similarity" status="12 AIOPS incidents indexed" />
        </div>
      </div>
    </div>
  )
}

function ModelCard({ label, detail, status }) {
  return (
    <div className="bg-surface rounded-lg p-3">
      <p className="text-[8px] font-display text-cloud mb-1">{label}</p>
      <p className="text-[8px] font-mono text-ghost mb-1">{detail}</p>
      <p className="text-[7px] font-display text-ok">{status}</p>
    </div>
  )
}

export default Services
