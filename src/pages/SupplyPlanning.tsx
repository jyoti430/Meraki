import { useMemo, useState } from 'react'
import { Activity, ArrowRight, ClipboardCheck, ClipboardList, Search, Sprout, Truck, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { useSupplyPlanning } from '../context/SupplyPlanningContext'
import { displaySupplyPlanStatus, getAllocationTotals, getGlobalEligibleEstimate, getUncoveredDemand } from '../services/SupplyPlanningService'
import type { SupplyPlanStatus } from '../types'

type PlanFilter = 'All statuses' | SupplyPlanStatus

const statusClass: Record<SupplyPlanStatus, string> = { Draft: 'plan-status-draft', Previewed: 'plan-status-previewed', Confirmed: 'plan-status-confirmed', 'Needs Review': 'plan-status-review', Cancelled: 'plan-status-cancelled' }
const number = (value: number) => `${value.toLocaleString()} kg`
const formatDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not scheduled'

function Status({ value }: { value: SupplyPlanStatus }) { return <span className={`plan-status-pill ${statusClass[value]}`}><i />{value}</span> }

function Metric({ icon, label, value, note, tone = '' }: { icon: React.ReactNode; label: string; value: string | number; note: string; tone?: string }) {
  return <article className="supply-metric"><span className={`supply-metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><span>{note}</span></div></article>
}

export default function SupplyPlanning() {
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const { data: planning } = useSupplyPlanning()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PlanFilter>('All statuses')
  const activeOrders = orders.filter((order) => order.status === 'Active')
  const awaiting = activeOrders.filter((order) => getUncoveredDemand(order, planning) > 0 || planning.plans.some((plan) => plan.orderId === order.id && displaySupplyPlanStatus(plan, order, farmers, planning) === 'Needs Review')).length
  const activePlans = planning.plans.filter((plan) => displaySupplyPlanStatus(plan, orders.find((order) => order.id === plan.orderId), farmers, planning) !== 'Cancelled').length
  const uncovered = activeOrders.reduce((total, order) => total + getUncoveredDemand(order, planning), 0)
  const visiblePlans = useMemo(() => planning.plans.filter((plan) => {
    const order = orders.find((item) => item.id === plan.orderId)
    const status = displaySupplyPlanStatus(plan, order, farmers, planning)
    const matchesStatus = filter === 'All statuses' || status === filter
    const search = query.trim().toLowerCase()
    const matchesSearch = !search || [plan.id, plan.orderId, order?.buyer.name ?? ''].some((value) => value.toLowerCase().includes(search))
    return matchesStatus && matchesSearch
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [planning, orders, farmers, filter, query])

  return <div className="supply-page">
    <div className="supply-page-top"><div><div className="supply-kicker"><Workflow size={14} /> SUPPLY PLANNING WORKSPACE</div><h2>Supply Planning</h2><p>Match active buyer orders with consented farmer crop-cycle estimates. Review constraints before confirming reservations.</p></div><div className="supply-top-actions"><span className="supply-demo-label">Planning estimates · Synthetic demo records</span><Link to="/supply-planning/new" className="primary-button"><ClipboardCheck size={15} /> Create New Plan</Link></div></div>

    <div className="supply-metrics-grid"><Metric icon={<ClipboardList size={17} />} label="Active plans" value={activePlans} note="Draft, previewed, confirmed or review" /><Metric icon={<Activity size={17} />} label="Orders awaiting planning" value={awaiting} note="Active orders with uncovered demand" tone="amber" /><Metric icon={<Sprout size={17} />} label="Estimated eligible supply" value={number(getGlobalEligibleEstimate(farmers, planning))} note="Unreserved estimates on active cycles" tone="green" /><Metric icon={<Truck size={17} />} label="Uncovered demand" value={number(uncovered)} note="Across active buyer orders" tone="blue" /></div>

    <section className="supply-list-panel"><div className="supply-list-heading"><div><h3>Supply plans</h3><p>Plan status is separate from buyer order status. Confirmed plans reserve estimates, not harvested stock.</p></div><span className="supply-count">{visiblePlans.length} plans</span></div>
      <div className="supply-list-controls"><label className="supply-search"><Search size={15} /><input aria-label="Search by plan ID or buyer order" placeholder="Search plan ID or buyer order" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery('')} type="button" aria-label="Clear search">×</button>}</label><label className="supply-filter"><span>Planning status</span><select value={filter} onChange={(event) => setFilter(event.target.value as PlanFilter)}><option>All statuses</option><option>Draft</option><option>Previewed</option><option>Confirmed</option><option>Needs Review</option><option>Cancelled</option></select></label></div>
      {visiblePlans.length ? <div className="supply-table-scroll"><table className="supply-table"><thead><tr><th>PLAN ID</th><th>BUYER ORDER</th><th>CROP / VARIETY</th><th>REQUIRED</th><th>PROPOSED ALLOCATION</th><th>UNCOVERED</th><th>DELIVERY WINDOW</th><th>PLAN STATUS</th><th>LAST UPDATED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visiblePlans.map((plan) => {
        const order = orders.find((item) => item.id === plan.orderId)
        const status = displaySupplyPlanStatus(plan, order, farmers, planning)
        const allocated = getAllocationTotals(plan.allocations)
        return <tr key={plan.id}><td><Link className="supply-plan-id" to={`/supply-planning/${plan.id}`}>{plan.id}</Link><small>{plan.overrides.length ? `${plan.overrides.length} manual adjustment${plan.overrides.length > 1 ? 's' : ''}` : 'Engine proposal'}</small></td><td><Link className="supply-order-id" to={`/buyer-orders/${plan.orderId}`}>{plan.orderId}</Link><small className="order-status-mini">Order: {order?.status ?? 'Unavailable'}</small></td><td><strong>{order?.product.crop ?? plan.candidates[0]?.crop ?? 'Order unavailable'}</strong><small>{order?.product.variety ?? plan.candidates[0]?.variety ?? ''}</small></td><td>{number(plan.orderQuantityKg)}</td><td>{number(allocated)}</td><td>{number(Math.max(0, plan.orderQuantityKg - allocated))}</td><td>{order ? `${formatDate(order.product.deliveryStartDate)} – ${formatDate(order.product.deliveryEndDate)}` : 'Order unavailable'}</td><td><Status value={status} /></td><td>{formatDate(plan.updatedAt)}</td><td><Link className="supply-row-link" to={`/supply-planning/${plan.id}`} aria-label={`View plan ${plan.id}`}><ArrowRight size={15} /></Link></td></tr>
      })}</tbody></table></div> : <div className="supply-empty-state"><div><Workflow size={19} /></div><h3>{planning.plans.length ? 'No matching plans' : 'No supply plans yet'}</h3><p>{planning.plans.length ? 'Try another plan ID or planning status filter.' : 'Select an active buyer order to preview eligible crop cycles and estimate the uncovered quantity.'}</p>{planning.plans.length ? <button className="secondary-button" type="button" onClick={() => { setQuery(''); setFilter('All statuses') }}>Clear filters</button> : <Link className="primary-button" to="/supply-planning/new"><ClipboardCheck size={14} /> Create New Plan</Link>}</div>}
      <div className="supply-list-footnote">Estimates depend on recorded consent, crop compatibility, harvest-window overlap and active reservations. No delivery or quality outcome is guaranteed.</div>
    </section>
  </div>
}
