import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, BarChart3, CalendarDays, CheckCircle2, ChevronRight, FileEdit, Info, LineChart as LineIcon, Plus, Sprout, Wheat } from 'lucide-react'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { usePlan } from '../context/PlanContext'
import { findCrop } from '../data/crops'
import { marketSignals } from '../data/marketSignals'
import type { BuyerOrder } from '../types'
import { PLANNING_DATE } from '../planning/engine'
import { addDays, daysBetween, fmtDay, fmtPct, fmtRange, maxDate } from '../planning/format'
import { InfoTip, StatCard } from '../components/ui'
import PageHeader from '../components/layout/PageHeader'
import { fmtT } from './Overview'

type MarketFilter = 'All' | 'India' | 'Singapore'
const marketOf = (o: BuyerOrder): MarketFilter => (o.buyer.destinationCountry.toLowerCase() === 'singapore' ? 'Singapore' : 'India')
const price = (o: BuyerOrder) => (o.commercial.agreedPricePerKg === '' ? '—' : `${o.commercial.currency === 'INR' ? '₹' : `${o.commercial.currency} `}${Number(o.commercial.agreedPricePerKg).toLocaleString('en-IN')} / kg`)

function PlantingImpact({ order }: { order: BuyerOrder }) {
  const { result } = usePlan()
  const { updateOrder } = useBuyerOrders()
  const crop = findCrop(order.product.crop)
  const plan = result.plans.find((p) => p.crop.name === crop?.name)
  const qty = Number(order.product.requiredQuantityKg) || 0
  const confirmOrder = () => {
    if (!window.confirm(`Mark ${order.buyer.name}'s ${order.product.crop.toLowerCase()} order as confirmed?`)) return
    const { id: _i, createdAt: _c, updatedAt: _u, specificationHistory: _h, specificationVersion: _v, status: _s, ...input } = order
    updateOrder(order.id, { ...input, product: { ...order.product, orderType: 'Confirmed' } })
  }
  if (!crop) return <p className="m-small">Meraki has no growing reference for {order.product.crop || 'this crop'}, so it can’t be planned automatically.</p>
  const acres = qty / crop.yieldPerAcre[1]
  const sowBy = order.product.deliveryStartDate && !crop.perennial ? addDays(order.product.deliveryStartDate, -crop.daysToFirstHarvest) : ''
  const sowFrom = sowBy ? maxDate(PLANNING_DATE, addDays(sowBy, -14)) : ''
  const missed = sowBy !== '' && sowBy < PLANNING_DATE
  const harvestStart = order.product.deliveryStartDate
  const harvestEnd = harvestStart ? addDays(harvestStart, crop.harvestSpanDays) : ''
  const cover = plan && plan.targetKg ? Math.min(1, plan.expectedKg / plan.targetKg) : 0
  const variety = order.product.variety || crop.defaultVariety

  let reco: string
  if (crop.perennial) reco = `${crop.name} is an orchard crop – no new planting. Existing orchards can supply about ${fmtT(plan?.existingKg ?? 0)} of ${fmtT(qty)}${plan && plan.gapKg > 0 ? '; agree a smaller volume or later window with the buyer' : ''}.`
  else if (missed) reco = `Too late to sow for delivery from ${fmtDay(order.product.deliveryStartDate)} (needed by ${fmtDay(sowBy)}). Ask the buyer for a later window.`
  else if (order.product.orderType === 'Indicative') reco = `Confirm this order before farmers sow. If confirmed, plan ~${acres.toFixed(1)} ac of ${crop.name} (${variety}). It is only planted in scenarios that include indicative demand.`
  else reco = `Include ~${acres.toFixed(1)} ac of ${crop.name} (${variety}) in your planting plan to meet the confirmed demand of ${fmtT(qty)}. The current plan covers ${fmtPct(cover)} of the ${crop.name.toLowerCase()} target.`

  return <>
    <div className="m-impact-head">
      <span className="e" aria-hidden="true">{crop.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}><strong>{crop.name} demand</strong> <span className="m-small">(Selected)</span><div className="m-small">{order.buyer.name} · {marketOf(order)}</div></div>
      <span className={`m-dotstatus ${order.product.orderType === 'Confirmed' ? '' : 'ind'}`}>{order.product.orderType}</span>
    </div>
    <div className="m-impact-row"><span><Wheat size={20} />Recommended area <InfoTip text="Quantity ÷ expected yield per acre (indicative)" /></span><strong>{crop.perennial ? 'Orchard' : `~${acres.toFixed(1)} ac`}</strong></div>
    <div className="m-impact-row"><span><Sprout size={20} />Seed requirement <InfoTip text="Indicative seed rate × area. Nursery seed for transplanted crops." /></span><strong>{crop.perennial ? '—' : `~${(acres * crop.seedKgPerAcre).toFixed(acres * crop.seedKgPerAcre < 1 ? 2 : 1)} kg`}</strong></div>
    <div className="m-impact-row"><span><CalendarDays size={20} />Sowing window</span><strong style={{ color: missed ? 'var(--bad)' : undefined }}>{crop.perennial ? 'No new planting' : missed ? `Passed (${fmtDay(sowBy)})` : sowBy ? `${fmtDay(sowFrom)} – ${fmtDay(sowBy)}` : 'Add delivery dates'}</strong></div>
    <div className="m-impact-row"><span><Sprout size={20} />Harvest window</span><strong>{harvestStart ? `${fmtDay(harvestStart)} – ${fmtDay(harvestEnd)}` : '—'}</strong></div>
    {sowBy && !missed && <p className="m-small" style={{ margin: '8px 0 0' }}>{daysBetween(PLANNING_DATE, sowBy)} days left to sow · {crop.daysToFirstHarvest} days to first harvest</p>}
    <div className="m-reco"><Info size={20} color="var(--forest)" style={{ flex: 'none', marginTop: 2 }} /><div><strong>Planting recommendation</strong><p>{reco}</p></div></div>
    <div className="m-row" style={{ marginTop: 14 }}>
      {plan && <Link to={`/plan#${plan.crop.id}`} className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}>Open in plan <ArrowRight size={15} /></Link>}
      {order.product.orderType === 'Indicative' && <button type="button" className="m-btn m-btn-secondary m-btn-sm" style={{ borderRadius: 10 }} onClick={confirmOrder}><BadgeCheck size={15} />Mark confirmed</button>}
      <Link to={`/buyer-orders/${order.id}/edit`} className="m-btn m-btn-ghost m-btn-sm"><FileEdit size={15} />Edit</Link>
    </div>
  </>
}

export default function BuyerOrders() {
  const { orders } = useBuyerOrders()
  const [market, setMarket] = useState<MarketFilter>('All')
  const active = orders.filter((o) => o.status === 'Active').sort((a, b) => (a.product.orderType === b.product.orderType ? (a.product.deliveryStartDate || 'z').localeCompare(b.product.deliveryStartDate || 'z') : a.product.orderType === 'Confirmed' ? -1 : 1))
  const visible = active.filter((o) => market === 'All' || marketOf(o) === market)
  const [selectedId, setSelectedId] = useState(() => active[0]?.id ?? '')
  const selected = active.find((o) => o.id === selectedId) ?? visible[0]
  const other = orders.filter((o) => o.status !== 'Active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const sum = (list: BuyerOrder[]) => list.reduce((s, o) => s + Number(o.product.requiredQuantityKg || 0), 0)
  const confirmed = active.filter((o) => o.product.orderType === 'Confirmed')
  const indicative = active.filter((o) => o.product.orderType === 'Indicative')
  const higher = marketSignals.filter((s) => s.demandOutlook === 'Higher than usual')
  const lower = marketSignals.filter((s) => s.demandOutlook === 'Lower than usual' || s.regionalSupply === 'Oversupply risk')
  const signalWord = higher.length > lower.length + 1 ? 'Strong' : higher.length >= lower.length ? 'Mixed' : 'Weak'

  return <div className="m-page">
    <PageHeader title="Buyer demand" subtitle="Pre-sowing demand from buyers to plan your crop mix, area, and schedule." actions={<Link to="/buyer-orders/new" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><Plus size={17} />Add buyer demand</Link>} />

    <section className="m-panel" aria-labelledby="dov-title">
      <h2 className="m-panel-title sm" id="dov-title" style={{ marginBottom: 16 }}>Demand overview <small>(Rabi season)</small> <InfoTip text="Active orders only. Drafts and past orders are excluded." /></h2>
      <div className="m-stats three">
        <StatCard icon={<CheckCircle2 size={24} />} label="Confirmed demand" tip="Buyer has committed to quantity, window and price" value={fmtT(sum(confirmed))} sub={<>{confirmed.length} orders · always planned first</>} />
        <StatCard icon={<Sprout size={24} />} label="Indicative demand" tip="Buyer interest that isn't committed yet" value={fmtT(sum(indicative))} sub={<>{indicative.length} orders · confirm before sowing</>} />
        <StatCard icon={<BarChart3 size={24} />} tone="amber" label="Market signals" tip="Synthetic forecast scenarios – not guaranteed" value={signalWord} sub={<>Higher demand for {higher.map((s) => s.crop).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3).join(', ') || '—'}</>} />
      </div>
    </section>

    <div className="m-cols m-cols-demand">
      <section className="m-panel" aria-labelledby="req-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="req-title">Buyer requests</h2><p className="m-panel-sub">Current and upcoming buyer demand for pre-sowing planning.</p></div>
          <div className="m-seg2" role="group" aria-label="Market">{(['All', 'India', 'Singapore'] as MarketFilter[]).map((m) => <button key={m} type="button" aria-pressed={market === m} onClick={() => setMarket(m)}>{m}</button>)}</div>
        </div>
        <div className="m-dt-scroll"><table className="m-dt">
          <thead><tr><th>Crop</th><th>Buyer &amp; market</th><th>Quantity</th><th>Delivery</th><th>Status <InfoTip text="Confirmed = committed; Indicative = interest only" /></th><th>Price</th></tr></thead>
          <tbody>{visible.map((o) => {
            const crop = findCrop(o.product.crop)
            return <tr key={o.id} className={`click ${selected?.id === o.id ? 'sel' : ''}`} onClick={() => setSelectedId(o.id)} aria-selected={selected?.id === o.id}>
              <td><span className="m-crop"><span className="e" aria-hidden="true">{crop?.emoji ?? '🌾'}</span><span>{o.product.crop}<small>{o.product.variety || 'Any variety'}</small></span></span></td>
              <td style={{ minWidth: 130 }}>{o.buyer.name}<small><span className={`m-mkt sm ${marketOf(o) === 'Singapore' ? 'sg' : ''}`}>{marketOf(o)}</span></small></td>
              <td className="num"><strong>{fmtT(Number(o.product.requiredQuantityKg))}</strong></td>
              <td className="nowrap">{fmtRange(o.product.deliveryStartDate, o.product.deliveryEndDate)}</td>
              <td><span className={`m-dotstatus ${o.product.orderType === 'Confirmed' ? '' : 'ind'}`}>{o.product.orderType}</span></td>
              <td className="num">{price(o)}</td>
            </tr>
          })}{!visible.length && <tr><td colSpan={6}><span className="m-small">No active {market === 'All' ? '' : `${market} `}demand.</span></td></tr>}</tbody>
        </table></div>
      </section>

      <section className="m-panel" aria-labelledby="impact-title">
        <h2 className="m-panel-title sm" id="impact-title"><Sprout size={26} color="var(--forest)" />Planting impact</h2>
        <p className="m-panel-sub" style={{ marginBottom: 14 }}>How this buyer demand affects your planting plan.</p>
        {selected ? <PlantingImpact order={selected} /> : <p className="m-small">Select a buyer request.</p>}
      </section>
    </div>

    <details className="m-panel m-details">
      <summary style={{ paddingTop: 0 }}><LineIcon size={16} />Market signals (synthetic forecast) – {marketSignals.length} signals</summary>
      <p className="m-small" style={{ margin: '8px 0 10px' }}>Signals judge opportunity and oversupply risk. They never create planting targets on their own.</p>
      <div className="m-dt-scroll"><table className="m-dt">
        <thead><tr><th>Crop & market</th><th>Window</th><th>Demand outlook</th><th>Regional supply</th><th>Price band</th><th>Confidence</th></tr></thead>
        <tbody>{marketSignals.map((s) => <tr key={s.id}>
          <td><span className="m-crop" style={{ fontSize: 15 }}><span className="e" style={{ fontSize: 20 }}>{findCrop(s.crop)?.emoji}</span>{s.crop}</span><small>{s.market} · {s.marketLabel}</small></td>
          <td style={{ whiteSpace: 'nowrap' }}>{s.window}</td>
          <td>{s.demandOutlook}<small>{s.reason}</small></td>
          <td><span className={`m-feas ${s.regionalSupply === 'Oversupply risk' ? 'low' : s.regionalSupply === 'Tight' ? 'high' : 'medium'}`}><span>{s.regionalSupply}</span></span></td>
          <td style={{ whiteSpace: 'nowrap' }}>₹{s.priceBandInr[0]}–{s.priceBandInr[1]}/kg</td>
          <td>{s.confidence}</td>
        </tr>)}</tbody>
      </table></div>
    </details>

    {other.length > 0 && <details className="m-panel m-details">
      <summary style={{ paddingTop: 0 }}><ChevronRight className="m-chev" size={16} />Drafts and past orders ({other.length})</summary>
      <div className="m-stack" style={{ gap: 0, marginTop: 8 }}>
        {other.map((o) => <Link key={o.id} to={`/buyer-orders/${o.id}`} className="m-action" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}><strong>{o.product.crop || 'Crop pending'} · {o.buyer.name}</strong><span className="m-small">{o.id} · {o.product.requiredQuantityKg === '' ? 'Quantity pending' : fmtT(Number(o.product.requiredQuantityKg))} · {fmtRange(o.product.deliveryStartDate, o.product.deliveryEndDate)}</span></div>
          <span className={`m-tag ${o.status === 'Draft' ? 'm-tag-marigold' : o.status === 'Cancelled' ? 'm-tag-bad' : 'm-tag-neutral'}`}>{o.status}</span><ArrowRight size={16} />
        </Link>)}
      </div>
    </details>}
  </div>
}
