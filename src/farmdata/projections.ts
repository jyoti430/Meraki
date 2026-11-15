import type { CropProfile } from '../data/crops'
import { addDays, daysBetween, minDate } from '../planning/format'
import type { EvidenceSummary, PlantingScenario, ProjectionRevision, WeeklyProjection, WeeklyProjectionTotals, WeeklySupplyRow } from './types'
import { PROJECTION_RULE_VERSION } from './types'

/** Indicative picking shapes for development scenarios. They are assumptions, not observed curves. */
const pickingCurves: Record<string, number[]> = {
  okra: [0.08, 0.12, 0.17, 0.19, 0.18, 0.13, 0.08, 0.05],
  'green-chilli': [0.06, 0.09, 0.13, 0.16, 0.17, 0.15, 0.11, 0.08, 0.05],
  tomato: [0.07, 0.11, 0.16, 0.19, 0.18, 0.14, 0.09, 0.06],
  'baby-corn': [0.18, 0.28, 0.26, 0.16, 0.08, 0.04],
  onion: [0.12, 0.2, 0.26, 0.24, 0.12, 0.06],
  'bitter-gourd': [0.08, 0.12, 0.16, 0.18, 0.17, 0.13, 0.09, 0.07],
  drumstick: [0.15, 0.22, 0.24, 0.19, 0.12, 0.08],
}

function normaliseCurve(values: number[], weeks: number): number[] {
  const base = values.length ? values : Array.from({ length: 8 }, () => 1)
  const picked = Array.from({ length: weeks }, (_, i) => Math.max(0, base[i % base.length]))
  const total = picked.reduce((s, v) => s + v, 0) || 1
  return picked.map((v) => v / total)
}

const round = (value: number) => Math.round(value * 100) / 100

function totalsOf(weeks: WeeklySupplyRow[]): WeeklyProjectionTotals {
  const sum = (key: keyof WeeklySupplyRow) => round(weeks.reduce((s, w) => s + (typeof w[key] === 'number' ? (w[key] as number) : 0), 0))
  return {
    grossKg: sum('grossKg'),
    gradeLossKg: sum('gradeLossKg'),
    marketableKg: sum('marketableKg'),
    committedShareKg: sum('committedShareKg'),
    retainedKg: sum('retainedKg'),
    plannedAllocatableKg: sum('plannedAllocatableKg'),
    allocatableKg: sum('allocatableKg'),
    consentBlockedKg: sum('consentBlockedKg'),
    constrainedKg: sum('constrainedKg'),
    capacityShortfallKg: sum('capacityShortfallKg'),
    lowKg: sum('lowKg'),
    highKg: sum('highKg'),
  }
}

function uncertaintyOf(evidence: EvidenceSummary, scenario: PlantingScenario): WeeklyProjection['uncertainty'] {
  const weak = evidence.confidence === 'low' || evidence.confidence === 'none' || ['unknown', 'estimated', 'stale', 'failed'].includes(evidence.status)
  const medium = !weak && (evidence.confidence === 'medium' || evidence.status === 'reported')
  const caveats = [
    'Low/base/high are planning scenarios, not calibrated probabilities or guaranteed yields.',
    scenario.yieldOverrideKgPerAcre == null ? 'Base yield uses the indicative crop reference range.' : 'Base yield uses a reviewed override; low/high apply ±15% only to show uncertainty.',
    ...evidence.caveats,
  ]
  if (scenario.consent.status !== 'opted-in') caveats.push(`Farmer consent is ${scenario.consent.status.replace(/-/g, ' ')}; allocatable supply is withheld.`)
  return { level: weak ? 'high' : medium ? 'medium' : 'low', basis: weak ? 'Evidence is missing, stale or estimated.' : medium ? 'Evidence is reported but not fully verified.' : 'Evidence is verified at the decision date.', caveats }
}

export function buildWeeklyProjection(input: { scenario: PlantingScenario; crop: CropProfile; location: string }): WeeklyProjection {
  const { scenario, crop, location } = input
  if (!Number.isFinite(scenario.areaAcres) || scenario.areaAcres <= 0) throw new Error('Scenario area must be greater than zero.')
  if (scenario.harvestEnd < scenario.harvestStart) throw new Error('Harvest end must not be before harvest start.')
  if (scenario.gradeEligibleFraction < 0 || scenario.gradeEligibleFraction > 1) throw new Error('Grade-eligible fraction must be between 0 and 1.')
  if (scenario.committedShareFraction < 0 || scenario.committedShareFraction > 1) throw new Error('Committed share must be between 0 and 1.')
  if (scenario.retentionFactor < 0 || scenario.retentionFactor > 1) throw new Error('Retention availability factor must be between 0 and 1.')
  const weeks = Math.max(1, Math.floor(daysBetween(scenario.harvestStart, scenario.harvestEnd) / 7) + 1)
  const curve = normaliseCurve(pickingCurves[crop.id] ?? Array.from({ length: 8 }, () => 1), weeks)
  const baseYield = scenario.yieldOverrideKgPerAcre ?? crop.yieldPerAcre[1]
  const lowYield = scenario.yieldOverrideKgPerAcre == null ? crop.yieldPerAcre[0] : baseYield * 0.85
  const highYield = scenario.yieldOverrideKgPerAcre == null ? crop.yieldPerAcre[2] : baseYield * 1.15
  const consentAllows = scenario.consent.status === 'opted-in'
  const capacity = scenario.logisticsCapacityKgPerWeek
  const capacityCaveat = capacity == null ? 'No weekly logistics capacity was set; allocation is not capacity-constrained in this scenario.' : `Weekly logistics capacity ${Math.round(capacity)} kg was applied as a scenario constraint.`

  const compute = (share: number, yieldKgPerAcre: number) => {
    const grossKg = scenario.areaAcres * yieldKgPerAcre * share
    const gradeLossKg = grossKg * (1 - scenario.gradeEligibleFraction)
    const marketableKg = grossKg - gradeLossKg
    const committedShareKg = marketableKg * scenario.committedShareFraction
    const retainedKg = committedShareKg * (1 - scenario.retentionFactor)
    const plannedAllocatableKg = committedShareKg * scenario.retentionFactor
    const allocatableKg = consentAllows ? plannedAllocatableKg : 0
    const consentBlockedKg = consentAllows ? 0 : plannedAllocatableKg
    const constrainedKg = capacity == null ? allocatableKg : Math.min(allocatableKg, capacity)
    const capacityShortfallKg = capacity == null ? 0 : Math.max(0, allocatableKg - capacity)
    return { grossKg, gradeLossKg, marketableKg, committedShareKg, retainedKg, plannedAllocatableKg, allocatableKg, consentBlockedKg, constrainedKg, capacityShortfallKg }
  }

  const rows: WeeklySupplyRow[] = curve.map((share, i) => {
    const weekStart = addDays(scenario.harvestStart, i * 7)
    const weekEnd = minDate(scenario.harvestEnd, addDays(weekStart, 6))
    const base = compute(share, baseYield)
    const low = compute(share, lowYield)
    const high = compute(share, highYield)
    const caveats = [
      ...(scenario.yieldOverrideKgPerAcre == null ? ['Indicative crop yield reference, not a farm observation.'] : []),
      ...(capacity == null ? [] : [capacityCaveat]),
      ...(consentAllows ? [] : ['Farmer consent does not permit allocation in this week.']),
      ...(scenario.evidence.caveats.length ? [scenario.evidence.caveats[0]] : []),
    ]
    return {
      weekStart,
      weekEnd,
      grossKg: round(base.grossKg),
      gradeLossKg: round(base.gradeLossKg),
      marketableKg: round(base.marketableKg),
      committedShareKg: round(base.committedShareKg),
      retainedKg: round(base.retainedKg),
      plannedAllocatableKg: round(base.plannedAllocatableKg),
      allocatableKg: round(base.allocatableKg),
      consentBlockedKg: round(base.consentBlockedKg),
      capacityKg: capacity,
      constrainedKg: round(base.constrainedKg),
      capacityShortfallKg: round(base.capacityShortfallKg),
      lowKg: round(low.constrainedKg),
      highKg: round(high.constrainedKg),
      evidenceStatus: scenario.evidence.status,
      caveats: [...new Set(caveats)],
    }
  })

  const assumptions = [
    `Gross harvest = area × yield × weekly picking share (${crop.name}, ${crop.id}).`,
    'Grade loss is applied once to gross harvest. Marketable supply is not graded a second time.',
    `Committed share ${Math.round(scenario.committedShareFraction * 100)}%; retention availability factor ${Math.round(scenario.retentionFactor * 100)}%.`,
    capacityCaveat,
    'This is a planning scenario, not a calibrated probability, buyer order or guarantee.',
    `Crop reference: ${scenario.cropReferenceVersion}. Rule version: ${PROJECTION_RULE_VERSION}.`,
  ]

  return {
    scenarioId: scenario.id,
    cropName: scenario.cropName,
    variety: scenario.variety,
    grade: scenario.grade,
    plotId: scenario.plotId,
    farmerId: scenario.farmerId,
    location,
    unit: 'kg',
    weeks: rows,
    totals: totalsOf(rows),
    evidence: scenario.evidence,
    consent: scenario.consent,
    uncertainty: uncertaintyOf(scenario.evidence, scenario),
    assumptions,
    ruleVersion: PROJECTION_RULE_VERSION,
  }
}

export function applyProjectionRevision(projection: WeeklyProjection, revision: ProjectionRevision): { projection: WeeklyProjection; affectedWeeks: number } {
  const factor = 1 + revision.yieldAdjustmentPct / 100
  let affectedWeeks = 0
  const weeks = projection.weeks.map((week) => {
    if (week.weekStart < revision.effectiveFrom) return week
    affectedWeeks += 1
    const scale = (value: number) => round(value * factor)
    return {
      ...week,
      grossKg: scale(week.grossKg),
      gradeLossKg: scale(week.gradeLossKg),
      marketableKg: scale(week.marketableKg),
      committedShareKg: scale(week.committedShareKg),
      retainedKg: scale(week.retainedKg),
      plannedAllocatableKg: scale(week.plannedAllocatableKg),
      allocatableKg: scale(week.allocatableKg),
      consentBlockedKg: scale(week.consentBlockedKg),
      constrainedKg: scale(week.constrainedKg),
      capacityShortfallKg: scale(week.capacityShortfallKg),
      lowKg: scale(week.lowKg),
      highKg: scale(week.highKg),
      caveats: [...week.caveats, `Revised from ${revision.effectiveFrom}: ${revision.note || revision.observationKind} (${revision.yieldAdjustmentPct > 0 ? '+' : ''}${revision.yieldAdjustmentPct}% supply adjustment).`],
    }
  })
  return {
    projection: {
      ...projection,
      weeks,
      totals: totalsOf(weeks),
      uncertainty: {
        ...projection.uncertainty,
        caveats: [...projection.uncertainty.caveats, `Version revised from ${revision.effectiveFrom} using a cultivation observation; earlier weeks were not rewritten.`],
      },
    },
    affectedWeeks,
  }
}
