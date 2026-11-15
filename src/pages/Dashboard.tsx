import { Activity, ArrowUpRight, CalendarDays, CircleHelp } from 'lucide-react'
import SummaryCard from '../components/dashboard/SummaryCard'
import RecentActivity from '../components/dashboard/RecentActivity'
import PendingActions from '../components/dashboard/PendingActions'
import { pendingActions, recentActivities, summaryMetrics } from '../data/mockData'

export default function Dashboard() {
  return <div className="dashboard-page">
    <div className="dashboard-tools"><span className="demo-badge"><span /> SYNTHETIC DEMO DATA</span><button className="date-filter"><CalendarDays size={15} /> Last 30 days <ArrowUpRight size={13} /></button><button className="help-button" aria-label="Dashboard help"><CircleHelp size={17} /></button></div>
    <section className="metrics-grid" aria-label="Operations summary">{summaryMetrics.map((metric) => <SummaryCard key={metric.label} metric={metric} />)}</section>
    <div className="dashboard-lower"><RecentActivity activities={recentActivities} /><PendingActions actions={pendingActions} /></div>
    <div className="dashboard-footer"><Activity size={14} /> Values and records shown are synthetic examples for the Nexus Supply prototype.</div>
  </div>
}
