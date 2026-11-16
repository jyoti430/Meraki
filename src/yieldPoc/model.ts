import artifact from '../data/syntheticYieldModel.json'

export { artifact }
export interface YieldInput {
  soil_ph: number
  organic_carbon_pct: number
  available_n_mg_kg: number
  planned_irrigation_pct: number
  historical_rain_mm: number
  historical_temp_c: number
}
export const defaultInput: YieldInput = {
  soil_ph: 6.5, organic_carbon_pct: 1.2, available_n_mg_kg: 180,
  planned_irrigation_pct: 80, historical_rain_mm: 650, historical_temp_c: 27,
}
export function predictSynthetic(input: YieldInput) {
  for (const field of artifact.inputs) {
    const value = input[field.key as keyof YieldInput]
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      throw new Error(`${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`)
    }
  }
  const features = [(input.soil_ph - 6.5) ** 2, input.organic_carbon_pct, input.available_n_mg_kg,
    input.planned_irrigation_pct, input.historical_rain_mm, (input.historical_temp_c - 27) ** 2]
  const contributions = features.map((value, index) => ({ label: artifact.features[index],
    value: artifact.model.coefficients[index + 1] * (value - artifact.model.means[index]) / artifact.model.scales[index] }))
  const rawYield = artifact.model.coefficients[0] + contributions.reduce((sum, row) => sum + row.value, 0)
  const yieldKgHa = Math.max(0, rawYield)
  const band = artifact.validation_residual_band_kg_ha
  return { yieldKgHa, rawYield, contributions, intercept: artifact.model.coefficients[0],
    lowKgHa: Math.max(0, yieldKgHa - band), highKgHa: yieldKgHa + band,
    synthetic: true as const, productionAllowed: false as const }
}

export interface SupplyAssumptions {
  areaHa: number; gradePct: number; committedPct: number; retentionPct: number; capacityKgWeek: number; consent: boolean
}
export const defaultSupply: SupplyAssumptions = {
  areaHa: 1, gradePct: 80, committedPct: 75, retentionPct: 95, capacityKgWeek: 1000, consent: true,
}
const pickingCurve = [0.04, 0.07, 0.11, 0.15, 0.17, 0.16, 0.12, 0.09, 0.06, 0.03]
export function projectSynthetic(yieldKgHa: number, scenario: SupplyAssumptions) {
  if (!Number.isFinite(yieldKgHa) || yieldKgHa < 0 || !Number.isFinite(scenario.areaHa) || scenario.areaHa <= 0 || scenario.areaHa > 100
    || !Number.isFinite(scenario.capacityKgWeek) || scenario.capacityKgWeek < 0 || scenario.capacityKgWeek > 1e6
    || typeof scenario.consent !== 'boolean') throw new Error('Use an area above 0 and at most 100 ha and capacity from 0 to 1,000,000 kg/week.')
  for (const value of [scenario.gradePct, scenario.committedPct, scenario.retentionPct]) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Grade, commitment and retention must be from 0 to 100%.')
  }
  return pickingCurve.map((share, index) => {
    const grossKg = yieldKgHa * scenario.areaHa * share
    const gradeLossKg = grossKg * (1 - scenario.gradePct / 100)
    const marketableKg = grossKg - gradeLossKg
    const committedKg = marketableKg * scenario.committedPct / 100
    const handlingLossKg = committedKg * (1 - scenario.retentionPct / 100)
    const beforeConsentKg = committedKg - handlingLossKg
    const afterConsentKg = scenario.consent ? beforeConsentKg : 0
    const supplyKg = Math.min(afterConsentKg, scenario.capacityKgWeek)
    return { week: index + 1, grossKg, gradeLossKg, marketableKg, committedKg, handlingLossKg,
      beforeConsentKg, consentBlockedKg: beforeConsentKg - afterConsentKg,
      capacityShortfallKg: afterConsentKg - supplyKg, supplyKg }
  })
}
