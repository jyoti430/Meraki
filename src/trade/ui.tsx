import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, FlaskConical, Gavel, Handshake, Landmark, LoaderCircle, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { decimalToInteger, isoDate, kg, localDateTime, timestamp } from './calculations'
import type { CommercialTerms, Contribution, Principal } from './types'
import { useI18n } from '../i18n'

export type Values = Record<string, string>
export type FieldSpec = { name: string; label: string; type?: 'text' | 'textarea' | 'number' | 'date' | 'datetime-local' | 'select' | 'checkbox' | 'members' | 'criteria'; required?: boolean; value?: string; options?: { value: string; label: string }[]; help?: string; placeholder?: string; min?: string; max?: string; step?: string; wide?: boolean }
const nav = [
  { to: '/trade/requirements', labelKey: 'nav_procurement', icon: Handshake, end: false }, { to: '/trade', labelKey: 'mod_auctions', icon: Gavel, end: true }, { to: '/trade/contracts', labelKey: 'mod_contracts', icon: Handshake },
  { to: '/trade/lots', labelKey: 'mod_lots_qc', icon: PackageCheck }, { to: '/trade/review', labelKey: 'mod_release_review', icon: ShieldCheck },
  { to: '/trade/shipments', labelKey: 'mod_shipments', icon: Truck }, { to: '/trade/arrivals', labelKey: 'mod_arrival', icon: FlaskConical },
  { to: '/trade/settlements', labelKey: 'mod_settlements_nav', icon: Landmark },
] as const

export function Status({ value }: { value: string }) {
  const tone = ['confirmed', 'released', 'resolved', 'received', 'paid'].includes(value) ? 'good' : ['cancelled', 'defaulted', 'expired', 'no_sale', 'hold', 'held'].includes(value) ? 'bad' : ['provisional', 'pending', 'open', 'part_paid', 'unverified'].includes(value) ? 'warn' : 'neutral'
  return <span className={`m-tag m-tag-${tone}`}>{value.replace(/_/g, ' ')}</span>
}
export const Empty = ({ children }: { children: ReactNode }) => <div className="t-empty"><PackageCheck size={26} aria-hidden="true" /><p>{children}</p></div>
export const Notice = ({ children, error = false }: { children: ReactNode; error?: boolean }) => <div className={`t-notice${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}><AlertCircle size={18} aria-hidden="true" /><div>{children}</div></div>
export const Metric = ({ label, value, help }: { label: string; value: ReactNode; help?: string }) => <div className="t-metric"><span>{label}</span><strong>{value}</strong>{help && <small>{help}</small>}</div>
export const Detail = ({ label, children }: { label: string; children: ReactNode }) => <div className="t-detail"><dt>{label}</dt><dd>{children}</dd></div>
export const ResourceId = ({ id }: { id: string }) => <code className="t-id" title={id}>{id}</code>
export const ActionLink = ({ to, children }: { to: string; children: ReactNode }) => <Link className="m-link" to={to}>{children}<ArrowRight size={15} aria-hidden="true" /></Link>
export function Panel({ title, subtitle, children, aside, className = '' }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return <section className={`m-card t-panel ${className}`}><div className="m-card-head"><div><h2 className="m-h2">{title}</h2>{subtitle && <p className="m-sub">{subtitle}</p>}</div>{aside}</div>{children}</section>
}
export function Disclosure({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="t-disclosure" open={open || undefined}><summary>{title}<ChevronDown size={17} aria-hidden="true" /></summary><div>{children}</div></details>
}

function SessionControl() {
  const { workspace, health, connect, disconnect, principals } = useTrade()
  const [choices, setChoices] = useState<Principal[]>([])
  const [actor, setActor] = useState('')
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
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
    setExpanded(false); setPending(false); setChoices([]); setActor(''); setConsent(false); setError('')
    if (connecting || endSession) disconnect()
  }
  const open = async () => {
    if (operation.current) return
    const request = ++generation.current
    operation.current = 'loading'
    setChoices([]); setActor(''); setConsent(false); setExpanded(true); setPending(true); setError('')
    try {
      const results = await principals()
      if (request === generation.current) setChoices(results)
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Could not load development identities.')
    } finally {
      if (request === generation.current) { operation.current = null; setPending(false) }
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!consent || !actor || operation.current || !choices.some((choice) => choice.id === actor)) return
    const request = ++generation.current
    operation.current = 'connecting'
    setPending(true); setError('')
    try {
      await connect(actor)
      if (request === generation.current) { setExpanded(false); setChoices([]); setActor(''); setConsent(false) }
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Could not start the development session.')
    } finally {
      if (request === generation.current) { operation.current = null; setPending(false) }
    }
  }
  return <div className="t-session">
    <div className="t-session-summary"><FlaskConical size={22} aria-hidden="true" /><div><strong>{workspace ? workspace.principal.display_name : 'Trade workspace'}</strong><span>{workspace ? `${workspace.principal.organisation_id} · ${workspace.principal.role.replace(/_/g, ' ')} · synthetic development session` : 'Choose an explicitly enabled development identity to explore the workflow.'}</span></div>
      {health?.synthetic && <button className="m-btn m-btn-secondary m-btn-sm" type="button" onClick={() => { void open() }} disabled={pending}>{workspace ? 'Change profile (synthetic actor)' : 'Connect synthetic workspace'}</button>}
      {workspace && <button className="m-btn m-btn-ghost m-btn-sm" type="button" onClick={() => cancel(true)}>End session</button>}
    </div>
    {expanded && <form onSubmit={(event) => { void submit(event) }} className="t-session-form">
      <label className="t-field"><span>Synthetic actor</span><select aria-label="Synthetic actor" value={actor} disabled={pending} onChange={(event) => { if (!operation.current) setActor(event.target.value) }} required><option value="">Choose an actor</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.display_name} · {choice.role.replace(/_/g, ' ')}</option>)}</select></label>
      <label className="t-check"><input type="checkbox" checked={consent} disabled={pending} onChange={(event) => { if (!operation.current) setConsent(event.target.checked) }} required /><span>I understand this uses synthetic organisations, capacity and trade records. No money moves.</span></label>
      <div className="m-row"><button className="m-btn m-btn-primary m-btn-sm" disabled={pending || !consent || !actor}>{pending ? 'Connecting…' : 'Start synthetic session'}</button><button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => cancel()}>Cancel</button></div>
    </form>}
    {error && <Notice error>{error}</Notice>}
    {health && !health.synthetic && !workspace && <p className="m-small">Development identities are disabled. A verified Part 2 identity adapter is required.</p>}
  </div>
}

export function TradeFrame({ title, subtitle, eyebrow, children }: { title: string; subtitle: string; eyebrow?: string; children: ReactNode }) {
  const { workspace, health, loading, refreshing, error, refresh } = useTrade()
  const { t } = useI18n()
  return <div className="m-page t-page">
    <header className="m-pagehead"><div><p className="m-eyebrow">{eyebrow ?? t('nav_trade')}</p><h1 className="m-h1">{title}</h1><p className="m-lead">{subtitle}</p></div><button type="button" className="m-btn m-btn-secondary m-btn-sm" disabled={refreshing} onClick={() => { void refresh() }}><RefreshCw size={16} className={refreshing ? 't-spin' : ''} aria-hidden="true" />{refreshing ? t('refreshing') : t('refresh')}</button></header>
    <nav className="t-nav" aria-label="Trade workflow"><Link to="/">Change workspace</Link><Link to="/fpo">FPO dashboard</Link>{nav.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : undefined}><Icon size={17} aria-hidden="true" />{t(item.labelKey)}</NavLink> })}</nav>
    <SessionControl />
    {error && <Notice error>{error}{workspace && <p>Displayed records are from {timestamp(workspace.server_time)}. Refresh before submitting another action.</p>}</Notice>}
    {loading && <div className="t-empty" role="status"><LoaderCircle className="t-spin" size={28} /><p>{t('loading_trade')}</p></div>}
    {(health || workspace) && !(workspace?.production_ready ?? health?.production_ready) && <div className="t-gate"><ShieldCheck size={17} aria-hidden="true" /><span><strong>Development workflow.</strong> Live trading is blocked until verified identity, capacity and production acceptance are connected.</span></div>}
    {!loading && !workspace && <Panel title="Connect to continue" subtitle="Records, permissions and deadlines come from the trade service."><p>{health?.synthetic ? 'Use “Connect synthetic workspace” above to select an FPO, exporter, QC reviewer or finance reviewer. Each actor sees only its permitted records.' : 'Start the configured trade API and refresh this page. Production requires the verified identity integration.'}</p>{health?.blockers?.length ? <ul className="t-bullets">{health.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}</Panel>}
    {workspace && <Fragment key={`${workspace.principal.id}:${workspace.principal.organisation_id}:${workspace.principal.role}`}>{children}<footer className="t-footer">Server snapshot {timestamp(workspace.server_time)} · {workspace.synthetic ? 'Synthetic records' : 'Organisation-scoped records'} · Commands are validated and saved by the server.</footer></Fragment>}
  </div>
}

function MembersInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  let rows: { id: string; kg: string }[]
  try { rows = JSON.parse(value || '[{"id":"","kg":""}]') } catch { rows = [{ id: '', kg: '' }] }
  const update = (index: number, key: 'id' | 'kg', text: string) => onChange(JSON.stringify(rows.map((row, i) => i === index ? { ...row, [key]: text } : row)))
  return <div className="t-members" id={id}>{rows.map((row, index) => <div className="t-member-row" key={index}>
    <label><span className="m-small">Member reference {index + 1}</span><input aria-label={`Member reference ${index + 1}`} required value={row.id} onChange={(event) => update(index, 'id', event.target.value)} placeholder="Member ID" /></label>
    <label><span className="m-small">Contribution (kg)</span><input aria-label={`Contribution kg ${index + 1}`} type="number" min="0.001" step="0.001" required value={row.kg} onChange={(event) => update(index, 'kg', event.target.value)} placeholder="0.000" /></label>
    <button type="button" className="m-btn m-btn-ghost m-btn-sm" disabled={rows.length < 2} onClick={() => onChange(JSON.stringify(rows.filter((_, i) => i !== index)))} aria-label={`Remove member ${index + 1}`}>Remove</button>
  </div>)}<button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => onChange(JSON.stringify([...rows, { id: '', kg: '' }]))}>+ Add member contribution</button></div>
}

export function CommandForm({ title, fields = [], path, prepare, submit = 'Save record', success = 'Record saved on the server.', onSaved, tone = 'primary', note }: { title?: string; fields?: FieldSpec[]; path: string; prepare: (values: Values) => unknown; submit?: string; success?: string; onSaved?: () => void; tone?: 'primary' | 'danger' | 'secondary'; note?: string }) {
  const { command, writesEnabled } = useTrade()
  const prefix = useId()
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map((field) => [field.name, field.value ?? (field.type === 'select' ? field.options?.[0]?.value || '' : field.type === 'checkbox' ? 'false' : '')])))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const busy = useRef(false)
  const intent = useRef({ signature: '', key: '' })
  const update = (name: string, value: string) => { setValues((old) => ({ ...old, [name]: value })); setSaved(false) }
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy.current || !writesEnabled) return
    setError(''); setSaved(false)
    let body: unknown
    try { body = prepare(values) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the entered values.'); return }
    const signature = `${path}:${JSON.stringify(body)}`
    if (intent.current.signature !== signature) intent.current = { signature, key: crypto.randomUUID() }
    busy.current = true; setPending(true)
    try { await command(path, body, intent.current.key); setSaved(true); onSaved?.() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this record.') } finally { busy.current = false; setPending(false) }
  }
  return <form className="t-command-form" onSubmit={(event) => { void handleSubmit(event) }}>
    {title && <h3 className="m-h3">{title}</h3>}
    <fieldset disabled={pending || !writesEnabled} className="t-fields"><legend className="sr-only">{title || submit}</legend>{fields.map((field) => {
      const id = `${prefix}-${field.name}`
      const value = values[field.name] ?? field.value ?? ''
      const common = { id, name: field.name, required: field.required !== false, 'aria-describedby': field.help ? `${id}-help` : undefined }
      if (field.type === 'checkbox') return <label key={field.name} className="t-check t-wide"><input {...common} type="checkbox" checked={value === 'true'} onChange={(event) => update(field.name, String(event.target.checked))} /><span>{field.label}</span></label>
      if (field.type === 'criteria') return <div className="t-field t-wide" key={field.name}><span>{field.label}</span><CriteriaInput id={id} value={value} onChange={(next) => update(field.name, next)} />{field.help && <small id={`${id}-help`}>{field.help}</small>}</div>
      if (field.type === 'members') return <div className="t-field t-wide" key={field.name}><span>{field.label}</span><MembersInput id={id} value={value} onChange={(next) => update(field.name, next)} />{field.help && <small id={`${id}-help`}>{field.help}</small>}</div>
      return <label className={`t-field${field.wide || field.type === 'textarea' ? ' t-wide' : ''}`} key={field.name} htmlFor={id}><span>{field.label}{field.required === false && <small> (optional)</small>}</span>
        {field.type === 'textarea' ? <textarea {...common} value={value} rows={3} placeholder={field.placeholder} onChange={(event) => update(field.name, event.target.value)} /> : field.type === 'select' ? <select {...common} value={value} onChange={(event) => update(field.name, event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input {...common} type={field.type || 'text'} min={field.min} max={field.max} step={field.step} value={value} placeholder={field.placeholder} onChange={(event) => update(field.name, event.target.value)} />}
        {field.help && <small id={`${id}-help`}>{field.help}</small>}
      </label>
    })}</fieldset>
    {note && <p className="m-small">{note}</p>}
    {!writesEnabled && <p role="status" className="m-small">Actions are paused until a fresh snapshot is loaded for this session. Refresh the trade workspace before submitting.</p>}
    {error && <Notice error>{error}</Notice>}
    {saved && <div className="t-success" role="status"><CheckCircle2 size={18} />{success}</div>}
    <button className={`m-btn m-btn-${tone} m-btn-sm`} type="submit" disabled={pending || saved || !writesEnabled}>{pending && <LoaderCircle size={16} className="t-spin" aria-hidden="true" />}{pending ? 'Saving…' : saved ? 'Saved' : submit}</button>
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

export const reasonField: FieldSpec = { name: 'reason', label: 'Reason', type: 'textarea' }
export const evidenceField: FieldSpec = { name: 'evidence_reference', label: 'Private evidence reference', help: 'Reference an authorised report or storage record. This form does not upload or verify a file.' }
export const memberField: FieldSpec = { name: 'members', label: 'Member contributions', type: 'members', help: 'Unique member references and contributions must sum exactly to the harvested quantity.' }
export function termFields(terms?: CommercialTerms): FieldSpec[] {
  return [
    { name: 'handover', label: 'Handover location and basis', value: terms?.handover },
    { name: 'grade_protocol', label: 'Grade protocol / version', value: terms?.grade_protocol },
    { name: 'delivery_start', label: 'Delivery window starts (local time)', type: 'datetime-local', value: terms?.delivery_start ? localDateTime(terms.delivery_start) : undefined },
    { name: 'delivery_end', label: 'Delivery window ends (local time)', type: 'datetime-local', value: terms?.delivery_end ? localDateTime(terms.delivery_end) : undefined },
    { name: 'payment_due_days', label: 'Payment due after receipt (days)', type: 'number', min: '0', max: '365', step: '1', value: String(terms?.payment_due_days ?? 7) },
    { name: 'downgrade_percent', label: 'Downgraded produce price (% of full price)', type: 'number', min: '0', max: '100', step: '0.01', value: String((terms?.downgrade_bps ?? 0) / 100), help: 'An explicit agreed rate; 0 means no value for downgraded produce.' },
    moneyField('fee', 'Disclosed seller fee', terms?.fee_paise ?? 0),
    { name: 'shortfall_liability', label: 'Transit shortfall liability', type: 'select', value: terms?.shortfall_liability, options: [{ value: 'seller', label: 'Seller bears shortfall' }, { value: 'buyer', label: 'Buyer pays for transit shortfall' }] },
    { name: 'payment_terms', label: 'Payment terms', type: 'textarea', value: terms?.payment_terms },
    { name: 'cancellation_terms', label: 'Cancellation and default terms', type: 'textarea', value: terms?.cancellation_terms },
    { name: 'production_risk', label: 'Production risk allocation', type: 'textarea', value: terms?.production_risk },
    { name: 'dispute_procedure', label: 'Dispute and evidence procedure', type: 'textarea', value: terms?.dispute_procedure },
    { name: 'packaging_requirements', label: 'Packaging requirements', type: 'textarea', required: false, value: terms?.packaging_requirements ?? '' },
    { name: 'additional_requirements', label: 'Additional requirements and notes', type: 'textarea', required: false, value: terms?.additional_requirements ?? '' },
    { name: 'quality_specification', label: 'Buyer quality criteria', type: 'criteria', required: false,
      value: JSON.stringify((terms?.quality_specification ?? []).map(item => ({ ...item, minimum: item.minimum ?? '', maximum: item.maximum ?? '' }))),
      help: 'Optional buyer-defined criteria. These form part of the versioned commercial terms; no crop-wide thresholds are assumed.' },
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
  type Criterion = { attribute: string; unit: string; minimum: string; maximum: string; required: boolean; notes: string }
  let rows: Criterion[]
  try { rows = JSON.parse(value || '[]') } catch { rows = [] }
  const empty = (): Criterion => ({ attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' })
  const update = (index: number, key: keyof Criterion, next: string | boolean) => onChange(JSON.stringify(rows.map((row, i) => i === index ? { ...row, [key]: next } : row)))
  return <div className="t-criteria" id={id}>{rows.map((row, index) => <fieldset className="t-criterion" key={index}><legend>Buyer criterion {index + 1}</legend><div className="t-fields">
    {(['attribute', 'unit', 'minimum', 'maximum', 'notes'] as const).map((key) => <label className={`t-field${key === 'notes' ? ' t-wide' : ''}`} key={key}><span>{key === 'minimum' || key === 'maximum' ? `${key} value (optional)` : key[0].toUpperCase() + key.slice(1)}</span><input required={key === 'attribute'} value={row[key]} onChange={(event) => update(index, key, event.target.value)} /></label>)}
    <label className="t-check"><input type="checkbox" checked={row.required} onChange={(event) => update(index, 'required', event.target.checked)} /><span>Required criterion</span></label><button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => onChange(JSON.stringify(rows.filter((_, i) => i !== index)))}>Remove criterion</button>
  </div></fieldset>)}<button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={() => onChange(JSON.stringify([...rows, empty()]))}>+ Add quality criterion</button></div>
}

export function TermsView({ terms }: { terms: CommercialTerms }) {
  return <><dl className="t-details"><Detail label="Handover">{terms.handover}</Detail><Detail label="Grade protocol">{terms.grade_protocol}</Detail><Detail label="Delivery window">{timestamp(terms.delivery_start)} – {timestamp(terms.delivery_end)}</Detail><Detail label="Payment">{terms.payment_terms} · {terms.payment_due_days} days</Detail><Detail label="Downgraded price">{terms.downgrade_bps / 100}% of contracted price</Detail><Detail label="Transit shortfall">{terms.shortfall_liability} liability</Detail><Detail label="Cancellation / default">{terms.cancellation_terms}</Detail><Detail label="Production risk">{terms.production_risk}</Detail><Detail label="Disputes">{terms.dispute_procedure}</Detail><Detail label="Packaging">{terms.packaging_requirements || 'Not specified'}</Detail><Detail label="Additional requirements">{terms.additional_requirements || 'Not specified'}</Detail></dl>
    {terms.quality_specification?.some(item => item.required) && <Notice>Required buyer criteria are preserved in these terms, but a criterion-specific assessment adapter is not connected. Shipment creation and dispatch are blocked until a verified review adapter is available.</Notice>}
    {terms.quality_specification?.length ? <><p className="m-small">Recorded buyer criteria are requirements, not proof they are satisfied. Generic grade or protocol release alone does not establish compliance with these criteria.</p><div className="t-table-wrap" style={{ marginTop: 16 }}><table className="t-table"><caption>Buyer quality criteria for this terms version</caption><thead><tr><th>Attribute</th><th>Unit</th><th>Minimum</th><th>Maximum</th><th>Required</th><th>Notes</th></tr></thead><tbody>{terms.quality_specification.map((item, index) => <tr key={index}><td>{item.attribute}</td><td>{item.unit || '—'}</td><td>{item.minimum ?? '—'}</td><td>{item.maximum ?? '—'}</td><td>{item.required ? 'Yes' : 'Optional'}</td><td>{item.notes || '—'}</td></tr>)}</tbody></table></div></> : <p className="m-small">No additional buyer quality criteria specified.</p>}
  </>
}
