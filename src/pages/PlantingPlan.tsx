import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, History, Info, MinusCircle, PlusCircle, SlidersHorizontal, UserX } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, exclusionKey, presetFor, replyStateFor, runPlan, scenarioPresets } from '../planning/engine'
import type { CropPlan, Scenario } from '../planning/engine'
import { addDays, daysBetween, fmtAcres, fmtDay, fmtKg, fmtPct, toDate } from '../planning/format'
import { CropIcon, PlanStatus, Reasons, ReplyBadge, SourceTag, SupplyMeter } from '../components/ui'

const CAL_START = '2026-11-01'
const CAL_MONTHS = 9

function Calendar({ plans }: { plans: CropPlan[] }) {
  const end = addDays(CAL_START, 0)
  const total = daysBetween(CAL_START, (() => { const d = toDate(end); d.setUTCMonth(d.getUTCMonth() + CAL_MONTHS); return d.toISOString().slice(0, 10) })())
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (daysBetween(CAL_START, iso) / total) * 100))}%`
  const width = (a: string, b: string) => `calc(${pos(b)} - ${pos(a)})`
  const months = Array.from({ length: CAL_MONTHS }, (_, i) => { const d = toDate(CAL_START); d.setUTCMonth(d.getUTCMonth() + i); return new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(d) })
  const rows = plans.filter((p) => p.harvestStart)
  return <div className="m-cal" style={{ ['--months' as string]: CAL_MONTHS }}>
    <span />
    <div className="m-cal-months" style={{ gridTemplateColumns: `repeat(${CAL_MONTHS}, 1fr)` }}>{months.map((m) => <span key={m}>{m}</span>)}</div>
    {rows.map((p) => <div key={p.crop.id} style={{ display: 'contents' }}>
      <a className="m-cal-label" href={`#${p.crop.id}`} style={{ textDecoration: 'none' }}>{p.crop.emoji} {p.crop.name}</a>
      <div className="m-cal-track" role="img" aria-label={`${p.crop.name}: ${p.sowBy ? `sow ${fmtDay(p.sowFrom)} to ${fmtDay(p.sowBy)}, ` : ''}harvest ${fmtDay(p.harvestStart)} to ${fmtDay(p.harvestEnd)}, delivery ${fmtDay(p.deliveryStart)} to ${fmtDay(p.deliveryEnd)}`}>
        {p.sowBy && p.window !== 'missed' && <>
          <span className="m-cal-bar grow" style={{ left: pos(p.sowBy), width: width(p.sowBy, p.harvestStart) }} />
          <span className="m-cal-bar sow" style={{ left: pos(p.sowFrom), width: `max(6px, ${width(p.sowFrom, p.sowBy)})` }} />
        </>}
        <span className="m-cal-bar harvest" style={{ left: pos(p.harvestStart), width: width(p.harvestStart, p.harvestEnd), opacity: p.window === 'missed' ? .35 : 1 }} />
        <span className="m-cal-bar deliver" style={{ left: pos(p.deliveryStart), width: width(p.deliveryStart, p.deliveryEnd) }} />
        <span className="m-cal-today" style={{ left: pos(PLANNING_DATE) }} />
      </div>
    </div>)}
    <span />
    <div className="m-meter-legend" style={{ marginTop: 4 }}>
      <span><i className="m-swatch" style={{ background: 'var(--marigold)' }} /> Sowing window</span>
      <span><i className="m-swatch" style={{ background: '#cfe3d6' }} /> Growing</span>
      <span><i className="m-swatch" style={{ background: 'var(--forest)' }} /> Harvest</span>
      <span><i className="m-swatch" style={{ border: '2px dashed var(--order)' }} /> Buyer delivery window</span>
      <span><i className="m-swatch" style={{ background: 'var(--bad)', width: 2 }} /> Today</span>
    </div>
  </div>
}

function CropPlanCard({ plan }: { plan: CropPlan }) {
  const { responses, result, toggleExclusion, exclusions } = usePlan()
  const yieldNote = `${plan.crop.yieldPerAcre[0].toLocaleString('en-IN')}–${plan.crop.yieldPerAcre[2].toLocaleString('en-IN')} kg/acre`
  const restorable = plan.unused.filter((u) => exclusions.includes(exclusionKey(u.plotId, plan.crop.name)))
  return <section className="m-card m-cropplan" id={plan.crop.id} aria-labelledby={`${plan.crop.id}-title`}>
    <div className="m-cropplan-head">
      <div className="m-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <CropIcon emoji={plan.crop.emoji} label={plan.crop.name} />
        <div>
          <h2 className="m-h2" id={`${plan.crop.id}-title`}>{plan.crop.name} <span className="m-small" style={{ fontWeight: 500, fontFamily: 'var(--font-body)', fontSize: 15 }}>{plan.varieties.join(', ') || plan.crop.defaultVariety}</span></h2>
          <div className="m-row" style={{ marginTop: 6, gap: 6 }}>
            <PlanStatus plan={plan} />
            {plan.orders.map((o) => <Link key={o.id} to={`/buyer-orders/${o.id}`} style={{ textDecoration: 'none' }}><SourceTag kind={o.product.orderType === 'Confirmed' ? 'order' : 'indicative'}>{o.buyer.name} · {fmtKg(Number(o.product.requiredQuantityKg))}</SourceTag></Link>)}
          </div>
        </div>
      </div>
      {plan.window === 'urgent' && <span className="m-tag m-tag-bad">Sow within {daysBetween(PLANNING_DATE, plan.sowBy)} days</span>}
    </div>

    <div className="m-facts">
      <div><small>Plan target</small><strong>{fmtKg(plan.targetKg)}</strong><span>Demand + {result.scenario.bufferPct}% buffer</span></div>
      <div><small>Expected supply</small><strong>{fmtKg(plan.expectedKg)}</strong><span>Range {fmtKg(plan.plannedRange[0] + plan.existingKg)}–{fmtKg(plan.plannedRange[1] + plan.existingKg)}</span></div>
      <div><small>{plan.crop.perennial ? 'Source' : 'Sow window'}</small><strong>{plan.crop.perennial ? 'Existing orchards' : plan.window === 'missed' ? 'Passed' : `${fmtDay(plan.sowFrom)} – ${fmtDay(plan.sowBy)}`}</strong><span>{plan.crop.perennial ? 'No new planting' : `${plan.crop.daysToFirstHarvest} days to first harvest`}</span></div>
      <div><small>Harvest → delivery</small><strong>{fmtDay(plan.harvestStart)} – {fmtDay(plan.harvestEnd)}</strong><span>Buyer wants {fmtDay(plan.deliveryStart)} – {fmtDay(plan.deliveryEnd)}</span></div>
    </div>

    {plan.status !== 'not-in-scenario' && <div style={{ marginBottom: 18 }}><SupplyMeter plan={plan} showLegend /></div>}

    {plan.status === 'not-in-scenario' && <div className="m-alert m-alert-info" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />This crop has only indicative demand, so the current scenario doesn’t plant it. Switch to “Balanced” to include it, or confirm the order with the buyer.</div>}
    {plan.window === 'missed' && <div className="m-alert m-alert-warn" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />To deliver from {fmtDay(plan.deliveryStart)}, {plan.crop.name.toLowerCase()} needed sowing by {fmtDay(plan.sowBy)}. Only crops already in the ground can contribute – consider agreeing a later window with the buyer.</div>}

    {plan.existing.length > 0 && <div style={{ marginBottom: 14 }}>
      <h3 className="m-h3" style={{ fontSize: 15, marginBottom: 6 }}>Already growing</h3>
      {plan.existing.map((e) => <div key={e.cycle.id} className="m-row m-small" style={{ justifyContent: 'space-between' }}><span><Link className="m-link" to={`/crop-cycles/${e.cycle.id}`}>{e.farmer?.name} – {e.plot.name}</Link> · {e.cycle.variety}, harvest {fmtDay(e.cycle.expectedHarvestStartDate)}–{fmtDay(e.cycle.expectedHarvestEndDate)}</span><strong className="m-num">{fmtKg(e.kg)} in window</strong></div>)}
    </div>}

    {plan.allocations.length > 0 && <div className="m-table-wrap"><table className="m-table m-table-resp">
      <thead><tr><th>Farmer & plot</th><th className="num">Area</th><th className="num">Expected</th><th>Why this plot</th><th>Farmer reply</th><th><span className="sr-only">Adjust</span></th></tr></thead>
      <tbody>{plan.allocations.map((a) => <tr key={a.plotId}>
        <td><Link className="m-link" to={`/farmers-plots/${a.farmerId}`}>{a.farmerName}</Link><small>{a.plotName}{a.phase === 'indicative' ? ' · for indicative demand' : ''}</small></td>
        <td className="num"><strong>{fmtAcres(a.acres)}</strong></td>
        <td className="num">{fmtKg(a.kg)}<small>{fmtKg(a.kgRange[0])}–{fmtKg(a.kgRange[1])}</small></td>
        <td><Reasons reasons={a.reasons} limit={3} /></td>
        <td><ReplyBadge state={replyStateFor(a.farmerId, responses, result.allocations)} /></td>
        <td><button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => toggleExclusion(a.plotId, plan.crop.name)} title="Remove this plot from this crop; Meraki will reassign the area"><MinusCircle size={14} /> Remove</button></td>
      </tr>)}</tbody>
    </table></div>}

    {plan.unused.length > 0 && !plan.crop.perennial && <details className="m-details" style={{ marginTop: 10 }}>
      <summary><ChevronRight className="m-chev" size={16} />Why other farms aren’t growing {plan.crop.name.toLowerCase()} ({plan.unused.length}){restorable.length ? ` · ${restorable.length} removed by you` : ''}</summary>
      <div className="m-table-wrap"><table className="m-table m-table-resp"><tbody>
        {plan.unused.map((u) => {
          const removed = exclusions.includes(exclusionKey(u.plotId, plan.crop.name))
          return <tr key={u.plotId}>
            <td style={{ width: '32%' }}><Link className="m-link" to={`/farmers-plots/${u.farmerId}`}>{u.farmerName}</Link><small>{u.plotName} · {fmtAcres(u.acres)}</small></td>
            <td><Reasons reasons={u.reasons} /></td>
            <td style={{ width: 110 }}>{removed && <button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => toggleExclusion(u.plotId, plan.crop.name)}><PlusCircle size={14} /> Add back</button>}</td>
          </tr>
        })}
      </tbody></table></div>
    </details>}
    <p className="m-small" style={{ margin: '12px 0 0' }}>Yield assumption: {result.scenario.yieldCase === 'conservative' ? 'conservative' : 'expected'} ({yieldNote} indicative range). {plan.crop.note}</p>
  </section>
}

function ScenarioPicker() {
  const { scenario, setScenario } = usePlan()
  const { orders } = useBuyerOrders()
  const { data } = useFarmers()
  const { responses, exclusions } = usePlan()
  const comparisons = useMemo(() => scenarioPresets.map((p) => {
    const r = runPlan({ orders, data, scenario: p.scenario, responses, exclusions })
    return { preset: p, acres: r.totalAcres, farmers: r.farmersInvolved.length, confirmed: r.confirmedDemandKg ? r.confirmedCoveredKg / r.confirmedDemandKg : 0, all: r.allDemandKg ? r.allCoveredKg / r.allDemandKg : 0, gaps: r.plans.filter((x) => x.gapKg > 0 && x.status !== 'not-in-scenario').length }
  }), [orders, data, responses, exclusions])
  const custom = !presetFor(scenario)
  const set = (patch: Partial<Scenario>) => setScenario({ ...scenario, ...patch })
  return <section className="m-card" aria-labelledby="scenario-title">
    <div className="m-card-head"><div><h2 className="m-h3" id="scenario-title">Compare scenarios</h2><p className="m-sub">Each scenario reruns the whole plan with the same farms and orders. Pick the level of risk your FPO is comfortable with.</p></div>{custom && <span className="m-tag m-tag-marigold">Custom scenario</span>}</div>
    <div className="m-scenarios">
      {comparisons.map((c) => <button type="button" key={c.preset.id} className="m-scenario" aria-pressed={presetFor(scenario)?.id === c.preset.id} onClick={() => setScenario(c.preset.scenario)}>
        <span className="m-scenario-title">{c.preset.label}{presetFor(scenario)?.id === c.preset.id && <span className="m-tag m-tag-plan">Active</span>}</span>
        <p>{c.preset.summary}</p>
        <dl>
          <div><dt>Land</dt><dd>{c.acres.toFixed(1)} ac</dd></div>
          <div><dt>Farmers</dt><dd>{c.farmers}</dd></div>
          <div><dt>Crops short</dt><dd>{c.gaps}</dd></div>
          <div><dt>Confirmed covered</dt><dd>{fmtPct(c.confirmed)}</dd></div>
          <div><dt>All demand covered</dt><dd>{fmtPct(c.all)}</dd></div>
        </dl>
      </button>)}
    </div>
    <details className="m-details" style={{ marginTop: 16 }}>
      <summary><SlidersHorizontal size={16} />Customise assumptions</summary>
      <div className="m-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', paddingTop: 10 }}>
        <label className="m-field">Plan for<select className="m-select" value={scenario.basis} onChange={(e) => set({ basis: e.target.value as Scenario['basis'] })}><option value="confirmed">Confirmed orders only</option><option value="all">Confirmed + indicative demand</option></select></label>
        <label className="m-field">Yield assumption<select className="m-select" value={scenario.yieldCase} onChange={(e) => set({ yieldCase: e.target.value as Scenario['yieldCase'] })}><option value="conservative">Conservative (weaker season)</option><option value="expected">Expected (typical season)</option></select></label>
        <label className="m-field">Safety buffer: {scenario.bufferPct}%<input className="m-range" type="range" min={0} max={30} step={5} value={scenario.bufferPct} onChange={(e) => set({ bufferPct: Number(e.target.value) })} /><small>Extra area planted to absorb crop losses</small></label>
      </div>
    </details>
  </section>
}

export default function PlantingPlan() {
  const { result, changes, responses } = usePlan()
  const confirmedCov = result.confirmedDemandKg ? result.confirmedCoveredKg / result.confirmedDemandKg : 0
  const farmerConfirmed = result.plans.reduce((s, p) => s + p.farmerConfirmedKg - p.existingKg, 0)
  const alreadyGrowing = result.plans.reduce((s, p) => s + p.existingKg, 0)
  const awaiting = result.farmersInvolved.filter((id) => replyStateFor(id, responses, result.allocations) !== 'confirmed').length
  return <div className="m-page">
    <header className="m-pagehead">
      <div><div className="m-eyebrow">Step 4 · Collective planting plan</div><h1 className="m-h1">Who grows what, where and when</h1><p className="m-lead">Meraki turns active buyer demand into planting assignments across participating farmers, using each plot’s water, soil, availability and the crop’s growing period.</p></div>
      <div className="m-pagehead-actions"><Link to="/messages" className="m-btn m-btn-primary">Send instructions</Link></div>
    </header>

    <ScenarioPicker />

    <div className="m-kpis">
      <div className="m-kpi"><small>Land in plan</small><strong>{result.totalAcres.toFixed(1)} ac</strong><span>{result.farmersInvolved.length} farmers · {result.allocations.length} plots</span></div>
      <div className="m-kpi"><small>Confirmed demand covered</small><strong>{fmtPct(confirmedCov)}</strong><span>{fmtKg(result.confirmedCoveredKg)} of {fmtKg(result.confirmedDemandKg)}</span></div>
      <div className="m-kpi"><small>All demand covered</small><strong>{fmtPct(result.allDemandKg ? result.allCoveredKg / result.allDemandKg : 0)}</strong><span>Incl. indicative orders</span></div>
      <div className="m-kpi"><small>New planting confirmed by farmers</small><strong>{fmtKg(farmerConfirmed)}</strong><span>{awaiting} farmer{awaiting === 1 ? '' : 's'} still to confirm · {fmtKg(alreadyGrowing)} already growing</span></div>
    </div>

    <section className="m-card" aria-labelledby="cal-title">
      <div className="m-card-head"><div><h2 className="m-h3" id="cal-title">Season calendar</h2><p className="m-sub">Sowing dates are worked back from each buyer’s delivery window and the crop’s days to harvest.</p></div></div>
      <Calendar plans={result.plans} />
    </section>

    {result.plans.map((p) => <CropPlanCard key={p.crop.id} plan={p} />)}

    <section className="m-card m-card-tight" aria-labelledby="reserve-title">
      <div className="m-row" style={{ justifyContent: 'space-between' }}>
        <div><h2 className="m-h3" id="reserve-title">Reserve crops already growing for an order</h2><p className="m-sub">Once crops are in the ground, reserve their estimated harvest against a specific buyer order, with manual adjustments and confirmation.</p></div>
        <Link to="/supply-planning" className="m-btn m-btn-secondary m-btn-sm">Order reservations <ChevronRight size={15} /></Link>
      </div>
    </section>

    {result.ineligible.length > 0 && <section className="m-card m-card-sage" aria-labelledby="out-title">
      <h2 className="m-h3" id="out-title"><UserX size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />Farmers not in this season’s plan</h2>
      <div className="m-stack" style={{ gap: 8, marginTop: 10 }}>
        {result.ineligible.map(({ farmer, reason }) => <div key={farmer.id} className="m-row" style={{ justifyContent: 'space-between' }}><Link className="m-link" to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link><span className="m-tag m-tag-neutral">{reason}</span></div>)}
      </div>
    </section>}

    <section className="m-card" id="history" aria-labelledby="history-title" style={{ scrollMarginTop: 20 }}>
      <h2 className="m-h3" id="history-title" style={{ marginBottom: 12 }}><History size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />Plan updates</h2>
      {changes.length ? changes.map((c) => <div className="m-change" key={c.id}><strong>{c.title}</strong> <span className="m-small">· {new Date(c.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span><ul>{c.details.map((d) => <li key={d}>{d}</li>)}</ul></div>)
        : <p className="m-small" style={{ margin: 0 }}>No changes yet. When farmers decline, report a problem, or you remove a plot, Meraki rebalances the plan and records what changed here.</p>}
    </section>

    <details className="m-card m-details" style={{ borderTop: '1px solid var(--line)' }}>
      <summary style={{ paddingTop: 0 }}><Info size={16} />How Meraki builds this plan</summary>
      <ol className="m-small" style={{ lineHeight: 1.7, paddingLeft: 20, margin: '10px 0 0' }}>
        <li>Adds up active buyer orders per crop. Confirmed orders are planned first; indicative demand only if the scenario includes it.</li>
        <li>Works back the sow-by date from the earliest delivery date and the crop’s days to first harvest.</li>
        <li>Checks each participating farmer’s plots: is it free in time, is there enough water, does the soil suit the crop? No water or a busy plot rules a plot out; soil and unknowns only add caution – soil alone never decides.</li>
        <li>Assigns land in quarter-acre blocks, using plots with fewer alternative uses first so well-watered land stays available for thirsty crops.</li>
        <li>Expected supply = area × indicative yield. Farmer replies, removed plots and edited farm details rerun the plan instantly.</li>
      </ol>
      <p className="m-small" style={{ marginBottom: 0 }}>This is a transparent rule-based heuristic for the prototype – not a trained prediction model.</p>
    </details>
  </div>
}
