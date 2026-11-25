export type RequirementStatus = 'active' | 'draft' | 'fulfilled' | 'cancelled'

export interface RequirementCriterion {
  id: string
  attribute: string
  unit: string
  minimum?: string
  maximum?: string
  required: boolean
  notes: string
}

export interface ProcurementRequirement {
  id: string
  crop: string
  variety: string
  quantityKg: number
  grade: string
  criteria: RequirementCriterion[]
  packaging: string
  destination: string
  requiredBy: string
  notes: string
  status: RequirementStatus
  source: 'synthetic-demo' | 'local-draft'
  updatedAt: string
}

export interface SupplyProjectionExample {
  id: string
  fpoLabel: string
  region: string
  crop: string
  variety: string
  projectedKg: number
  lowKg: number
  highKg: number
  deliveryWeekStart: string
  grade: string
  qualitySummary: string
  evidenceSummary: string
  uncertaintySummary: string
  consentSummary: string
}

export interface FulfilmentStatus {
  stage: string
  availability: 'partially-supported' | 'not-integrated'
  detail: string
}
