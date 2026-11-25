import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, BarChart3, CalendarDays, CheckCircle2, ChevronRight, FileEdit, Info, LineChart as LineIcon, Plus, Sprout, Wheat } from 'lucide-react'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { usePlan } from '../context/PlanContext'
import { findCrop } from '../data/crops'
import { marketSignals } from '../data/marketSignals'
import type { BuyerOrder } from '../types'
import { PLANNING_DATE } from '../planning/engine'
import { addDays, daysBetween, maxDate } from '../planning/format'
import { InfoTip, StatCard, lineStatusLabel } from '../components/ui'
import { rowActivation } from '../components/rowActivation'
import PageHeader from '../components/layout/PageHeader'
import { fmtT } from './Overview'
import { cropLabel, formatDate, formatINR, formatNumber, useI18n, type TKey } from '../i18n'

type MarketFilter = 'All' | 'India' | 'Singapore'
const marketOf = (o: BuyerOrder): MarketFilter => (o.buyer.destinationCountry.toLowerCase() === 'singapore' ? 'Singapore' : 'India')
const price = (o: BuyerOrder, lang: Parameters<typeof formatNumber>[1]) => {
  if (o.commercial.agreedPricePerKg === '') return '—'
  const amount = Number(o.commercial.agreedPricePerKg)
  return `${o.commercial.currency === 'INR' ? formatINR(amount, lang, { maximumFractionDigits: 2 }) : `${o.commercial.currency} ${formatNumber(amount, lang)}`} / kg`
}
const shortDate = (value: string, lang: Parameters<typeof formatNumber>[1]) => value ? formatDate(value, lang, { day: 'numeric', month: 'short' }) : ''
const dateRange = (from: string, to: string, lang: Parameters<typeof formatNumber>[1]) => from && to ? `${shortDate(from, lang)} – ${shortDate(to, lang)}` : from ? shortDate(from, lang) : to ? shortDate(to, lang) : '—'
const marketLabelKeys: Record<string, TKey> = {
  'Singapore importers': 'market_singapore_importers', 'Singapore food service': 'market_singapore_food_service', 'Singapore Indian grocers': 'market_singapore_grocers',
  'Pune & Mumbai wholesale': 'market_pune_mumbai_wholesale', 'Mumbai wholesale': 'market_mumbai_wholesale',
  'Pune & Nashik wholesale': 'market_pune_nashik_wholesale', 'Lasalgaon & Pune wholesale': 'market_lasalgaon_pune_wholesale',
}
const reasonKeys: Record<string, TKey> = { 'SIG-01': 'market_reason_01', 'SIG-02': 'market_reason_02', 'SIG-03': 'market_reason_03', 'SIG-04': 'market_reason_04', 'SIG-05': 'market_reason_05', 'SIG-06': 'market_reason_06', 'SIG-07': 'market_reason_07', 'SIG-08': 'market_reason_08', 'SIG-09': 'market_reason_09' }
const marketValueKeys: Record<string, TKey> = {
  'Higher than usual': 'market_higher', 'Similar to usual': 'market_similar', 'Lower than usual': 'market_lower',
  Tight: 'market_tight', Balanced: 'market_balanced', 'Oversupply risk': 'market_oversupply', Low: 'market_low', Medium: 'market_medium', High: 'market_high',
}
const lineStatusKeys: Record<string, TKey> = { covered: 'plan_status_covered', partial: 'plan_status_partial', gap: 'plan_status_gap', 'not-plantable': 'plan_status_not_plantable', 'not-in-scenario': 'plan_status_not_in_scenario' }
const marketName = (market: MarketFilter, translate: (key: TKey) => string) => translate(market === 'Singapore' ? 'market_singapore' : 'market_india')
const marketWindow = (value: string, lang: Parameters<typeof formatNumber>[1]) => {
  const parts = value.match(/^([A-Z][a-z]{2}) – ([A-Z][a-z]{2}) (\d{4})$/)
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
  if (!parts) return value
  const [, first, last, year] = parts
  const month = (m: string) => formatDate(new Date(Date.UTC(Number(year), months[m], 1)), lang, { month: 'short', timeZone: 'UTC' })
  return `${month(first)} – ${month(last)} ${year}`
}

function PlantingImpact({ order }: { order: BuyerOrder }) {
  const { t, lang } = useI18n()
  const { result } = usePlan()
  const { updateOrder } = useBuyerOrders()
  const crop = findCrop(order.product.crop)
  const plan = result.plans.find((p) => p.crop.name === crop?.name)
  const qty = Number(order.product.requiredQuantityKg) || 0
  const confirmOrder = () => {
    if (!window.confirm(`${order.buyer.name}: ${t('demand_mark_committed')} · ${cropLabel(order.product.crop, t)}?`)) return
    const { id: _i, createdAt: _c, updatedAt: _u, specificationHistory: _h, specificationVersion: _v, status: _s, ...input } = order
    updateOrder(order.id, { ...input, product: { ...order.product, orderType: 'Confirmed' } })
  }
  if (!crop) return <p className="m-small">{t('demand_unknown_crop', { crop: cropLabel(order.product.crop || t('demand_unspecified_crop'), t) })}</p>
  const acres = qty / crop.yieldPerAcre[1]
  const sowBy = order.product.deliveryStartDate && !crop.perennial ? addDays(order.product.deliveryStartDate, -crop.daysToFirstHarvest) : ''
  const sowFrom = sowBy ? maxDate(PLANNING_DATE, addDays(sowBy, -14)) : ''
  const missed = sowBy !== '' && sowBy < PLANNING_DATE
  const harvestStart = order.product.deliveryStartDate
  const harvestEnd = harvestStart ? addDays(harvestStart, crop.harvestSpanDays) : ''
  const line = plan?.lines.find((l) => l.order.id === order.id)
  const variety = order.product.variety || crop.defaultVariety

  let reco: string
  const localizedCrop = cropLabel(crop.name, t)
  if (crop.perennial) reco = `${t('demand_reco_orchard', { crop: localizedCrop, existing: fmtT(plan?.existingKg ?? 0, lang), demand: fmtT(qty, lang) })}${plan && plan.gapKg > 0 ? ` ${t('demand_reco_orchard_gap')}` : ''}`
  else if (missed) reco = t('demand_reco_missed', { delivery: shortDate(order.product.deliveryStartDate, lang), sowBy: shortDate(sowBy, lang) })
  else if (order.product.orderType === 'Indicative') reco = t('demand_reco_indicative', { area: formatNumber(acres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), crop: localizedCrop, variety, })
  else reco = `${t('demand_reco_committed', { area: formatNumber(acres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), crop: localizedCrop, variety, quantity: fmtT(qty, lang), expected: fmtT(line?.expectedKg ?? 0, lang) })}${line?.farmerConfirmedKg ? ` ${t('demand_reco_farmer_confirmation', { quantity: fmtT(line.farmerConfirmedKg, lang) })}` : ` ${t('demand_reco_no_farmer_confirmation')}`}`

  return <>
    <div className="m-impact-head">
      <span className="e" aria-hidden="true">{crop.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}><strong>{t('demand_crop_demand', { crop: localizedCrop })}</strong> <span className="m-small">({t('demand_selected')})</span><div className="m-small">{order.buyer.name} · {marketName(marketOf(order), t)}</div></div>
      <span className={`m-dotstatus ${order.product.orderType === 'Confirmed' ? '' : 'ind'}`}>{t(order.product.orderType === 'Confirmed' ? 'demand_order_committed' : 'demand_order_indicative')}</span>
    </div>
    {line && <div className="m-impact-row"><span><Sprout size={20} />{t('demand_planned_for_order')}</span><span className="m-impact-val"><strong>{fmtT(line.expectedKg, lang)}</strong><span className={`m-feas ${lineStatusLabel[line.status].cls}`}><span>{t(lineStatusKeys[line.status])}</span></span></span></div>}
    <div className="m-impact-grid"><div>
    <div className="m-impact-row"><span><Wheat size={20} />{t('demand_recommended_area')} <InfoTip text={t('demand_area_tip')} /></span><strong>{crop.perennial ? t('demand_orchard') : `~${formatNumber(acres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ac`}</strong></div>
    <div className="m-impact-row"><span><Sprout size={20} />{t('demand_seed_requirement')} <InfoTip text={t('demand_seed_tip')} /></span><strong>{crop.perennial ? '—' : `~${formatNumber(acres * crop.seedKgPerAcre, lang, { minimumFractionDigits: acres * crop.seedKgPerAcre < 1 ? 2 : 1, maximumFractionDigits: acres * crop.seedKgPerAcre < 1 ? 2 : 1 })} kg`}</strong></div>
    <div className="m-impact-row"><span><CalendarDays size={20} />{t('demand_sowing_window')}</span><strong style={{ color: missed ? 'var(--bad)' : undefined }}>{crop.perennial ? t('demand_no_new_planting') : missed ? t('demand_sow_passed', { date: shortDate(sowBy, lang) }) : sowBy ? `${shortDate(sowFrom, lang)} – ${shortDate(sowBy, lang)}` : t('demand_add_delivery_dates')}</strong></div>
    <div className="m-impact-row"><span><Sprout size={20} />{t('demand_harvest_window')}</span><strong>{harvestStart ? dateRange(harvestStart, harvestEnd, lang) : '—'}</strong></div>
    {sowBy && !missed && <p className="m-small" style={{ margin: '8px 0 0' }}>{t('demand_days_to_sow', { count: daysBetween(PLANNING_DATE, sowBy) })} · {t('demand_days_to_harvest', { count: crop.daysToFirstHarvest })}</p>}
    </div><div>
    <div className="m-reco"><Info size={20} color="var(--forest)" style={{ flex: 'none', marginTop: 2 }} /><div><strong>{t('demand_recommendation')}</strong><p>{reco}</p></div></div>
    <div className="m-row" style={{ marginTop: 14 }}>
      {plan && <Link to={`/plan#${plan.crop.id}`} className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}>{t('demand_open_plan')} <ArrowRight size={15} /></Link>}
      {order.product.orderType === 'Indicative' && <button type="button" className="m-btn m-btn-secondary m-btn-sm" style={{ borderRadius: 10 }} onClick={confirmOrder}><BadgeCheck size={15} />{t('demand_mark_committed')}</button>}
      <Link to={`/buyer-orders/${order.id}/edit`} className="m-btn m-btn-ghost m-btn-sm"><FileEdit size={15} />{t('demand_edit')}</Link>
    </div>
    </div></div>
  </>
}

export default function BuyerOrders() {
  const { t, lang } = useI18n()
  const { orders } = useBuyerOrders()
  const [market, setMarket] = useState<MarketFilter>('All')
  const active = orders.filter((o) => o.status === 'Active').sort((a, b) => (a.product.orderType === b.product.orderType ? (a.product.deliveryStartDate || 'z').localeCompare(b.product.deliveryStartDate || 'z') : a.product.orderType === 'Confirmed' ? -1 : 1))
  const visible = active.filter((o) => market === 'All' || marketOf(o) === market)
  const [selectedId, setSelectedId] = useState(() => active[0]?.id ?? '')
  // The detail panel always describes a row the user can see under the current filter.
  const selected = visible.find((o) => o.id === selectedId) ?? visible[0]
  const other = orders.filter((o) => o.status !== 'Active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const sum = (list: BuyerOrder[]) => list.reduce((s, o) => s + Number(o.product.requiredQuantityKg || 0), 0)
  const confirmed = active.filter((o) => o.product.orderType === 'Confirmed')
  const indicative = active.filter((o) => o.product.orderType === 'Indicative')
  const higher = marketSignals.filter((s) => s.demandOutlook === 'Higher than usual')
  const lower = marketSignals.filter((s) => s.demandOutlook === 'Lower than usual' || s.regionalSupply === 'Oversupply risk')
  const signalWord = higher.length > lower.length + 1 ? t('demand_signal_strong') : higher.length >= lower.length ? t('demand_signal_mixed') : t('demand_signal_weak')

  return <div className="m-page">
    <PageHeader title={t('demand_title')} subtitle={t('demand_sub')} actions={<Link to="/buyer-orders/new" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><Plus size={17} />{t('demand_add_button')}</Link>} />

    <section className="m-panel" aria-labelledby="dov-title">
      <h2 className="m-panel-title sm" id="dov-title" style={{ marginBottom: 16 }}>{t('demand_overview')} <small>({t('demand_rabi')})</small> <InfoTip text={t('demand_active_tip')} /></h2>
      <div className="m-stats three">
        <StatCard icon={<CheckCircle2 size={24} />} label={t('demand_committed')} tip={t('demand_committed_tip')} value={fmtT(sum(confirmed), lang)} sub={t('demand_orders_first', { count: confirmed.length })} />
        <StatCard icon={<Sprout size={24} />} label={t('demand_indicative')} tip={t('demand_indicative_tip')} value={fmtT(sum(indicative), lang)} sub={t('demand_confirm_before_sowing', { count: indicative.length })} />
        <StatCard icon={<BarChart3 size={24} />} tone="amber" label={t('demand_market_signals')} tip={t('demand_market_signals_tip')} value={signalWord} sub={t('demand_higher_for', { crops: higher.map((s) => cropLabel(s.crop, t)).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3).join(', ') || '—' })} />
      </div>
    </section>

    <div className="m-cols m-cols-demand">
      <section className="m-panel" aria-labelledby="req-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="req-title">{t('demand_requests')}</h2><p className="m-panel-sub">{t('demand_select_to_review')} <a className="m-link" href="#impact-title">{t('demand_planting_impact_link')}</a>.</p></div>
          <div className="m-seg2" role="group" aria-label={t('demand_market_filter')}>{(['All', 'India', 'Singapore'] as MarketFilter[]).map((m) => <button key={m} type="button" aria-pressed={market === m} onClick={() => setMarket(m)}>{market === 'All' && m === 'All' ? t('market_all') : marketName(m, t)} <span className="m-small">{active.filter((o) => m === 'All' || marketOf(o) === m).length}</span></button>)}</div>
        </div>
        <div className="m-dt-scroll"><table className="m-dt">
          <thead><tr><th>{t('demand_crop')}</th><th>{t('demand_buyer_market')}</th><th>{t('demand_quantity')}</th><th>{t('demand_delivery')}</th><th>{t('demand_status')} <InfoTip text={t('demand_status_tip')} /></th><th>{t('demand_price')}</th></tr></thead>
          <tbody>{visible.map((o) => {
            const crop = findCrop(o.product.crop)
            const displayCrop = cropLabel(o.product.crop, t)
            return <tr key={o.id} className={`click ${selected?.id === o.id ? 'sel' : ''}`} {...rowActivation(() => setSelectedId(o.id))} aria-current={selected?.id === o.id ? "true" : undefined} aria-label={t('demand_selected_row', { crop: displayCrop, buyer: o.buyer.name })}>
              <td><span className="m-crop"><span className="e" aria-hidden="true">{crop?.emoji ?? '🌾'}</span><span>{displayCrop}<small>{o.product.variety || t('demand_any_variety')}</small></span></span></td>
              <td style={{ minWidth: 130 }}>{o.buyer.name}<small><span className={`m-mkt sm ${marketOf(o) === 'Singapore' ? 'sg' : ''}`}>{marketName(marketOf(o), t)}</span></small></td>
              <td className="num"><strong>{fmtT(Number(o.product.requiredQuantityKg), lang)}</strong></td>
              <td className="nowrap">{dateRange(o.product.deliveryStartDate, o.product.deliveryEndDate, lang)}</td>
              <td><span className={`m-dotstatus ${o.product.orderType === 'Confirmed' ? '' : 'ind'}`}>{t(o.product.orderType === 'Confirmed' ? 'demand_order_committed' : 'demand_order_indicative')}</span></td>
              <td className="num">{price(o, lang)}</td>
            </tr>
          })}{!visible.length && <tr><td colSpan={6}><span className="m-small">{market === 'All' ? t('demand_no_active_all') : t('demand_no_active_market', { market: marketName(market, t) })}</span></td></tr>}</tbody>
        </table></div>
      </section>

      <section className="m-panel" aria-labelledby="impact-title">
        <h2 className="m-panel-title sm" id="impact-title" tabIndex={-1}><Sprout size={26} color="var(--forest)" />{t('demand_planting_impact')}</h2>
        <p className="m-panel-sub" style={{ marginBottom: 14 }}>{t('demand_impact_description')}</p>
        {selected ? <PlantingImpact order={selected} /> : <p className="m-small">{t('demand_select_to_review')}.</p>}
      </section>
    </div>

    <details className="m-panel m-details">
      <summary style={{ paddingTop: 0 }}><LineIcon size={16} />{t('market_signal_count', { count: marketSignals.length })}</summary>
      <p className="m-small" style={{ margin: '8px 0 10px' }}>{t('market_signal_disclaimer')}</p>
      <div className="m-dt-scroll"><table className="m-dt">
        <thead><tr><th>{t('market_crop_market')}</th><th>{t('market_window')}</th><th>{t('market_outlook')}</th><th>{t('market_regional_supply')}</th><th>{t('market_price_band')}</th><th>{t('market_confidence')}</th></tr></thead>
        <tbody>{marketSignals.map((s) => <tr key={s.id}>
          <td><span className="m-crop" style={{ fontSize: 15 }}><span className="e" style={{ fontSize: 20 }}>{findCrop(s.crop)?.emoji}</span>{cropLabel(s.crop, t)}</span><small>{marketName(s.market, t)} · {t(marketLabelKeys[s.marketLabel])}</small></td>
          <td style={{ whiteSpace: 'nowrap' }}>{marketWindow(s.window, lang)}</td>
          <td>{t(marketValueKeys[s.demandOutlook])}<small>{t(reasonKeys[s.id])}</small></td>
          <td><span className={`m-feas ${s.regionalSupply === 'Oversupply risk' ? 'low' : s.regionalSupply === 'Tight' ? 'high' : 'medium'}`}><span>{t(marketValueKeys[s.regionalSupply])}</span></span></td>
          <td style={{ whiteSpace: 'nowrap' }}>{formatINR(s.priceBandInr[0], lang, { maximumFractionDigits: 0 })}–{formatINR(s.priceBandInr[1], lang, { maximumFractionDigits: 0 })}/kg</td>
          <td>{t(marketValueKeys[s.confidence])}</td>
        </tr>)}</tbody>
      </table></div>
    </details>

    {other.length > 0 && <details className="m-panel m-details">
      <summary style={{ paddingTop: 0 }}><ChevronRight className="m-chev" size={16} />{t('orders_drafts_past', { count: other.length })}</summary>
      <div className="m-stack" style={{ gap: 0, marginTop: 8 }}>
        {other.map((o) => <Link key={o.id} to={`/buyer-orders/${o.id}`} className="m-action" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}><strong>{o.product.crop ? cropLabel(o.product.crop, t) : t('order_crop_pending')} · {o.buyer.name}</strong><span className="m-small">{o.id} · {o.product.requiredQuantityKg === '' ? t('order_quantity_pending') : fmtT(Number(o.product.requiredQuantityKg), lang)} · {dateRange(o.product.deliveryStartDate, o.product.deliveryEndDate, lang)}</span></div>
          <span className={`m-tag ${o.status === 'Draft' ? 'm-tag-marigold' : o.status === 'Cancelled' ? 'm-tag-bad' : 'm-tag-neutral'}`}>{t(o.status === 'Draft' ? 'status_draft' : o.status === 'Cancelled' ? 'status_cancelled' : 'status_active')}</span><ArrowRight size={16} />
        </Link>)}
      </div>
    </details>}
  </div>
}
