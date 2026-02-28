/**
 * AttributionEngine — Z-score per-metric causal attribution
 *
 * Identifies WHICH metric is driving the anomaly score.
 * Equivalent to SHAP values in the full production system.
 *
 * Z-score = (current - baselineMean) / baselineStd
 * Higher absolute Z = this metric deviates more from its baseline.
 * The metric with highest |Z| is the primary causal driver.
 */

const METRIC_META = [
  { key: 'rate',       label: 'Request Rate', unit: 'req/s', inverse: true  },
  { key: 'errorRate',  label: 'Error Rate',   unit: '%',     inverse: false },
  { key: 'p99',        label: 'P99 Latency',  unit: 'ms',    inverse: false },
  { key: 'saturation', label: 'Saturation',   unit: '%',     inverse: false },
]

export class AttributionEngine {
  /**
   * Compute Z-score attribution for each metric.
   * baseline = first 48 ticks of history (the "normal" window).
   * snapshot = current metric values being scored.
   */
  compute(snapshot, baseline) {
    if (!snapshot || baseline.length < 10) return []

    return METRIC_META.map(({ key, label, unit, inverse }) => {
      const vals = baseline.map(h => h[key]).filter(v => v != null && !isNaN(v))
      if (!vals.length) return null

      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
      const std = Math.sqrt(variance) || 1

      const cur = snapshot[key] ?? 0
      const rawZ = (cur - mean) / std
      // For metrics where decrease = anomaly (request rate drop), invert sign
      const z = inverse ? -rawZ : rawZ
      const pct = ((cur - mean) / Math.abs(mean || 1)) * 100

      return {
        key, label, unit, inverse,
        cur: Number(cur.toFixed(2)),
        mean: Number(mean.toFixed(2)),
        std: Number(std.toFixed(2)),
        z: Number(Math.abs(z).toFixed(3)),
        rawZ: Number(rawZ.toFixed(3)),
        pct: Number(pct.toFixed(1)),
        severity: Math.abs(z) > 3.5 ? 'critical'
                : Math.abs(z) > 2.0 ? 'warning'
                : Math.abs(z) > 1.0 ? 'elevated'
                : 'normal',
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.z - a.z) // highest deviation first
  }

  /** Summarise attribution as a human-readable string */
  summarise(attrs) {
    if (!attrs.length) return 'No attribution data'
    const top = attrs[0]
    const direction = top.pct > 0 ? 'above' : 'below'
    return `${top.label} is ${Math.abs(top.pct).toFixed(0)}% ${direction} baseline (Z=${top.z.toFixed(2)})`
  }

  /** Build compact payload suitable for RAG prompt injection */
  toPromptContext(attrs) {
    return attrs.slice(0, 3).map(a =>
      `${a.label}: ${a.cur}${a.unit} (baseline ${a.mean}${a.unit}, ${a.pct > 0 ? '+' : ''}${a.pct}%, Z=${a.z})`
    ).join('\n')
  }

  getMetricMeta() { return METRIC_META }
}
