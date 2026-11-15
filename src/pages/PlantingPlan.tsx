import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowRight, BarChart3, Send, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Info, MinusCircle, Pencil, PlusCircle, ShieldCheck, Sprout, UsersRound, Boxes, Zap } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, exclusionKey, presetFor, replyStateFor, runPlan, scenarioPresets } from '../planning/engine'
import type { CropPlan, Scenario } from '../planning/engine'
import { daysBetween, fmtAcres, fmtDay, fmtPct, toDate } from '../planning/format'
import { cumulative, weeklySeries } from '../planning/series'
import { Feasibility, Reasons, StatCard, SupplyMeter, lineStatusLabel, orderTypeLabel } from '../components/ui'
import LineChart from '../components/LineChart'
import PageHeader from '../components/layout/PageHeader'
import { fmtT } from './Overview'

const CAL_START = '2026-11-01'
const CAL_MONTHS = 9

function Calendar({ plans }: { plans: CropPlan[] }) {
  const endDate = (() => { const d = toDate(CAL_START); d.setUTCMonth(d.getUTCMonth() + CAL_MONTHS); return d.toISOString().slice(0, 10) })()
  const total = daysBetween(CAL_START, endDate)
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (daysBetween(CAL_START, iso) / total) * 100))}%`
  const width = (a: string, b: string) => `calc(${pos(b)} - ${pos(a)})`
  const months = Array.from({ length: CAL_MONTHS }, (_, i) => { const d = toDate(CAL_START); d.setUTCMonth(d.getUTCMonth() + i); return new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(d) })
  return <div className="m-cal" style={{ ['--months' as string]: CAL_MONTHS }}>
    <span />
    <div className="m-cal-months" style={{ gridTemplateColumns: `repeat(${CAL_MONTHS}, minmax(0, 1fr))` }}>{months.map((m) => <span key={m}>{m}</span>)}</div>
    {plans.flatMap((pl) => pl.lines.filter((l) => l.harvestStart).map((l) => ({ ...l, crop: pl.crop }))).map((p) => <div key={p.order.id} style={{ display: 'contents' }}>
      <span className="m-cal-label" title={`${p.crop.name} for ${p.order.buyer.name}`}>{p.crop.emoji} {p.crop.name} <span className="m-small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {p.order.buyer.name.split(' ')[0]}</span></span>
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

function ScenarioCompare() {
  const { scenario, setScenario, responses, exclusions } = usePlan()
  const { orders } = useBuyerOrders()
  const { data } = useFarmers()
  const rows = useMemo(() => scenarioPresets.map((p) => {
    const r = runPlan({ orders, data, scenario: p.scenario, responses, exclusions })
    return { preset: p, acres: r.totalAcres, farmers: r.farmersInvolved.length, confirmed: r.confirmedDemandKg ? r.confirmedCoveredKg / r.confirmedDemandKg : 0, all: r.allDemandKg ? r.allCoveredKg / r.allDemandKg : 0, gaps: r.plans.filter((x) => x.gapKg > 0 && x.status !== 'not-in-scenario').length }
  }), [orders, data, responses, exclusions])
  const set = (patch: Partial<Scenario>) => setScenario({ ...scenario, ...patch })
  return <section aria-label="Scenarios" style={{ marginTop: 12 }}>
    <div className="m-panel-head"><p className="m-panel-sub" style={{ margin: 0 }}>Each scenario reruns the whole plan with the same farms and orders.</p>{!presetFor(scenario) && <span className="m-status review"><AlertTriangle size={15} />Custom assumptions</span>}</div>
    <div className="m-scenarios">
      {rows.map((c) => <button type="button" key={c.preset.id} className="m-scenario" aria-pressed={presetFor(scenario)?.id === c.preset.id} onClick={() => setScenario(c.preset.scenario)}>
        <span className="m-scenario-title">{c.preset.label}{presetFor(scenario)?.id === c.preset.id && <span className="m-tag m-tag-plan">Active</span>}</span>
        <p>{c.preset.summary}</p>
        <dl>
          <div><dt>Land</dt><dd>{c.acres.toFixed(1)} ac</dd></div>
          <div><dt>Farmers</dt><dd>{c.farmers}</dd></div>
          <div><dt>Crops short</dt><dd>{c.gaps}</dd></div>
          <div><dt>Confirmed</dt><dd>{fmtPct(c.confirmed)} <span className="m-small">covered</span></dd></div>
          <div><dt>All demand</dt><dd>{fmtPct(c.all)} <span className="m-small">covered</span></dd></div>
        </dl>
      </button>)}
    </div>
    <details className="m-details" style={{ marginTop: 14 }}>
      <summary><ChevronRight className="m-chev" size={16} />Customise assumptions</summary>
      <div className="m-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', paddingTop: 10 }}>
        <label className="m-field">Plan for<select className="m-select" value={scenario.basis} onChange={(e) => set({ basis: e.target.value as Scenario['basis'] })}><option value="confirmed">Confirmed orders only</option><option value="all">Confirmed + indicative demand</option></select></label>
        <label className="m-field">Yield assumption<select className="m-select" value={scenario.yieldCase} onChange={(e) => set({ yieldCase: e.target.value as Scenario['yieldCase'] })}><option value="conservative">Conservative (weaker season)</option><option value="expected">Expected (typical season)</option></select></label>
        <label className="m-field">Safety buffer: {scenario.bufferPct}%<input className="m-range" type="range" min={0} max={30} step={5} value={scenario.bufferPct} onChange={(e) => set({ bufferPct: Number(e.target.value) })} /><small>Extra area planted to absorb crop losses</small></label>
      </div>
    </details>
  </section>
}

export default function PlantingPlan() {
  const { result, changes, responses, exclusions, toggleExclusion, scenario, setScenario, finalizePlan, planState, finalized } = usePlan()
  const { data } = useFarmers()
  const { hash } = useLocation()
  const plans = result.plans
  const [cropId, setCropId] = useState(() => plans.find((p) => `#${p.crop.id}` === hash)?.crop.id ?? [...plans].sort((a, b) => b.allocations.length - a.allocations.length)[0]?.crop.id)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { const m = plans.find((p) => `#${p.crop.id}` === hash); if (m) setCropId(m.crop.id) }, [hash]) // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans.find((p) => p.crop.id === cropId) ?? plans[0]

  const inScope = plans.filter((p) => p.status !== 'not-in-scenario')
  const targetKg = inScope.reduce((s, p) => s + p.targetKg, 0)
  const expectedKg = inScope.reduce((s, p) => s + p.expectedKg, 0)
  const villages = new Set(result.farmersInvolved.map((id) => data.farmers.find((f) => f.id === id)?.village)).size
  const risk = result.risk
  const riskStyle = risk.level === 'Low' ? { background: '#e5f1de', color: '#1f6e26' } : risk.level === 'Medium' ? { background: '#fdf1dc', color: '#8a4b00' } : { background: '#fdece6', color: '#b0301f' }
  const pending = result.farmersInvolved.filter((id) => { const s = replyStateFor(id, responses, result.allocations); return s === 'not-sent' || s === 'needs-update' })

  function finalize() {
    // Finalizing saves the current plan as the agreed version; sending instructions is a separate, explicit step.
    if (window.confirm(`Finalize this ${presetFor(scenario)?.label.toLowerCase() ?? 'custom'} plan (${result.totalAcres.toFixed(1)} ac across ${result.farmersInvolved.length} farmers)? You can still change it later – Meraki will flag that it changed.`)) finalizePlan()
  }

  if (!plan) return <div className="m-page"><PageHeader title="Collective planting plan" subtitle="Add active buyer demand to generate a planting plan." /><Link to="/buyer-orders/new" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start' }}>Add buyer demand</Link></div>

  const weeks = weeklySeries([plan])
  const cumD = cumulative(weeks.map((w) => w.demand / 1000))
  const cumS = cumulative(weeks.map((w) => w.supply / 1000))
  const demandTotal = plan.confirmedKg + plan.indicativeKg
  const goodPlots = plan.allocations.filter((a) => a.fit === 'good').length
  const farmerCount = new Set(plan.allocations.map((a) => a.farmerId)).size
  const cautions = [...new Set(plan.allocations.flatMap((a) => a.reasons.filter((r) => r.tone === 'caution').map((r) => r.text)))]
  const why = [
    plan.status === 'covered' ? { ok: true, title: 'Planned to meet buyer demand', text: `${fmtT(plan.expectedKg)} expected vs ${fmtT(plan.targetKg)} target (${fmtPct(plan.targetKg ? plan.expectedKg / plan.targetKg : 0)} coverage, incl. ${scenario.bufferPct}% buffer).` }
      : plan.status === 'not-in-scenario' ? { ok: false, title: 'Indicative demand only', text: 'Not planted in this scenario. Confirm the order or switch to Balanced.' }
        : { ok: false, title: `Short by ${fmtT(plan.shortfallKg || plan.gapKg)}`, text: `${fmtT(plan.expectedKg)} expected vs ${fmtT(plan.targetKg)} target. Add farmers, complete farm details or agree a lower volume.` },
    plan.allocations.length ? { ok: goodPlots === plan.allocations.length, title: goodPlots === plan.allocations.length ? 'High feasibility' : 'Mostly feasible', text: `${goodPlots} of ${plan.allocations.length} plots are high feasibility (free in time, water and soil suit the crop).${cautions.length ? ` Check: ${cautions.slice(0, 2).join('; ').toLowerCase()}.` : ''}` } : null,
    plan.sowBy ? { ok: plan.window === 'open', title: plan.window === 'missed' ? 'Sowing window has passed' : plan.window === 'urgent' ? 'Sow this week' : 'Timed to the buyer window', text: plan.window === 'missed' ? `Needed sowing by ${fmtDay(plan.sowBy)}.` : `Sow ${fmtDay(plan.sowFrom)} – ${fmtDay(plan.sowBy)} so first harvest (${fmtDay(plan.harvestStart)}) matches delivery from ${fmtDay(plan.deliveryStart)}.` } : null,
    farmerCount > 1 ? { ok: true, title: 'Spread across farmers', text: `${farmerCount} farmers share the area, so one farm’s problem doesn’t break the order.` } : null,
    plan.lines.length > 1 ? { ok: plan.lines.filter((l) => l.inScenario).every((l) => l.status === 'covered'), title: 'Checked order by order', text: `${plan.lines.length} buyer orders are planned separately – each with its own variety, quantity and sowing window – so a surplus on one never hides a shortfall on another.` } : null,
    plan.existingKg > 0 ? { ok: true, title: 'Uses crops already growing', text: `${fmtT(plan.existingKg)} from participating farmers’ crops already in the ground, counted once and only for matching varieties and dates.` } : null,
  ].filter(Boolean) as { ok: boolean; title: string; text: string }[]

  const statusOf = (farmerId: string, fit: string) => {
    const s = replyStateFor(farmerId, responses, result.allocations)
    if (fit !== 'good' || s === 'constraint' || s === 'needs-update') return <span className="m-status review"><AlertTriangle size={15} />Needs review</span>
    if (s === 'confirmed') return <span className="m-status"><CheckCircle2 size={15} />Farmer-confirmed</span>
    if (s === 'sent') return <span className="m-status wait"><Clock3 size={15} />Sent</span>
    return <span className="m-status"><Check size={15} />Planned</span>
  }
  const removed = plan.unused.filter((u) => exclusions.includes(exclusionKey(u.plotId, plan.crop.name)))
  const cropOrderIds = new Set(plan.lines.map((l) => l.order.id))
  const nextStep = result.actions.find((a) => a.id.endsWith(plan.crop.id) || [...cropOrderIds].some((id) => a.id.endsWith(id)))
    ?? (planState !== 'finalized' ? { title: planState === 'changed' ? 'Re-finalize the changed plan' : 'Finalize the plan', detail: 'Review the allocation, then finalize it before sending farmers their instructions.', to: '#alloc-title', cta: 'Review' }
      : result.actions.find((a) => a.id === 'send' || a.id === 'resend' || a.id === 'constraints'))

  return <div className="m-page">
    <PageHeader title="Collective planting plan" subtitle="Turn buyer demand into a coordinated crop plan across your farmers." />

    <section className="m-stats" aria-label="Plan summary">
      <StatCard icon={<Sprout size={24} />} label="Demand target" tip="Demand in this scenario plus the safety buffer" value={fmtT(targetKg)} sub={<>incl. {scenario.bufferPct}% buffer · {presetFor(scenario)?.label ?? 'Custom'}</>} />
      <StatCard icon={<Boxes size={24} />} label="Planned production" tip="Expected harvest at the scenario's yield assumption – planned, not guaranteed" value={fmtT(expectedKg)} sub={<>{result.totalAcres.toFixed(1)} acres planned</>} />
      <StatCard icon={<UsersRound size={24} />} label="Participating farms" value={result.farmersInvolved.length} sub={<>across {villages} villages</>} />
      <StatCard icon={<ShieldCheck size={24} />} label="Risk level" tip={risk.factors.length ? `Why: ${risk.factors.join('; ')}.` : 'No major risks found.'} value={<span className="m-pillbig" style={riskStyle}>{risk.level}</span>} sub={<>{risk.factors[0] ?? 'Planned, farmer-confirmed and committed'}{risk.factors.length > 1 ? ` · +${risk.factors.length - 1} more` : ''}</>} />
    </section>

    <section className="m-panel" id={plan.crop.id} aria-labelledby="alloc-title" style={{ scrollMarginTop: 16 }}>
      <div className="m-panel-head">
        <div><h2 className="m-panel-title" id="alloc-title">Crop allocation &amp; farmer plan
          {planState === 'draft' && <span className="m-status wait" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}>Draft plan</span>}
          {planState === 'finalized' && finalized && <span className="m-status" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}><CheckCircle2 size={14} />Finalized {fmtDay(finalized.at.slice(0, 10))}</span>}
          {planState === 'changed' && <span className="m-status review" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}><AlertTriangle size={14} />Changed since finalized</span>}
        </h2><p className="m-panel-sub">Recommended crop allocation across farmers, checked against each buyer order.</p></div>
        <div className="m-row">
          <button type="button" className="m-btn m-btn-tertiary m-btn-sm" style={{ borderColor: 'var(--line-strong)', borderRadius: 10 }} aria-pressed={editing} onClick={() => setEditing((v) => !v)}><Pencil size={16} />{editing ? 'Done editing' : 'Edit plan'}</button>
          {planState === 'finalized'
            ? <Link to="/messages" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><Send size={16} />{pending.length ? `Send instructions (${pending.length})` : 'View messages'}</Link>
            : <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={finalize}><Check size={17} />{planState === 'changed' ? 'Re-finalize plan' : 'Finalize planting plan'}</button>}
        </div>
      </div>
      <div className="m-row" style={{ marginBottom: 14 }}>
        <label className="m-row" style={{ gap: 12, fontWeight: 600 }}>Crop
          <span className="m-select-pill m-crop-pick"><span aria-hidden="true">{plan.crop.emoji}</span><select value={plan.crop.id} onChange={(e) => setCropId(e.target.value)} aria-label="Crop">{plans.map((p) => <option key={p.crop.id} value={p.crop.id}>{p.crop.name}</option>)}</select></span>
        </label>
        <span className="m-chip-target">Plan target:<strong>{fmtT(plan.targetKg)}</strong></span>
        <label className="m-row" style={{ gap: 8, fontWeight: 600, marginLeft: 'auto' }}>Scenario
          <span className="m-select-pill"><select value={presetFor(scenario)?.id ?? 'custom'} onChange={(e) => { const p = scenarioPresets.find((x) => x.id === e.target.value); if (p) setScenario(p.scenario) }} aria-label="Scenario">{scenarioPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}{!presetFor(scenario) && <option value="custom">Custom</option>}</select></span>
        </label>
      </div>

      {plan.status === 'not-in-scenario' && <div className="m-alert m-alert-info" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />{plan.crop.name} has only indicative demand, so this scenario doesn’t plant it. Switch to “Balanced” or confirm the order.</div>}
      {plan.window === 'missed' && <div className="m-alert m-alert-warn" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />To deliver from {fmtDay(plan.deliveryStart)}, {plan.crop.name.toLowerCase()} needed sowing by {fmtDay(plan.sowBy)}. Only crops already in the ground can contribute.</div>}

      <h3 className="m-h3" style={{ margin: '4px 0 6px' }}>Buyer orders <span className="m-small" style={{ fontWeight: 400 }}>– each planned on its own variety, quantity and window</span></h3>
      <div className="m-dt-scroll" style={{ marginBottom: 18 }}><table className="m-dt">
        <thead><tr><th>Buyer</th><th>Variety</th><th>Quantity</th><th>Delivery</th><th>Sow by</th><th>Expected</th><th>Status</th></tr></thead>
        <tbody>{plan.lines.map((l) => <tr key={l.order.id}>
          <td><Link to={`/buyer-orders/${l.order.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{l.order.buyer.name}</Link><small><span className={`m-dotstatus ${l.committed ? '' : 'ind'}`} style={{ padding: '0 8px', fontSize: 12, marginTop: 4 }}>{orderTypeLabel(l.order.product.orderType)}</span></small></td>
          <td>{l.variety}</td>
          <td className="num"><strong>{fmtT(l.qtyKg)}</strong>{l.inScenario && l.targetKg !== l.qtyKg && <small>target {fmtT(l.targetKg)}</small>}</td>
          <td className="nowrap">{fmtDay(l.deliveryStart)} – {fmtDay(l.deliveryEnd)}</td>
          <td className="nowrap">{l.window === 'perennial' ? 'Orchard' : l.window === 'missed' ? <span style={{ color: 'var(--bad)' }}>Passed ({fmtDay(l.sowBy)})</span> : fmtDay(l.sowBy)}</td>
          <td className="num"><strong>{fmtT(l.expectedKg)}</strong><small>{l.existingKg ? `${fmtT(l.existingKg)} already growing` : `${l.allocations.length} plot${l.allocations.length === 1 ? '' : 's'}`}{l.farmerConfirmedKg ? ` · ${fmtT(l.farmerConfirmedKg)} farmer-confirmed` : ''}</small></td>
          <td><span className={`m-feas ${lineStatusLabel[l.status].cls}`}><span>{lineStatusLabel[l.status].label}</span></span>{l.shortfallKg > 0 && <small style={{ color: 'var(--bad)' }}>short {fmtT(l.shortfallKg)}</small>}</td>
        </tr>)}</tbody>
      </table></div>

      <h3 className="m-h3" style={{ margin: '0 0 6px' }}>Farmers and plots</h3>
      <div className="m-dt-scroll"><table className="m-dt">
        <thead><tr><th>Farmer / Plot</th><th>Suggested planting window <InfoTipInline /></th><th>Expected harvest window</th><th>Quantity</th><th>Feasibility</th><th>Status</th>{editing && <th><span className="sr-only">Edit</span></th>}</tr></thead>
        <tbody>
          {plan.existing.map((e) => <tr key={`${e.cycle.id}-${e.orderId}`}>
            <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{e.farmer?.name}</strong><small>{e.plot.name} · for {plan.lines.find((l) => l.order.id === e.orderId)?.order.buyer.name}</small></span></span></td>
            <td><span className="m-chipdate">Already planted</span></td>
            <td><span className="m-chipdate plain"><CalendarDays size={16} />{fmtDay(e.windowStart)} – {fmtDay(e.windowEnd)}</span></td>
            <td><strong>{fmtT(e.kg)}</strong><small>in window</small></td>
            <td><Feasibility level="high" /></td>
            <td><span className="m-status"><Sprout size={15} />Growing</span></td>
            {editing && <td />}
          </tr>)}
          {plan.allocations.map((a) => {
            const key = `${a.orderId}-${a.plotId}`
            const isOpen = open === key
            return <Fragment key={key}>
              <tr className="click" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{a.farmerName}</strong><small>{a.plotName} · {fmtAcres(a.acres)} · for {a.buyerName}{plan.varieties.length > 1 ? ` (${a.variety})` : ''}</small></span></span></td>
                <td><span className="m-chipdate"><CalendarDays size={16} />{fmtDay(a.sowFrom)} – {fmtDay(a.sowBy)}</span></td>
                <td><span className="m-chipdate plain"><CalendarDays size={16} />{fmtDay(a.harvestStart)} – {fmtDay(a.harvestEnd)}</span></td>
                <td><strong>{fmtT(a.kg)}</strong><small>{fmtT(a.kgRange[0])}–{fmtT(a.kgRange[1])}</small></td>
                <td><Feasibility level={a.fit === 'good' ? 'high' : 'medium'} /></td>
                <td>{statusOf(a.farmerId, a.fit)}</td>
                {editing && <td><button type="button" className="m-btn m-btn-danger m-btn-xs" onClick={(e) => { e.stopPropagation(); toggleExclusion(a.plotId, plan.crop.name) }}><MinusCircle size={14} />Remove</button></td>}
              </tr>
              {isOpen && <tr><td colSpan={editing ? 7 : 6} style={{ background: '#fafcf8' }}><strong style={{ fontSize: 14 }}>Why this plot:</strong> <Reasons reasons={a.reasons} />{a.phase === 'indicative' && <small style={{ marginTop: 6 }}>Assigned to cover indicative demand.</small>}</td></tr>}
            </Fragment>
          })}
          {!plan.allocations.length && !plan.existing.length && <tr><td colSpan={6}><span className="m-small">No farmers assigned to {plan.crop.name.toLowerCase()} in this scenario.</span></td></tr>}
        </tbody>
      </table></div>
      {plan.uncounted.length > 0 && <p className="m-small" style={{ margin: '10px 0 0' }}><Info size={14} style={{ verticalAlign: '-2px' }} /> Not counted as supply: {plan.uncounted.map((u) => `${u.farmer?.name ?? 'Unknown'} – ${u.cycle.variety} (${u.reason.replace('Not counted – ', '')})`).join('; ')}.</p>}
      {nextStep && <Link to={nextStep.to} className="m-reco" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}><Zap size={20} color="var(--forest)" style={{ flex: 'none' }} /><div style={{ flex: 1 }}><strong>Next step: {nextStep.title}</strong><p>{nextStep.detail}</p></div><span className="m-action-btn">{nextStep.cta}<ArrowRight size={15} /></span></Link>}

      {(editing || removed.length > 0) && !plan.crop.perennial && <details className="m-details" open={editing} style={{ marginTop: 12 }}>
        <summary><ChevronRight className="m-chev" size={16} />Other farms and why they aren’t growing {plan.crop.name.toLowerCase()} ({plan.unused.length}){removed.length ? ` · ${removed.length} removed by you` : ''}</summary>
        <div className="m-dt-scroll"><table className="m-dt"><tbody>
          {plan.unused.map((u) => <tr key={u.plotId}>
            <td style={{ width: '30%' }}><Link className="m-link" to={`/farmers-plots/${u.farmerId}`}>{u.farmerName}</Link><small>{u.plotName} · {fmtAcres(u.acres)}</small></td>
            <td><Reasons reasons={u.reasons} /></td>
            <td style={{ width: 120 }}>{exclusions.includes(exclusionKey(u.plotId, plan.crop.name)) && <button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => toggleExclusion(u.plotId, plan.crop.name)}><PlusCircle size={14} />Add back</button>}</td>
          </tr>)}
        </tbody></table></div>
      </details>}
    </section>

    <div className="m-stack" style={{ gap: 24 }}>
      <section className="m-panel" aria-labelledby="crop-sd-title">
        <h2 className="m-panel-title sm" id="crop-sd-title"><BarChart3 size={24} color="var(--forest)" />Supply vs. demand <small>({plan.crop.name})</small></h2>
        <p className="m-panel-sub" style={{ marginBottom: 12 }}>{plan.expectedKg >= demandTotal ? 'Planned production meets or exceeds buyer demand.' : 'Planned production is below total buyer demand.'}</p>
        {weeks.length > 1 ? <div className="m-chartwrap">
          <LineChart ariaLabel={`Cumulative demand and planned supply for ${plan.crop.name}`} labels={weeks.map((w) => fmtDay(w.start))}
            series={[{ label: 'Demand (cumulative)', color: '#1b5e20', values: cumD }, { label: 'Planned supply (cumulative)', color: '#7cc35b', values: cumS, fill: true }]} />
          <div className="m-minis">
            <div className="m-mini"><small>Demand (total)</small><strong>{fmtT(demandTotal)}</strong></div>
            <div className="m-mini"><small>Planned supply</small><strong>{fmtT(plan.expectedKg)}</strong></div>
            <div className="m-mini green"><small>Coverage</small><strong>{fmtPct(demandTotal ? plan.expectedKg / demandTotal : 0)}</strong></div>
          </div>
        </div> : <SupplyMeter plan={plan} showLegend />}
      </section>
      <section className="m-panel" aria-labelledby="why-title">
        <h2 className="m-panel-title sm" id="why-title"><Zap size={24} color="var(--forest)" />Why this plan is recommended</h2>
        <p className="m-panel-sub" style={{ marginBottom: 8 }}>How Meraki matched {plan.crop.name.toLowerCase()} demand to your farmers.</p>
        <ul className="m-why2 m-why-grid">{why.map((w) => <li key={w.title}><span className={`m-roundico ${w.ok ? '' : 'warn'}`} style={{ width: 34, height: 34 }}>{w.ok ? <Check size={18} /> : <AlertTriangle size={17} />}</span><div><strong>{w.title}</strong><span>{w.text}</span></div></li>)}</ul>
      </section>
    </div>

    <h2 className="m-h3" style={{ margin: '8px 0 -8px', color: 'var(--mute)', fontWeight: 600 }}>More planning detail</h2>
    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />Compare scenarios <span className="m-small">· {presetFor(scenario)?.label ?? 'Custom'} active</span></summary>
      <ScenarioCompare />
    </details>

    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />Season calendar <span className="m-small">· sowing, harvest and delivery for every order</span></summary>
      <Calendar plans={plans} />
    </details>

    <details className="m-panel m-details m-fold" id="history" style={{ scrollMarginTop: 16 }} open={hash === '#history'}>
      <summary><ChevronRight className="m-chev" size={18} />Plan updates <span className="m-small">· {changes.length} change{changes.length === 1 ? '' : 's'}</span></summary>
        <div style={{ marginTop: 12 }}>{changes.length ? changes.map((c) => <div className="m-change" key={c.id}><strong>{c.title}</strong> <span className="m-small">· {new Date(c.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span><ul>{c.details.map((d) => <li key={d}>{d}</li>)}</ul></div>)
          : <p className="m-small" style={{ margin: 0 }}>No changes yet. When farmers decline, report a problem, or you remove a plot, Meraki rebalances the plan and records what changed here.</p>}</div>
    </details>
    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />Farmers not in this plan <span className="m-small">· {result.ineligible.length}</span></summary>
        <div className="m-stack" style={{ gap: 8, marginTop: 12 }}>
          {result.ineligible.map(({ farmer, reason }) => <div key={farmer.id} className="m-row" style={{ justifyContent: 'space-between' }}><Link className="m-link" to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link><span className="m-tag m-tag-neutral">{reason}</span></div>)}
          {!result.ineligible.length && <p className="m-small" style={{ margin: 0 }}>Every member is participating.</p>}
        </div>
        <div className="m-row" style={{ justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <span className="m-small">Reserve crops already growing against one order</span>
          <Link to="/supply-planning" className="m-link" id="reserve-title">Order reservations <ChevronRight size={15} /></Link>
        </div>
    </details>

    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />How Meraki builds this plan</summary>
      <ol className="m-small" style={{ lineHeight: 1.7, paddingLeft: 20, margin: '10px 0 0' }}>
        <li>Plans every active buyer order separately – its own variety, quantity and delivery window. Committed orders are planned first; indicative orders only if the scenario includes them.</li>
        <li>Works back each order’s sow-by date from its delivery start and the crop’s days to first harvest.</li>
        <li>Counts crops already growing only for participating farmers, matching varieties and overlapping harvest dates – each crop counted once.</li>
        <li>Farmer reports are not treated as facts: a plot with a reported water problem is held out until a coordinator verifies it, and a farmer who can’t sow in time is not planned for that window.</li>
        <li>Checks each participating farmer’s plots: free in time, enough water, suitable soil. No water or a busy plot rules a plot out; soil and unknowns only add caution – soil alone never decides.</li>
        <li>Assigns land in quarter-acre blocks, using plots with fewer alternative uses first so well-watered land stays available for thirsty crops.</li>
        <li>Expected supply = area × indicative yield. Farmer replies, removed plots and edited farm details rerun the plan instantly.</li>
      </ol>
      <p className="m-small" style={{ marginBottom: 0 }}>A transparent rule-based heuristic for this prototype – not a trained prediction model. All data is synthetic.</p>
    </details>
  </div>
}

function InfoTipInline() {
  return <span className="m-info" title="Worked back from the buyer's delivery start and the crop's days to first harvest" role="img" aria-label="How the planting window is set"><Info size={14} /></span>
}
