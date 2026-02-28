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
        console.log(`[Tick] Starting tick for ${id}...`)

        try {
            const snapshot = await scraper.fetchMetrics()
            if (!snapshot) {
                console.log(`[Tick] fetchMetrics returned null for ${id}`)
                return;
            }

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

            // Log every 3rd tick for debugging
            if (history.length % 3 === 0 || score > 10) {
                console.log(`[Tick] ${service} | tick=${history.length} phase=${phase} score=${score} mode=${scraper.mode || 'N/A'}`)
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
        } catch (err) {
            console.error(`[Tick] Error in tick loop for ${id}:`, err)
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
        history,
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

/** Inject fault into running session's scraper */
export function triggerManualAnalysis(id) {
    const s = sessions.get(id)
    if (!s || s.status !== 'ACTIVE') return false

    // Pull current metrics
    const score = s.scoringEngine.lastScore
    if (score < 5) return false // No anomaly to analyze

    // Only allow one stream at a time per session
    if (s.analyzing) return false
    s.analyzing = true

    console.log(`[AI] Manual analysis triggered for ${id} (Score: ${score})`)
    broadcast({ type: 'AI_STREAM_START', payload: { sessionId: id } })

    const lastSnapshots = s.history.slice(-6)
    const attribution = s.attributionEngine.compute(
        lastSnapshots[lastSnapshots.length - 1],
        s.history.slice(0, 48)
    )

    streamAnalysis({
        score,
        deploymentId: id,
        attribution,
        history: lastSnapshots,
        onToken: (text) => broadcast({ type: 'AI_STREAM_TOKEN', payload: { sessionId: id, text } }),
        onDone: ({ retrieved }) => {
            s.analyzing = false
            broadcast({ type: 'AI_STREAM_DONE', payload: { sessionId: id, retrieved } })
        },
        onError: (err) => {
            s.analyzing = false
            console.error('[AI] Stream Error:', err)
            broadcast({ type: 'AI_STREAM_ERROR', payload: { sessionId: id, error: err } })
        }
    })

    return true
}

export function injectFault(id, failureMode) {
    const session = sessions.get(id)
    if (!session) return false

    if (typeof session.scraper.injectFault === 'function') {
        session.scraper.injectFault(failureMode)
        console.log(`[Session] Fault injected into ${id}: ${failureMode}`)
        broadcast({ type: 'FAULT_INJECTED', payload: { sessionId: id, failureMode } })
        return true
    } else {
        // PrometheusScraper — switch mode directly
        session.scraper.mode = 'DEGRADED'
        session.scraper.ramp = 0
        if (failureMode) session.scraper.failureMode = failureMode
        console.log(`[Session] Fault injected into ${id} (Prometheus): ${failureMode}`)
        broadcast({ type: 'FAULT_INJECTED', payload: { sessionId: id, failureMode } })
        return true
    }
}

/** Recover a session's scraper from degraded mode */
export function recoverSession(id) {
    const session = sessions.get(id)
    if (!session) return false

    if (typeof session.scraper.recover === 'function') {
        session.scraper.recover()
    } else {
        session.scraper.mode = 'NORMAL'
        session.scraper.ramp = 0
    }
    console.log(`[Session] Recovered session ${id}`)
    broadcast({ type: 'FAULT_RECOVERED', payload: { sessionId: id } })
    return true
}
