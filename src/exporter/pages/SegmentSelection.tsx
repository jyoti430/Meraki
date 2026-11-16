import { ArrowRight, Building2, PackageCheck, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MerakiMark } from '../../components/ui'

export default function SegmentSelection() {
  return <main className="e-entry">
    <div className="e-entry-brand"><MerakiMark size={44} /><span>Meraki</span></div>
    <div className="e-entry-content">
      <p className="e-eyebrow">Crop planning · procurement · delivery</p>
      <h1>Choose your workspace</h1>
      <p className="e-entry-lead">Open shared procurement for server-backed records, or explore the labelled FPO planning demonstration.</p>
      <div className="e-segment-grid">
        <Link to="/fpo" className="e-segment-card">
          <span className="e-segment-icon"><Sprout size={25} /></span>
          <span className="e-eyebrow">Supply coordination</span>
          <strong>FPO Portal</strong>
          <span>Plan crops, coordinate farmer participation and review buyer demand.</span>
          <span className="e-segment-cta">Enter FPO workspace <ArrowRight size={17} /></span>
        </Link>
        <Link to="/exporter" className="e-segment-card e-segment-exporter">
          <span className="e-segment-icon"><Building2 size={25} /></span>
          <span className="e-eyebrow">Procurement workspace</span>
          <strong>Exporter Portal</strong>
          <span>Publish shared requirements, review FPO proposals and track server-confirmed procurement.</span>
          <span className="e-segment-cta">Enter exporter workspace <ArrowRight size={17} /></span>
        </Link>
      </div>
      <div className="e-entry-foot"><PackageCheck size={17} /> Shared procurement requires a session. Synthetic examples remain separate and never replace backend records.</div>
    </div>
  </main>
}
