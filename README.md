# 🛡 DeployShield AI

**Real-Time Deployment Protection — AMD Instinct + ROCm + Claude RAG**

## What's Real in This Prototype

| Component | Implementation |
|---|---|
| **Isolation Forest** | Full Liu-Ting-Zhou 2008 algorithm. 80 trees, 128 subsample, depth 7. |
| **EWMA Trend Scorer** | α=0.32 exponential weighted moving average, 15s update cycle. |
| **Z-score Attribution** | Per-metric causal attribution. Identifies primary anomaly driver. |
| **RAG Pipeline** | 12-dim metric fingerprint, cosine similarity over 12 AIOPS incidents. |
| **Claude Analysis** | Live streaming Claude Sonnet API call with real metric + RAG context. |
| **Rate Limiter** | Token bucket algorithm. 5 req/min, 10s min gap. Prevents API abuse. |
| **Alert Engine** | Three-tier threshold system with hysteresis (no alert spam). |
| **MetricEngine** | AR(1) autoregressive process, Box-Muller Gaussian noise. |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set API key
cp .env.example .env.local
# Edit .env.local — add your Anthropic API key

# 3. Run dev server
npm run dev

# 4. Open http://localhost:5173
```

## Pages

- **Dashboard** — Live monitoring, risk gauge, 4 metric charts, AI analysis, alert log
- **Deployments** — Full session history table with score trajectories
- **Services** — Service catalog with baseline profiles and ML model info
- **Analytics** — KPIs, risk distribution charts, detection rates
- **Settings** — API key, thresholds, rate limiter status, RAG info

## Demo Script

1. Go to Dashboard
2. Select service (`api-gateway`) and failure mode (`Downstream Failure`)
3. Click **▶ Deploy Good Release** — wait 4 min for baseline, watch score stay ~10
4. Click **■ End Session**
5. Click **⚠ Deploy Faulty Release** — watch score climb from 0→WARNING→CRITICAL
6. Claude auto-analyzes at CRITICAL — shows RAG-retrieved similar incidents
7. Go to Deployments and Analytics to show session history

## Production Architecture

In a real deployment:
- MetricEngine → Go ingestion worker polling real Prometheus
- IsolationForest inference → AMD Instinct MI300X via ROCm/HIP/MIOpen
- EWMA + scoring → Parallel scoring on EPYC multi-core
- RAG store → Pinecone/pgvector with real AIOPS incident embeddings
- Claude analysis → Backend proxy (never expose key in client)
- Alert engine → Triggers rollback via CI/CD pipeline API

## Real Dataset

To use the real AIOPS Challenge 2020 dataset:
```bash
# Download from: https://github.com/NetManAIOps/AIOps-Challenge-2020-Data
npm run prepare-data -- --input ./raw/anomalies.csv
```

## Deploy to Vercel

```bash
npm install -g vercel
vercel
# Set VITE_ANTHROPIC_API_KEY in Vercel dashboard → Project Settings → Environment Variables
vercel --prod
```
