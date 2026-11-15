import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { EvidenceReviewStatus, ReleaseOutcome } from '../types'
import { useBuyerOrders } from './BuyerOrdersContext'
import { useLots } from './LotsContext'
import { createLaboratoryReport, loadLabReviewData, persistLabReviewData, recordReleaseDecision, reviewLaboratoryEvidence, saveRequirementReviews } from '../services/LabReviewService'
import type { LabReviewData, NewLaboratoryReport, ReviewRequirementInput } from '../services/LabReviewService'

interface LabReviewContextValue {
  data: LabReviewData
  addReport: (input: NewLaboratoryReport) => string
  reviewEvidence: (lotId: string, reportId: string, status: EvidenceReviewStatus, reviewer: string, reason: string) => void
  saveRequirements: (lotId: string, inputs: ReviewRequirementInput[], reviewer: string) => void
  decide: (lotId: string, outcome: ReleaseOutcome, reviewer: string, reason: string) => void
}
const LabReviewContext = createContext<LabReviewContextValue | null>(null)

export function LabReviewProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LabReviewData>(loadLabReviewData)
  const { data: lots } = useLots()
  const { orders } = useBuyerOrders()
  useEffect(() => persistLabReviewData(data), [data])
  const value = useMemo<LabReviewContextValue>(() => ({
    data,
    addReport(input) {
      const lot = lots.lots.find((item) => item.id === input.lotId)
      if (!lot) throw new Error('Lot not found.')
      const result = createLaboratoryReport(data, lot, input)
      setData(result.data)
      return result.report.id
    },
    reviewEvidence(lotId, reportId, status, reviewer, reason) {
      const lot = lots.lots.find((item) => item.id === lotId)
      if (!lot) throw new Error('Lot not found.')
      setData((current) => reviewLaboratoryEvidence(current, lot, reportId, status, reviewer, reason))
    },
    saveRequirements(lotId, inputs, reviewer) {
      const lot = lots.lots.find((item) => item.id === lotId)
      const order = orders.find((item) => item.id === lot?.buyerOrderId)
      if (!lot || !order) throw new Error('Lot or linked buyer order not found.')
      setData((current) => saveRequirementReviews(current, lot, order, inputs, reviewer))
    },
    decide(lotId, outcome, reviewer, reason) {
      const lot = lots.lots.find((item) => item.id === lotId)
      const order = orders.find((item) => item.id === lot?.buyerOrderId)
      if (!lot || !order) throw new Error('Lot or linked buyer order not found.')
      setData((current) => recordReleaseDecision(current, lot, order, outcome, reviewer, reason))
    },
  }), [data, lots.lots, orders])
  return <LabReviewContext.Provider value={value}>{children}</LabReviewContext.Provider>
}

export function useLabReview() {
  const context = useContext(LabReviewContext)
  if (!context) throw new Error('useLabReview must be used inside LabReviewProvider')
  return context
}

