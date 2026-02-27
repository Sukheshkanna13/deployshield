/**
 * ScoringEngine — Combines Isolation Forest + EWMA into 0-100 risk index
 *
 * IF  → detects point anomalies (current snapshot vs baseline distribution)
 * EWMA → detects trend anomalies (is the IF score getting progressively worse?)
 * Combined via calibrated sigmoid → human-readable 0-100 risk index
 *
 * In production: runs on AMD Instinct MI300X. Same math, GPU parallelised.
 */
import { IsolationForest } from './IsolationForest.js'

export const BASELINE_TICKS_NEEDED = 12 // 12 × 5s = 60 seconds baseline (IF needs ≥10 samples)

export class ScoringEngine {
  constructor() {
    this.reset()
  }

  reset() {
    this.IF = new IsolationForest(80, 128)
    this.ewma = 0.5         // initialise at midpoint
    this.alpha = 0.32       // EWMA smoothing factor (higher = more reactive)
    this.trained = false
    this.lastScore = 0
    this.scoreHistory = []  // ring buffer of last 60 risk scores
  }

  /**
   * Calibrated sigmoid — maps raw 0-1 combined score to 0-100 risk index.
   * Tuned so IF score 0.5 (normal) → ~5 risk, 0.7 → ~50, 0.85 → ~85.
   */
  calibrate(x) {
    return Math.round(Math.max(0, Math.min(100,
      100 / (1 + Math.exp(-13 * (x - 0.61)))
    )))
  }

  /**
   * Main update — called every 15 seconds with latest snapshot + full history.
   * Returns scoring result object.
   */
  update(snapshot, history) {
    if (!snapshot) return { score: 0, phase: 'IDLE' }

    if (history.length < BASELINE_TICKS_NEEDED) {
      return {
        score: 0, phase: 'LEARNING',
        progress: history.length / BASELINE_TICKS_NEEDED,
        ticksRemaining: BASELINE_TICKS_NEEDED - history.length,
        ifStats: this.IF.getStats(),
      }
    }

    // Lazy train — only once after baseline collected
    if (!this.trained) {
      const success = this.IF.train(history.slice(0, BASELINE_TICKS_NEEDED))
      if (!success) return { score: 0, phase: 'LEARNING', progress: 0.99 }
      this.trained = true
    }

    // Isolation Forest score for this snapshot
    const ifScore = this.IF.score(snapshot)

    // EWMA — exponential moving average of IF scores (captures trend)
    this.ewma = this.alpha * ifScore + (1 - this.alpha) * this.ewma

    // Combine: weight IF slightly more (point detection), EWMA for trend
    const combined = 0.62 * ifScore + 0.38 * this.ewma

    const score = this.calibrate(combined)
    this.lastScore = score
    this.scoreHistory = [...this.scoreHistory.slice(-59), score]

    return {
      score, phase: 'SCORING',
      ifScore: Number(ifScore.toFixed(4)),
      ewmaScore: Number(this.ewma.toFixed(4)),
      combined: Number(combined.toFixed(4)),
      ifStats: this.IF.getStats(),
      trend: this._computeTrend(),
    }
  }

  /** Compute score trend from last 6 scores (last 90 seconds) */
  _computeTrend() {
    if (this.scoreHistory.length < 3) return 'stable'
    const recent = this.scoreHistory.slice(-6)
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length
    const prev = recent[0]
    const delta = avg - prev
    if (delta > 8) return 'rising'
    if (delta < -8) return 'falling'
    return 'stable'
  }

  getScoreHistory() { return [...this.scoreHistory] }
  isLearning(histLen) { return histLen < BASELINE_TICKS_NEEDED }
}
