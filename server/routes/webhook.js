import express from 'express'
import { startSession, endSession, getActiveSessions } from '../SessionManager.js'
import { prisma } from '../db.js'

const router = express.Router()

// Webhook receiver for GitHub Actions / CI/CD
router.post('/deploy', async (req, res) => {
    const { service, environment, commit, branch, mode, deployType } = req.body
    const apiKey = req.headers['x-api-key']

    if (!apiKey) {
        return res.status(401).json({ error: 'X-API-Key header is required' })
    }

    if (!service) {
        return res.status(400).json({ error: 'service is required' })
    }

    try {
        // Validate API Key and get Project
        const project = await prisma.project.findUnique({
            where: { apiKey }
        })

        if (!project) {
            return res.status(403).json({ error: 'Invalid API Key' })
        }

        // Create Deployment Session in DB
        const dbSession = await prisma.deploymentSession.create({
            data: {
                projectId: project.id,
                environment: environment || 'production',
                status: 'ACTIVE',
                commitSha: commit || branch || 'unknown'
            }
        })

        startSession({
            id: dbSession.id,
            service,
            environment: environment || 'production',
            failureMode: mode,
            deployType: deployType || 'NORMAL',
            project
        })

        // Respond immediately to the CI pipeline
        res.status(202).json({
            message: `Monitoring session started for ${service}`,
            sessionId: dbSession.id,
            statusCheckUrl: `/api/session/${dbSession.id}`
        })
    } catch (error) {
        console.error('[Webhook] Error starting deployment:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Endpoint to stop a session early
router.post('/deploy/stop/:id', (req, res) => {
    const success = endSession(req.params.id)
    if (success) {
        res.json({ message: 'Session stopped' })
    } else {
        res.status(404).json({ error: 'Session not found' })
    }
})

// Endpoint for CI/CD rollback checkers to poll the live score
router.get('/session/:id', (req, res) => {
    const sessions = getActiveSessions()
    const s = sessions.find(s => s.id === req.params.id)
    if (!s) return res.status(404).json({ error: 'Not found' })
    res.json(s)
})

export default router
