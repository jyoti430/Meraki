import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, FlaskConical, Gavel, Handshake, Landmark, LoaderCircle, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { decimalToInteger, isoDate, kg, localDateTime } from './calculations'
import type { CommercialTerms, Contribution, Principal } from './types'
import { cropLabel, formatDate, formatNumber, statusTranslationKey, useI18n, type Lang, type TKey } from '../i18n'
import en from '../i18n/locales/en'
import { useAuth } from '../auth/context'

export type Values = Record<string, string>
export type FieldSpec = { name: string; label?: string; labelKey?: TKey; type?: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'select' | 'checkbox' | 'members' | 'criteria'; required?: boolean; value?: string; options?: { value: string; label?: string; labelKey?: TKey }[]; help?: string; helpKey?: TKey; placeholder?: string; placeholderKey?: TKey; min?: string; max?: string; step?: string; wide?: boolean }
const tradeCopyKeys = new Map<string, TKey>(Object.entries(en).map(([key, value]) => [value, key as TKey]))
function localizeTradeCopy(value: string, t: (key: TKey, vars?: Record<string, string | number>) => string): string {
  const key = tradeCopyKeys.get(value)
  if (key) return t(key)
  const unit = value.match(/^(.*) \((kg|₹)\)$/)
  if (unit) return `${localizeTradeCopy(unit[1], t)} (${unit[2]})`
  return value
}
const exactTradeErrors: Record<string, TKey> = {
  'Check member contributions.': 'trui_validation_members',
  'Add a unique reference for each contributing member.': 'trui_validation_member_unique',
  'Check the buyer quality criteria.': 'trui_validation_quality',
  'Add at most 30 buyer quality criteria.': 'trui_validation_quality_count',
  'Check each buyer quality criterion.': 'trui_validation_quality_row',
  'Complete each buyer quality criterion and check its text limits.': 'trui_validation_quality_complete',
  'Delivery window end must be on or after its start.': 'trui_validation_delivery_window',
  'Downgraded price cannot exceed 100%.': 'trui_validation_downgrade',
  'Complete every commercial term before publishing.': 'trui_validation_terms',
  'Refresh the requirement before submitting.': 'trui_validation_refresh_requirement',
  'Quantity exceeds the remaining requirement.': 'trui_validation_quantity_remaining',
  'Quantity exceeds the selected qualified capacity.': 'trui_validation_quantity_capacity',
  'Award cancelled.': 'trui_validation_award_cancelled',
  'The whole contract quantity must be converted. Partial capacity conversion is not supported.': 'trui_validation_full_contract',
  'Choose a valid date and time.': 'trui_validation_choose_datetime',
}

export function localizeTradeError(value: string, t: (key: TKey, vars?: Record<string, string | number>) => string): string {
  const exact = exactTradeErrors[value]
  if (exact) return t(exact)
  const fieldKeys: Record<string, TKey> = {
    Quantity: 'ex_quantity', 'Maximum price': 'trq_maximum_price_per_kg', Price: 'order_price_per_kg',
    'Payment due days': 'trui_payment_due', 'Member contribution': 'trui_contribution',
  }
  const fieldName = (value: string) => fieldKeys[value] ? t(fieldKeys[value]) : localizeTradeCopy(value, t)
  const positive = value.match(/^(.+) must be greater than zero\.$/)
  if (positive) return t('trui_validation_positive', { field: fieldName(positive[1]) })
  const wholeValue = value.match(/^(.+) must be a whole number from (\d+) to (\d+)\.$/)
  if (wholeValue) return t('trui_validation_whole', { field: fieldName(wholeValue[1]), min: wholeValue[2], max: wholeValue[3] })
  const memberSum = value.match(/^Member contributions \((.+)\) must equal the lot quantity \((.+)\)\.$/)
  if (memberSum) return t('trui_validation_member_sum', { total: memberSum[1], quantity: memberSum[2] })
  const decimals = value.match(/^Enter a non-negative number with at most (\d+) decimal places\.$/)
  if (decimals) return t('trui_validation_decimal', { count: decimals[1] })
  if (value === 'This amount is too large.') return t('trui_validation_too_large')
  if (value === 'Amounts must be non-negative safe integers.') return t('trui_validation_safe_integer')
  return localizeTradeCopy(value, t)
}

export function localizedTradeTimestamp(value: string | undefined, lang: Lang, t: (key: TKey, vars?: Record<string, string | number>) => string): string {
  return value ? formatDate(value, lang, { dateStyle: 'medium', timeStyle: 'short' }) : t('trui_not_recorded')
}
const nav = [
  { to: '/trade/requirements', labelKey: 'nav_procurement', icon: Handshake, end: false }, { to: '/trade', labelKey: 'mod_auctions', icon: Gavel, end: true }, { to: '/trade/contracts', labelKey: 'mod_contracts', icon: Handshake },
  { to: '/trade/lots', labelKey: 'mod_lots_qc', icon: PackageCheck }, { to: '/trade/review', labelKey: 'mod_release_review', icon: ShieldCheck },
  { to: '/trade/shipments', labelKey: 'mod_shipments', icon: Truck }, { to: '/trade/arrivals', labelKey: 'mod_arrival', icon: FlaskConical },
  { to: '/trade/settlements', labelKey: 'mod_settlements_nav', icon: Landmark },
] as const
const tradeTitles: Record<string, TKey> = {
  'Trade opportunities': 'trade_title', 'Buyer requirements & proposals': 'trade_page_requirements', 'Auction opportunity': 'trade_page_auction',
  'Contracts & confirmations': 'trade_page_contracts', 'Lots & inspection': 'trade_page_lots', 'QC release review': 'trade_page_review',
  'Crates & shipments': 'trade_page_shipments', 'Arrival & claims': 'trade_page_arrivals', 'Farmer settlements': 'trade_page_settlements',
  'Requirement details': 'trade_page_requirement_details',
}
const tradeSubtitles: Record<string, TKey> = {
  'Exporters publish demand; FPOs respond with consented, capacity-backed proposals. Award remains a human decision.': 'trade_page_requirements_sub',
  'Review the complete published terms before submitting a binding-capacity offer or buyer bid.': 'trade_page_auction_sub',
  'A winning offer is provisional until both counterparties approve the same versioned terms.': 'trade_page_contracts_sub',
  'Keep harvest identity, member contributions and scoped quality evidence linked to every physical lot.': 'trade_page_lots_sub',
  'An assigned reviewer records a reasoned release or hold after checking private inspection evidence.': 'trade_page_review_sub',
  'Prepare partial deliveries against a confirmed obligation and a released, exclusively eligible lot.': 'trade_page_shipments_sub',
  'Reconcile physical weights, record inspection evidence and resolve disagreements without rewriting movement history.': 'trade_page_arrivals_sub',
  'Keep the invoice obligation, independently verified FPO receipt and each member disbursal distinct.': 'trade_page_settlements_sub',
  'Buyer specification, proposal comparison and contract traceability.': 'trade_page_requirement_details_sub',
}

function localizedTradeTitle(title: string, t: (key: TKey, vars?: Record<string, string | number>) => string) {
  if (title.endsWith(' requirement')) return t('trade_page_requirement_for', { crop: cropLabel(title.slice(0, -' requirement'.length), t) })
  if (title.endsWith(' · harvested lot')) return t('trade_page_harvested_title', { crop: cropLabel(title.slice(0, -' · harvested lot'.length), t) })
  if (title.endsWith(' · forward supply')) return t('trade_page_forward_title', { crop: cropLabel(title.slice(0, -' · forward supply'.length), t) })
  const key = tradeTitles[title]
  return key ? t(key) : title
}

export function Status({ value }: { value: string }) {
  const { t } = useI18n()
  const tone = ['confirmed', 'released', 'resolved', 'received', 'paid'].includes(value) ? 'good' : ['cancelled', 'defaulted', 'expired', 'no_sale', 'hold', 'held'].includes(value) ? 'bad' : ['provisional', 'pending', 'open', 'part_paid', 'unverified'].includes(value) ? 'warn' : 'neutral'
  const key = statusTranslationKey(value)
  return <span className={`m-tag m-tag-${tone}`}>{key ? t(key) : value.replace(/_/g, ' ')}</span>
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="t-empty"><PackageCheck size={26} aria-hidden="true" /><p>{children}</p></div>
export const Notice = ({ children, error = false }: { children: ReactNode; error?: boolean }) => <div className={`t-notice${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}><AlertCircle size={18} aria-hidden="true" /><div>{children}</div></div>
export const Metric = ({ label, value, help }: { label: string; value: ReactNode; help?: string }) => <div className="t-metric"><span>{label}</span><strong>{value}</strong>{help && <small>{help}</small>}</div>
export const Detail = ({ label, children }: { label: string; children: ReactNode }) => <div className="t-detail"><dt>{label}</dt><dd>{children}</dd></div>
export const ResourceId = ({ id }: { id: string }) => <code className="t-id" title={id}>{id}</code>
export const ActionLink = ({ to, children }: { to: string; children: ReactNode }) => <Link className="m-link" to={to}>{children}<ArrowRight size={15} aria-hidden="true" /></Link>
export function Panel({ title, subtitle, children, aside, className = '' }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  const { t } = useI18n()
  return <section className={`m-card t-panel ${className}`}><div className="m-card-head"><div><h2 className="m-h2">{localizeTradeCopy(title, t)}</h2>{subtitle && <p className="m-sub">{localizeTradeCopy(subtitle, t)}</p>}</div>{aside}</div>{children}</section>
}
export function Disclosure({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const { t } = useI18n()
  return <details className="t-disclosure" open={open || undefined}><summary>{localizeTradeCopy(title, t)}<ChevronDown size={17} aria-hidden="true" /></summary><div>{children}</div></details>
}

function SessionControl() {
  const { workspace, health, connect, disconnect, principals } = useTrade()
  const { t } = useI18n()
  const [choices, setChoices] = useState<Principal[]>([])
  const [actor, setActor] = useState('')
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState('')
  const [expanded, setExpanded] = useState(false)
  const generation = useRef(0)
  const operation = useRef<'loading' | 'connecting' | null>(null)
  useEffect(() => () => {
    generation.current += 1
    if (operation.current === 'connecting') disconnect()
  }, [disconnect])
  const cancel = (endSession = false) => {
    generation.current += 1
    const connecting = operation.current === 'connecting'
    operation.current = null
    setExpanded(false); setPending(false); setChoices([]); setActor(''); setConsent(false); setError(''); setErrorDetails('')
    if (connecting || endSession) disconnect()
  }
  const open = async () => {
    if (operation.current) return
    const request = ++generation.current
    operation.current = 'loading'
    setChoices([]); setActor(''); setConsent(false); setExpanded(true); setPending(true); setError(''); setErrorDetails('')
    try {
      const results = await principals()
      if (request === generation.current) setChoices(results)
    } catch (cause) {
      if (request === generation.current) { setError(t('trade_identity_load_failed')); setErrorDetails(cause instanceof Error ? cause.message : '') }
    } finally {
      if (request === generation.current) { operation.current = null; setPending(false) }
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!consent || !actor || operation.current || !choices.some((choice) => choice.id === actor)) return
    const request = ++generation.current
    operation.current = 'connecting'
    setPending(true); setError(''); setErrorDetails('')
    try {
      await connect(actor)
      if (request === generation.current) { setExpanded(false); setChoices([]); setActor(''); setConsent(false) }
    } catch (cause) {
      if (request === generation.current) { setError(t('trade_session_start_failed')); setErrorDetails(cause instanceof Error ? cause.message : '') }
    } finally {
      if (request === generation.current) { operation.current = null; setPending(false) }
    }
  }
  return <div className="t-session">
    <div className="t-session-summary"><FlaskConical size={22} aria-hidden="true" /><div><strong>{workspace ? workspace.principal.display_name : t('trade_workspace_label')}</strong><span>{workspace ? `${workspace.principal.organisation_id} · ${workspace.principal.role.replace(/_/g, ' ')} · ${t('trade_synthetic_records').toLowerCase()}` : t('trade_session_choose')}</span></div>
      {health?.synthetic && <button className="m-btn m-btn-secondary m-btn-sm" type="button" onClick={() => { void open() }} disabled={pending}>{workspace ? t('trade_change_profile') : t('trade_connect_workspace')}</button>}
      {workspace && <button className="m-btn m-btn-ghost m-btn-sm" type="button" onClick={() => cancel(true)}>{t('trade_end_session')}</button>}
    </div>
    {expanded && <form onSubmit={(event) => { void submit(event) }} className="t-session-form">
      <label className="t-field"><span>{t('trade_synthetic_actor')}</span><select aria-label={t('trade_synthetic_actor')} value={actor} disabled={pending} onChange={(event) => { if (!operation.current) setActor(event.target.value) }} required><option value="">{choices.length ? t('trade_choose_actor') : t('trade_no_actor')}</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.display_name} · {choice.role.replace(/_/g, ' ')}</option>)}</select></label>
      <label className="t-check"><input type="checkbox" checked={consent} disabled={pending} onChange={(event) => { if (!operation.current) setConsent(event.target.checked) }} required /><span>{t('trade_synthetic_consent')}</span></label>
      <div className="m-row"><button className="m-btn m-btn-primary m-btn-sm" disabled={pending || !consent || !actor}>{pending ? t('trade_connecting') : t('trade_start_session')}</button><button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => cancel()}>{t('trade_cancel')}</button></div>
    </form>}
    {error && <Notice error><p>{error}</p>{errorDetails && <details><summary>{t('trade_error_details')}</summary><pre>{errorDetails}</pre></details>}</Notice>}
    {health && !health.synthetic && !workspace && <p className="m-small">{t('trade_development_identities_disabled')}</p>}
  </div>
}

export function TradeFrame({ title, subtitle, eyebrow, children, demo = false, controls }: { title: string; subtitle: string; eyebrow?: string; children: ReactNode; demo?: boolean; controls?: ReactNode }) {
  const { workspace, health, loading, refreshing, error, refresh } = useTrade()
  const { t, lang } = useI18n()
  const { account, preview } = useAuth()
  const displayTitle = localizedTradeTitle(title, t)
  const subtitleKey = tradeSubtitles[subtitle]
  const displaySubtitle = subtitleKey ? t(subtitleKey) : subtitle === 'Agree a clear price and delivery basis, then carry the award through fulfilment and reconciliation.' ? t('trade_sub') : subtitle
  const home = (account?.role ?? preview) === 'exporter' ? { to: '/exporter', label: t('auction_back_exporter') } : { to: '/fpo', label: t('auction_back_fpo') }
  return <div className="m-page t-page">
    <header className="m-pagehead"><div><p className="m-eyebrow">{eyebrow ?? t('nav_trade')}</p><h1 className="m-h1">{displayTitle}</h1><p className="m-lead">{displaySubtitle}</p></div>{!demo && <button type="button" className="m-btn m-btn-secondary m-btn-sm" disabled={refreshing} onClick={() => { void refresh() }}><RefreshCw size={16} className={refreshing ? 't-spin' : ''} aria-hidden="true" />{refreshing ? t('refreshing') : t('refresh')}</button>}</header>
    <nav className="t-nav" aria-label={t('nav_trade')}><Link to={home.to} className="t-nav-back">← {home.label}</Link>{nav.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : undefined}><Icon size={17} aria-hidden="true" />{t(item.labelKey)}</NavLink> })}</nav>
    {controls}
    {!demo && <SessionControl />}
    {!demo && error && <Notice error><p>{t('trade_error_generic')}</p><details><summary>{t('trade_error_details')}</summary><pre>{error}</pre></details>{workspace && <p>{t('trade_refresh_before_action', { time: localizedTradeTimestamp(workspace.server_time, lang, t) })}</p>}</Notice>}
    {!demo && loading && <div className="t-empty" role="status"><LoaderCircle className="t-spin" size={28} /><p>{t('loading_trade')}</p></div>}
    {!demo && (health || workspace) && !(workspace?.production_ready ?? health?.production_ready) && <div className="t-gate"><ShieldCheck size={17} aria-hidden="true" /><span><strong>{t('trade_development_workflow')}</strong> {t('trade_live_blocked')}</span></div>}
    {!demo && !loading && !workspace && <Panel title={t('trade_connect_continue')} subtitle={t('trade_records_source')}><p>{health?.synthetic ? t('trade_select_identity_help') : t('trade_api_setup_help')}</p>{health?.blockers?.length ? <ul className="t-bullets">{health.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}</Panel>}
    {demo && children}
    {!demo && workspace && <Fragment key={`${workspace.principal.id}:${workspace.principal.organisation_id}:${workspace.principal.role}`}>{children}<footer className="t-footer">{t('trade_server_snapshot')} {localizedTradeTimestamp(workspace.server_time, lang, t)} · {workspace.synthetic ? t('trade_synthetic_records') : t('trade_organisation_records')} · {t('trade_server_validates')}</footer></Fragment>}
  </div>
}

function MembersInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  let rows: { id: string; kg: string }[]
  try { rows = JSON.parse(value || '[{"id":"","kg":""}]') } catch { rows = [{ id: '', kg: '' }] }
  const update = (index: number, key: 'id' | 'kg', text: string) => onChange(JSON.stringify(rows.map((row, i) => i === index ? { ...row, [key]: text } : row)))
  return <div className="t-members" id={id}>{rows.map((row, index) => <div className="t-member-row" key={index}>
    <label><span className="m-small">{t('trui_member_reference', { count: index + 1 })}</span><input aria-label={t('trui_member_reference', { count: index + 1 })} required value={row.id} onChange={(event) => update(index, 'id', event.target.value)} placeholder={t('trui_member_id')} /></label>
    <label><span className="m-small">{t('trui_contribution')}</span><input aria-label={t('trui_contribution')} type="number" min="0.001" step="0.001" required value={row.kg} onChange={(event) => update(index, 'kg', event.target.value)} placeholder="0.000" /></label>
    <button type="button" className="m-btn m-btn-ghost m-btn-sm" disabled={rows.length < 2} onClick={() => onChange(JSON.stringify(rows.filter((_, i) => i !== index)))} aria-label={t('trui_remove_member', { count: index + 1 })}>{t('trui_remove')}</button>
  </div>)}<button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => onChange(JSON.stringify([...rows, { id: '', kg: '' }]))}>+ {t('trui_add_member')}</button></div>
}

export function CommandForm({ title, fields = [], path, prepare, submit = 'Save record', success = 'Record saved on the server.', onSaved, tone = 'primary', note }: { title?: string; fields?: FieldSpec[]; path: string; prepare: (values: Values) => unknown; submit?: string; success?: string; onSaved?: () => void; tone?: 'primary' | 'danger' | 'secondary'; note?: ReactNode }) {
  const { command, writesEnabled } = useTrade()
  const { t } = useI18n()
  const prefix = useId()
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map((field) => [field.name, field.value ?? (field.type === 'select' ? field.options?.[0]?.value || '' : field.type === 'checkbox' ? 'false' : '')])))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState('')
  const [saved, setSaved] = useState(false)
  const busy = useRef(false)
  const intent = useRef({ signature: '', key: '' })
  const update = (name: string, value: string) => { setValues((old) => ({ ...old, [name]: value })); setSaved(false) }
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current || !writesEnabled) return
    setError(''); setErrorDetails(''); setSaved(false)
    let body: unknown
    try { body = prepare(values) } catch (cause) { setError(localizeTradeError(cause instanceof Error ? cause.message : 'Check the entered values.', t)); return }
    const signature = `${path}:${JSON.stringify(body)}`
    if (intent.current.signature !== signature) intent.current = { signature, key: crypto.randomUUID() }
    busy.current = true; setPending(true)
    try { await command(path, body, intent.current.key); setSaved(true); onSaved?.() } catch (cause) { setError(t('trui_save_failed')); setErrorDetails(cause instanceof Error ? cause.message : '') } finally { busy.current = false; setPending(false) }
  }
  return <form className="t-command-form" onSubmit={(event) => { void handleSubmit(event) }}>
    {title && <h3 className="m-h3">{localizeTradeCopy(title, t)}</h3>}
    <fieldset disabled={pending || !writesEnabled} className="t-fields"><legend className="sr-only">{localizeTradeCopy(title || submit, t)}</legend>{fields.map((field) => {
      const id = `${prefix}-${field.name}`
      const value = values[field.name] ?? field.value ?? ''
      const label = field.labelKey ? t(field.labelKey) : localizeTradeCopy(field.label || '', t)
      const help = field.helpKey ? t(field.helpKey) : field.help ? localizeTradeCopy(field.help, t) : undefined
      const placeholder = field.placeholderKey ? t(field.placeholderKey) : field.placeholder ? localizeTradeCopy(field.placeholder, t) : undefined
      const common = { id, name: field.name, required: field.required !== false, 'aria-describedby': field.help || field.helpKey ? `${id}-help` : undefined }
      if (field.type === 'checkbox') return <label key={field.name} className="t-check t-wide"><input {...common} type="checkbox" checked={value === 'true'} onChange={(event) => update(field.name, String(event.target.checked))} /><span>{label}</span></label>
      if (field.type === 'criteria') return <div className="t-field t-wide" key={field.name}><span>{label}</span><CriteriaInput id={id} value={value} onChange={(next) => update(field.name, next)} />{help && <small id={`${id}-help`}>{help}</small>}</div>
      if (field.type === 'members') return <div className="t-field t-wide" key={field.name}><span>{label}</span><MembersInput id={id} value={value} onChange={(next) => update(field.name, next)} />{help && <small id={`${id}-help`}>{help}</small>}</div>
      return <label className={`t-field${field.wide || field.type === 'textarea' ? ' t-wide' : ''}`} key={field.name} htmlFor={id}><span>{label}{field.required === false && <small> {t('trui_optional')}</small>}</span>
        {field.type === 'textarea' ? <textarea {...common} value={value} rows={3} placeholder={placeholder} onChange={(event) => update(field.name, event.target.value)} /> : field.type === 'select' ? <select {...common} value={value} onChange={(event) => update(field.name, event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.labelKey ? t(option.labelKey) : localizeTradeCopy(option.label || '', t)}</option>)}</select> : <input {...common} type={field.type || 'text'} min={field.min} max={field.max} step={field.step} value={value} placeholder={placeholder} onChange={(event) => update(field.name, event.target.value)} />}
        {help && <small id={`${id}-help`}>{help}</small>}
      </label>
    })}</fieldset>
    {note && <p className="m-small">{typeof note === 'string' ? localizeTradeCopy(note, t) : note}</p>}
    {!writesEnabled && <p role="status" className="m-small">{t('trui_actions_paused')}</p>}
    {error && <Notice error>{error}{errorDetails && <details><summary>{t('trade_error_details')}</summary><pre>{errorDetails}</pre></details>}</Notice>}
    {saved && <div className="t-success" role="status"><CheckCircle2 size={18} />{localizeTradeCopy(success, t)}</div>}
    <button className={`m-btn m-btn-${tone} m-btn-sm`} type="submit" disabled={pending || saved || !writesEnabled}>{pending && <LoaderCircle size={16} className="t-spin" aria-hidden="true" />}{pending ? t('trui_saving') : saved ? t('trui_saved') : localizeTradeCopy(submit, t)}</button>
  </form>
}

export const weightField = (name: string, label: string, value?: number): FieldSpec => ({ name, label: `${label} (kg)`, type: 'number', min: '0', step: '0.001', value: value === undefined ? '' : String(value / 1000) })
export const moneyField = (name: string, label: string, value?: number): FieldSpec => ({ name, label: `${label} (₹)`, type: 'number', min: '0', step: '0.01', value: value === undefined ? '' : String(value / 100) })
export const g = (values: Values, name: string) => decimalToInteger(values[name] || '', 3)
export const paise = (values: Values, name: string) => decimalToInteger(values[name] || '', 2)
export const positive = (value: number, name: string) => { if (value <= 0) throw new Error(`${name} must be greater than zero.`); return value }
export const whole = (value: string, name: string, min = 0, max = Number.MAX_SAFE_INTEGER) => { const n = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`); return n }
export function contributions(values: Values, quantity: number): Contribution[] {
  let rows: { id: string; kg: string }[]
  try { rows = JSON.parse(values.members || '[]') } catch { throw new Error('Check member contributions.') }
  const members = rows.map((row) => ({ member_id: row.id.trim(), quantity_g: positive(decimalToInteger(row.kg, 3), 'Member contribution') }))
  if (!members.length || members.some((row) => !row.member_id) || new Set(members.map((row) => row.member_id)).size !== members.length) throw new Error('Add a unique reference for each contributing member.')
  const total = members.reduce((sum, row) => sum + row.quantity_g, 0)
  if (total !== quantity) throw new Error(`Member contributions (${kg(total)}) must equal the lot quantity (${kg(quantity)}).`)
  return members
}

export const reasonField: FieldSpec = { name: 'reason', labelKey: 'trui_field_reason', type: 'textarea' }
export const evidenceField: FieldSpec = { name: 'evidence_reference', labelKey: 'trui_field_evidence_reference', helpKey: 'trui_evidence_help' }
export const memberField: FieldSpec = { name: 'members', labelKey: 'trui_field_member_contributions', type: 'members', helpKey: 'trui_member_help' }
export function termFields(terms?: CommercialTerms): FieldSpec[] {
  return [
    { name: 'handover', labelKey: 'trui_handover', value: terms?.handover },
    { name: 'grade_protocol', labelKey: 'trui_grade_protocol', value: terms?.grade_protocol },
    { name: 'delivery_start', labelKey: 'trui_delivery_start', type: 'datetime-local', value: terms?.delivery_start ? localDateTime(terms.delivery_start) : undefined },
    { name: 'delivery_end', labelKey: 'trui_delivery_end', type: 'datetime-local', value: terms?.delivery_end ? localDateTime(terms.delivery_end) : undefined },
    { name: 'payment_due_days', labelKey: 'trui_payment_due', type: 'number', min: '0', max: '365', step: '1', value: String(terms?.payment_due_days ?? 7) },
    { name: 'downgrade_percent', labelKey: 'trui_downgrade_percent', type: 'number', min: '0', max: '100', step: '0.01', value: String((terms?.downgrade_bps ?? 0) / 100), helpKey: 'trui_downgrade_help' },
    { name: 'fee', labelKey: 'trui_seller_fee', type: 'number', min: '0', step: '0.01', value: String((terms?.fee_paise ?? 0) / 100) },
    { name: 'shortfall_liability', labelKey: 'trui_shortfall_liability', type: 'select', value: terms?.shortfall_liability, options: [{ value: 'seller', labelKey: 'trui_seller_shortfall' }, { value: 'buyer', labelKey: 'trui_buyer_shortfall' }] },
    { name: 'payment_terms', labelKey: 'trui_payment_terms', type: 'textarea', value: terms?.payment_terms },
    { name: 'cancellation_terms', labelKey: 'trui_cancellation_terms', type: 'textarea', value: terms?.cancellation_terms },
    { name: 'production_risk', labelKey: 'trui_production_risk', type: 'textarea', value: terms?.production_risk },
    { name: 'dispute_procedure', labelKey: 'trui_dispute_procedure', type: 'textarea', value: terms?.dispute_procedure },
    { name: 'packaging_requirements', labelKey: 'trui_packaging', type: 'textarea', required: false, value: terms?.packaging_requirements ?? '' },
    { name: 'additional_requirements', labelKey: 'trui_additional_requirements', type: 'textarea', required: false, value: terms?.additional_requirements ?? '' },
    { name: 'quality_specification', labelKey: 'trui_quality_criteria', type: 'criteria', required: false,
      value: JSON.stringify((terms?.quality_specification ?? []).map(item => ({ ...item, minimum: item.minimum ?? '', maximum: item.maximum ?? '' }))),
      helpKey: 'trui_quality_criteria_help' },
  ]
}
function qualityCriteria(value: string): NonNullable<CommercialTerms['quality_specification']> {
  let rows: unknown
  try { rows = JSON.parse(value || '[]') } catch { throw new Error('Check the buyer quality criteria.') }
  if (!Array.isArray(rows) || rows.length > 30) throw new Error('Add at most 30 buyer quality criteria.')
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Check each buyer quality criterion.')
    const item = row as Record<string, unknown>
    if (typeof item.attribute !== 'string' || !item.attribute.trim() || item.attribute.trim().length > 2000
      || typeof item.unit !== 'string' || item.unit.length > 80 || typeof item.notes !== 'string' || item.notes.length > 500
      || typeof item.required !== 'boolean'
      || [item.minimum, item.maximum].some(limit => limit !== null && (typeof limit !== 'string' || limit.length > 120))) {
      throw new Error('Complete each buyer quality criterion and check its text limits.')
    }
    return { attribute: item.attribute.trim(), unit: item.unit, minimum: item.minimum || null, maximum: item.maximum || null,
      notes: item.notes, required: item.required } as NonNullable<CommercialTerms['quality_specification']>[number]
  })
}
export function termsFrom(values: Values): CommercialTerms {
  if (!values.delivery_start || !values.delivery_end || values.delivery_end < values.delivery_start) throw new Error('Delivery window end must be on or after its start.')
  const downgrade = decimalToInteger(values.downgrade_percent, 2)
  if (downgrade > 10000) throw new Error('Downgraded price cannot exceed 100%.')
  const required = ['handover', 'grade_protocol', 'payment_terms', 'cancellation_terms', 'production_risk', 'dispute_procedure']
  if (required.some((key) => !values[key]?.trim())) throw new Error('Complete every commercial term before publishing.')
  return { handover: values.handover.trim(), grade_protocol: values.grade_protocol.trim(), delivery_start: isoDate(values.delivery_start), delivery_end: isoDate(values.delivery_end), payment_due_days: whole(values.payment_due_days, 'Payment due days', 0, 365), downgrade_bps: downgrade, fee_paise: paise(values, 'fee'), shortfall_liability: values.shortfall_liability as 'seller' | 'buyer', payment_terms: values.payment_terms.trim(), cancellation_terms: values.cancellation_terms.trim(), production_risk: values.production_risk.trim(), dispute_procedure: values.dispute_procedure.trim(),
    quality_specification: qualityCriteria(values.quality_specification || '[]'), packaging_requirements: values.packaging_requirements || '', additional_requirements: values.additional_requirements || '' }
}
function CriteriaInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  type Criterion = { attribute: string; unit: string; minimum: string; maximum: string; required: boolean; notes: string }
  let rows: Criterion[]
  try { rows = JSON.parse(value || '[]') } catch { rows = [] }
  const empty = (): Criterion => ({ attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' })
  const update = (index: number, key: keyof Criterion, next: string | boolean) => onChange(JSON.stringify(rows.map((row, i) => i === index ? { ...row, [key]: next } : row)))
  const labelKeys = { attribute: 'trui_attribute', unit: 'trui_unit', minimum: 'trui_minimum', maximum: 'trui_maximum', notes: 'trui_notes' } as const
  return <div className="t-criteria" id={id}>{rows.map((row, index) => <fieldset className="t-criterion" key={index}><legend>{t('trui_criterion', { count: index + 1 })}</legend><div className="t-fields">
    {(['attribute', 'unit', 'minimum', 'maximum', 'notes'] as const).map((key) => <label className={`t-field${key === 'notes' ? ' t-wide' : ''}`} key={key}><span>{t(labelKeys[key])}{(key === 'minimum' || key === 'maximum') && <small> {t('trui_optional')}</small>}</span><input required={key === 'attribute'} value={row[key]} onChange={(event) => update(index, key, event.target.value)} /></label>)}
    <label className="t-check"><input type="checkbox" checked={row.required} onChange={(event) => update(index, 'required', event.target.checked)} /><span>{t('trui_required_criterion')}</span></label><button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => onChange(JSON.stringify(rows.filter((_, i) => i !== index)))}>{t('trui_remove_criterion')}</button>
  </div></fieldset>)}<button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => onChange(JSON.stringify([...rows, empty()]))}>+ {t('trui_add_criterion')}</button></div>
}

export function TermsView({ terms }: { terms: CommercialTerms }) {
  const { t, lang } = useI18n()
  return <><dl className="t-details"><Detail label={t('trui_terms_handover')}>{terms.handover}</Detail><Detail label={t('trui_terms_grade_protocol')}>{terms.grade_protocol}</Detail><Detail label={t('trui_terms_delivery_window')}>{localizedTradeTimestamp(terms.delivery_start, lang, t)} – {localizedTradeTimestamp(terms.delivery_end, lang, t)}</Detail><Detail label={t('trui_terms_payment')}>{terms.payment_terms} · {formatNumber(terms.payment_due_days, lang)} {t('trui_days')}</Detail><Detail label={t('trui_terms_downgraded_price')}>{formatNumber(terms.downgrade_bps / 100, lang)}% {t('trui_percent_full_price')}</Detail><Detail label={t('trui_terms_shortfall')}>{t(terms.shortfall_liability === 'seller' ? 'trui_seller_shortfall' : 'trui_buyer_shortfall')}</Detail><Detail label={t('trui_terms_cancellation')}>{terms.cancellation_terms}</Detail><Detail label={t('trui_terms_production_risk')}>{terms.production_risk}</Detail><Detail label={t('trui_terms_disputes')}>{terms.dispute_procedure}</Detail><Detail label={t('trui_terms_packaging')}>{terms.packaging_requirements || t('trui_not_specified')}</Detail><Detail label={t('trui_terms_additional')}>{terms.additional_requirements || t('trui_not_specified')}</Detail></dl>
    {terms.quality_specification?.some(item => item.required) && <Notice>{t('trui_criteria_blocked')}</Notice>}
    {terms.quality_specification?.length ? <><p className="m-small">{t('trui_criteria_not_proof')}</p><div className="t-table-wrap" style={{ marginTop: 16 }}><table className="t-table"><caption>{t('trui_criteria_caption')}</caption><thead><tr><th>{t('trui_attribute')}</th><th>{t('trui_unit')}</th><th>{t('trui_criteria_minimum')}</th><th>{t('trui_criteria_maximum')}</th><th>{t('trui_required')}</th><th>{t('trui_notes')}</th></tr></thead><tbody>{terms.quality_specification.map((item, index) => <tr key={index}><td>{item.attribute}</td><td>{item.unit || '—'}</td><td>{item.minimum ?? '—'}</td><td>{item.maximum ?? '—'}</td><td>{item.required ? t('trui_yes') : t('trui_optional_value')}</td><td>{item.notes || '—'}</td></tr>)}</tbody></table></div></> : <p className="m-small">{t('trui_no_additional_criteria')}</p>}
  </>
}
