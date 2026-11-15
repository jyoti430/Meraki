import type { CropProfile } from '../data/crops'
import type { CropCycle, Plot } from '../types'
import { plotAcres } from '../planning/engine'
import type { CultivationEvent, ConsentSnapshot, EvidenceSummary, FarmWaterAccess, SoilSample, SoilEvidence, WaterAssessment, WeatherRecord } from './types'
import { resolveSoilEvidence } from './soil'
import { assessWaterAccess } from './water'
import { buildScenarioEvidence } from './evidence'
import type { EvidenceRef } from './types'
import { AGRONOMY_RULE_VERSION } from './types'

export type FarmReasonTone = 'good' | 'caution' | 'block'
export interface FarmReason {
  tone: FarmReasonTone
  code: string
  text: string
  evidenceRefId?: string
}

export interface CropFitAssessment {
  fit: 'good' | 'caution' | 'unsuitable'
  reasons: FarmReason[]
  soil: SoilEvidence
  water: WaterAssessment
  evidence: EvidenceSummary
  ruleVersion: string
}

export interface CropFitInput {
  crop: CropProfile
  plot: Plot
  decisionDate: string
  plantingDate: string
  soilSamples: SoilSample[]
  waterAccess: FarmWaterAccess | null
  weatherRecords: WeatherRecord[]
  cultivation: CultivationEvent[]
  busyUntil: string | null
  existingCycle: CropCycle | null
  consent: ConsentSnapshot
  areaAcres?: number
}

const within = (value: number, low: number, high: number) => value >= low && value <= high
const shortDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/**
 * Explainable pre-sowing screen. It uses only records available at the decision date,
 * separates verified/reported/estimated/unknown evidence, and never silently fills gaps.
 */
export function evaluateCropFit(input: CropFitInput): CropFitAssessment {
  const reasons: FarmReason[] = []
  const areaAcres = input.areaAcres ?? plotAcres(input.plot)
  const soil = resolveSoilEvidence(input.soilSamples, input.plot.id, input.decisionDate)
  const water = assessWaterAccess(input.waterAccess, input.crop, areaAcres, { decisionDate: input.decisionDate })
  const eventsAtDecision = input.cultivation.filter((event) => event.plotId === input.plot.id && (event.occurredOn ?? event.plannedFor ?? '9999-12-31') <= input.decisionDate)
  const evidence = buildScenarioEvidence({ soil, weatherRecords: input.weatherRecords, water, events: eventsAtDecision, decisionDate: input.decisionDate })

  if (input.consent.status !== 'opted-in') {
    reasons.push({ tone: 'block', code: 'consent', text: `Farmer consent is ${input.consent.status.replace(/-/g, ' ')}. No production may be proposed or committed.` })
  } else {
    reasons.push({ tone: 'good', code: 'consent', text: `Farmer opted in${input.consent.recordedAt ? ` on ${shortDate(input.consent.recordedAt.slice(0, 10))}` : ''}.` })
  }

  if (input.crop.perennial) reasons.push({ tone: 'block', code: 'perennial', text: 'Perennial crop: new planting does not create marketable supply in this season.' })

  if (input.busyUntil && input.busyUntil >= input.plantingDate) {
    reasons.push({ tone: 'block', code: 'timing', text: `Plot is occupied by ${input.existingCycle?.crop ?? 'another crop'} until ${shortDate(input.busyUntil)}.` })
  } else {
    reasons.push({ tone: 'good', code: 'timing', text: 'Plot is not occupied by an overlapping active cycle.' })
  }

  if (water.status === 'sufficient') {
    reasons.push({ tone: 'good', code: 'water', text: `Farm irrigation capacity covers the indicative seasonal requirement (${Math.round((water.coveragePct ?? 0) * 100)}%).` })
  } else if (water.status === 'shortfall' || water.status === 'none') {
    reasons.push({ tone: 'block', code: 'water', text: `${water.status === 'none' ? 'No usable irrigation supply is recorded' : 'Farm irrigation capacity is below the indicative crop requirement'}; water feasibility fails.` })
  } else {
    reasons.push({ tone: 'caution', code: 'water', text: 'Actual water access or pumping capacity is unknown. A regional observation-well reading does not prove farm supply.' })
  }

  if (!soil.measured) {
    reasons.push({
      tone: 'caution',
      code: 'soil-evidence',
      text: soil.estimates.length
        ? 'Only mapped soil estimates exist; they are not laboratory measurements and remain unverified.'
        : 'No soil sample exists at the decision date. Soil condition is unknown, not zero.',
    })
  } else {
    const ref: EvidenceRef = soil.refs[0]
    if (soil.status === 'stale') reasons.push({ tone: 'caution', code: 'soil-stale', text: `Latest measured soil sample is stale at the decision date (${shortDate(soil.measured.sampledAt)}).`, evidenceRefId: ref.id })
    else reasons.push({ tone: 'good', code: 'soil-evidence', text: `${soil.measured.kind === 'laboratory' ? 'Laboratory' : 'Field'} soil evidence from ${shortDate(soil.measured.sampledAt)} (${soil.measured.depthFromCm}–${soil.measured.depthToCm} cm).`, evidenceRefId: ref.id })
    if (soil.ph == null) reasons.push({ tone: 'caution', code: 'soil-ph-missing', text: 'pH is missing from the measured sample; suitability remains partially unknown.' })
    else if (within(soil.ph, input.crop.phRange[0], input.crop.phRange[1])) reasons.push({ tone: 'good', code: 'soil-ph', text: `Measured pH ${soil.ph} is within the ${input.crop.phRange[0]}–${input.crop.phRange[1]} reference range.` })
    else reasons.push({ tone: 'caution', code: 'soil-ph', text: `Measured pH ${soil.ph} is outside the ${input.crop.phRange[0]}–${input.crop.phRange[1]} reference range; amendment advice needs local review.` })
  }

  const soilType = input.plot.soilType.trim()
  if (!soilType) reasons.push({ tone: 'caution', code: 'soil-type', text: 'Soil type is not recorded.' })
  else if (input.crop.suitableSoils.some((s) => s.toLowerCase() === soilType.toLowerCase())) reasons.push({ tone: 'good', code: 'soil-type', text: `${soilType} is listed as suitable for ${input.crop.name.toLowerCase()}.` })
  else reasons.push({ tone: 'caution', code: 'soil-type', text: `${soilType} is not in the indicative suitable-soil list for ${input.crop.name.toLowerCase()}.` })

  if (!evidence.refs.some((r) => r.id.startsWith('weather-evidence-'))) reasons.push({ tone: 'caution', code: 'weather', text: 'No forecast evidence is available at the decision date.' })

  const fit: CropFitAssessment['fit'] = reasons.some((r) => r.tone === 'block') ? 'unsuitable' : reasons.some((r) => r.tone === 'caution') ? 'caution' : 'good'
  return { fit, reasons, soil, water, evidence, ruleVersion: AGRONOMY_RULE_VERSION }
}
