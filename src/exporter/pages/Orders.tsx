import { CircleHelp, LockKeyhole, PackageCheck, Truck } from 'lucide-react'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { FULFILMENT_STAGES } from '../demoData'

export default function Orders() {
  return <div className="e-page">
    <ExporterPageHeader eyebrow="Procurement lifecycle" title="Orders & fulfilment" description="Review the current connection status for reservations, inspection, dispatch, acceptance and settlement." />
    <DemoNotice>No authenticated order feed is connected. This page reports integration availability; it does not create orders or simulate state changes.</DemoNotice>
    <section className="e-panel e-order-empty">
      <span className="e-empty-icon"><PackageCheck size={26} /></span>
      <div><p className="e-eyebrow">Live records</p><h2>No live exporter orders are connected</h2><p>Procurement drafts and supply projections shown elsewhere are not confirmed orders, reservations, inspected lots or signed obligations.</p></div>
      <StatusBadge tone="muted">Feed unavailable</StatusBadge>
    </section>
    <section className="e-panel">
      <div className="e-panel-head"><div><p className="e-eyebrow">Integration coverage</p><h2>Fulfilment stages</h2></div></div>
      <div className="e-fulfilment-list">{FULFILMENT_STAGES.map((stage, index) => <article className="e-fulfilment-row" key={stage.stage}>
        <span className={`e-stage-number${stage.availability === 'not-integrated' ? ' is-muted' : ''}`}>{String(index + 1).padStart(2, '0')}</span>
        <div className="e-stage-title"><strong>{stage.stage}</strong><p>{stage.detail}</p></div>
        <StatusBadge tone={stage.availability === 'partially-supported' ? 'warn' : 'muted'}>{stage.availability === 'partially-supported' ? 'Partial · not connected' : 'Not integrated'}</StatusBadge>
      </article>)}</div>
    </section>
    <div className="e-callout-grid">
      <div className="e-callout"><LockKeyhole size={19} /><p><strong>Reservations need organisation authentication.</strong> The shared Part 2 API enforces permission checks; this portal does not create synthetic sessions.</p></div>
      <div className="e-callout"><Truck size={19} /><p><strong>Part 3 fulfilment is not connected.</strong> Confirmation, QC, shipment, acceptance, claims and settlement remain owned by the Part 3 service.</p></div>
      <div className="e-callout"><CircleHelp size={19} /><p><strong>Missing data stays unavailable.</strong> No order totals or completion counts are inferred from demo requirements or projected supply.</p></div>
    </div>
  </div>
}
