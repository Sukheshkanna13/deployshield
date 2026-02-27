import { PrometheusScraper } from './PrometheusScraper.js'

async function run() {
    console.log('--- Initializing Scraper ---')
    const scraper = new PrometheusScraper('http://localhost:9090', 'api-gateway')

    console.log('--- Fetching Metrics (Expect Timeout/Refused since no local Prometheus) ---')

    const start = Date.now()
    const snapshot = await scraper.fetchMetrics()
    const elapsed = Date.now() - start

    console.log(`--- Result in ${elapsed}ms ---`)
    console.dir(snapshot, { depth: null })

    // It should gracefully fallback to the initial snapshot if the connection is refused
}

run()
