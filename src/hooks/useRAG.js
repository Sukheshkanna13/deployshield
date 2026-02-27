/**
 * useRAG — RAG pipeline initialization hook
 * Initializes the vector store on app mount.
 */
import { useEffect } from 'react'
import { ragPipeline } from '@/ai/ragPipeline'
import useStore from '@/store/useStore'

export function useRAG() {
  const setRagStatus = useStore(s => s.setRagStatus)

  useEffect(() => {
    ragPipeline.initialize().then(() => {
      setRagStatus(ragPipeline.getStats())
    })
  }, [])

  return ragPipeline
}
