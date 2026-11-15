import type { BuyerOrder, EvidenceReview, EvidenceReviewStatus, LabTestResult, LaboratoryReport, Lot, ReleaseOutcome, ReleaseReviewHistory, RequirementGroup, RequirementReview, RequirementReviewResult, Sample } from '../types'
import { getSpecificationForLot } from './LotsService'

export interface LabReviewData {
  reports: LaboratoryReport[]
  evidenceReviews: EvidenceReview[]
  requirementReviews: RequirementReview[]
  releaseHistory: ReleaseReviewHistory[]
}
export const emptyLabReviewData: LabReviewData = { reports: [], evidenceReviews: [], requirementReviews: [], releaseHistory: [] }
const STORAGE_KEY = 'nexus-supply-lab-review-v1'
const now = () => new Date().toISOString()
const nextId = (prefix: string, ids: string[]) => `${prefix}-${String(Math.max(0, ...ids.map((id) => Number(id.match(/(\d+)$/)?.[1] ?? 0))) + 1).padStart(4, '0')}`
const fold = (value: string) => value.trim().toLocaleLowerCase()

export function loadLabReviewData(): LabReviewData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const value = parsed as Partial<LabReviewData>
        return { reports: value.reports ?? [], evidenceReviews: value.evidenceReviews ?? [], requirementReviews: value.requirementReviews ?? [], releaseHistory: value.releaseHistory ?? [] }
      }
    }
  } catch { /* use local demo state */ }
  return emptyLabReviewData
}
export function persistLabReviewData(data: LabReviewData) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* retain browser-session state */ } }

export interface NewLaboratoryReport {
  reportId: string
  lotId: string
  sampleId: string
  supersedesReportId: string | null
  issuingLaboratory: string
  reportDate: string
  results: LabTestResult[]
  documentReference: string
  attachment: LaboratoryReport['attachment']
  reviewerNotes: string
  createdBy: string
}

export interface ReviewRequirementInput {
  requirementId: string
  group: RequirementGroup
  requirement: string
  requiredCondition: string
  required: boolean
  result: RequirementReviewResult
  evidenceReference: string
  reviewerNote: string
}

export interface RequirementDefinition {
  id: string
  group: RequirementGroup
  requirement: string
  requiredCondition: string
  required: boolean
  suggestedResult: RequirementReviewResult
  suggestionReason: string
  evidenceReference: string
}

export function createReviewFingerprint(lot: Lot, order: BuyerOrder, data: LabReviewData) {
  const specification = getSpecificationForLot(lot, order)
  return JSON.stringify({
    lotId: lot.id, orderId: order.id, specificationVersion: lot.buyerSpecificationVersion, specification,
    inspectionStatus: lot.inspectionStatus, inspections: lot.inspections, sublots: lot.sublots, samples: lot.samples,
    reports: data.reports.filter((report) => report.lotId === lot.id),
    evidenceReviews: data.evidenceReviews.filter((review) => review.lotId === lot.id),
  })
}

export function validateLaboratoryReport(report: LaboratoryReport, lot: Lot, sample: Sample | undefined) {
  const errors: string[] = []
  const warnings: string[] = []
  if (report.lotId !== lot.id) errors.push('Report lot reference does not match the current lot.')
  if (report.buyerOrderId !== lot.buyerOrderId || report.buyerSpecificationVersion !== lot.buyerSpecificationVersion) errors.push('Report order or specification-version reference does not match the lot.')
  if (!sample || sample.lotId !== lot.id || sample.id !== report.sampleId) errors.push('Report must reference a sample belonging to this lot.')
  else if (sample.collectedAt !== report.sampleCollectedAt) errors.push('Report sample collection timestamp does not match the lot sample record.')
  if (!report.reportId.trim() || !report.issuingLaboratory.trim() || !Number.isFinite(new Date(report.reportDate).getTime())) errors.push('Report ID, issuing laboratory and valid report date are required.')
  if (!report.results.length) errors.push('No analyte/test results are recorded. Missing results cannot be treated as a pass.')
  for (const [index, result] of report.results.entries()) {
    if (!result.analyte.trim()) errors.push(`Result ${index + 1} has no analyte/test name.`)
    if (!result.result.trim() || !result.unit.trim()) errors.push(`Result ${index + 1} needs a reported value and unit.`)
    if (!result.testingMethod.trim()) warnings.push(`Result ${index + 1} has no testing method recorded.`)
    if (!result.reportingLimit.trim()) warnings.push(`Result ${index + 1} has no reporting limit recorded.`)
  }
  return { valid: errors.length === 0, errors, warnings }
}

export function createLaboratoryReport(data: LabReviewData, lot: Lot, input: NewLaboratoryReport): { data: LabReviewData; report: LaboratoryReport } {
  const sample = lot.samples.find((item) => item.id === input.sampleId)
  if (input.lotId !== lot.id || !sample) throw new Error('Select a sample linked to the selected lot.')
  if (!input.reportId.trim() || data.reports.some((item) => item.reportId.trim().toLocaleLowerCase() === input.reportId.trim().toLocaleLowerCase())) throw new Error('Enter a unique laboratory report ID.')
  if (input.supersedesReportId) {
    const prior = data.reports.find((item) => item.id === input.supersedesReportId && item.lotId === lot.id && item.sampleId === sample.id)
    if (!prior || data.reports.some((item) => item.supersedesReportId === prior.id)) throw new Error('A replacement report must explicitly refer to an active report for the same lot and sample.')
  }
  if (!input.issuingLaboratory.trim() || !Number.isFinite(new Date(input.reportDate).getTime()) || !input.createdBy.trim()) throw new Error('Issuing laboratory, report date and reviewer/recorder name are required.')
  if (input.results.some((result) => result.result.trim() && !result.unit.trim())) throw new Error('Add a unit for each reported result value.')
  const createdAt = now()
  const report: LaboratoryReport = {
    ...input, id: nextId('LAB', data.reports.map((item) => item.id)), reportId: input.reportId.trim(), lotId: lot.id,
    sampleId: sample.id, sampleCollectedAt: sample.collectedAt, buyerOrderId: lot.buyerOrderId,
    buyerSpecificationVersion: lot.buyerSpecificationVersion, issuingLaboratory: input.issuingLaboratory.trim(),
    reportDate: new Date(input.reportDate).toISOString(), createdAt, createdBy: input.createdBy.trim(),
    results: input.results.map((result) => ({ ...result })),
  }
  const initial: EvidenceReview = { id: nextId('EVR', data.evidenceReviews.map((item) => item.id)), reportId: report.id, lotId: lot.id, status: 'Pending', reason: 'Awaiting authorised evidence review.', reviewer: input.createdBy.trim(), reviewedAt: createdAt }
  return { data: { ...data, reports: [report, ...data.reports], evidenceReviews: [initial, ...data.evidenceReviews] }, report }
}

export function getLatestEvidenceReview(data: LabReviewData, reportId: string) {
  return data.evidenceReviews.filter((item) => item.reportId === reportId).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0]
}

export function reviewLaboratoryEvidence(data: LabReviewData, lot: Lot, reportId: string, status: EvidenceReviewStatus, reviewer: string, reason: string): LabReviewData {
  const report = data.reports.find((item) => item.id === reportId && item.lotId === lot.id)
  if (!report) throw new Error('Laboratory report not found for this lot.')
  if (!reviewer.trim()) throw new Error('Reviewer name is required.')
  if ((status === 'Rejected' || status === 'Accepted') && !reason.trim()) throw new Error(`A reason or note is required to mark evidence ${status.toLowerCase()}.`)
  if (status === 'Rejected' && !reason.trim()) throw new Error('Rejected evidence requires a recorded reason.')
  if (status === 'Accepted') {
    const validation = validateLaboratoryReport(report, lot, lot.samples.find((sample) => sample.id === report.sampleId))
    if (!validation.valid) throw new Error(`Evidence cannot be accepted yet: ${validation.errors.join(' ')}`)
  }
  const entry: EvidenceReview = { id: nextId('EVR', data.evidenceReviews.map((item) => item.id)), reportId, lotId: lot.id, status, reason: reason.trim(), reviewer: reviewer.trim(), reviewedAt: now() }
  return { ...data, evidenceReviews: [entry, ...data.evidenceReviews] }
}

const allLotReports = (lot: Lot, data: LabReviewData) => data.reports.filter((report) => report.lotId === lot.id)
const activeLotReports = (lot: Lot, data: LabReviewData) => {
  const reports = allLotReports(lot, data)
  const supersededIds = new Set(reports.map((report) => report.supersedesReportId).filter((id): id is string => Boolean(id)))
  return reports.filter((report) => !supersededIds.has(report.id))
}
const acceptedReports = (lot: Lot, data: LabReviewData) => activeLotReports(lot, data).filter((report) => getLatestEvidenceReview(data, report.id)?.status === 'Accepted')

export function getLabEvidenceStatus(lot: Lot, data: LabReviewData) {
  const reports = activeLotReports(lot, data)
  if (!reports.length) return lot.safetyEvidenceStatus
  const statuses = reports.map((report) => getLatestEvidenceReview(data, report.id)?.status ?? 'Pending')
  if (statuses.includes('Rejected')) return 'Rejected Evidence'
  if (statuses.includes('Pending')) return 'Pending'
  if (statuses.includes('Under Review')) return 'Under Review'
  return statuses.every((status) => status === 'Accepted') ? 'Reviewed' : lot.safetyEvidenceStatus
}

function qualitySuggestion(lot: Lot, criterionId: string, minimum: string, maximum: string, unit: string) {
  const inspection = [...lot.inspections].reverse().find((entry) => entry.buyerSpecificationVersion === lot.buyerSpecificationVersion)
  const measurements = inspection?.measurements.filter((entry) => entry.criterionId === criterionId) ?? []
  if (!measurements.length) return { result: 'Insufficient Evidence' as const, reason: 'No measurement is linked to this criterion in the inspection for the applicable specification version.', reference: inspection?.id ?? '' }
  const measurement = measurements[measurements.length - 1]
  const value = Number(measurement.value)
  if (!Number.isFinite(value) || fold(measurement.unit) !== fold(unit)) return { result: 'Insufficient Evidence' as const, reason: 'Recorded value is not numeric or its unit does not match the buyer criterion.', reference: inspection?.id ?? '' }
  const lower = minimum.trim() ? Number(minimum) : null
  const upper = maximum.trim() ? Number(maximum) : null
  if ((lower !== null && !Number.isFinite(lower)) || (upper !== null && !Number.isFinite(upper)) || (lower === null && upper === null)) return { result: 'Insufficient Evidence' as const, reason: 'The configured buyer criterion has no usable numeric range for an automatic comparison.', reference: inspection?.id ?? '' }
  const pass = (lower === null || value >= lower) && (upper === null || value <= upper)
  return { result: pass ? 'Pass' as const : 'Fail' as const, reason: `${measurement.value} ${measurement.unit} compared with the configured buyer range ${minimum || '—'} to ${maximum || '—'} ${unit}.`, reference: inspection?.id ?? '' }
}

function reportSafetyCompleteness(report: LaboratoryReport, lot: Lot, data: LabReviewData, requireRequestedTests: boolean) {
  const sample = lot.samples.find((item) => item.id === report.sampleId)
  const validation = validateLaboratoryReport(report, lot, sample)
  if (validation.errors.length) return false
  if (getLatestEvidenceReview(data, report.id)?.status !== 'Accepted') return false
  if (!report.results.every((item) => item.testingMethod.trim() && item.reportingLimit.trim())) return false
  if (requireRequestedTests) {
    if (!sample?.testsRequested.length) return false
    const analytes = new Set(report.results.map((item) => fold(item.analyte)))
    if (!sample.testsRequested.every((item) => analytes.has(fold(item)))) return false
  }
  return true
}

export function getRequirementDefinitions(lot: Lot, order: BuyerOrder, data: LabReviewData): RequirementDefinition[] {
  const specification = getSpecificationForLot(lot, order)
  if (!specification) return []
  const reports = acceptedReports(lot, data)
  const requirements: RequirementDefinition[] = []
  for (const criterion of specification.criteria) {
    const suggestion = qualitySuggestion(lot, criterion.id, criterion.minimum, criterion.maximum, criterion.unit)
    requirements.push({ id: `quality:${criterion.id}`, group: 'Commercial / quality', requirement: criterion.attribute, requiredCondition: `${criterion.minimum || 'No minimum'} to ${criterion.maximum || 'No maximum'} ${criterion.unit}${criterion.notes ? ` · ${criterion.notes}` : ''}`, required: criterion.required, suggestedResult: suggestion.result, suggestionReason: suggestion.reason, evidenceReference: suggestion.reference })
  }
  if (order.product.preferredGrade.trim()) {
    const found = lot.sublots.find((item) => fold(item.grade) === fold(order.product.preferredGrade) && item.quantityKg > 0)
    requirements.push({ id: 'commercial:preferred-grade', group: 'Commercial / quality', requirement: 'Preferred commercial grade', requiredCondition: order.product.preferredGrade, required: false, suggestedResult: found ? 'Pass' : lot.sublots.length ? 'Fail' : 'Insufficient Evidence', suggestionReason: found ? `A ${found.quantityKg} kg sublot is recorded as ${found.grade}.` : lot.sublots.length ? 'No inspected sublot matches the requested grade.' : 'No grade allocation has been recorded.', evidenceReference: found?.id ?? lot.inspections[lot.inspections.length - 1]?.id ?? '' })
  }
  const hasAcceptedCompleteReport = reports.some((report) => reportSafetyCompleteness(report, lot, data, false))
  if (specification.safetyRequirements.laboratoryReportRequired) requirements.push({ id: 'safety:laboratory-report', group: 'Safety and laboratory', requirement: 'Laboratory report', requiredCondition: 'A linked sample report with analyte, result, unit, testing method and reporting limit, reviewed and accepted.', required: true, suggestedResult: hasAcceptedCompleteReport ? 'Pass' : reports.length ? 'Insufficient Evidence' : 'Pending', suggestionReason: hasAcceptedCompleteReport ? 'An accepted, structurally complete report is available.' : reports.length ? 'Reports exist, but accepted evidence or required report fields are missing.' : 'No laboratory report has been recorded.', evidenceReference: reports.find((report) => reportSafetyCompleteness(report, lot, data, false))?.reportId ?? reports[0]?.reportId ?? '' })
  if (specification.safetyRequirements.residueTestingRequired) {
    const completeResidueReport = reports.find((report) => reportSafetyCompleteness(report, lot, data, true))
    requirements.push({ id: 'safety:residue-testing', group: 'Safety and laboratory', requirement: 'Residue testing', requiredCondition: 'Buyer order requires residue testing. No analyte-specific limits are configured in this order; reviewer must document the applicable buyer condition and evidence reference.', required: true, suggestedResult: completeResidueReport ? 'Insufficient Evidence' : 'Pending', suggestionReason: completeResidueReport ? 'Requested analytes include method and reporting limit, but this order has no configured pass threshold. Record a manual, buyer-specific review.' : 'Required analytes, accepted results, method, or reporting-limit evidence are incomplete.', evidenceReference: completeResidueReport?.reportId ?? reports[0]?.reportId ?? '' })
  }
  if (specification.safetyRequirements.phytosanitaryDocumentationRequired) requirements.push({ id: 'document:phytosanitary', group: 'Mandatory documents', requirement: 'Phytosanitary documentation', requiredCondition: 'Phytosanitary documentation required by this buyer order.', required: true, suggestedResult: 'Insufficient Evidence', suggestionReason: 'Review and cite the applicable document; laboratory results do not substitute for this document.', evidenceReference: '' })
  if (specification.safetyRequirements.otherDocumentation.trim()) requirements.push({ id: 'document:other', group: 'Mandatory documents', requirement: 'Other buyer documentation', requiredCondition: specification.safetyRequirements.otherDocumentation, required: true, suggestedResult: 'Insufficient Evidence', suggestionReason: 'Review and cite the requested document or evidence.', evidenceReference: '' })
  if (order.commercial.additionalInstructions.trim()) requirements.push({ id: 'order:instructions', group: 'Other order requirements', requirement: 'Buyer-specific instructions', requiredCondition: order.commercial.additionalInstructions, required: true, suggestedResult: 'Insufficient Evidence', suggestionReason: 'Record evidence that this lot meets the buyer-specific instruction.', evidenceReference: '' })
  return requirements
}

export function getCurrentRequirementReviews(lot: Lot, order: BuyerOrder, data: LabReviewData) {
  const fingerprint = createReviewFingerprint(lot, order, data)
  const matching = data.requirementReviews.filter((review) => review.lotId === lot.id && review.sourceFingerprint === fingerprint).sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
  const seen = new Set<string>()
  return matching.filter((review) => { if (seen.has(review.requirementId)) return false; seen.add(review.requirementId); return true })
}

export function saveRequirementReviews(data: LabReviewData, lot: Lot, order: BuyerOrder, inputs: ReviewRequirementInput[], reviewer: string): LabReviewData {
  if (!reviewer.trim()) throw new Error('Reviewer name is required.')
  const definitions = getRequirementDefinitions(lot, order, data)
  const fingerprint = createReviewFingerprint(lot, order, data)
  for (const definition of definitions.filter((item) => item.required)) {
    const input = inputs.find((item) => item.requirementId === definition.id)
    if (!input) throw new Error(`Review the required condition: ${definition.requirement}.`)
    if (input.result === 'Pass' && (!input.evidenceReference.trim() || !input.reviewerNote.trim())) throw new Error(`A passing review for ${definition.requirement} requires an evidence reference and reviewer note.`)
    if ((input.result === 'Fail' || input.result === 'Insufficient Evidence') && !input.reviewerNote.trim()) throw new Error(`Add a reviewer note for ${definition.requirement}.`)
  }
  const createdAt = now()
  const reviewIds = data.requirementReviews.map((item) => item.id)
  const reviews = inputs.map((input) => {
    const definition = definitions.find((item) => item.id === input.requirementId)
    if (!definition) throw new Error(`Unknown requirement ${input.requirementId}.`)
    const id = nextId('REQ', reviewIds)
    reviewIds.push(id)
    return { ...input, id, lotId: lot.id, group: definition.group, requirement: definition.requirement, requiredCondition: definition.requiredCondition, required: definition.required, reviewer: reviewer.trim(), reviewedAt: createdAt, sourceFingerprint: fingerprint } satisfies RequirementReview
  })
  return { ...data, requirementReviews: [...reviews, ...data.requirementReviews] }
}

export interface ReleaseEligibility {
  eligible: boolean
  blockers: string[]
  warnings: string[]
  fingerprint: string
  reviews: RequirementReview[]
}

export function getReleaseEligibility(lot: Lot, order: BuyerOrder, data: LabReviewData): ReleaseEligibility {
  const fingerprint = createReviewFingerprint(lot, order, data)
  const blockers: string[] = []
  const warnings: string[] = []
  if (!getSpecificationForLot(lot, order) || lot.buyerSpecificationVersion === null) blockers.push('The exact buyer specification version for this lot is unavailable.')
  if (lot.inspectionStatus !== 'Completed') blockers.push(`Inspection status is ${lot.inspectionStatus}; a completed inspection is required.`)
  const currentReports = activeLotReports(lot, data)
  for (const report of currentReports) {
    const status = getLatestEvidenceReview(data, report.id)?.status ?? 'Pending'
    if (status !== 'Accepted') blockers.push(`Report ${report.reportId} is ${status.toLowerCase()} and has not been accepted.`)
  }
  const reviews = getCurrentRequirementReviews(lot, order, data)
  const definitions = getRequirementDefinitions(lot, order, data).filter((item) => item.required)
  for (const definition of definitions) {
    const review = reviews.find((item) => item.requirementId === definition.id)
    if (!review) blockers.push(`${definition.requirement}: current review is pending.`)
    else if (review.result !== 'Pass') blockers.push(`${definition.requirement}: review result is ${review.result.toLowerCase()}.`)
    else if (!review.evidenceReference.trim() || !review.reviewerNote.trim()) blockers.push(`${definition.requirement}: passing review has no evidence reference or reviewer note.`)
    if (definition.id === 'safety:laboratory-report' && review?.result === 'Pass' && !currentReports.some((report) => reportSafetyCompleteness(report, lot, data, false))) blockers.push('Laboratory report evidence is incomplete; analyte, reported value, unit, method and reporting limit are required for this safety check.')
    if (definition.id === 'safety:residue-testing' && review?.result === 'Pass' && !currentReports.some((report) => reportSafetyCompleteness(report, lot, data, true))) blockers.push('Residue evidence does not cover the sample requested tests with accepted analytes, methods and reporting limits.')
  }
  if (lot.weights.excessKg > 0) warnings.push(`${lot.weights.excessKg} kg excess remains flagged on the lot and is not added to the buyer order.`)
  if (currentReports.some((report) => validateLaboratoryReport(report, lot, lot.samples.find((sample) => sample.id === report.sampleId)).warnings.length > 0)) warnings.push('One or more reports omit methods or reporting limits. Confirm whether these are required by the buyer before deciding.')
  return { eligible: blockers.length === 0, blockers, warnings, fingerprint, reviews }
}

export function getCurrentReleaseStatus(lot: Lot, order: BuyerOrder, data: LabReviewData) {
  const latest = data.releaseHistory.filter((entry) => entry.lotId === lot.id).sort((a, b) => b.decision.decidedAt.localeCompare(a.decision.decidedAt))[0]
  if (!latest) return { status: 'Review Required' as const, latest: undefined, stale: false }
  const currentReviews = getCurrentRequirementReviews(lot, order, data)
  const project = (items: RequirementReview[]) => items.map((item) => [item.requirementId, item.result, item.evidenceReference, item.reviewerNote, item.reviewedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const requirementsChanged = JSON.stringify(project(currentReviews)) !== JSON.stringify(project(latest.requirementReviews))
  const stale = latest.sourceFingerprint !== createReviewFingerprint(lot, order, data) || requirementsChanged
  return { status: stale ? 'Review Required' as const : latest.decision.outcome, latest, stale }
}

export function recordReleaseDecision(data: LabReviewData, lot: Lot, order: BuyerOrder, outcome: ReleaseOutcome, reviewer: string, reason: string): LabReviewData {
  if (!reviewer.trim()) throw new Error('Authorised reviewer name is required.')
  if ((outcome === 'Held' || outcome === 'Rejected') && !reason.trim()) throw new Error(`${outcome} decisions require a reason.`)
  const eligibility = getReleaseEligibility(lot, order, data)
  if (outcome === 'Released' && !eligibility.eligible) throw new Error(`Release is blocked: ${eligibility.blockers.join(' ')}`)
  const decision = { outcome, reviewer: reviewer.trim(), decidedAt: now(), reason: reason.trim() }
  const history: ReleaseReviewHistory = { id: nextId('REL', data.releaseHistory.map((item) => item.id)), lotId: lot.id, decision, buyerOrderId: order.id, buyerSpecificationVersion: lot.buyerSpecificationVersion, sourceFingerprint: eligibility.fingerprint, requirementReviews: eligibility.reviews }
  return { ...data, releaseHistory: [history, ...data.releaseHistory] }
}
