import { useId } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Clock3, Droplets, Handshake, Info, LineChart, Sprout, X } from 'lucide-react'
import type { CropPlan, Reason, ResponseStatus, Verdict } from '../planning/engine'
import { fmtKg } from '../planning/format'
import { useI18n } from '../i18n'
import { translatePlanningReason } from '../i18n/planning'

export function MerakiMark({ size = 36 }: { size?: number }) {
  const id = `mk-leaf-${useId().replace(/:/g, '')}`
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1f6e26" /><stop offset="1" stopColor="#5cb85c" /></linearGradient></defs>
    <path d="M6 34C6 17 17 6 35 5c1 18-10 29-27 29Z" fill={`url(#${id})`} />
    <path d="M8 32C15 24 22 17 30 10" stroke="#e9f6e2" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
}

export function InfoTip({ text }: { text: string }) {
  return <span className="m-info" title={text} aria-label={text} role="img"><Info size={16} /></span>
}

export function StatCard({ icon, label, value, sub, tone, tip }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'amber'; tip?: string }) {
  return <article className="m-stat" title={tip}>
    <span className={`m-stat-ico ${tone ?? ''}`}>{icon}</span>
    <div style={{ minWidth: 0 }}>
      <small>{label}{tip && <InfoTip text={tip} />}</small>
      {typeof value === 'string' || typeof value === 'number' ? <strong>{value}</strong> : value}
      {sub && <span className="m-stat-sub" title={typeof tip === 'string' ? tip : undefined}>{sub}</span>}
    </div>
  </article>
}

export function Feasibility({ level }: { level: 'high' | 'medium' | 'low' }) {
  const { t } = useI18n()
  const label = ({ high: 'feasibility_high', medium: 'feasibility_medium', low: 'feasibility_low' } as const)[level]
  return <span className={`m-feas ${level}`}><span>{t(label)}</span></span>
}

export const CropIcon = ({ emoji, label }: { emoji: string; label: string }) => <span className="m-crop-icon" role="img" aria-label={label}>{emoji}</span>

export type SourceKind = 'order' | 'indicative' | 'forecast' | 'plan' | 'farm' | 'timing'
const sourceMeta: Record<SourceKind, { label: string; cls: string; icon: ReactNode }> = {
  order: { label: 'Buyer-committed', cls: 'm-tag-order', icon: <Handshake size={13} /> },
  indicative: { label: 'Indicative', cls: 'm-tag-indicative', icon: <Handshake size={13} /> },
  forecast: { label: 'Forecast', cls: 'm-tag-forecast', icon: <LineChart size={13} /> },
  plan: { label: 'Planned', cls: 'm-tag-plan', icon: <Sprout size={13} /> },
  farm: { label: 'Farms', cls: 'm-tag-neutral', icon: <Droplets size={13} /> },
  timing: { label: 'Timing', cls: 'm-tag-marigold', icon: <Clock3 size={13} /> },
}
export function SourceTag({ kind, children }: { kind: SourceKind; children?: ReactNode }) {
  const { t } = useI18n()
  const meta = sourceMeta[kind]
  const labelKey = ({ order: 'source_buyer_committed', indicative: 'source_indicative', forecast: 'source_forecast', plan: 'source_planned', farm: 'source_farms', timing: 'source_timing' } as const)[kind]
  return <span className={`m-tag ${meta.cls}`}>{meta.icon}{children ?? t(labelKey)}</span>
}

export function SourceLegend() {
  const { t } = useI18n()
  return <div className="m-legend" aria-label={t('source_legend_title')}>
    <span><SourceTag kind="order" /> {t('source_legend_committed_help')}</span>
    <span><SourceTag kind="indicative" /> {t('source_legend_indicative_help')}</span>
    <span><SourceTag kind="forecast" /> {t('source_legend_forecast_help')}</span>
    <span><SourceTag kind="plan" /> {t('source_legend_plan_help')}</span>
  </div>
}

const verdictKey: Record<Verdict, 'verdict_strong' | 'verdict_consider' | 'verdict_caution' | 'verdict_too_late' | 'verdict_existing_only'> = { strong: 'verdict_strong', consider: 'verdict_consider', caution: 'verdict_caution', 'too-late': 'verdict_too_late', 'existing-only': 'verdict_existing_only' }
export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => {
  const { t } = useI18n()
  return <span className={`m-verdict ${verdict}`}>{verdict === 'strong' ? <CheckCircle2 size={14} /> : verdict === 'caution' ? <AlertTriangle size={14} /> : null}{t(verdictKey[verdict])}</span>
}

export function Reasons({ reasons, limit }: { reasons: Reason[]; limit?: number }) {
  const { t, lang } = useI18n()
  const shown = limit ? reasons.slice(0, limit) : reasons
  return <div className="m-reasons">
    {shown.map((r) => <span key={r.text} className={`m-reason ${r.tone}`}>{r.tone === 'good' ? <Check size={12} /> : r.tone === 'block' ? <X size={12} /> : <AlertTriangle size={12} />}{translatePlanningReason(r.text, t, lang)}</span>)}
    {limit && reasons.length > limit && <span className="m-reason">{t('reason_more', { count: reasons.length - limit })}</span>}
  </div>
}

/** Supply vs demand bar. Segments: existing crops, farmer-confirmed, planned (awaiting), gap. Marks: confirmed demand and total demand. */
export function SupplyMeter({ plan, showLegend = false }: { plan: CropPlan; showLegend?: boolean }) {
  const { t } = useI18n()
  const demandTotal = plan.confirmedKg + plan.indicativeKg
  const scale = Math.max(plan.targetKg, plan.expectedKg, demandTotal, 1)
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`
  const confirmedNew = Math.max(0, plan.farmerConfirmedKg - plan.existingKg)
  const awaiting = Math.max(0, plan.plannedKg - confirmedNew)
  return <div>
    <div className="m-meter" role="img" aria-label={t('meter_aria', { supply: fmtKg(plan.expectedKg), confirmed: fmtKg(plan.confirmedKg), indicative: fmtKg(plan.indicativeKg) })}>
      <div className="m-meter-track">
        <div className="m-meter-seg m-seg-existing" style={{ width: pct(plan.existingKg) }} />
        <div className="m-meter-seg m-seg-confirmed" style={{ width: pct(confirmedNew) }} />
        <div className="m-meter-seg m-seg-planned" style={{ width: pct(awaiting) }} />
        <div className="m-meter-seg m-seg-gap" style={{ width: pct(plan.gapKg) }} />
      </div>
      {plan.confirmedKg > 0 && <span className="m-meter-mark" style={{ left: pct(plan.confirmedKg) }} title={t('meter_confirmed_demand')} />}
      {plan.indicativeKg > 0 && <span className="m-meter-mark indicative" style={{ left: pct(demandTotal) }} title={t('meter_confirmed_indicative_demand')} />}
    </div>
    {showLegend && <div className="m-meter-legend">
      {plan.existingKg > 0 && <span><i className="m-swatch m-seg-existing" /> {t('meter_existing', { quantity: fmtKg(plan.existingKg) })}</span>}
      <span><i className="m-swatch m-seg-confirmed" /> {t('meter_farmer_confirmed', { quantity: fmtKg(confirmedNew) })}</span>
      <span><i className="m-swatch m-seg-planned" /> {t('meter_planned_not_confirmed', { quantity: fmtKg(awaiting) })}</span>
      {plan.gapKg > 0 && <span><i className="m-swatch m-seg-gap" /> {t('meter_gap', { quantity: fmtKg(plan.gapKg) })}</span>}
      {plan.confirmedKg > 0 && <span><i className="m-swatch" style={{ background: 'var(--ink)', width: 3 }} /> {t('source_buyer_committed')} {t('buyer_demand').toLowerCase()}</span>}
      {plan.indicativeKg > 0 && <span><i className="m-swatch" style={{ background: 'var(--order)', width: 3 }} /> + {t('source_indicative').toLowerCase()}</span>}
    </div>}
  </div>
}

export const statusLabel: Record<CropPlan['status'], { label: string; cls: string }> = {
  covered: { label: 'Planned to cover', cls: 'm-tag-good' },
  partial: { label: 'Partly planned', cls: 'm-tag-warn' },
  gap: { label: 'Supply gap', cls: 'm-tag-bad' },
  'not-plantable': { label: 'Cannot plant in time', cls: 'm-tag-neutral' },
  'not-in-scenario': { label: 'Not in this scenario', cls: 'm-tag-neutral' },
}

const planStatusKey: Record<CropPlan['status'], 'plan_status_covered' | 'plan_status_partial' | 'plan_status_gap' | 'plan_status_not_plantable' | 'plan_status_not_in_scenario'> = { covered: 'plan_status_covered', partial: 'plan_status_partial', gap: 'plan_status_gap', 'not-plantable': 'plan_status_not_plantable', 'not-in-scenario': 'plan_status_not_in_scenario' }
export const PlanStatus = ({ plan }: { plan: CropPlan }) => {
  const { t } = useI18n()
  return <span className={`m-tag ${statusLabel[plan.status].cls}`}>{t(planStatusKey[plan.status])}</span>
}

export type ReplyState = ResponseStatus | 'needs-update'
const replyMeta: Record<ReplyState, { label: string; cls: string; icon: ReactNode }> = {
  'not-sent': { label: 'Draft – not sent', cls: 'm-tag-neutral', icon: <CircleDashed size={13} /> },
  sent: { label: 'Sent – awaiting reply', cls: 'm-tag-marigold', icon: <Clock3 size={13} /> },
  confirmed: { label: 'Farmer-confirmed', cls: 'm-tag-good', icon: <CheckCircle2 size={13} /> },
  declined: { label: 'Declined', cls: 'm-tag-bad', icon: <X size={13} /> },
  constraint: { label: 'Problem reported', cls: 'm-tag-warn', icon: <AlertTriangle size={13} /> },
  'needs-update': { label: 'Plan changed – resend', cls: 'm-tag-warn', icon: <AlertTriangle size={13} /> },
}
const replyKey: Record<ReplyState, 'reply_not_sent' | 'reply_sent' | 'reply_confirmed' | 'reply_declined' | 'reply_constraint' | 'reply_needs_update'> = { 'not-sent': 'reply_not_sent', sent: 'reply_sent', confirmed: 'reply_confirmed', declined: 'reply_declined', constraint: 'reply_constraint', 'needs-update': 'reply_needs_update' }
export const ReplyBadge = ({ state }: { state: ReplyState }) => {
  const { t } = useI18n()
  return <span className={`m-tag ${replyMeta[state].cls}`}>{replyMeta[state].icon}{t(replyKey[state])}</span>
}

export const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

/** Buyer order type as shown everywhere: "Committed" (buyer has committed) vs "Indicative" (interest only). */
export const orderTypeLabel = (t: string) => (t === 'Confirmed' ? 'Committed' : 'Indicative')

/** Order-line status, worded as a plan – never as guaranteed fulfilment. */
export const lineStatusLabel: Record<string, { label: string; cls: string }> = {
  covered: { label: 'Planned to cover', cls: 'high' },
  partial: { label: 'Partly planned', cls: 'medium' },
  gap: { label: 'Supply gap', cls: 'low' },
  'not-plantable': { label: 'Too late to sow', cls: 'low' },
  'not-in-scenario': { label: 'Not in scenario', cls: 'medium' },
}
