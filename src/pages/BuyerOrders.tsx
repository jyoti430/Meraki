import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, ChevronRight, FileEdit, Info, LineChart, Plus } from 'lucide-react'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { usePlan } from '../context/PlanContext'
import { findCrop } from '../data/crops'
import { marketSignals } from '../data/marketSignals'
import type { BuyerOrder } from '../types'
import { fmtDay, fmtKg, fmtPct, fmtRange } from '../planning/format'
import { PlanStatus, SourceTag } from '../components/ui'

const marketOf = (o: BuyerOrder) => (o.buyer.destinationCountry.toLowerCase() === 'singapore' ? 'Singapore' : o.buyer.destinationCountry || 'India')
const price = (o: BuyerOrder) => (o.commercial.agreedPricePerKg === '' ? '—' : `${o.commercial.currency === 'INR' ? '₹' : `${o.commercial.currency} `}${Number(o.commercial.agreedPricePerKg).toLocaleString('en-IN')}/kg`)

function OrderTable({ orders, kind }: { orders: BuyerOrder[]; kind: 'Confirmed' | 'Indicative' }) {
  const { result } = usePlan()
  const { updateOrder } = useBuyerOrders()
  if (!orders.length) return <p className="m-small" style={{ margin: 0 }}>No {kind.toLowerCase()} orders.</p>
  return <div className="m-table-wrap"><table className="m-table m-table-resp">
    <thead><tr><th>Crop</th><th>Buyer</th><th className="num">Quantity</th><th>Delivery</th><th className="num">Price</th><th>In the plan</th><th><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>{orders.map((o) => {
      const crop = findCrop(o.product.crop)
      const plan = result.plans.find((p) => p.crop.name === crop?.name)
      return <tr key={o.id}>
        <td><Link to={`/buyer-orders/${o.id}`} className="m-link">{crop?.emoji} {o.product.crop}</Link><small>{o.product.variety || 'Any variety'}</small></td>
        <td>{o.buyer.name}<small>{marketOf(o)}{o.buyer.destinationCityPort ? ` · ${o.buyer.destinationCityPort}` : ''}</small></td>
        <td className="num"><strong>{fmtKg(Number(o.product.requiredQuantityKg))}</strong></td>
        <td>{fmtRange(o.product.deliveryStartDate, o.product.deliveryEndDate)}{plan?.sowBy && <small>Sow by {fmtDay(plan.sowBy)}</small>}</td>
        <td className="num">{price(o)}</td>
        <td>{plan ? <Link to={`/plan#${plan.crop.id}`} style={{ textDecoration: 'none' }}><PlanStatus plan={plan} /><small style={{ marginTop: 4 }}>{plan.status === 'not-in-scenario' ? 'Indicative only' : `${fmtPct(plan.targetKg ? Math.min(1, plan.expectedKg / plan.targetKg) : 0)} of crop target`}</small></Link> : <span className="m-tag m-tag-neutral">{crop ? 'Not planned' : 'No crop reference'}</span>}</td>
        <td><div className="m-row" style={{ flexWrap: 'nowrap', gap: 4 }}>
          {kind === 'Indicative' && <button type="button" className="m-btn m-btn-secondary m-btn-xs" title="Buyer has committed – mark as confirmed" onClick={() => { if (window.confirm(`Mark ${o.id} (${o.buyer.name}, ${o.product.crop}) as confirmed?`)) { const { id: _i, createdAt: _c, updatedAt: _u, specificationHistory: _h, specificationVersion: _v, status: _s, ...input } = o; updateOrder(o.id, { ...input, product: { ...o.product, orderType: 'Confirmed' } }) } }}><BadgeCheck size={14} /> Confirm</button>}
          <Link to={`/buyer-orders/${o.id}/edit`} className="m-iconbtn" aria-label={`Edit ${o.id}`} title="Edit"><FileEdit size={15} /></Link>
        </div></td>
      </tr>
    })}</tbody>
  </table></div>
}

export default function BuyerOrders() {
  const { orders } = useBuyerOrders()
  const { result } = usePlan()
  const active = orders.filter((o) => o.status === 'Active')
  const confirmed = active.filter((o) => o.product.orderType === 'Confirmed')
  const indicative = active.filter((o) => o.product.orderType === 'Indicative')
  const other = orders.filter((o) => o.status !== 'Active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const sum = (list: BuyerOrder[]) => list.reduce((s, o) => s + Number(o.product.requiredQuantityKg || 0), 0)

  return <div className="m-page">
    <header className="m-pagehead">
      <div><div className="m-eyebrow">Step 1 · Buyer demand</div><h1 className="m-h1">What buyers want, and when</h1><p className="m-lead">Record demand before sowing. Only <strong>active</strong> orders feed the planting plan; confirmed orders are always planned first.</p></div>
      <div className="m-pagehead-actions"><Link to="/buyer-orders/new" className="m-btn m-btn-primary"><Plus size={18} /> Add buyer demand</Link></div>
    </header>

    <div className="m-kpis">
      <div className="m-kpi"><small>Confirmed demand</small><strong>{fmtKg(sum(confirmed))}</strong><span>{confirmed.length} orders · buyer committed</span></div>
      <div className="m-kpi"><small>Indicative demand</small><strong>{fmtKg(sum(indicative))}</strong><span>{indicative.length} orders · not yet committed</span></div>
      <div className="m-kpi"><small>Crops in demand</small><strong>{result.plans.length}</strong><span>India and Singapore buyers</span></div>
      <div className="m-kpi"><small>Confirmed demand covered</small><strong>{fmtPct(result.confirmedDemandKg ? result.confirmedCoveredKg / result.confirmedDemandKg : 0)}</strong><span>by the current plan</span></div>
    </div>

    <section className="m-card" aria-labelledby="confirmed-title">
      <div className="m-card-head"><div><h2 className="m-h3" id="confirmed-title"><SourceTag kind="order">Confirmed</SourceTag> &nbsp;Orders buyers have committed to</h2><p className="m-sub">Agreed quantity, window and price. The plan must cover these first.</p></div></div>
      <OrderTable orders={confirmed} kind="Confirmed" />
    </section>

    <section className="m-card" aria-labelledby="indicative-title">
      <div className="m-card-head"><div><h2 className="m-h3" id="indicative-title"><SourceTag kind="indicative" /> &nbsp;Interest that isn’t committed yet</h2><p className="m-sub">Planned only in scenarios that include indicative demand. Confirm with the buyer before farmers sow.</p></div></div>
      <OrderTable orders={indicative} kind="Indicative" />
    </section>

    <section className="m-card" aria-labelledby="signals-title">
      <div className="m-card-head"><div><h2 className="m-h3" id="signals-title"><SourceTag kind="forecast">Market forecast</SourceTag> &nbsp;Signals, not buyers</h2><p className="m-sub">Synthetic market scenarios used to judge opportunity and oversupply risk. They never create planting targets on their own.</p></div><span className="m-tag m-tag-forecast"><LineChart size={13} /> Synthetic data</span></div>
      <div className="m-table-wrap"><table className="m-table m-table-resp">
        <thead><tr><th>Crop & market</th><th>Window</th><th>Demand outlook</th><th>Regional supply</th><th className="num">Price band</th><th>Confidence</th></tr></thead>
        <tbody>{marketSignals.map((s) => <tr key={s.id}>
          <td><strong>{findCrop(s.crop)?.emoji} {s.crop}</strong><small>{s.market} · {s.marketLabel}</small></td>
          <td>{s.window}</td>
          <td>{s.demandOutlook}<small>{s.reason}</small></td>
          <td><span className={`m-tag ${s.regionalSupply === 'Oversupply risk' ? 'm-tag-bad' : s.regionalSupply === 'Tight' ? 'm-tag-good' : 'm-tag-neutral'}`}>{s.regionalSupply}</span></td>
          <td className="num">₹{s.priceBandInr[0]}–{s.priceBandInr[1]}/kg</td>
          <td>{s.confidence}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="m-footnote" style={{ marginTop: 12 }}><Info size={15} style={{ flex: 'none', marginTop: 2 }} />In a live system these would come from mandi arrival and price history and buyer surveys. Treat them as directional only.</p>
    </section>

    {other.length > 0 && <details className="m-card m-details" style={{ borderTop: '1px solid var(--line)' }}>
      <summary style={{ paddingTop: 0 }}><ChevronRight className="m-chev" size={16} />Drafts and past orders ({other.length})</summary>
      <div className="m-stack" style={{ gap: 0, marginTop: 8 }}>
        {other.map((o) => <Link key={o.id} to={`/buyer-orders/${o.id}`} className="m-action" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}><strong>{o.product.crop || 'Crop pending'} · {o.buyer.name}</strong><span className="m-small">{o.id} · {o.product.requiredQuantityKg === '' ? 'Quantity pending' : fmtKg(Number(o.product.requiredQuantityKg))} · {fmtRange(o.product.deliveryStartDate, o.product.deliveryEndDate)}</span></div>
          <span className={`m-tag ${o.status === 'Draft' ? 'm-tag-marigold' : o.status === 'Cancelled' ? 'm-tag-bad' : 'm-tag-neutral'}`}>{o.status}</span><ArrowRight size={16} />
        </Link>)}
      </div>
    </details>}
  </div>
}
