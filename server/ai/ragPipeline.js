/**
 * RAG Pipeline — Retrieval-Augmented Generation for deployment analysis
 *
 * Flow:
 *   1. Current anomaly snapshot → metric fingerprint (embedding)
 *   2. Cosine similarity search over AIOPS incident knowledge base via PostgreSQL pgvector
 *   3. Top-3 similar historical incidents retrieved
 *   4. Retrieved incidents injected into Claude prompt as context
 *
 * This makes Claude's analysis grounded in real historical patterns
 * rather than just raw number analysis.
 */
import { VectorStore } from './vectorStore.js'
import { buildMetricFingerprint } from './embeddings.js'
import aiopIncidents from '../data/aiops_incidents.json' with { type: "json" }
import crypto from 'crypto'

function stringToUUID(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

class RAGPipeline {
  constructor() {
    this.store = new VectorStore()
    this.initialized = false
  }

  /**
   * Build the knowledge base from AIOPS incident dataset.
   * Called once on app load. Embeds all incidents into the postgres vector store.
   */
  async initialize() {
    if (this.initialized) return this

    console.log('[RAG] Populating pgvector knowledge base...')

    // In a real prod environment we wouldn't seed from JSON on boot, but this preserves the demo flow
    const docs = aiopIncidents.map(incident => ({
      id: stringToUUID(incident.id),
      embedding: buildMetricFingerprint(incident.attribution),
      metadata: incident
    }))

    await this.store.addAll(docs)

    this.initialized = true
    const size = await this.store.size()
    console.log(`[RAG] Initialized with ${size} incidents in Postgres`)
    return this
  }

  /**
   * Retrieve most similar historical incidents to current anomaly from Postgres.
   * Returns top-k results with similarity scores + full metadata.
   */
  async retrieve(currentAttribution, topK = 3) {
    if (!this.initialized) {
      console.warn('[RAG] Pipeline not initialized. Call initialize() first.')
      return []
    }
    const queryEmbedding = buildMetricFingerprint(currentAttribution)

    // Using L2 distance via pgvector's <-> operator natively
    return await this.store.query(queryEmbedding, topK)
  }

  /**
   * Build the RAG context string to inject into Claude's prompt.
   * Formats retrieved incidents as structured context.
   */
  buildContext(retrievedIncidents) {
    if (!retrievedIncidents.length) return ''

    const lines = ['SIMILAR HISTORICAL INCIDENTS (from AIOPS knowledge base):']
    for (const { similarity, metadata: inc } of retrievedIncidents) {
      lines.push('')
      lines.push(`[Incident ${inc.id} — Distance: ${similarity.toFixed(4)}]`)
      lines.push(`Pattern: ${inc.pattern || inc.title}`)
      lines.push(`Root Cause: ${inc.rootCause}`)
      lines.push(`Resolution: ${inc.resolution}`)
      if (inc.duration) lines.push(`Duration: ${inc.duration} | Severity: ${inc.severity}`)
      if (inc.service) lines.push(`Service: ${inc.service}`)
    }

    return lines.join('\n')
  }

  async getStats() {
    return {
      initialized: this.initialized,
      totalIncidents: await this.store.size(),
    }
  }
}

// Singleton — shared RAG pipeline instance
export const ragPipeline = new RAGPipeline()
