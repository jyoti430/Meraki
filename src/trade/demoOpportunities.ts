/** Illustrative records, never API identifiers or proof of available crops. */
export type DemoOpportunity = {
  id: string; crop: string; variety: string; organisation: string; location: string;
  mode: 'spot' | 'forward'; status: 'open' | 'awarded'; quantityKg: number;
  pricePaise: number; stepPaise: number; bids: number; delivery: string;
}
export const demoOpportunities: readonly DemoOpportunity[] = [
  { id: 'demo-okra', crop: 'Okra', variety: 'Hybrid · grade A', organisation: 'Demo Sahyadri FPO', location: 'Nashik packhouse', mode: 'spot', status: 'open', quantityKg: 1200, pricePaise: 4200, stepPaise: 100, bids: 4, delivery: '7–9 December · sample window' },
  { id: 'demo-chilli', crop: 'Green chilli', variety: 'G4 · grade A', organisation: 'Demo Coastline Exports', location: 'Mumbai collection hub', mode: 'forward', status: 'open', quantityKg: 2500, pricePaise: 6500, stepPaise: 100, bids: 3, delivery: '14–20 December · sample window' },
  { id: 'demo-tomato', crop: 'Tomato', variety: 'Abhinav · grade A', organisation: 'Demo Green Valley FPO', location: 'Pune packhouse', mode: 'spot', status: 'open', quantityKg: 1800, pricePaise: 2800, stepPaise: 50, bids: 6, delivery: '10–12 December · sample window' },
  { id: 'demo-onion', crop: 'Red onion', variety: 'Nashik red · grade A', organisation: 'Demo Harvest Exports', location: 'Nashik collection hub', mode: 'forward', status: 'awarded', quantityKg: 5000, pricePaise: 3200, stepPaise: 50, bids: 8, delivery: '21–27 December · sample window' },
]
export function filterDemoOpportunities(items: readonly DemoOpportunity[], query: string, mode: string, status: string) {
  const search = query.trim().toLowerCase()
  return items.filter(item => (mode === 'all' || item.mode === mode) && (status === 'all' || item.status === status)
    && `${item.crop} ${item.variety} ${item.organisation} ${item.location}`.toLowerCase().includes(search))
}
export function demoBid(item: DemoOpportunity, pricePaise: number): DemoOpportunity {
  if (item.status !== 'open') throw new Error('This demo opportunity is already awarded.')
  if (!Number.isSafeInteger(pricePaise) || pricePaise <= 0 || pricePaise > 10_000_000) throw new Error('Enter a valid positive price.')
  if (item.mode === 'spot' ? pricePaise < item.pricePaise + item.stepPaise : pricePaise > item.pricePaise - item.stepPaise) {
    throw new Error(`Your demo offer must be at least ₹${(item.stepPaise / 100).toFixed(2)} ${item.mode === 'spot' ? 'above' : 'below'} the displayed price.`)
  }
  return { ...item, pricePaise, bids: item.bids + 1 }
}
