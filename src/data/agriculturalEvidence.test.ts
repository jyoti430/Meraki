import { describe, expect, it } from 'vitest'
import {
  getAgriculturalPlanningEvidence,
  validateFarmConditionProfile,
  type FarmConditionProfile,
} from './agriculturalEvidence'

const validFarmConditions: FarmConditionProfile = {
  soilType: {
    status: 'measured',
    value: 'Loamy',
    measuredAt: '2026-08-12',
    source: 'lab_test',
    sourceReference: 'FPO soil sample record',
  },
  soilPh: { status: 'measured', value: 6.8, measuredAt: '2026-08-12', source: 'lab_test' },
  irrigationAvailability: { status: 'measured', value: 'limited', measuredAt: '2026-08-12', source: 'farmer_report' },
  irrigationReliability: { status: 'measured', value: 'seasonal', measuredAt: '2026-08-12', source: 'farmer_report' },
  irrigationType: { status: 'measured', value: 'Drip', measuredAt: '2026-08-12', source: 'fpo_record' },
  soilMoisturePercent: { status: 'unknown', reason: 'No sensor or lab result is available for this plot.' },
}

describe('agricultural evidence adapter', () => {
  it('keeps historical state yield, recent state yields, national output and market history separate', () => {
    const evidence = getAgriculturalPlanningEvidence('tomato')

    expect(evidence.region).toEqual({
      country: 'India',
      state: 'Maharashtra',
      administrativeLevel: 'state',
    })
    expect(evidence.regionalYield.status).toBe('available')
    if (evidence.regionalYield.status === 'available') {
      expect(evidence.regionalYield.value.sampleCount).toBe(3)
      expect(evidence.regionalYield.value.dataQuality.latestYieldYear).toBe('2017-18')
      expect(evidence.regionalYield.value.dataQuality.freshness).toBe('stale_historical_reference')
      expect(evidence.regionalYield.provenance[0].datasetId).toBe('nhb-maharashtra-horticulture-2018')
      expect(evidence.regionalYield.value.recentSourceSeries).toHaveLength(1)
      expect(evidence.regionalYield.value.recentSourceSeries[0]).toMatchObject({
        datasetId: 'des-agricultural-statistics-2024-horticulture',
        geography: { state: 'Maharashtra', administrativeLevel: 'state' },
        observedYears: ['2023-24', '2024-25'],
        sampleCount: 2,
      })
    }

    expect(evidence.regionalHorticulture.status).toBe('available')
    if (evidence.regionalHorticulture.status === 'available') {
      const stateYieldRecords = evidence.regionalHorticulture.value.filter(
        (item) => item.source.datasetId === 'des-agricultural-statistics-2024-horticulture',
      )
      expect(stateYieldRecords).toHaveLength(2)
      expect(stateYieldRecords.map((item) => item.yieldKgPerHectare)).toEqual([24_118.96, 24_118.96])
      expect(evidence.regionalHorticulture.value).toContainEqual(expect.objectContaining({
        year: '2024-25',
        areaHectares: 55_000,
        productionTonnes: null,
        yieldKgPerHectare: null,
        estimateStatus: 'final_advance_as_reported_in_section_7_8',
      }))
      expect(stateYieldRecords.map((item) => item.estimateStatus)).toEqual([
        'final',
        'first_advance',
      ])
    }

    expect(evidence.nationalProductionContext.status).toBe('available')
    if (evidence.nationalProductionContext.status === 'available') {
      const tomato2025_26 = evidence.nationalProductionContext.value.filter((item) => item.year === '2025-26')
      expect(tomato2025_26.map((item) => item.estimateStatus)).toEqual(['first_advance', 'second_advance'])
      expect(tomato2025_26.map((item) => item.productionTonnes)).toEqual([22_702_000, 21_461_000])
      const recentDesHistory = evidence.nationalProductionContext.value.filter(
        (item) => item.source.datasetId === 'des-agricultural-statistics-2024-horticulture',
      )
      expect(recentDesHistory).toHaveLength(7)
      expect(recentDesHistory[0].year).toBe('2018-19')
      expect(recentDesHistory[recentDesHistory.length - 1]).toMatchObject({
        year: '2024-25',
        estimateStatus: 'first_advance',
      })
    }

    expect(evidence.historicalMarket.status).toBe('available')
    if (evidence.historicalMarket.status === 'available') {
      expect(evidence.historicalMarket.value.coverage).toMatchObject({
        observationCount: 235,
        marketCount: 47,
        earliestDate: '2026-11-08',
        latestDate: '2026-11-15',
      })
      expect(evidence.historicalMarket.value.snapshot).toMatchObject({ distinctReportingDates: 8 })
      expect(evidence.historicalMarket.value.indicators.length).toBeGreaterThan(0)
      expect(evidence.historicalMarket.value.indicators[0].interpretation).toContain('Short-window')
    }
    expect(evidence.buyerDemand.status).toBe('synthetic_demo_only')
  })

  it('returns no current Maharashtra crop production or yield for Okra', () => {
    const evidence = getAgriculturalPlanningEvidence('okra')
    expect(evidence.regionalHorticulture.status).toBe('unavailable')
    expect(evidence.nationalProductionContext.status).toBe('available')
    if (evidence.nationalProductionContext.status === 'available') {
      const desHistory = evidence.nationalProductionContext.value.filter(
        (item) => item.source.datasetId === 'des-agricultural-statistics-2024-horticulture',
      )
      const lastObservation = desHistory[desHistory.length - 1]
      expect(lastObservation).toMatchObject({
        year: '2024-25',
        estimateStatus: 'first_advance',
        geography: { country: 'India', administrativeLevel: 'country' },
      })
    }
    expect(evidence.historicalMarket.status).toBe('unavailable')
    if (evidence.historicalMarket.status === 'unavailable') {
      expect(evidence.historicalMarket.reason).toContain('No MSAMB or AGMARKNET')
    }
  })

  it('provides historical weather at reference points and keeps forecasts unavailable', () => {
    const evidence = getAgriculturalPlanningEvidence('green-chilli')
    expect(evidence.historicalWeather.status).toBe('available')
    if (evidence.historicalWeather.status === 'available') {
      expect(evidence.historicalWeather.value.observations).toHaveLength(6576)
      expect(evidence.historicalWeather.value.seasonalIndicators).toHaveLength(18)
      expect(evidence.historicalWeather.value.seasonalIndicators[0]).toMatchObject({
        year: '2020',
        expectedDays: 122,
        rainfallComplete: true,
      })
      expect(evidence.historicalWeather.value.scopeNote).toContain('not farm or district observations')
    }
    expect(evidence.weatherForecast.status).toBe('unavailable')
  })

  it('validates sourced farm conditions while allowing explicit unknown measurements', () => {
    expect(validateFarmConditionProfile(validFarmConditions)).toMatchObject({ valid: true })
    const evidence = getAgriculturalPlanningEvidence('tomato', validFarmConditions)
    expect(evidence.farmConditions).toMatchObject({
      status: 'provided',
      recordKind: 'farm_measurement_or_farmer_report',
      value: { soilMoisturePercent: { status: 'unknown' } },
    })
  })

  it('rejects out-of-range or provenance-free farm measurements', () => {
    const invalid = {
      ...validFarmConditions,
      soilPh: { status: 'measured', value: 15, measuredAt: 'not-a-date', source: 'unsupported' },
    } as unknown as FarmConditionProfile
    const result = validateFarmConditionProfile(invalid)
    expect(result.valid).toBe(false)
    const evidence = getAgriculturalPlanningEvidence('tomato', invalid)
    expect(evidence.farmConditions.status).toBe('invalid')
  })
})
