import { useMemo, useState } from 'react'
import { ArrowDownUp, ArrowRight, ClipboardList, FileEdit, Plus, Search, ShoppingBag, CircleCheck, Ban } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatOrderDate } from '../data/buyerOrders'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import type { BuyerOrderStatus } from '../types'

type FilterStatus = 'All statuses' | BuyerOrderStatus

const statusClass: Record<BuyerOrderStatus, string> = {
  Draft: 'order-status-draft', Active: 'order-status-active', Completed: 'order-status-completed', Cancelled: 'order-status-cancelled',
}

function deliveryWindow(start: string, end: string) {
  if (!start && !end) return 'Not scheduled'
  if (start && end) return `${formatOrderDate(start)} – ${formatOrderDate(end)}`
  return start ? `From ${formatOrderDate(start)}` : `By ${formatOrderDate(end)}`
}

export default function BuyerOrders() {
  const { orders, updateStatus } = useBuyerOrders()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<FilterStatus>('All statuses')
  const summary = useMemo(() => ({
    total: orders.length,
    active: orders.filter((order) => order.status === 'Active').length,
    draft: orders.filter((order) => order.status === 'Draft').length,
    completed: orders.filter((order) => order.status === 'Completed').length,
  }), [orders])
  const visibleOrders = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return orders.filter((order) => {
      const matchesQuery = !search || [order.id, order.buyer.name, order.product.crop].some((value) => value.toLocaleLowerCase().includes(search))
      return matchesQuery && (status === 'All statuses' || order.status === status)
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [orders, query, status])

  function cancelOrder(id: string, name: string) {
    const confirmed = window.confirm(`Cancel ${id} for ${name}? This will update the order status to Cancelled.`)
    if (confirmed) updateStatus(id, 'Cancelled')
  }

  return <div className="buyer-order-page">
    <div className="buyer-order-page-top"><div><div className="page-kicker"><ClipboardList size={14} /> ORDER MANAGEMENT</div><h2>Buyer Orders</h2><p>Capture buyer requirements and track order readiness from one place.</p></div><div className="buyer-order-top-actions"><span className="demo-data-note">Synthetic demo data</span><Link to="/buyer-orders/new" className="primary-button"><Plus size={16} /> Create New Order</Link></div></div>

    <section className="order-summary-grid" aria-label="Buyer order summary">
      <article className="order-summary-card"><span className="order-summary-icon"><ShoppingBag size={17} /></span><div><small>Total orders</small><strong>{summary.total}</strong></div><span className="order-summary-sub">All statuses</span></article>
      <article className="order-summary-card"><span className="order-summary-icon active-icon"><ArrowRight size={17} /></span><div><small>Active orders</small><strong>{summary.active}</strong></div><span className="order-summary-sub">In fulfilment planning</span></article>
      <article className="order-summary-card"><span className="order-summary-icon draft-icon"><FileEdit size={17} /></span><div><small>Draft orders</small><strong>{summary.draft}</strong></div><span className="order-summary-sub">Still being prepared</span></article>
      <article className="order-summary-card"><span className="order-summary-icon complete-icon"><CircleCheck size={17} /></span><div><small>Completed orders</small><strong>{summary.completed}</strong></div><span className="order-summary-sub">Marked complete</span></article>
    </section>

    <section className="order-list-panel">
      <div className="order-list-heading"><div><h3>All orders</h3><p>Buyer orders and their delivery requirements</p></div><span className="order-result-count">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}</span></div>
      <div className="order-list-controls"><label className="order-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order ID, buyer or crop" aria-label="Search orders by order ID, buyer name or crop" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label><label className="order-status-filter"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as FilterStatus)}><option>All statuses</option><option>Draft</option><option>Active</option><option>Completed</option><option>Cancelled</option></select></label><span className="order-sort-hint"><ArrowDownUp size={13} /> Newest first</span></div>
      {visibleOrders.length > 0 ? <div className="order-table-scroll"><table className="buyer-orders-table"><thead><tr><th>ORDER ID</th><th>BUYER</th><th>PRODUCT</th><th>REQUIRED QTY</th><th>DELIVERY WINDOW</th><th>STATUS</th><th>CREATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {visibleOrders.map((order) => <tr key={order.id}><td><Link className="order-id-link" to={`/buyer-orders/${order.id}`}>{order.id}</Link><small>Spec v{order.specificationVersion}</small></td><td><strong className="order-buyer-name">{order.buyer.name}</strong><small>{order.buyer.destinationCountry || 'Destination pending'}</small></td><td><strong className="order-product-name">{order.product.crop || 'Crop pending'}</strong><small>{order.product.variety || 'Variety pending'}</small></td><td>{order.product.requiredQuantityKg === '' ? '—' : `${Number(order.product.requiredQuantityKg).toLocaleString()} kg`}</td><td>{deliveryWindow(order.product.deliveryStartDate, order.product.deliveryEndDate)}</td><td><span className={`order-status-pill ${statusClass[order.status]}`}><i />{order.status}</span></td><td>{formatOrderDate(order.createdAt)}</td><td><div className="order-row-actions"><Link to={`/buyer-orders/${order.id}`} title="View order" aria-label={`View ${order.id}`} className="row-action-button"><ArrowRight size={15} /></Link>{(order.status === 'Draft' || order.status === 'Active') && <><Link to={`/buyer-orders/${order.id}/edit`} title="Edit order" aria-label={`Edit ${order.id}`} className="row-action-button"><FileEdit size={14} /></Link><button type="button" onClick={() => cancelOrder(order.id, order.buyer.name)} title="Cancel order" aria-label={`Cancel ${order.id}`} className="row-action-button cancel-row-action"><Ban size={14} /></button></>}</div></td></tr>)}
      </tbody></table></div> : <div className="orders-empty-state"><div><Search size={20} /></div><h3>{orders.length ? 'No matching orders' : 'No orders yet'}</h3><p>{orders.length ? 'Try a different search term or clear the status filter to see more orders.' : 'Create a buyer order to start capturing product, quality and delivery requirements.'}</p>{orders.length ? <button type="button" className="secondary-button" onClick={() => { setQuery(''); setStatus('All statuses') }}>Clear search and filters</button> : <Link to="/buyer-orders/new" className="primary-button"><Plus size={15} /> Create New Order</Link>}</div>}
      <div className="order-list-footnote">Sample buyer orders · All names, quantities and dates are synthetic demo data.</div>
    </section>
  </div>
}
