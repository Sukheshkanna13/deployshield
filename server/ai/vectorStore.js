import { prisma } from '../db.js'

export class VectorStore {
  /**
   * Add a new incident with its embedding vector to the PostgreSQL database.
   * Uses $executeRaw because Prisma doesn't natively support creating pgvector Unsupported fields yet.
   */
  async add(id, embedding, metadata) {
    const vectorString = `[${embedding.join(',')}]`

    // We use a raw SQL insert to handle the vector(12) cast
    await prisma.$executeRaw`
      INSERT INTO "Incident" (id, title, description, "rootCause", resolution, embedding)
      VALUES (${id}::uuid, ${metadata.title}, ${metadata.description}, ${metadata.rootCause}, ${metadata.resolution}, ${vectorString}::vector)
      ON CONFLICT (id) DO NOTHING
    `
  }

  /** Add multiple documents using a single raw SQL query block to bypass prepared statements */
  async addAll(docs) {
    if (!docs.length) return

    const values = docs.map(doc => {
      const vectorString = `[${doc.embedding.join(',')}]`
      const title = doc.metadata.pattern.replace(/'/g, "''")
      const desc = `Service: ${doc.metadata.service} | Severity: ${doc.metadata.severity} | Duration: ${doc.metadata.duration}`.replace(/'/g, "''")
      const cause = doc.metadata.rootCause.replace(/'/g, "''")
      const res = doc.metadata.resolution.replace(/'/g, "''")
      return `('${doc.id}'::uuid, '${title}', '${desc}', '${cause}', '${res}', '${vectorString}'::vector)`
    }).join(', ')

    await prisma.$executeRawUnsafe(`
      INSERT INTO "Incident" (id, title, description, "rootCause", resolution, embedding)
      VALUES 
      ${values}
      ON CONFLICT (id) DO NOTHING
    `)
  }

  /**
   * Find the top-k most similar incidents to a query embedding using pgvector.
   * <-> is the L2 distance operator. We order by distance ascending.
   */
  async query(queryEmbedding, topK = 3) {
    const vectorString = `[${queryEmbedding.join(',')}]`

    // We select the metadata and compute the exact distance
    const results = await prisma.$queryRaw`
      SELECT 
        id, 
        title, 
        description, 
        "rootCause", 
        resolution,
        1 - (embedding <=> ${vectorString}::vector) AS similarity
      FROM "Incident"
      ORDER BY embedding <=> ${vectorString}::vector
      LIMIT ${topK}
    `

    // Map the raw SQL result rows back into the expected { id, similarity, metadata } shape
    return results.map(row => ({
      id: row.id,
      similarity: Number(row.similarity),
      metadata: {
        title: row.title,
        description: row.description,
        rootCause: row.rootCause,
        resolution: row.resolution
      }
    }))
  }

  async size() {
    return await prisma.incident.count()
  }

  async clear() {
    await prisma.incident.deleteMany()
  }
}
