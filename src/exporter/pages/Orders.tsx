import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { DEMO_ORDERS } from '../demoData'

export default function Orders() {
  return <div className="e-page">
    <ExporterPageHeader eyebrow="Demo procurement lifecycle" title="Orders & fulfilment" description="Sample orders from inspection through delivery." />
    <DemoNotice>All orders below are hardcoded examples. No reservation, inspection, shipment or payment has been made. The separate Trade workspace holds server-backed development records.</DemoNotice>
    <section className="e-panel"><div className="e-panel-head"><h2>Sample orders</h2><StatusBadge tone="muted">Demo data</StatusBadge></div>
      <div className="e-fulfilment-list">{DEMO_ORDERS.map(order => <article className="e-fulfilment-row" key={order.id}>
        <span className="e-stage-number">{order.crop.slice(0, 1)}</span>
        <div className="e-stage-title"><strong>{order.crop} · {order.quantityKg.toLocaleString('en-IN')} kg</strong><p>{order.fpo} · {order.id}</p><p>Sample delivery: {order.delivery} · ₹{order.amountInr.toLocaleString('en-IN')}</p></div>
        <StatusBadge tone={order.status === 'Delivered' ? 'good' : 'warn'}>{`${order.status} · demo`}</StatusBadge>
      </article>)}</div>
    </section>
  </div>
}
