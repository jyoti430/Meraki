import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useFarmers } from './FarmersContext'
import { crops, findCrop } from '../data/crops'
import { DEMO_FARM_DATA_DATE } from '../data/farmIntelligenceDemo'
import type { Farmer, Plot } from '../types'
import type {
  ConsentSnapshot, CultivationEvent, FarmIntelligenceState, FarmWaterAccess, PlantingScenario, ProjectionRevision, ProjectionVersion, SoilImportResult, WeatherAdapterRun,
} from '../farmdata/types'
import { buildScenario, evidenceForScenario, publishProjectionVersion, reviseProjectionVersion } from '../farmdata/scenario'
import type { ScenarioDraftInput } from '../farmdata/scenario'
import { importSoilCsv } from '../farmdata/soil'
import { createFixtureWeatherAdapter } from '../farmdata/weather'
import {
  appendCultivationEvent, appendSoilImport, appendWeatherRun, loadFarmIntelligenceState, persistFarmIntelligenceState, upsertScenario, upsertWaterAccess,
} from '../services/FarmIntelligenceService'

const CROP_REFERENCE_VERSION = 'crop-reference-2026-11-16.1'

export type FarmIntelligenceContextValue = {
  state: FarmIntelligenceState
  importSoil: (csv: string) => SoilImportResult
  runWeatherAdapter: (options?: { failReason?: string }) => WeatherAdapterRun
  saveWaterAccess: (access: FarmWaterAccess) => void
  addCultivationEvent: (event: CultivationEvent) => void
  saveScenario: (input: ScenarioDraftInput, existingId?: string) => PlantingScenario
  publishVersion: (scenarioId: string, reason: string, createdBy: string) => ProjectionVersion
  applyRevision: (scenarioId: string, revision: ProjectionRevision, createdBy: string) => { version: ProjectionVersion; affectedWeeks: number }
  consentForFarmer: (farmerId: string) => ConsentSnapshot
}

const FarmIntelligenceContext = createContext<FarmIntelligenceContextValue | null>(null)

export const consentForFarmer = (farmer: Farmer | undefined): ConsentSnapshot => {
  if (!farmer) return { status: 'not-recorded', recordedAt: null, note: 'Farmer record not found.' }
  return {
    status: farmer.consent.status,
    recordedAt: farmer.consent.recordedAt,
    note: farmer.consent.reason || farmer.consent.notes || '',
  }
}

const draftFromScenario = (scenario: PlantingScenario): ScenarioDraftInput => ({
  name: scenario.name,
  plotId: scenario.plotId,
  farmerId: scenario.farmerId,
  cropId: scenario.cropId,
  variety: scenario.variety,
  grade: scenario.grade,
  areaAcres: scenario.areaAcres,
  plantingDate: scenario.plantingDate,
  harvestStart: scenario.harvestStart,
  harvestEnd: scenario.harvestEnd,
  decisionDate: scenario.decisionDate,
  gradeEligibleFraction: scenario.gradeEligibleFraction,
  committedShareFraction: scenario.committedShareFraction,
  retentionFactor: scenario.retentionFactor,
  logisticsCapacityKgPerWeek: scenario.logisticsCapacityKgPerWeek,
  yieldOverrideKgPerAcre: scenario.yieldOverrideKgPerAcre,
  yieldOverrideNote: scenario.yieldOverrideNote,
})

export function FarmIntelligenceProvider({ children }: { children: ReactNode }) {
  const { data } = useFarmers()
  const [state, setState] = useState<FarmIntelligenceState>(loadFarmIntelligenceState)

  useEffect(() => persistFarmIntelligenceState(state), [state])

  const importSoil = useCallback((csv: string): SoilImportResult => {
    const result = importSoilCsv(csv, { knownPlotIds: data.plots.map((p) => p.id), today: new Date().toISOString().slice(0, 10) })
    if (result.accepted.length) setState((current) => appendSoilImport(current, result))
    return result
  }, [data.plots])

  const runWeatherAdapter = useCallback((options?: { failReason?: string }): WeatherAdapterRun => {
    const adapter = createFixtureWeatherAdapter(options)
    // The workspace decision date is fixed for the deterministic demo; the fixture stays aligned with it.
    const run = adapter.fetch({ plotId: null, decisionDate: DEMO_FARM_DATA_DATE })
    setState((current) => appendWeatherRun(current, run))
    return run
  }, [])

  const saveWaterAccess = useCallback((access: FarmWaterAccess) => setState((current) => upsertWaterAccess(current, access)), [])
  const addCultivationEvent = useCallback((event: CultivationEvent) => setState((current) => appendCultivationEvent(current, event)), [])

  const saveScenario = useCallback((input: ScenarioDraftInput, existingId?: string): PlantingScenario => {
    const crop = crops.find((c) => c.id === input.cropId)
    const plot = data.plots.find((p) => p.id === input.plotId)
    if (!crop) throw new Error('Select a crop with an indicative reference profile.')
    if (!plot) throw new Error('Select an existing plot.')
    const farmer = data.farmers.find((f) => f.id === plot.farmerId)
    const scenario = buildScenario(input, {
      crop,
      plot,
      consent: consentForFarmer(farmer),
      state,
      cropReferenceVersion: CROP_REFERENCE_VERSION,
      existing: existingId ? state.scenarios.find((s) => s.id === existingId) ?? null : null,
    })
    setState((current) => upsertScenario(current, scenario))
    return scenario
  }, [data.farmers, data.plots, state])

  const refreshedScenario = useCallback((scenario: PlantingScenario): { scenario: PlantingScenario; crop: NonNullable<ReturnType<typeof findCrop>>; plot: Plot; consent: ConsentSnapshot } => {
    const crop = findCrop(scenario.cropName)
    const plot = data.plots.find((p) => p.id === scenario.plotId)
    if (!crop) throw new Error(`Crop reference for ${scenario.cropName} is missing.`)
    if (!plot) throw new Error(`Plot ${scenario.plotId} is missing.`)
    const farmer = data.farmers.find((f) => f.id === plot.farmerId)
    const consent = consentForFarmer(farmer)
    const refreshed = buildScenario(draftFromScenario(scenario), { crop, plot, consent, state, cropReferenceVersion: CROP_REFERENCE_VERSION, existing: scenario })
    return { scenario: refreshed, crop, plot, consent }
  }, [data.farmers, data.plots, state])

  const publishVersion = useCallback((scenarioId: string, reason: string, createdBy: string): ProjectionVersion => {
    const scenario = state.scenarios.find((s) => s.id === scenarioId)
    if (!scenario) throw new Error('Scenario not found.')
    const { scenario: refreshed, crop, plot, consent } = refreshedScenario(scenario)
    const result = publishProjectionVersion(state, {
      scenario: refreshed, crop, location: plot.villageLocation, consent, trigger: 'initial', reason, createdBy,
    })
    setState(result.state)
    return result.version
  }, [state, refreshedScenario])

  const applyRevision = useCallback((scenarioId: string, revision: ProjectionRevision, createdBy: string) => {
    const scenario = state.scenarios.find((s) => s.id === scenarioId)
    if (!scenario) throw new Error('Scenario not found.')
    const { scenario: refreshed, crop, plot, consent } = refreshedScenario(scenario)
    const result = reviseProjectionVersion(state, { scenario: refreshed, crop, location: plot.villageLocation, consent, revision, createdBy })
    setState(result.state)
    return { version: result.version, affectedWeeks: result.affectedWeeks }
  }, [state, refreshedScenario])

  const value = useMemo<FarmIntelligenceContextValue>(() => ({
    state, importSoil, runWeatherAdapter, saveWaterAccess, addCultivationEvent, saveScenario, publishVersion, applyRevision, consentForFarmer: (id) => consentForFarmer(data.farmers.find((f) => f.id === id)),
  }), [state, importSoil, runWeatherAdapter, saveWaterAccess, addCultivationEvent, saveScenario, publishVersion, applyRevision, data.farmers])

  return <FarmIntelligenceContext.Provider value={value}>{children}</FarmIntelligenceContext.Provider>
}

export function useFarmIntelligence() {
  const context = useContext(FarmIntelligenceContext)
  if (!context) throw new Error('useFarmIntelligence must be used inside FarmIntelligenceProvider')
  return context
}

export { evidenceForScenario }
