import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadLotsData, persistLotsData, receiveProduce, recordInspection, createSample, reconcileActualReceivedQuantity, addSublotEvidence as appendSublotEvidence } from '../services/LotsService'
import type { LotsData, ReceiptInput } from '../services/LotsService'
import type { EvidenceAttachment, Inspection, Lot, Sample } from '../types'
import { useSupplyPlanning } from './SupplyPlanningContext'

interface LotsContextValue {
  data: LotsData
  receive: (input: ReceiptInput) => Lot
  inspect: (lotId: string, input: Omit<Inspection, 'id' | 'lotId' | 'historyRecordedAt'>) => void
  addSample: (lotId: string, input: Omit<Sample, 'id' | 'lotId'>) => void
  addSublotEvidence: (lotId: string, sublotId: string, attachment: EvidenceAttachment, actor: string) => void
  reconcile: (lot: Lot, actor: string) => void
}
const LotsContext = createContext<LotsContextValue | null>(null)

export function LotsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LotsData>(loadLotsData)
  const supply = useSupplyPlanning()
  useEffect(() => persistLotsData(data), [data])
  const value = useMemo<LotsContextValue>(() => ({
    data,
    receive(input) {
      const result = receiveProduce(data, supply.data, input)
      setData(result.data)
      return result.lot
    },
    inspect(lotId, input) { setData((current) => recordInspection(current, lotId, input)) },
    addSample(lotId, input) { setData((current) => createSample(current, lotId, input)) },
    addSublotEvidence(lotId, sublotId, attachment, actor) { setData((current) => appendSublotEvidence(current, lotId, sublotId, attachment, actor)) },
    reconcile(lot, actor) {
      supply.reconcileReceipt(lot.supplyPlanId, lot.farmerId, lot.plotId, lot.cropCycleId, lot.weights.netReceivedWeightKg, actor)
      setData((current) => ({ lots: current.lots.map((item) => item.id === lot.id ? reconcileActualReceivedQuantity(item, actor) : item) }))
    },
  }), [data, supply])
  return <LotsContext.Provider value={value}>{children}</LotsContext.Provider>
}

export function useLots() {
  const context = useContext(LotsContext)
  if (!context) throw new Error('useLots must be used inside LotsProvider')
  return context
}
