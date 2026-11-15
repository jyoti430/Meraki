import { useId } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Clock3, Droplets, Handshake, Info, LineChart, Sprout, X } from 'lucide-react'
import type { CropPlan, Reason, ResponseStatus, Verdict } from '../planning/engine'
import { fmtKg } from '../planning/format'

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
  return <span className={`m-feas ${level}`}><span>{level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'}</span></span>
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
  const meta = sourceMeta[kind]
  return <span className={`m-tag ${meta.cls}`}>{meta.icon}{children ?? meta.label}</span>
}

export function SourceLegend() {
  return <div className="m-legend" aria-label="How to read this page">
    <span><SourceTag kind="order" /> buyer has committed</span>
    <span><SourceTag kind="indicative" /> buyer interest, not committed</span>
    <span><SourceTag kind="forecast" /> synthetic estimate – not guaranteed</span>
    <span><SourceTag kind="plan" /> Meraki’s plan – not yet farmer-confirmed</span>
  </div>
}

const verdictLabel: Record<Verdict, string> = { strong: 'Strong opportunity', consider: 'Worth considering', caution: 'Not recommended now', 'too-late': 'Too late to sow', 'existing-only': 'Existing orchards only' }
export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => <span className={`m-verdict ${verdict}`}>{verdict === 'strong' ? <CheckCircle2 size={14} /> : verdict === 'caution' ? <AlertTriangle size={14} /> : null}{verdictLabel[verdict]}</span>

export function Reasons({ reasons, limit }: { reasons: Reason[]; limit?: number }) {
  const shown = limit ? reasons.slice(0, limit) : reasons
  return <div className="m-reasons">
    {shown.map((r) => <span key={r.text} className={`m-reason ${r.tone}`}>{r.tone === 'good' ? <Check size={12} /> : r.tone === 'block' ? <X size={12} /> : <AlertTriangle size={12} />}{r.text}</span>)}
    {limit && reasons.length > limit && <span className="m-reason">+{reasons.length - limit} more</span>}
  </div>
}

/** Supply vs demand bar. Segments: existing crops, farmer-confirmed, planned (awaiting), gap. Marks: confirmed demand and total demand. */
export function SupplyMeter({ plan, showLegend = false }: { plan: CropPlan; showLegend?: boolean }) {
  const demandTotal = plan.confirmedKg + plan.indicativeKg
  const scale = Math.max(plan.targetKg, plan.expectedKg, demandTotal, 1)
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / scale) * 100))}%`
  const confirmedNew = Math.max(0, plan.farmerConfirmedKg - plan.existingKg)
  const awaiting = Math.max(0, plan.plannedKg - confirmedNew)
  return <div>
    <div className="m-meter" role="img" aria-label={`Expected supply ${fmtKg(plan.expectedKg)} against ${fmtKg(plan.confirmedKg)} confirmed and ${fmtKg(plan.indicativeKg)} indicative demand`}>
      <div className="m-meter-track">
        <div className="m-meter-seg m-seg-existing" style={{ width: pct(plan.existingKg) }} />
        <div className="m-meter-seg m-seg-confirmed" style={{ width: pct(confirmedNew) }} />
        <div className="m-meter-seg m-seg-planned" style={{ width: pct(awaiting) }} />
        <div className="m-meter-seg m-seg-gap" style={{ width: pct(plan.gapKg) }} />
      </div>
      {plan.confirmedKg > 0 && <span className="m-meter-mark" style={{ left: pct(plan.confirmedKg) }} title="Confirmed demand" />}
      {plan.indicativeKg > 0 && <span className="m-meter-mark indicative" style={{ left: pct(demandTotal) }} title="Confirmed + indicative demand" />}
    </div>
    {showLegend && <div className="m-meter-legend">
      {plan.existingKg > 0 && <span><i className="m-swatch m-seg-existing" /> Already growing {fmtKg(plan.existingKg)}</span>}
      <span><i className="m-swatch m-seg-confirmed" /> Farmer-confirmed {fmtKg(confirmedNew)}</span>
      <span><i className="m-swatch m-seg-planned" /> Planned, not farmer-confirmed {fmtKg(awaiting)}</span>
      {plan.gapKg > 0 && <span><i className="m-swatch m-seg-gap" /> Gap {fmtKg(plan.gapKg)}</span>}
      {plan.confirmedKg > 0 && <span><i className="m-swatch" style={{ background: 'var(--ink)', width: 3 }} /> Committed demand</span>}
      {plan.indicativeKg > 0 && <span><i className="m-swatch" style={{ background: 'var(--order)', width: 3 }} /> + indicative</span>}
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

export const PlanStatus = ({ plan }: { plan: CropPlan }) => <span className={`m-tag ${statusLabel[plan.status].cls}`}>{statusLabel[plan.status].label}</span>

export type ReplyState = ResponseStatus | 'needs-update'
const replyMeta: Record<ReplyState, { label: string; cls: string; icon: ReactNode }> = {
  'not-sent': { label: 'Draft – not sent', cls: 'm-tag-neutral', icon: <CircleDashed size={13} /> },
  sent: { label: 'Sent – awaiting reply', cls: 'm-tag-marigold', icon: <Clock3 size={13} /> },
  confirmed: { label: 'Farmer-confirmed', cls: 'm-tag-good', icon: <CheckCircle2 size={13} /> },
  declined: { label: 'Declined', cls: 'm-tag-bad', icon: <X size={13} /> },
  constraint: { label: 'Problem reported', cls: 'm-tag-warn', icon: <AlertTriangle size={13} /> },
  'needs-update': { label: 'Plan changed – resend', cls: 'm-tag-warn', icon: <AlertTriangle size={13} /> },
}
export const ReplyBadge = ({ state }: { state: ReplyState }) => <span className={`m-tag ${replyMeta[state].cls}`}>{replyMeta[state].icon}{replyMeta[state].label}</span>

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
