import { ArrowUpRight } from 'lucide-react'
import type { Activity } from '../../types'

export default function RecentActivity({ activities }: { activities: Activity[] }) {
  return (
    <section className="panel activity-panel">
      <div className="panel-header"><div><h2>Recent activity</h2><p>Latest updates across your operations</p></div><button className="text-link">View all <ArrowUpRight size={14} /></button></div>
      <div className="table-scroll"><table><thead><tr><th>ACTIVITY</th><th>REFERENCE</th><th>STATUS</th><th>TIME</th></tr></thead><tbody>
        {activities.map((item) => <tr key={item.id}><td><span className="activity-title">{item.event}</span><span className="activity-id">{item.id}</span></td><td className="reference-cell">{item.reference}</td><td><span className={`status-pill status-${item.status.toLowerCase().replace(' ', '-')}`}><i />{item.status}</span></td><td className="time-cell">{item.time}</td></tr>)}
      </tbody></table></div>
      <div className="synthetic-caption">Sample activity · Synthetic demo data</div>
    </section>
  )
}
