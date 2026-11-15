import type { CropProfile, WaterNeed } from '../data/crops'
import { daysBetween } from '../planning/format'
import type { EvidenceRef, FarmWaterAccess, RegionalWaterObservation, WaterAssessment } from './types'

/**
 * Indicative seasonal irrigation requirement per acre. These are explicit prototype assumptions,
 * not local irrigation advice. The UI and every assessment show the assumption.
 */
export const WATER_REQUIREMENT_M3_PER_ACRE: Record<WaterNeed, number> = { Low: 1400, Medium: 2400, High: 3600 }
export const WATER_ASSUMPTION_VERSION = 'water-budget-assumption-2026-11-16.1'
export const DEFAULT_SEASON_DAYS = 120
export const DEFAULT_APPLICATION_LOSS_PCT = 20

const reliabilityFactor: Record<FarmWaterAccess['reliability'], number> = { assured: 1, seasonal: 0.75, uncertain: 0.5, none: 0 }
const sourceLabel: Record<FarmWaterAccess['source'], string> = {
  borewell: 'Borewell', 'open-well': 'Open well', canal: 'Canal', 'farm-pond': 'Farm pond', rainfed: 'Rainfed only', 'shared-well': 'Shared well', other: 'Other source',
}

export function waterAccessLabel(access: FarmWaterAccess | null): string {
  return access ? `${sourceLabel[access.source]} · ${access.rights} rights` : 'No farm water access recorded'
}

export function waterAccessEvidence(access: FarmWaterAccess, decisionDate: string, maxAgeDays = 180): EvidenceRef {
  const age = Math.max(0, daysBetween(access.measuredAt, decisionDate))
  const stale = age > maxAgeDays
  const caveats: string[] = []
  if (stale) caveats.push(`Water access record is ${age} days old at the decision date (limit ${maxAgeDays} days).`)
  if (access.rights === 'reported') caveats.push('Access rights are self-reported and have not been verified.')
  if (access.rights === 'unknown') caveats.push('Water rights are unknown; capacity is not treated as assured supply.')
  if (access.source === 'rainfed') caveats.push('Rainfed only: no irrigation supply is assumed.')
  if (!access.pumpDischargeLps || !access.pumpingHoursPerDay) caveats.push('Pump discharge or pumping hours are missing; seasonal capacity is unknown.')
  return {
    id: `water-evidence-${access.id}`,
    label: `Farm water access · ${waterAccessLabel(access)}`,
    status: access.rights === 'documented' && !stale ? 'verified' : access.rights === 'reported' && !stale ? 'reported' : 'unknown',
    confidence: access.rights === 'documented' && !stale ? 'high' : access.rights === 'reported' && !stale ? 'medium' : 'low',
    asOf: access.measuredAt,
    validUntil: null,
    provenance: access.provenance,
    caveats,
  }
}

/**
 * Compare indicative crop demand with the farm's own accessible pumping capacity.
 * A regional observation-well reading is intentionally not an input to this calculation.
 */
export function assessWaterAccess(
  access: FarmWaterAccess | null,
  crop: CropProfile,
  areaAcres: number,
  options: { decisionDate: string; seasonDays?: number; applicationLossPct?: number } = { decisionDate: '2026-11-16' },
): WaterAssessment {
  const seasonDays = options.seasonDays ?? DEFAULT_SEASON_DAYS
  const lossFactor = 1 - (options.applicationLossPct ?? DEFAULT_APPLICATION_LOSS_PCT) / 100
  const assumptions = [
    `Indicative ${crop.waterNeed.toLowerCase()}-water crop requirement: ${WATER_REQUIREMENT_M3_PER_ACRE[crop.waterNeed]} m³/acre over ${seasonDays} days (${WATER_ASSUMPTION_VERSION}).`,
    `${options.applicationLossPct ?? DEFAULT_APPLICATION_LOSS_PCT}% application loss is deducted before comparing supply with demand.`,
    'Local crop coefficients, effective rainfall and irrigation advice require adviser review.',
  ]
  if (!access) {
    return {
      status: 'unknown', availableSeasonM3: null, demandSeasonM3: null, coveragePct: null, source: null, rights: 'unknown', reliability: 'none',
      regionalObservationUsed: false, assumptions,
      caveats: ['No farm water access record. Regional groundwater observations do not establish this farm’s supply.'],
      evidence: null,
    }
  }
  const demandSeasonM3 = Math.max(0, areaAcres) * WATER_REQUIREMENT_M3_PER_ACRE[crop.waterNeed]
  if (access.measuredAt > options.decisionDate) {
    return {
      status: 'unknown', availableSeasonM3: null, demandSeasonM3, coveragePct: null, source: access.source, rights: access.rights, reliability: access.reliability,
      regionalObservationUsed: false, assumptions,
      caveats: ['The farm water access record is dated after the decision date. It cannot be used in a pre-sowing evaluation and is not treated as evidence.'],
      evidence: null,
    }
  }
  const evidence = waterAccessEvidence(access, options.decisionDate)
  if (access.rights === 'none' || access.source === 'rainfed' || access.reliability === 'none') {
    return {
      status: 'none', availableSeasonM3: 0, demandSeasonM3, coveragePct: 0, source: access.source, rights: access.rights, reliability: access.reliability,
      regionalObservationUsed: false, assumptions,
      caveats: [...evidence.caveats, 'No irrigation supply is assumed from this record; crop feasibility needs a reviewed water plan.'],
      evidence,
    }
  }
  if (access.rights === 'unknown' || access.pumpDischargeLps == null || access.pumpingHoursPerDay == null || access.reliability === 'uncertain') {
    return {
      status: 'unknown', availableSeasonM3: null, demandSeasonM3, coveragePct: null, source: access.source, rights: access.rights, reliability: access.reliability,
      regionalObservationUsed: false, assumptions,
      caveats: [...evidence.caveats, 'Actual access, pump capacity or seasonal reliability is incomplete; water feasibility is unknown, not assumed.'],
      evidence,
    }
  }
  const dailyM3 = access.pumpDischargeLps * access.pumpingHoursPerDay * 3.6
  const sharedPct = access.sharedAllocationPct == null ? 100 : Math.max(0, Math.min(100, access.sharedAllocationPct))
  const availableBeforeLoss = dailyM3 * seasonDays * reliabilityFactor[access.reliability] * (sharedPct / 100) + Math.max(0, access.storageM3 ?? 0)
  const availableSeasonM3 = Math.max(0, availableBeforeLoss * lossFactor)
  const coveragePct = demandSeasonM3 > 0 ? availableSeasonM3 / demandSeasonM3 : null
  const sufficient = demandSeasonM3 <= 0 || availableSeasonM3 >= demandSeasonM3 * 0.95
  return {
    status: sufficient ? 'sufficient' : 'shortfall',
    availableSeasonM3,
    demandSeasonM3,
    coveragePct,
    source: access.source,
    rights: access.rights,
    reliability: access.reliability,
    regionalObservationUsed: false,
    assumptions,
    caveats: [...evidence.caveats, ...(sufficient ? [] : ['Indicative seasonal supply is below the indicative crop requirement; review the water plan before committing production.'])],
    evidence,
  }
}

export function regionalWaterCaveats(observation: RegionalWaterObservation): string[] {
  return [
    ...observation.caveats,
    'A regional observation-well depth is context only. It is not the farm’s well depth, pump discharge or a guarantee of irrigation.',
  ]
}
