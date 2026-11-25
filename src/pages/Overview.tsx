import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cropLabel, formatDate, formatNumber, useI18n, type Lang } from '../i18n'
import { AlertTriangle, ArrowRight, BarChart3, Check, ChevronDown, Clock3, CloudRain, Info, ShoppingBag, Sprout, TrendingDown, UsersRound, Zap } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { planningProgress } from '../planning/progress'
import { rowActivation } from '../components/rowActivation'
import { useFarmers } from '../context/FarmersContext'
import { PLANNING_DATE, farmerEligibility } from '../planning/engine'
import type { NextAction, Opportunity, PlanResult } from '../planning/engine'
import { daysBetween } from '../planning/format'
import { weeklySeries } from '../planning/series'
import { Feasibility, InfoTip, SourceTag, StatCard } from '../components/ui'
import LineChart from '../components/LineChart'
import PageHeader from '../components/layout/PageHeader'

export const fmtT = (kg: number, lang: Lang = 'en') => (Math.abs(kg) >= 1000 ? `${formatNumber(Number((kg / 1000).toFixed(1)), lang)} t` : `${formatNumber(Math.round(kg), lang)} kg`)

export function feasibilityOf(o: Opportunity): 'high' | 'medium' | 'low' {
  if (o.crop.perennial) return (o.plan?.existingKg ?? 0) > 0 ? 'medium' : 'low'
  if (o.plan?.window === 'missed' || o.suitableAcres === 0) return 'low'
  const need = o.plan ? (o.plan.confirmedKg + o.plan.indicativeKg) / o.crop.yieldPerAcre[1] : 0
  return o.suitableAcres >= need && !o.why.some((w) => w.source === 'farm' && w.tone !== 'good') ? 'high' : 'medium'
}

type Translator = ReturnType<typeof useI18n>['t']

function actionFor(o: Opportunity, t: Translator, lang: Lang): { label: string; to: string; tone: '' | 'warn' | 'bad' } {
  const p = o.plan
  if (o.verdict === 'too-late') return { label: t('overview_action_later'), to: '/demand', tone: 'bad' }
  if (o.crop.perennial) return p && p.shortfallKg > 0 ? { label: t('overview_action_short', { quantity: fmtT(p.shortfallKg, lang) }), to: '/demand', tone: 'warn' } : { label: t('overview_action_harvest'), to: '/plan', tone: '' }
  if (!p) return o.verdict === 'caution' ? { label: t('overview_action_avoid'), to: '/demand', tone: 'bad' } : { label: t('overview_action_find_buyer'), to: '/demand', tone: 'warn' }
  if (p.status === 'not-in-scenario') return { label: t('overview_action_confirm_buyer'), to: '/demand', tone: 'warn' }
  if (p.status === 'gap' || p.status === 'partial') return { label: t('overview_action_expand'), to: `/plan#${o.crop.id}`, tone: 'warn' }
  if (p.confirmedKg === 0) return { label: t('overview_action_confirm_buyer'), to: '/demand', tone: '' }
  return { label: t('overview_action_review'), to: `/plan#${o.crop.id}`, tone: '' }
}

function progressDetail(step: 'demand' | 'plan' | 'messages' | 'confirmed', metrics: ReturnType<typeof planningProgress>[number]['metrics'], lang: Lang, t: Translator) {
  const area = formatNumber(metrics.acres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (step === 'demand') return metrics.activeOrders ? t('progress_demand_detail', { count: metrics.activeOrders, committed: metrics.committedOrders }) : t('progress_demand_empty')
  if (step === 'plan') return metrics.planState === 'finalized' ? t('progress_plan_finalized', { area, count: metrics.farmers }) : metrics.planState === 'changed' ? t('progress_plan_changed') : t('progress_plan_draft', { area, count: metrics.farmers })
  if (step === 'messages') return metrics.outdated ? t('progress_messages_outdated', { count: metrics.outdated }) : t('progress_messages_sent', { contacted: metrics.contacted, count: metrics.farmers })
  return metrics.problems ? t('progress_confirmed_problem', { confirmed: metrics.confirmed, count: metrics.farmers, problems: metrics.problems }) : t('progress_confirmed_detail', { confirmed: metrics.confirmed, count: metrics.farmers })
}

export function translatedAction(action: NextAction, result: PlanResult, t: Translator, lang: Lang) {
  const count = Number(action.title.match(/\d+/)?.[0] ?? 0)
  const cta = (key: Parameters<Translator>[0]) => t(key)
  if (action.id.startsWith('urgent-')) {
    const plan = result.plans.find((item) => item.crop.id === action.id.slice('urgent-'.length))
    const [waiting = '0', total = '0'] = action.detail.match(/\d+/g) ?? []
    if (plan) return { title: t('task_urgent_title', { crop: cropLabel(plan.crop.name, t), date: formatDate(plan.sowBy, lang, { day: 'numeric', month: 'short' }) }), detail: t('task_urgent_detail', { waiting: Number(waiting), total: Number(total) }), cta: cta('task_review_proposals') }
  }
  if (action.id === 'send') return { title: t('task_send_title', { count }), detail: t('task_send_detail'), cta: cta('task_review_messages') }
  if (action.id === 'resend') return { title: t('task_resend_title', { count }), detail: t('task_resend_detail'), cta: cta('task_review_updates') }
  if (action.id === 'constraints') return { title: t('task_constraints_title', { count }), detail: t('task_constraints_detail'), cta: cta('task_review_replies') }
  if (action.id === 'verify') return { title: t('task_verify_title', { count }), detail: t('task_verify_detail'), cta: cta('task_verify_plots') }
  if (action.id.startsWith('gap-') || action.id.startsWith('late-')) {
    const line = result.plans.flatMap((item) => item.lines.map((candidate) => ({ plan: item, line: candidate }))).find(({ line: candidate }) => candidate.order.id === action.id.slice(action.id.indexOf('-') + 1))
    if (line && action.id.startsWith('gap-')) return { title: t('task_gap_title', { crop: cropLabel(line.plan.crop.name, t), buyer: line.line.order.buyer.name, quantity: fmtT(line.line.gapKg, lang) }), detail: t('task_gap_detail'), cta: cta('task_open_plan') }
    if (line && action.id.startsWith('late-')) return { title: t('task_late_title', { crop: cropLabel(line.plan.crop.name, t), buyer: line.line.order.buyer.name }), detail: t('task_late_detail', { delivery: formatDate(line.line.deliveryStart, lang, { day: 'numeric', month: 'short' }), sowBy: formatDate(line.line.sowBy, lang, { day: 'numeric', month: 'short' }) }), cta: cta('task_view_demand') }
  }
  if (action.id.startsWith('perennial-')) {
    const plan = result.plans.find((item) => item.crop.id === action.id.slice('perennial-'.length))
    if (plan) return { title: t('task_perennial_title', { crop: cropLabel(plan.crop.name, t), existing: fmtT(plan.existingKg, lang), demand: fmtT(plan.confirmedKg + plan.indicativeKg, lang) }), detail: t('task_perennial_detail'), cta: cta('task_view_demand') }
  }
  if (action.id === 'unknown') return { title: t('task_unknown_title', { count }), detail: t('task_unknown_detail'), cta: cta('task_update_farms') }
  if (action.id === 'consent') {
    const names = action.title.replace(/^Ask /, '').replace(/ about joining this season$/, '')
    return { title: t('task_consent_title', { names }), detail: t('task_consent_detail'), cta: cta('task_record_participation') }
  }
  if (action.id === 'firm-up') {
    const items = action.detail.split(', ').map((item) => {
      const match = item.match(/^(.*?) \((.*)\)$/)
      return match ? `${cropLabel(match[1], t)} (${match[2]})` : item
    }).join(', ')
    return { title: t('task_firm_up_title', { count }), detail: items, cta: cta('task_view_demand') }
  }
  return { title: action.title, detail: action.detail, cta: action.cta }
}

function DemandBar({ o, max, t, lang }: { o: Opportunity; max: number; t: Translator; lang: Lang }) {
  const w = (kg: number) => `${Math.max(kg > 0 ? 6 : 0, (kg / max) * 110)}px`
  if (!o.plan) return <div className="m-dbar" title={t('overview_market_forecast_only')}><i className="f" style={{ width: 60 }} /></div>
  return <div className="m-dbar" title={`${fmtT(o.plan.confirmedKg, lang)} ${t('overview_legend_committed').toLowerCase()} · ${fmtT(o.plan.indicativeKg, lang)} ${t('overview_legend_indicative').toLowerCase()}`}>
    {o.plan.confirmedKg > 0 && <i className="c" style={{ width: w(o.plan.confirmedKg) }} />}
    {o.plan.indicativeKg > 0 && <i className="n" style={{ width: w(o.plan.indicativeKg) }} />}
    {o.signals.length > 0 && <i className="f" style={{ width: 22 }} />}
  </div>
}

export default function Overview() {
  const { lang, t } = useI18n()
  const { result, responses, planState } = usePlan()
  const { data } = useFarmers()
  const [open, setOpen] = useState<string | null>(null)

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
  const weekSubs = weeks.map((w) => formatDate(w.start, lang, { day: 'numeric', month: 'short' }))
  const chartDemand = weeks.reduce((s, w) => s + w.demand, 0)
  const chartSupply = weeks.reduce((s, w) => s + w.supply, 0)

  const displayCrop = (name: string) => cropLabel(name, t)
  const watchouts = [
    ...result.plans.filter((p) => p.window === 'urgent' && p.allocations.length).map((p) => ({ icon: <Clock3 size={20} />, tone: 'bad', title: t('overview_risk_sowing', { crop: displayCrop(p.crop.name), date: formatDate(p.sowBy, lang, { day: 'numeric', month: 'short' }) }), text: t('overview_risk_days', { count: daysBetween(PLANNING_DATE, p.sowBy) }) })),
    ...inScope.filter((p) => p.shortfallKg > 0).map((p) => ({ icon: <Sprout size={20} />, tone: 'warn', title: t('overview_risk_short', { crop: displayCrop(p.crop.name), quantity: fmtT(p.shortfallKg || p.gapKg, lang) }), text: p.crop.perennial ? t('overview_risk_orchard') : t('overview_risk_add_farmers') })),
    ...result.opportunities.filter((o) => o.signals.some((s) => s.regionalSupply === 'Oversupply risk')).map((o) => ({ icon: <TrendingDown size={20} />, tone: 'warn', title: t('overview_risk_oversupply', { crop: displayCrop(o.crop.name) }), text: t('overview_risk_price', { low: o.signals[0].priceBandInr[0], high: o.signals[0].priceBandInr[1] }) })),
    { icon: <CloudRain size={20} />, tone: '', title: t('overview_risk_weather_title'), text: t('overview_risk_weather_detail') },
  ].slice(0, 4)

  return <div className="m-page">
    <PageHeader title={t('overview_title')} subtitle={t('overview_subtitle')} />

    <nav className="m-progress" aria-label={t('progress_nav_aria')}>
      <ol>{planningProgress(result, responses, planState).map((step, index) => <li key={step.id} className={`m-progress-step ${step.state}`}>
        <Link to={step.to} aria-current={step.state === 'current' || step.state === 'attention' ? 'step' : undefined}>
          <span className="m-progress-mark" aria-hidden="true">{step.state === 'done' ? <Check size={15} /> : step.state === 'attention' ? '!' : index + 1}</span>
          <span className="m-progress-copy"><strong>{t(({ demand: 'progress_demand_label', plan: 'progress_plan_label', messages: 'progress_messages_label', confirmed: 'progress_confirmed_label' } as const)[step.id])}</strong><small>{progressDetail(step.id, step.metrics, lang, t)}</small></span>
          <span className="sr-only">{t(({ done: 'progress_state_done', attention: 'progress_state_attention', current: 'progress_state_current', todo: 'progress_state_todo' } as const)[step.state])}</span>
        </Link>
      </li>)}</ol>
    </nav>

    <section className="m-stats" aria-label={t('season_summary_aria')}>
      <StatCard icon={<ShoppingBag size={24} />} label={t('buyer_demand')} tip={t('overview_tip_demand')} value={fmtT(demandKg, lang)} sub={<>{fmtT(confirmedKg, lang)} {t('overview_committed_sub')}</>} />
      <StatCard icon={<Sprout size={24} />} label={t('expected_supply')} tip={t('overview_tip_supply')} value={fmtT(supplyKg, lang)} sub={t('overview_acres_sub', { area: formatNumber(result.totalAcres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label={t('supply_gaps')} tip={t('overview_tip_gap')} value={fmtT(gapKg, lang)} sub={`≈ ${formatNumber(Math.round((demandKg ? gapKg / demandKg : 0) * 100), lang)}% ${t('overview_of_demand')}`} />
      <StatCard icon={<UsersRound size={24} />} label={t('participating_farms')} value={formatNumber(eligible.length, lang)} sub={t('overview_farm_villages', { count: villages })} />
    </section>

    <>
      <section className="m-panel" id="opportunities" aria-labelledby="opp-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="opp-title">{t('opportunities_title')}</h2><p className="m-panel-sub">{t('opportunities_sub')}</p></div>
          <div className="m-legend2">
            <span><i style={{ background: '#2e7d32' }} />{t('overview_legend_committed')} <InfoTip text={t('overview_tip_committed')} /></span>
            <span><i style={{ background: '#9ccc65' }} />{t('overview_legend_indicative')} <InfoTip text={t('overview_tip_indicative')} /></span>
            <span><i style={{ border: '1.5px dashed #9ccc65' }} />{t('overview_legend_forecast')} <InfoTip text={t('overview_tip_forecast')} /></span>
          </div>
        </div>
        <div className="m-dt-scroll"><table className="m-dt">
          <thead><tr><th>{t('overview_crop')} <InfoTip text={t('overview_crop_feasibility_tip')} /></th><th>{t('buyer_demand')}</th><th>{t('expected_supply')} <InfoTip text={t('overview_supply_tip')} /></th><th>{t('overview_gap')} <InfoTip text={t('overview_tip_gap')} /></th><th>{t('overview_recommended_action')}</th><th><span className="sr-only">{t('overview_details')}</span></th></tr></thead>
          <tbody>{result.opportunities.map((o) => {
            const a = actionFor(o, t, lang)
            const isOpen = open === o.crop.id
            return <Fragment key={o.crop.id}>
              <tr className="click" {...rowActivation(() => setOpen(isOpen ? null : o.crop.id))} aria-expanded={isOpen} aria-label={t('overview_show_why', { crop: displayCrop(o.crop.name) })}>
                <td><span className="m-crop"><span className="e" aria-hidden="true">{o.crop.emoji}</span><span>{displayCrop(o.crop.name)}<small style={{ marginTop: 4 }}><Feasibility level={feasibilityOf(o)} /></small></span></span></td>
                <td><strong>{o.plan ? fmtT(o.plan.confirmedKg + o.plan.indicativeKg, lang) : '—'}</strong><DemandBar o={o} max={maxDemand} t={t} lang={lang} /></td>
                <td><strong>{o.plan && o.plan.status !== 'not-in-scenario' ? fmtT(o.plan.expectedKg, lang) : '—'}</strong></td>
                <td className="num">{!o.plan ? <span className="m-small">—</span> : o.plan.status === 'not-in-scenario' ? <span className="m-small">{t('overview_indicative_only')}</span> : o.plan.shortfallKg > 0 ? <strong style={{ color: 'var(--bad)' }}>−{fmtT(o.plan.shortfallKg, lang)}</strong> : <span className="m-small" style={{ color: 'var(--good)' }}>{t('overview_none')}</span>}</td>
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
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>{t('overview_next_description')}</p>
          <ul className="m-action-list">{result.actions.slice(0, 5).map((a) => {
            const copy = translatedAction(a, result, t, lang)
            return <li key={a.id}>
              <Link to={a.to}><span className={`m-action-dot ${a.tone}`} aria-hidden="true" /><span><strong>{copy.title}</strong><span>{copy.detail}</span></span><span className="m-action-go">{copy.cta}<ArrowRight size={14} aria-hidden="true" /></span></Link>
            </li>
          })}</ul>
        </section>
        <section className="m-panel" aria-labelledby="watch-title">
          <h2 className="m-panel-title sm" id="watch-title"><AlertTriangle size={24} />{t('watchouts')}</h2>
          <p className="m-panel-sub" style={{ marginBottom: 8 }}>{t('overview_watchouts_description')}</p>
          <ul className="m-why2">{watchouts.map((w) => <li key={w.title}><span className={`m-roundico ${w.tone}`}>{w.icon}</span><div><strong>{w.title}</strong><span>{w.text}</span></div></li>)}</ul>
        </section>
      </div>
    </>

    {weeks.length > 0 && <section className="m-panel" aria-labelledby="sd-title">
      <div className="m-panel-head">
        <div><h2 className="m-panel-title" id="sd-title"><BarChart3 size={24} color="var(--forest)" />{t('supply_vs_demand')} <small>({t('overview_delivery_season', { count: weeks.length })})</small></h2><p className="m-panel-sub">{t('overview_weekly_description')}</p></div>
        <div className="m-minis row">
          <div className="m-mini"><small>{t('overview_demand_total')}</small><strong>{fmtT(chartDemand, lang)}</strong></div>
          <div className="m-mini"><small>{t('overview_supply_projected')}</small><strong>{fmtT(chartSupply, lang)}</strong></div>
          <div className="m-mini amber"><small>{chartSupply >= chartDemand ? t('overview_surplus') : t('overview_gap')}</small><strong>{fmtT(Math.abs(chartDemand - chartSupply), lang)}</strong></div>
        </div>
      </div>
      <LineChart ariaLabel={t('overview_chart_aria')} labels={weekLabels} sublabels={weekSubs} yLabel={t('unit_tonnes')}
        series={[{ label: t('overview_series_demand'), color: '#1b5e20', values: weeks.map((w) => w.demand / 1000) }, { label: t('overview_series_supply'), color: '#7cc35b', values: weeks.map((w) => w.supply / 1000), fill: true }]} />
      <p className="m-footnote" style={{ marginTop: 10 }}><Info size={15} style={{ flex: 'none', marginTop: 2 }} />{t('overview_footnote')}</p>
    </section>}
  </div>
}
