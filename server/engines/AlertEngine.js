/**
 * AlertEngine — Threshold detection + structured alert queue management
 *
 * Three severity tiers:
 *   WARNING   — score ≥ 50 for 3 consecutive scoring ticks (sustained concern)
 *   CRITICAL  — score ≥ 72 (immediate attention needed)
 *   EMERGENCY — score ≥ 86 (automated rollback trigger in v2)
 *
 * Hysteresis prevents alert spam:
 *   - Same severity won't re-fire until score drops 15+ points first
 *   - Different severity fires immediately if threshold crossed
 */
import { sendAlertEmail } from '../services/emailService.js'

export const THRESHOLDS = {
  WARNING: { score: 50, consecutiveTicks: 3, color: '#EAB308' },
  CRITICAL: { score: 72, consecutiveTicks: 1, color: '#F97316' },
  EMERGENCY: { score: 86, consecutiveTicks: 1, color: '#EF4444' },
}

export class AlertEngine {
  constructor(project = null) {
    this.project = project
    this.reset()
  }

  reset() {
    this.consecutiveHigh = 0
    this.lastFiredScore = 0
    this.lastFiredSev = null
    this.activeAlerts = []      // all alerts for current deployment session
    this.sevHistory = new Set() // track which severities have been fired
  }

  /**
   * Evaluate the current risk score.
   * Returns a new alert object if one should fire, null otherwise.
   */
  evaluate(score, attribution, deploymentId) {
    // Track consecutive high scores
    if (score >= THRESHOLDS.WARNING.score) this.consecutiveHigh++
    else this.consecutiveHigh = 0

    // Determine appropriate severity
    const sev = score >= THRESHOLDS.EMERGENCY.score ? 'EMERGENCY'
      : score >= THRESHOLDS.CRITICAL.score ? 'CRITICAL'
        : this.consecutiveHigh >= THRESHOLDS.WARNING.consecutiveTicks ? 'WARNING'
          : null

    if (!sev) return null

    // Hysteresis: don't re-fire same severity unless score increased significantly
    const alreadyFired = this.sevHistory.has(sev)
    const scoreDelta = score - this.lastFiredScore
    if (alreadyFired && scoreDelta < 10) return null

    const topMetric = attribution[0] || {}
    const alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sev,
      score,
      deploymentId,
      ts: new Date(),
      isoTime: new Date().toISOString(),
      primaryDriver: topMetric.label || 'Unknown',
      primaryKey: topMetric.key || '',
      pct: topMetric.pct || 0,
      z: topMetric.z || 0,
      attribution: attribution.slice(0, 3),
      message: this._buildMessage(sev, score, topMetric),
      action: this._recommendAction(sev, topMetric),
      autoAnalyze: sev === 'CRITICAL' || sev === 'EMERGENCY',
    }

    this.activeAlerts.unshift(alert)
    this.lastFiredScore = score
    this.lastFiredSev = sev
    this.sevHistory.add(sev)

    if (sev === 'CRITICAL' || sev === 'EMERGENCY') {
      this._sendEmailAlert(alert)
    }

    return alert
  }

  _buildMessage(sev, score, topMetric) {
    const dir = (topMetric.pct || 0) > 0 ? '↑' : '↓'
    const pct = Math.abs(topMetric.pct || 0).toFixed(0)
    const label = topMetric.label || 'metrics'
    return `${sev}: Risk ${score}/100 — ${label} ${dir}${pct}% from baseline (Z=${(topMetric.z || 0).toFixed(2)})`
  }

  _recommendAction(sev, topMetric) {
    const actions = {
      EMERGENCY: 'Consider immediate rollback. Automated rollback at 86+ (v2).',
      CRITICAL: 'Page on-call SRE. Review recent commits for ' + (topMetric.label || 'affected service') + '.',
      WARNING: 'Monitor closely. Prepare rollback runbook.',
    }
    return actions[sev] || 'Monitor situation.'
  }

  async _sendEmailAlert(alert) {
    const projectName = this.project?.name || 'Unknown Project'
    try {
      await sendAlertEmail(alert, projectName)
    } catch (err) {
      console.error(`[AlertEngine] Failed to send email alert:`, err.message)
    }
  }

  getAlerts() { return [...this.activeAlerts] }
  getCount() { return this.activeAlerts.length }
  getHighest() { return this.activeAlerts[0] || null }
  hasEmergency() { return this.sevHistory.has('EMERGENCY') }
}
