import { describe, expect, it } from 'vitest'
import { getAgriculturalPlanningEvidence } from './agriculturalEvidence'

describe('agricultural evidence adapter', () => {
  it('returns a regional yield baseline with provenance and a global reference-only suitability envelope', () => {
    const evidence = getAgriculturalPlanningEvidence('okra')

    expect(evidence.region).toEqual({
      country: 'India',
      state: 'Maharashtra',
      administrativeLevel: 'state',
    })
    expect(evidence.regionalYield.status).toBe('available')
    if (evidence.regionalYield.status === 'available') {
      expect(evidence.regionalYield.value.sampleCount).toBe(3)
      expect(evidence.regionalYield.value.planningScenarios.expectedKgPerAcre).toBe(3953.57)
      expect(evidence.regionalYield.provenance[0]).toMatchObject({
        datasetId: 'nhb-maharashtra-horticulture-2018',
        table: '7.3.27',
        printedPage: 195,
      })
    }

    expect(evidence.cropSuitability.status).toBe('reference_only')
    if (evidence.cropSuitability.status === 'reference_only') {
      expect(evidence.cropSuitability.value.scope).toBe('global_species_reference')
      expect(evidence.cropSuitability.value.environment.soilPh.optimal).toEqual([5.5, 7])
      expect(evidence.cropSuitability.value.environment.irrigationRequirement).toBeNull()
    }
    expect(evidence.historicalMarket.status).toBe('unavailable')
    expect(evidence.buyerDemand.status).toBe('synthetic_demo_only')
  })

  it('accepts optional farm conditions without requiring them', () => {
    const evidence = getAgriculturalPlanningEvidence('tomato', {
      soil: { ph: 6.2, type: 'Loamy' },
    })

    expect(evidence.optionalFarmConditions).toEqual({
      status: 'provided',
      value: { soil: { ph: 6.2, type: 'Loamy' } },
    })
  })
})
