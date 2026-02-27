/**
 * VectorStore — In-memory vector store with cosine similarity search
 *
 * Used by the RAG pipeline to find historical incidents similar
 * to the current deployment anomaly.
 *
 * In production: replaced by Pinecone/Weaviate/pgvector.
 * Here: pure JS cosine similarity — O(n) scan, fine for <1000 incidents.
 *
 * Each document stored as:
 *   { id, embedding: number[], metadata: {...} }
 */
export class VectorStore {
  constructor() {
    this.documents = []
  }

  /**
   * Add a document with its embedding vector.
   * embedding = float[] of any dimension (must be consistent across all docs)
   */
  add(id, embedding, metadata) {
    this.documents.push({ id, embedding, metadata })
  }

  /** Add multiple documents */
  addAll(docs) {
    for (const { id, embedding, metadata } of docs) {
      this.add(id, embedding, metadata)
    }
  }

  /**
   * Cosine similarity between two vectors.
   * cos(θ) = (A · B) / (|A| × |B|)
   * Range: -1 to 1, higher = more similar
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot   += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }

  /**
   * Find the top-k most similar documents to a query embedding.
   * Returns array of { id, similarity, metadata } sorted descending.
   */
  query(queryEmbedding, topK = 3, minSimilarity = 0.60) {
    if (!this.documents.length) return []
    return this.documents
      .map(doc => ({
        id: doc.id,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
        metadata: doc.metadata,
      }))
      .filter(r => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
  }

  size()  { return this.documents.length }
  clear() { this.documents = [] }

  /**
   * Serialise for persistence (could store in localStorage for demo)
   */
  toJSON() {
    return JSON.stringify(this.documents)
  }

  fromJSON(json) {
    this.documents = JSON.parse(json)
  }
}
