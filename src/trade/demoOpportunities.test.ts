import { describe, expect, it } from 'vitest'
import { demoBid, demoOpportunities, filterDemoOpportunities } from './demoOpportunities'

describe('isolated demo opportunities', () => {
  it('filters both auction types, statuses, crops and locations', () => {
    expect(filterDemoOpportunities(demoOpportunities, ' OKRA ', 'all', 'all')).toHaveLength(1)
    expect(filterDemoOpportunities(demoOpportunities, 'mumbai', 'forward', 'open')).toHaveLength(1)
    expect(filterDemoOpportunities(demoOpportunities, '', 'spot', 'awarded')).toHaveLength(0)
    expect(filterDemoOpportunities(demoOpportunities, '', 'all', 'open')).toHaveLength(3)
  })
  it('applies opposite price directions without mutating fixture data', () => {
    const spot = demoOpportunities[0], forward = demoOpportunities[1]
    expect(demoBid(spot, spot.pricePaise + spot.stepPaise).bids).toBe(spot.bids + 1)
    expect(demoBid(forward, forward.pricePaise - forward.stepPaise).bids).toBe(forward.bids + 1)
    expect(spot.bids).toBe(4)
    expect(() => demoBid(spot, spot.pricePaise)).toThrow(/above/)
    expect(() => demoBid(forward, forward.pricePaise)).toThrow(/below/)
  })
  it('prevents offers on closed or malformed samples', () => {
    expect(() => demoBid(demoOpportunities[3], 100)).toThrow(/awarded/)
    for (const price of [0, -100, NaN, 4200.5, 10000001]) expect(() => demoBid(demoOpportunities[0], price)).toThrow(/valid positive/)
  })
})
