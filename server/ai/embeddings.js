/**
 * Embeddings — Metric snapshot encoder for RAG retrieval
 *
 * For the RAG pipeline, we need to embed metric snapshots so we can
 * find historically similar incidents via cosine similarity.
 *
 * Two approaches:
 *   1. Anthropic embeddings API (most accurate, uses a call)
 *   2. Feature-engineered fingerprint (fast, zero API calls, used here)
 *
 * The fingerprint approach encodes the Z-score attribution vector
 * as a normalised 12-dimensional vector — captures the "shape" of an
 * anomaly without an API call. Works well for retrieval since incidents
 * with similar Z-score patterns have similar root causes.
 */

/**
 * Build a metric fingerprint from attribution data.
 * Output: 12-dimensional float vector.
 *
 * Dimensions:
 *   [0]  normalised rate Z-score
 *   [1]  normalised errorRate Z-score
 *   [2]  normalised p99 Z-score
 *   [3]  normalised saturation Z-score
 *   [4]  rate deviation direction (-1 or +1)
 *   [5]  errorRate deviation direction
 *   [6]  p99 deviation direction
 *   [7]  saturation deviation direction
 *   [8]  combined Z magnitude (overall severity)
 *   [9]  top driver index (0-3 encoded as 0.0, 0.33, 0.67, 1.0)
 *   [10] rate-to-p99 correlation signal
 *   [11] error-to-saturation correlation signal
 */
export function buildMetricFingerprint(attribution) {
  if (!attribution || attribution.length === 0) return new Array(12).fill(0)

  const keys = ['rate', 'errorRate', 'p99', 'saturation']
  const zScores = {}
  const dirs = {}

  for (const a of attribution) {
    zScores[a.key] = a.z || 0
    dirs[a.key] = a.rawZ >= 0 ? 1 : -1
  }

  const maxZ = Math.max(...Object.values(zScores), 0.001)
  // Normalise Z-scores to 0-1 range
  const normZ = keys.map(k => (zScores[k] || 0) / maxZ)
  const dirVec = keys.map(k => dirs[k] || 0)

  const combinedMag = normZ.reduce((a, b) => a + b, 0) / normZ.length
  const topDriverIdx = attribution.findIndex(a => a.z === Math.max(...attribution.map(x => x.z)))
  const topDriverEncoded = topDriverIdx / Math.max(attribution.length - 1, 1)

  // Cross-metric correlation signals
  const rateSig = normZ[0] * dirVec[0]    // rate direction
  const p99Sig  = normZ[2] * dirVec[2]    // p99 direction
  const errSig  = normZ[1] * dirVec[1]
  const satSig  = normZ[3] * dirVec[3]

  return [
    ...normZ,          // dims 0-3: normalised Z magnitudes
    ...dirVec,         // dims 4-7: direction (+1/-1) per metric
    combinedMag,       // dim 8: overall anomaly magnitude
    topDriverEncoded,  // dim 9: which metric is primary driver
    rateSig * p99Sig,  // dim 10: rate-p99 correlation (db timeout pattern)
    errSig * satSig,   // dim 11: error-saturation correlation (cpu/mem pattern)
  ]
}

/**
 * Build fingerprint directly from raw metric snapshot + baseline stats.
 * Used when full attribution object isn't available.
 */
export function buildSnapshotFingerprint(snapshot, baselineMeans, baselineStds) {
  const keys = ['rate', 'errorRate', 'p99', 'saturation']
  const pseudoAttribution = keys.map((key, i) => {
    const mean = baselineMeans[key] || 1
    const std  = baselineStds[key]  || 1
    const cur  = snapshot[key] || 0
    const rawZ = (cur - mean) / std
    return { key, z: Math.abs(rawZ), rawZ, pct: ((cur - mean) / Math.abs(mean)) * 100 }
  }).sort((a, b) => b.z - a.z)
  return buildMetricFingerprint(pseudoAttribution)
}
