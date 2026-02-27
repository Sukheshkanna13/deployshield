/**
 * Projects API — Self-service project registration and management
 *
 * Endpoints:
 *   GET    /api/projects          → list all projects
 *   POST   /api/projects          → create project (auto-generates API key)
 *   PUT    /api/projects/:id      → update project
 *   DELETE /api/projects/:id      → delete project
 *   POST   /api/projects/:id/test → test connectivity to the project's URL
 */
import express from 'express'
import crypto from 'crypto'
import { prisma } from '../db.js'

const router = express.Router()

// ── List all projects ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                deployments: {
                    orderBy: { startTime: 'desc' },
                    take: 1,
                    select: { id: true, status: true, startTime: true, maxRiskScore: true }
                }
            }
        })
        res.json(projects)
    } catch (err) {
        console.error('[Projects] List error:', err.message)
        res.status(500).json({ error: 'Failed to list projects' })
    }
})

// ── Create project ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { name, sourceType, url, healthCheckPath, vercelToken, slackWebhookUrl } = req.body

    if (!name || !url) {
        return res.status(400).json({ error: 'name and url are required' })
    }

    const type = sourceType || 'prometheus'
    if (!['vercel', 'prometheus'].includes(type)) {
        return res.status(400).json({ error: 'sourceType must be "vercel" or "prometheus"' })
    }

    try {
        const apiKey = `ds_${crypto.randomBytes(16).toString('hex')}`

        const project = await prisma.project.create({
            data: {
                name,
                apiKey,
                sourceType: type,
                prometheusUrl: url,
                healthCheckPath: healthCheckPath || null,
                vercelToken: vercelToken || null,
                slackWebhookUrl: slackWebhookUrl || null
            }
        })

        res.status(201).json(project)
    } catch (err) {
        console.error('[Projects] Create error:', err.message)
        res.status(500).json({ error: 'Failed to create project' })
    }
})

// ── Update project ───────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    const { name, url, healthCheckPath, vercelToken, slackWebhookUrl } = req.body

    try {
        const project = await prisma.project.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(url && { prometheusUrl: url }),
                ...(healthCheckPath !== undefined && { healthCheckPath }),
                ...(vercelToken !== undefined && { vercelToken }),
                ...(slackWebhookUrl !== undefined && { slackWebhookUrl })
            }
        })
        res.json(project)
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Project not found' })
        console.error('[Projects] Update error:', err.message)
        res.status(500).json({ error: 'Failed to update project' })
    }
})

// ── Delete project ───────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        await prisma.project.delete({ where: { id: req.params.id } })
        res.json({ message: 'Project deleted' })
    } catch (err) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Project not found' })
        console.error('[Projects] Delete error:', err.message)
        res.status(500).json({ error: 'Failed to delete project' })
    }
})

// ── Test connectivity ────────────────────────────────────────────────────────
router.post('/:id/test', async (req, res) => {
    try {
        const project = await prisma.project.findUnique({ where: { id: req.params.id } })
        if (!project) return res.status(404).json({ error: 'Project not found' })

        const url = project.sourceType === 'vercel'
            ? `${project.prometheusUrl}${project.healthCheckPath || ''}`
            : `${project.prometheusUrl}/metrics`

        const start = Date.now()
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5000)

            const probeRes = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'DeployShield/1.0 (connectivity-test)' }
            })

            clearTimeout(timeout)
            const latency = Date.now() - start

            // For Prometheus, check if body contains metric data
            let metricsDetected = false
            if (project.sourceType === 'prometheus') {
                const body = await probeRes.text()
                metricsDetected = body.includes('# HELP') || body.includes('# TYPE')
            }

            res.json({
                connected: true,
                status: probeRes.status,
                statusText: probeRes.statusText,
                latency,
                metricsDetected,
                url
            })
        } catch (probeErr) {
            const latency = Date.now() - start
            res.json({
                connected: false,
                error: probeErr.name === 'AbortError' ? 'Timeout (5s)' : probeErr.message,
                latency,
                url
            })
        }
    } catch (err) {
        console.error('[Projects] Test error:', err.message)
        res.status(500).json({ error: 'Test failed' })
    }
})

export default router
