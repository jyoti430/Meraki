import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ClipboardList, Clock3, PackageCheck, PackageSearch, ShieldAlert, Truck, Warehouse } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { DEMO_ACTIVITY } from '../demoData'
import { exporterService } from '../exporterService'
import useRequirements from '../hooks/useRequirements'
import type { SupplyProjectionExample } from '../types'

const metrics = [
  { label: 'Active requirements', key: 'requirements', icon: ClipboardList },
  { label: 'Incoming & expected supply', key: 'supply', icon: Warehouse },
  { label: 'Confirmed reservations', key: 'reservations', icon: PackageCheck },
  { label: 'Awaiting quality inspection', key: 'inspection', icon: ShieldAlert },
  { label: 'Orders in transit', key: 'transit', icon: Truck },
  { label: 'Acceptance & settlement', key: 'settlement', icon: Clock3 },
] as const

function tons(kg: number) { return `${(kg / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} t` }

export default function ExporterDashboard() {
  const { items: requirements, error, refresh } = useRequirements()
  const [supply, setSupply] = useState<SupplyProjectionExample[] | null>(null)
  const [supplyError, setSupplyError] = useState<string | null>(null)
  useEffect(() => {
    exporterService.listSupplyProjections().then(setSupply).catch((cause: unknown) => setSupplyError(cause instanceof Error ? cause.message : 'Could not load the demo supply examples.'))
  }, [])

  const activeCount = requirements?.filter((item) => item.status === 'active').length ?? null
  const projectedKg = useMemo(() => supply?.reduce((sum, item) => sum + item.projectedKg, 0) ?? null, [supply])
  const values: Record<(typeof metrics)[number]['key'], { value: string; detail: string }> = {
    requirements: { value: activeCount === null ? '—' : String(activeCount), detail: 'Synthetic sample requirements' },
    supply: { value: projectedKg === null ? '—' : tons(projectedKg), detail: 'Projected volume; not harvested stock' },
    reservations: { value: '4', detail: 'Sample reservations · demo only' },
    inspection: { value: '2', detail: 'Sample inspections · demo only' },
    transit: { value: '1', detail: 'Sample shipment · demo only' },
    settlement: { value: '1', detail: 'Sample settlement · demo only' },
  }

  return <div className="e-page">
    <ExporterPageHeader eyebrow="Procurement workspace" title="Exporter overview" description="Explore sample procurement requirements, FPO supply and fulfilment." actions={<span className="e-demo-pill">Synthetic demo</span>} />
    <p><Link className="e-button e-button-primary" to="/trade">Explore demo trade opportunities →</Link></p>
    <DemoNotice>These figures are retained solely to demonstrate the interface before authorised farm records are connected. All requirement and supply examples on this portal are synthetic. Projected quantities are forecasts, not harvested or allocatable stock. Live reservations and fulfilment records are not connected.</DemoNotice>
    {error && <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void refresh()}>Retry</button></div>}
    {supplyError && <div className="e-error" role="alert">{supplyError}</div>}
    <section className="e-metric-grid" aria-label="Procurement overview">
      {metrics.map(({ label, key, icon: Icon }) => <article className="e-metric-card" key={key}>
        <div className="e-metric-top"><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
        <strong className={values[key].value === 'Not connected' ? 'e-metric-unavailable' : ''}>{values[key].value}</strong>
        <small>{values[key].detail}</small>
      </article>)}
    </section>

    <div className="e-dashboard-grid">
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Demand</p><h2>Procurement requirements</h2></div><Link to="/exporter/requirements" className="e-inline-link">View all <ArrowRight size={16} /></Link></div>
        {requirements === null ? <p className="e-muted">Loading requirements…</p> : requirements.filter((item) => item.status === 'active').length === 0 ? <div className="e-empty-inline"><p>No active requirements in this view.</p><Link to="/exporter/requirements/new" className="e-inline-link">Create a local draft <ArrowRight size={16} /></Link></div> :
          <div className="e-requirement-preview">{requirements.filter((item) => item.status === 'active').slice(0, 3).map((item) => <Link to={`/exporter/requirements/${item.id}`} className="e-requirement-row" key={item.id}>
            <span className="e-requirement-icon"><ClipboardList size={18} /></span><span className="e-requirement-main"><strong>{item.crop} · {item.variety}</strong><small>{item.id} · {item.destination} · due {item.requiredBy}</small></span><span className="e-requirement-qty">{item.quantityKg.toLocaleString()} kg</span><StatusBadge tone="warn">Demo</StatusBadge>
          </Link>)}</div>}
      </section>
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Marketplace</p><h2>Expected supply examples</h2></div><Link to="/exporter/marketplace" className="e-inline-link">Explore <ArrowRight size={16} /></Link></div>
        {supply === null ? <p className="e-muted">Loading synthetic examples…</p> : supply.slice(0, 2).map((item) => <div className="e-supply-preview" key={item.id}>
          <div><strong>{item.crop} · {item.variety}</strong><small>{item.fpoLabel} · {item.deliveryWeek}</small></div><div className="e-supply-preview-right"><b>{tons(item.projectedKg)}</b><StatusBadge tone="muted">Projected</StatusBadge></div>
        </div>)}
        <p className="e-footnote">Forecast figures are synthetic and are not verified supply offers.</p>
      </section>
    </div>

    <div className="e-dashboard-grid">
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Recent activity</p><h2>Workspace updates</h2></div></div>
        <div className="e-activity-list">{DEMO_ACTIVITY.map((activity) => <div className="e-activity-row" key={activity.id}>
          <span className="e-activity-mark" /><div><strong>{activity.title}</strong><small>{activity.detail}</small></div><span className="e-activity-time">{activity.time}</span><StatusBadge tone="muted">Demo</StatusBadge>
        </div>)}</div>
      </section>
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Demo checklist</p><h2>Next steps</h2></div></div>
        <div className="e-alert-row"><ShieldAlert size={20} /><div><strong>Review sample requirements</strong><p>Compare crops, grades and delivery dates before trying the demo market.</p></div></div>
        <div className="e-alert-row e-alert-muted"><PackageSearch size={20} /><div><strong>Explore sample fulfilment</strong><p>See example orders awaiting inspection, in transit and delivered.</p></div></div>
        <Link to="/exporter/orders" className="e-inline-link e-alert-link">Review order status <ArrowRight size={16} /></Link>
      </section>
    </div>
    <p className="e-page-footnote">Synthetic demonstration workspace · No live buyer, FPO, farmer, reservation or shipment data is displayed.</p>
  </div>
}
