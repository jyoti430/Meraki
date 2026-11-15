/**
 * Meraki planning engine (prototype).
 *
 * A transparent, rule-based heuristic — NOT a predictive model. It turns active buyer demand,
 * farm conditions and farmer responses into a collective planting plan, and explains every decision.
 * All crop parameters come from the indicative reference table in data/crops.ts.
 */
import { crops, findCrop } from '../data/crops'
import type { CropProfile } from '../data/crops'
import { marketSignals } from '../data/marketSignals'
import type { Market, MarketSignal } from '../data/marketSignals'
import type { FarmersData } from '../services/FarmersService'
import type { BuyerOrder, CropCycle, Farmer, Plot } from '../types'
import { addDays, ceilTo, daysBetween, maxDate, minDate } from './format'

/** Fixed scenario date so the synthetic demo stays internally consistent. */
export const PLANNING_DATE = '2026-11-16'
export const SEASON_LABEL = 'Rabi 2026–27'
const PLOT_PREP_DAYS = 7
const MIN_BLOCK_ACRES = 0.25

// ---------- Scenario ----------
export type DemandBasis = 'confirmed' | 'all'
export type YieldCase = 'conservative' | 'expected'
export interface Scenario { basis: DemandBasis; yieldCase: YieldCase; bufferPct: number }

export const scenarioPresets: { id: string; label: string; summary: string; scenario: Scenario }[] = [
  { id: 'cautious', label: 'Cautious', summary: 'Plant only for confirmed orders, assume a weaker season.', scenario: { basis: 'confirmed', yieldCase: 'conservative', bufferPct: 10 } },
  { id: 'balanced', label: 'Balanced', summary: 'Plan for confirmed and indicative demand at expected yields.', scenario: { basis: 'all', yieldCase: 'expected', bufferPct: 10 } },
  { id: 'secure', label: 'Secure all demand', summary: 'Cover all demand even in a weaker season. Uses the most land.', scenario: { basis: 'all', yieldCase: 'conservative', bufferPct: 15 } },
]

export const presetFor = (s: Scenario) => scenarioPresets.find((p) => p.scenario.basis === s.basis && p.scenario.yieldCase === s.yieldCase && p.scenario.bufferPct === s.bufferPct)

// ---------- Farmer responses (from the messaging workflow) ----------
export type ResponseStatus = 'not-sent' | 'sent' | 'confirmed' | 'declined' | 'constraint'
export type ConstraintKind = 'land' | 'water' | 'timing' | 'other'
export interface FarmerResponse {
  farmerId: string
  status: ResponseStatus
  /** Signature of the farmer's assignments when the last message was sent. */
  sentSignature?: string
  sentAt?: string
  constraint?: { kind: ConstraintKind; note: string; availableAcres?: number }
  updatedAt: string
}

// ---------- Result types ----------
export type Tone = 'good' | 'caution' | 'block'
export interface Reason { tone: Tone; text: string }
export type Fit = 'good' | 'caution' | 'unsuitable'
export type WindowStatus = 'open' | 'urgent' | 'missed' | 'perennial' | 'no-dates'

export interface Allocation {
  crop: string
  farmerId: string
  farmerName: string
  plotId: string
  plotName: string
  acres: number
  kg: number
  kgRange: [number, number]
  fit: Fit
  reasons: Reason[]
  phase: 'confirmed' | 'indicative'
}

export interface UnusedPlot { farmerId: string; farmerName: string; plotId: string; plotName: string; acres: number; reasons: Reason[] }

export interface ExistingSupply { cycle: CropCycle; plot: Plot; farmer?: Farmer; kg: number }

export interface CropPlan {
  crop: CropProfile
  orders: BuyerOrder[]
  confirmedKg: number
  indicativeKg: number
  varieties: string[]
  markets: Market[]
  deliveryStart: string
  deliveryEnd: string
  avgPriceInr: number | null
  window: WindowStatus
  sowFrom: string
  sowBy: string
  harvestStart: string
  harvestEnd: string
  targetKg: number
  existing: ExistingSupply[]
  existingKg: number
  allocations: Allocation[]
  plannedAcres: number
  plannedKg: number
  plannedRange: [number, number]
  expectedKg: number
  farmerConfirmedKg: number
  gapKg: number
  status: 'covered' | 'partial' | 'gap' | 'not-plantable' | 'not-in-scenario'
  unused: UnusedPlot[]
  suitableAcres: number
}

export type Verdict = 'strong' | 'consider' | 'caution' | 'too-late' | 'existing-only'
export interface WhyPoint { source: 'order' | 'forecast' | 'farm' | 'timing'; tone: Tone; text: string }
export interface Opportunity {
  crop: CropProfile
  verdict: Verdict
  headline: string
  why: WhyPoint[]
  signals: MarketSignal[]
  plan?: CropPlan
  suitableAcres: number
  suitableFarmers: number
}

export interface NextAction { id: string; tone: 'urgent' | 'attention' | 'info'; title: string; detail: string; to: string; cta: string }

export interface PlanResult {
  scenario: Scenario
  plans: CropPlan[]
  opportunities: Opportunity[]
  allocations: Allocation[]
  farmersInvolved: string[]
  totalAcres: number
  confirmedDemandKg: number
  confirmedCoveredKg: number
  allDemandKg: number
  allCoveredKg: number
  ineligible: { farmer: Farmer; reason: string }[]
  actions: NextAction[]
  unmappedOrders: BuyerOrder[]
}

export interface EngineInput {
  orders: BuyerOrder[]
  data: FarmersData
  scenario: Scenario
  responses: Record<string, FarmerResponse>
  exclusions: string[]
}

// ---------- Helpers ----------
export const plotAcres = (plot: Plot) => (plot.areaUnit === 'hectare' ? plot.area * 2.471 : plot.area)
const ACTIVE = new Set(['Planned', 'Growing', 'Harvest-ready'])
export const exclusionKey = (plotId: string, crop: string) => `${plotId}|${crop}`

export function plotBusyUntil(data: FarmersData, plotId: string): { until: string; cycle: CropCycle } | null {
  const active = data.cropCycles.filter((c) => c.plotId === plotId && ACTIVE.has(c.status))
  if (!active.length) return null
  const cycle = active.reduce((a, b) => (a.expectedHarvestEndDate > b.expectedHarvestEndDate ? a : b))
  return { until: cycle.expectedHarvestEndDate, cycle }
}

export function farmerEligibility(farmer: Farmer, response?: FarmerResponse): string | null {
  if (farmer.membershipStatus !== 'Active') return 'Membership inactive'
  if (farmer.consent.status === 'opted-out') return 'Opted out this season'
  if (farmer.consent.status === 'unavailable') return 'Marked unavailable'
  if (farmer.consent.status !== 'opted-in') return 'Participation not yet recorded'
  if (response?.status === 'declined') return 'Declined this season’s plan'
  return null
}

function waterReason(crop: CropProfile, plot: Plot): Reason {
  const w = plot.waterAvailability
  const drip = /drip/i.test(plot.irrigationType)
  if (w === 'None') return { tone: 'block', text: `No irrigation water – ${crop.name.toLowerCase()} needs ${crop.waterNeed.toLowerCase()} water` }
  if (w === 'Unknown') return { tone: 'caution', text: 'Water availability not recorded – confirm with farmer' }
  if (crop.waterNeed === 'High') return w === 'Available' ? { tone: 'good', text: 'Assured water for a high-water crop' } : { tone: 'block', text: `Limited water – ${crop.name.toLowerCase()} needs assured irrigation` }
  if (crop.waterNeed === 'Medium') {
    if (w === 'Available') return { tone: 'good', text: 'Water available' }
    return drip ? { tone: 'good', text: 'Limited water, but drip irrigation makes it workable' } : { tone: 'caution', text: 'Limited water and no drip – yield risk in dry spells' }
  }
  return { tone: 'good', text: w === 'Limited' ? 'Low-water crop suits limited water' : 'Water available' }
}

function soilReasons(crop: CropProfile, plot: Plot): Reason[] {
  const out: Reason[] = []
  const soil = plot.soilType.trim()
  if (!soil) out.push({ tone: 'caution', text: 'Soil type not recorded' })
  else if (crop.suitableSoils.some((s) => s.toLowerCase() === soil.toLowerCase())) out.push({ tone: 'good', text: `${soil} suits ${crop.name.toLowerCase()}` })
  else out.push({ tone: 'caution', text: `${soil} is less suited to ${crop.name.toLowerCase()}` })
  const m = plot.soilMeasurement
  if (m?.ph != null) {
    const [lo, hi] = crop.phRange
    out.push(m.ph >= lo && m.ph <= hi
      ? { tone: 'good', text: `pH ${m.ph} (${m.source.toLowerCase()}) within ${lo}–${hi}` }
      : { tone: 'caution', text: `pH ${m.ph} (${m.source.toLowerCase()}) outside preferred ${lo}–${hi}` })
  }
  return out
}

export function assessPlot(crop: CropProfile, plot: Plot, data: FarmersData, sowBy: string, response?: FarmerResponse): { fit: Fit; reasons: Reason[] } {
  const reasons: Reason[] = []
  const busy = plotBusyUntil(data, plot.id)
  if (busy) {
    const freeFrom = addDays(busy.until, PLOT_PREP_DAYS)
    if (freeFrom > sowBy) reasons.push({ tone: 'block', text: `Occupied by ${busy.cycle.crop.toLowerCase()} until ${shortDate(busy.until)} – past the sow-by date` })
    else reasons.push({ tone: 'good', text: `Free after ${busy.cycle.crop.toLowerCase()} harvest (${shortDate(busy.until)})` })
  } else reasons.push({ tone: 'good', text: 'Plot free now' })
  reasons.push(waterReason(crop, plot))
  reasons.push(...soilReasons(crop, plot))
  if (response?.status === 'constraint' && response.constraint && (response.constraint.kind === 'timing' || response.constraint.kind === 'other')) {
    reasons.push({ tone: 'caution', text: `Farmer reported: ${response.constraint.note || response.constraint.kind}` })
  }
  const fit: Fit = reasons.some((r) => r.tone === 'block') ? 'unsuitable' : reasons.some((r) => r.tone === 'caution') ? 'caution' : 'good'
  return { fit, reasons }
}

const shortDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

function windowFor(crop: CropProfile, deliveryStart: string): { window: WindowStatus; sowBy: string; sowFrom: string; harvestStart: string; harvestEnd: string } {
  if (crop.perennial) return { window: 'perennial', sowBy: '', sowFrom: '', harvestStart: deliveryStart, harvestEnd: addDays(deliveryStart, crop.harvestSpanDays) }
  if (!deliveryStart) return { window: 'no-dates', sowBy: '', sowFrom: '', harvestStart: '', harvestEnd: '' }
  const sowBy = addDays(deliveryStart, -crop.daysToFirstHarvest)
  const sowFrom = maxDate(PLANNING_DATE, addDays(sowBy, -14))
  const left = daysBetween(PLANNING_DATE, sowBy)
  const window: WindowStatus = left < 0 ? 'missed' : left <= 10 ? 'urgent' : 'open'
  return { window, sowBy, sowFrom, harvestStart: deliveryStart, harvestEnd: addDays(deliveryStart, crop.harvestSpanDays) }
}

/** Assignments signature – used to detect when a farmer's instructions changed after a message was sent. */
export const assignmentSignature = (allocations: Allocation[]) => allocations.map((a) => `${a.crop}:${a.plotId}:${a.acres.toFixed(2)}`).sort().join('|')

// ---------- Main ----------
export function runPlan({ orders, data, scenario, responses, exclusions }: EngineInput): PlanResult {
  const excluded = new Set(exclusions)
  const farmersById = new Map(data.farmers.map((f) => [f.id, f]))
  const yieldIdx = scenario.yieldCase === 'conservative' ? 0 : 1
  const buffer = 1 + scenario.bufferPct / 100

  // 1. Demand by crop (active orders only)
  const active = orders.filter((o) => o.status === 'Active' && Number(o.product.requiredQuantityKg) > 0)
  const unmappedOrders = active.filter((o) => !findCrop(o.product.crop))
  const byCrop = new Map<string, BuyerOrder[]>()
  for (const o of active) {
    const crop = findCrop(o.product.crop)
    if (!crop) continue
    byCrop.set(crop.name, [...(byCrop.get(crop.name) ?? []), o])
  }

  // 2. Eligible farmers and plots
  const ineligible: { farmer: Farmer; reason: string }[] = []
  const eligibleIds = new Set<string>()
  for (const f of data.farmers) {
    const reason = farmerEligibility(f, responses[f.id])
    if (reason) ineligible.push({ farmer: f, reason })
    else eligibleIds.add(f.id)
  }
  const remainingPlot = new Map(data.plots.map((p) => [p.id, plotAcres(p)]))
  const farmerCap = new Map<string, number>()
  for (const f of data.farmers) {
    const c = responses[f.id]?.constraint
    farmerCap.set(f.id, responses[f.id]?.status === 'constraint' && c?.kind === 'land' && c.availableAcres != null ? c.availableAcres : Infinity)
  }

  // 3. Build crop plans
  const plans: CropPlan[] = [...byCrop.entries()].map(([name, list]) => {
    const crop = findCrop(name)!
    const confirmedKg = list.filter((o) => o.product.orderType === 'Confirmed').reduce((s, o) => s + Number(o.product.requiredQuantityKg), 0)
    const indicativeKg = list.filter((o) => o.product.orderType === 'Indicative').reduce((s, o) => s + Number(o.product.requiredQuantityKg), 0)
    const dated = list.filter((o) => o.product.deliveryStartDate && o.product.deliveryEndDate)
    const deliveryStart = dated.reduce((d, o) => (d ? minDate(d, o.product.deliveryStartDate) : o.product.deliveryStartDate), '')
    const deliveryEnd = dated.reduce((d, o) => (d ? maxDate(d, o.product.deliveryEndDate) : o.product.deliveryEndDate), '')
    const priced = list.filter((o) => o.commercial.currency === 'INR' && Number(o.commercial.agreedPricePerKg) > 0)
    const priceWeight = priced.reduce((s, o) => s + Number(o.product.requiredQuantityKg), 0)
    const avgPriceInr = priceWeight ? priced.reduce((s, o) => s + Number(o.commercial.agreedPricePerKg) * Number(o.product.requiredQuantityKg), 0) / priceWeight : null
    const varieties = [...new Set(list.map((o) => o.product.variety).filter(Boolean))]
    const markets = [...new Set(list.map((o) => (o.buyer.destinationCountry.toLowerCase() === 'singapore' ? 'Singapore' : 'India') as Market))]
    const w = windowFor(crop, deliveryStart)

    const existing: ExistingSupply[] = []
    if (deliveryStart) {
      for (const cycle of data.cropCycles) {
        if (!ACTIVE.has(cycle.status) || cycle.crop.toLowerCase() !== crop.name.toLowerCase()) continue
        if (varieties.length && !varieties.some((v) => v.toLowerCase() === cycle.variety.toLowerCase())) continue
        const s = maxDate(cycle.expectedHarvestStartDate, deliveryStart)
        const e = minDate(cycle.expectedHarvestEndDate, deliveryEnd)
        if (s > e) continue
        const span = Math.max(1, daysBetween(cycle.expectedHarvestStartDate, cycle.expectedHarvestEndDate))
        const plot = data.plots.find((p) => p.id === cycle.plotId)
        if (!plot) continue
        existing.push({ cycle, plot, farmer: farmersById.get(plot.farmerId), kg: Math.round(cycle.estimatedProductionKg * Math.min(1, (daysBetween(s, e) + 1) / span)) })
      }
    }
    const existingKg = existing.reduce((s, e) => s + e.kg, 0)
    const targetKg = Math.round((confirmedKg + (scenario.basis === 'all' ? indicativeKg : 0)) * buffer)
    return {
      crop, orders: list, confirmedKg, indicativeKg, varieties, markets, deliveryStart, deliveryEnd, avgPriceInr, ...w,
      targetKg, existing, existingKg, allocations: [], plannedAcres: 0, plannedKg: 0, plannedRange: [0, 0], expectedKg: 0, farmerConfirmedKg: 0, gapKg: 0,
      status: 'gap', unused: [], suitableAcres: 0,
    } satisfies CropPlan
  })

  const plantable = plans.filter((p) => p.window === 'open' || p.window === 'urgent').sort((a, b) => a.sowBy.localeCompare(b.sowBy))

  // Flexibility: how many plantable crops a plot is a good fit for (use least flexible land first).
  const flexibility = new Map<string, number>()
  for (const plot of data.plots) {
    flexibility.set(plot.id, plantable.filter((p) => assessPlot(p.crop, plot, data, p.sowBy).fit === 'good').length)
  }

  function allocate(plan: CropPlan, needKg: number, phase: Allocation['phase']) {
    const yieldPerAcre = plan.crop.yieldPerAcre[yieldIdx]
    const candidates = data.plots
      .filter((p) => eligibleIds.has(p.farmerId) && !excluded.has(exclusionKey(p.id, plan.crop.name)))
      .map((plot) => ({ plot, ...assessPlot(plan.crop, plot, data, plan.sowBy, responses[plot.farmerId]) }))
      .filter((c) => c.fit !== 'unsuitable')
      .sort((a, b) => (a.fit === b.fit ? 0 : a.fit === 'good' ? -1 : 1) || (flexibility.get(a.plot.id)! - flexibility.get(b.plot.id)!) || remainingPlot.get(b.plot.id)! - remainingPlot.get(a.plot.id)!)
    for (const c of candidates) {
      if (needKg <= 0) break
      const free = Math.min(remainingPlot.get(c.plot.id)!, farmerCap.get(c.plot.farmerId)!)
      if (free < MIN_BLOCK_ACRES - 1e-9) continue
      const acres = Math.min(Math.floor(free / MIN_BLOCK_ACRES + 1e-9) * MIN_BLOCK_ACRES, Math.max(MIN_BLOCK_ACRES, ceilTo(needKg / yieldPerAcre, MIN_BLOCK_ACRES)))
      if (acres <= 0) continue
      remainingPlot.set(c.plot.id, remainingPlot.get(c.plot.id)! - acres)
      farmerCap.set(c.plot.farmerId, farmerCap.get(c.plot.farmerId)! - acres)
      needKg -= acres * yieldPerAcre
      const existingAlloc = plan.allocations.find((a) => a.plotId === c.plot.id)
      if (existingAlloc) existingAlloc.acres += acres
      else plan.allocations.push({ crop: plan.crop.name, farmerId: c.plot.farmerId, farmerName: farmersById.get(c.plot.farmerId)?.name ?? c.plot.farmerId, plotId: c.plot.id, plotName: c.plot.name, acres, kg: 0, kgRange: [0, 0], fit: c.fit, reasons: c.reasons, phase })
    }
  }

  // Pass 1 – confirmed demand for every crop; pass 2 – indicative demand.
  for (const plan of plantable) allocate(plan, plan.confirmedKg * buffer - plan.existingKg, 'confirmed')
  if (scenario.basis === 'all') {
    for (const plan of plantable) {
      const plannedSoFar = plan.allocations.reduce((sum, a) => sum + a.acres * plan.crop.yieldPerAcre[yieldIdx], 0)
      allocate(plan, (plan.confirmedKg + plan.indicativeKg) * buffer - plan.existingKg - plannedSoFar, 'indicative')
    }
  }

  // 4. Finalise numbers, unused plots and suitability
  for (const plan of plans) {
    const y = plan.crop.yieldPerAcre
    for (const a of plan.allocations) {
      a.kg = Math.round(a.acres * y[yieldIdx])
      a.kgRange = [Math.round(a.acres * y[0]), Math.round(a.acres * y[2])]
    }
    plan.plannedAcres = plan.allocations.reduce((s, a) => s + a.acres, 0)
    plan.plannedKg = plan.allocations.reduce((s, a) => s + a.kg, 0)
    plan.plannedRange = [plan.allocations.reduce((s, a) => s + a.kgRange[0], 0), plan.allocations.reduce((s, a) => s + a.kgRange[1], 0)]
    plan.expectedKg = plan.plannedKg + plan.existingKg
    plan.gapKg = Math.max(0, plan.targetKg - plan.expectedKg)
    const notPlantable = plan.window === 'missed' || plan.window === 'no-dates' || (plan.window === 'perennial' && plan.existingKg === 0)
    plan.status = plan.targetKg === 0 ? 'not-in-scenario' : plan.expectedKg >= plan.targetKg * 0.98 ? 'covered' : notPlantable && plan.window !== 'perennial' ? 'not-plantable' : plan.expectedKg >= plan.targetKg * 0.5 ? 'partial' : 'gap'

    const sowBy = plan.sowBy || addDays(PLANNING_DATE, 21)
    const used = new Set(plan.allocations.map((a) => a.plotId))
    for (const plot of data.plots) {
      const farmer = farmersById.get(plot.farmerId)
      const reason = farmer ? farmerEligibility(farmer, responses[farmer.id]) : 'Unknown farmer'
      const { fit, reasons } = assessPlot(plan.crop, plot, data, sowBy, responses[plot.farmerId])
      if (!reason && fit !== 'unsuitable') plan.suitableAcres += plotAcres(plot)
      if (used.has(plot.id)) continue
      let why: Reason[]
      if (plan.crop.perennial) why = [{ tone: 'caution', text: 'Perennial crop – supply comes only from existing orchards' }]
      else if (reason) why = [{ tone: 'block', text: reason }]
      else if (excluded.has(exclusionKey(plot.id, plan.crop.name))) why = [{ tone: 'block', text: 'Removed from this crop by you' }]
      else if (fit === 'unsuitable') why = reasons.filter((r) => r.tone === 'block')
      else if ((remainingPlot.get(plot.id) ?? 0) < MIN_BLOCK_ACRES || (farmerCap.get(plot.farmerId) ?? 0) < MIN_BLOCK_ACRES) why = [{ tone: 'caution', text: 'Land already assigned to other crops' }]
      else if (plan.window === 'missed') why = [{ tone: 'block', text: 'Sowing window has passed' }]
      else why = [{ tone: 'good', text: 'Suitable reserve – not needed at current demand' }, ...reasons.filter((r) => r.tone === 'caution')]
      plan.unused.push({ farmerId: plot.farmerId, farmerName: farmer?.name ?? plot.farmerId, plotId: plot.id, plotName: plot.name, acres: plotAcres(plot), reasons: why })
    }
  }

  // 5. Opportunities for every crop with demand or a market signal
  const opportunities: Opportunity[] = crops
    .filter((crop) => byCrop.has(crop.name) || marketSignals.some((s) => s.crop === crop.name))
    .map((crop) => buildOpportunity(crop, plans.find((p) => p.crop.id === crop.id), data, responses, yieldIdx))
    .sort((a, b) => verdictRank[a.verdict] - verdictRank[b.verdict] || (b.plan?.confirmedKg ?? 0) - (a.plan?.confirmedKg ?? 0))

  const allocations = plans.flatMap((p) => p.allocations)
  // Supply is only "confirmed by farmers" when the farmer accepted the instructions that match the current plan.
  const confirmedFarmers = new Set([...new Set(allocations.map((a) => a.farmerId))].filter((id) => {
    const r = responses[id]
    return r?.status === 'confirmed' && r.sentSignature === assignmentSignature(allocations.filter((a) => a.farmerId === id))
  }))
  for (const plan of plans) plan.farmerConfirmedKg = plan.existingKg + plan.allocations.filter((a) => confirmedFarmers.has(a.farmerId)).reduce((sum, a) => sum + a.kg, 0)
  const farmersInvolved = [...new Set(allocations.map((a) => a.farmerId))]
  const confirmedDemandKg = plans.reduce((s, p) => s + p.confirmedKg, 0)
  const confirmedCoveredKg = plans.reduce((s, p) => s + Math.min(p.confirmedKg, p.expectedKg), 0)
  const allDemandKg = plans.reduce((s, p) => s + p.confirmedKg + p.indicativeKg, 0)
  const allCoveredKg = plans.reduce((s, p) => s + Math.min(p.confirmedKg + p.indicativeKg, p.expectedKg), 0)

  const result: PlanResult = {
    scenario, plans: plans.sort((a, b) => (a.sowBy || 'z').localeCompare(b.sowBy || 'z')), opportunities, allocations, farmersInvolved,
    totalAcres: allocations.reduce((s, a) => s + a.acres, 0), confirmedDemandKg, confirmedCoveredKg, allDemandKg, allCoveredKg, ineligible, actions: [], unmappedOrders,
  }
  result.actions = buildActions(result, data, responses, orders)
  return result
}

const verdictRank: Record<Verdict, number> = { strong: 0, consider: 1, 'existing-only': 2, caution: 3, 'too-late': 4 }

function buildOpportunity(crop: CropProfile, plan: CropPlan | undefined, data: FarmersData, responses: Record<string, FarmerResponse>, yieldIdx: number): Opportunity {
  const signals = marketSignals.filter((s) => s.crop === crop.name)
  const why: WhyPoint[] = []
  let score = 0
  if (plan?.confirmedKg) { score += 2; why.push({ source: 'order', tone: 'good', text: `${fmt(plan.confirmedKg)} confirmed by buyers` }) }
  if (plan?.indicativeKg) { score += 1; why.push({ source: 'order', tone: 'caution', text: `${fmt(plan.indicativeKg)} indicative – not yet committed` }) }
  if (!plan) why.push({ source: 'order', tone: 'caution', text: 'No buyer orders yet' })
  for (const s of signals) {
    if (s.demandOutlook === 'Higher than usual') score += 1
    if (s.demandOutlook === 'Lower than usual') score -= 1
    if (s.regionalSupply === 'Tight') score += 1
    if (s.regionalSupply === 'Oversupply risk') score -= 2
    const tone: Tone = s.regionalSupply === 'Oversupply risk' || s.demandOutlook === 'Lower than usual' ? 'block' : s.demandOutlook === 'Higher than usual' || s.regionalSupply === 'Tight' ? 'good' : 'caution'
    why.push({ source: 'forecast', tone, text: `${s.market}: demand ${s.demandOutlook.toLowerCase()}, ${s.regionalSupply === 'Oversupply risk' ? 'oversupply risk' : `${s.regionalSupply.toLowerCase()} supply`} (${s.confidence.toLowerCase()} confidence)` })
  }

  // Suitability across eligible farms
  const sowBy = plan?.sowBy || addDays(PLANNING_DATE, 21)
  let suitableAcres = 0
  const suitableFarmers = new Set<string>()
  for (const plot of data.plots) {
    const farmer = data.farmers.find((f) => f.id === plot.farmerId)
    if (!farmer || farmerEligibility(farmer, responses[farmer.id])) continue
    if (assessPlot(crop, plot, data, sowBy, responses[farmer.id]).fit !== 'unsuitable') { suitableAcres += plotAcres(plot); suitableFarmers.add(farmer.id) }
  }
  const neededAcres = plan ? (plan.confirmedKg + plan.indicativeKg) / crop.yieldPerAcre[yieldIdx] : 0
  if (!crop.perennial) {
    if (suitableAcres === 0) { score -= 2; why.push({ source: 'farm', tone: 'block', text: 'No participating plot suits this crop in time' }) }
    else if (suitableAcres >= neededAcres) { score += 1; why.push({ source: 'farm', tone: 'good', text: `${suitableFarmers.size} farms (${suitableAcres.toFixed(1)} ac) could grow it` }) }
    else why.push({ source: 'farm', tone: 'caution', text: `Only ${suitableAcres.toFixed(1)} ac suits it – about ${neededAcres.toFixed(1)} ac needed for all demand` })
  }

  let verdict: Verdict
  let headline: string
  if (crop.perennial) {
    verdict = 'existing-only'
    headline = plan ? `Existing orchards can supply about ${fmt(plan.existingKg)} of ${fmt(plan.confirmedKg + plan.indicativeKg)}` : 'Orchard crop – no new planting this season'
  } else if (plan && plan.window === 'missed') {
    verdict = 'too-late'
    headline = `Sowing window passed on ${shortDate(plan.sowBy)} – only existing crops can supply`
    why.unshift({ source: 'timing', tone: 'block', text: `Needed sowing by ${shortDate(plan.sowBy)}` })
  } else {
    verdict = score >= 3 ? 'strong' : score >= 1 ? 'consider' : 'caution'
    if (plan?.window === 'urgent') why.unshift({ source: 'timing', tone: 'caution', text: `Sow by ${shortDate(plan.sowBy)} – ${daysBetween(PLANNING_DATE, plan.sowBy)} days left` })
    headline = verdict === 'strong' ? (plan?.confirmedKg ? 'Firm demand and suitable land – plan it' : 'Promising – confirm the buyer before sowing')
      : verdict === 'consider' ? (plan?.confirmedKg ? 'Demand exists, but check the risks' : 'Interest exists – firm up buyers before committing land')
      : signals.some((s) => s.regionalSupply === 'Oversupply risk') ? 'Forecast oversupply – avoid adding area' : 'Weak case this season'
  }
  return { crop, verdict, headline, why, signals, plan, suitableAcres, suitableFarmers: suitableFarmers.size }
}

const fmt = (kg: number) => (kg >= 10000 ? `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(kg).toLocaleString('en-IN')} kg`)

function buildActions(result: PlanResult, data: FarmersData, responses: Record<string, FarmerResponse>, orders: BuyerOrder[]): NextAction[] {
  const actions: NextAction[] = []
  const byFarmer = new Map<string, Allocation[]>()
  for (const a of result.allocations) byFarmer.set(a.farmerId, [...(byFarmer.get(a.farmerId) ?? []), a])

  for (const p of result.plans.filter((x) => x.window === 'urgent' && x.allocations.length)) {
    const waiting = p.allocations.filter((a) => (responses[a.farmerId]?.status ?? 'not-sent') !== 'confirmed').length
    if (waiting) actions.push({ id: `urgent-${p.crop.id}`, tone: 'urgent', title: `Sow ${p.crop.name.toLowerCase()} by ${shortDate(p.sowBy)}`, detail: `${waiting} of ${p.allocations.length} farmers haven’t confirmed yet.`, to: '/messages', cta: 'Message farmers' })
  }
  const notSent = [...byFarmer.keys()].filter((id) => (responses[id]?.status ?? 'not-sent') === 'not-sent')
  if (notSent.length) actions.push({ id: 'send', tone: 'attention', title: `Send planting instructions to ${notSent.length} farmer${notSent.length > 1 ? 's' : ''}`, detail: 'Instructions are drafted in each farmer’s language.', to: '/messages', cta: 'Review messages' })
  const changed = [...byFarmer.entries()].filter(([id, list]) => { const r = responses[id]; return r && r.status !== 'not-sent' && r.status !== 'declined' && r.sentSignature !== undefined && r.sentSignature !== assignmentSignature(list) })
  if (changed.length) actions.push({ id: 'resend', tone: 'attention', title: `Plan changed for ${changed.length} farmer${changed.length > 1 ? 's' : ''}`, detail: 'Their instructions are out of date. Send an update.', to: '/messages', cta: 'Send updates' })
  const constraints = Object.values(responses).filter((r) => r.status === 'constraint')
  if (constraints.length) actions.push({ id: 'constraints', tone: 'attention', title: `${constraints.length} farmer${constraints.length > 1 ? 's' : ''} reported a problem`, detail: 'Review how it changed the plan.', to: '/messages', cta: 'Review replies' })
  for (const p of result.plans.filter((x) => x.gapKg > 0 && (x.window === 'open' || x.window === 'urgent'))) {
    actions.push({ id: `gap-${p.crop.id}`, tone: 'attention', title: `${p.crop.name}: short by about ${fmt(p.gapKg)}`, detail: 'Add farmers, check unknown farm details, or agree a lower volume with the buyer.', to: `/plan#${p.crop.id}`, cta: 'Open plan' })
  }
  for (const p of result.plans.filter((x) => x.window === 'perennial' && x.gapKg > 0)) {
    actions.push({ id: `perennial-${p.crop.id}`, tone: 'info', title: `${p.crop.name}: orchards cover ${fmt(p.existingKg)} of ${fmt(p.confirmedKg + p.indicativeKg)}`, detail: 'Discuss a smaller volume or a later window with the buyer.', to: '/demand', cta: 'View demand' })
  }
  const unknownPlots = data.plots.filter((pl) => { const f = data.farmers.find((x) => x.id === pl.farmerId); return f && !farmerEligibility(f, responses[f.id]) && (pl.waterAvailability === 'Unknown' || !pl.soilType) })
  if (unknownPlots.length) actions.push({ id: 'unknown', tone: 'info', title: `Complete water or soil details for ${unknownPlots.length} plot${unknownPlots.length > 1 ? 's' : ''}`, detail: 'Unknown conditions keep land out of the strongest recommendations.', to: '/farmers', cta: 'Update farms' })
  const notRecorded = data.farmers.filter((f) => f.membershipStatus === 'Active' && f.consent.status === 'not-recorded')
  if (notRecorded.length) actions.push({ id: 'consent', tone: 'info', title: `Ask ${notRecorded.map((f) => f.name.split(' ')[0]).join(', ')} about joining this season`, detail: 'Participation isn’t recorded, so their land is not in the plan.', to: `/farmers-plots/${notRecorded[0].id}`, cta: 'Record participation' })
  const indicative = orders.filter((o) => o.status === 'Active' && o.product.orderType === 'Indicative' && findCrop(o.product.crop))
  if (indicative.length) actions.push({ id: 'firm-up', tone: 'info', title: `Firm up ${indicative.length} indicative order${indicative.length > 1 ? 's' : ''}`, detail: `${indicative.map((o) => `${o.product.crop} (${o.buyer.name})`).slice(0, 2).join(', ')}${indicative.length > 2 ? '…' : ''}`, to: '/demand', cta: 'View demand' })
  return actions
}

/** Messaging state for one farmer, comparing what they were told with the current plan. */
export function replyStateFor(farmerId: string, responses: Record<string, FarmerResponse>, allocations: Allocation[]): ResponseStatus | 'needs-update' {
  const r = responses[farmerId]
  if (!r || r.status === 'not-sent') return 'not-sent'
  if (r.status === 'declined') return 'declined'
  const current = assignmentSignature(allocations.filter((a) => a.farmerId === farmerId))
  if (r.sentSignature !== undefined && r.sentSignature !== current) return 'needs-update'
  return r.status
}
