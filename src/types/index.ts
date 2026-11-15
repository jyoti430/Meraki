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

export type SoilMeasurementSource = 'Soil sensor' | 'Lab test' | 'Field test kit'

export interface SoilMeasurement {
  source: SoilMeasurementSource
  ph: number | null
  moisturePct: number | null
  measuredAt: string
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
  /** Optional measured values (field kit, lab or a future soil sensor). Never required for planning. */
  soilMeasurement?: SoilMeasurement | null
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
