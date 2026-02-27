/**
 * scripts/prepareDataset.js
 *
 * One-time script: if you download the real AIOPS Challenge 2020 dataset
 * (https://github.com/NetManAIOps/AIOps-Challenge-2020-Data), run this
 * to convert the CSV into the format expected by ragPipeline.js.
 *
 * Usage: node scripts/prepareDataset.js --input ./raw/anomalies.csv --output ./src/data/aiops_incidents.json
 *
 * For the hackathon prototype, src/data/aiops_incidents.json is already
 * pre-populated with 12 real-pattern incidents.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs() {
  const args = process.argv.slice(2)
  const input  = args[args.indexOf('--input')  + 1] || null
  const output = args[args.indexOf('--output') + 1] || path.join(__dirname, '../src/data/aiops_incidents.json')
  return { input, output }
}

function convertAIOPSRow(row, idx) {
  // Expected CSV columns (AIOPS 2020 format):
  // timestamp, service, metric_name, value, is_anomaly, anomaly_type, root_cause, resolution
  const parts = row.split(',')
  if (parts.length < 6 || parts[4] !== '1') return null // skip non-anomalies

  return {
    id: `INC-${String(idx).padStart(3, '0')}`,
    pattern: `${parts[2]} anomaly in ${parts[1]}`,
    rootCause: parts[6] || 'Unknown root cause',
    resolution: parts[7] || 'Investigate and rollback',
    duration: '—',
    severity: 'CRITICAL',
    service: parts[1] || 'unknown',
    attribution: [
      { key: 'rate',       label: 'Request Rate', unit: 'req/s', z: 1.0, rawZ: -1.0, pct: -20 },
      { key: 'errorRate',  label: 'Error Rate',   unit: '%',     z: 0.5, rawZ: 0.5,  pct: 50  },
      { key: 'p99',        label: 'P99 Latency',  unit: 'ms',    z: 0.3, rawZ: 0.3,  pct: 30  },
      { key: 'saturation', label: 'Saturation',   unit: '%',     z: 0.2, rawZ: 0.2,  pct: 15  },
    ]
  }
}

async function main() {
  const { input, output } = parseArgs()

  if (!input) {
    console.log('[prepareDataset] No --input specified.')
    console.log('Using pre-built aiops_incidents.json (already in src/data/).')
    console.log('')
    console.log('To use the real AIOPS dataset:')
    console.log('  1. Download from: https://github.com/NetManAIOps/AIOps-Challenge-2020-Data')
    console.log('  2. Run: node scripts/prepareDataset.js --input ./raw/anomalies.csv')
    return
  }

  const csv = fs.readFileSync(input, 'utf-8')
  const rows = csv.trim().split('\n').slice(1) // skip header

  let idx = 1
  const incidents = rows
    .map(row => convertAIOPSRow(row, idx++))
    .filter(Boolean)

  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(incidents, null, 2))

  console.log(`[prepareDataset] Converted ${incidents.length} anomaly records → ${output}`)
}

main().catch(console.error)
