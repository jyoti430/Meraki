import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { AlertTriangle, ArrowRight, BarChart3, ChevronDown, Clock3, CloudRain, Info, ShoppingBag, Sprout, TrendingDown, UsersRound, Zap } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, farmerEligibility } from '../planning/engine'
import type { Opportunity } from '../planning/engine'
import { daysBetween, fmtDay, fmtPct } from '../planning/format'
import { weeklySeries } from '../planning/series'
import { Feasibility, InfoTip, SourceTag, StatCard } from '../components/ui'
import LineChart from '../components/LineChart'
import PageHeader from '../components/layout/PageHeader'

export const fmtT = (kg: number) => (Math.abs(kg) >= 1000 ? `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${Math.round(kg).toLocaleString('en-IN')} kg`)

export function feasibilityOf(o: Opportunity): 'high' | 'medium' | 'low' {
  if (o.crop.perennial) return (o.plan?.existingKg ?? 0) > 0 ? 'medium' : 'low'
  if (o.plan?.window === 'missed' || o.suitableAcres === 0) return 'low'
  const need = o.plan ? (o.plan.confirmedKg + o.plan.indicativeKg) / o.crop.yieldPerAcre[1] : 0
  return o.suitableAcres >= need && !o.why.some((w) => w.source === 'farm' && w.tone !== 'good') ? 'high' : 'medium'
}

function actionFor(o: Opportunity): { label: string; to: string; tone: '' | 'warn' | 'bad' } {
  const p = o.plan
  if (o.verdict === 'too-late') return { label: 'Agree a later window', to: '/demand', tone: 'bad' }
  if (o.crop.perennial) return p && p.shortfallKg > 0 ? { label: `Short by ~${fmtT(p.shortfallKg)}`, to: '/demand', tone: 'warn' } : { label: 'Coordinate harvest', to: '/plan', tone: '' }
  if (!p) return o.verdict === 'caution' ? { label: 'Avoid adding area', to: '/demand', tone: 'bad' } : { label: 'Find a buyer first', to: '/demand', tone: 'warn' }
  if (p.status === 'not-in-scenario') return { label: 'Confirm buyer first', to: '/demand', tone: 'warn' }
  if (p.status === 'gap' || p.status === 'partial') return { label: 'Expand planting', to: `/plan#${o.crop.id}`, tone: 'warn' }
  if (p.confirmedKg === 0) return { label: 'Confirm buyer first', to: '/demand', tone: '' }
  return { label: 'Review proposed plan', to: `/plan#${o.crop.id}`, tone: '' }
}

function DemandBar({ o, max }: { o: Opportunity; max: number }) {
  const w = (kg: number) => `${Math.max(kg > 0 ? 6 : 0, (kg / max) * 110)}px`
  if (!o.plan) return <div className="m-dbar" title="Market forecast only – no buyer orders"><i className="f" style={{ width: 60 }} /></div>
  return <div className="m-dbar" title={`${fmtT(o.plan.confirmedKg)} confirmed · ${fmtT(o.plan.indicativeKg)} indicative`}>
    {o.plan.confirmedKg > 0 && <i className="c" style={{ width: w(o.plan.confirmedKg) }} />}
    {o.plan.indicativeKg > 0 && <i className="n" style={{ width: w(o.plan.indicativeKg) }} />}
    {o.signals.length > 0 && <i className="f" style={{ width: 22 }} />}
  </div>
}

export default function Overview() {
  const { t } = useI18n()
  const { result, responses } = usePlan()
  const { data } = useFarmers()
  const [open, setOpen] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])

  const inScope = result.plans.filter((p) => p.status !== 'not-in-scenario')
  const demandKg = result.plans.reduce((s, p) => s + p.confirmedKg + p.indicativeKg, 0)
  const confirmedKg = result.plans.reduce((s, p) => s + p.confirmedKg, 0)
  const supplyKg = result.plans.reduce((s, p) => s + p.expectedKg, 0)
  const gapKg = inScope.reduce((s, p) => s + p.shortfallKg, 0)
  const eligible = data.farmers.filter((f) => !farmerEligibility(f, responses[f.id]))
  const villages = new Set(eligible.map((f) => f.village)).size
  const maxDemand = Math.max(1, ...result.opportunities.map((o) => (o.plan ? o.plan.confirmedKg + o.plan.indicativeKg : 0)))

  const weeks = useMemo(() => weeklySeries(result.plans), [result.plans])
  const weekLabels = weeks.map((_, i) => `W${i + 1}`)
  const weekSubs = weeks.map((w) => fmtDay(w.start))
  const chartDemand = weeks.reduce((s, w) => s + w.demand, 0)
  const chartSupply = weeks.reduce((s, w) => s + w.supply, 0)

  const watchouts = [
    ...result.plans.filter((p) => p.window === 'urgent' && p.allocations.length).map((p) => ({ icon: <Clock3 size={20} />, tone: 'bad', title: `Review ${p.crop.name.toLowerCase()} sowing window by ${fmtDay(p.sowBy)}`, text: `${daysBetween(PLANNING_DATE, p.sowBy)} days left for the proposed window. Confirm buyer demand and farmer acceptance before planting.` })),
    ...inScope.filter((p) => p.shortfallKg > 0).map((p) => ({ icon: <Sprout size={20} />, tone: 'warn', title: `${p.crop.name} supply short by ${fmtT(p.shortfallKg || p.gapKg)}`, text: p.crop.perennial ? 'Orchard crop – agree a smaller volume or later window.' : 'Increase area or mobilise more farmers.' })),
    ...result.opportunities.filter((o) => o.signals.some((s) => s.regionalSupply === 'Oversupply risk')).map((o) => ({ icon: <TrendingDown size={20} />, tone: 'warn', title: `${o.crop.name}: oversupply risk forecast`, text: `Prices may fall to ₹${o.signals[0].priceBandInr[0]}–${o.signals[0].priceBandInr[1]}/kg. Avoid adding area without a buyer.` })),
    { icon: <CloudRain size={20} />, tone: '', title: 'Weather is not yet modelled', text: 'Yields use indicative ranges. Add a buffer in Planting Plans for weather risk.' },
  ].slice(0, 4)

  return <div className="m-page">
    <PageHeader title={t('overview_title')} subtitle={t('overview_subtitle')} />

    <section className="m-stats" aria-label="Season summary">
      <StatCard icon={<ShoppingBag size={24} />} label={t('buyer_demand')} tip="All active buyer orders, committed and indicative" value={fmtT(demandKg)} sub={<>{fmtT(confirmedKg)} buyer-committed</>} />
      <StatCard icon={<Sprout size={24} />} label={t('expected_supply')} tip="Planned planting at the scenario's yield assumption plus crops already growing" value={fmtT(supplyKg)} sub={<>{result.totalAcres.toFixed(1)} acres planned</>} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label={t('supply_gaps')} tip="Buyer quantity not met by expected supply, checked order by order" value={fmtT(gapKg)} sub={<>≈ {fmtPct(demandKg ? gapKg / demandKg : 0)} of demand</>} />
      <StatCard icon={<UsersRound size={24} />} label={t('participating_farms')} value={eligible.length} sub={<>across {villages} villages</>} />
    </section>

    <>
      <section className="m-panel" id="opportunities" aria-labelledby="opp-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="opp-title">{t('opportunities_title')}</h2><p className="m-panel-sub">{t('opportunities_sub')}</p></div>
          <div className="m-legend2">
            <span><i style={{ background: '#2e7d32' }} />Committed <InfoTip text="Buyer has committed to quantity, window and price" /></span>
            <span><i style={{ background: '#9ccc65' }} />Indicative <InfoTip text="Buyer interest, not committed" /></span>
            <span><i style={{ border: '1.5px dashed #9ccc65' }} />Forecast <InfoTip text="Synthetic market signal – not guaranteed" /></span>
          </div>
        </div>
        <div className="m-dt-scroll"><table className="m-dt">
          <thead><tr><th>Crop <InfoTip text="Feasibility: can participating farms grow it in time, with their water and soil?" /></th><th>Buyer demand</th><th>Expected supply <InfoTip text="Planned harvest plus eligible crops already growing – not yet guaranteed" /></th><th>Gap <InfoTip text="Buyer quantity not met, checked order by order" /></th><th>Recommended action</th><th><span className="sr-only">Details</span></th></tr></thead>
          <tbody>{result.opportunities.map((o) => {
            const a = actionFor(o)
            const isOpen = open === o.crop.id
            return <Fragment key={o.crop.id}>
              <tr className="click" onClick={() => setOpen(isOpen ? null : o.crop.id)} aria-expanded={isOpen}>
                <td><span className="m-crop"><span className="e" aria-hidden="true">{o.crop.emoji}</span><span>{o.crop.name}<small style={{ marginTop: 4 }}><Feasibility level={feasibilityOf(o)} /></small></span></span></td>
                <td><strong>{o.plan ? fmtT(o.plan.confirmedKg + o.plan.indicativeKg) : '—'}</strong><DemandBar o={o} max={maxDemand} /></td>
                <td><strong>{o.plan && o.plan.status !== 'not-in-scenario' ? fmtT(o.plan.expectedKg) : '—'}</strong></td>
                <td className="num">{!o.plan ? <span className="m-small">—</span> : o.plan.status === 'not-in-scenario' ? <span className="m-small">Indicative only</span> : o.plan.shortfallKg > 0 ? <strong style={{ color: 'var(--bad)' }}>−{fmtT(o.plan.shortfallKg)}</strong> : <span className="m-small" style={{ color: 'var(--good)' }}>None</span>}</td>
                <td><Link to={a.to} className={`m-action-btn ${a.tone}`} onClick={(e) => e.stopPropagation()}>{a.label}<ArrowRight size={16} /></Link></td>
                <td><ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--mute)' }} /></td>
              </tr>
              {isOpen && <tr><td colSpan={6} style={{ background: '#fafcf8' }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>{o.headline}</strong>
                <ul className="m-why">{o.why.map((w) => <li key={w.text}><SourceTag kind={w.source === 'order' ? (w.tone === 'good' ? 'order' : 'indicative') : w.source} /><span>{w.text}</span></li>)}</ul>
              </td></tr>}
            </Fragment>
          })}</tbody>
        </table></div>
      </section>

      <div className="m-cols-even m-stretch">
        <section className="m-panel" aria-labelledby="next-title">
          <h2 className="m-panel-title sm" id="next-title"><Zap size={24} />{t('next_actions')}</h2>
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>Keep your seasonal plan on track.</p>
          <ul className="m-checklist">{result.actions.slice(0, 5).map((a) => {
            const isDone = done.includes(a.id)
            return <li key={a.id} className={isDone ? 'done' : ''}>
              <input type="checkbox" checked={isDone} onChange={() => setDone((d) => (isDone ? d.filter((x) => x !== a.id) : [...d, a.id]))} aria-label={`Mark "${a.title}" done`} />
              <Link to={a.to}><strong>{a.title}</strong><span>{a.detail}</span></Link>
            </li>
          })}</ul>
        </section>
        <section className="m-panel" aria-labelledby="watch-title">
          <h2 className="m-panel-title sm" id="watch-title"><AlertTriangle size={24} />{t('watchouts')}</h2>
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>Risks to monitor for this season.</p>
          <ul className="m-why2">{watchouts.map((w) => <li key={w.title}><span className={`m-roundico ${w.tone}`}>{w.icon}</span><div><strong>{w.title}</strong><span>{w.text}</span></div></li>)}</ul>
        </section>
      </div>
    </>

    {weeks.length > 0 && <section className="m-panel" aria-labelledby="sd-title">
      <div className="m-panel-head">
        <div><h2 className="m-panel-title" id="sd-title"><BarChart3 size={24} color="var(--forest)" />{t('supply_vs_demand')} <small>(delivery season, {weeks.length} weeks)</small></h2><p className="m-panel-sub">Projected weekly supply against total buyer demand across all crops.</p></div>
        <div className="m-minis row">
          <div className="m-mini"><small>Demand (total)</small><strong>{fmtT(chartDemand)}</strong></div>
          <div className="m-mini"><small>Supply (projected)</small><strong>{fmtT(chartSupply)}</strong></div>
          <div className="m-mini amber"><small>{chartSupply >= chartDemand ? 'Surplus' : 'Gap'}</small><strong>{fmtT(Math.abs(chartDemand - chartSupply))}</strong></div>
        </div>
      </div>
      <LineChart ariaLabel="Weekly buyer demand versus projected supply" labels={weekLabels} sublabels={weekSubs}
        series={[{ label: 'Total demand (confirmed + indicative)', color: '#1b5e20', values: weeks.map((w) => w.demand / 1000) }, { label: 'Projected supply (forecast)', color: '#7cc35b', values: weeks.map((w) => w.supply / 1000), fill: true }]} />
      <p className="m-footnote" style={{ marginTop: 10 }}><Info size={15} style={{ flex: 'none', marginTop: 2 }} />Demand is spread over each order’s delivery window and supply over each crop’s harvest window. Forecasts and yields are synthetic, indicative values – not guaranteed.</p>
    </section>}
  </div>
}
