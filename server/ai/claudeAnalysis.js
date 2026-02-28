/**
 * claudeAnalysis — Streaming Claude API integration with RAG context injection
 *
 * Combines:
 *   - Current risk score + metric snapshot
 *   - Per-metric Z-score attribution (what's anomalous)
 *   - 30-second metric trajectory (the trend)
 *   - RAG-retrieved similar historical incidents (grounded context)
 *
 * Rate limited via globalRateLimiter (token bucket, 5 req/min).
 * Response streams token-by-token into the UI via onToken callback.
 */
import { globalRateLimiter, RateLimitError } from './RateLimiter.js'
import { ragPipeline } from './ragPipeline.js'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_PROMPT = `You are DeployShield AI — a real-time deployment risk intelligence system built on AMD Instinct GPUs and AMD EPYC processors, running on ROCm.

Your role: Analyze live deployment metric anomalies and provide concise, actionable engineering diagnosis grounded in the historical incident context provided.

Response format — use EXACTLY these bold headers, nothing else:
**DIAGNOSIS**
**ROOT CAUSE**  
**ACTION**

Each section: 2–3 bullet points starting with •
Be specific and technical. Reference the historical incidents when they match.
Total response: under 380 words. No preamble, no postamble.`

/**
 * Stream Claude analysis for a deployment anomaly.
 *
 * @param {Object} params
 * @param {number} params.score          - Current risk score (0-100)
 * @param {string} params.deploymentId   - Active deployment session ID
 * @param {Array}  params.attribution    - Z-score attribution array (from AttributionEngine)
 * @param {Array}  params.history        - Last 6 metric snapshots (30s trajectory)
 * @param {Function} params.onToken      - Called with each streamed text token
 * @param {Function} params.onDone       - Called when stream completes
 * @param {Function} params.onError      - Called with error message on failure
 */
export async function streamAnalysis({
  score, deploymentId, attribution, history,
  onToken, onDone, onError,
}) {
  // Retrieve similar historical incidents via RAG
  const retrieved = await ragPipeline.retrieve(attribution, 3)
  const ragContext = ragPipeline.buildContext(retrieved)

  // Build attribution context
  const attrText = attribution.slice(0, 3).map(a =>
    `• ${a.label}: ${a.cur}${a.unit} (baseline ${a.mean}${a.unit}, ${a.pct > 0 ? '+' : ''}${a.pct}%, Z-score=${a.z})`
  ).join('\n')

  // Build metric trajectory
  const trajectoryText = history.slice(-6).map((h, i) =>
    `T-${(5 - i) * 5}s: rate=${h.rate?.toFixed(0)} req/s | err=${h.errorRate?.toFixed(2)}% | p99=${h.p99?.toFixed(0)}ms | sat=${h.saturation?.toFixed(1)}%`
  ).join('\n')

  const userMessage = [
    `Deployment ID: ${deploymentId}`,
    `Current Risk Score: ${score}/100`,
    '',
    'ANOMALOUS METRIC ATTRIBUTION (Z-score deviation from baseline):',
    attrText,
    '',
    'METRIC TRAJECTORY (last 30 seconds):',
    trajectoryText,
    ragContext ? '\n' + ragContext : '',
    '',
    'Analyze this deployment anomaly.',
  ].join('\n')

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    onError?.('VITE_ANTHROPIC_API_KEY not set in .env.local')
    onDone?.({ retrieved: [] })
    return
  }

  try {
    await globalRateLimiter.schedule(async () => {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 450,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`API ${response.status}: ${err.slice(0, 120)}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              onToken?.(event.delta.text)
            }
          } catch (_) { }
        }
      }
    }, `analysis-${score}`)

    onDone?.({ retrieved })
  } catch (err) {
    if (err instanceof RateLimitError) {
      onError?.(`Rate limit: ${err.message}`)
    } else {
      onError?.(`Error: ${err.message}`)
    }
    onDone?.({ retrieved: [] })
  }
}
