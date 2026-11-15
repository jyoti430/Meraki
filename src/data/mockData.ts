import type { Activity, PendingAction, SummaryMetric } from '../types'

// All figures and activity below are synthetic demo data for the hackathon prototype.
export const summaryMetrics: SummaryMetric[] = [
  { label: 'Active Buyer Orders', value: '12', note: 'Across 8 buyer programmes', icon: 'orders' },
  { label: 'Estimated Supply', value: '184.5 t', note: 'Planned for the next 30 days', icon: 'supply' },
  { label: 'Lots Awaiting Inspection', value: '7', note: 'Across 3 collection points', icon: 'inspection' },
  { label: 'Lots On Hold', value: '2', note: 'Follow-up required', icon: 'hold' },
  { label: 'Shipments In Transit', value: '4', note: 'Last updated today', icon: 'shipment' },
  { label: 'Pending Settlements', value: '18', note: 'Awaiting reconciliation', icon: 'settlement' },
]

export const recentActivities: Activity[] = [
  { id: 'ACT-1042', event: 'Buyer order created', reference: 'ORD-DEMO-024 · Alphonso mango', time: 'Today, 10:42 AM', status: 'In progress' },
  { id: 'ACT-1041', event: 'Lot received', reference: 'LOT-DEMO-118 · 2.4 t', time: 'Today, 9:18 AM', status: 'Completed' },
  { id: 'ACT-1040', event: 'Laboratory report pending', reference: 'LOT-DEMO-115 · Residue screen', time: 'Today, 8:36 AM', status: 'Pending' },
  { id: 'ACT-1039', event: 'Shipment dispatched', reference: 'SHP-DEMO-041 · 12 crates', time: 'Yesterday, 4:12 PM', status: 'In progress' },
  { id: 'ACT-1038', event: 'Arrival inspection completed', reference: 'SHP-DEMO-039 · Bengaluru', time: 'Yesterday, 2:05 PM', status: 'Completed' },
]

export const pendingActions: PendingAction[] = [
  { id: 'ACTN-01', title: 'Review pending laboratory report', detail: 'LOT-DEMO-115 · Residue screen', age: 'Due today', urgency: 'High', href: '/lab-release-review' },
  { id: 'ACTN-02', title: 'Complete lot inspection', detail: '3 lots are ready for grading', age: '7 lots total', urgency: 'High', href: '/lots-inspection' },
  { id: 'ACTN-03', title: 'Confirm shipment arrival', detail: 'SHP-DEMO-041 · Bengaluru DC', age: 'ETA today', urgency: 'Medium', href: '/arrival-claims' },
  { id: 'ACTN-04', title: 'Reconcile farmer settlement', detail: '18 settlements awaiting review', age: 'This week', urgency: 'Low', href: '/farmer-settlements' },
]
