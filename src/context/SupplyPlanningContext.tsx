import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useBuyerOrders } from './BuyerOrdersContext'
import { useFarmers } from './FarmersContext'
import {
  applyManualAllocations, cancelSupplyPlan, confirmSupplyPlan, createSupplyPlan,
  loadSupplyPlanningData, persistSupplyPlanningData, reconcileReservationReceipt,
} from '../services/SupplyPlanningService'
import type { CandidateAdjustment, SupplyPlanningData, SupplyPreview } from '../services/SupplyPlanningService'
import type { SupplyPlan } from '../types'

type SupplyPlanningContextValue = {
  data: SupplyPlanningData
  savePlan: (orderId: string, preview: SupplyPreview, adjustments: Record<string, CandidateAdjustment>, status: 'Draft' | 'Previewed') => SupplyPlan
  confirmNewPlan: (orderId: string, preview: SupplyPreview, adjustments: Record<string, CandidateAdjustment>) => SupplyPlan
  confirmPlan: (planId: string) => void
  cancelPlan: (planId: string, reason: string) => void
  reconcileReceipt: (planId: string, farmerId: string, plotId: string, cropCycleId: string, quantityKg: number, actor: string) => void
}

const SupplyPlanningContext = createContext<SupplyPlanningContextValue | null>(null)

export function SupplyPlanningProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SupplyPlanningData>(loadSupplyPlanningData)
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()

  useEffect(() => persistSupplyPlanningData(data), [data])

  const value = useMemo<SupplyPlanningContextValue>(() => ({
    data,
    savePlan(orderId, preview, adjustments, status) {
      const order = orders.find((item) => item.id === orderId)
      if (!order) throw new Error('Buyer order not found.')
      const adjusted = applyManualAllocations(preview, adjustments)
      const result = createSupplyPlan(data, order, preview, adjusted, status)
      setData(result.data)
      return result.plan
    },
    confirmNewPlan(orderId, preview, adjustments) {
      const order = orders.find((item) => item.id === orderId)
      if (!order) throw new Error('Buyer order not found.')
      const adjusted = applyManualAllocations(preview, adjustments)
      const created = createSupplyPlan(data, order, preview, adjusted, 'Previewed')
      const confirmed = confirmSupplyPlan(created.data, created.plan.id, order, farmers)
      setData(confirmed)
      return confirmed.plans.find((item) => item.id === created.plan.id) ?? created.plan
    },
    reconcileReceipt(planId, farmerId, plotId, cropCycleId, quantityKg, actor) { setData((current) => reconcileReservationReceipt(current, planId, farmerId, plotId, cropCycleId, quantityKg, actor).data) },
    confirmPlan(planId) {
      const plan = data.plans.find((item) => item.id === planId)
      const order = orders.find((item) => item.id === plan?.orderId)
      setData(confirmSupplyPlan(data, planId, order, farmers))
    },
    cancelPlan(planId, reason) { setData(cancelSupplyPlan(data, planId, reason)) },
  }), [data, farmers, orders])

  return <SupplyPlanningContext.Provider value={value}>{children}</SupplyPlanningContext.Provider>
}

export function useSupplyPlanning() {
  const context = useContext(SupplyPlanningContext)
  if (!context) throw new Error('useSupplyPlanning must be used inside SupplyPlanningProvider')
  return context
}
