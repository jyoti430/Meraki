export type Activity = {
  id: string
  event: string
  reference: string
  time: string
  status: 'Completed' | 'In progress' | 'Pending'
}

export type PendingAction = {
  id: string
  title: string
  detail: string
  age: string
  urgency: 'High' | 'Medium' | 'Low'
  href: string
}

export type SummaryMetric = {
  label: string
  value: string
  note: string
  icon: 'orders' | 'supply' | 'inspection' | 'hold' | 'shipment' | 'settlement'
}

export type BuyerOrderStatus = 'Draft' | 'Active' | 'Completed' | 'Cancelled'
export type BuyerOrderType = 'Indicative' | 'Confirmed'

export interface BuyerDetails {
  name: string
  contactPerson: string
  email: string
  phone: string
  destinationCountry: string
  destinationCityPort: string
}

export interface ProductDetails {
  crop: string
  variety: string
  requiredQuantityKg: number | ''
  orderType: BuyerOrderType
  deliveryStartDate: string
  deliveryEndDate: string
  preferredGrade: string
}

export interface QualityCriterion {
  id: string
  attribute: string
  unit: string
  minimum: string
  maximum: string
  required: boolean
  notes: string
}

export interface SafetyRequirements {
  laboratoryReportRequired: boolean
  residueTestingRequired: boolean
  phytosanitaryDocumentationRequired: boolean
  otherDocumentation: string
}

export interface OrderSpecification {
  criteria: QualityCriterion[]
  safetyRequirements: SafetyRequirements
}

export interface SpecificationVersion {
  version: number
  changedAt: string
  changedBy: string
  specification: OrderSpecification
}

export interface CommercialDetails {
  packagingType: string
  packagingInstructions: string
  agreedPricePerKg: number | ''
  currency: string
  paymentTerms: string
  additionalInstructions: string
}

export interface BuyerOrder {
  id: string
  buyer: BuyerDetails
  product: ProductDetails
  specification: OrderSpecification
  specificationHistory: SpecificationVersion[]
  specificationVersion: number
  commercial: CommercialDetails
  status: BuyerOrderStatus
  createdAt: string
  updatedAt: string
}

export type MembershipStatus = 'Active' | 'Inactive'
export type ParticipationStatus = 'not-recorded' | 'opted-in' | 'opted-out' | 'unavailable'
export type ParticipationScope = 'supply-programme' | 'buyer-order'

export interface FarmerConsent {
  consented: boolean
  status: ParticipationStatus
  recordedAt: string | null
  reason: string
  notes: string
}

export interface Farmer {
  id: string
  name: string
  phone: string
  village: string
  district: string
  state: string
  preferredLanguage: string
  membershipStatus: MembershipStatus
  consent: FarmerConsent
  notes: string
  createdAt: string
  updatedAt: string
}

export interface SoilReport {
  details: string
  reportDate: string
}

export interface Plot {
  id: string
  farmerId: string
  name: string
  villageLocation: string
  area: number
  areaUnit: 'acre' | 'hectare'
  waterAvailability: 'Available' | 'Limited' | 'None' | 'Unknown'
  irrigationType: string
  soilType: string
  soilReport: SoilReport | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type CropCycleStatus = 'Planned' | 'Growing' | 'Harvest-ready' | 'Harvested' | 'Cancelled'

export interface CropCycle {
  id: string
  plotId: string
  crop: string
  variety: string
  plantingDate: string
  expectedHarvestStartDate: string
  expectedHarvestEndDate: string
  estimatedProductionKg: number
  status: CropCycleStatus
  previousCrop: string
  notes: string
  waterConstraints: string
  capitalInputConstraints: string
  otherLimitations: string
  createdAt: string
  updatedAt: string
}

export interface ParticipationRecord {
  id: string
  farmerId: string
  scope: ParticipationScope
  scopeId: string | null
  status: Exclude<ParticipationStatus, 'not-recorded'>
  recordedAt: string
  reason: string
  notes: string
}

export type SupplyPlanStatus = 'Draft' | 'Previewed' | 'Confirmed' | 'Needs Review' | 'Cancelled'

export interface AllocationExclusionReason {
  code: string
  message: string
}

export interface AllocationWarning {
  code: string
  message: string
  severity: 'info' | 'warning'
  candidateId?: string
}

export interface SupplyCandidate {
  candidateId: string
  farmerId: string | null
  plotId: string
  cropCycleId: string
  crop: string
  variety: string
  cycleStatus: CropCycleStatus
  harvestStartDate: string
  harvestEndDate: string
  estimatedProductionKg: number
  previouslyReservedKg: number
  remainingEstimateKg: number
  consentStatus: ParticipationStatus
  eligible: boolean
  exclusionReasons: AllocationExclusionReason[]
  warnings: AllocationWarning[]
  proposedAllocationKg: number
}

export interface Allocation {
  candidateId: string
  farmerId: string
  plotId: string
  cropCycleId: string
  proposedQuantityKg: number
  adjustedQuantityKg: number
  included: boolean
  overrideReason: string
}

export interface ManualOverride {
  candidateId: string
  originalQuantityKg: number
  adjustedQuantityKg: number
  reason: string
  changedAt: string
  changedBy: string
}

export interface ReservationHistoryEntry {
  status: 'active' | 'released'
  changedAt: string
  changedBy: string
  reason: string
}

export interface Reservation {
  id: string
  planId: string
  orderId: string
  farmerId: string
  plotId: string
  cropCycleId: string
  quantityKg: number
  status: 'active' | 'released'
  createdAt: string
  releasedAt: string | null
  releaseReason: string
  history: ReservationHistoryEntry[]
}

export interface SupplyPlan {
  id: string
  orderId: string
  buyerSpecificationVersion?: number
  programmeId: string
  status: SupplyPlanStatus
  orderQuantityKg: number
  sourceFingerprint: string
  candidates: SupplyCandidate[]
  allocations: Allocation[]
  overrides: ManualOverride[]
  warnings: AllocationWarning[]
  assumptions: string[]
  createdAt: string
  updatedAt: string
  createdBy: string
  confirmedAt: string | null
  confirmedBy: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string
}

export type InspectionStatus = 'Unassessed' | 'In Progress' | 'Completed' | 'Needs Review'
export type SafetyEvidenceStatus = 'Unknown' | 'Pending' | 'Under Review' | 'Reviewed' | 'Hold'
export type LotStatus = 'Received' | 'Inspecting' | 'Awaiting Evidence' | 'Ready for Review' | 'On Hold'
export type SampleStatus = 'Not submitted' | 'Submitted' | 'Pending' | 'Result received' | 'Under review' | 'Reviewed' | 'Hold'

export interface WeightRecord {
  plannedQuantityKg: number
  grossWeightKg: number
  tareWeightKg: number
  netReceivedWeightKg: number
  shortageKg: number
  excessKg: number
  reconciliation: 'matched' | 'shortage' | 'excess'
  recordedAt: string
  recordedBy: string
}

export interface EvidenceAttachment {
  id: string
  name: string
  mediaType: string
  dataUrl: string
  addedAt: string
  addedBy: string
}

export interface Measurement {
  id: string
  attribute: string
  value: string
  unit: string
  observation: string
  criterionId: string | null
}

export interface DefectObservation {
  id: string
  description: string
  observed: boolean
  notes: string
}

export interface GradeAllocation {
  id: string
  grade: string
  quantityKg: number
  observations: string
  downgradeReason: string
}

export interface Inspection {
  id: string
  lotId: string
  inspectedAt: string
  inspector: string
  samplingMethod: string
  sampleQuantity: number
  sampleUnit: string
  observations: string
  defects: DefectObservation[]
  measurements: Measurement[]
  grades: GradeAllocation[]
  sampleQuantityKg: number
  lossQuantityKg: number
  status: InspectionStatus
  evidence: EvidenceAttachment[]
  buyerSpecificationVersion: number | null
  historyRecordedAt: string
}

export interface Sublot {
  id: string
  parentLotId: string
  grade: string
  quantityKg: number
  observations: string
  inspectionId: string | null
  safetyEvidenceStatus: SafetyEvidenceStatus
  status: LotStatus
  evidence: EvidenceAttachment[]
  createdAt: string
}

export interface Sample {
  id: string
  lotId: string
  sublotId: string | null
  collectedAt: string
  quantity: number
  unit: string
  samplingMethod: string
  collector: string
  laboratoryName: string
  testsRequested: string[]
  status: SampleStatus
  reportReference: string
  evidence: EvidenceAttachment[]
}

export interface LotEvent {
  id: string
  lotId: string
  type: string
  description: string
  occurredAt: string
  actor: string
  data?: Record<string, unknown>
}

export interface Lot {
  id: string
  receiptToken: string
  farmerId: string
  plotId: string
  cropCycleId: string
  supplyPlanId: string
  buyerOrderId: string
  buyerSpecificationVersion: number | null
  crop: string
  variety: string
  harvestDate: string
  arrivalAt: string
  weights: WeightRecord
  reservationReconciledAt: string | null
  reservationReconciledBy: string | null
  operator: string
  initialObservations: string
  inspectionStatus: InspectionStatus
  safetyEvidenceStatus: SafetyEvidenceStatus
  status: LotStatus
  inspections: Inspection[]
  sublots: Sublot[]
  samples: Sample[]
  events: LotEvent[]
  createdAt: string
  updatedAt: string
}

export type EvidenceReviewStatus = 'Pending' | 'Under Review' | 'Accepted' | 'Rejected'
export type RequirementReviewResult = 'Pending' | 'Pass' | 'Fail' | 'Insufficient Evidence'
export type RequirementGroup = 'Commercial / quality' | 'Safety and laboratory' | 'Mandatory documents' | 'Other order requirements'
export type ReleaseOutcome = 'Released' | 'Held' | 'Rejected'

export interface LabTestResult {
  id: string
  analyte: string
  testingMethod: string
  result: string
  unit: string
  reportingLimit: string
}

export interface LaboratoryReport {
  id: string
  reportId: string
  lotId: string
  supersedesReportId: string | null
  sampleId: string
  sampleCollectedAt: string
  buyerOrderId: string
  buyerSpecificationVersion: number | null
  issuingLaboratory: string
  reportDate: string
  results: LabTestResult[]
  documentReference: string
  attachment: EvidenceAttachment | null
  reviewerNotes: string
  createdAt: string
  createdBy: string
}

export interface EvidenceReview {
  id: string
  reportId: string
  lotId: string
  status: EvidenceReviewStatus
  reason: string
  reviewer: string
  reviewedAt: string
}

export interface RequirementReview {
  id: string
  lotId: string
  requirementId: string
  group: RequirementGroup
  requirement: string
  requiredCondition: string
  required: boolean
  result: RequirementReviewResult
  evidenceReference: string
  reviewerNote: string
  reviewer: string
  reviewedAt: string
  sourceFingerprint: string
}

export interface ReleaseDecision {
  outcome: ReleaseOutcome
  reviewer: string
  decidedAt: string
  reason: string
}

export interface ReleaseReviewHistory {
  id: string
  lotId: string
  decision: ReleaseDecision
  buyerOrderId: string
  buyerSpecificationVersion: number | null
  sourceFingerprint: string
  requirementReviews: RequirementReview[]
}
