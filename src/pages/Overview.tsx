import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ChevronDown, Info, ListChecks, MessageCircle, Sprout, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, SEASON_LABEL, farmerEligibility, plotAcres, plotBusyUntil, presetFor, replyStateFor } from '../planning/engine'
import type { Opportunity } from '../planning/engine'
import { daysBetween, fmtDay, fmtInr, fmtKg, fmtPct } from '../planning/format'
import { CropIcon, SourceLegend, SourceTag, SupplyMeter, VerdictBadge } from '../components/ui'

const trendIcon = (o: string) => (o === 'Higher than usual' ? <TrendingUp size={14} /> : o === 'Lower than usual' ? <TrendingDown size={14} /> : <Minus size={14} />)

function OpportunityRow({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false)
  const { plan } = opp
  const signal = opp.signals[0]
  const variety = plan?.varieties[0] ?? opp.crop.defaultVariety
  return <article className="m-opp" data-open={open}>
    <button type="button" className="m-opp-main" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <div className="m-opp-crop"><CropIcon emoji={opp.crop.emoji} label={opp.crop.name} /><div style={{ minWidth: 0 }}><strong>{opp.crop.name}</strong><span className="m-small">{variety}</span><div><VerdictBadge verdict={opp.verdict} /></div></div></div>
      <div className="m-opp-col m-opp-demand">
        <small>Buyer demand</small>
        {plan ? <>
          <div className="m-big">{fmtKg(plan.confirmedKg + plan.indicativeKg)}</div>
          <span className="m-small">{plan.confirmedKg ? `${fmtKg(plan.confirmedKg)} confirmed` : 'All indicative'}{plan.confirmedKg && plan.indicativeKg ? ` · ${fmtKg(plan.indicativeKg)} indicative` : ''}</span>
        </> : <span className="m-small">No buyer orders</span>}
      </div>
      <div className="m-opp-col m-opp-forecast">
        <small>Market forecast</small>
        {signal ? <>
          <div className="m-row" style={{ gap: 6 }}><span className="m-tag m-tag-forecast">{trendIcon(signal.demandOutlook)}{signal.demandOutlook.replace(' than usual', '').replace(' to usual', '')}</span></div>
          <span className="m-small">{signal.regionalSupply === 'Oversupply risk' ? 'Oversupply risk · ' : ''}₹{signal.priceBandInr[0]}–{signal.priceBandInr[1]}/kg</span>
        </> : <span className="m-small">No signal</span>}
      </div>
      <div className="m-opp-col">
        <small>Our expected supply</small>
        {plan && plan.status !== 'not-in-scenario' && plan.window !== 'missed' ? <>
          <SupplyMeter plan={plan} />
          <span className="m-small m-num" style={{ display: 'block', marginTop: 6 }}>{fmtKg(plan.expectedKg)} of {fmtKg(plan.targetKg)} target{plan.window === 'urgent' || plan.window === 'open' ? ` · sow by ${fmtDay(plan.sowBy)}` : ''}</span>
        </> : plan?.status === 'not-in-scenario' ? <span className="m-small">Not planned in this scenario (indicative only)</span>
          : plan?.window === 'missed' ? <span className="m-small">Sowing window has passed</span>
          : <span className="m-small">{opp.suitableAcres > 0 ? `${opp.suitableAcres.toFixed(1)} ac on ${opp.suitableFarmers} farms could grow it` : 'No suitable land'}</span>}
      </div>
      <ChevronDown className="m-opp-chev" size={20} aria-hidden="true" />
    </button>
    {open && <div className="m-opp-body">
      <div className="m-stack" style={{ gap: 12 }}>
        <strong style={{ fontSize: 16 }}>{opp.headline}</strong>
        <ul className="m-why">
          {opp.why.map((w) => <li key={w.text}><SourceTag kind={w.source === 'order' ? (w.tone === 'good' ? 'order' : 'indicative') : w.source} /><span>{w.text}</span></li>)}
        </ul>
        {opp.signals.map((s) => <p key={s.id} className="m-small" style={{ margin: 0 }}><strong>{s.market} forecast:</strong> {s.reason} Window {s.window}.</p>)}
      </div>
      <div className="m-stack" style={{ gap: 12 }}>
        <div className="m-facts" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <div><small>Sow by</small><strong>{plan?.sowBy ? fmtDay(plan.sowBy) : opp.crop.perennial ? 'Orchard' : '—'}</strong><span>{opp.crop.perennial ? 'No new planting' : `${opp.crop.daysToFirstHarvest} days to harvest`}</span></div>
          <div><small>Harvest</small><strong>{plan?.harvestStart ? fmtDay(plan.harvestStart) : '—'}</strong><span>{plan?.deliveryEnd ? `Delivery to ${fmtDay(plan.deliveryEnd)}` : `${opp.crop.harvestSpanDays}-day picking`}</span></div>
          <div><small>Suitable land</small><strong>{opp.suitableAcres.toFixed(1)} ac</strong><span>{opp.suitableFarmers} participating farms</span></div>
          <div><small>Price</small><strong>{plan?.avgPriceInr ? `${fmtInr(plan.avgPriceInr)}/kg` : signal ? `₹${signal.priceBandInr[0]}–${signal.priceBandInr[1]}` : '—'}</strong><span>{plan?.avgPriceInr ? 'Buyer price (avg.)' : 'Forecast band – not a quote'}</span></div>
        </div>
        <div className="m-row">
          {plan && <Link className="m-btn m-btn-primary m-btn-sm" to={`/plan#${opp.crop.id}`}>See plan <ArrowRight size={15} /></Link>}
          <Link className="m-btn m-btn-secondary m-btn-sm" to="/demand">{plan ? 'View orders' : 'Add buyer demand'}</Link>
        </div>
      </div>
    </div>}
  </article>
}

export default function Overview() {
  const { result, responses, changes, scenario, messages } = usePlan()
  const { data } = useFarmers()
  const worth = result.opportunities.filter((o) => o.verdict === 'strong' || o.verdict === 'consider')
  const confirmedCov = result.confirmedDemandKg ? result.confirmedCoveredKg / result.confirmedDemandKg : 0
  const states = result.farmersInvolved.map((id) => replyStateFor(id, responses, result.allocations))
  const confirmedFarmers = states.filter((s) => s === 'confirmed').length
  const messaged = states.filter((s) => s !== 'not-sent').length
  const nextSow = result.plans.filter((p) => (p.window === 'open' || p.window === 'urgent') && p.allocations.length).sort((a, b) => a.sowBy.localeCompare(b.sowBy))[0]
  const eligibleFarmers = data.farmers.filter((f) => !farmerEligibility(f, responses[f.id]))
  const freeAcres = data.plots.filter((p) => eligibleFarmers.some((f) => f.id === p.farmerId) && !plotBusyUntil(data, p.id)).reduce((s, p) => s + plotAcres(p), 0)
  const unknownPlots = data.plots.filter((p) => eligibleFarmers.some((f) => f.id === p.farmerId) && (p.waterAvailability === 'Unknown' || !p.soilType)).length
  const activeOrders = result.plans.reduce((s, p) => s + p.orders.length, 0)
  const preset = presetFor(scenario)
  const replies = messages.filter((m) => m.direction === 'in').length

  const journey = [
    { to: '/demand', title: 'Understand demand', detail: `${activeOrders} active orders · ${fmtKg(result.confirmedDemandKg)} confirmed`, state: activeOrders ? 'done' : 'attn' },
    { to: '/#opportunities', title: 'Spot opportunities', detail: `${worth.length} crops worth planting`, state: 'done' },
    { to: '/farmers', title: 'Check feasibility', detail: `${eligibleFarmers.length} farmers · ${freeAcres.toFixed(1)} ac free${unknownPlots ? ` · ${unknownPlots} need details` : ''}`, state: unknownPlots ? 'attn' : 'done' },
    { to: '/plan', title: 'Build the plan', detail: `${result.totalAcres.toFixed(1)} ac · ${fmtPct(confirmedCov)} of confirmed demand`, state: 'done' },
    { to: '/messages', title: 'Message farmers', detail: `${messaged}/${result.farmersInvolved.length} messaged · ${confirmedFarmers} confirmed`, state: messaged === result.farmersInvolved.length && messaged > 0 ? 'done' : 'attn' },
    { to: '/plan#history', title: 'Update the plan', detail: `${replies} replies · ${changes.length} plan changes`, state: changes.length ? 'done' : '' },
  ]

  return <div className="m-page">
    <section className="m-hero" aria-labelledby="hero-title">
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="m-eyebrow">{SEASON_LABEL} · planning as of {fmtDay(PLANNING_DATE)}</div>
        <h1 className="m-h1" id="hero-title"><em>{worth.length} crops</em> are worth planting this season</h1>
        <p>The {preset ? <strong>{preset.label.toLowerCase()}</strong> : 'custom'} plan covers <strong>{fmtPct(confirmedCov)}</strong> of confirmed buyer demand using {result.totalAcres.toFixed(1)} acres across {result.farmersInvolved.length} farmers.</p>
        <div className="m-row">
          <Link to="/plan" className="m-btn m-btn-accent"><Sprout size={18} /> Review planting plan</Link>
          <Link to="/messages" className="m-btn m-btn-tertiary"><MessageCircle size={18} /> Message farmers</Link>
        </div>
      </div>
      <div className="m-hero-stats">
        <Link to="/plan" className="m-hero-stat"><div><strong>{fmtPct(confirmedCov)}</strong><span>Confirmed demand covered by plan</span></div><ArrowRight size={18} /></Link>
        <Link to="/messages" className="m-hero-stat"><div><strong>{confirmedFarmers} of {result.farmersInvolved.length}</strong><span>Farmers confirmed their planting</span></div><ArrowRight size={18} /></Link>
        {nextSow && <Link to={`/plan#${nextSow.crop.id}`} className="m-hero-stat"><div><strong>{fmtDay(nextSow.sowBy)}</strong><span>Next sowing deadline – {nextSow.crop.name.toLowerCase()} ({daysBetween(PLANNING_DATE, nextSow.sowBy)} days)</span></div><ArrowRight size={18} /></Link>}
      </div>
    </section>

    <nav className="m-journey" aria-label="Planning journey">
      {journey.map((step, i) => <Link key={step.title} to={step.to} className={step.state}>
        <span className="m-journey-num"><i>{step.state === 'done' ? '✓' : i + 1}</i>Step {i + 1}</span>
        <strong>{step.title}</strong>
        <span className="m-small">{step.detail}</span>
      </Link>)}
    </nav>

    <div className="m-grid-main">
      <section className="m-stack" id="opportunities" aria-labelledby="opp-title" style={{ scrollMarginTop: 20 }}>
        <div>
          <h2 className="m-h2" id="opp-title">Crop opportunities</h2>
          <p className="m-sub">Every crop with buyer demand or a market signal, ranked by how strong the case is. Click a crop to see why.</p>
        </div>
        <SourceLegend />
        <div className="m-opps">{result.opportunities.map((o) => <OpportunityRow key={o.crop.id} opp={o} />)}</div>
        <p className="m-footnote"><Info size={15} style={{ flex: 'none', marginTop: 2 }} />Forecasts are synthetic scenarios for this demo and are not guaranteed demand, prices or yields. Expected supply uses indicative yield ranges; real harvests vary with weather and practice.</p>
      </section>

      <aside className="m-stack">
        <section className="m-card" aria-labelledby="actions-title">
          <div className="m-card-head" style={{ marginBottom: 12 }}><div><h2 className="m-h3" id="actions-title"><ListChecks size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Next actions</h2><p className="m-sub">What to do now to secure supply</p></div></div>
          <div className="m-actions">
            {result.actions.slice(0, 6).map((a) => <Link key={a.id} to={a.to} className="m-action">
              <span className={`m-action-ico ${a.tone}`}>{a.tone === 'urgent' ? <AlertTriangle size={16} /> : a.tone === 'attention' ? <ArrowRight size={16} /> : <Info size={16} />}</span>
              <div><strong>{a.title}</strong><span className="m-small">{a.detail}</span><span className="m-action-cta">{a.cta} <ArrowRight size={13} /></span></div>
            </Link>)}
            {!result.actions.length && <p className="m-small">Nothing urgent. Your plan is on track.</p>}
          </div>
        </section>
        <section className="m-card m-card-sage" aria-labelledby="dates-title">
          <h2 className="m-h3" id="dates-title" style={{ marginBottom: 10 }}>Sowing deadlines</h2>
          <div className="m-stack" style={{ gap: 10 }}>
            {result.plans.filter((p) => p.sowBy).map((p) => <Link key={p.crop.id} to={`/plan#${p.crop.id}`} className="m-row" style={{ textDecoration: 'none', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span>{p.crop.emoji} {p.crop.name}</span>
              <span className={`m-tag ${p.window === 'urgent' ? 'm-tag-bad' : p.window === 'missed' ? 'm-tag-neutral' : 'm-tag-plan'}`}>{p.window === 'missed' ? 'Passed' : `${fmtDay(p.sowBy)} · ${daysBetween(PLANNING_DATE, p.sowBy)}d`}</span>
            </Link>)}
          </div>
        </section>
      </aside>
    </div>
  </div>
}
