import { Link } from 'react-router-dom'
import { ArrowRight, BadgeIndianRupee, ClipboardCheck, FlaskConical, PackageCheck, Truck } from 'lucide-react'

const modules = [
  { to: '/lots-inspection', title: 'Lots & inspection', icon: ClipboardCheck, text: 'Grade harvested lots against each buyer’s specification.' },
  { to: '/lab-release-review', title: 'Lab & release review', icon: FlaskConical, text: 'Track residue and lab reports before release.' },
  { to: '/crates-shipments', title: 'Crates & shipments', icon: Truck, text: 'Plan crates, pickups and dispatch to buyers.' },
  { to: '/arrival-claims', title: 'Arrival & claims', icon: PackageCheck, text: 'Record buyer arrival checks and quality claims.' },
  { to: '/farmer-settlements', title: 'Farmer settlements', icon: BadgeIndianRupee, text: 'Reconcile delivered volumes and farmer payments.' },
]

export default function LaterModules() {
  return <div className="m-page">
    <header><div className="m-eyebrow">Beyond planning</div><h1 className="m-h1">Trade and fulfilment</h1><p className="m-lead">Continue from an award through quality review, dispatch, receiving and settlement. These workflows use the separate trade API; start it locally to explore synthetic transactions.</p></header>
    <div className="m-later-grid">
      {modules.map(({ to, title, icon: Icon, text }) => <Link key={to} to={to} className="m-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="m-action-ico info"><Icon size={17} /></span><strong>{title}</strong><span className="m-small">{text}</span><span className="m-tag m-tag-neutral" style={{ alignSelf: 'flex-start' }}>Trade API</span><span className="m-action-cta">Open workflow <ArrowRight size={13} /></span>
      </Link>)}
    </div>
  </div>
}
