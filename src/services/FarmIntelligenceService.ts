import { createDemoFarmIntelligenceState } from '../data/farmIntelligenceDemo'
import type {
  CultivationEvent, FarmIntelligenceState, FarmWaterAccess, PlantingScenario, SoilImportResult, WeatherAdapterRun,
} from '../farmdata/types'
import { FARM_DATA_CONTRACT_VERSION } from '../farmdata/types'

const STORAGE_KEY = 'meraki-farm-intelligence-v1'
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const initialFarmIntelligenceState = (): FarmIntelligenceState => createDemoFarmIntelligenceState()

function isState(value: unknown): value is FarmIntelligenceState {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return typeof data.contractVersion === 'string'
    && Array.isArray(data.soilSamples)
    && Array.isArray(data.soilImports)
    && Array.isArray(data.weatherRuns)
    && Array.isArray(data.waterAccess)
    && Array.isArray(data.regionalWater)
    && Array.isArray(data.cultivation)
    && Array.isArray(data.scenarios)
    && Array.isArray(data.projectionVersions)
}

export function loadFarmIntelligenceState(): FarmIntelligenceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isState(parsed) && parsed.contractVersion === FARM_DATA_CONTRACT_VERSION) return parsed
    }
  } catch {
    // Keep the synthetic demo usable when storage is unavailable or corrupt.
  }
  return clone(initialFarmIntelligenceState())
}

export function persistFarmIntelligenceState(state: FarmIntelligenceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Changes remain in memory for this session.
  }
}

export function resetFarmIntelligenceState(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function appendSoilImport(state: FarmIntelligenceState, result: SoilImportResult): FarmIntelligenceState {
  if (!result.accepted.length) return state
  return {
    ...state,
    soilSamples: [...result.accepted, ...state.soilSamples],
    soilImports: [{ id: uid('SOIL-IMPORT'), importedAt: new Date().toISOString(), result }, ...state.soilImports],
  }
}

export function appendWeatherRun(state: FarmIntelligenceState, run: WeatherAdapterRun): FarmIntelligenceState {
  return { ...state, weatherRuns: [run, ...state.weatherRuns] }
}

export function upsertWaterAccess(state: FarmIntelligenceState, access: FarmWaterAccess): FarmIntelligenceState {
  const exists = state.waterAccess.some((w) => w.id === access.id)
  return { ...state, waterAccess: exists ? state.waterAccess.map((w) => (w.id === access.id ? access : w)) : [access, ...state.waterAccess] }
}

export function appendCultivationEvent(state: FarmIntelligenceState, event: CultivationEvent): FarmIntelligenceState {
  return { ...state, cultivation: [event, ...state.cultivation] }
}

export function upsertScenario(state: FarmIntelligenceState, scenario: PlantingScenario): FarmIntelligenceState {
  return {
    ...state,
    scenarios: state.scenarios.some((s) => s.id === scenario.id) ? state.scenarios.map((s) => (s.id === scenario.id ? scenario : s)) : [scenario, ...state.scenarios],
  }
}
