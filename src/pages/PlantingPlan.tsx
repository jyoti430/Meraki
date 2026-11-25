import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowRight, History, BarChart3, Send, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Info, MinusCircle, Pencil, PlusCircle, ShieldCheck, Sprout, UsersRound, Boxes, Zap } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, exclusionKey, presetFor, replyStateFor, runPlan, scenarioPresets } from '../planning/engine'
import type { CropPlan, Scenario } from '../planning/engine'
import { daysBetween, toDate } from '../planning/format'
import { cumulative, weeklySeries } from '../planning/series'
import { Feasibility, Reasons, StatCard, SupplyMeter, lineStatusLabel } from '../components/ui'
import LineChart from '../components/LineChart'
import { rowActivation } from '../components/rowActivation'
import PageHeader from '../components/layout/PageHeader'
import { fmtT, translatedAction } from './Overview'
import { cropLabel, formatDate, formatNumber, useI18n } from '../i18n'
import { formatOptionalDate, translateEligibilityReason } from '../i18n/planning'

const CAL_START = '2026-11-01'
const CAL_MONTHS = 9

function Calendar({ plans }: { plans: CropPlan[] }) {
  const { t, lang } = useI18n()
  const endDate = (() => { const d = toDate(CAL_START); d.setUTCMonth(d.getUTCMonth() + CAL_MONTHS); return d.toISOString().slice(0, 10) })()
  const total = daysBetween(CAL_START, endDate)
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (daysBetween(CAL_START, iso) / total) * 100))}%`
  const width = (a: string, b: string) => `calc(${pos(b)} - ${pos(a)})`
  const months = Array.from({ length: CAL_MONTHS }, (_, i) => { const d = toDate(CAL_START); d.setUTCMonth(d.getUTCMonth() + i); return formatDate(d, lang, { month: 'short' }) })
  return <div className="m-cal" style={{ ['--months' as string]: CAL_MONTHS }}>
    <span />
    <div className="m-cal-months" style={{ gridTemplateColumns: `repeat(${CAL_MONTHS}, minmax(0, 1fr))` }}>{months.map((m) => <span key={m}>{m}</span>)}</div>
    {plans.flatMap((pl) => pl.lines.filter((l) => l.harvestStart).map((l) => ({ ...l, crop: pl.crop }))).map((p) => <div key={p.order.id} style={{ display: 'contents' }}>
      <span className="m-cal-label" title={`${cropLabel(p.crop.name, t)} · ${p.order.buyer.name}`}>{p.crop.emoji} {cropLabel(p.crop.name, t)} <span className="m-small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>· {p.order.buyer.name.split(' ')[0]}</span></span>
      <div className="m-cal-track" role="img" aria-label={t('plan_ui_calendar_track', { crop: cropLabel(p.crop.name, t), sowFrom: formatOptionalDate(p.sowFrom, lang, t('plan_ui_not_applicable')), sowBy: formatOptionalDate(p.sowBy, lang, t('plan_ui_not_applicable')), harvestStart: formatOptionalDate(p.harvestStart, lang, t('plan_ui_unknown')), harvestEnd: formatOptionalDate(p.harvestEnd, lang, t('plan_ui_unknown')), deliveryStart: formatOptionalDate(p.deliveryStart, lang, t('plan_ui_unknown')), deliveryEnd: formatOptionalDate(p.deliveryEnd, lang, t('plan_ui_unknown')) })}>
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
      <span><i className="m-swatch" style={{ background: 'var(--marigold)' }} /> {t('plan_ui_calendar_sowing')}</span>
      <span><i className="m-swatch" style={{ background: '#cfe3d6' }} /> {t('plan_ui_calendar_growing')}</span>
      <span><i className="m-swatch" style={{ background: 'var(--forest)' }} /> {t('plan_ui_calendar_harvest')}</span>
      <span><i className="m-swatch" style={{ border: '2px dashed var(--order)' }} /> {t('plan_ui_calendar_delivery')}</span>
      <span><i className="m-swatch" style={{ background: 'var(--bad)', width: 2 }} /> {t('plan_ui_calendar_today')}</span>
    </div>
  </div>
}

function ScenarioCompare() {
  const { t, lang } = useI18n()
  const { scenario, setScenario, responses, exclusions } = usePlan()
  const { orders } = useBuyerOrders()
  const { data } = useFarmers()
  const rows = useMemo(() => scenarioPresets.map((p) => {
    const r = runPlan({ orders, data, scenario: p.scenario, responses, exclusions })
    return { preset: p, acres: r.totalAcres, farmers: r.farmersInvolved.length, confirmed: r.confirmedDemandKg ? r.confirmedCoveredKg / r.confirmedDemandKg : 0, all: r.allDemandKg ? r.allCoveredKg / r.allDemandKg : 0, gaps: r.plans.filter((x) => x.gapKg > 0 && x.status !== 'not-in-scenario').length }
  }), [orders, data, responses, exclusions])
  const set = (patch: Partial<Scenario>) => setScenario({ ...scenario, ...patch })
  const scenarioName = (id: string) => id === 'cautious' ? t('scenario_ui_cautious') : id === 'secure' ? t('scenario_ui_secure') : t('scenario_ui_balanced')
  const scenarioSummary = (id: string) => id === 'cautious' ? t('scenario_ui_cautious_summary') : id === 'secure' ? t('scenario_ui_secure_summary') : t('scenario_ui_balanced_summary')
  return <section aria-label={t('plan_ui_compare_scenarios')} style={{ marginTop: 12 }}>
    <div className="m-panel-head"><p className="m-panel-sub" style={{ margin: 0 }}>{t('plan_ui_scenarios_rerun')}</p>{!presetFor(scenario) && <span className="m-status review"><AlertTriangle size={15} />{t('plan_ui_custom_assumptions')}</span>}</div>
    <div className="m-scenarios">
      {rows.map((c) => <button type="button" key={c.preset.id} className="m-scenario" aria-pressed={presetFor(scenario)?.id === c.preset.id} onClick={() => setScenario(c.preset.scenario)}>
        <span className="m-scenario-title">{scenarioName(c.preset.id)}{presetFor(scenario)?.id === c.preset.id && <span className="m-tag m-tag-plan">{t('plan_ui_active')}</span>}</span>
        <p>{scenarioSummary(c.preset.id)}</p>
        <dl>
          <div><dt>{t('plan_ui_land')}</dt><dd>{formatNumber(c.acres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ac</dd></div>
          <div><dt>{t('plan_ui_farmers')}</dt><dd>{formatNumber(c.farmers, lang)}</dd></div>
          <div><dt>{t('plan_ui_crops_short')}</dt><dd>{formatNumber(c.gaps, lang)}</dd></div>
          <div><dt>{t('plan_ui_confirmed')}</dt><dd>{formatNumber(Math.round(c.confirmed * 100), lang)}% <span className="m-small">{t('plan_ui_covered')}</span></dd></div>
          <div><dt>{t('plan_ui_all_demand')}</dt><dd>{formatNumber(Math.round(c.all * 100), lang)}% <span className="m-small">{t('plan_ui_covered')}</span></dd></div>
        </dl>
      </button>)}
    </div>
    <details className="m-details" style={{ marginTop: 14 }}>
      <summary><ChevronRight className="m-chev" size={16} />{t('plan_ui_customize_assumptions')}</summary>
      <div className="m-form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', paddingTop: 10 }}>
        <label className="m-field">{t('plan_ui_plan_for')}<select className="m-select" value={scenario.basis} onChange={(e) => set({ basis: e.target.value as Scenario['basis'] })}><option value="confirmed">{t('plan_ui_confirmed_only')}</option><option value="all">{t('plan_ui_confirmed_indicative')}</option></select></label>
        <label className="m-field">{t('plan_ui_yield_assumption')}<select className="m-select" value={scenario.yieldCase} onChange={(e) => set({ yieldCase: e.target.value as Scenario['yieldCase'] })}><option value="conservative">{t('plan_ui_conservative')}</option><option value="expected">{t('plan_ui_expected_yield')}</option></select></label>
        <label className="m-field">{t('plan_ui_safety_buffer', { percent: formatNumber(scenario.bufferPct, lang) })}<input className="m-range" type="range" min={0} max={30} step={5} value={scenario.bufferPct} onChange={(e) => set({ bufferPct: Number(e.target.value) })} /><small>{t('plan_ui_safety_buffer_help')}</small></label>
      </div>
    </details>
  </section>
}

export default function PlantingPlan() {
  const { t, lang } = useI18n()
  const { result, changes, responses, exclusions, toggleExclusion, scenario, setScenario, finalizePlan, planState, finalized } = usePlan()
  const { data } = useFarmers()
  const { hash } = useLocation()
  const plans = result.plans
  const day = (iso: string) => iso ? formatDate(iso, lang, { day: 'numeric', month: 'short' }) : '—'
  const acres = (value: number) => `${formatNumber(value, lang, { maximumFractionDigits: 2 })} ac`
  const percent = (ratio: number) => `${formatNumber(Math.round(ratio * 100), lang)}%`
  const displayCrop = (name: string) => cropLabel(name, t)
  const scenarioLabel = (id?: string) => id === 'cautious' ? t('scenario_ui_cautious') : id === 'secure' ? t('scenario_ui_secure') : id === 'balanced' ? t('scenario_ui_balanced') : t('plan_ui_custom')
  const translatedRiskFactor = (text: string) => {
    const committed = text.match(/^(\d+) committed order/)
    if (committed) return t('plan_ui_risk_committed', { count: Number(committed[1]) })
    const plannedOnly = text.match(/^Only (\d+)% of the target is planned$/)
    if (plannedOnly) return t('plan_ui_risk_target_low', { percent: Number(plannedOnly[1]) })
    const planned = text.match(/^(\d+)% of the target is planned$/)
    if (planned) return t('plan_ui_risk_target_near', { percent: Number(planned[1]) })
    const unconfirmed = text.match(/^(\d+)% of planned supply not yet farmer-confirmed$/)
    if (unconfirmed) return t('plan_ui_risk_not_confirmed', { percent: Number(unconfirmed[1]) })
    if (text.includes('Sowing deadline within 10 days')) return t('plan_ui_risk_urgent')
    const indicative = text.match(/^(\d+)% of the target is indicative demand$/)
    if (indicative) return t('plan_ui_risk_indicative', { percent: Number(indicative[1]) })
    const cautions = text.match(/^(\d+) planned plot/)
    if (cautions) return t('plan_ui_risk_farm_cautions', { count: Number(cautions[1]) })
    return text
  }
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
    // Finalizing records the current proposal; buyer commitment and farmer acceptance remain separate.
    if (window.confirm(t('plan_ui_confirm_finalize', { scenario: scenarioLabel(presetFor(scenario)?.id), area: formatNumber(result.totalAcres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: result.farmersInvolved.length }))) finalizePlan()
  }

  if (!plan) return <div className="m-page"><PageHeader title={t('planting_title')} subtitle={t('planting_sub')} /><Link to="/buyer-orders/new" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start' }}>{t('nav_demand')}</Link></div>

  const weeks = weeklySeries([plan])
  const cumD = cumulative(weeks.map((w) => w.demand / 1000))
  const cumS = cumulative(weeks.map((w) => w.supply / 1000))
  const demandTotal = plan.confirmedKg + plan.indicativeKg
  const goodPlots = plan.allocations.filter((a) => a.fit === 'good').length
  const farmerCount = new Set(plan.allocations.map((a) => a.farmerId)).size
  const cropText = displayCrop(plan.crop.name)
  const why = [
    plan.status === 'covered' ? { ok: true, title: t('plan_ui_reason_title_covered'), text: t('plan_ui_reason_covered', { expected: fmtT(plan.expectedKg, lang), target: fmtT(plan.targetKg, lang), coverage: percent(plan.targetKg ? plan.expectedKg / plan.targetKg : 0).replace('%', ''), buffer: formatNumber(scenario.bufferPct, lang) }) }
      : plan.status === 'not-in-scenario' ? { ok: false, title: t('plan_ui_reason_title_indicative'), text: t('plan_ui_reason_indicative') }
        : { ok: false, title: t('plan_ui_reason_title_gap'), text: t('plan_ui_reason_short', { expected: fmtT(plan.expectedKg, lang), target: fmtT(plan.targetKg, lang) }) },
    plan.allocations.length ? { ok: goodPlots === plan.allocations.length, title: t(goodPlots === plan.allocations.length ? 'plan_ui_reason_title_feasibility_high' : 'plan_ui_reason_title_feasibility_mixed'), text: t(goodPlots === plan.allocations.length ? 'plan_ui_reason_feasibility_high' : 'plan_ui_reason_feasibility_mixed', { good: formatNumber(goodPlots, lang), total: formatNumber(plan.allocations.length, lang) }) } : null,
    plan.sowBy ? { ok: plan.window === 'open', title: t(plan.window === 'missed' ? 'plan_ui_reason_title_sow_passed' : 'plan_ui_reason_title_sow_window'), text: plan.window === 'missed' ? t('plan_ui_reason_sow_passed', { date: day(plan.sowBy) }) : t('plan_ui_reason_sow_window', { sowFrom: day(plan.sowFrom), sowBy: day(plan.sowBy), harvest: day(plan.harvestStart), delivery: day(plan.deliveryStart) }) } : null,
    farmerCount > 1 ? { ok: true, title: t('plan_ui_reason_title_spread'), text: t('plan_ui_reason_spread', { count: formatNumber(farmerCount, lang) }) } : null,
    plan.lines.length > 1 ? { ok: plan.lines.filter((l) => l.inScenario).every((l) => l.status === 'covered'), title: t('plan_ui_reason_title_orders'), text: t('plan_ui_reason_orders', { count: formatNumber(plan.lines.length, lang) }) } : null,
    plan.existingKg > 0 ? { ok: true, title: t('plan_ui_reason_title_existing'), text: t('plan_ui_reason_existing', { quantity: fmtT(plan.existingKg, lang) }) } : null,
  ].filter(Boolean) as { ok: boolean; title: string; text: string }[]

  const statusOf = (farmerId: string, fit: string) => {
    const s = replyStateFor(farmerId, responses, result.allocations)
    if (fit !== 'good' || s === 'constraint' || s === 'needs-update') return <span className="m-status review"><AlertTriangle size={15} />{t('plan_ui_needs_review')}</span>
    if (s === 'confirmed') return <span className="m-status"><CheckCircle2 size={15} />{t('msg_farmer_confirmed')}</span>
    if (s === 'sent') return <span className="m-status wait"><Clock3 size={15} />{t('plan_ui_sent')}</span>
    return <span className="m-status"><Check size={15} />{t('plan_ui_planned')}</span>
  }
  const removed = plan.unused.filter((u) => exclusions.includes(exclusionKey(u.plotId, plan.crop.name)))
  const cropOrderIds = new Set(plan.lines.map((l) => l.order.id))
  const nextStep = result.actions.find((a) => a.id.endsWith(plan.crop.id) || [...cropOrderIds].some((id) => a.id.endsWith(id)))
    ?? (planState !== 'finalized' ? { id: 'finalize', tone: 'attention' as const, title: t(planState === 'changed' ? 'plan_ui_refinalize' : 'plan_ui_finalize_next_title'), detail: t('plan_ui_finalize_next_detail'), to: '#alloc-title', cta: t('plan_ui_review') }
      : result.actions.find((a) => a.id === 'send' || a.id === 'resend' || a.id === 'constraints'))
  const translatedNextStep = nextStep ? nextStep.id === 'finalize' ? { title: nextStep.title, detail: nextStep.detail, cta: nextStep.cta } : translatedAction(nextStep, result, t, lang) : null
  const lineStatusKey: Record<string, 'plan_status_covered' | 'plan_status_partial' | 'plan_status_gap' | 'plan_status_not_plantable' | 'plan_status_not_in_scenario'> = {
    covered: 'plan_status_covered', partial: 'plan_status_partial', gap: 'plan_status_gap', 'not-plantable': 'plan_status_not_plantable', 'not-in-scenario': 'plan_status_not_in_scenario',
  }
  const riskKey = risk.level === 'Low' ? 'market_low' : risk.level === 'Medium' ? 'market_medium' : 'market_high'

  return <div className="m-page">
    <PageHeader title={t('planting_title')} subtitle={t('planting_sub')} />

    <section className="m-stats" aria-label={t('plan_ui_summary')}>
      <StatCard icon={<Sprout size={24} />} label={t('plan_ui_target')} tip={t('demand_committed_tip')} value={fmtT(targetKg, lang)} sub={<> {t('plan_ui_safety_buffer', { percent: formatNumber(scenario.bufferPct, lang) })} · {scenarioLabel(presetFor(scenario)?.id)}</>} />
      <StatCard icon={<Boxes size={24} />} label={t('expected_supply')} tip={t('overview_tip_supply')} value={fmtT(expectedKg, lang)} sub={<>{formatNumber(result.totalAcres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ac {t('plan_ui_planned').toLowerCase()}</>} />
      <StatCard icon={<UsersRound size={24} />} label={t('plan_ui_farmers')} value={formatNumber(result.farmersInvolved.length, lang)} sub={<>{t('overview_farm_villages', { count: formatNumber(villages, lang) })}</>} />
      <StatCard icon={<ShieldCheck size={24} />} label={t('plan_ui_risk_level')} tip={risk.factors.length ? `${risk.factors.map(translatedRiskFactor).join('; ')}.` : t('plan_ui_no_major_risks')} value={<span className="m-pillbig" style={riskStyle}>{t(riskKey)}</span>} sub={<>{risk.factors.length ? translatedRiskFactor(risk.factors[0]) : t('plan_ui_no_major_risks')}{risk.factors.length > 1 ? ` · ${t('plan_ui_more_factors', { count: formatNumber(risk.factors.length - 1, lang) })}` : ''}</>} />
    </section>

    {changes[0] && <section className="m-latest-change" aria-label={t('plan_ui_latest_update_aria')} role="status">
      <History size={18} aria-hidden="true" />
      <div><strong>{t('plan_ui_latest_update', { title: changes[0].title })}</strong>
        <ul>{changes[0].details.slice(0, 2).map((d) => <li key={d}>{d}</li>)}</ul>
        <Link to="/plan#history" className="m-link">{t('plan_ui_see_updates', { count: formatNumber(changes.length, lang) })}</Link>
      </div>
    </section>}

    <section className="m-panel" id={plan.crop.id} aria-labelledby="alloc-title" style={{ scrollMarginTop: 16 }}>
      <div className="m-panel-head">
        <div><h2 className="m-panel-title" id="alloc-title">{t('plan_ui_allocations')}
          {planState === 'draft' && <span className="m-status wait" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}>{t('status_draft')} {t('plan_ui_allocations').toLowerCase()}</span>}
          {planState === 'finalized' && finalized && <span className="m-status" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}><CheckCircle2 size={14} />{t('plan_ui_finalized_date', { date: day(finalized.at.slice(0, 10)) })}</span>}
          {planState === 'changed' && <span className="m-status review" style={{ fontFamily: 'var(--font-body)', letterSpacing: 0 }}><AlertTriangle size={14} />{t('plan_ui_changed')}</span>}
        </h2><p className="m-panel-sub">{t('plan_ui_allocation_intro')}</p></div>
        <div className="m-row">
          <button type="button" className="m-btn m-btn-tertiary m-btn-sm" style={{ borderColor: 'var(--line-strong)', borderRadius: 10 }} aria-pressed={editing} onClick={() => setEditing((v) => !v)}><Pencil size={16} />{editing ? t('plan_ui_done_editing') : t('plan_ui_edit')}</button>
          {planState === 'finalized'
            ? <Link to="/messages" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }}><Send size={16} />{pending.length ? t('plan_ui_send_instructions', { count: formatNumber(pending.length, lang) }) : t('plan_ui_view_messages')}</Link>
            : <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={finalize}><Check size={17} />{planState === 'changed' ? t('plan_ui_refinalize') : t('plan_ui_finalize')}</button>}
        </div>
      </div>
      <div className="m-row" style={{ marginBottom: 14 }}>
        <label className="m-row" style={{ gap: 12, fontWeight: 600 }}>{t('plan_ui_crop')}
          <span className="m-select-pill m-crop-pick"><span aria-hidden="true">{plan.crop.emoji}</span><select value={plan.crop.id} onChange={(e) => setCropId(e.target.value)} aria-label={t('plan_ui_crop')}>{plans.map((p) => <option key={p.crop.id} value={p.crop.id}>{cropLabel(p.crop.name, t)}</option>)}</select></span>
        </label>
        <span className="m-chip-target">{t('plan_ui_target')}<strong>{fmtT(plan.targetKg, lang)}</strong></span>
        <label className="m-row" style={{ gap: 8, fontWeight: 600, marginLeft: 'auto' }}>{t('plan_ui_scenario')}
          <span className="m-select-pill"><select value={presetFor(scenario)?.id ?? 'custom'} onChange={(e) => { const p = scenarioPresets.find((x) => x.id === e.target.value); if (p) setScenario(p.scenario) }} aria-label={t('plan_ui_scenario')}>{scenarioPresets.map((p) => <option key={p.id} value={p.id}>{scenarioLabel(p.id)}</option>)}{!presetFor(scenario) && <option value="custom">{t('plan_ui_custom')}</option>}</select></span>
        </label>
      </div>

      {plan.status === 'not-in-scenario' && <div className="m-alert m-alert-info" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />{t('plan_ui_only_indicative', { crop: cropText })}</div>}
      {plan.window === 'missed' && <div className="m-alert m-alert-warn" style={{ marginBottom: 12 }}><Info size={18} style={{ flex: 'none' }} />{t('plan_ui_late_delivery', { delivery: day(plan.deliveryStart), crop: cropText.toLowerCase(), sowBy: day(plan.sowBy) })}</div>}

      <h3 className="m-h3" style={{ margin: '4px 0 6px' }}>{t('plan_ui_buyer_orders')} <span className="m-small" style={{ fontWeight: 400 }}>– {t('plan_ui_orders_detail')}</span></h3>
      <div className="m-dt-scroll" style={{ marginBottom: 18 }}><table className="m-dt">
        <thead><tr><th>{t('plan_ui_buyer')}</th><th>{t('plan_ui_variety')}</th><th>{t('plan_ui_quantity')}</th><th>{t('plan_ui_delivery')}</th><th>{t('plan_ui_sow_by')}</th><th>{t('plan_ui_expected')}</th><th>{t('plan_ui_status')}</th></tr></thead>
        <tbody>{plan.lines.map((l) => <tr key={l.order.id}>
          <td><Link to={`/buyer-orders/${l.order.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{l.order.buyer.name}</Link><small><span className={`m-dotstatus ${l.committed ? '' : 'ind'}`} style={{ padding: '0 8px', fontSize: 12, marginTop: 4 }}>{t(l.committed ? 'demand_order_committed' : 'demand_order_indicative')}</span></small></td>
          <td>{l.variety}</td>
          <td className="num"><strong>{fmtT(l.qtyKg, lang)}</strong>{l.inScenario && l.targetKg !== l.qtyKg && <small>{t('plan_ui_target_short', { quantity: fmtT(l.targetKg, lang) })}</small>}</td>
          <td className="nowrap">{day(l.deliveryStart)} – {day(l.deliveryEnd)}</td>
          <td className="nowrap">{l.window === 'perennial' ? t('plan_ui_orchard') : l.window === 'missed' ? <span style={{ color: 'var(--bad)' }}>{t('plan_ui_passed', { date: day(l.sowBy) })}</span> : day(l.sowBy)}</td>
          <td className="num"><strong>{fmtT(l.expectedKg, lang)}</strong><small>{l.existingKg ? t('plan_ui_existing_growing', { quantity: fmtT(l.existingKg, lang) }) : t('plan_ui_plot_count', { count: formatNumber(l.allocations.length, lang) })}{l.farmerConfirmedKg ? ` · ${t('plan_ui_farmer_confirmed', { quantity: fmtT(l.farmerConfirmedKg, lang) })}` : ''}</small></td>
          <td><span className={`m-feas ${lineStatusLabel[l.status].cls}`}><span>{t(lineStatusKey[l.status])}</span></span>{l.shortfallKg > 0 && <small style={{ color: 'var(--bad)' }}>{t('plan_ui_short', { quantity: fmtT(l.shortfallKg, lang) })}</small>}</td>
        </tr>)}</tbody>
      </table></div>

      <h3 className="m-h3" style={{ margin: '0 0 6px' }}>{t('plan_ui_farmers_plots')}</h3>
      <div className="m-dt-scroll"><table className="m-dt">
        <thead><tr><th>{t('plan_ui_farmer_plot')}</th><th>{t('plan_ui_planting_window')} <InfoTipInline /></th><th>{t('plan_ui_harvest_window')}</th><th>{t('plan_ui_quantity')}</th><th>{t('plan_ui_feasibility')}</th><th>{t('plan_ui_status')}</th>{editing && <th><span className="sr-only">{t('plan_ui_edit')}</span></th>}</tr></thead>
        <tbody>
          {plan.existing.map((e) => <tr key={`${e.cycle.id}-${e.orderId}`}>
            <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{e.farmer?.name}</strong><small>{e.plot.name} · {t('plan_ui_buyer')}: {plan.lines.find((l) => l.order.id === e.orderId)?.order.buyer.name}</small></span></span></td>
            <td><span className="m-chipdate">{t('plan_ui_already_planted')}</span></td>
            <td><span className="m-chipdate plain"><CalendarDays size={16} />{day(e.windowStart)} – {day(e.windowEnd)}</span></td>
            <td><strong>{fmtT(e.kg, lang)}</strong><small>{t('plan_ui_in_window')}</small></td>
            <td><Feasibility level="high" /></td>
            <td><span className="m-status"><Sprout size={15} />{t('plan_ui_growing')}</span></td>
            {editing && <td />}
          </tr>)}
          {plan.allocations.map((a) => {
            const key = `${a.orderId}-${a.plotId}`
            const isOpen = open === key
            return <Fragment key={key}>
              <tr className="click" {...rowActivation(() => setOpen(isOpen ? null : key))} aria-expanded={isOpen} aria-label={t('plan_ui_show_plot_reasons_aria', { farmer: a.farmerName, plot: a.plotName })}>
                <td><span className="m-row" style={{ flexWrap: 'nowrap', gap: 12 }}><UsersRound size={20} color="var(--mute)" /><span><strong style={{ fontWeight: 600 }}>{a.farmerName}</strong><small>{a.plotName} · {acres(a.acres)} · {a.buyerName}{plan.varieties.length > 1 ? ` (${a.variety})` : ''}</small></span></span></td>
                <td><span className="m-chipdate"><CalendarDays size={16} />{day(a.sowFrom)} – {day(a.sowBy)}</span></td>
                <td><span className="m-chipdate plain"><CalendarDays size={16} />{day(a.harvestStart)} – {day(a.harvestEnd)}</span></td>
                <td><strong>{fmtT(a.kg, lang)}</strong><small>{fmtT(a.kgRange[0], lang)}–{fmtT(a.kgRange[1], lang)}</small></td>
                <td><Feasibility level={a.fit === 'good' ? 'high' : 'medium'} /></td>
                <td>{statusOf(a.farmerId, a.fit)}</td>
                {editing && <td><button type="button" className="m-btn m-btn-danger m-btn-xs" onClick={(e) => { e.stopPropagation(); toggleExclusion(a.plotId, plan.crop.name) }}><MinusCircle size={14} />{t('plan_ui_remove')}</button></td>}
              </tr>
              {isOpen && <tr><td colSpan={editing ? 7 : 6} style={{ background: '#fafcf8' }}><strong style={{ fontSize: 14 }}>{t('plan_ui_why_plot')}</strong> <Reasons reasons={a.reasons} />{a.phase === 'indicative' && <small style={{ marginTop: 6 }}>{t('plan_ui_indicative_assigned')}</small>}</td></tr>}
            </Fragment>
          })}
          {!plan.allocations.length && !plan.existing.length && <tr><td colSpan={6}><span className="m-small">{t('plan_ui_no_farmers', { crop: cropText.toLowerCase() })}</span></td></tr>}
        </tbody>
      </table></div>
      {plan.uncounted.length > 0 && <p className="m-small" style={{ margin: '10px 0 0' }}><Info size={14} style={{ verticalAlign: '-2px' }} /> {t('plan_ui_not_counted', { details: plan.uncounted.map((u) => `${u.farmer?.name ?? t('plan_ui_unknown')} – ${u.cycle.variety} (${u.reason.replace('Not counted – ', '')})`).join('; ') })}</p>}
      {nextStep && translatedNextStep && <Link to={nextStep.to} className="m-reco" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'center' }}><Zap size={20} color="var(--forest)" style={{ flex: 'none' }} /><div style={{ flex: 1 }}><strong>{t('plan_ui_next_step', { title: translatedNextStep.title })}</strong><p>{translatedNextStep.detail}</p></div><span className="m-action-btn">{translatedNextStep.cta}<ArrowRight size={15} /></span></Link>}

      {(editing || removed.length > 0) && !plan.crop.perennial && <details className="m-details" open={editing} style={{ marginTop: 12 }}>
        <summary><ChevronRight className="m-chev" size={16} />{t('plan_ui_other_farms', { crop: cropText.toLowerCase(), count: formatNumber(plan.unused.length, lang) })}{removed.length ? ` · ${t('plan_ui_removed_by_you', { count: formatNumber(removed.length, lang) })}` : ''}</summary>
        <div className="m-dt-scroll"><table className="m-dt"><tbody>
          {plan.unused.map((u) => <tr key={u.plotId}>
            <td style={{ width: '30%' }}><Link className="m-link" to={`/farmers-plots/${u.farmerId}`}>{u.farmerName}</Link><small>{u.plotName} · {acres(u.acres)}</small></td>
            <td><Reasons reasons={u.reasons} /></td>
            <td style={{ width: 120 }}>{exclusions.includes(exclusionKey(u.plotId, plan.crop.name)) && <button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => toggleExclusion(u.plotId, plan.crop.name)}><PlusCircle size={14} />{t('plan_ui_add_back')}</button>}</td>
          </tr>)}
        </tbody></table></div>
      </details>}
    </section>

    <div className="m-stack" style={{ gap: 24 }}>
      <section className="m-panel" aria-labelledby="crop-sd-title">
        <h2 className="m-panel-title sm" id="crop-sd-title"><BarChart3 size={24} color="var(--forest)" />{t('plan_ui_supply_demand')} <small>({cropText})</small></h2>
        <p className="m-panel-sub" style={{ marginBottom: 12 }}>{t(plan.expectedKg >= demandTotal ? 'plan_ui_meets_demand' : 'plan_ui_below_demand')}</p>
        {weeks.length > 1 ? <div className="m-chartwrap">
          <LineChart ariaLabel={t('plan_ui_cumulative_chart', { crop: cropText })} labels={weeks.map((w) => day(w.start))}
            series={[{ label: t('plan_ui_demand_cumulative'), color: '#1b5e20', values: cumD }, { label: t('plan_ui_supply_cumulative'), color: '#7cc35b', values: cumS, fill: true }]} />
          <div className="m-minis">
            <div className="m-mini"><small>{t('plan_ui_demand_total')}</small><strong>{fmtT(demandTotal, lang)}</strong></div>
            <div className="m-mini"><small>{t('plan_ui_planned_supply')}</small><strong>{fmtT(plan.expectedKg, lang)}</strong></div>
            <div className="m-mini green"><small>{t('plan_ui_coverage')}</small><strong>{percent(demandTotal ? plan.expectedKg / demandTotal : 0)}</strong></div>
          </div>
        </div> : <SupplyMeter plan={plan} showLegend />}
      </section>
      <section className="m-panel" aria-labelledby="why-title">
        <h2 className="m-panel-title sm" id="why-title"><Zap size={24} color="var(--forest)" />{t('plan_ui_why_recommended')}</h2>
        <p className="m-panel-sub" style={{ marginBottom: 8 }}>{t('plan_ui_how_matched', { crop: cropText.toLowerCase() })}</p>
        <ul className="m-why2 m-why-grid">{why.map((w) => <li key={w.title}><span className={`m-roundico ${w.ok ? '' : 'warn'}`} style={{ width: 34, height: 34 }}>{w.ok ? <Check size={18} /> : <AlertTriangle size={17} />}</span><div><strong>{w.title}</strong><span>{w.text}</span></div></li>)}</ul>
      </section>
    </div>

    <h2 className="m-h3" style={{ margin: '8px 0 -8px', color: 'var(--mute)', fontWeight: 600 }}>{t('plan_ui_more_detail')}</h2>
    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />{t('plan_ui_compare_scenarios')} <span className="m-small">· {scenarioLabel(presetFor(scenario)?.id)} · {t('plan_ui_active')}</span></summary>
      <ScenarioCompare />
    </details>

    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />{t('plan_ui_season_calendar')} <span className="m-small">· {t('plan_ui_calendar_detail')}</span></summary>
      <Calendar plans={plans} />
    </details>

    <details className="m-panel m-details m-fold" id="history" style={{ scrollMarginTop: 16 }} open={hash === '#history'}>
      <summary><ChevronRight className="m-chev" size={18} />{t('plan_ui_plan_updates', { count: formatNumber(changes.length, lang) })}</summary>
        <div style={{ marginTop: 12 }}>{changes.length ? changes.map((c) => <div className="m-change" key={c.id}><strong>{c.title}</strong> <span className="m-small">· {formatDate(c.at, lang, { dateStyle: 'medium', timeStyle: 'short' })}</span><ul>{c.details.map((d) => <li key={d}>{d}</li>)}</ul></div>)
          : <p className="m-small" style={{ margin: 0 }}>{t('plan_ui_no_changes')} {t('plan_ui_changes_help')}</p>}</div>
    </details>
    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />{t('plan_ui_farmers_not_in_plan', { count: formatNumber(result.ineligible.length, lang) })}</summary>
        <div className="m-stack" style={{ gap: 8, marginTop: 12 }}>
          {result.ineligible.map(({ farmer, reason }) => <div key={farmer.id} className="m-row" style={{ justifyContent: 'space-between' }}><Link className="m-link" to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link><span className="m-tag m-tag-neutral">{translateEligibilityReason(reason, t)}</span></div>)}
          {!result.ineligible.length && <p className="m-small" style={{ margin: 0 }}>{t('plan_ui_every_member')}</p>}
        </div>
        <div className="m-row" style={{ justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <span className="m-small">{t('plan_ui_reserve_existing')}</span>
          <Link to="/supply-planning" className="m-link" id="reserve-title">{t('plan_ui_reservations')} <ChevronRight size={15} /></Link>
        </div>
    </details>

    <details className="m-panel m-details m-fold">
      <summary><ChevronRight className="m-chev" size={18} />{t('plan_ui_how_plan_built')}</summary>
      <ol className="m-small" style={{ lineHeight: 1.7, paddingLeft: 20, margin: '10px 0 0' }}>
        <li>{t('plan_ui_method_order')}</li>
        <li>{t('plan_ui_method_timing')}</li>
        <li>{t('plan_ui_method_existing')}</li>
        <li>{t('plan_ui_method_reports')}</li>
        <li>{t('plan_ui_method_conditions')}</li>
        <li>{t('plan_ui_method_area')}</li>
        <li>{t('plan_ui_method_estimate')}</li>
      </ol>
      <p className="m-small" style={{ marginBottom: 0 }}>{t('plan_ui_disclaimer')}</p>
    </details>
  </div>
}

function InfoTipInline() {
  const { t } = useI18n()
  return <span className="m-info" title={t('plan_ui_info_window_title')} role="img" aria-label={t('plan_ui_info_window_aria')}><Info size={14} /></span>
}
