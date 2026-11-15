import { ArrowUpRight, Construction } from 'lucide-react'

export default function ModulePlaceholder({ title, description }: { title: string; description: string }) {
  return <section className="module-placeholder"><div className="placeholder-icon"><Construction size={22} /></div><div className="eyebrow">FPO OPERATIONS MODULE</div><h2>{title}</h2><p>{description}</p><div className="placeholder-note"><span className="placeholder-status-dot" /> Module foundation <span>·</span> Planned for a future milestone</div><button className="placeholder-link" disabled>Module overview <ArrowUpRight size={14} /></button></section>
}
