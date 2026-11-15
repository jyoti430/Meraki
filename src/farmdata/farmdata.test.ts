import { describe, expect, it } from 'vitest'
import { crops } from '../data/crops'
import { createDemoFarmIntelligenceState } from '../data/farmIntelligenceDemo'
import { demoPlots } from '../data/farmersDemo'
import { cultivationEvidence } from './evidence'
import { summariseCultivation, validateCultivationEvent } from './cultivation'
import { applyProjectionRevision, buildWeeklyProjection } from './projections'
import { publishProjectionVersion, reviseProjectionVersion } from './scenario'
import { importSoilCsv, resolveSoilEvidence, SOIL_IMPORT_HEADERS } from './soil'
import type { ConsentSnapshot, CultivationEvent, PlantingScenario, SoilSample } from './types'
import { assessWaterAccess } from './water'
import { createFixtureWeatherAdapter, importWeatherCsv, weatherEvidenceFrom, WEATHER_IMPORT_HEADERS } from './weather'
import { evaluateCropFit } from './agronomy'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const okra = crops.find((crop) => crop.id === 'okra')!
const demo = createDemoFarmIntelligenceState()
const demoScenario = demo.scenarios[0]
const soilHeader = SOIL_IMPORT_HEADERS.join(',')
const weatherHeader = WEATHER_IMPORT_HEADERS.join(',')

const consent = (status: ConsentSnapshot['status']): ConsentSnapshot => ({ status, recordedAt: '2026-10-10T08:00:00.000Z', note: 'Test consent record.' })

const soilRow = (overrides: { plot?: string; date?: string; analyte?: string; value?: string; unit?: string; source?: string } = {}) => [
  overrides.plot ?? 'PLOT-DEMO-006',
  overrides.date ?? '2026-11-02',
  '0',
  '20',
  overrides.analyte ?? 'available_n',
  overrides.value ?? '242',
  overrides.unit ?? 'mg/kg',
  'Test method',
  'DEMO-LAB-A',
  overrides.source ?? 'laboratory',
].join(',')

const weatherRow = (overrides: { date?: string; variable?: string; value?: string; unit?: string; kind?: string; issued?: string; horizon?: string; source?: string } = {}) => [
  overrides.date ?? '2026-11-17',
  overrides.variable ?? 'rainfall_mm',
  overrides.value ?? '2.4',
  overrides.unit ?? 'mm',
  overrides.kind ?? 'forecast',
  overrides.issued ?? '2026-11-16T06:00:00Z',
  overrides.horizon ?? '7',
  overrides.source ?? 'Synthetic weather fixture',
].join(',')

const baseEvent: CultivationEvent = {
  id: 'CULT-TEST-001', plotId: 'PLOT-DEMO-002', cropCycleId: null, crop: 'Okra', kind: 'fertiliser-applied', status: 'actual',
  occurredOn: '2026-11-10', plannedFor: null, product: 'Urea', activeIngredient: '', quantity: 40, unit: 'kg product',
  nutrientBasis: 'product', areaAcres: 2.96, method: 'Band placement', stage: 'Vegetative', note: 'Test record.',
  recordedAt: '2026-11-10T08:00:00.000Z',
  provenance: { sourceId: 'TEST-1', kind: 'fpo-record', label: 'Test record', organisation: 'Test FPO', capturedAt: '2026-11-10', receivedAt: '2026-11-10T08:00:00.000Z', method: 'Test', reference: 'TEST-1', synthetic: true, note: '' },
  evidence: { id: 'ignored', label: '', status: 'estimated', confidence: 'low', asOf: '2026-11-10', validUntil: null, provenance: { sourceId: 'TEST-1', kind: 'fpo-record', label: 'Test record', organisation: 'Test FPO', capturedAt: '2026-11-10', receivedAt: '2026-11-10T08:00:00.000Z', method: 'Test', reference: 'TEST-1', synthetic: true, note: '' }, caveats: [] },
  supplyImpact: null,
}

const event = (overrides: Partial<CultivationEvent>): CultivationEvent => ({ ...clone(baseEvent), ...overrides })

const forecast = (overrides: Partial<PlantingScenario> = {}): PlantingScenario => ({
  ...clone(demoScenario),
  consent: consent('opted-in'),
  logisticsCapacityKgPerWeek: null,
  ...overrides,
})

describe('soil import and evidence', () => {
  it('accepts the plot-linked template while preserving raw values and source rows', () => {
    const result = importSoilCsv([
      `${soilHeader}\nPLOT-DEMO-006,2026-11-02,0,20,available_n,242,mg/kg,Kjeldahl,DEMO-LAB-A,laboratory`,
      'PLOT-DEMO-009,2026-11-01,0,15,ph,6.4,pH,Field kit,DEMO-LAB-B,mapped-estimate',
    ].join('\n'), { knownPlotIds: ['PLOT-DEMO-006', 'PLOT-DEMO-009'], today: '2026-11-16' })
    expect(result.rejected).toEqual([])
    expect(result.accepted).toHaveLength(2)
    const measured = result.accepted.find((sample) => sample.plotId === 'PLOT-DEMO-006')!
    expect(measured.kind).toBe('laboratory')
    expect(measured.analytes[0].rawValue).toBe('242')
    expect(measured.analytes[0].rawUnit).toBe('mg/kg')
    expect(measured.sourceRows[0]).toContain('available_n,242,mg/kg,Kjeldahl')
  })

  it('rejects wrong plots, incompatible units and future observations instead of guessing', () => {
    const wrongPlot = importSoilCsv(`${soilHeader}\nPLOT-UNKNOWN,2026-11-02,0,20,available_n,242,mg/kg,Test,DEMO-LAB-A,laboratory`, { knownPlotIds: ['PLOT-DEMO-006'], today: '2026-11-16' })
    expect(wrongPlot.accepted).toHaveLength(0)
    expect(wrongPlot.rejected[0].errors.join(' ')).toContain('does not exist')

    const wrongUnit = importSoilCsv(`${soilHeader}\n${soilRow({ unit: '%' })}`, { knownPlotIds: ['PLOT-DEMO-006'], today: '2026-11-16' })
    expect(wrongUnit.accepted).toHaveLength(0)
    expect(wrongUnit.rejected[0].errors.join(' ')).toContain('incompatible with Available nitrogen')

    const future = importSoilCsv(`${soilHeader}\n${soilRow({ date: '2026-12-01' })}`, { knownPlotIds: ['PLOT-DEMO-006'], today: '2026-11-16' })
    expect(future.accepted).toHaveLength(0)
    expect(future.rejected[0].errors.join(' ')).toContain('future')
  })

  it('groups analytes with different methods into one reviewed sample', () => {
    const result = importSoilCsv([
      `${soilHeader}\nPLOT-DEMO-006,2026-11-02,0,20,ph,6.8,pH,1:2.5 soil:water,DEMO-LAB-A,laboratory`,
      'PLOT-DEMO-006,2026-11-02,0,20,available_n,242,mg/kg,Kjeldahl,DEMO-LAB-A,laboratory',
    ].join('\n'), { knownPlotIds: ['PLOT-DEMO-006'], today: '2026-11-16' })
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].analytes).toHaveLength(2)
    expect(result.accepted[0].method).toContain('1:2.5 soil:water')
    expect(result.accepted[0].method).toContain('Kjeldahl')
  })

  it('keeps mapped estimates separate and never lets them overwrite a measured result', () => {
    const lab = demo.soilSamples.find((sample) => sample.plotId === 'PLOT-DEMO-002')!
    const estimate: SoilSample = {
      ...clone(lab), id: 'SOIL-MAP-TEST', kind: 'mapped-estimate', sampledAt: '2026-11-12',
      provenance: { ...lab.provenance, kind: 'mapped-estimate', label: 'Mapped estimate', synthetic: true },
      analytes: [{ ...lab.analytes[0], value: 5.1, rawValue: '5.1' }],
    }
    const evidence = resolveSoilEvidence([...demo.soilSamples, estimate], 'PLOT-DEMO-002', '2026-11-16')
    expect(evidence.measured?.kind).toBe('laboratory')
    expect(evidence.ph).toBe(6.6)
    expect(evidence.estimates).toHaveLength(1)
    expect(evidence.caveats.join(' ')).toContain('did not overwrite the measured result')
  })

  it('does not substitute total nitrogen for available nitrogen and ignores later samples', () => {
    const totalOnly = importSoilCsv(`${soilHeader}\n${soilRow({ analyte: 'total_n', value: '1.3', unit: '%' })}`, { knownPlotIds: ['PLOT-DEMO-006'], today: '2026-11-16' })
    const sample = totalOnly.accepted[0]
    expect(sample.analytes[0].rawValue).toBe('1.3')
    expect(sample.analytes[0].rawUnit).toBe('%')
    expect(sample.analytes[0].value).toBeCloseTo(13)
    const evidence = resolveSoilEvidence([sample], 'PLOT-DEMO-006', '2026-11-16')
    expect(evidence.availableN).toBeNull()
    expect(evidence.measured).not.toBeNull()
    const later = resolveSoilEvidence([sample], 'PLOT-DEMO-006', '2026-11-01')
    expect(later.measured).toBeNull()
    expect(later.status).toBe('unknown')
  })
})

describe('weather and water evidence', () => {
  it('preserves forecast issue time and horizon and rejects undated or out-of-horizon forecasts', () => {
    const accepted = importWeatherCsv(`${weatherHeader}\n${weatherRow()}`, { today: '2026-11-16' })
    expect(accepted.errors).toEqual([])
    expect(accepted.records[0]).toMatchObject({ kind: 'forecast', issuedAt: '2026-11-16T06:00:00Z', horizonDays: 7 })
    const ref = weatherEvidenceFrom(accepted.records, '2026-11-16')
    expect(ref?.label).toContain('7-day forecast issued 2026-11-16')
    expect(ref?.validUntil).toBe('2026-11-23')

    const undated = importWeatherCsv(`${weatherHeader}\n${weatherRow({ issued: '' })}`, { today: '2026-11-16' })
    expect(undated.errors.join(' ')).toContain('require issued_at')

    const outside = importWeatherCsv(`${weatherHeader}\n${weatherRow({ date: '2026-11-26' })}`, { today: '2026-11-16' })
    expect(outside.errors.join(' ')).toContain('outside its stated horizon')

    const futureObservation = importWeatherCsv(`${weatherHeader}\n${weatherRow({ kind: 'observed', issued: '', horizon: '' })}`, { today: '2026-11-16' })
    expect(futureObservation.errors).toContainEqual(expect.stringContaining('cannot be in the future'))
  })

  it('does not treat a forecast issued after the decision date as evidence', () => {
    const imported = importWeatherCsv(`${weatherHeader}\n${weatherRow({ issued: '2026-11-17T06:00:00Z' })}`, { today: '2026-11-18' })
    expect(imported.records).toHaveLength(1)
    expect(weatherEvidenceFrom(imported.records, '2026-11-16')).toBeNull()
  })

  it('records an adapter failure as failed with no fabricated weather records', () => {
    const failed = createFixtureWeatherAdapter({ failReason: 'Injected test failure.' }).fetch({ plotId: null, decisionDate: '2026-11-16' })
    expect(failed.status).toBe('failed')
    expect(failed.records).toHaveLength(0)
    expect(failed.error).toBe('Injected test failure.')
    const ok = createFixtureWeatherAdapter().fetch({ plotId: null, decisionDate: '2026-11-16' })
    expect(ok.status).toBe('ok')
    expect(ok.records.every((record) => record.kind === 'forecast' && record.issuedAt != null && record.horizonDays === 7)).toBe(true)
  })

  it('assesses farm water from its own capacity while regional observations stay context', () => {
    const access = demo.waterAccess.find((item) => item.plotId === 'PLOT-DEMO-002')!
    const assessment = assessWaterAccess(access, okra, 1.5, { decisionDate: '2026-11-16' })
    expect(assessment.status).toBe('sufficient')
    expect(assessment.regionalObservationUsed).toBe(false)
    expect(assessment.availableSeasonM3).toBeGreaterThan(0)

    const noFarmRecord = assessWaterAccess(null, okra, 1.5, { decisionDate: '2026-11-16' })
    expect(noFarmRecord.status).toBe('unknown')
    expect(noFarmRecord.availableSeasonM3).toBeNull()
    expect(noFarmRecord.caveats.join(' ')).toContain('Regional groundwater observations do not establish')
  })

  it('treats rainfed and future-dated water records as no feasible evidence, not zero demand', () => {
    const rainfed = demo.waterAccess.find((item) => item.plotId === 'PLOT-DEMO-009')!
    const none = assessWaterAccess(rainfed, okra, 1, { decisionDate: '2026-11-16' })
    expect(none.status).toBe('none')
    expect(none.availableSeasonM3).toBe(0)
    expect(none.demandSeasonM3).toBeGreaterThan(0)

    const future = { ...clone(rainfed), id: 'WATER-FUTURE', plotId: 'PLOT-DEMO-006', source: 'borewell' as const, rights: 'documented' as const, reliability: 'assured' as const, pumpDischargeLps: 4, pumpingHoursPerDay: 8, measuredAt: '2026-11-20' }
    const unknown = assessWaterAccess(future, okra, 1, { decisionDate: '2026-11-16' })
    expect(unknown.status).toBe('unknown')
    expect(unknown.availableSeasonM3).toBeNull()
    expect(unknown.evidence).toBeNull()
  })
})

describe('cultivation records and decision-date safety', () => {
  it('keeps planned and actual records separate and reports missing inputs as unknown', () => {
    const demoEvents = demo.cultivation.filter((item) => item.plotId === 'PLOT-DEMO-002')
    const summary = summariseCultivation(demoEvents)
    expect(summary.planned.map((item) => item.kind)).toEqual(['fertiliser-planned', 'pesticide-planned'])
    expect(summary.actual.every((item) => item.kind !== 'fertiliser-planned')).toBe(true)
    expect(summary.missing).toHaveLength(0)
    expect(summary.reviewFlags.join(' ')).toContain('product mass')

    const empty = summariseCultivation([])
    expect(empty.missing.map((item) => item.category)).toEqual(['seed', 'fertiliser', 'irrigation'])
    expect(empty.caveats.join(' ')).toContain('unknown, not zero')
  })

  it('validates actual and planned dates and flags purchase as different from planting', () => {
    expect(validateCultivationEvent(event({ occurredOn: '2026-12-01' }), '2026-11-16').errors.join(' ')).toContain('future')
    expect(validateCultivationEvent(event({ status: 'planned', occurredOn: '2026-11-10', plannedFor: null }), '2026-11-16').errors.join(' ')).toContain('planned-for')
    expect(validateCultivationEvent(event({ kind: 'seed-purchased', product: 'Seed' }), '2026-11-16').warnings.join(' ')).toContain('not verified as planted')
    expect(cultivationEvidence(event({ kind: 'pesticide-applied', activeIngredient: 'Azadirachtin' })).caveats.join(' ')).toContain('does not certify residue safety')
  })

  it('does not use a later soil sample or cultivation observation in a pre-sowing evaluation', () => {
    const futureSample: SoilSample = {
      ...clone(demo.soilSamples[0]), id: 'SOIL-FUTURE', sampledAt: '2026-11-20', plotId: 'PLOT-DEMO-006',
      analytes: [{ ...clone(demo.soilSamples[0].analytes[0]), value: 9.5, rawValue: '9.5' }],
    }
    const plot = demoPlots.find((item) => item.id === 'PLOT-DEMO-006')!
    const assessment = evaluateCropFit({
      crop: okra, plot, decisionDate: '2026-11-16', plantingDate: '2026-11-18',
      soilSamples: [futureSample], waterAccess: null, weatherRecords: [],
      cultivation: [event({ id: 'CULT-FUTURE', plotId: plot.id, occurredOn: '2026-11-20' })],
      busyUntil: null, existingCycle: null, consent: consent('opted-in'),
    })
    expect(assessment.soil.measured).toBeNull()
    expect(assessment.soil.ph).toBeNull()
    expect(assessment.reasons.map((reason) => reason.text).join(' ')).not.toContain('9.5')
    expect(assessment.evidence.refs).toHaveLength(0)
  })
})

describe('weekly projections and immutable versions', () => {
  it('applies grade loss once and keeps the quantity columns additive', () => {
    const scenario = forecast()
    const projection = buildWeeklyProjection({ scenario, crop: okra, location: 'Nashik' })
    expect(projection.totals.marketableKg).toBeCloseTo(projection.totals.grossKg * scenario.gradeEligibleFraction, 0)
    expect(projection.totals.gradeLossKg).toBeCloseTo(projection.totals.grossKg - projection.totals.marketableKg, 0)
    expect(projection.totals.committedShareKg).toBeCloseTo(projection.totals.marketableKg * scenario.committedShareFraction, 0)
    expect(projection.totals.plannedAllocatableKg).toBeCloseTo(projection.totals.committedShareKg * scenario.retentionFactor, 0)
    expect(projection.totals.allocatableKg).toBeCloseTo(projection.totals.plannedAllocatableKg, 0)
    expect(projection.totals.consentBlockedKg).toBe(0)
    expect(projection.weeks.every((week) => week.marketableKg === Math.round((week.grossKg - week.gradeLossKg) * 100) / 100)).toBe(true)
  })

  it('shows low, base and high planning cases and applies logistics capacity', () => {
    const unconstrained = buildWeeklyProjection({ scenario: forecast(), crop: okra, location: 'Nashik' })
    expect(unconstrained.totals.lowKg).toBeLessThan(unconstrained.totals.allocatableKg)
    expect(unconstrained.totals.highKg).toBeGreaterThan(unconstrained.totals.allocatableKg)

    const projection = buildWeeklyProjection({ scenario: forecast({ logisticsCapacityKgPerWeek: 100 }), crop: okra, location: 'Nashik' })
    expect(projection.totals.constrainedKg).toBeLessThan(projection.totals.allocatableKg)
    expect(projection.totals.capacityShortfallKg).toBeGreaterThan(0)
    expect(projection.weeks.every((week) => week.constrainedKg <= 100)).toBe(true)
  })

  it('withholds every allocatable kilogram when consent is not opted in', () => {
    const projection = buildWeeklyProjection({ scenario: forecast({ consent: consent('opted-out') }), crop: okra, location: 'Nashik' })
    expect(projection.totals.allocatableKg).toBe(0)
    expect(projection.totals.consentBlockedKg).toBeGreaterThan(0)
    expect(projection.weeks.every((week) => week.allocatableKg === 0 && week.consentBlockedKg === week.plannedAllocatableKg)).toBe(true)
    expect(projection.uncertainty.caveats.join(' ')).toContain('consent is opted out')
  })

  it('revises only weeks on or after the effective date', () => {
    const projection = buildWeeklyProjection({ scenario: forecast(), crop: okra, location: 'Nashik' })
    const effectiveFrom = projection.weeks[3].weekStart
    const revised = applyProjectionRevision(projection, {
      id: 'REV-TEST', observationKind: 'Pest observation', observedOn: '2026-12-20', effectiveFrom,
      yieldAdjustmentPct: -10, note: 'Pest pressure', cultivationEventId: null,
    })
    projection.weeks.forEach((week, index) => {
      const next = revised.projection.weeks[index]
      if (week.weekStart < effectiveFrom) {
        expect(next.grossKg).toBe(week.grossKg)
        expect(next.allocatableKg).toBe(week.allocatableKg)
      } else {
        expect(next.grossKg).toBeCloseTo(week.grossKg * 0.9, 1)
        expect(next.allocatableKg).toBeCloseTo(week.allocatableKg * 0.9, 1)
      }
    })
    expect(revised.affectedWeeks).toBe(projection.weeks.length - 3)
  })

  it('increments version numbers, keeps history and publishes a revised version', () => {
    const state0 = createDemoFarmIntelligenceState()
    const scenario = forecast()
    const first = publishProjectionVersion(state0, { scenario, crop: okra, location: 'Nashik', consent: scenario.consent, trigger: 'scenario-change', reason: 'Refresh', createdBy: 'Tester' })
    expect(first.version.version).toBe(2)
    expect(first.version.supersedesVersionId).toBe(state0.projectionVersions[0].id)
    const second = publishProjectionVersion(first.state, { scenario, crop: okra, location: 'Nashik', consent: scenario.consent, trigger: 'evidence-update', reason: 'Evidence update', createdBy: 'Tester' })
    expect(second.version.version).toBe(3)
    expect(second.version.supersedesVersionId).toBe(first.version.id)
    expect(second.state.projectionVersions).toHaveLength(3)

    const effectiveFrom = second.version.projection.weeks[2].weekStart
    const revised = reviseProjectionVersion(second.state, {
      scenario, crop: okra, location: 'Nashik', consent: scenario.consent, createdBy: 'Tester',
      revision: { id: 'REV-TEST-2', observationKind: 'Scouting', observedOn: '2026-12-20', effectiveFrom, yieldAdjustmentPct: -8, note: 'Observed pressure', cultivationEventId: null },
    })
    expect(revised.version.version).toBe(4)
    expect(revised.version.trigger).toBe('cultivation-observation')
    expect(revised.version.revision?.effectiveFrom).toBe(effectiveFrom)
    expect(revised.affectedWeeks).toBeGreaterThan(0)
    const before = revised.version.projection.weeks[0]
    const original = second.version.projection.weeks[0]
    expect(before.grossKg).toBe(original.grossKg)
  })

  it('publishes withheld consent without allocation', () => {
    const state0 = createDemoFarmIntelligenceState()
    const scenario = forecast({ consent: consent('opted-out') })
    const published = publishProjectionVersion(state0, { scenario, crop: okra, location: 'Nashik', consent: scenario.consent, trigger: 'consent-update', reason: 'Consent withdrawn', createdBy: 'Tester' })
    expect(published.version.projection.totals.allocatableKg).toBe(0)
    expect(published.version.projection.totals.consentBlockedKg).toBeGreaterThan(0)
    expect(published.version.consent.status).toBe('opted-out')
  })
})
