import type { CropProfile } from '../data/crops'
import type { Plot } from '../types'
import type {
  ConsentSnapshot, FarmIntelligenceState, PlantingScenario, ProjectionRevision, ProjectionTrigger, ProjectionVersion,
} from './types'
import { PROJECTION_RULE_VERSION } from './types'
import { resolveSoilEvidence } from './soil'
import { assessWaterAccess } from './water'
import { buildScenarioEvidence } from './evidence'
import { applyProjectionRevision, buildWeeklyProjection } from './projections'

export interface ScenarioDraftInput {
  name: string
  plotId: string
  farmerId: string
  cropId: string
  variety: string
  grade: string
  areaAcres: number
  plantingDate: string
  harvestStart: string
  harvestEnd: string
  decisionDate: string
  gradeEligibleFraction: number
  committedShareFraction: number
  retentionFactor: number
  logisticsCapacityKgPerWeek: number | null
  yieldOverrideKgPerAcre: number | null
  yieldOverrideNote: string
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function evidenceForScenario(state: FarmIntelligenceState, input: { plotId: string; crop: CropProfile; areaAcres: number; decisionDate: string; location: string }) {
  const soil = resolveSoilEvidence(state.soilSamples, input.plotId, input.decisionDate)
  const access = state.waterAccess.find((w) => w.plotId === input.plotId) ?? null
  const water = assessWaterAccess(access, input.crop, input.areaAcres, { decisionDate: input.decisionDate })
  const weatherRecords = state.weatherRuns.flatMap((run) => run.records).filter((r) => r.plotId == null || r.plotId === input.plotId)
  const events = state.cultivation.filter((e) => e.plotId === input.plotId && e.crop.toLowerCase() === input.crop.name.toLowerCase())
  return { soil, water, evidence: buildScenarioEvidence({ soil, weatherRecords, water, events, decisionDate: input.decisionDate }) }
}

export function buildScenario(input: ScenarioDraftInput, context: {
  crop: CropProfile
  plot: Plot
  consent: ConsentSnapshot
  state: FarmIntelligenceState
  cropReferenceVersion: string
  existing?: PlantingScenario | null
}): PlantingScenario {
  const { crop, plot, consent, state } = context
  const { evidence } = evidenceForScenario(state, { plotId: plot.id, crop, areaAcres: input.areaAcres, decisionDate: input.decisionDate, location: plot.villageLocation })
  const now = new Date().toISOString()
  const assumptions = [
    'Farmer consent affects whether any quantity may be allocated; it is not inferred from membership.',
    'Soil, weather and water evidence are filtered to the decision date; later observations cannot leak backwards.',
    'Indicative crop, picking-curve and water assumptions require local agronomic review before real advice.',
    `Rule version ${PROJECTION_RULE_VERSION}.`,
  ]
  return {
    ...input,
    id: context.existing?.id ?? uid('SCENARIO'),
    cropName: crop.name,
    consent,
    evidence,
    assumptions,
    cropReferenceVersion: context.cropReferenceVersion,
    createdAt: context.existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function publishProjectionVersion(state: FarmIntelligenceState, input: {
  scenario: PlantingScenario
  crop: CropProfile
  location: string
  consent: ConsentSnapshot
  trigger: ProjectionTrigger
  reason: string
  createdBy: string
  revision?: ProjectionRevision | null
  projectionOverride?: ReturnType<typeof buildWeeklyProjection>
}): { state: FarmIntelligenceState; version: ProjectionVersion } {
  const scenario = { ...input.scenario, consent: input.consent }
  const projection = input.projectionOverride ?? buildWeeklyProjection({ scenario, crop: input.crop, location: input.location })
  const existing = state.projectionVersions.filter((v) => v.scenarioId === scenario.id).sort((a, b) => b.version - a.version)
  const latest = existing[0] ?? null
  const version: ProjectionVersion = {
    id: uid('PROJECTION-VERSION'),
    scenarioId: scenario.id,
    version: (latest?.version ?? 0) + 1,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    trigger: input.trigger,
    reason: input.reason,
    projection,
    evidence: scenario.evidence,
    consent: input.consent,
    supersedesVersionId: latest?.id ?? null,
    revision: input.revision ?? null,
  }
  return {
    state: {
      ...state,
      scenarios: state.scenarios.some((s) => s.id === scenario.id) ? state.scenarios.map((s) => (s.id === scenario.id ? scenario : s)) : [scenario, ...state.scenarios],
      projectionVersions: [version, ...state.projectionVersions],
    },
    version,
  }
}

export function reviseProjectionVersion(state: FarmIntelligenceState, input: {
  scenario: PlantingScenario
  crop: CropProfile
  location: string
  consent: ConsentSnapshot
  revision: ProjectionRevision
  createdBy: string
}): { state: FarmIntelligenceState; version: ProjectionVersion; affectedWeeks: number } {
  const latest = state.projectionVersions.filter((v) => v.scenarioId === input.scenario.id).sort((a, b) => b.version - a.version)[0]
  if (!latest) throw new Error('Publish an initial projection before applying a revision.')
  const refreshed = { ...input.scenario, consent: input.consent }
  const applied = applyProjectionRevision(latest.projection, input.revision)
  const published = publishProjectionVersion(state, {
    scenario: refreshed,
    crop: input.crop,
    location: input.location,
    consent: input.consent,
    trigger: 'cultivation-observation',
    reason: input.revision.note || `Cultivation observation from ${input.revision.observedOn}`,
    createdBy: input.createdBy,
    revision: input.revision,
    projectionOverride: applied.projection,
  })
  return { ...published, affectedWeeks: applied.affectedWeeks }
}
