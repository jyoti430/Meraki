import { useCallback, useEffect, useState } from 'react'
import { exporterService } from '../exporterService'
import type { ProcurementRequirement } from '../types'

export default function useRequirements() {
  const [items, setItems] = useState<ProcurementRequirement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setError(null)
    try { setItems(await exporterService.listRequirements()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load exporter requirements.') }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { items, error, refresh }
}
