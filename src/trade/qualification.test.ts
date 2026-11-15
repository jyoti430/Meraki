import { describe, expect, it } from 'vitest'
import { forwardCapacityOptions } from './qualification'

const auction = { crop: 'okra', variety: 'okra', grade: 'A', grade_protocol: 'export-v1', quantity_g: 1000, delivery_start: '2026-12-01T00:00:00Z', delivery_end: '2026-12-02T00:00:00Z', bids: [] }
const capacity = { id: 'capacity-a', crop: 'okra', variety: 'okra', grade: 'A', grade_protocol: 'export-v1', available_g: 1000, consented: true, reviewed: true, delivery_start: '2026-11-01T00:00:00Z', delivery_end: '2027-01-01T00:00:00Z' }

describe('forward capacity selection', () => {
  it('requires full compatible, consented and reviewed whole-request coverage', () => {
    expect(forwardCapacityOptions(auction, [capacity], 'fpo-a')).toHaveLength(1)
    for (const change of [{ consented: false }, { reviewed: false }, { variety: 'other' }, { grade_protocol: 'different' }, { available_g: 999 }, { delivery_end: '2026-12-01T00:00:00Z' }]) {
      expect(forwardCapacityOptions(auction, [{ ...capacity, ...change }], 'fpo-a')).toHaveLength(0)
    }
  })
  it('allows an improved offer to reuse its own released-and-replaced reservation', () => {
    const ownOffer = { capacity_id: capacity.id, organisation_id: 'fpo-a', status: 'active' }
    expect(forwardCapacityOptions({ ...auction, bids: [ownOffer] }, [{ ...capacity, available_g: 0 }], 'fpo-a')).toHaveLength(1)
    expect(forwardCapacityOptions({ ...auction, bids: [ownOffer] }, [{ ...capacity, available_g: 0 }], 'fpo-b')).toHaveLength(0)
    expect(forwardCapacityOptions({ ...auction, bids: [{ ...ownOffer, status: 'superseded' }] }, [{ ...capacity, available_g: 0 }], 'fpo-a')).toHaveLength(0)
  })
})
