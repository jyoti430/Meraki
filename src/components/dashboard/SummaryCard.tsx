import { ArrowUpRight, BadgeIndianRupee, Boxes, ClipboardCheck, ClipboardList, FlaskConical, Truck } from 'lucide-react'
import type { SummaryMetric } from '../../types'

const icons = { orders: ClipboardList, supply: Boxes, inspection: ClipboardCheck, hold: FlaskConical, shipment: Truck, settlement: BadgeIndianRupee }

export default function SummaryCard({ metric }: { metric: SummaryMetric }) {
  const Icon = icons[metric.icon]
  return (
    <article className="summary-card">
      <div className="summary-top"><span className="summary-icon"><Icon size={18} strokeWidth={1.8} /></span><span className="summary-period">30 days <ArrowUpRight size={13} /></span></div>
      <div className="summary-value">{metric.value}</div><div className="summary-label">{metric.label}</div><div className="summary-note">{metric.note}</div>
    </article>
  )
}
