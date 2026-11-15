import type {
  CultivationEvent, FarmIntelligenceState, FarmWaterAccess, PlantingScenario, Provenance, RegionalWaterObservation,
  SoilAnalyte, SoilSample, WeeklyProjection, ProjectionVersion,
} from '../farmdata/types'
import { FARM_DATA_CONTRACT_VERSION, PROJECTION_RULE_VERSION } from '../farmdata/types'
import { assessWaterAccess } from '../farmdata/water'
import { resolveSoilEvidence } from '../farmdata/soil'
import { buildScenarioEvidence } from '../farmdata/evidence'
import { buildWeeklyProjection } from '../farmdata/projections'
import { createFixtureWeatherAdapter } from '../farmdata/weather'
import { crops } from './crops'

export const DEMO_FARM_DATA_DATE = '2026-11-16'
const CROP_REFERENCE_VERSION = 'crop-reference-2026-11-16.1'

const timestamp = (date: string) => `${date}T08:00:00.000Z`
const provenance = (kind: Provenance['kind'], sourceId: string, label: string, organisation: string, date: string, synthetic: boolean, method = '', note = ''): Provenance => ({
  sourceId, kind, label, organisation, capturedAt: date, receivedAt: timestamp(date), method, reference: sourceId, synthetic, note,
})

const analyte = (code: SoilAnalyte['code'], label: string, value: number, unit: string, basis: SoilAnalyte['basis'], rawUnit = unit): SoilAnalyte => ({
  code, label, rawValue: String(value), rawUnit, value, unit, basis, method: 'Demo method', rawRow: `${code},${value},${rawUnit}`,
})

function sample(id: string, plotId: string, sampledAt: string, kind: SoilSample['kind'], lab: string, analytes: SoilAnalyte[], synthetic = true): SoilSample {
  return {
    id, plotId, sampledAt, receivedAt: timestamp(sampledAt), depthFromCm: 0, depthToCm: 20, kind, lab,
    method: kind === 'laboratory' ? 'Demo laboratory method' : kind === 'mapped-estimate' ? 'Mapped estimate' : 'Field kit',
    provenance: provenance(kind === 'laboratory' ? 'laboratory' : kind === 'mapped-estimate' ? 'mapped-estimate' : 'field-test-kit', lab || id, lab || 'Field observation', lab || 'Demo record', sampledAt, synthetic, kind === 'laboratory' ? 'Demo laboratory method' : 'Field method', synthetic ? 'Synthetic development record.' : ''),
    analytes,
    sourceRows: analytes.map((a) => a.rawRow),
  }
}

const soilSamples: SoilSample[] = [
  sample('SOIL-DEMO-001', 'PLOT-DEMO-002', '2026-11-02', 'laboratory', 'DEMO-LAB-A', [
    analyte('ph', 'pH', 6.6, 'pH', 'measured'),
    analyte('organic_carbon', 'Organic carbon', 6.8, 'g/kg', 'measured'),
    analyte('available_n', 'Available nitrogen (N)', 210, 'mg/kg', 'available'),
    analyte('total_n', 'Total nitrogen (N)', 1.3, 'g/kg', 'total', '%'),
    analyte('available_p', 'Available phosphorus (P)', 22, 'mg/kg', 'available'),
    analyte('available_k', 'Available potassium (K)', 180, 'mg/kg', 'available'),
  ]),
  sample('SOIL-DEMO-002', 'PLOT-DEMO-006', '2026-11-02', 'laboratory', 'DEMO-LAB-A', [
    analyte('ph', 'pH', 6.8, 'pH', 'measured'),
    analyte('available_n', 'Available nitrogen (N)', 242, 'mg/kg', 'available'),
    analyte('total_n', 'Total nitrogen (N)', 1.4, 'g/kg', 'total', '%'),
    analyte('available_p', 'Available phosphorus (P)', 18, 'mg/kg', 'available'),
    analyte('available_k', 'Available potassium (K)', 190, 'mg/kg', 'available'),
  ]),
  sample('SOIL-DEMO-003', 'PLOT-DEMO-009', '2026-11-01', 'mapped-estimate', 'Mapped estimate', [
    analyte('ph', 'pH', 6.4, 'pH', 'measured'),
  ]),
]

const weatherRun = createFixtureWeatherAdapter().fetch({ plotId: null, decisionDate: DEMO_FARM_DATA_DATE })

const regionalWater: RegionalWaterObservation[] = [
  {
    id: 'REGIONAL-WATER-001', block: 'Nandgaon block', observationWellId: 'OBS-WELL-NASHIK-07', observationDate: '2026-11-12', depthBelowGroundM: 18.4, trend: 'falling',
    provenance: provenance('government-adapter', 'OBS-WELL-NASHIK-07', 'Regional observation-well fixture', 'Synthetic groundwater fixture', '2026-11-12', true, 'Fixture', 'Synthetic regional context for development only.'),
    caveats: ['Regional observation only; not a farm well measurement.'],
  },
]

const waterAccess: FarmWaterAccess[] = [
  {
    id: 'WATER-ACCESS-001', plotId: 'PLOT-DEMO-002', source: 'borewell', rights: 'documented', reliability: 'assured',
    pumpDischargeLps: 2.5, pumpingHoursPerDay: 6, storageM3: 20, sharedAllocationPct: 100, irrigationMethod: 'Furrow',
    measuredAt: '2026-11-05', provenance: provenance('fpo-record', 'FPO-WATER-001', 'FPO pump log', 'Meraki FPO', '2026-11-05', true, 'Pump meter log', 'Synthetic pump log for development.'),
    note: 'Demo borewell record; not a verified field measurement.',
  },
  {
    id: 'WATER-ACCESS-002', plotId: 'PLOT-DEMO-006', source: 'shared-well', rights: 'reported', reliability: 'seasonal',
    pumpDischargeLps: 1.8, pumpingHoursPerDay: 5, storageM3: 0, sharedAllocationPct: 50, irrigationMethod: 'Furrow',
    measuredAt: '2026-10-28', provenance: provenance('farmer-report', 'FARMER-WATER-006', 'Farmer-reported shared well', 'Farmer', '2026-10-28', true, 'Farmer report', 'Synthetic farmer report.'),
    note: 'Reported access; not verified.',
  },
  {
    id: 'WATER-ACCESS-003', plotId: 'PLOT-DEMO-009', source: 'rainfed', rights: 'none', reliability: 'none',
    pumpDischargeLps: null, pumpingHoursPerDay: null, storageM3: null, sharedAllocationPct: null, irrigationMethod: '',
    measuredAt: '2026-10-30', provenance: provenance('farmer-report', 'FARMER-WATER-009', 'Farmer-reported rainfed plot', 'Farmer', '2026-10-30', true, 'Farmer report', 'Synthetic farmer report.'),
    note: 'Rainfed only.',
  },
]

const cultivation: CultivationEvent[] = [
  {
    id: 'CULT-DEMO-001', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'seed-purchased', status: 'actual',
    occurredOn: '2026-10-10', plannedFor: null, product: 'Arka Anamika seed', activeIngredient: '', quantity: 14, unit: 'kg', nutrientBasis: 'unknown', areaAcres: 2.0, method: 'Seed purchase', stage: 'Pre-sowing', note: 'Purchase record; not proof of planting.',
    recordedAt: timestamp('2026-10-10'), provenance: provenance('fpo-record', 'FPO-SEED-001', 'FPO seed purchase', 'Meraki FPO', '2026-10-10', true, 'Purchase log'),
    evidence: { id: 'ev-cult-001', label: 'Seed purchase', status: 'estimated', confidence: 'low', asOf: '2026-10-10', validUntil: null, provenance: provenance('fpo-record', 'FPO-SEED-001', 'FPO seed purchase', 'Meraki FPO', '2026-10-10', true), caveats: ['Purchase is not verified planting.'] },
    supplyImpact: null,
  },
  {
    id: 'CULT-DEMO-002', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'seed-planted', status: 'actual',
    occurredOn: '2026-10-15', plannedFor: null, product: 'Arka Anamika seed', activeIngredient: '', quantity: 12, unit: 'kg', nutrientBasis: 'unknown', areaAcres: 2.0, method: 'Direct sowing', stage: 'Establishment', note: 'Synthetic planting record.',
    recordedAt: timestamp('2026-10-15'), provenance: provenance('fpo-record', 'FPO-SEED-002', 'FPO cultivation log', 'Meraki FPO', '2026-10-15', true, 'Field log'),
    evidence: { id: 'ev-cult-002', label: 'Seed planted', status: 'reported', confidence: 'medium', asOf: '2026-10-15', validUntil: null, provenance: provenance('fpo-record', 'FPO-SEED-002', 'FPO cultivation log', 'Meraki FPO', '2026-10-15', true), caveats: [] },
    supplyImpact: null,
  },
  {
    id: 'CULT-DEMO-003', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'fertiliser-applied', status: 'actual',
    occurredOn: '2026-11-02', plannedFor: null, product: 'Urea', activeIngredient: '', quantity: 40, unit: 'kg product', nutrientBasis: 'product', areaAcres: 2.0, method: 'Band placement', stage: 'Vegetative', note: 'Product kg, not nutrient kg.',
    recordedAt: timestamp('2026-11-02'), provenance: provenance('fpo-record', 'FPO-INPUT-001', 'FPO input log', 'Meraki FPO', '2026-11-02', true, 'Field log'),
    evidence: { id: 'ev-cult-003', label: 'Fertiliser applied', status: 'reported', confidence: 'medium', asOf: '2026-11-02', validUntil: null, provenance: provenance('fpo-record', 'FPO-INPUT-001', 'FPO input log', 'Meraki FPO', '2026-11-02', true), caveats: ['Product mass; nutrient mass unknown.'] },
    supplyImpact: null,
  },
  {
    id: 'CULT-DEMO-004', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'irrigation-applied', status: 'actual',
    occurredOn: '2026-11-05', plannedFor: null, product: '', activeIngredient: '', quantity: 120, unit: 'm³', nutrientBasis: 'unknown', areaAcres: 2.0, method: 'Furrow', stage: 'Vegetative', note: 'Synthetic applied irrigation volume.',
    recordedAt: timestamp('2026-11-05'), provenance: provenance('fpo-record', 'FPO-IRR-001', 'FPO irrigation log', 'Meraki FPO', '2026-11-05', true, 'Pump log'),
    evidence: { id: 'ev-cult-004', label: 'Irrigation applied', status: 'reported', confidence: 'medium', asOf: '2026-11-05', validUntil: null, provenance: provenance('fpo-record', 'FPO-IRR-001', 'FPO irrigation log', 'Meraki FPO', '2026-11-05', true), caveats: [] },
    supplyImpact: null,
  },
  {
    id: 'CULT-DEMO-005', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'scouting', status: 'actual',
    occurredOn: '2026-11-12', plannedFor: null, product: '', activeIngredient: '', quantity: null, unit: '', nutrientBasis: 'unknown', areaAcres: 2.0, method: 'Field scouting', stage: 'Flowering', note: 'Mild leafhopper pressure; adviser review pending.',
    recordedAt: timestamp('2026-11-12'), provenance: provenance('adviser', 'ADVISER-SCOUT-001', 'Adviser scouting note', 'Demo adviser', '2026-11-12', true, 'Field scouting'),
    evidence: { id: 'ev-cult-005', label: 'Scouting observation', status: 'reported', confidence: 'medium', asOf: '2026-11-12', validUntil: null, provenance: provenance('adviser', 'ADVISER-SCOUT-001', 'Adviser scouting note', 'Demo adviser', '2026-11-12', true), caveats: ['Observation only; not a pesticide prescription.'] },
    supplyImpact: { effectiveFrom: '2026-12-19', yieldAdjustmentPct: -8, note: 'Leafhopper pressure observed; assume an 8% marketable-supply reduction from late December. Earlier weeks are unchanged.' },
  },
  {
    id: 'CULT-DEMO-006', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'fertiliser-planned', status: 'planned',
    occurredOn: null, plannedFor: '2026-12-01', product: '19:19:19', activeIngredient: '', quantity: 25, unit: 'kg product', nutrientBasis: 'product', areaAcres: 2.0, method: 'Fertigation', stage: 'Fruiting', note: 'Planned only; not applied.',
    recordedAt: timestamp('2026-11-10'), provenance: provenance('fpo-record', 'FPO-PLAN-001', 'FPO cultivation plan', 'Meraki FPO', '2026-11-10', true, 'Plan'),
    evidence: { id: 'ev-cult-006', label: 'Planned fertiliser', status: 'estimated', confidence: 'low', asOf: '2026-12-01', validUntil: null, provenance: provenance('fpo-record', 'FPO-PLAN-001', 'FPO cultivation plan', 'Meraki FPO', '2026-11-10', true), caveats: ['Planned activity; not verified application.'] },
    supplyImpact: null,
  },
  {
    id: 'CULT-DEMO-007', plotId: 'PLOT-DEMO-002', cropCycleId: 'CYCLE-DEMO-002', crop: 'Okra', kind: 'pesticide-planned', status: 'planned',
    occurredOn: null, plannedFor: '2026-11-25', product: 'Neem-based formulation', activeIngredient: 'Azadirachtin', quantity: 2, unit: 'litre product', nutrientBasis: 'unknown', areaAcres: 2.0, method: 'Foliar spray', stage: 'Flowering', note: 'Planned only; pre-harvest interval review required if applied.',
    recordedAt: timestamp('2026-11-12'), provenance: provenance('fpo-record', 'FPO-PLAN-002', 'FPO cultivation plan', 'Meraki FPO', '2026-11-12', true, 'Plan'),
    evidence: { id: 'ev-cult-007', label: 'Planned pesticide', status: 'estimated', confidence: 'low', asOf: '2026-11-25', validUntil: null, provenance: provenance('fpo-record', 'FPO-PLAN-002', 'FPO cultivation plan', 'Meraki FPO', '2026-11-12', true), caveats: ['Planned activity; not verified application.'] },
    supplyImpact: null,
  },
]

function consentFor(status: 'opted-in' | 'opted-out' | 'not-recorded' | 'unavailable', date: string | null, note = '') {
  return { status, recordedAt: date ? timestamp(date) : null, note }
}

export function createDemoFarmIntelligenceState(): FarmIntelligenceState {
  const okra = crops.find((c) => c.id === 'okra')!
  const okraPlotWater = waterAccess.find((w) => w.plotId === 'PLOT-DEMO-002')!
  const okraConsent = consentFor('opted-in', '2026-10-10', 'Synthetic participation record.')
  const okraEvents = cultivation.filter((e) => e.plotId === 'PLOT-DEMO-002')
  const okraSoil = resolveSoilEvidence(soilSamples, 'PLOT-DEMO-002', DEMO_FARM_DATA_DATE)
  const okraWater = assessWaterAccess(okraPlotWater, okra, 2.0, { decisionDate: DEMO_FARM_DATA_DATE })
  const okraEvidence = buildScenarioEvidence({ soil: okraSoil, weatherRecords: weatherRun.records, water: okraWater, events: okraEvents, decisionDate: DEMO_FARM_DATA_DATE })
  const okraScenario: PlantingScenario = {
    id: 'SCENARIO-DEMO-001', name: 'Rabi okra on Anita Patil’s canal-side plot', plotId: 'PLOT-DEMO-002', farmerId: 'FPO-DEMO-001',
    cropId: okra.id, cropName: okra.name, variety: 'Arka Anamika', grade: 'Grade A', areaAcres: 2.0,
    plantingDate: '2026-10-15', harvestStart: '2026-12-05', harvestEnd: '2027-02-10', decisionDate: DEMO_FARM_DATA_DATE,
    gradeEligibleFraction: 0.88, committedShareFraction: 0.85, retentionFactor: 0.96, logisticsCapacityKgPerWeek: 2200,
    yieldOverrideKgPerAcre: null, yieldOverrideNote: 'Indicative crop reference; no reviewed farm yield observation.',
    consent: okraConsent, evidence: okraEvidence,
    assumptions: ['Demo scenario for development; synthetic records only.', 'Indicative picking curve, not an observed picking curve.'],
    cropReferenceVersion: CROP_REFERENCE_VERSION, createdAt: timestamp('2026-11-16'), updatedAt: timestamp('2026-11-16'),
  }
  const okraProjection = buildWeeklyProjection({ scenario: okraScenario, crop: okra, location: 'Nandgaon, Nashik' })
  const version: ProjectionVersion = {
    id: 'PROJECTION-VERSION-DEMO-001', scenarioId: okraScenario.id, version: 1, createdAt: timestamp('2026-11-16'), createdBy: 'Demo coordinator',
    trigger: 'initial', reason: 'Initial development projection from reviewed synthetic records.', projection: okraProjection,
    evidence: okraEvidence, consent: okraConsent, supersedesVersionId: null, revision: null,
  }
  return {
    contractVersion: FARM_DATA_CONTRACT_VERSION,
    soilSamples,
    soilImports: [{
      id: 'SOIL-IMPORT-DEMO-001', importedAt: timestamp('2026-11-10'),
      result: { templateVersion: 'soil-csv-2026-11-16.1', accepted: soilSamples, rejected: [], warnings: ['Synthetic demo soil records; not laboratory reports.'], rowsRead: 15 },
    }],
    weatherRuns: [weatherRun],
    regionalWater,
    waterAccess,
    cultivation,
    scenarios: [okraScenario],
    projectionVersions: [version],
  }
}

export const demoRuleVersion = PROJECTION_RULE_VERSION
export const demoProjection = (): WeeklyProjection => createDemoFarmIntelligenceState().projectionVersions[0].projection
