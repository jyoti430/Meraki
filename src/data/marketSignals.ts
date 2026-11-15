// SYNTHETIC market signals for the Meraki prototype.
// These are illustrative forecast scenarios, not real market intelligence or price predictions.
// In production they would come from mandi arrival/price history (e.g. Agmarknet) and buyer surveys.

export type Market = 'India' | 'Singapore'
export type DemandOutlook = 'Higher than usual' | 'Similar to usual' | 'Lower than usual'
export type RegionalSupply = 'Tight' | 'Balanced' | 'Oversupply risk'
export type Confidence = 'Low' | 'Medium' | 'High'

export interface MarketSignal {
  id: string
  crop: string
  market: Market
  marketLabel: string
  window: string
  demandOutlook: DemandOutlook
  regionalSupply: RegionalSupply
  /** Indicative farm-gate price band, INR per kg. */
  priceBandInr: [number, number]
  confidence: Confidence
  reason: string
}

export const marketSignals: MarketSignal[] = [
  { id: 'SIG-01', crop: 'Okra', market: 'Singapore', marketLabel: 'Singapore importers', window: 'Feb – Mar 2027', demandOutlook: 'Higher than usual', regionalSupply: 'Balanced', priceBandInr: [70, 95], confidence: 'Medium', reason: 'Scenario: importers looking to add Indian suppliers for winter months.' },
  { id: 'SIG-02', crop: 'Okra', market: 'India', marketLabel: 'Pune & Mumbai wholesale', window: 'Feb – Mar 2027', demandOutlook: 'Similar to usual', regionalSupply: 'Balanced', priceBandInr: [28, 40], confidence: 'Medium', reason: 'Scenario: arrivals in line with previous three seasons.' },
  { id: 'SIG-03', crop: 'Green chilli', market: 'India', marketLabel: 'Mumbai wholesale', window: 'Feb – Apr 2027', demandOutlook: 'Higher than usual', regionalSupply: 'Tight', priceBandInr: [35, 60], confidence: 'Low', reason: 'Scenario: lower planted area reported in neighbouring districts.' },
  { id: 'SIG-04', crop: 'Drumstick', market: 'Singapore', marketLabel: 'Singapore importers', window: 'May – Jun 2027', demandOutlook: 'Higher than usual', regionalSupply: 'Tight', priceBandInr: [110, 150], confidence: 'Low', reason: 'Scenario: few FPOs supply export-grade drumstick in summer.' },
  { id: 'SIG-05', crop: 'Baby corn', market: 'Singapore', marketLabel: 'Singapore food service', window: 'Feb – Mar 2027', demandOutlook: 'Similar to usual', regionalSupply: 'Balanced', priceBandInr: [120, 160], confidence: 'Medium', reason: 'Scenario: steady restaurant demand; buyers prefer consistent weekly volumes.' },
  { id: 'SIG-06', crop: 'Bitter gourd', market: 'Singapore', marketLabel: 'Singapore Indian grocers', window: 'Feb – Mar 2027', demandOutlook: 'Similar to usual', regionalSupply: 'Balanced', priceBandInr: [60, 85], confidence: 'Low', reason: 'Scenario: niche but stable demand from community grocers.' },
  { id: 'SIG-07', crop: 'Tomato', market: 'India', marketLabel: 'Pune & Nashik wholesale', window: 'Feb – Mar 2027', demandOutlook: 'Similar to usual', regionalSupply: 'Oversupply risk', priceBandInr: [8, 20], confidence: 'Medium', reason: 'Scenario: high nursery sales suggest many farmers are planting at once.' },
  { id: 'SIG-08', crop: 'Onion', market: 'India', marketLabel: 'Lasalgaon & Pune wholesale', window: 'Mar – May 2027', demandOutlook: 'Lower than usual', regionalSupply: 'Oversupply risk', priceBandInr: [12, 22], confidence: 'Medium', reason: 'Scenario: large stored stock expected to reach markets with the new crop.' },
  { id: 'SIG-09', crop: 'Mango', market: 'Singapore', marketLabel: 'Singapore importers', window: 'Apr – May 2027', demandOutlook: 'Higher than usual', regionalSupply: 'Balanced', priceBandInr: [160, 210], confidence: 'Medium', reason: 'Scenario: early-season Alphonso enquiries from existing buyers.' },
]
