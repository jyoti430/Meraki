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
