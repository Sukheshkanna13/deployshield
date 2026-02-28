/**
 * useDeployment — Session lifecycle and WebSocket connection hook
 *
 * Fixed: uses useRef for WS to avoid re-render loops.
 * Fixed: uses individual selectors to prevent unnecessary re-renders.
 */
import { useEffect, useCallback, useRef } from 'react'
import useStore from '@/store/useStore'

// Keep WS outside React to avoid re-render loops entirely
let globalWs = null

export function useDeployment() {
  // Use individual selectors to prevent full-store re-renders
  const session = useStore(s => s.session)
  const settings = useStore(s => s.settings)
  const startSession = useStore(s => s.startSession)
  const endSession = useStore(s => s.endSession)
  const pushMetricSnapshot = useStore(s => s.pushMetricSnapshot)
  const setScoringResult = useStore(s => s.setScoringResult)
  const pushAlert = useStore(s => s.pushAlert)
  const clearAlerts = useStore(s => s.clearAlerts)
  const setAiLoading = useStore(s => s.setAiLoading)
  const appendAiToken = useStore(s => s.appendAiToken)
  const finishAi = useStore(s => s.finishAi)
  const clearAiText = useStore(s => s.clearAiText)

  // Ref for the current session ID so the WS handler always sees latest
  const sessionRef = useRef(null)
  useEffect(() => { sessionRef.current = session?.id ?? null }, [session?.id])

  // ── Single persistent WebSocket connection with reconnection ──────
  useEffect(() => {
    if (globalWs && globalWs.readyState <= 1) return // already connected or connecting

    let reconnectDelay = 1000
    let reconnectTimer = null
    let intentionalClose = false

    function connect() {
      const ws = new WebSocket('ws://localhost:3001')
      globalWs = ws

      ws.onopen = () => {
        console.log('[WS] Connected to backend')
        reconnectDelay = 1000 // reset backoff on success
      }

      ws.onmessage = (event) => {
        const { type, payload } = JSON.parse(event.data)
        const sid = sessionRef.current
        const store = useStore.getState()

        switch (type) {
          case 'METRIC_TICK':
            if (sid && sid === payload.sessionId) {
              store.pushMetricSnapshot(payload.snapshot)
              store.setScoringResult(payload.scoring, payload.attribution)
            }
            break

          case 'ALERT':
            if (sid && sid === payload.deploymentId) {
              store.pushAlert(payload)
            }
            break

          case 'AI_STREAM_START':
            if (sid && sid === payload.sessionId) {
              store.setAiLoading(true)
              store.clearAiText()
            }
            break

          case 'AI_STREAM_TOKEN':
            if (sid && sid === payload.sessionId) {
              store.appendAiToken(payload.text)
            }
            break

          case 'AI_STREAM_DONE':
            if (sid && sid === payload.sessionId) {
              store.finishAi(payload.retrieved)
            }
            break
        }
      }

      ws.onerror = (err) => console.error('[WS] Error:', err)
      ws.onclose = () => {
        console.log('[WS] Disconnected')
        globalWs = null
        // Auto-reconnect with exponential backoff
        if (!intentionalClose) {
          console.log(`[WS] Reconnecting in ${reconnectDelay / 1000}s...`)
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 10000)
            connect()
          }, reconnectDelay)
        }
      }
    }

    connect()

    return () => {
      intentionalClose = true
      clearTimeout(reconnectTimer)
      if (globalWs) { globalWs.close(); globalWs = null }
    }
  }, []) // Only run once on mount

  // ── Deploy function ────────────────────────────────────────────────
  const deploy = useCallback(async (type, service, failureMode) => {
    console.log('[Deploy] Button clicked!', { type, service, failureMode, hasSession: !!session })
    if (session) {
      console.log('[Deploy] Blocked — session already active:', session.id)
      return
    }

    clearAlerts()
    clearAiText()

    try {
      console.log('[Deploy] Sending POST to backend...')
      const res = await fetch('http://localhost:3001/api/webhook/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.selectedApiKey || 'test-api-key'
        },
        body: JSON.stringify({
          service: service || settings.selectedService,
          environment: 'production',
          mode: type === 'DEGRADED' ? (failureMode || settings.selectedFailure) : null,
          deployType: type
        })
      })

      const data = await res.json()
      console.log('[Deploy] Response:', data)

      if (!res.ok) {
        console.error('[Deploy] Backend error:', data)
        return
      }

      startSession({
        id: data.sessionId,
        type,
        service: service || settings.selectedService,
        failureMode: failureMode || settings.selectedFailure
      })

    } catch (err) {
      console.error('[Deploy API Error]', err)
    }

  }, [session, settings, startSession, clearAlerts, clearAiText])

  const stopDeploy = useCallback(async () => {
    if (!session?.id) return
    try {
      await fetch(`http://localhost:3001/api/webhook/deploy/stop/${session.id}`, { method: 'POST' })
    } catch (e) {
      console.error(e)
    }
    endSession()
  }, [session, endSession])

  const manualAnalyze = useCallback(async () => {
    if (!session?.id) return
    try {
      await fetch(`http://localhost:3001/api/session/${session.id}/analyze`, { method: 'POST' })
    } catch (e) {
      console.error('Failed to trigger manual analysis:', e)
    }
  }, [session])

  return {
    deploy,
    stopDeploy,
    manualAnalyze,
    engineStats: { ifStats: { nTrees: 80 }, tickN: 0 }
  }
}
