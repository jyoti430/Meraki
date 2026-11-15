import { isValidIsoDate } from './csv'
import type { CultivationEvent, CultivationEventKind, CultivationSummary, CultivationValidation, InputCategory } from './types'

const categoryByKind: Record<CultivationEventKind, InputCategory> = {
  'seed-intended': 'seed',
  'seed-purchased': 'seed',
  'seed-planted': 'seed',
  'fertiliser-planned': 'fertiliser',
  'fertiliser-applied': 'fertiliser',
  'pesticide-planned': 'pesticide',
  'pesticide-applied': 'pesticide',
  'irrigation-planned': 'irrigation',
  'irrigation-applied': 'irrigation',
  scouting: 'other',
  establishment: 'other',
  harvest: 'other',
}

export const inputCategory = (kind: CultivationEventKind): InputCategory => categoryByKind[kind]

export const cultivationKindLabel: Record<CultivationEventKind, string> = {
  'seed-intended': 'Seed intended',
  'seed-purchased': 'Seed purchased',
  'seed-planted': 'Seed planted',
  'fertiliser-planned': 'Fertiliser planned',
  'fertiliser-applied': 'Fertiliser applied',
  'pesticide-planned': 'Pesticide planned',
  'pesticide-applied': 'Pesticide applied',
  'irrigation-planned': 'Irrigation planned',
  'irrigation-applied': 'Irrigation applied',
  scouting: 'Field scouting',
  establishment: 'Crop establishment',
  harvest: 'Harvest observation',
}

export function validateCultivationEvent(event: CultivationEvent, today = new Date().toISOString().slice(0, 10)): CultivationValidation {
  const errors: string[] = []
  const warnings: string[] = []
  if (!event.plotId) errors.push('Select a plot.')
  if (!event.crop.trim()) errors.push('Crop is required.')
  if (event.status === 'actual') {
    if (!event.occurredOn || !isValidIsoDate(event.occurredOn)) errors.push('An actual event needs a real occurred-on date.')
    else if (event.occurredOn > today) errors.push('An actual event cannot be dated in the future.')
  } else if (!event.plannedFor || !isValidIsoDate(event.plannedFor)) errors.push('A planned event needs a real planned-for date.')
  if (event.quantity != null && (!Number.isFinite(event.quantity) || event.quantity <= 0)) errors.push('Quantity must be greater than zero when provided.')
  if (event.quantity != null && !event.unit.trim()) errors.push('A quantity needs a unit.')
  if ((event.kind === 'fertiliser-planned' || event.kind === 'fertiliser-applied') && !event.product.trim()) warnings.push('Product name is blank; nutrient composition cannot be derived.')
  if (event.kind.startsWith('pesticide-') && !event.activeIngredient.trim()) warnings.push('Active ingredient is not recorded; traceability is incomplete.')
  if (event.kind === 'pesticide-applied') warnings.push('A spray record does not certify residue safety; a pre-harvest interval review is still required.')
  if (event.kind === 'seed-purchased') warnings.push('Purchased seed is not verified as planted. Record establishment separately.')
  if (event.kind === 'fertiliser-planned' || event.kind === 'pesticide-planned' || event.kind === 'irrigation-planned') warnings.push('A planned input is not a verified application. Record actual application when it happens.')
  if (event.nutrientBasis === 'nutrient' && event.quantity != null && !/nutrient/i.test(event.unit)) warnings.push('Nutrient basis is selected; make the unit explicitly nutrient mass (for example kg N).')
  if (event.supplyImpact) {
    if (!isValidIsoDate(event.supplyImpact.effectiveFrom)) errors.push('A supply-impact effective date must be a real YYYY-MM-DD date.')
    if (!Number.isFinite(event.supplyImpact.yieldAdjustmentPct) || event.supplyImpact.yieldAdjustmentPct < -100 || event.supplyImpact.yieldAdjustmentPct > 100) errors.push('Yield adjustment must be between -100% and 100%.')
  }
  return { valid: errors.length === 0, errors, warnings }
}

const labelForCategory: Record<InputCategory, string> = { seed: 'Seed', fertiliser: 'Fertiliser', pesticide: 'Pesticide', irrigation: 'Irrigation', other: 'Other' }

/**
 * Planned and actual records stay separate. If no actual record exists the answer is unknown,
 * never a zero application.
 */
export function summariseCultivation(events: CultivationEvent[], expected: InputCategory[] = ['seed', 'fertiliser', 'irrigation']): CultivationSummary {
  const planned = events.filter((e) => e.status === 'planned')
  const actual = events.filter((e) => e.status === 'actual')
  const missing: CultivationSummary['missing'] = expected
    .filter((category) => !actual.some((e) => inputCategory(e.kind) === category))
    .map((category) => ({ category, label: labelForCategory[category], status: 'unknown' as const, caveat: `No actual ${labelForCategory[category].toLowerCase()} event recorded; application is unknown, not zero.` }))
  const reviewFlags: string[] = []
  if (actual.some((e) => e.kind === 'pesticide-applied')) reviewFlags.push('Pesticide use requires pre-harvest-interval and residue-safety review by a qualified person.')
  if (planned.length && !actual.length) reviewFlags.push('Only planned activities exist; no verified application has been recorded.')
  if (events.some((e) => e.nutrientBasis === 'product')) reviewFlags.push('Some fertiliser quantities are product mass; nutrient mass cannot be inferred without product composition.')
  if (events.some((e) => e.kind === 'seed-purchased') && !actual.some((e) => e.kind === 'seed-planted')) reviewFlags.push('Seed was purchased but no planting/establishment record exists.')
  const actualDates = actual.map((e) => e.occurredOn ?? '').sort()
  const latestActualAt = actualDates.length ? actualDates[actualDates.length - 1] : null
  return {
    planned,
    actual,
    missing,
    latestActualAt: latestActualAt || null,
    caveats: [
      ...missing.map((m) => m.caveat),
      ...(events.length ? [] : ['No cultivation records exist for this plot and crop. Inputs are unknown, not zero.']),
    ],
    reviewFlags,
  }
}
