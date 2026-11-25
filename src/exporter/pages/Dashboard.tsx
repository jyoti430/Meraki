import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ClipboardList, Gavel, Handshake, PackageSearch } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { exporterService } from '../exporterService'
import useRequirements from '../hooks/useRequirements'
import type { SupplyProjectionExample } from '../types'

const routes = [
  { to: '/exporter/requirements', icon: ClipboardList, title: 'Requirements', text: 'Browse sample buyer requirements and save your own drafts.', source: 'Browser-local drafts', tone: 'muted' },
  { to: '/exporter/marketplace', icon: PackageSearch, title: 'Supply examples', text: 'Compare illustrative FPO supply forecasts against a requirement.', source: 'Synthetic examples', tone: 'muted' },
  { to: '/auctions', icon: Gavel, title: 'Shared auctions', text: 'Bid on harvested lots or answer forward requests alongside other signed-in users.', source: 'Server-backed · sign-in', tone: 'live' },
  { to: '/trade', icon: Handshake, title: 'Trade workflow', text: 'Requirements, proposals, contracts and fulfilment records in the separate trade service.', source: 'Server-backed · synthetic actors', tone: 'live' },
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

  return <div className="e-page">
    <ExporterPageHeader eyebrow="Exporter workspace" title="Exporter overview" description="Find FPO supply for your requirements, and use the optional bidding marketplace for additional sales." />
    <DemoNotice>Requirements and supply figures here are synthetic examples. Supply forecasts are not reservable stock, and local drafts are not shared with FPOs.</DemoNotice>
    {error && <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void refresh()}>Retry</button></div>}
    {supplyError && <div className="e-error" role="alert">{supplyError}</div>}

    <section className="e-route-grid" aria-label="Exporter workflows">
      {routes.map(({ to, icon: Icon, title, text, source, tone }) => <Link to={to} className="e-route-card" key={to}>
        <span className="e-route-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="e-route-copy"><strong>{title}</strong><span>{text}</span></span>
        <span className={`e-route-source ${tone}`}>{source}</span>
        <ArrowRight className="e-route-arrow" size={17} aria-hidden="true" />
      </Link>)}
    </section>

    <div className="e-dashboard-grid">
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Demand · {activeCount ?? '—'} sample requirements</p><h2>Procurement requirements</h2></div><Link to="/exporter/requirements" className="e-inline-link">View all <ArrowRight size={16} /></Link></div>
        {requirements === null ? <p className="e-muted" role="status">Loading requirements…</p> : requirements.filter((item) => item.status === 'active').length === 0 ? <div className="e-empty-inline"><p>No active requirements in this view.</p><Link to="/exporter/requirements/new" className="e-inline-link">Create a local draft <ArrowRight size={16} /></Link></div> :
          <div className="e-requirement-preview">{requirements.filter((item) => item.status === 'active').slice(0, 3).map((item) => <Link to={`/exporter/requirements/${item.id}`} className="e-requirement-row" key={item.id}>
            <span className="e-requirement-icon"><ClipboardList size={18} /></span><span className="e-requirement-main"><strong>{item.crop} · {item.variety}</strong><small>{item.id} · {item.destination} · due {item.requiredBy}</small></span><StatusBadge tone="muted">Example</StatusBadge>
          </Link>)}</div>}
      </section>
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">Supply · {projectedKg === null ? '—' : tons(projectedKg)} projected</p><h2>Expected supply examples</h2></div><Link to="/exporter/marketplace" className="e-inline-link">Compare <ArrowRight size={16} /></Link></div>
        {supply === null ? <p className="e-muted" role="status">Loading supply examples…</p> : supply.slice(0, 2).map((item) => <div className="e-supply-preview" key={item.id}>
          <div><strong>{item.crop} · {item.variety}</strong><small>{item.fpoLabel} · {item.deliveryWeek}</small></div><div className="e-supply-preview-right"><b>{tons(item.projectedKg)}</b><StatusBadge tone="muted">Projected</StatusBadge></div>
        </div>)}
        <p className="e-footnote">Forecasts are synthetic and are not verified supply offers.</p>
      </section>
    </div>
    <p className="e-page-footnote">Want to see how an order would move through inspection and delivery? <Link to="/exporter/orders" className="e-inline-link">View an illustrative order lifecycle</Link> (hardcoded sample data).</p>
  </div>
}
