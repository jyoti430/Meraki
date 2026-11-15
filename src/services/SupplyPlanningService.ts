import type { BuyerOrder, Farmer, ParticipationRecord, Reservation, SupplyCandidate, SupplyPlan, Allocation, AllocationWarning, ManualOverride } from '../types'
import {
  getEligibleFarmers, getFarmerParticipation, isActiveCropCycle,
} from './FarmersService'
import type { FarmersData as FarmerStore } from './FarmersService'

export interface SupplyPlanningData {
  plans: SupplyPlan[]
  reservations: Reservation[]
}

export interface SupplyPreview {
  orderId: string
  programmeId: string
  orderQuantityKg: number
  candidates: SupplyCandidate[]
  totalEligibleEstimatedSupplyKg: number
  proposedAllocationKg: number
  uncoveredDemandKg: number
  warnings: AllocationWarning[]
  assumptions: string[]
  sourceFingerprint: string
}

export interface CandidateAdjustment {
  quantityKg: number
  included: boolean
  reason: string
}

export interface AdjustedAllocationResult {
  allocations: Allocation[]
  overrides: ManualOverride[]
  allocatedQuantityKg: number
  uncoveredDemandKg: number
}

const STORAGE_KEY = 'nexus-supply-supply-plans-v1'
const STALE_ESTIMATE_DAYS = 90
const STALE_SOIL_REPORT_DAYS = 365
const now = () => new Date().toISOString()
const dayAge = (date: string) => (Date.now() - new Date(date).getTime()) / 86_400_000
const fold = (value: string) => value.trim().toLocaleLowerCase()
const compare = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1
const validDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const emptySupplyPlanningData: SupplyPlanningData = { plans: [], reservations: [] }

export function loadSupplyPlanningData(): SupplyPlanningData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as SupplyPlanningData).plans) && Array.isArray((parsed as SupplyPlanningData).reservations)) return parsed as SupplyPlanningData
    }
  } catch {
    // Continue with a clean planning workspace if local storage is unavailable or malformed.
  }
  return emptySupplyPlanningData
}

export function persistSupplyPlanningData(data: SupplyPlanningData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {
    // Keep the current browser session usable if local storage is unavailable.
  }
}

function nextId(prefix: string, ids: string[]) {
  const number = Math.max(0, ...ids.map((id) => Number(id.match(/(\d+)$/)?.[1] ?? 0))) + 1
  return `${prefix}-${String(number).padStart(3, '0')}`
}

function latestParticipation(records: ParticipationRecord[]) {
  return records.reduce<ParticipationRecord | undefined>((latest, record) => !latest || record.recordedAt >= latest.recordedAt ? record : latest, undefined)
}

function exclusion(code: string, message: string) { return { code, message } }

function candidateWarnings(cycleUpdatedAt: string, plot: FarmerStore['plots'][number] | undefined, cycleId: string, order: BuyerOrder): AllocationWarning[] {
  const warnings: AllocationWarning[] = []
  if (plot && !plot.soilReport) warnings.push({ code: 'soil-report-missing', message: 'Soil report details are not on file; this is a warning, not an automatic exclusion.', severity: 'warning', candidateId: cycleId })
  if (plot?.soilReport && dayAge(`${plot.soilReport.reportDate}T00:00:00`) > STALE_SOIL_REPORT_DAYS) warnings.push({ code: 'soil-report-stale', message: 'Soil report is more than one year old; verify whether it is still useful.', severity: 'warning', candidateId: cycleId })
  if (!cycleUpdatedAt || !Number.isFinite(dayAge(cycleUpdatedAt))) warnings.push({ code: 'estimate-verification-missing', message: 'Crop cycle has no valid last-updated timestamp for estimate review.', severity: 'warning', candidateId: cycleId })
  else if (dayAge(cycleUpdatedAt) > STALE_ESTIMATE_DAYS) warnings.push({ code: 'estimate-stale', message: 'Crop cycle was last updated more than 90 days ago. This uses record update time as a verification proxy.', severity: 'warning', candidateId: cycleId })
  if (plot?.soilReport && !validDay(plot.soilReport.reportDate)) warnings.push({ code: 'soil-report-date-invalid', message: 'Soil report date is missing or invalid.', severity: 'warning', candidateId: cycleId })
  if (plot?.waterAvailability === 'Unknown') warnings.push({ code: 'water-information-missing', message: 'Water availability is unknown for this plot.', severity: 'warning', candidateId: cycleId })
  else if (plot?.waterAvailability === 'Limited' || plot?.waterAvailability === 'None') warnings.push({ code: 'water-constraint', message: `Plot water availability is recorded as ${plot.waterAvailability.toLowerCase()}.`, severity: 'warning', candidateId: cycleId })
  if (order.specification.criteria.length || order.specification.safetyRequirements.laboratoryReportRequired || order.specification.safetyRequirements.residueTestingRequired || order.specification.safetyRequirements.phytosanitaryDocumentationRequired || order.specification.safetyRequirements.otherDocumentation) {
    warnings.push({ code: 'quality-not-assessed', message: 'Buyer-specific quality and documentation requirements are not verified from crop-cycle records.', severity: 'warning', candidateId: cycleId })
  }
  return warnings
}

export function createSourceFingerprint(order: BuyerOrder, farmers: FarmerStore, planning: SupplyPlanningData, programmeId: string, excludePlanId?: string): string {
  const sortById = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => compare(a.id, b.id))
  const activeReservations = planning.reservations.filter((item) => item.status === 'active' && item.planId !== excludePlanId).sort((a, b) => compare(a.id, b.id))
  return JSON.stringify({
    order: { id: order.id, status: order.status, updatedAt: order.updatedAt, product: order.product, specification: order.specification },
    programmeId,
    farmers: sortById(farmers.farmers).map((item) => ({ id: item.id, membershipStatus: item.membershipStatus, consent: item.consent, updatedAt: item.updatedAt })),
    plots: sortById(farmers.plots).map((item) => ({ id: item.id, farmerId: item.farmerId, waterAvailability: item.waterAvailability, soilType: item.soilType, soilReport: item.soilReport, updatedAt: item.updatedAt })),
    cycles: sortById(farmers.cropCycles).map((item) => ({ id: item.id, plotId: item.plotId, crop: item.crop, variety: item.variety, status: item.status, plantingDate: item.plantingDate, expectedHarvestStartDate: item.expectedHarvestStartDate, expectedHarvestEndDate: item.expectedHarvestEndDate, estimatedProductionKg: item.estimatedProductionKg, waterConstraints: item.waterConstraints, capitalInputConstraints: item.capitalInputConstraints, otherLimitations: item.otherLimitations, updatedAt: item.updatedAt })),
    participation: sortById(farmers.participationRecords),
    reservations: activeReservations.map((item) => ({ id: item.id, cropCycleId: item.cropCycleId, quantityKg: item.quantityKg, status: item.status })),
  })
}

export function generateSupplyPreview(order: BuyerOrder, farmers: FarmerStore, planning: SupplyPlanningData, programmeId = 'FPO-SUPPLY'):
  SupplyPreview {
  if (order.status !== 'Active') throw new Error('Only active buyer orders can be planned.')
  const warnings: AllocationWarning[] = []
  const assumptions = [
    'Harvest compatibility means the crop cycle expected harvest window overlaps the buyer order delivery window.',
    'Only the most recent global, programme and order participation record is used for each scope.',
    'Crop-cycle estimates updated more than 90 days ago are flagged; record update time is only a verification proxy. Soil reports older than 365 days are flagged.',
    'Allocation order is earliest expected harvest start, then farmer ID, then crop cycle ID.',
    'Crop-cycle estimates are not harvested, inspected, released or guaranteed stock.',
    'Crop-cycle records contain no buyer-quality evidence; quality compliance is not inferred.',
  ]
  if (order.product.orderType === 'Indicative') warnings.push({ code: 'indicative-order', message: 'This is an indicative buyer order, not a confirmed commercial commitment.', severity: 'warning' })
  if (!order.product.deliveryStartDate || !order.product.deliveryEndDate) warnings.push({ code: 'delivery-window-missing', message: 'The order has no complete delivery window; harvest compatibility cannot be established.', severity: 'warning' })

  const uniqueCycles = [...new Map(farmers.cropCycles.map((cycle) => [cycle.id, cycle])).values()]
  const candidates: SupplyCandidate[] = uniqueCycles.map((cycle) => {
    const plot = farmers.plots.find((item) => item.id === cycle.plotId)
    const farmer = plot ? farmers.farmers.find((item) => item.id === plot.farmerId) : undefined
    const farmerId = farmer?.id ?? null
    const exclusionReasons = [] as SupplyCandidate['exclusionReasons']
    const participation = farmer ? getFarmerParticipation(farmers, farmer.id) : null
    const scopedRecords = participation?.history ?? []
    const globalRecord = latestParticipation(scopedRecords.filter((item) => item.scope === 'supply-programme' && item.scopeId === null))
    const programmeRecord = latestParticipation(scopedRecords.filter((item) => item.scope === 'supply-programme' && item.scopeId === programmeId))
    const orderRecord = latestParticipation(scopedRecords.filter((item) => item.scope === 'buyer-order' && item.scopeId === order.id))

    if (!plot) exclusionReasons.push(exclusion('plot-missing', 'Crop cycle references a plot that no longer exists.'))
    else if (!farmer) exclusionReasons.push(exclusion('farmer-missing', 'Plot references a farmer that no longer exists.'))
    if (farmer && farmer.membershipStatus !== 'Active') exclusionReasons.push(exclusion('membership-inactive', 'Farmer membership is inactive.'))
    if (farmer?.consent.status === 'opted-out') exclusionReasons.push(exclusion('consent-opted-out', 'Farmer opted out of the general supply programme.'))
    else if (farmer?.consent.status === 'unavailable') exclusionReasons.push(exclusion('consent-unavailable', 'Farmer is unavailable for the general supply programme.'))
    else if (farmer && (!farmer.consent.consented || farmer.consent.status === 'not-recorded')) exclusionReasons.push(exclusion('consent-missing', 'Farmer has not consented to the general supply programme.'))
    if (globalRecord && globalRecord.status !== 'opted-in' && farmer?.consent.status === 'opted-in') exclusionReasons.push(exclusion('programme-opted-out', `Latest general programme record is ${globalRecord.status.replace('-', ' ')}.`))
    if (programmeRecord && programmeRecord.status !== 'opted-in') exclusionReasons.push(exclusion('scoped-programme-unavailable', `Farmer is ${programmeRecord.status.replace('-', ' ')} for programme ${programmeId}.`))
    if (orderRecord && orderRecord.status !== 'opted-in') exclusionReasons.push(exclusion('order-unavailable', `Farmer is ${orderRecord.status.replace('-', ' ')} for buyer order ${order.id}.`))
    if (!isActiveCropCycle(cycle.status)) exclusionReasons.push(exclusion('cycle-not-active', `Crop cycle status is ${cycle.status}; only Planned, Growing and Harvest-ready cycles are considered.`))
    if (fold(cycle.crop) !== fold(order.product.crop)) exclusionReasons.push(exclusion('crop-mismatch', `Crop ${cycle.crop} does not match the order crop ${order.product.crop}.`))
    if (order.product.variety.trim() && fold(cycle.variety) !== fold(order.product.variety)) exclusionReasons.push(exclusion('variety-mismatch', `Variety ${cycle.variety} does not match the order variety ${order.product.variety}.`))
    if (!order.product.deliveryStartDate || !order.product.deliveryEndDate) exclusionReasons.push(exclusion('order-window-missing', 'Buyer delivery dates are incomplete.'))
    else if (!validDay(order.product.deliveryStartDate) || !validDay(order.product.deliveryEndDate) || order.product.deliveryStartDate > order.product.deliveryEndDate) exclusionReasons.push(exclusion('order-window-invalid', 'Buyer delivery dates are invalid.'))
    else if (!validDay(cycle.expectedHarvestStartDate) || !validDay(cycle.expectedHarvestEndDate) || cycle.expectedHarvestStartDate > cycle.expectedHarvestEndDate) exclusionReasons.push(exclusion('harvest-window-invalid', 'Crop cycle harvest dates are missing or invalid.'))
    else if (cycle.expectedHarvestEndDate < order.product.deliveryStartDate || cycle.expectedHarvestStartDate > order.product.deliveryEndDate) exclusionReasons.push(exclusion('harvest-window-mismatch', 'Expected harvest window does not overlap the buyer delivery window.'))
    if (!Number.isFinite(cycle.estimatedProductionKg) || cycle.estimatedProductionKg < 0) exclusionReasons.push(exclusion('estimate-invalid', 'Estimated production is invalid or negative.'))

    const reserved = planning.reservations.filter((item) => item.cropCycleId === cycle.id && item.status === 'active').reduce((total, item) => total + item.quantityKg, 0)
    const estimate = Number.isFinite(cycle.estimatedProductionKg) ? cycle.estimatedProductionKg : 0
    const remaining = Math.max(0, estimate - reserved)
    if (exclusionReasons.length === 0 && remaining <= 0) exclusionReasons.push(exclusion('estimate-fully-reserved', 'No unreserved planning estimate remains for this crop cycle.'))

    const localWarnings = candidateWarnings(cycle.updatedAt, plot, cycle.id, order)
    if (cycle.waterConstraints || cycle.capitalInputConstraints || cycle.otherLimitations) localWarnings.push({ code: 'recorded-supply-constraint', message: 'One or more crop-cycle supply constraints are recorded; review them before confirming.', severity: 'warning', candidateId: cycle.id })
    const eligible = exclusionReasons.length === 0
    return {
      candidateId: cycle.id,
      farmerId,
      plotId: cycle.plotId,
      cropCycleId: cycle.id,
      crop: cycle.crop,
      variety: cycle.variety,
      cycleStatus: cycle.status,
      harvestStartDate: cycle.expectedHarvestStartDate,
      harvestEndDate: cycle.expectedHarvestEndDate,
      estimatedProductionKg: cycle.estimatedProductionKg,
      previouslyReservedKg: reserved,
      remainingEstimateKg: remaining,
      consentStatus: farmer?.consent.status ?? 'not-recorded',
      eligible,
      exclusionReasons,
      warnings: localWarnings,
      proposedAllocationKg: 0,
    }
  })

  const ordered = candidates.sort((a, b) => compare(a.harvestStartDate, b.harvestStartDate) || compare(a.farmerId ?? '', b.farmerId ?? '') || compare(a.cropCycleId, b.cropCycleId))
  let demandRemaining = Math.max(0, Number(order.product.requiredQuantityKg) || 0)
  for (const candidate of ordered) {
    if (!candidate.eligible || demandRemaining <= 0) continue
    const allocation = Math.min(candidate.remainingEstimateKg, demandRemaining)
    candidate.proposedAllocationKg = allocation
    demandRemaining -= allocation
  }
  for (const candidate of ordered) {
    if (candidate.eligible && candidate.proposedAllocationKg > 0 && candidate.proposedAllocationKg < candidate.remainingEstimateKg) {
      candidate.warnings.push({ code: 'partial-allocation', message: `Only ${candidate.proposedAllocationKg} kg was required from ${candidate.remainingEstimateKg} kg of remaining estimate.`, severity: 'info', candidateId: candidate.candidateId })
    }
  }
  const eligibleSupply = ordered.filter((candidate) => candidate.eligible).reduce((total, candidate) => total + candidate.remainingEstimateKg, 0)
  const proposed = ordered.reduce((total, candidate) => total + candidate.proposedAllocationKg, 0)
  if (eligibleSupply <= 0) warnings.push({ code: 'no-eligible-supply', message: 'No eligible, compatible and unreserved planning estimate was found for this order.', severity: 'warning' })
  if (eligibleSupply < Number(order.product.requiredQuantityKg)) warnings.push({ code: 'insufficient-supply', message: `Eligible planning estimate is ${Number(order.product.requiredQuantityKg) - eligibleSupply} kg below the order quantity.`, severity: 'warning' })
  if (eligibleSupply > Number(order.product.requiredQuantityKg)) warnings.push({ code: 'supply-exceeds-demand', message: 'Eligible estimates exceed demand. The deterministic proposal is capped at the order quantity.', severity: 'info' })
  return {
    orderId: order.id,
    programmeId,
    orderQuantityKg: Number(order.product.requiredQuantityKg) || 0,
    candidates: ordered,
    totalEligibleEstimatedSupplyKg: eligibleSupply,
    proposedAllocationKg: proposed,
    uncoveredDemandKg: Math.max(0, (Number(order.product.requiredQuantityKg) || 0) - proposed),
    warnings: [...warnings, ...ordered.flatMap((candidate) => candidate.warnings)],
    assumptions,
    sourceFingerprint: createSourceFingerprint(order, farmers, planning, programmeId),
  }
}

export function applyManualAllocations(preview: SupplyPreview, adjustments: Record<string, CandidateAdjustment>, changedBy = 'Demo Manager'): AdjustedAllocationResult {
  const allocations: Allocation[] = []
  const overrides: ManualOverride[] = []
  const usedCandidates = new Set<string>()
  let total = 0
  for (const candidate of preview.candidates) {
    if (usedCandidates.has(candidate.candidateId)) throw new Error(`Duplicate candidate ${candidate.candidateId} cannot be allocated twice.`)
    usedCandidates.add(candidate.candidateId)
    const adjustment = adjustments[candidate.candidateId] ?? { quantityKg: candidate.proposedAllocationKg, included: candidate.proposedAllocationKg > 0, reason: '' }
    const quantity = adjustment.included ? Number(adjustment.quantityKg) : 0
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`Allocation for ${candidate.candidateId} must be a non-negative quantity.`)
    if (!candidate.eligible && quantity > 0) throw new Error(`${candidate.candidateId} is not eligible and cannot be allocated.`)
    if (quantity > candidate.remainingEstimateKg) throw new Error(`Allocation for ${candidate.candidateId} exceeds its remaining estimate of ${candidate.remainingEstimateKg} kg.`)
    if (quantity !== candidate.proposedAllocationKg && !adjustment.reason.trim()) throw new Error(`Add a reason for changing the proposed quantity for ${candidate.candidateId}.`)
    total += quantity
    allocations.push({ candidateId: candidate.candidateId, farmerId: candidate.farmerId ?? '', plotId: candidate.plotId, cropCycleId: candidate.cropCycleId, proposedQuantityKg: candidate.proposedAllocationKg, adjustedQuantityKg: quantity, included: adjustment.included && quantity > 0, overrideReason: quantity !== candidate.proposedAllocationKg ? adjustment.reason.trim() : '' })
    if (quantity !== candidate.proposedAllocationKg) overrides.push({ candidateId: candidate.candidateId, originalQuantityKg: candidate.proposedAllocationKg, adjustedQuantityKg: quantity, reason: adjustment.reason.trim(), changedAt: now(), changedBy })
  }
  if (total > preview.orderQuantityKg) throw new Error(`Total allocation ${total} kg exceeds the order requirement of ${preview.orderQuantityKg} kg.`)
  return { allocations, overrides, allocatedQuantityKg: total, uncoveredDemandKg: Math.max(0, preview.orderQuantityKg - total) }
}

export function createSupplyPlan(data: SupplyPlanningData, order: BuyerOrder, preview: SupplyPreview, adjusted: AdjustedAllocationResult, status: 'Draft' | 'Previewed'): { data: SupplyPlanningData; plan: SupplyPlan } {
  if (order.id !== preview.orderId) throw new Error('Preview does not belong to the selected buyer order.')
  const plan: SupplyPlan = {
    id: nextId('PLAN-DEMO', data.plans.map((item) => item.id)),
    orderId: order.id,
    programmeId: preview.programmeId,
    status,
    orderQuantityKg: preview.orderQuantityKg,
    sourceFingerprint: preview.sourceFingerprint,
    candidates: preview.candidates,
    allocations: adjusted.allocations,
    overrides: adjusted.overrides,
    warnings: preview.warnings,
    assumptions: preview.assumptions,
    createdAt: now(),
    updatedAt: now(),
    createdBy: 'Demo Manager',
    confirmedAt: null,
    confirmedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: '',
  }
  return { data: { ...data, plans: [plan, ...data.plans] }, plan }
}

export function isSupplyPlanOutdated(plan: SupplyPlan, order: BuyerOrder | undefined, farmers: FarmerStore, planning: SupplyPlanningData): boolean {
  if (!order || plan.status === 'Cancelled') return Boolean(!order)
  return plan.sourceFingerprint !== createSourceFingerprint(order, farmers, planning, plan.programmeId, plan.id)
}

export function displaySupplyPlanStatus(plan: SupplyPlan, order: BuyerOrder | undefined, farmers: FarmerStore, planning: SupplyPlanningData) {
  if (plan.status !== 'Cancelled' && isSupplyPlanOutdated(plan, order, farmers, planning)) return 'Needs Review' as const
  return plan.status
}

export function confirmSupplyPlan(data: SupplyPlanningData, planId: string, order: BuyerOrder | undefined, farmers: FarmerStore, confirmedBy = 'Demo Manager'): SupplyPlanningData {
  const plan = data.plans.find((item) => item.id === planId)
  if (!plan) throw new Error('Supply plan not found.')
  if (plan.status !== 'Draft' && plan.status !== 'Previewed') throw new Error('Only a draft or previewed plan can be confirmed.')
  if (!order || order.status !== 'Active') throw new Error('The buyer order is no longer active. Review the plan before confirmation.')
  if (isSupplyPlanOutdated(plan, order, farmers, data)) throw new Error('The source data changed after this preview. Generate a new plan before confirming.')
  const preview = generateSupplyPreview(order, farmers, data, plan.programmeId)
  const candidateMap = new Map(preview.candidates.map((candidate) => [candidate.candidateId, candidate]))
  let allocationTotal = 0
  for (const allocation of plan.allocations) {
    if (!allocation.included || allocation.adjustedQuantityKg <= 0) continue
    const candidate = candidateMap.get(allocation.cropCycleId)
    if (!candidate?.eligible) throw new Error(`Crop cycle ${allocation.cropCycleId} is no longer eligible.`)
    if (allocation.adjustedQuantityKg > candidate.remainingEstimateKg) throw new Error(`Crop cycle ${allocation.cropCycleId} has only ${candidate.remainingEstimateKg} kg of remaining estimate.`)
    allocationTotal += allocation.adjustedQuantityKg
  }
  if (allocationTotal > Number(order.product.requiredQuantityKg)) throw new Error('The plan allocation exceeds the current buyer order quantity.')
  if (allocationTotal <= 0) throw new Error('At least one positive allocation is required to confirm this plan.')
  const createdAt = now()
  const reservations = [...data.reservations]
  for (const allocation of plan.allocations.filter((item) => item.included && item.adjustedQuantityKg > 0)) {
    reservations.push({
      id: nextId('RES-DEMO', reservations.map((item) => item.id)),
      planId: plan.id,
      orderId: plan.orderId,
      farmerId: allocation.farmerId,
      plotId: allocation.plotId,
      cropCycleId: allocation.cropCycleId,
      quantityKg: allocation.adjustedQuantityKg,
      status: 'active',
      createdAt,
      releasedAt: null,
      releaseReason: '',
      history: [{ status: 'active', changedAt: createdAt, changedBy: confirmedBy, reason: 'Reservation created when supply plan was confirmed.' }],
    })
  }
  return {
    ...data,
    plans: data.plans.map((item) => item.id === plan.id ? { ...item, status: 'Confirmed', confirmedAt: createdAt, confirmedBy, updatedAt: createdAt } : item),
    reservations,
  }
}

export function cancelSupplyPlan(data: SupplyPlanningData, planId: string, reason: string, cancelledBy = 'Demo Manager'): SupplyPlanningData {
  if (!reason.trim()) throw new Error('A cancellation reason is required.')
  const plan = data.plans.find((item) => item.id === planId)
  if (!plan) throw new Error('Supply plan not found.')
  if (plan.status === 'Cancelled') throw new Error('This plan has already been cancelled.')
  const cancelledAt = now()
  return {
    plans: data.plans.map((item) => item.id === plan.id ? { ...item, status: 'Cancelled', cancelledAt, cancelledBy, cancellationReason: reason.trim(), updatedAt: cancelledAt } : item),
    reservations: data.reservations.map((reservation) => reservation.planId === planId && reservation.status === 'active' ? {
      ...reservation,
      status: 'released',
      releasedAt: cancelledAt,
      releaseReason: reason.trim(),
      history: [...reservation.history, { status: 'released', changedAt: cancelledAt, changedBy: cancelledBy, reason: reason.trim() }],
    } : reservation),
  }
}

export function getReservedQuantity(data: SupplyPlanningData, cropCycleId: string, excludingPlanId?: string) {
  return data.reservations.filter((item) => item.status === 'active' && item.cropCycleId === cropCycleId && item.planId !== excludingPlanId).reduce((total, item) => total + item.quantityKg, 0)
}

export function getGlobalEligibleEstimate(farmers: FarmerStore, planning: SupplyPlanningData): number {
  const eligibleIds = new Set(getEligibleFarmers(farmers).map((farmer: Farmer) => farmer.id))
  const plots = new Map(farmers.plots.map((plot) => [plot.id, plot]))
  const seen = new Set<string>()
  return farmers.cropCycles.reduce((total, cycle) => {
    if (seen.has(cycle.id) || !isActiveCropCycle(cycle.status) || !Number.isFinite(cycle.estimatedProductionKg) || cycle.estimatedProductionKg < 0) return total
    seen.add(cycle.id)
    const farmerId = plots.get(cycle.plotId)?.farmerId
    if (!farmerId || !eligibleIds.has(farmerId)) return total
    return total + Math.max(0, cycle.estimatedProductionKg - getReservedQuantity(planning, cycle.id))
  }, 0)
}

export function getUncoveredDemand(order: BuyerOrder, planning: SupplyPlanningData) {
  const reserved = planning.reservations.filter((item) => item.status === 'active' && item.orderId === order.id).reduce((total, item) => total + item.quantityKg, 0)
  return Math.max(0, Number(order.product.requiredQuantityKg) - reserved)
}

export function getAllocationTotals(allocations: Allocation[]) {
  return allocations.reduce((total, allocation) => total + (allocation.included ? allocation.adjustedQuantityKg : 0), 0)
}

export function getFarmerForCandidate(farmers: FarmerStore, candidate: SupplyCandidate) {
  return candidate.farmerId ? farmers.farmers.find((farmer) => farmer.id === candidate.farmerId) : undefined
}
