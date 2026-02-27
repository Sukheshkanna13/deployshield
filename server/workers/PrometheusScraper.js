import axios from 'axios'

/**
 * PrometheusScraper — Real metric fetcher with built-in simulation fallback
 *
 * When a live Prometheus instance is reachable, queries PromQL for real metrics.
 * When unreachable (local dev / hackathon demo), falls back to the MetricEngine's
 * AR(1) autoregressive simulation with Gaussian noise and failure-mode ramp.
 */
export class PrometheusScraper {
    constructor(prometheusUrl, serviceName, { mode = 'NORMAL', failureMode = 'downstream_fail' } = {}) {
        this.prometheusUrl = prometheusUrl || 'http://localhost:9090'
        this.serviceName = serviceName
        this.simulationMode = true // will flip to false if Prometheus responds
        this.probeAttempted = false

        // Axios client with a tight timeout
        this.client = axios.create({
            baseURL: this.prometheusUrl,
            timeout: 2000,
        })

        // ── Simulation Engine (AR(1) from MetricEngine) ─────────────────
        this.phi = 0.82
        this.mode = mode          // NORMAL | DEGRADED
        this.ramp = 0             // 0→1 over 90s in DEGRADED mode
        this.tickCount = 0
        this.failureMode = failureMode

        this.profiles = {
            'api-gateway': { rate: 1240, errorRate: 0.75, p99: 172, saturation: 40 },
            'payment-svc': { rate: 340, errorRate: 0.42, p99: 89, saturation: 28 },
            'auth-svc': { rate: 890, errorRate: 0.31, p99: 54, saturation: 35 },
            'order-processor': { rate: 180, errorRate: 1.1, p99: 340, saturation: 55 },
        }

        this.devs = { rate: 55, errorRate: 0.18, p99: 9, saturation: 3.2 }

        this.anomalyModes = {
            db_timeout: { rate: -220, errorRate: 8.4, p99: 680, saturation: 22 },
            memory_leak: { rate: -80, errorRate: 2.1, p99: 220, saturation: 58 },
            cpu_spike: { rate: -400, errorRate: 5.2, p99: 440, saturation: 52 },
            downstream_fail: { rate: -640, errorRate: 12.4, p99: 710, saturation: 14 },
        }

        this.base = { ...(this.profiles[serviceName] || this.profiles['api-gateway']) }
        this.curr = { ...this.base }
    }

    /** Box-Muller transform — true Gaussian random variable */
    gaussian() {
        let u, v
        do { u = Math.random(); v = Math.random() } while (u === 0)
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    }

    getShift(key) {
        const shifts = this.anomalyModes[this.failureMode] || this.anomalyModes.downstream_fail
        return (shifts[key] ?? 0) * this.ramp
    }

    /** Generate a simulated metric snapshot using AR(1) process */
    simulateTick() {
        if (this.mode === 'DEGRADED') this.ramp = Math.min(1, this.ramp + 1 / 18)
        this.tickCount++

        const snap = {}
        for (const key of Object.keys(this.base)) {
            const shift = this.mode === 'DEGRADED' ? this.getShift(key) : 0
            const noise = this.gaussian() * this.devs[key] * 0.25
            const next = this.phi * this.curr[key] + (1 - this.phi) * (this.base[key] + shift) + noise
            snap[key] = Math.max(0,
                key === 'errorRate' ? Math.min(50, next) :
                    key === 'saturation' ? Math.min(100, next) : next)
        }
        this.curr = { ...snap }
        return { ...snap, ts: Date.now(), tick: this.tickCount }
    }

    async fetchMetrics() {
        // Probe once on first call to determine scraping mode
        if (!this.probeAttempted) {
            this.probeAttempted = true
            // Try 1: check if it's a full Prometheus server (has /api/v1/query)
            try {
                await this.client.get('/api/v1/status/config', { timeout: 1500 })
                this.simulationMode = false
                this.directScrape = false
                console.log(`[Scraper] Prometheus API reachable at ${this.prometheusUrl} — using PromQL`)
            } catch {
                // Try 2: check if it's a direct /metrics endpoint (like prom-client)
                try {
                    const resp = await this.client.get('/metrics', { timeout: 1500 })
                    if (resp.data && typeof resp.data === 'string' && resp.data.includes('# HELP')) {
                        this.simulationMode = false
                        this.directScrape = true
                        console.log(`[Scraper] Direct /metrics endpoint found at ${this.prometheusUrl} — using raw scrape`)
                    } else {
                        throw new Error('Not a Prometheus endpoint')
                    }
                } catch {
                    this.simulationMode = true
                    console.log(`[Scraper] No metrics endpoint found — falling back to simulation for ${this.serviceName}`)
                }
            }
        }

        // ── Simulation path ──────────────────────────────────────────────
        if (this.simulationMode) {
            return this.simulateTick()
        }

        // ── Direct /metrics scrape path (prom-client apps) ───────────────
        if (this.directScrape) {
            return this.scrapeDirectMetrics()
        }

        // ── Live Prometheus PromQL path ──────────────────────────────────
        try {
            const queries = {
                rate: `rate(http_requests_total{service="${this.serviceName}"}[1m])`,
                errorRate: `rate(http_requests_total{service="${this.serviceName}",status=~"5.."}[1m]) / rate(http_requests_total{service="${this.serviceName}"}[1m])`,
                p99: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="${this.serviceName}"}[1m]))`,
                saturation: `process_cpu_seconds_total{service="${this.serviceName}"}`
            }

            const results = await Promise.allSettled([
                this.client.get('/api/v1/query', { params: { query: queries.rate } }),
                this.client.get('/api/v1/query', { params: { query: queries.errorRate } }),
                this.client.get('/api/v1/query', { params: { query: queries.p99 } }),
                this.client.get('/api/v1/query', { params: { query: queries.saturation } })
            ])

            const extractValue = (result, fallback) => {
                if (result.status === 'fulfilled' && result.value.data?.data?.result?.length > 0) {
                    const val = result.value.data.data.result[0].value[1]
                    return isNaN(val) ? fallback : parseFloat(val)
                }
                return fallback
            }

            const snapshot = {
                rate: extractValue(results[0], this.curr.rate),
                errorRate: extractValue(results[1], this.curr.errorRate),
                p99: extractValue(results[2], this.curr.p99),
                saturation: extractValue(results[3], this.curr.saturation)
            }

            if (isNaN(snapshot.errorRate)) snapshot.errorRate = 0.0
            this.curr = { ...snapshot }

            return { ...snapshot, ts: Date.now() }

        } catch (err) {
            console.error(`[Scraper] Fetch failed for ${this.serviceName}:`, err.message)
            return this.simulateTick()
        }
    }

    /** Parse raw Prometheus text format from a /metrics endpoint */
    async scrapeDirectMetrics() {
        try {
            const resp = await this.client.get('/metrics', { timeout: 2000 })
            const text = resp.data
            const svc = this.serviceName

            // Parse total requests (sum of all statuses)
            const totalRequests = this.sumMetric(text, 'http_requests_total', { service: svc })
            const errorRequests = this.sumMetric(text, 'http_requests_total', { service: svc, status: '500' })

            // Parse histogram P99 from _bucket lines
            const p99 = this.parseHistogramP99(text, 'http_request_duration_seconds', { service: svc })

            // Parse CPU gauge
            const cpu = this.parseGauge(text, 'app_cpu_utilization', { service: svc })

            const rate = totalRequests > 0 ? totalRequests : this.curr.rate
            const errorRate = (totalRequests > 0 && errorRequests > 0)
                ? (errorRequests / totalRequests) * 100
                : this.curr.errorRate

            const snapshot = {
                rate,
                errorRate: Math.min(50, errorRate),
                p99: p99 > 0 ? p99 * 1000 : this.curr.p99,  // convert seconds to ms
                saturation: cpu > 0 ? cpu * 100 : this.curr.saturation  // convert ratio to percent
            }

            this.curr = { ...snapshot }
            return { ...snapshot, ts: Date.now() }

        } catch (err) {
            console.error(`[Scraper] Direct scrape failed:`, err.message)
            return { ...this.curr, ts: Date.now() }
        }
    }

    /** Sum all values for a metric name matching given labels */
    sumMetric(text, name, labels) {
        let sum = 0
        const lines = text.split('\n')
        for (const line of lines) {
            if (line.startsWith('#') || !line.startsWith(name)) continue
            // Check if all required labels match
            let match = true
            for (const [k, v] of Object.entries(labels)) {
                if (!line.includes(`${k}="${v}"`)) { match = false; break }
            }
            if (match) {
                const val = parseFloat(line.split(/\s+/).pop())
                if (!isNaN(val)) sum += val
            }
        }
        return sum
    }

    /** Parse a gauge value */
    parseGauge(text, name, labels) {
        const lines = text.split('\n')
        for (const line of lines) {
            if (line.startsWith('#') || !line.startsWith(name)) continue
            let match = true
            for (const [k, v] of Object.entries(labels)) {
                if (!line.includes(`${k}="${v}"`)) { match = false; break }
            }
            if (match) {
                const val = parseFloat(line.split(/\s+/).pop())
                if (!isNaN(val)) return val
            }
        }
        return 0
    }

    /** Approximate P99 from histogram buckets */
    parseHistogramP99(text, name, labels) {
        const buckets = []
        const lines = text.split('\n')
        for (const line of lines) {
            if (!line.startsWith(name + '_bucket')) continue
            let match = true
            for (const [k, v] of Object.entries(labels)) {
                if (!line.includes(`${k}="${v}"`)) { match = false; break }
            }
            if (match) {
                const leMatch = line.match(/le="([^"]+)"/)
                const val = parseFloat(line.split(/\s+/).pop())
                if (leMatch && !isNaN(val)) {
                    buckets.push({ le: parseFloat(leMatch[1]), count: val })
                }
            }
        }
        if (buckets.length === 0) return 0

        buckets.sort((a, b) => a.le - b.le)
        const total = buckets[buckets.length - 1]?.count || 1
        const p99Target = total * 0.99

        for (const b of buckets) {
            if (b.count >= p99Target) return b.le
        }
        return buckets[buckets.length - 1]?.le || 0
    }
}
