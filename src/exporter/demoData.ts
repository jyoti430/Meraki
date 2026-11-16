import type { FulfilmentStatus, ProcurementRequirement, SupplyProjectionExample } from './types'

export const DEMO_REQUIREMENTS: ProcurementRequirement[] = [
  {
    id: 'DEMO-REQ-2101', crop: 'Okra', variety: 'Arka Anamika', quantityKg: 2400, grade: 'Export grade A',
    criteria: [
      { id: 'c-2101-1', attribute: 'Pod length', unit: 'cm', minimum: '8', maximum: '12', required: true, notes: 'Example buyer preference; not a universal standard.' },
      { id: 'c-2101-2', attribute: 'Visible defects', unit: '%', maximum: '3', required: true, notes: 'Illustrative only.' },
    ], packaging: 'Vented cartons (example)', destination: 'Singapore (demo destination)', requiredBy: '2026-12-18',
    notes: 'Synthetic example requirement. No buyer or order is represented.', status: 'active', source: 'synthetic-demo', updatedAt: '2026-11-16T09:00:00.000Z',
  },
  {
    id: 'DEMO-REQ-2102', crop: 'Tomato', variety: 'Arka Rakshak', quantityKg: 1600, grade: 'Grade A (example)',
    criteria: [{ id: 'c-2102-1', attribute: 'Maturity', unit: 'stage', minimum: 'breaker', maximum: 'turning', required: true, notes: 'Example specification only.' }],
    packaging: 'Buyer packing to be agreed (example)', destination: 'Singapore (demo destination)', requiredBy: '2026-12-22',
    notes: 'Synthetic example requirement. No buyer or order is represented.', status: 'active', source: 'synthetic-demo', updatedAt: '2026-11-16T09:00:00.000Z',
  },
]

export const DEMO_SUPPLY_PROJECTIONS: SupplyProjectionExample[] = [
  {
    id: 'DEMO-SUP-3101', fpoLabel: 'Synthetic FPO Alpha', region: 'Pune region · synthetic', crop: 'Okra', variety: 'Arka Anamika',
    projectedKg: 5200, lowKg: 4600, highKg: 5900, deliveryWeek: 'Week of 7 Dec 2026', grade: 'Grade A (example)',
    qualitySummary: 'No lot inspection is represented.', evidenceSummary: 'No evidence attached to this synthetic fixture.',
    uncertaintySummary: 'Illustrative range; not calibrated.', consentSummary: 'Consent and marketplace eligibility are not evaluated in demo data.',
  },
  {
    id: 'DEMO-SUP-3102', fpoLabel: 'Synthetic FPO Beta', region: 'Nashik region · synthetic', crop: 'Tomato', variety: 'Arka Rakshak',
    projectedKg: 3800, lowKg: 3000, highKg: 4400, deliveryWeek: 'Week of 14 Dec 2026', grade: 'Grade A (example)',
    qualitySummary: 'No lot inspection is represented.', evidenceSummary: 'No evidence attached to this synthetic fixture.',
    uncertaintySummary: 'Illustrative range; not calibrated.', consentSummary: 'Consent and marketplace eligibility are not evaluated in demo data.',
  },
  {
    id: 'DEMO-SUP-3103', fpoLabel: 'Synthetic FPO Gamma', region: 'Satara region · synthetic', crop: 'Okra', variety: 'Parbhani Kranti',
    projectedKg: 2700, lowKg: 2100, highKg: 3200, deliveryWeek: 'Week of 14 Dec 2026', grade: 'Grade B (example)',
    qualitySummary: 'No lot inspection is represented.', evidenceSummary: 'No evidence attached to this synthetic fixture.',
    uncertaintySummary: 'Illustrative range; not calibrated.', consentSummary: 'Consent and marketplace eligibility are not evaluated in demo data.',
  },
]

export const FULFILMENT_STAGES: FulfilmentStatus[] = [
  { stage: 'Procurement requirement', availability: 'partially-supported', detail: 'Synthetic examples and browser-local drafts only; no shared exporter demand endpoint.' },
  { stage: 'Reservation', availability: 'partially-supported', detail: 'Part 2 API exists, but requires authenticated organisation access; this portal has no identity provider.' },
  { stage: 'Order confirmation', availability: 'not-integrated', detail: 'Part 3 contract confirmation is not integrated in this repository.' },
  { stage: 'Quality inspection', availability: 'not-integrated', detail: 'No live QC records are connected.' },
  { stage: 'Dispatch and transit', availability: 'not-integrated', detail: 'No shipment or tracking feed is connected.' },
  { stage: 'Acceptance, claims and settlement', availability: 'not-integrated', detail: 'Part 3 acceptance, dispute and settlement services are not connected.' },
]

export const DEMO_ACTIVITY = [
  { id: 'activity-1', title: 'Synthetic okra requirement sample', detail: 'DEMO-REQ-2101 · not a live buyer request', time: 'Example activity' },
  { id: 'activity-2', title: 'Projected supply sample added', detail: 'DEMO-SUP-3101 · not harvested or reserved stock', time: 'Example activity' },
  { id: 'activity-3', title: 'Order lifecycle feed unavailable', detail: 'Live Part 3 integration is pending', time: 'Current integration status' },
]
