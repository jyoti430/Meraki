import { ArrowRight, CalendarClock, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PendingAction } from '../../types'

export default function PendingActions({ actions }: { actions: PendingAction[] }) {
  return (
    <section className="panel actions-panel">
      <div className="panel-header"><div><h2>Pending actions</h2><p>Items that need your attention</p></div><span className="action-count">{actions.length}</span></div>
      <div className="action-list">{actions.map((action) => <Link className="action-item" to={action.href} key={action.id}>
        <span className={`urgency-dot urgency-${action.urgency.toLowerCase()}`} /><span className="action-copy"><strong>{action.title}</strong><small>{action.detail}</small><span className="action-age"><CalendarClock size={12} />{action.age}</span></span><ChevronRight size={16} className="action-chevron" />
      </Link>)}</div>
      <div className="synthetic-caption">Sample tasks · Synthetic demo data <ArrowRight size={12} /></div>
    </section>
  )
}
