/**
 * RAG Pipeline — Retrieval-Augmented Generation for deployment analysis
 *
 * Flow:
 *   1. Current anomaly snapshot → metric fingerprint (embedding)
 *   2. Cosine similarity search over AIOPS incident knowledge base
 *   3. Top-3 similar historical incidents retrieved
 *   4. Retrieved incidents injected into Claude prompt as context
 *
 * This makes Claude's analysis grounded in real historical patterns
 * rather than just raw number analysis.
 */
import { VectorStore } from './vectorStore'
import { buildMetricFingerprint } from './embeddings'
import aiopIncidents from '../data/aiops_incidents.json'

class RAGPipeline {
  constructor() {
    this.store = new VectorStore()
    this.initialized = false
  }

  /**
   * Build the knowledge base from AIOPS incident dataset.
   * Called once on app load. Embeds all incidents into the vector store.
   */
  async initialize() {
    if (this.initialized) return this

    for (const incident of aiopIncidents) {
      // Build embedding from incident's metric attribution pattern
      const embedding = buildMetricFingerprint(incident.attribution)
      this.store.add(incident.id, embedding, incident)
    }

    this.initialized = true
    console.log(`[RAG] Initialized with ${this.store.size()} incidents`)
    return this
  }

  /**
   * Retrieve most similar historical incidents to current anomaly.
   * Returns top-k results with similarity scores + full metadata.
   */
  retrieve(currentAttribution, topK = 3) {
    if (!this.initialized) {
      console.warn('[RAG] Pipeline not initialized. Call initialize() first.')
      return []
    }
    const queryEmbedding = buildMetricFingerprint(currentAttribution)
    return this.store.query(queryEmbedding, topK, 0.55)
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
      lines.push(`[Incident ${inc.id} — Similarity: ${(similarity * 100).toFixed(0)}%]`)
      lines.push(`Pattern: ${inc.pattern}`)
      lines.push(`Root Cause: ${inc.rootCause}`)
      lines.push(`Resolution: ${inc.resolution}`)
      lines.push(`Duration: ${inc.duration} | Severity: ${inc.severity}`)
      if (inc.service) lines.push(`Service: ${inc.service}`)
    }

    return lines.join('\n')
  }

  getStats() {
    return {
      initialized: this.initialized,
      totalIncidents: this.store.size(),
    }
  }
}

// Singleton — shared RAG pipeline instance
export const ragPipeline = new RAGPipeline()
