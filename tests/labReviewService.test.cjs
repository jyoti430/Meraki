const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../.test-build/services/LabReviewService.js')

function fixture({ residue = true } = {}) {
  const sample = {
    id: 'SAMPLE-0001', lotId: 'LOT-0001', sublotId: null, collectedAt: '2026-11-15T08:00:00.000Z',
    quantity: 10, unit: 'g', samplingMethod: 'Composite', collector: 'Demo Collector', laboratoryName: '',
    testsRequested: ['Pesticide X'], status: 'Submitted', reportReference: '', evidence: [],
  }
  const criterionV1 = { id: 'crit-v1', attribute: 'Fruit weight', unit: 'g', minimum: '220', maximum: '350', required: true, notes: '' }
  const criterionV2 = { ...criterionV1, minimum: '500', maximum: '700' }
  const specV1 = { criteria: [criterionV1], safetyRequirements: { laboratoryReportRequired: true, residueTestingRequired: residue, phytosanitaryDocumentationRequired: false, otherDocumentation: '' } }
  const specV2 = { criteria: [criterionV2], safetyRequirements: { ...specV1.safetyRequirements } }
  const lot = {
    id: 'LOT-0001', receiptToken: 'TOKEN-1', farmerId: 'FPO-0001', plotId: 'PLOT-0001', cropCycleId: 'CYCLE-0001',
    supplyPlanId: 'PLAN-0001', buyerOrderId: 'ORDER-0001', buyerSpecificationVersion: 1, crop: 'Mango', variety: 'Alphonso',
    harvestDate: '2026-11-14', arrivalAt: '2026-11-15T08:30:00.000Z',
    weights: { plannedQuantityKg: 100, grossWeightKg: 105, tareWeightKg: 5, netReceivedWeightKg: 100, shortageKg: 0, excessKg: 0, reconciliation: 'matched', recordedAt: '', recordedBy: 'Operator' },
    reservationReconciledAt: null, reservationReconciledBy: null, operator: 'Operator', initialObservations: '',
    inspectionStatus: 'Completed', safetyEvidenceStatus: 'Pending', status: 'Ready for Review',
    inspections: [{ id: 'INSP-0001', lotId: 'LOT-0001', inspectedAt: '2026-11-15T09:00:00.000Z', inspector: 'Inspector', samplingMethod: 'Random sample', sampleQuantity: 10, sampleUnit: 'fruit', observations: '', defects: [], measurements: [{ id: 'M-1', attribute: 'Fruit weight', value: '250', unit: 'g', observation: '', criterionId: 'crit-v1' }], grades: [], sampleQuantityKg: 0, lossQuantityKg: 0, status: 'Completed', evidence: [], buyerSpecificationVersion: 1, historyRecordedAt: '2026-11-15T09:00:00.000Z' }],
    sublots: [], samples: [sample], events: [], createdAt: '', updatedAt: '',
  }
  const order = {
    id: 'ORDER-0001', buyer: { name: 'Synthetic Buyer' },
    product: { crop: 'Mango', variety: 'Alphonso', requiredQuantityKg: 100, orderType: 'Confirmed', deliveryStartDate: '', deliveryEndDate: '', preferredGrade: '' },
    specification: specV2,
    specificationHistory: [{ version: 1, changedAt: '', changedBy: 'Manager', specification: specV1 }, { version: 2, changedAt: '', changedBy: 'Manager', specification: specV2 }],
    specificationVersion: 2, commercial: { packagingType: '', packagingInstructions: '', agreedPricePerKg: '', currency: 'INR', paymentTerms: '', additionalInstructions: '' },
    status: 'Active', createdAt: '', updatedAt: '',
  }
  return { lot, order, sample }
}

const testResult = (overrides = {}) => ({ id: 'TEST-0001', analyte: 'Pesticide X', testingMethod: 'LC-MS/MS', result: '0.01', unit: 'mg/kg', reportingLimit: '0.001 mg/kg', ...overrides })
const reportInput = (reportId = 'REPORT-001', overrides = {}) => ({
  reportId, lotId: 'LOT-0001', sampleId: 'SAMPLE-0001', supersedesReportId: null,
  issuingLaboratory: 'Synthetic Test Laboratory', reportDate: '2026-11-15', results: [testResult()],
  documentReference: `DOC-${reportId}`, attachment: null, reviewerNotes: '', createdBy: 'Reviewer', ...overrides,
})

function addAcceptedReport(data, lot, id = 'REPORT-001', inputOverrides = {}) {
  const created = service.createLaboratoryReport(data, lot, reportInput(id, inputOverrides))
  const reviewed = service.reviewLaboratoryEvidence(created.data, lot, created.report.id, 'Accepted', 'Reviewer', 'Source report fields reviewed.')
  return { data: reviewed, report: created.report }
}

function requirementInputs(lot, order, data, reportId = 'REPORT-001', overrides = {}) {
  return service.getRequirementDefinitions(lot, order, data).map((definition) => ({
    requirementId: definition.id, group: definition.group, requirement: definition.requirement,
    requiredCondition: definition.requiredCondition, required: definition.required,
    result: overrides[definition.id] ?? definition.suggestedResult,
    evidenceReference: reportId,
    reviewerNote: 'Reviewed against the saved buyer requirement and cited evidence.',
  }))
}

function makeReleaseReady(lot, order, reportId = 'REPORT-001') {
  let data = service.emptyLabReviewData
  data = addAcceptedReport(data, lot, reportId).data
  const inputs = requirementInputs(lot, order, data, reportId, { 'safety:residue-testing': 'Pass' })
  data = service.saveRequirementReviews(data, lot, order, inputs, 'Reviewer')
  return data
}

test('complete linked evidence can support a configured requirement', () => {
  const { lot, order } = fixture()
  const { data } = addAcceptedReport(service.emptyLabReviewData, lot)
  const definitions = service.getRequirementDefinitions(lot, order, data)
  assert.equal(definitions.find((item) => item.id === 'safety:laboratory-report').suggestedResult, 'Pass')
})

test('missing mandatory analyte cannot be accepted or satisfy the residue request', () => {
  const { lot, order } = fixture()
  const created = service.createLaboratoryReport(service.emptyLabReviewData, lot, reportInput('REPORT-EMPTY', { results: [] }))
  assert.throws(() => service.reviewLaboratoryEvidence(created.data, lot, created.report.id, 'Accepted', 'Reviewer', 'Checked'))
  assert.equal(service.validateLaboratoryReport(created.report, lot, lot.samples[0]).valid, false)
})

test('missing reporting limit keeps mandatory safety evidence insufficient', () => {
  const { lot, order } = fixture()
  const { data } = addAcceptedReport(service.emptyLabReviewData, lot, 'REPORT-NOLIMIT', { results: [testResult({ reportingLimit: '' })] })
  assert.equal(service.getRequirementDefinitions(lot, order, data).find((item) => item.id === 'safety:laboratory-report').suggestedResult, 'Insufficient Evidence')
})

test('pending evidence blocks release', () => {
  const { lot, order } = fixture()
  const created = service.createLaboratoryReport(service.emptyLabReviewData, lot, reportInput())
  assert.ok(service.getReleaseEligibility(lot, order, created.data).blockers.some((item) => item.includes('pending')))
})

test('rejected evidence blocks release and retains its reason', () => {
  const { lot, order } = fixture()
  const created = service.createLaboratoryReport(service.emptyLabReviewData, lot, reportInput())
  const rejected = service.reviewLaboratoryEvidence(created.data, lot, created.report.id, 'Rejected', 'Reviewer', 'Report does not match source document.')
  assert.ok(service.getReleaseEligibility(lot, order, rejected).blockers.some((item) => item.includes('rejected')))
  assert.equal(rejected.evidenceReviews[0].reason, 'Report does not match source document.')
})

test('failed buyer requirement blocks release', () => {
  const { lot, order } = fixture()
  const { data } = addAcceptedReport(service.emptyLabReviewData, lot)
  const inputs = requirementInputs(lot, order, data, 'REPORT-001', { 'quality:crit-v1': 'Fail' })
  const reviewed = service.saveRequirementReviews(data, lot, order, inputs, 'Reviewer')
  assert.ok(service.getReleaseEligibility(lot, order, reviewed).blockers.some((item) => item.includes('fail')))
})

test('commercial quality may pass while laboratory safety remains incomplete', () => {
  const { lot, order } = fixture()
  const requirements = service.getRequirementDefinitions(lot, order, service.emptyLabReviewData)
  assert.equal(requirements.find((item) => item.id === 'quality:crit-v1').suggestedResult, 'Pass')
  assert.notEqual(requirements.find((item) => item.id === 'safety:laboratory-report').suggestedResult, 'Pass')
})

test('attempted release with incomplete evidence is rejected', () => {
  const { lot, order } = fixture()
  assert.throws(() => service.recordReleaseDecision(service.emptyLabReviewData, lot, order, 'Released', 'Reviewer', ''))
})

test('complete checklist requires an explicit authorised release decision', () => {
  const { lot, order } = fixture()
  const ready = makeReleaseReady(lot, order)
  assert.equal(service.getReleaseEligibility(lot, order, ready).eligible, true)
  const released = service.recordReleaseDecision(ready, lot, order, 'Released', 'Authorised Reviewer', 'Approved against buyer conditions.')
  assert.equal(released.releaseHistory[0].decision.outcome, 'Released')
  assert.equal(released.releaseHistory[0].decision.reviewer, 'Authorised Reviewer')
})

test('Hold and rejection decisions require reasons', () => {
  const { lot, order } = fixture()
  assert.throws(() => service.recordReleaseDecision(service.emptyLabReviewData, lot, order, 'Held', 'Reviewer', ''))
  assert.throws(() => service.recordReleaseDecision(service.emptyLabReviewData, lot, order, 'Rejected', 'Reviewer', ''))
})

test('multiple reports can be retained against one lot', () => {
  const { lot } = fixture()
  let data = service.createLaboratoryReport(service.emptyLabReviewData, lot, reportInput('REPORT-001')).data
  data = service.createLaboratoryReport(data, lot, reportInput('REPORT-002')).data
  assert.equal(data.reports.filter((item) => item.lotId === lot.id).length, 2)
})

test('new report after a decision makes the previous release review stale', () => {
  const { lot, order } = fixture()
  const ready = makeReleaseReady(lot, order)
  const released = service.recordReleaseDecision(ready, lot, order, 'Released', 'Reviewer', 'Approved.')
  const updated = service.createLaboratoryReport(released, lot, reportInput('REPORT-002')).data
  assert.equal(service.getCurrentReleaseStatus(lot, order, updated).status, 'Review Required')
  assert.equal(service.getCurrentReleaseStatus(lot, order, updated).stale, true)
})

test('new requirement review also requires a new release decision', () => {
  const { lot, order } = fixture()
  const ready = makeReleaseReady(lot, order)
  const released = service.recordReleaseDecision(ready, lot, order, 'Released', 'Reviewer', 'Approved.')
  const changed = requirementInputs(lot, order, released, 'REPORT-001').map((item) => ({ ...item, reviewerNote: 'Re-reviewed by a second reviewer.' }))
  const rereviewed = service.saveRequirementReviews(released, lot, order, changed, 'Reviewer Two')
  assert.equal(service.getCurrentReleaseStatus(lot, order, rereviewed).status, 'Review Required')
})

test('replacement report supersedes rejected evidence without deleting its history', () => {
  const { lot } = fixture()
  const original = service.createLaboratoryReport(service.emptyLabReviewData, lot, reportInput('REPORT-ORIGINAL'))
  const rejected = service.reviewLaboratoryEvidence(original.data, lot, original.report.id, 'Rejected', 'Reviewer', 'Original copy is illegible.')
  const correction = service.createLaboratoryReport(rejected, lot, reportInput('REPORT-CORRECTION', { supersedesReportId: original.report.id }))
  const accepted = service.reviewLaboratoryEvidence(correction.data, lot, correction.report.id, 'Accepted', 'Reviewer', 'Replacement reviewed.')
  assert.equal(accepted.reports.length, 2)
  assert.equal(accepted.evidenceReviews.some((item) => item.reportId === original.report.id && item.status === 'Rejected'), true)
  assert.equal(service.getLabEvidenceStatus(lot, accepted), 'Reviewed')
})

test('checklist reads the exact specification version linked to the lot', () => {
  const { lot, order } = fixture()
  const definitions = service.getRequirementDefinitions(lot, order, service.emptyLabReviewData)
  assert.equal(definitions.find((item) => item.id === 'quality:crit-v1').requiredCondition, '220 to 350 g')
})

test('localStorage round trip persists reports, reviews and decisions', () => {
  const { lot, order } = fixture()
  const data = service.recordReleaseDecision(makeReleaseReady(lot, order), lot, order, 'Released', 'Reviewer', 'Approved.')
  const storage = new Map()
  global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
  service.persistLabReviewData(data)
  const loaded = service.loadLabReviewData()
  assert.equal(loaded.reports[0].reportId, 'REPORT-001')
  assert.equal(loaded.releaseHistory[0].decision.outcome, 'Released')
})
