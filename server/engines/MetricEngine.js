/**
 * MetricEngine — Autoregressive AR(1) metric generator
 *
 * In production: replaced by Go ingestion worker polling Prometheus.
 * Here: AR(1) process — each value correlated with previous (phi=0.82).
 * Box-Muller transform for true Gaussian noise.
 * DEGRADED mode ramps anomaly injection over 90 seconds.
 */
export class MetricEngine {
  constructor(serviceProfile = 'api-gateway') {
    this.phi = 0.82       // autocorrelation — high = slow realistic changes
    this.mode = 'IDLE'    // IDLE | NORMAL | DEGRADED
    this.ramp = 0         // 0→1 over 90s in DEGRADED mode
    this.tickCount = 0
    this.profile = serviceProfile

    // Service baseline profiles — different services have different normals
    this.profiles = {
      'api-gateway':     { rate: 1240, errorRate: 0.75, p99: 172, saturation: 40 },
      'payment-svc':     { rate: 340,  errorRate: 0.42, p99: 89,  saturation: 28 },
      'auth-svc':        { rate: 890,  errorRate: 0.31, p99: 54,  saturation: 35 },
      'order-processor': { rate: 180,  errorRate: 1.1,  p99: 340, saturation: 55 },
    }

    // Per-metric standard deviations (noise level)
    this.devs = { rate: 55, errorRate: 0.18, p99: 9, saturation: 3.2 }

    // Anomaly shift magnitudes per failure mode
    this.anomalyModes = {
      db_timeout:       { rate: -220, errorRate: 8.4,  p99: 680,  saturation: 22 },
      memory_leak:      { rate: -80,  errorRate: 2.1,  p99: 220,  saturation: 58 },
      cpu_spike:        { rate: -400, errorRate: 5.2,  p99: 440,  saturation: 52 },
      downstream_fail:  { rate: -640, errorRate: 12.4, p99: 710,  saturation: 14 },
    }

    this.failureMode = 'downstream_fail'
    this.base = { ...(this.profiles[serviceProfile] || this.profiles['api-gateway']) }
    this.curr = { ...this.base }
  }

  /** Box-Muller transform — true Gaussian random variable */
  gaussian() {
    let u, v
    do { u = Math.random(); v = Math.random() } while (u === 0)
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  getShift(key) {
    const shifts = this.anomalyModes[this.failureMode] || this.anomalyModes.downstream_fail
    return (shifts[key] ?? 0) * this.ramp
  }

  tick() {
    if (this.mode === 'IDLE') return null
    if (this.mode === 'DEGRADED') this.ramp = Math.min(1, this.ramp + 1 / 18)
    this.tickCount++
    const snap = {}
    for (const key of Object.keys(this.base)) {
      const shift = this.mode === 'DEGRADED' ? this.getShift(key) : 0
      const noise = this.gaussian() * this.devs[key] * 0.25
      const next = this.phi * this.curr[key] + (1 - this.phi) * (this.base[key] + shift) + noise
      snap[key] = Math.max(0,
        key === 'errorRate'  ? Math.min(50, next)  :
        key === 'saturation' ? Math.min(100, next) : next)
    }
    this.curr = { ...snap }
    return { ...snap, ts: Date.now(), tick: this.tickCount }
  }

  setMode(mode, failureMode = 'downstream_fail') {
    this.mode = mode
    this.failureMode = failureMode
    this.ramp = 0
    this.tickCount = 0
    if (mode !== 'DEGRADED') this.curr = { ...this.base }
  }

  setProfile(profileName) {
    this.profile = profileName
    this.base = { ...(this.profiles[profileName] || this.profiles['api-gateway']) }
    this.curr = { ...this.base }
  }

  getBaseline() { return { ...this.base } }
  getProfiles() { return Object.keys(this.profiles) }
}
