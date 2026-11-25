import { describe, expect, it } from 'vitest'
import { assignmentSignature, runPlan, scenarioPresets } from './engine'
import type { FarmerResponse } from './engine'
import { planningProgress } from './progress'
import { initialBuyerOrders } from '../data/buyerOrders'
import { initialFarmersData } from '../services/FarmersService'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const balanced = scenarioPresets.find((p) => p.id === 'balanced')!.scenario
const plan = (responses: Record<string, FarmerResponse> = {}) => runPlan({ orders: clone(initialBuyerOrders), data: clone(initialFarmersData), scenario: balanced, responses, exclusions: [] })
const sent = (result: ReturnType<typeof plan>, status: FarmerResponse['status']) => Object.fromEntries(result.farmersInvolved.map((id) => [id, { farmerId: id, status, sentSignature: assignmentSignature(result.allocations.filter((a) => a.farmerId === id)), updatedAt: '' }]))

describe('planning progress reflects real state, not manual ticks', () => {
  it('starts with demand done and the draft plan as the current step', () => {
    const steps = planningProgress(plan(), {}, 'draft')
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo'])
    expect(steps[2].detail).toMatch(/^0 of \d+ farmers messaged/)
  })
  it('flags a plan that changed after finalizing', () => {
    expect(planningProgress(plan(), {}, 'changed')[1].state).toBe('attention')
  })
  it('completes messaging and confirmation only when every assigned farmer has replied to the current plan', () => {
    const base = plan()
    const messaged = planningProgress(base, sent(base, 'sent'), 'finalized')
    expect(messaged.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current'])
    const confirmed = planningProgress(base, sent(base, 'confirmed'), 'finalized')
    expect(confirmed.every((s) => s.state === 'done')).toBe(true)
  })
  it('asks for an update when sent instructions no longer match the plan', () => {
    const base = plan()
    const stale = Object.fromEntries(base.farmersInvolved.map((id) => [id, { farmerId: id, status: 'sent' as const, sentSignature: 'old-plan', updatedAt: '' }]))
    const steps = planningProgress(base, stale, 'finalized')
    expect(steps[2].state).toBe('attention')
    expect(steps[2].detail).toMatch(/need an updated plan/)
  })
})
