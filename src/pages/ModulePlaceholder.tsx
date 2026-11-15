import { ArrowLeft, Construction } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return <div className="m-page" style={{ maxWidth: 720 }}>
    <Link to="/later" className="m-link"><ArrowLeft size={16} /> Later modules</Link>
    <section className="m-card m-stack" style={{ alignItems: 'flex-start' }}>
      <span className="m-action-ico info"><Construction size={18} /></span>
      <div className="m-eyebrow">Retained for future development</div>
      <h1 className="m-h2">{title}</h1>
      <p className="m-lead">{description}</p>
      <span className="m-tag m-tag-neutral">Not part of the current planning workflow</span>
    </section>
  </div>
}
