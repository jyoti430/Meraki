import { ArrowRight, Building2, PackageCheck, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MerakiMark } from '../../components/ui'

export default function SegmentSelection() {
  return <main className="e-entry">
    <div className="e-entry-brand"><MerakiMark size={44} /><span>Meraki</span></div>
    <div className="e-entry-content">
      <p className="e-eyebrow">Demand-driven crop planning</p>
      <h1>Choose your workspace</h1>
      <p className="e-entry-lead">Crop planning is the core FPO workflow. The exporter workspace and the bidding marketplace are optional extras.</p>
      <div className="e-segment-grid">
        <Link to="/fpo" className="e-segment-card">
          <span className="e-segment-icon"><Sprout size={25} /></span>
          <span className="e-eyebrow">Supply coordination</span>
          <strong>FPO Portal</strong>
          <span>Turn buyer demand into a collective planting plan, then coordinate farmers and see the plan adjust.</span>
          <span className="e-segment-cta">Enter FPO workspace <ArrowRight size={17} /></span>
        </Link>
        <Link to="/exporter" className="e-segment-card e-segment-exporter">
          <span className="e-segment-icon"><Building2 size={25} /></span>
          <span className="e-eyebrow">Procurement workspace</span>
          <strong>Exporter Portal</strong>
          <span>Review buyer requirements, compare FPO supply examples and open the bidding marketplace.</span>
          <span className="e-segment-cta">Enter exporter workspace <ArrowRight size={17} /></span>
        </Link>
      </div>
      <div className="e-entry-foot"><PackageCheck size={17} /> Demo records are synthetic and stay in this browser. Shared auctions and the trade workflow use separate server records.</div>
    </div>
  </main>
}
