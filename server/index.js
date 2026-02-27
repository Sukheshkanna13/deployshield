import express from 'express'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import * as http from 'http'
import dotenv from 'dotenv'
import webhookRoute from './routes/webhook.js'
import projectsRoute from './routes/projects.js'
import { startSession, getActiveSessions } from './SessionManager.js'
import { ragPipeline } from './ai/ragPipeline.js'

dotenv.config({ path: '../.env.local' })

const app = express()
app.use(cors())
app.use(express.json())

app.use('/api/webhook', webhookRoute)
app.use('/api/projects', projectsRoute)

app.get('/api/session/:id', (req, res) => {
    const sessions = getActiveSessions()
    const s = sessions.find(s => s.id === req.params.id)
    if (!s) return res.status(404).json({ error: 'Not found' })
    res.json(s)
})

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', activeSessions: getActiveSessions().length }))

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

// Global client list for broadcasting
const clients = new Set()

wss.on('connection', (ws) => {
    console.log('[WS] Client connected')
    clients.add(ws)

    // Send current active sessions immediately upon connection
    ws.send(JSON.stringify({ type: 'SESSIONS_UPDATE', payload: getActiveSessions() }))

    ws.on('close', () => {
        console.log('[WS] Client disconnected')
        clients.delete(ws)
    })
})

export function broadcast(message) {
    const str = JSON.stringify(message)
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(str)
        }
    }
}

const PORT = process.env.PORT || 3001

async function start() {
    // Initialize RAG knowledge base in PostgreSQL
    await ragPipeline.initialize()

    server.listen(PORT, () => {
        console.log(`[Server] Running on port ${PORT}`)
        console.log(`[WS] WebSocket server attached to port ${PORT}`)
    })
}

start()
