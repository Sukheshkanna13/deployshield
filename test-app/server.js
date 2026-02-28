/**
 * 🧪 DeployShield Test App — A fake microservice you can "break"
 *
 * This is a tiny Express server that exposes Prometheus metrics.
 * DeployShield scrapes these metrics to monitor your "service".
 *
 * HOW TO USE:
 *   1. Start this:     node test-app/server.js
 *   2. Start DeployShield: npm run dev:full  (in another terminal)
 *   3. Fire webhook:   (see instructions printed on startup)
 *   4. Watch dashboard: http://localhost:5173
 *   5. BREAK IT:       curl http://localhost:4000/break
 *   6. FIX IT:         curl http://localhost:4000/fix
 */
import express from 'express'
import client from 'prom-client'

const app = express()
const PORT = 4000

// ═══════════════════════════════════════════════════════════════
// STEP 1: Set up Prometheus metrics (this is what DeployShield reads)
// ═══════════════════════════════════════════════════════════════

// Collect default Node.js metrics first (memory, event loop, CPU, etc.)
client.collectDefaultMetrics()

// Counter: total HTTP requests
const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['service', 'method', 'status']
})

// Histogram: request duration (for P99 latency)
const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
})

// Gauge: app CPU utilization (separate from default process_cpu_seconds_total)
const cpuUsage = new client.Gauge({
    name: 'app_cpu_utilization',
    help: 'Application CPU utilization ratio',
    labelNames: ['service']
})

// ═══════════════════════════════════════════════════════════════
// STEP 2: App state — "healthy" or "broken"
// ═══════════════════════════════════════════════════════════════
let isBroken = false
let trafficInterval = null

// Simulate background traffic (like real users hitting your API)
function simulateTraffic() {
    const service = 'my-test-app'

    if (isBroken) {
        // 🔴 BROKEN: High errors, slow responses, high CPU
        // 40% of requests fail with 500
        if (Math.random() < 0.4) {
            httpRequestsTotal.inc({ service, method: 'GET', status: '500' })
        } else {
            httpRequestsTotal.inc({ service, method: 'GET', status: '200' })
        }
        // Latency spikes to 2-8 seconds
        httpRequestDuration.observe({ service, method: 'GET' }, 2 + Math.random() * 6)
        // CPU goes high
        cpuUsage.set({ service }, 0.85 + Math.random() * 0.15)
    } else {
        // 🟢 HEALTHY: Low errors, fast responses, normal CPU
        // Only 1% of requests fail
        if (Math.random() < 0.01) {
            httpRequestsTotal.inc({ service, method: 'GET', status: '500' })
        } else {
            httpRequestsTotal.inc({ service, method: 'GET', status: '200' })
        }
        // Latency is 10-100ms
        httpRequestDuration.observe({ service, method: 'GET' }, 0.01 + Math.random() * 0.09)
        // CPU is normal
        cpuUsage.set({ service }, 0.2 + Math.random() * 0.15)
    }
}

// Generate traffic every 500ms (simulating ~2 requests/second)
trafficInterval = setInterval(simulateTraffic, 500)

// ═══════════════════════════════════════════════════════════════
// STEP 3: Routes
// ═══════════════════════════════════════════════════════════════

// The metrics endpoint — THIS is what DeployShield scrapes
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType)
    res.end(await client.register.metrics())
})

// Health check
app.get('/', (req, res) => {
    res.json({
        status: isBroken ? '🔴 BROKEN' : '🟢 HEALTHY',
        message: isBroken
            ? 'Service is degraded! Errors are spiking!'
            : 'Service is running normally.',
        endpoints: {
            '/metrics': 'Prometheus metrics (DeployShield reads this)',
            '/break': 'Simulate a bad deployment (things go wrong)',
            '/fix': 'Fix the deployment (things go back to normal)'
        }
    })
})

// 💥 BREAK the service — simulates a bad deploy
app.get('/break', (req, res) => {
    isBroken = true
    console.log('💥 SERVICE BROKEN — errors spiking, latency through the roof!')
    res.json({ status: '💥 BROKEN', message: 'Service is now degraded. Watch DeployShield detect it!' })
})

// ✅ FIX the service — simulates a rollback
app.get('/fix', (req, res) => {
    isBroken = false
    console.log('✅ SERVICE FIXED — back to normal')
    res.json({ status: '✅ FIXED', message: 'Service recovered. Watch DeployShield calm down.' })
})

// ═══════════════════════════════════════════════════════════════
// STEP 4: Start the server
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log('')
    console.log('═══════════════════════════════════════════════════════')
    console.log('  🧪 DeployShield Test App running on port ' + PORT)
    console.log('═══════════════════════════════════════════════════════')
    console.log('')
    console.log('  Your fake microservice is generating traffic.')
    console.log('  DeployShield will scrape http://localhost:' + PORT + '/metrics')
    console.log('')
    console.log('  📋 STEP-BY-STEP:')
    console.log('')
    console.log('  1. Make sure DeployShield is running (npm run dev:full)')
    console.log('')
    console.log('  2. Register this app (run this in another terminal):')
    console.log('')
    console.log('     node -e "import{PrismaClient}from\'@prisma/client\';const p=new PrismaClient();await p.project.upsert({where:{apiKey:\'real-test-key\'},update:{prometheusUrl:\'http://localhost:4000\'},create:{name:\'Test App\',apiKey:\'real-test-key\',prometheusUrl:\'http://localhost:4000\'}});console.log(\'Done!\');"')
    console.log('')
    console.log('  3. Tell DeployShield to start watching:')
    console.log('')
    console.log('     curl -X POST http://localhost:3001/api/webhook/deploy \\')
    console.log('       -H "Content-Type: application/json" \\')
    console.log('       -H "x-api-key: real-test-key" \\')
    console.log('       -d \'{"service":"my-test-app","environment":"production"}\'')
    console.log('')
    console.log('  4. Open dashboard: http://localhost:5173')
    console.log('')
    console.log('  5. 💥 BREAK IT:  curl http://localhost:' + PORT + '/break')
    console.log('  6. ✅ FIX IT:    curl http://localhost:' + PORT + '/fix')
    console.log('')
    console.log('═══════════════════════════════════════════════════════')
})
