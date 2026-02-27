import { PrometheusScraper } from './workers/PrometheusScraper.js'
import { VercelScraper } from './workers/VercelScraper.js'
import { prisma } from './db.js'
import { ScoringEngine } from './engines/ScoringEngine.js'
import { AttributionEngine } from './engines/AttributionEngine.js'
import { AlertEngine } from './engines/AlertEngine.js'
import { broadcast } from './index.js'
import { streamAnalysis } from './ai/claudeAnalysis.js'

const sessions = new Map()

export function getActiveSessions() {
    return Array.from(sessions.values()).map(s => ({
        id: s.id,
        service: s.service,
        status: s.status,
        environment: s.environment,
        score: s.scoringEngine.lastScore
    }))
}

export function startSession({ id, service, environment, failureMode, deployType, project }) {
    console.log(`[Session] Starting new session ${id} for ${service} [${deployType || 'NORMAL'}]`)

    // Choose scraper based on project source type
    let scraper
    if (project?.sourceType === 'vercel') {
        console.log(`[Session] Using VercelScraper for ${project.prometheusUrl}`)
        scraper = new VercelScraper(project.prometheusUrl, service, {
            healthCheckPath: project.healthCheckPath,
            vercelToken: project.vercelToken
        })
    } else {
        scraper = new PrometheusScraper(project?.prometheusUrl || null, service, {
            mode: deployType === 'DEGRADED' ? 'DEGRADED' : 'NORMAL',
            failureMode: failureMode || 'downstream_fail'
        })
    }

    const scoringEngine = new ScoringEngine()
    const attributionEngine = new AttributionEngine()
    const alertEngine = new AlertEngine(project)

    const history = []

    // Main tick loop
    const tickInterval = setInterval(async () => {
        const snapshot = await scraper.fetchMetrics()
        if (!snapshot) return

        history.push(snapshot)
        if (history.length > 144) history.shift() // keep last 12 mins at 5s = 144 ticks

        const { score, phase, ifScore, ewmaScore, combined } = scoringEngine.update(snapshot, history)
        const attribution = attributionEngine.compute(snapshot, history.slice(0, 48))

        // Save Metric Snapshot to Database
        try {
            await prisma.metricSnapshot.create({
                data: {
                    sessionId: id,
                    rate: snapshot.rate,
                    errorRate: snapshot.errorRate,
                    p99: snapshot.p99,
                    saturation: snapshot.saturation,
                    riskScore: score
                }
            })
        } catch (dbErr) {
            console.error(`[SessionManager] Database error saving snapshot for ${id}:`, dbErr.message)
        }

        // Broadcast snapshot
        broadcast({
            type: 'METRIC_TICK',
            payload: { sessionId: id, snapshot, scoring: { score, phase }, attribution }
        })

        // Check for alerts
        const alert = alertEngine.evaluate(score, attribution, id)
        if (alert) {
            console.log(`[Alert] ${alert.sev} fired for ${id} (Score: ${score})`)
            broadcast({ type: 'ALERT', payload: alert })

            // Auto-analyze criticals
            if (alert.autoAnalyze) {
                broadcast({ type: 'AI_STREAM_START', payload: { sessionId: id } })

                streamAnalysis({
                    score,
                    deploymentId: id,
                    attribution,
                    history: history.slice(-6),
                    onToken: (text) => broadcast({ type: 'AI_STREAM_TOKEN', payload: { sessionId: id, text } }),
                    onDone: ({ retrieved }) => broadcast({ type: 'AI_STREAM_DONE', payload: { sessionId: id, retrieved } }),
                    onError: (err) => console.error('[AI] Stream Error:', err)
                })
            }
        }

    }, 5000) // 5s tick

    sessions.set(id, {
        id,
        service,
        environment,
        scraper,
        scoringEngine,
        attributionEngine,
        alertEngine,
        interval: tickInterval,
        status: 'ACTIVE'
    })

    // Broadcast session update
    broadcast({ type: 'SESSIONS_UPDATE', payload: getActiveSessions() })

    return id
}

export function endSession(id) {
    const session = sessions.get(id)
    if (!session) return false

    clearInterval(session.interval)
    session.status = 'COMPLETED'
    sessions.delete(id)

    console.log(`[Session] Ended session ${id}`)
    broadcast({ type: 'SESSIONS_UPDATE', payload: getActiveSessions() })
    return true
}
