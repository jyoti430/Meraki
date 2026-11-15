import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, BarChart3, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, History, Info, MinusCircle, Pencil, PlusCircle, ShieldCheck, Sprout, UsersRound, UserX, Boxes, Zap } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, exclusionKey, presetFor, replyStateFor, runPlan, scenarioPresets } from '../planning/engine'
import type { CropPlan, Scenario } from '../planning/engine'
import { composeInstruction, languageFor } from '../planning/messages'
import { daysBetween, fmtAcres, fmtDay, fmtPct, toDate } from '../planning/format'
import { cumulative, weeklySeries } from '../planning/series'
import { Feasibility, Reasons, StatCard, SupplyMeter } from '../components/ui'
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
    {plans.filter((p) => p.harvestStart).map((p) => <div key={p.crop.id} style={{ display: 'contents' }}>
      <span className="m-cal-label">{p.crop.emoji} {p.crop.name}</span>
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
  return <section className="m-panel" aria-labelledby="scen-title">
    <div className="m-panel-head"><div><h2 className="m-panel-title" id="scen-title" style={{ fontSize: 22 }}>Compare scenarios</h2><p className="m-panel-sub">Each scenario reruns the whole plan with the same farms and orders.</p></div>{!presetFor(scenario) && <span className="m-status review"><AlertTriangle size={15} />Custom assumptions</span>}</div>
    <div className="m-scenarios">
      {rows.map((c) => <button type="button" key={c.preset.id} className="m-scenario" aria-pressed={presetFor(scenario)?.id === c.preset.id} onClick={() => setScenario(c.preset.scenario)}>
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
  const { result, changes, responses, exclusions, toggleExclusion, scenario, setScenario, sendInstructions } = usePlan()
  const { data } = useFarmers()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const plans = result.plans
  const [cropId, setCropId] = useState(() => plans.find((p) => `#${p.crop.id}` === hash)?.crop.id ?? [...plans].sort((a, b) => b.allocations.length - a.allocations.length)[0]?.crop.id)
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { const m = plans.find((p) => `#${p.crop.id}` === hash); if (m) setCropId(m.crop.id) }, [hash]) // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans.find((p) => p.crop.id === cropId) ?? plans[0]

  const inScope = plans.filter((p) => p.status !== 'not-in-scenario')
  const targetKg = inScope.reduce((s, p) => s + p.targetKg, 0)
  const expectedKg = inScope.reduce((s, p) => s + p.expectedKg, 0)
  const coverage = targetKg ? expectedKg / targetKg : 0
  const villages = new Set(result.farmersInvolved.map((id) => data.farmers.find((f) => f.id === id)?.village)).size
  const cautionShare = result.allocations.length ? result.allocations.filter((a) => a.fit !== 'good').length / result.allocations.length : 0
  const risk = coverage >= 0.98 && cautionShare < 0.25 ? 'Low' : coverage >= 0.85 ? 'Medium' : 'High'
  const riskStyle = risk === 'Low' ? { background: '#e5f1de', color: '#1f6e26' } : risk === 'Medium' ? { background: '#fdf1dc', color: '#8a4b00' } : { background: '#fdece6', color: '#b0301f' }
  const pending = result.farmersInvolved.filter((id) => { const s = replyStateFor(id, responses, result.allocations); return s === 'not-sent' || s === 'needs-update' })

  function finalize() {
    if (pending.length && window.confirm(`Finalize the plan and send planting instructions to ${pending.length} farmer${pending.length > 1 ? 's' : ''}? (Simulated – nothing is sent to real phones.)`)) {
      sendInstructions(pending.map((id) => {
        const f = data.farmers.find((x) => x.id === id)!
        const lang = languageFor(f.preferredLanguage)
        return { farmerId: id, channel: 'WhatsApp', language: lang, text: composeInstruction(f.name.split(' ')[0], result.allocations.filter((a) => a.farmerId === id), plans, lang, 'WhatsApp', replyStateFor(id, responses, result.allocations) === 'needs-update') }
      }))
    }
    navigate('/messages')
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
    plan.status === 'covered' ? { ok: true, title: 'Meets buyer demand', text: `${fmtT(plan.expectedKg)} expected vs ${fmtT(plan.targetKg)} target (${fmtPct(plan.targetKg ? plan.expectedKg / plan.targetKg : 0)} coverage, incl. ${scenario.bufferPct}% buffer).` }
      : plan.status === 'not-in-scenario' ? { ok: false, title: 'Indicative demand only', text: 'Not planted in this scenario. Confirm the order or switch to Balanced.' }
        : { ok: false, title: `Short by ${fmtT(plan.gapKg)}`, text: `${fmtT(plan.expectedKg)} expected vs ${fmtT(plan.targetKg)} target. Add farmers, complete farm details or agree a lower volume.` },
    plan.allocations.length ? { ok: goodPlots === plan.allocations.length, title: goodPlots === plan.allocations.length ? 'High feasibility' : 'Mostly feasible', text: `${goodPlots} of ${plan.allocations.length} plots are high feasibility (free in time, water and soil suit the crop).${cautions.length ? ` Check: ${cautions.slice(0, 2).join('; ').toLowerCase()}.` : ''}` } : null,
    plan.sowBy ? { ok: plan.window === 'open', title: plan.window === 'missed' ? 'Sowing window has passed' : plan.window === 'urgent' ? 'Sow this week' : 'Timed to the buyer window', text: plan.window === 'missed' ? `Needed sowing by ${fmtDay(plan.sowBy)}.` : `Sow ${fmtDay(plan.sowFrom)} – ${fmtDay(plan.sowBy)} so first harvest (${fmtDay(plan.harvestStart)}) matches delivery from ${fmtDay(plan.deliveryStart)}.` } : null,
    farmerCount > 1 ? { ok: true, title: 'Spread across farmers', text: `${farmerCount} farmers share the area, so one farm’s problem doesn’t break the order.` } : null,
    plan.existingKg > 0 ? { ok: true, title: 'Uses crops already growing', text: `${fmtT(plan.existingKg)} comes from crops already in the ground.` } : null,
  ].filter(Boolean) as { ok: boolean; title: string; text: string }[]

  const statusOf = (farmerId: string, fit: string) => {
    const s = replyStateFor(farmerId, responses, result.allocations)
    if (fit !== 'good' || s === 'constraint' || s === 'needs-update') return <span className="m-status review"><AlertTriangle size={15} />Needs review</span>
    if (s === 'confirmed') return <span className="m-status"><CheckCircle2 size={15} />Confirmed</span>
    if (s === 'sent') return <span className="m-status wait"><Clock3 size={15} />Awaiting reply</span>
    return <span className="m-status"><Check size={15} />Planned</span>
  }
  const removed = plan.unused.filter((u) => exclusions.includes(exclusionKey(u.plotId, plan.crop.name)))

  return <div className="m-page">
    <PageHeader title="Collective planting plan" subtitle="Turn buyer demand into a coordinated crop plan across your farmers." />

    <section className="m-stats" aria-label="Plan summary">
      <StatCard icon={<Sprout size={24} />} label="Demand target" tip="Demand in this scenario plus the safety buffer" value={fmtT(targetKg)} sub={<>incl. {scenario.bufferPct}% buffer · {presetFor(scenario)?.label ?? 'Custom'}</>} />
      <StatCard icon={<Boxes size={24} />} label="Planned production" tip="Expected harvest at the scenario's yield assumption" value={fmtT(expectedKg)} sub={<>{result.totalAcres.toFixed(1)} acres planned</>} />
      <StatCard icon={<UsersRound size={24} />} label="Participating farms" value={result.farmersInvolved.length} sub={<>across {villages} villages</>} />
      <StatCard icon={<ShieldCheck size={24} />} label="Risk level" tip="Based on coverage of the target and how many plots carry cautions" value={<span className="m-pillbig" style={riskStyle}>{risk}</span>} sub={<>{cautionShare < 0.25 ? 'High' : 'Mixed'} feasibility, {fmtPct(coverage)} coverage</>} />
    </section>

    <section className="m-panel" id={plan.crop.id} aria-labelledby="alloc-title" style={{ scrollMarginTop: 16 }}>
      <div className="m-panel-head">
        <div><h2 className="m-panel-title" id="alloc-title">Crop allocation &amp; farmer plan</h2><p className="m-panel-sub">Recommended crop allocation across farmers to meet buyer demand.</p></div>
        <div className="m-row">
          <button type="button" className="m-btn m-btn-tertiary m-btn-sm" style={{ borderColor: 'var(--line-strong)', borderRadius: 10 }} aria-pressed={editing} onClick={() => setEditing((v) => !v)}><Pencil size={16} />{editing ? 'Done editing' : 'Edit plan'}</button>
          <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={finalize}><Check size={17} />Finalize planting plan</button>
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

      <div className="m-dt-scroll"><table className="m-dt">
        <thead><tr><th>Farmer / Plot</th><th>Crop</th><th>Suggested planting window <InfoTipInline /></th><th>Expected harvest window</th><th>Quantity</th><th>Feasibility</th><th>Status</th>{editing && <th><span className="sr-only">Edit</span></th>}</tr></thead>
        <tbody>
          {plan.existing.map((e) => <tr key={e.cycle.id}>
            <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{e.farmer?.name}</strong><small>{e.plot.name} · {e.farmer?.village}</small></span></span></td>
            <td><span className="m-crop" style={{ fontWeight: 500, fontSize: 15 }}><span className="e" style={{ fontSize: 20 }}>{plan.crop.emoji}</span>{plan.crop.name}</span></td>
            <td><span className="m-chipdate">Already planted</span></td>
            <td><span className="m-chipdate plain"><CalendarDays size={16} />{fmtDay(e.cycle.expectedHarvestStartDate)} – {fmtDay(e.cycle.expectedHarvestEndDate)}</span></td>
            <td><strong>{fmtT(e.kg)}</strong><small>in delivery window</small></td>
            <td><Feasibility level="high" /></td>
            <td><span className="m-status"><Sprout size={15} />Growing</span></td>
            {editing && <td />}
          </tr>)}
          {plan.allocations.map((a) => {
            const isOpen = open === a.plotId
            return <Fragment key={a.plotId}>
              <tr className="click" onClick={() => setOpen(isOpen ? null : a.plotId)} aria-expanded={isOpen}>
                <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{a.farmerName}</strong><small>{a.plotName} · {fmtAcres(a.acres)} · {data.farmers.find((f) => f.id === a.farmerId)?.village}</small></span></span></td>
                <td><span className="m-crop" style={{ fontWeight: 500, fontSize: 15 }}><span className="e" style={{ fontSize: 20 }}>{plan.crop.emoji}</span>{plan.crop.name}</span></td>
                <td><span className="m-chipdate"><CalendarDays size={16} />{fmtDay(plan.sowFrom)} – {fmtDay(plan.sowBy)}</span></td>
                <td><span className="m-chipdate plain"><CalendarDays size={16} />{fmtDay(plan.harvestStart)} – {fmtDay(plan.harvestEnd)}</span></td>
                <td><strong>{fmtT(a.kg)}</strong><small>{fmtT(a.kgRange[0])}–{fmtT(a.kgRange[1])}</small></td>
                <td><Feasibility level={a.fit === 'good' ? 'high' : 'medium'} /></td>
                <td>{statusOf(a.farmerId, a.fit)}</td>
                {editing && <td><button type="button" className="m-btn m-btn-danger m-btn-xs" onClick={(e) => { e.stopPropagation(); toggleExclusion(a.plotId, plan.crop.name) }}><MinusCircle size={14} />Remove</button></td>}
              </tr>
              {isOpen && <tr><td colSpan={editing ? 8 : 7} style={{ background: '#fafcf8' }}><strong style={{ fontSize: 14 }}>Why this plot:</strong> <Reasons reasons={a.reasons} />{a.phase === 'indicative' && <small style={{ marginTop: 6 }}>Assigned to cover indicative demand.</small>}</td></tr>}
            </Fragment>
          })}
          {!plan.allocations.length && !plan.existing.length && <tr><td colSpan={7}><span className="m-small">No farmers assigned to {plan.crop.name.toLowerCase()} in this scenario.</span></td></tr>}
        </tbody>
      </table></div>

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

    <div className="m-cols-even">
      <section className="m-panel" aria-labelledby="crop-sd-title">
        <h2 className="m-panel-title" id="crop-sd-title" style={{ fontSize: 24 }}><BarChart3 size={24} color="var(--forest)" />Supply vs. demand <small>({plan.crop.name})</small></h2>
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
        <h2 className="m-panel-title" id="why-title" style={{ fontSize: 24 }}><Zap size={24} color="var(--forest)" />Why this plan is recommended</h2>
        <p className="m-panel-sub" style={{ marginBottom: 8 }}>How Meraki matched {plan.crop.name.toLowerCase()} demand to your farmers.</p>
        <ul className="m-why2">{why.map((w) => <li key={w.title}><span className={`m-roundico ${w.ok ? '' : 'warn'}`} style={{ width: 34, height: 34 }}>{w.ok ? <Check size={18} /> : <AlertTriangle size={17} />}</span><div><strong>{w.title}</strong><span>{w.text}</span></div></li>)}</ul>
      </section>
    </div>

    <ScenarioCompare />

    <section className="m-panel" aria-labelledby="cal-title">
      <h2 className="m-panel-title" id="cal-title" style={{ fontSize: 22 }}>Season calendar</h2>
      <p className="m-panel-sub" style={{ marginBottom: 14 }}>Sowing dates are worked back from each buyer’s delivery window and the crop’s days to harvest.</p>
      <Calendar plans={plans} />
    </section>

    <div className="m-cols-even">
      <section className="m-panel" id="history" aria-labelledby="history-title" style={{ scrollMarginTop: 16 }}>
        <h2 className="m-panel-title" id="history-title" style={{ fontSize: 22 }}><History size={22} />Plan updates</h2>
        <div style={{ marginTop: 12 }}>{changes.length ? changes.map((c) => <div className="m-change" key={c.id}><strong>{c.title}</strong> <span className="m-small">· {new Date(c.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span><ul>{c.details.map((d) => <li key={d}>{d}</li>)}</ul></div>)
          : <p className="m-small" style={{ margin: 0 }}>No changes yet. When farmers decline, report a problem, or you remove a plot, Meraki rebalances the plan and records what changed here.</p>}</div>
      </section>
      <section className="m-panel" aria-labelledby="out-title">
        <h2 className="m-panel-title" id="out-title" style={{ fontSize: 22 }}><UserX size={22} />Farmers not in this plan</h2>
        <div className="m-stack" style={{ gap: 8, marginTop: 12 }}>
          {result.ineligible.map(({ farmer, reason }) => <div key={farmer.id} className="m-row" style={{ justifyContent: 'space-between' }}><Link className="m-link" to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link><span className="m-tag m-tag-neutral">{reason}</span></div>)}
          {!result.ineligible.length && <p className="m-small" style={{ margin: 0 }}>Every member is participating.</p>}
        </div>
        <div className="m-row" style={{ justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <span className="m-small">Reserve crops already growing against one order</span>
          <Link to="/supply-planning" className="m-link" id="reserve-title">Order reservations <ChevronRight size={15} /></Link>
        </div>
      </section>
    </div>

    <details className="m-panel m-details">
      <summary style={{ paddingTop: 0 }}><Info size={16} />How Meraki builds this plan</summary>
      <ol className="m-small" style={{ lineHeight: 1.7, paddingLeft: 20, margin: '10px 0 0' }}>
        <li>Adds up active buyer orders per crop. Confirmed orders are planned first; indicative demand only if the scenario includes it.</li>
        <li>Works back the sow-by date from the earliest delivery date and the crop’s days to first harvest.</li>
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
