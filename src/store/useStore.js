/**
 * Global Zustand store — single source of truth for all app state
 *
 * State slices:
 *   session      — active deployment monitoring session
 *   deployments  — historical deployment records
 *   metrics      — live metric stream + scoring results
 *   alerts       — alert log across all sessions
 *   ai           — Claude analysis state
 *   settings     — user-configurable thresholds + preferences
 *   rag          — RAG pipeline status
 */
import { create } from 'zustand'

const useStore = create((set, get) => ({
  // ── Active session ─────────────────────────────────────────────────────
  session: null,           // { id, type, service, failureMode, startTime, maxScore }

  startSession: ({ type, service = 'api-gateway', failureMode = 'downstream_fail' }) => {
    const id = `dp-${Date.now().toString(36)}`
    set({
      session: { id, type, service, failureMode, startTime: Date.now(), maxScore: 0 },
      metrics: { history: [], snapshot: null, scoring: { score: 0, phase: 'IDLE' }, attrs: [] },
      alerts: [],
      ai: { text: '', loading: false, error: null, retrieved: [] },
    })
    return id
  },

  endSession: () => {
    const { session, metrics, deployments } = get()
    if (!session) return
    const record = {
      ...session,
      endTime: Date.now(),
      duration: Date.now() - session.startTime,
      finalScore: metrics.scoring.score,
      maxScore: session.maxScore,
      alertCount: get().alerts.length,
      status: (session.maxScore >= 72) ? 'FLAGGED' : 'STABLE',
      scoreHistory: metrics.scoring.scoreHistory || [],
    }
    set({ session: null, deployments: [record, ...deployments] })
  },

  updateSessionMaxScore: (score) => {
    const { session } = get()
    if (session && score > session.maxScore) {
      set({ session: { ...session, maxScore: score } })
    }
  },

  // ── Historical deployments ──────────────────────────────────────────────
  deployments: [],

  clearDeployments: () => set({ deployments: [] }),

  // ── Live metrics ────────────────────────────────────────────────────────
  metrics: {
    history:  [],
    snapshot: null,
    scoring:  { score: 0, phase: 'IDLE' },
    attrs:    [],
  },

  pushMetricSnapshot: (snapshot) => {
    const { metrics } = get()
    const updated = [...metrics.history, snapshot].slice(-144) // 12 min @ 5s
    set({ metrics: { ...metrics, history: updated, snapshot } })
  },

  setScoringResult: (scoring, attrs) => {
    const { metrics } = get()
    get().updateSessionMaxScore(scoring.score)
    set({ metrics: { ...metrics, scoring, attrs } })
  },

  // ── Alerts ──────────────────────────────────────────────────────────────
  alerts: [],

  pushAlert: (alert) => {
    set(state => ({ alerts: [alert, ...state.alerts].slice(0, 50) }))
  },

  clearAlerts: () => set({ alerts: [] }),

  // ── AI / Claude ─────────────────────────────────────────────────────────
  ai: { text: '', loading: false, error: null, retrieved: [] },

  setAiLoading:   (loading)   => set(state => ({ ai: { ...state.ai, loading, error: null } })),
  appendAiToken:  (token)     => set(state => ({ ai: { ...state.ai, text: state.ai.text + token } })),
  setAiError:     (error)     => set(state => ({ ai: { ...state.ai, error, loading: false } })),
  setAiRetrieved: (retrieved) => set(state => ({ ai: { ...state.ai, retrieved } })),
  clearAiText:    ()          => set(state => ({ ai: { ...state.ai, text: '', retrieved: [] } })),
  finishAi:       (retrieved = []) => set(state => ({
    ai: { ...state.ai, loading: false, retrieved: retrieved || state.ai.retrieved }
  })),

  // ── Settings ────────────────────────────────────────────────────────────
  settings: {
    apiKey: '',                    // Anthropic API key (user can set in Settings page)
    thresholds: {
      warning:   50,
      critical:  72,
      emergency: 86,
    },
    tickIntervalMs:  5000,         // metric collection interval
    scoreIntervalMs: 15000,        // scoring interval (every 3 ticks)
    baselineTicks:   48,           // ticks needed before IF trains
    autoAnalyze:     true,         // auto-call Claude on CRITICAL
    selectedService: 'api-gateway',
    selectedFailure: 'downstream_fail',
  },

  updateSettings: (patch) => set(state => ({
    settings: { ...state.settings, ...patch }
  })),

  updateThresholds: (patch) => set(state => ({
    settings: {
      ...state.settings,
      thresholds: { ...state.settings.thresholds, ...patch }
    }
  })),

  // ── RAG pipeline status ─────────────────────────────────────────────────
  ragStatus: { initialized: false, totalIncidents: 0 },
  setRagStatus: (status) => set({ ragStatus: status }),
}))

export default useStore
