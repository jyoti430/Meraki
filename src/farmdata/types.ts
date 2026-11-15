/**
 * Part 1 — farm data and crop intelligence contracts.
 *
 * These types deliberately separate what was measured from what was reported, estimated,
 * mapped, planned or withheld by the farmer. Nothing here treats a missing observation as zero.
 */

export const FARM_DATA_CONTRACT_VERSION = 'farm-data-2026-11-16.1'
export const SOIL_IMPORT_TEMPLATE_VERSION = 'soil-csv-2026-11-16.1'
export const WEATHER_IMPORT_TEMPLATE_VERSION = 'weather-csv-2026-11-16.1'
export const AGRONOMY_RULE_VERSION = 'agronomy-rules-2026-11-16.1'
export const PROJECTION_RULE_VERSION = 'weekly-projection-2026-11-16.1'

export type EvidenceStatus = 'verified' | 'reported' | 'estimated' | 'unknown' | 'stale' | 'failed'
export type EvidenceConfidence = 'high' | 'medium' | 'low' | 'none'

export type ProvenanceKind =
  | 'laboratory'
  | 'field-test-kit'
  | 'soil-sensor'
  | 'mapped-estimate'
  | 'government-adapter'
  | 'fpo-record'
  | 'farmer-report'
  | 'adviser'
  | 'synthetic-fixture'
  | 'manual-import'

export interface Provenance {
  /** Stable reference for the source, e.g. a lab report or adapter id. */
  sourceId: string
  kind: ProvenanceKind
  label: string
  organisation: string
  /** Date the underlying observation was captured (ISO date or timestamp). */
  capturedAt: string
  /** When Meraki received or recorded it. */
  receivedAt: string
  method: string
  reference: string
  synthetic: boolean
  note: string
}

export interface EvidenceRef {
  id: string
  label: string
  status: EvidenceStatus
  confidence: EvidenceConfidence
  asOf: string
  validUntil: string | null
  provenance: Provenance
  caveats: string[]
}

// ---------------------------------------------------------------------------
// Soil
// ---------------------------------------------------------------------------

export type SoilSampleKind = 'laboratory' | 'field-test-kit' | 'soil-sensor' | 'mapped-estimate'

export type SoilAnalyteCode =
  | 'ph'
  | 'ec'
  | 'organic_carbon'
  | 'available_n'
  | 'total_n'
  | 'available_p'
  | 'total_p'
  | 'available_k'
  | 'total_k'
  | 'available_s'
  | 'zinc'
  | 'iron'
  | 'copper'
  | 'manganese'
  | 'boron'

export interface SoilAnalyteDefinition {
  code: SoilAnalyteCode
  label: string
  basis: 'available' | 'total' | 'measured' | 'physical'
  canonicalUnit: string
  allowedUnits: string[]
  /** Exact, documented conversions only. Unknown units are rejected, never guessed. */
  toCanonical: Record<string, (value: number) => number>
}

export interface SoilAnalyte {
  code: SoilAnalyteCode
  label: string
  /** The value exactly as supplied. */
  rawValue: string
  /** The unit exactly as supplied. */
  rawUnit: string
  /** Normalised value only when the unit is known and an exact conversion exists. */
  value: number | null
  unit: string
  basis: SoilAnalyteDefinition['basis']
  method: string
  rawRow: string
}

export interface SoilSample {
  id: string
  plotId: string
  sampledAt: string
  receivedAt: string
  depthFromCm: number
  depthToCm: number
  kind: SoilSampleKind
  lab: string
  method: string
  provenance: Provenance
  analytes: SoilAnalyte[]
  /** Rows preserved exactly as imported for audit; no silent cleanup. */
  sourceRows: string[]
}

export interface SoilImportRejection {
  rowNumber: number
  raw: string
  errors: string[]
}

export interface SoilImportResult {
  templateVersion: string
  accepted: SoilSample[]
  rejected: SoilImportRejection[]
  warnings: string[]
  rowsRead: number
}

export interface SoilEvidence {
  status: EvidenceStatus
  confidence: EvidenceConfidence
  refs: EvidenceRef[]
  measured: SoilSample | null
  estimates: SoilSample[]
  caveats: string[]
  ph: number | null
  availableN: number | null
  availableP: number | null
  availableK: number | null
  organicCarbon: number | null
}

// ---------------------------------------------------------------------------
// Weather and water adapters
// ---------------------------------------------------------------------------

export type WeatherVariable = 'temp_min_c' | 'temp_max_c' | 'rainfall_mm' | 'humidity_pct' | 'solar_mj_m2' | 'et0_mm'
export type WeatherRecordKind = 'observed' | 'forecast'

export interface WeatherRecord {
  id: string
  adapterId: string
  plotId: string | null
  date: string
  variable: WeatherVariable
  value: number
  unit: string
  kind: WeatherRecordKind
  /** Forecast issue time is mandatory for forecasts. */
  issuedAt: string | null
  horizonDays: number | null
  provenance: Provenance
  caveats: string[]
}

export type AdapterStatus = 'ok' | 'failed' | 'not-configured'

export interface WeatherAdapterRun {
  id: string
  adapterId: string
  adapterLabel: string
  status: AdapterStatus
  startedAt: string
  finishedAt: string
  records: WeatherRecord[]
  issuedAt: string | null
  horizonDays: number | null
  error: string
  caveats: string[]
  synthetic: boolean
}

export interface WeatherAdapter {
  id: string
  label: string
  kind: 'fixture' | 'csv' | 'http'
  synthetic: boolean
  fetch(input: { plotId: string | null; decisionDate: string; csv?: string }): WeatherAdapterRun
}

export interface WeatherImportResult {
  templateVersion: string
  records: WeatherRecord[]
  errors: string[]
  warnings: string[]
  rowsRead: number
}

export type WaterSourceKind = 'borewell' | 'open-well' | 'canal' | 'farm-pond' | 'rainfed' | 'shared-well' | 'other'
export type WaterRights = 'documented' | 'reported' | 'none' | 'unknown'
export type WaterReliability = 'assured' | 'seasonal' | 'uncertain' | 'none'

export interface FarmWaterAccess {
  id: string
  plotId: string
  source: WaterSourceKind
  rights: WaterRights
  reliability: WaterReliability
  pumpDischargeLps: number | null
  pumpingHoursPerDay: number | null
  storageM3: number | null
  sharedAllocationPct: number | null
  irrigationMethod: string
  measuredAt: string
  provenance: Provenance
  note: string
}

export interface RegionalWaterObservation {
  id: string
  block: string
  observationWellId: string
  observationDate: string
  depthBelowGroundM: number
  trend: 'rising' | 'stable' | 'falling' | 'unknown'
  provenance: Provenance
  caveats: string[]
}

export type WaterAssessmentStatus = 'sufficient' | 'shortfall' | 'unknown' | 'none'

export interface WaterAssessment {
  status: WaterAssessmentStatus
  availableSeasonM3: number | null
  demandSeasonM3: number | null
  coveragePct: number | null
  source: WaterSourceKind | null
  rights: WaterRights
  reliability: WaterReliability
  /** Regional observation-well data is context, never proof of farm supply. */
  regionalObservationUsed: false
  assumptions: string[]
  caveats: string[]
  evidence: EvidenceRef | null
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export type ConsentStatus = 'opted-in' | 'opted-out' | 'not-recorded' | 'unavailable'

export interface ConsentSnapshot {
  status: ConsentStatus
  recordedAt: string | null
  note: string
}

// ---------------------------------------------------------------------------
// Seed, inputs and cultivation
// ---------------------------------------------------------------------------

export type CultivationEventKind =
  | 'seed-intended'
  | 'seed-purchased'
  | 'seed-planted'
  | 'fertiliser-planned'
  | 'fertiliser-applied'
  | 'pesticide-planned'
  | 'pesticide-applied'
  | 'irrigation-planned'
  | 'irrigation-applied'
  | 'scouting'
  | 'establishment'
  | 'harvest'

export type CultivationStatus = 'planned' | 'actual'
export type InputCategory = 'seed' | 'fertiliser' | 'pesticide' | 'irrigation' | 'other'

export interface SupplyImpact {
  effectiveFrom: string
  yieldAdjustmentPct: number
  note: string
}

export interface CultivationEvent {
  id: string
  plotId: string
  cropCycleId: string | null
  crop: string
  kind: CultivationEventKind
  status: CultivationStatus
  /** Date the event happened. Required for an actual event. */
  occurredOn: string | null
  /** Date the event is planned for. Required for a planned event. */
  plannedFor: string | null
  product: string
  activeIngredient: string
  quantity: number | null
  unit: string
  nutrientBasis: 'product' | 'nutrient' | 'unknown'
  areaAcres: number | null
  method: string
  stage: string
  note: string
  recordedAt: string
  provenance: Provenance
  evidence: EvidenceRef
  supplyImpact: SupplyImpact | null
}

export interface CultivationValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface CultivationSummary {
  planned: CultivationEvent[]
  actual: CultivationEvent[]
  missing: { category: InputCategory; label: string; status: 'unknown'; caveat: string }[]
  latestActualAt: string | null
  caveats: string[]
  reviewFlags: string[]
}

// ---------------------------------------------------------------------------
// Planting scenarios and weekly projections
// ---------------------------------------------------------------------------

export interface PlantingScenario {
  id: string
  name: string
  plotId: string
  farmerId: string
  cropId: string
  cropName: string
  variety: string
  grade: string
  areaAcres: number
  plantingDate: string
  harvestStart: string
  harvestEnd: string
  decisionDate: string
  gradeEligibleFraction: number
  committedShareFraction: number
  /** Proportion still available to the FPO after retention; 1 = no retention deduction. */
  retentionFactor: number
  logisticsCapacityKgPerWeek: number | null
  /** Optional reviewed yield (kg/acre). When absent the crop reference range is used and labelled. */
  yieldOverrideKgPerAcre: number | null
  yieldOverrideNote: string
  consent: ConsentSnapshot
  evidence: EvidenceSummary
  assumptions: string[]
  cropReferenceVersion: string
  createdAt: string
  updatedAt: string
}

export interface EvidenceSummary {
  status: EvidenceStatus
  confidence: EvidenceConfidence
  refs: EvidenceRef[]
  caveats: string[]
}

export type ProjectionTrigger = 'initial' | 'scenario-change' | 'cultivation-observation' | 'consent-update' | 'evidence-update'

export interface WeeklySupplyRow {
  weekStart: string
  weekEnd: string
  grossKg: number
  gradeLossKg: number
  marketableKg: number
  committedShareKg: number
  retainedKg: number
  /** Marketable × committed share × retention availability. */
  plannedAllocatableKg: number
  /** Zero when farmer consent does not permit a commitment. */
  allocatableKg: number
  consentBlockedKg: number
  capacityKg: number | null
  constrainedKg: number
  capacityShortfallKg: number
  lowKg: number
  highKg: number
  evidenceStatus: EvidenceStatus
  caveats: string[]
}

export interface WeeklyProjectionTotals {
  grossKg: number
  gradeLossKg: number
  marketableKg: number
  committedShareKg: number
  retainedKg: number
  plannedAllocatableKg: number
  allocatableKg: number
  consentBlockedKg: number
  constrainedKg: number
  capacityShortfallKg: number
  lowKg: number
  highKg: number
}

export interface WeeklyProjection {
  scenarioId: string
  cropName: string
  variety: string
  grade: string
  plotId: string
  farmerId: string
  location: string
  unit: 'kg'
  weeks: WeeklySupplyRow[]
  totals: WeeklyProjectionTotals
  evidence: EvidenceSummary
  consent: ConsentSnapshot
  uncertainty: {
    level: 'low' | 'medium' | 'high'
    basis: string
    caveats: string[]
  }
  assumptions: string[]
  ruleVersion: string
}

export interface ProjectionRevision {
  id: string
  observationKind: string
  observedOn: string
  effectiveFrom: string
  yieldAdjustmentPct: number
  note: string
  cultivationEventId: string | null
}

export interface ProjectionVersion {
  id: string
  scenarioId: string
  version: number
  createdAt: string
  createdBy: string
  trigger: ProjectionTrigger
  reason: string
  projection: WeeklyProjection
  evidence: EvidenceSummary
  consent: ConsentSnapshot
  supersedesVersionId: string | null
  revision: ProjectionRevision | null
}

export interface FarmIntelligenceState {
  contractVersion: string
  soilSamples: SoilSample[]
  soilImports: { id: string; importedAt: string; result: SoilImportResult }[]
  weatherRuns: WeatherAdapterRun[]
  regionalWater: RegionalWaterObservation[]
  waterAccess: FarmWaterAccess[]
  cultivation: CultivationEvent[]
  scenarios: PlantingScenario[]
  projectionVersions: ProjectionVersion[]
}
