import { describe, expect, it } from 'vitest'
import { assignmentSignature, planSignature, replyStateFor, runPlan, scenarioPresets } from './engine'
import type { EngineInput, FarmerResponse } from './engine'
import { initialBuyerOrders } from '../data/buyerOrders'
import { initialFarmersData } from '../services/FarmersService'
import type { BuyerOrder } from '../types'
import type { FarmersData } from '../services/FarmersService'

const balanced = scenarioPresets.find((p) => p.id === 'balanced')!.scenario
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const baseInput = (patch: Partial<EngineInput> = {}): EngineInput => ({ orders: clone(initialBuyerOrders), data: clone(initialFarmersData), scenario: balanced, responses: {}, exclusions: [], ...patch })
const order = (id: string, patch: Partial<BuyerOrder['product']>, type: 'Confirmed' | 'Indicative' = 'Confirmed'): BuyerOrder => {
  const base = clone(initialBuyerOrders.find((o) => o.id === 'ORD-DEMO-024')!)
  return { ...base, id, buyer: { ...base.buyer, name: `Buyer ${id}` }, product: { ...base.product, orderType: type, ...patch } }
}
const responded = (farmerId: string, r: Partial<FarmerResponse>): Record<string, FarmerResponse> => ({ [farmerId]: { farmerId, status: 'sent', updatedAt: '2026-11-16T00:00:00Z', ...r } })

describe('order-level planning', () => {
  it('plans same-crop orders separately with their own variety and sowing window', () => {
    const orders = [
      order('A', { variety: 'Arka Anamika', requiredQuantityKg: 4000, deliveryStartDate: '2027-02-01', deliveryEndDate: '2027-02-28' }),
      order('B', { variety: 'Pusa Sawani', requiredQuantityKg: 4000, deliveryStartDate: '2027-04-01', deliveryEndDate: '2027-04-30' }),
    ]
    const r = runPlan(baseInput({ orders }))
    const okra = r.plans.find((p) => p.crop.name === 'Okra')!
    expect(okra.lines).toHaveLength(2)
    const [a, b] = ['A', 'B'].map((id) => okra.lines.find((l) => l.order.id === id)!)
    expect(a.sowBy).toBe('2026-12-13')
    expect(b.sowBy).toBe('2027-02-10')
    expect(a.allocations.every((x) => x.variety === 'Arka Anamika' && x.sowBy === a.sowBy)).toBe(true)
    expect(b.allocations.every((x) => x.variety === 'Pusa Sawani' && x.sowBy === b.sowBy)).toBe(true)
  })

  it('never lets a surplus on one order hide a shortfall on another', () => {
    // Little land: only one small plot participates.
    const data: FarmersData = clone(initialFarmersData)
    data.farmers = data.farmers.map((f) => (f.id === 'FPO-DEMO-001' ? f : { ...f, membershipStatus: 'Inactive' as const }))
    const orders = [
      order('EARLY', { requiredQuantityKg: 500, deliveryStartDate: '2027-02-01', deliveryEndDate: '2027-02-28' }),
      order('LATE', { requiredQuantityKg: 20000, deliveryStartDate: '2027-02-05', deliveryEndDate: '2027-03-05' }),
    ]
    const r = runPlan(baseInput({ orders, data }))
    const okra = r.plans.find((p) => p.crop.name === 'Okra')!
    const late = okra.lines.find((l) => l.order.id === 'LATE')!
    expect(late.shortfallKg).toBeGreaterThan(0)
    expect(okra.status).not.toBe('covered')
    expect(okra.shortfallKg).toBe(okra.lines.reduce((s, l) => s + l.shortfallKg, 0))
  })

  it('marks an order too late to sow when its window has passed', () => {
    const r = runPlan(baseInput({ orders: [order('SOON', { requiredQuantityKg: 3000, deliveryStartDate: '2026-12-20', deliveryEndDate: '2026-12-31' })] }))
    const line = r.plans[0].lines[0]
    expect(line.window).toBe('missed')
    expect(line.allocations).toHaveLength(0)
  })
})

describe('existing supply', () => {
  it('counts crops already growing only once across orders', () => {
    const orders = [
      order('X', { requiredQuantityKg: 3000, deliveryStartDate: '2026-12-10', deliveryEndDate: '2027-01-10' }),
      order('Y', { requiredQuantityKg: 3000, deliveryStartDate: '2026-12-20', deliveryEndDate: '2027-02-10' }),
    ]
    const r = runPlan(baseInput({ orders }))
    const okra = r.plans.find((p) => p.crop.name === 'Okra')!
    const fromCycle = okra.existing.filter((e) => e.cycle.id === 'CYCLE-DEMO-002').reduce((s, e) => s + e.kg, 0)
    expect(fromCycle).toBeGreaterThan(0)
    expect(fromCycle).toBeLessThanOrEqual(3800)
  })

  it('does not count crops from farmers who are not participating', () => {
    const data: FarmersData = clone(initialFarmersData)
    data.farmers = data.farmers.map((f) => (f.id === 'FPO-DEMO-001' ? { ...f, consent: { ...f.consent, consented: false, status: 'opted-out' as const } } : f))
    const r = runPlan(baseInput({ data }))
    const okra = r.plans.find((p) => p.crop.name === 'Okra')!
    expect(okra.existing.some((e) => e.cycle.id === 'CYCLE-DEMO-002')).toBe(false)
    expect(okra.uncounted.find((u) => u.cycle.id === 'CYCLE-DEMO-002')?.reason).toMatch(/opted out/i)
  })

  it('does not count a different variety against an order', () => {
    const r = runPlan(baseInput())
    const mango = r.plans.find((p) => p.crop.name === 'Mango')!
    expect(mango.existing.some((e) => e.cycle.variety === 'Kesar')).toBe(false)
    expect(mango.uncounted.some((u) => u.cycle.variety === 'Kesar')).toBe(true)
  })
})

describe('farmer responses', () => {
  const someoneInPlan = () => runPlan(baseInput()).allocations[0].farmerId

  it('reallocates land when a farmer declines', () => {
    const id = someoneInPlan()
    const r = runPlan(baseInput({ responses: responded(id, { status: 'declined' }) }))
    expect(r.allocations.some((a) => a.farmerId === id)).toBe(false)
    expect(r.ineligible.some((x) => x.farmer.id === id)).toBe(true)
  })

  it('caps a farmer at the land they say is available', () => {
    const before = runPlan(baseInput())
    const id = [...new Set(before.allocations.map((a) => a.farmerId))].find((f) => before.allocations.filter((a) => a.farmerId === f).reduce((s, a) => s + a.acres, 0) > 1)!
    const r = runPlan(baseInput({ responses: responded(id, { status: 'constraint', constraint: { kind: 'land', note: '', availableAcres: 1 } }) }))
    expect(r.allocations.filter((a) => a.farmerId === id).reduce((s, a) => s + a.acres, 0)).toBeLessThanOrEqual(1)
  })

  it('does not plan new sowing for a farmer who cannot sow in time', () => {
    const id = someoneInPlan()
    const r = runPlan(baseInput({ responses: responded(id, { status: 'constraint', constraint: { kind: 'timing', note: '' } }) }))
    expect(r.allocations.some((a) => a.farmerId === id)).toBe(false)
  })

  it('still plans a late farmer for windows their start date meets', () => {
    const id = someoneInPlan()
    const r = runPlan(baseInput({ responses: responded(id, { status: 'constraint', constraint: { kind: 'timing', note: '', availableFrom: '2026-11-17' } }) }))
    const theirs = r.allocations.filter((a) => a.farmerId === id)
    expect(theirs.length).toBeGreaterThan(0)
    expect(theirs.every((a) => a.sowBy >= '2026-11-17')).toBe(true)
    expect(theirs.every((a) => a.fit === 'caution')).toBe(true)
  })

  it('holds a flagged plot out of the plan without changing the farm record', () => {
    const input = baseInput()
    const plotId = runPlan(input).allocations[0].plotId
    const before = JSON.stringify(input.data)
    const r = runPlan({ ...input, flaggedPlots: { [plotId]: { reason: 'Farmer reported a water problem' } } })
    expect(r.allocations.some((a) => a.plotId === plotId)).toBe(false)
    expect(JSON.stringify(input.data)).toBe(before)
  })
})

describe('keeping farmers in sync', () => {
  it('asks to resend when the buyer moves the delivery date, even if area is unchanged', () => {
    const input = baseInput()
    const r1 = runPlan(input)
    const id = r1.allocations[0].farmerId
    const sent = { [id]: { farmerId: id, status: 'confirmed' as const, sentSignature: assignmentSignature(r1.allocations.filter((a) => a.farmerId === id)), updatedAt: '' } }
    expect(replyStateFor(id, sent, r1.allocations)).toBe('confirmed')

    const orderId = r1.allocations[0].orderId
    const moved = input.orders.map((o) => (o.id === orderId ? { ...o, product: { ...o.product, deliveryStartDate: '2027-02-08' } } : o))
    const r2 = runPlan({ ...input, orders: moved, responses: sent })
    expect(replyStateFor(id, sent, r2.allocations)).toBe('needs-update')
  })

  it('only counts farmer-confirmed supply when the reply matches the current plan', () => {
    const r1 = runPlan(baseInput())
    const id = r1.allocations[0].farmerId
    const stale = { [id]: { farmerId: id, status: 'confirmed' as const, sentSignature: 'old-plan', updatedAt: '' } }
    const r2 = runPlan(baseInput({ responses: stale }))
    expect(r2.plans.reduce((s, p) => s + p.lines.reduce((t, l) => t + l.farmerConfirmedKg, 0), 0)).toBe(0)
  })

  it('changes the plan signature when the plan changes (finalized → changed)', () => {
    const r1 = runPlan(baseInput())
    const r2 = runPlan(baseInput({ exclusions: [`${r1.allocations[0].plotId}|${r1.allocations[0].crop}`] }))
    expect(planSignature(r1.allocations, balanced)).not.toBe(planSignature(r2.allocations, balanced))
  })
})

describe('risk', () => {
  it('explains risk and lowers it once farmers confirm', () => {
    const r1 = runPlan(baseInput())
    expect(r1.risk.factors.length).toBeGreaterThan(0)
    const responses: Record<string, FarmerResponse> = {}
    for (const id of r1.farmersInvolved) responses[id] = { farmerId: id, status: 'confirmed', sentSignature: assignmentSignature(r1.allocations.filter((a) => a.farmerId === id)), updatedAt: '' }
    const r2 = runPlan(baseInput({ responses }))
    expect(r2.risk.score).toBeLessThan(r1.risk.score)
  })
})
