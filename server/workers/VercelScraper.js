/**
 * VercelScraper — Health-check probe for Vercel (or any) deployed URL
 *
 * Instead of requiring Prometheus metrics, this scraper pings a URL every tick
 * and derives DeployShield metrics from HTTP response characteristics:
 *   rate       → successful probes / total probes (availability %)
 *   errorRate  → % of non-2xx responses in rolling window
 *   p99        → 99th-percentile response time (ms) in rolling window
 *   saturation → % of probes that exceeded the timeout threshold
 *
 * DEGRADED mode: overlays synthetic anomalies on top of real probe data
 * to simulate what happens when a real deployment breaks.
 */

const WINDOW_SIZE = 60  // rolling window of last 60 probes (~5 min at 5s interval)
const TIMEOUT_MS = 8000 // consider a probe "saturated" if > 8s

export class VercelScraper {
    constructor(baseUrl, serviceName, opts = {}) {
        this.baseUrl = baseUrl?.replace(/\/+$/, '') || ''
        this.serviceName = serviceName
        this.healthPath = opts.healthCheckPath || ''
        this.vercelToken = opts.vercelToken || null

        // Rolling window of probe results
        this.probes = []

        // Degradation mode
        this.mode = opts.mode || 'NORMAL'     // NORMAL | DEGRADED
        this.ramp = 0                          // 0 → 1 over ~60 seconds
        this.degradedTick = 0
        this.failureMode = opts.failureMode || 'downstream_fail'

        // Anomaly profiles (how each failure manifests)
        this.anomalyModes = {
            downstream_fail: { latencyMul: 8, errorInjection: 0.15, timeoutInjection: 0.10 },
            db_timeout: { latencyMul: 12, errorInjection: 0.08, timeoutInjection: 0.25 },
            memory_leak: { latencyMul: 5, errorInjection: 0.12, timeoutInjection: 0.18 },
            cpu_spike: { latencyMul: 6, errorInjection: 0.20, timeoutInjection: 0.15 },
        }

        // Current metric values (for fallback)
        this.curr = { rate: 1000, errorRate: 0.5, p99: 100, saturation: 20 }
    }

    /** Switch to degraded mode (called by SessionManager inject API) */
    injectFault(failureMode) {
        console.log(`[VercelScraper] Injecting fault: ${failureMode || this.failureMode}`)
        this.mode = 'DEGRADED'
        this.failureMode = failureMode || this.failureMode
        this.ramp = 0
        this.degradedTick = 0
    }

    /** Recover from degraded mode */
    recover() {
        console.log(`[VercelScraper] Recovering to normal mode`)
        this.mode = 'NORMAL'
        this.ramp = 0
        this.degradedTick = 0
    }

    async fetchMetrics() {
        const probeResult = await this.probe()

        // In DEGRADED mode, overlay synthetic anomalies on real data
        if (this.mode === 'DEGRADED') {
            this.degradedTick++
            // Ramp from 0 → 1 over 12 ticks (60 seconds)
            this.ramp = Math.min(1, this.degradedTick / 12)

            const anomaly = this.anomalyModes[this.failureMode] || this.anomalyModes.downstream_fail

            // Multiply latency
            probeResult.duration = Math.round(probeResult.duration * (1 + this.ramp * anomaly.latencyMul))

            // Inject random errors based on ramp
            if (Math.random() < this.ramp * anomaly.errorInjection * 3) {
                probeResult.ok = false
                probeResult.status = [500, 502, 503, 504][Math.floor(Math.random() * 4)]
            }

            // Inject timeouts
            if (Math.random() < this.ramp * anomaly.timeoutInjection * 2) {
                probeResult.duration = TIMEOUT_MS + Math.floor(Math.random() * 2000)
            }
        }

        this.probes.push(probeResult)
        if (this.probes.length > WINDOW_SIZE) this.probes.shift()

        // Compute metrics from rolling window
        const total = this.probes.length
        const errors = this.probes.filter(p => !p.ok).length
        const timeouts = this.probes.filter(p => p.duration >= TIMEOUT_MS).length
        const durations = this.probes.map(p => p.duration).sort((a, b) => a - b)

        // P99 latency
        const p99Index = Math.floor(durations.length * 0.99)
        const p99 = durations[Math.min(p99Index, durations.length - 1)] || 100

        // Calculate rates
        const availability = ((total - errors) / total) * 100
        const baseRate = 1000
        const rate = Math.round(baseRate * (availability / 100))
        const errorRate = total > 0 ? (errors / total) * 100 : 0
        const saturation = total > 0 ? (timeouts / total) * 100 : 0

        // Add tiny visual variance so flawless charts don't render as flat lines
        const jitterError = (Math.random() * 0.3)
        const jitterP99 = (Math.random() * 8) - 4

        const snapshot = {
            rate: Math.max(0, rate),
            errorRate: Math.max(0, Math.round((errorRate + jitterError) * 100) / 100),
            p99: Math.max(10, Math.round(p99 + jitterP99)),
            saturation: Math.round(saturation * 100) / 100
        }

        this.curr = { ...snapshot }
        return { ...snapshot, ts: Date.now() }
    }

    /** Single HTTP probe — returns { ok, status, duration } */
    async probe() {
        const url = this.healthPath
            ? `${this.baseUrl}${this.healthPath}`
            : this.baseUrl

        const start = Date.now()
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

            const res = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'DeployShield/1.0 (health-probe)',
                    'Accept': 'text/html,application/json,*/*'
                }
            })

            clearTimeout(timeout)
            const duration = Date.now() - start

            return {
                ok: res.status >= 200 && res.status < 400,
                status: res.status,
                duration
            }
        } catch (err) {
            const duration = Date.now() - start
            return {
                ok: false,
                status: 0,
                duration: Math.min(duration, TIMEOUT_MS)
            }
        }
    }
}
