/**
 * useDeployment — Session lifecycle management + engine orchestration
 *
 * Owns the engine instances (stable via useRef).
 * Coordinates the full tick loop: MetricEngine → ScoringEngine → AlertEngine → AttributionEngine
 * Wires results into Zustand store.
 * Auto-triggers Claude analysis on CRITICAL/EMERGENCY alerts (rate limited).
 */
import { useRef, useEffect, useCallback } from 'react'
import { MetricEngine }    from '@/engines/MetricEngine'
import { ScoringEngine }   from '@/engines/ScoringEngine'
import { AlertEngine }     from '@/engines/AlertEngine'
import { AttributionEngine } from '@/engines/AttributionEngine'
import { streamAnalysis }  from '@/ai/claudeAnalysis'
import useStore            from '@/store/useStore'

export function useDeployment() {
  const ME  = useRef(new MetricEngine())
  const SE  = useRef(new ScoringEngine())
  const AE  = useRef(new AlertEngine())
  const AtE = useRef(new AttributionEngine())

  const tickN       = useRef(0)
  const histRef     = useRef([])
  const intervalRef = useRef(null)
  const autoFired   = useRef(false)
  const aiInFlight  = useRef(false)

  const {
    session, settings,
    startSession, endSession,
    pushMetricSnapshot, setScoringResult,
    pushAlert, clearAlerts,
    setAiLoading, appendAiToken, finishAi, setAiError, clearAiText,
  } = useStore()

  // ── Tick function — runs every 5 seconds during an active session ──────
  const tick = useCallback(() => {
    const snap = ME.current.tick()
    if (!snap) return

    tickN.current++
    histRef.current = [...histRef.current, snap].slice(-144)
    pushMetricSnapshot(snap)

    // Score every 3rd tick (every 15 seconds)
    if (tickN.current % 3 !== 0) return

    const result = SE.current.update(snap, histRef.current)
    const attrs   = AtE.current.compute(snap, histRef.current.slice(0, settings.baselineTicks))

    setScoringResult(result, attrs)

    if (result.phase !== 'SCORING') return

    const alert = AE.current.evaluate(result.score, attrs, session?.id || 'unknown')
    if (alert) {
      pushAlert(alert)
      // Auto-trigger Claude analysis on first CRITICAL or EMERGENCY
      if (settings.autoAnalyze && !autoFired.current && alert.autoAnalyze && !aiInFlight.current) {
        autoFired.current = true
        triggerAnalysis(result.score, attrs, histRef.current)
      }
    }
  }, [session, settings, pushMetricSnapshot, setScoringResult, pushAlert])

  // ── Start / stop tick loop based on session state ──────────────────────
  useEffect(() => {
    if (session) {
      intervalRef.current = setInterval(tick, settings.tickIntervalMs)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [session?.id, tick, settings.tickIntervalMs])

  // ── Claude analysis trigger ────────────────────────────────────────────
  const triggerAnalysis = useCallback(async (score, attrs, hist) => {
    if (aiInFlight.current) return
    aiInFlight.current = true
    clearAiText()
    setAiLoading(true)

    await streamAnalysis({
      score,
      deploymentId: session?.id || 'unknown',
      attribution:  attrs,
      history:      hist.slice(-6),
      onToken:  token  => appendAiToken(token),
      onDone:   result => {
        finishAi(result?.retrieved || [])
        aiInFlight.current = false
      },
      onError:  msg    => {
        setAiError(msg)
        aiInFlight.current = false
      },
    })
  }, [session, clearAiText, setAiLoading, appendAiToken, finishAi, setAiError])

  // ── Public API ─────────────────────────────────────────────────────────
  const deploy = useCallback((type, service, failureMode) => {
    if (session) return
    // Reset all engines
    SE.current.reset()
    AE.current.reset()
    histRef.current = []
    tickN.current   = 0
    autoFired.current = false
    aiInFlight.current = false

    ME.current.setProfile(service || settings.selectedService)
    ME.current.setMode(type, failureMode || settings.selectedFailure)

    clearAlerts()
    clearAiText()
    startSession({ type, service: service || settings.selectedService, failureMode: failureMode || settings.selectedFailure })
  }, [session, settings, startSession, clearAlerts, clearAiText])

  const stopDeploy = useCallback(() => {
    ME.current.setMode('IDLE')
    endSession()
  }, [endSession])

  const manualAnalyze = useCallback(() => {
    const { metrics } = useStore.getState()
    triggerAnalysis(metrics.scoring.score, metrics.attrs, histRef.current)
  }, [triggerAnalysis])

  return {
    deploy,
    stopDeploy,
    manualAnalyze,
    engineStats: {
      ifStats: SE.current.IF?.getStats() || {},
      tickN: tickN.current,
    }
  }
}
