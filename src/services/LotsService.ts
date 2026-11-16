import type { BuyerOrder, CropCycle, EvidenceAttachment, Farmer, GradeAllocation, Inspection, Lot, LotEvent, Plot, SafetyEvidenceStatus, Sample, Sublot, SupplyPlan } from '../types'
import type { SupplyPlanningData } from './SupplyPlanningService'

export interface LotsData { lots: Lot[] }
export const emptyLotsData: LotsData = { lots: [] }
const STORAGE_KEY = 'nexus-supply-lots-v1'
const stamp = () => new Date().toISOString()
const nextId = (prefix: string, ids: string[]) => `${prefix}-${String(Math.max(0, ...ids.map((id) => Number(id.match(/(\d+)$/)?.[1] ?? 0))) + 1).padStart(4, '0')}`
const mergeSafetyStatus = (current: SafetyEvidenceStatus, next: SafetyEvidenceStatus): SafetyEvidenceStatus => {
  if (current === 'Hold' || next === 'Hold') return 'Hold'
  const rank: Record<Exclude<SafetyEvidenceStatus, 'Hold'>, number> = { Unknown: 0, Pending: 1, 'Under Review': 2, Reviewed: 3 }
  return rank[next] >= rank[current as Exclude<SafetyEvidenceStatus, 'Hold'>] ? next : current
}
export function loadLotsData(): LotsData {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object' && Array.isArray((parsed as LotsData).lots)) return parsed as LotsData } } catch { /* use empty local data */ }
  return emptyLotsData
}
export function persistLotsData(data: LotsData) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* continue in memory if storage is unavailable */ } }

export interface ReceiptInput {
  receiptToken: string
  plan: SupplyPlan; order: BuyerOrder; allocationIndex: number; farmer: Farmer; plot: Plot; cycle: CropCycle
  harvestDate: string; arrivalAt: string; grossWeightKg: number; tareWeightKg: number; operator: string; observations: string
}

export function receiveProduce(data: LotsData, planning: SupplyPlanningData, input: ReceiptInput): { data: LotsData; lot: Lot } {
  if (!input.receiptToken.trim()) throw new Error('Receipt submission token is missing. Refresh the form and try again.')
  const duplicate = data.lots.find((lot) => lot.receiptToken === input.receiptToken)
  if (duplicate) return { data, lot: duplicate }
  const { plan, order } = input
  if (plan.status !== 'Confirmed') throw new Error('Produce can only be received against a confirmed supply plan.')
  if (plan.orderId !== order.id || order.status !== 'Active') throw new Error('The linked buyer order must be active and match the supply plan.')
  const allocation = plan.allocations[input.allocationIndex]
  if (!allocation || !allocation.included || allocation.adjustedQuantityKg <= 0) throw new Error('Select an included allocation with a planned quantity.')
  const reservation = planning.reservations.find((item) => item.planId === plan.id && item.farmerId === allocation.farmerId && item.plotId === allocation.plotId && item.cropCycleId === allocation.cropCycleId && item.status === 'active')
  if (!reservation) throw new Error('No active harvest planning reservation is linked to this confirmed allocation.')
  if (allocation.farmerId !== input.farmer.id || allocation.plotId !== input.plot.id || allocation.cropCycleId !== input.cycle.id || input.cycle.plotId !== input.plot.id || input.plot.farmerId !== input.farmer.id) throw new Error('Farmer, plot and crop cycle must match the selected plan allocation.')
  if (input.grossWeightKg < 0 || input.tareWeightKg < 0 || !Number.isFinite(input.grossWeightKg) || !Number.isFinite(input.tareWeightKg) || input.tareWeightKg > input.grossWeightKg) throw new Error('Enter valid weights. Tare must be no greater than gross and both must be zero or greater.')
  if (!input.operator.trim() || !input.harvestDate || !input.arrivalAt || !Number.isFinite(new Date(`${input.harvestDate}T00:00:00`).getTime()) || !Number.isFinite(new Date(input.arrivalAt).getTime())) throw new Error('Enter valid harvest and arrival dates and an operator.')
  const net = input.grossWeightKg - input.tareWeightKg
  if (net <= 0) throw new Error('Net received weight must be greater than zero.')
  const previouslyReceived = data.lots.filter((lot) => lot.supplyPlanId === plan.id && lot.cropCycleId === input.cycle.id && lot.farmerId === input.farmer.id).reduce((sum, lot) => sum + lot.weights.netReceivedWeightKg, 0)
  const remaining = Math.max(0, Math.min(allocation.adjustedQuantityKg - previouslyReceived, reservation.quantityKg))
  if (remaining <= 0) throw new Error('This allocation has already been fully received. Create no duplicate receipt.')
  const id = nextId('LOT', data.lots.map((lot) => lot.id))
  const plannedQuantityKg = remaining
  const version = plan.buyerSpecificationVersion ?? null
  const occurredAt = stamp()
  const delta = net - plannedQuantityKg
  const lot: Lot = {
    id, receiptToken: input.receiptToken, farmerId: input.farmer.id, plotId: input.plot.id, cropCycleId: input.cycle.id, supplyPlanId: plan.id, buyerOrderId: order.id,
    buyerSpecificationVersion: version, crop: input.cycle.crop, variety: input.cycle.variety,
    harvestDate: input.harvestDate, arrivalAt: new Date(input.arrivalAt).toISOString(),
    weights: { plannedQuantityKg, grossWeightKg: input.grossWeightKg, tareWeightKg: input.tareWeightKg, netReceivedWeightKg: net, shortageKg: Math.max(0, -delta), excessKg: Math.max(0, delta), reconciliation: delta > 0 ? 'excess' : delta < 0 ? 'shortage' : 'matched', recordedAt: occurredAt, recordedBy: input.operator.trim() },
    reservationReconciledAt: null, reservationReconciledBy: null,
    operator: input.operator.trim(), initialObservations: input.observations.trim(), inspectionStatus: 'Unassessed', safetyEvidenceStatus: 'Unknown', status: 'Received',
    inspections: [], sublots: [], samples: [],
    events: [{ id: `${id}-EVT-001`, lotId: id, type: 'Produce received', description: `${net.toLocaleString()} kg net received against ${plannedQuantityKg.toLocaleString()} kg remaining allocation.${delta > 0 ? ` ${delta.toLocaleString()} kg excess flagged for review.` : delta < 0 ? ` ${Math.abs(delta).toLocaleString()} kg shortage recorded.` : ''}`, occurredAt, actor: input.operator.trim() }],
    createdAt: occurredAt, updatedAt: occurredAt,
  }
  return { data: { lots: [lot, ...data.lots] }, lot }
}

export function appendLotEvent(lot: Lot, type: string, description: string, actor: string, data?: Record<string, unknown>): LotEvent {
  return { id: `${lot.id}-EVT-${String(lot.events.length + 1).padStart(3, '0')}`, lotId: lot.id, type, description, occurredAt: stamp(), actor, data }
}

export function getLotById(data: LotsData, lotId: string) { return data.lots.find((lot) => lot.id === lotId) }
export function getLotHistory(data: LotsData, lotId: string) { return getLotById(data, lotId)?.events ?? [] }

export function recordGradeAllocations(lot: Lot, grades: GradeAllocation[], sampleQuantityKg: number, lossQuantityKg: number) {
  if (grades.some((grade) => !grade.grade.trim() || !Number.isFinite(grade.quantityKg) || grade.quantityKg < 0)) throw new Error('Every grade needs a name and non-negative quantity.')
  if (!Number.isFinite(sampleQuantityKg) || sampleQuantityKg < 0 || !Number.isFinite(lossQuantityKg) || lossQuantityKg < 0) throw new Error('Sample and loss quantities must be non-negative valid numbers.')
  const total = grades.reduce((sum, grade) => sum + grade.quantityKg, 0) + sampleQuantityKg + lossQuantityKg
  if (Math.abs(total - lot.weights.netReceivedWeightKg) > 0.001) throw new Error(`Grade, sample and loss quantities total ${total} kg; reconcile exactly to ${lot.weights.netReceivedWeightKg} kg net received.`)
}

export function createSublots(lot: Lot, inspectionId: string, grades: GradeAllocation[], status: Inspection['status']): Sublot[] {
  const occurredAt = stamp()
  return grades.filter((grade) => grade.quantityKg > 0).map((grade, index) => ({ id: `${lot.id}-S${String(lot.sublots.length + index + 1).padStart(2, '0')}`, parentLotId: lot.id, grade: grade.grade, quantityKg: grade.quantityKg, observations: [grade.observations, grade.downgradeReason ? `Downgrade reason: ${grade.downgradeReason}` : ''].filter(Boolean).join(' · '), inspectionId, safetyEvidenceStatus: lot.safetyEvidenceStatus, status: status === 'Needs Review' ? 'On Hold' : 'Ready for Review', evidence: [], createdAt: occurredAt }))
}

export function reconcileActualReceivedQuantity(lot: Lot, actor: string): Lot {
  if (lot.reservationReconciledAt) throw new Error('This receipt has already been reconciled.')
  const occurredAt = stamp()
  const applied = Math.min(lot.weights.netReceivedWeightKg, lot.weights.plannedQuantityKg)
  return { ...lot, reservationReconciledAt: occurredAt, reservationReconciledBy: actor, updatedAt: occurredAt, events: [...lot.events, appendLotEvent(lot, 'Reservation reconciled', `${applied} kg applied against its harvest reservation. Any excess stays flagged for review.`, actor)] }
}

export function addSublotEvidence(data: LotsData, lotId: string, sublotId: string, attachment: EvidenceAttachment, actor: string): LotsData {
  const lot = data.lots.find((item) => item.id === lotId)
  if (!lot) throw new Error('Lot not found.')
  if (!lot.sublots.some((item) => item.id === sublotId)) throw new Error('Sublot not found on this parent lot.')
  const occurredAt = stamp()
  const updated: Lot = { ...lot, sublots: lot.sublots.map((item) => item.id === sublotId ? { ...item, evidence: [...item.evidence, attachment] } : item), updatedAt: occurredAt, events: [...lot.events, appendLotEvent(lot, 'Sublot evidence attached', `${attachment.name} added to ${sublotId}.`, actor, { sublotId, evidenceId: attachment.id })] }
  return { lots: data.lots.map((item) => item.id === lotId ? updated : item) }
}

export function recordInspection(data: LotsData, lotId: string, input: Omit<Inspection, 'id' | 'lotId' | 'historyRecordedAt'>): LotsData {
  const lot = data.lots.find((item) => item.id === lotId)
  if (!lot) throw new Error('Lot not found.')
  if (lot.inspections.some((inspection) => inspection.status === 'Completed' || inspection.status === 'Needs Review')) throw new Error('This lot already has a completed inspection record. Use its history as the current inspection evidence.')
  if (!input.inspector.trim() || !Number.isFinite(new Date(input.inspectedAt).getTime()) || !input.samplingMethod.trim() || input.sampleQuantity < 0 || !Number.isFinite(input.sampleQuantity) || input.sampleQuantityKg < 0 || !Number.isFinite(input.sampleQuantityKg) || input.lossQuantityKg < 0 || !Number.isFinite(input.lossQuantityKg)) throw new Error('Complete the inspection details and use valid non-negative sample and loss quantities.')
  if (input.measurements.some((item) => !item.attribute.trim() || !item.value.trim() || !item.unit.trim())) throw new Error('Each measurement needs an attribute, value and unit.')
  recordGradeAllocations(lot, input.grades, input.sampleQuantityKg, input.lossQuantityKg)
  const occurredAt = stamp()
  const id = nextId('INSP', data.lots.flatMap((item) => item.inspections.map((inspection) => inspection.id)))
  const inspection: Inspection = { ...input, id, lotId, inspector: input.inspector.trim(), inspectedAt: new Date(input.inspectedAt).toISOString(), historyRecordedAt: occurredAt }
  const sublots = createSublots(lot, id, input.grades, input.status)
  const updated: Lot = { ...lot, inspections: [...lot.inspections, inspection], sublots: [...lot.sublots, ...sublots], inspectionStatus: input.status, status: input.status === 'Needs Review' ? 'On Hold' : 'Ready for Review', updatedAt: occurredAt, events: [...lot.events, appendLotEvent(lot, 'Inspection recorded', `Inspection ${id} recorded with ${input.measurements.length} measurements and ${sublots.length} grade sublot(s).`, input.inspector)] }
  return { lots: data.lots.map((item) => item.id === lotId ? updated : item) }
}

export function createSample(data: LotsData, lotId: string, input: Omit<Sample, 'id' | 'lotId'>): LotsData {
  const lot = data.lots.find((item) => item.id === lotId)
  if (!lot) throw new Error('Lot not found.')
  if (!input.collector.trim() || !input.collectedAt || !input.samplingMethod.trim() || input.quantity <= 0 || !Number.isFinite(input.quantity) || !input.unit.trim()) throw new Error('Enter a collector, collection time, method and positive sample quantity.')
  if (input.sublotId && !lot.sublots.some((sublot) => sublot.id === input.sublotId)) throw new Error('Selected sublot does not belong to this lot.')
  const sample: Sample = { ...input, id: nextId('SAMPLE', data.lots.flatMap((item) => item.samples.map((sample) => sample.id))), lotId, collector: input.collector.trim(), collectedAt: new Date(input.collectedAt).toISOString() }
  const occurredAt = stamp()
  const sampleEvidenceStatus: SafetyEvidenceStatus = sample.status === 'Hold' ? 'Hold' : sample.status === 'Reviewed' ? 'Reviewed' : sample.status === 'Under review' || sample.status === 'Result received' ? 'Under Review' : sample.status === 'Submitted' || sample.status === 'Pending' ? 'Pending' : 'Unknown'
  const sublots = sample.sublotId ? lot.sublots.map((item) => item.id === sample.sublotId ? { ...item, safetyEvidenceStatus: mergeSafetyStatus(item.safetyEvidenceStatus, sampleEvidenceStatus), status: item.status === 'On Hold' || sampleEvidenceStatus === 'Hold' ? 'On Hold' as const : item.status } : item) : lot.sublots
  const hasHeldSublot = sublots.some((item) => item.safetyEvidenceStatus === 'Hold')
  const safetyEvidenceStatus = hasHeldSublot ? 'Hold' : mergeSafetyStatus(lot.safetyEvidenceStatus, sampleEvidenceStatus)
  const status = safetyEvidenceStatus === 'Hold' || lot.status === 'On Hold' ? 'On Hold' : !sample.sublotId && safetyEvidenceStatus !== 'Reviewed' && lot.status !== 'Ready for Review' ? 'Awaiting Evidence' : lot.status
  const updated: Lot = { ...lot, samples: [...lot.samples, sample], sublots, safetyEvidenceStatus, status, updatedAt: occurredAt, events: [...lot.events, appendLotEvent(lot, 'Laboratory sample collected', `${sample.id} recorded${sample.laboratoryName ? ` for ${sample.laboratoryName}` : ''}; status ${sample.status}. Sample status records evidence workflow only and is not a compliance or release decision.`, sample.collector)] }
  return { lots: data.lots.map((item) => item.id === lotId ? updated : item) }
}

export function getSpecificationForLot(lot: Lot, order: BuyerOrder | undefined) {
  if (!order) return null
  const versions = order.specificationHistory ?? []
  return versions.find((item) => item.version === lot.buyerSpecificationVersion)?.specification ?? (order.specificationVersion === lot.buyerSpecificationVersion ? order.specification : null)
}
