/**
 * VercelScraper — Health-check probe for Vercel (or any) deployed URL
 *
 * Instead of requiring Prometheus metrics, this scraper pings a URL every tick
 * and derives DeployShield metrics from HTTP response characteristics:
 *   rate       → successful probes / total probes (availability %)
 *   errorRate  → % of non-2xx responses in rolling window
 *   p99        → 99th-percentile response time (ms) in rolling window
 *   saturation → % of probes that exceeded the timeout threshold
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

        // Current metric values (for fallback)
        this.curr = { rate: 1000, errorRate: 0.5, p99: 100, saturation: 20 }
    }

    async fetchMetrics() {
        const probeResult = await this.probe()
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

        // Calculate rates — scale up to make them meaningful in the dashboard
        // A probe every 5s = 0.2 req/s, so we simulate "equivalent traffic" based on response quality
        const availability = ((total - errors) / total) * 100
        const baseRate = 1000 // nominal request rate
        const rate = Math.round(baseRate * (availability / 100))  // drops when errors rise
        const errorRate = total > 0 ? (errors / total) * 100 : 0
        const saturation = total > 0 ? (timeouts / total) * 100 : 0

        const snapshot = {
            rate: Math.max(0, rate),
            errorRate: Math.round(errorRate * 100) / 100,
            p99: Math.round(p99),
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
