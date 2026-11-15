import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarRange, CheckCircle2, ClipboardList, PackageCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useSupplyPlanning } from '../context/SupplyPlanningContext'
import { getUncoveredDemand } from '../services/SupplyPlanningService'
import type { BuyerOrder } from '../types'

const displayDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Not set'
const formatKg = (value: number) => `${Number(value || 0).toLocaleString()} kg`

export default function SupplyPlanCreate() {
  const { orders } = useBuyerOrders()
  const { data: planning } = useSupplyPlanning()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const eligibleOrders = orders.filter((order) => order.status === 'Active')
  const [selectedId, setSelectedId] = useState(params.get('orderId') ?? '')
  const [programmeId, setProgrammeId] = useState(params.get('programmeId') ?? 'FPO-SUPPLY')
  const [search, setSearch] = useState('')
  const selected = eligibleOrders.find((order) => order.id === selectedId)
  const visible = useMemo(() => eligibleOrders.filter((order) => `${order.id} ${order.buyer.name} ${order.product.crop}`.toLowerCase().includes(search.trim().toLowerCase())), [eligibleOrders, search])

  return <div className="supply-page supply-create-page">
    <div className="supply-page-top"><div><Link to="/supply-planning" className="supply-back-link"><ArrowLeft size={14} /> Supply planning</Link><h2>Create supply plan</h2><p>Select an active buyer order. Order details and specifications are read from Buyer Orders.</p></div><span className="supply-demo-label">Planning estimate only</span></div>
    {eligibleOrders.length > 0 && <label className="programme-id-field"><span>Supply programme ID <i>Required</i></span><input value={programmeId} onChange={(event) => setProgrammeId(event.target.value)} placeholder="FPO-SUPPLY" /><small>Matched against programme-specific participation. General FPO consent is always required.</small></label>}
    {!eligibleOrders.length ? <div className="supply-empty-state supply-no-orders"><div><PackageCheck size={19} /></div><h3>No active buyer orders</h3><p>Supply plans can only be created for an active buyer order.</p><Link className="secondary-button" to="/buyer-orders">Review buyer orders</Link></div> : <div className="supply-create-layout"><section className="supply-order-picker"><div className="supply-picker-heading"><div><h3>Select buyer order</h3><p>Only active orders are available for planning.</p></div><span>{visible.length} orders</span></div><label className="supply-order-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by order ID, buyer or crop" aria-label="Filter buyer orders" /></label><div className="supply-order-options">{visible.map((order) => <OrderOption key={order.id} order={order} selected={order.id === selectedId} onSelect={() => setSelectedId(order.id)} planning={planning} />)}{!visible.length && <p className="supply-picker-empty">No active orders match this search.</p>}</div></section>
      <aside className="supply-selected-order">{selected ? <SelectedOrder order={selected} planning={planning} /> : <div className="supply-selection-empty"><div><ClipboardList size={19} /></div><h3>Order details</h3><p>Select an active buyer order to review its quantity, delivery dates and quality requirements before generating a preview.</p></div>}</aside></div>}
    {eligibleOrders.length > 0 && <div className="supply-create-footer"><Link to="/supply-planning" className="secondary-button">Cancel</Link><button type="button" className="primary-button" disabled={!selected || !programmeId.trim()} onClick={() => selected && navigate(`/supply-planning/preview?orderId=${selected.id}&programmeId=${encodeURIComponent(programmeId.trim())}`)}>Discover crop cycles <ArrowRight size={15} /></button></div>}
    <p className="supply-data-note">Planning reads existing farmer consent and crop-cycle data. No production is reserved until a plan is confirmed.</p>
  </div>
}

function OrderOption({ order, selected, onSelect, planning }: { order: BuyerOrder; selected: boolean; onSelect: () => void; planning: ReturnType<typeof useSupplyPlanning>['data'] }) {
  const alreadyCovered = Math.max(0, Number(order.product.requiredQuantityKg) - getUncoveredDemand(order, planning))
  return <button type="button" onClick={onSelect} className={`supply-order-option ${selected ? 'supply-order-option-selected' : ''}`}><span className="order-radio"><i /></span><span className="order-option-main"><strong>{order.id}</strong><small>{order.buyer.name}</small><span>{order.product.crop}{order.product.variety ? ` · ${order.product.variety}` : ''}</span></span><span className="order-option-meta"><span>{formatKg(Number(order.product.requiredQuantityKg))}</span><small>{order.product.orderType}</small>{alreadyCovered > 0 && <em>{formatKg(alreadyCovered)} reserved</em>}</span></button>
}

function SelectedOrder({ order, planning }: { order: BuyerOrder; planning: ReturnType<typeof useSupplyPlanning>['data'] }) {
  const criteria = order.specification.criteria
  return <><div className="selected-order-heading"><span><CheckCircle2 size={16} /></span><div><small>SELECTED ACTIVE ORDER</small><strong>{order.id}</strong></div><span className="order-status-mini">Order: {order.status}</span></div>
    <div className="selected-order-buyer"><small>Buyer</small><strong>{order.buyer.name}</strong><span>{order.buyer.destinationCountry} · {order.buyer.destinationCityPort}</span></div>
    <div className="selected-order-product"><div><small>Crop &amp; variety</small><strong>{order.product.crop} · {order.product.variety}</strong></div><div><small>Required quantity</small><strong>{formatKg(Number(order.product.requiredQuantityKg))}</strong></div><div><small>Order type</small><strong>{order.product.orderType}{order.product.orderType === 'Indicative' && <em>Not a confirmed commercial commitment</em>}</strong></div><div><small>Delivery window</small><strong><CalendarRange size={13} /> {displayDate(order.product.deliveryStartDate)} – {displayDate(order.product.deliveryEndDate)}</strong></div></div>
    <div className="selected-order-spec"><div className="selected-order-section-title"><h4>Buyer quality specification</h4><Link to={`/buyer-orders/${order.id}`}>View order <ArrowRight size={12} /></Link></div>{criteria.length ? <ul>{criteria.slice(0, 4).map((criterion) => <li key={criterion.id}><strong>{criterion.attribute}</strong><span>{criterion.minimum || criterion.maximum ? `${criterion.minimum || '—'} – ${criterion.maximum || '—'} ${criterion.unit}` : criterion.unit}</span></li>)}</ul> : <p>No quality criteria listed in the order.</p>}{criteria.length > 4 && <small>+ {criteria.length - 4} more criteria</small>}<div className="order-requirements-summary">{[
      order.specification.safetyRequirements.laboratoryReportRequired && 'Lab report',
      order.specification.safetyRequirements.residueTestingRequired && 'Residue testing',
      order.specification.safetyRequirements.phytosanitaryDocumentationRequired && 'Phytosanitary documents',
    ].filter(Boolean).map((item) => <span key={String(item)}>{item}</span>)}</div><p className="quality-assumption-note">Crop-cycle records do not establish quality compliance.</p></div>
    <div className="selected-order-reservations"><span>Existing active reservations</span><strong>{formatKg(Math.max(0, Number(order.product.requiredQuantityKg) - getUncoveredDemand(order, planning)))}</strong></div>
  </>
}
