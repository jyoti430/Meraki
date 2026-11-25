import { replyStateFor } from './engine'
import type { FarmerResponse, PlanResult } from './engine'

export type StepState = 'done' | 'current' | 'attention' | 'todo'
export interface ProgressStep { id: 'demand' | 'plan' | 'messages' | 'confirmed'; label: string; detail: string; state: StepState; to: string; cta: string }

/**
 * Where the FPO is in the core journey, derived from the planning state itself
 * (orders, plan finalisation and farmer replies) rather than manual ticks.
 */
export function planningProgress(result: PlanResult, responses: Record<string, FarmerResponse>, planState: 'draft' | 'finalized' | 'changed'): ProgressStep[] {
  const lines = result.plans.flatMap((plan) => plan.lines)
  const committed = lines.filter((line) => line.committed).length
  const farmers = result.farmersInvolved
  const states = farmers.map((id) => replyStateFor(id, responses, result.allocations))
  const contacted = states.filter((state) => state !== 'not-sent' && state !== 'needs-update').length
  const outdated = states.filter((state) => state === 'needs-update').length
  const confirmed = states.filter((state) => state === 'confirmed').length
  const problems = states.filter((state) => state === 'constraint').length

  const steps: Omit<ProgressStep, 'state'>[] = [
    { id: 'demand', label: 'Review buyer demand', detail: lines.length ? `${lines.length} active orders · ${committed} buyer-committed` : 'No active buyer orders yet', to: '/demand', cta: lines.length ? 'Review demand' : 'Add demand' },
    { id: 'plan', label: 'Finalize the planting plan', detail: planState === 'finalized' ? `Finalized · ${result.totalAcres.toFixed(1)} ac across ${farmers.length} farmers` : planState === 'changed' ? 'Changed since it was finalized' : `Draft · ${result.totalAcres.toFixed(1)} ac across ${farmers.length} farmers`, to: '/plan', cta: planState === 'finalized' ? 'View plan' : 'Review plan' },
    { id: 'messages', label: 'Send farmer instructions', detail: outdated ? `${outdated} farmer${outdated > 1 ? 's need' : ' needs'} an updated plan` : `${contacted} of ${farmers.length} farmers messaged (simulated)`, to: '/messages', cta: contacted < farmers.length || outdated ? 'Open messages' : 'View messages' },
    { id: 'confirmed', label: 'Collect farmer replies', detail: problems ? `${confirmed} of ${farmers.length} confirmed · ${problems} reported a problem` : `${confirmed} of ${farmers.length} farmers confirmed`, to: '/messages', cta: 'Review replies' },
  ]
  const done: Record<ProgressStep['id'], boolean> = {
    demand: committed > 0,
    plan: planState === 'finalized',
    messages: farmers.length > 0 && contacted === farmers.length && outdated === 0,
    confirmed: farmers.length > 0 && confirmed === farmers.length,
  }
  const attention: Record<ProgressStep['id'], boolean> = { demand: false, plan: planState === 'changed', messages: outdated > 0, confirmed: problems > 0 }
  let currentAssigned = false
  return steps.map((step) => {
    if (done[step.id]) return { ...step, state: 'done' }
    if (attention[step.id]) { currentAssigned = true; return { ...step, state: 'attention' } }
    if (!currentAssigned) { currentAssigned = true; return { ...step, state: 'current' } }
    return { ...step, state: 'todo' }
  })
}
