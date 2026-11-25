import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, Sprout, UsersRound } from 'lucide-react'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { runPlan } from '../planning/engine'
import { StatCard } from '../components/ui'
import PageHeader from '../components/layout/PageHeader'
import { fmtT } from './Overview'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, MessageSquareText, Phone, Send, Smartphone, X } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import type { PlanChange, ReplyInput } from '../context/PlanContext'
import { useFarmers } from '../context/FarmersContext'
import { replyStateFor } from '../planning/engine'
import type { ConstraintKind } from '../planning/engine'
import { FPO_NAME, composeInstruction, individualMessageLanguageDecision, languageFor, languages, resolveMessageLanguage, simulatedReplyText, smsSegments } from '../planning/messages'
import type { Channel, Language } from '../planning/messages'
import { ReplyBadge, initials } from '../components/ui'
import type { ReplyState } from '../components/ui'
import { cropLabel, formatDate, formatNumber, LANGUAGES, useI18n, type TKey } from '../i18n'

const constraintOptions: { id: ConstraintKind; labelKey: TKey; hintKey: TKey }[] = [
  { id: 'land', labelKey: 'msg_constraint_land', hintKey: 'msg_constraint_land_hint' },
  { id: 'water', labelKey: 'msg_constraint_water', hintKey: 'msg_constraint_water_hint' },
  { id: 'timing', labelKey: 'msg_constraint_timing', hintKey: 'msg_constraint_timing_hint' },
  { id: 'other', labelKey: 'msg_constraint_other', hintKey: 'msg_constraint_other_hint' },
]

const order: Record<ReplyState, number> = { 'needs-update': 0, 'not-sent': 1, constraint: 2, sent: 3, confirmed: 4, declined: 5 }
const time = (iso: string, lang: Parameters<typeof formatNumber>[1]) => formatDate(iso, lang, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const acresText = (acres: number, lang: Parameters<typeof formatNumber>[1]) => `${formatNumber(Math.round(acres * 100) / 100, lang, { maximumFractionDigits: 2 })} ac`

export function FarmerWorkspace({ only }: { only?: string[] }) {
  const { t, lang } = useI18n()
  const { result, responses, messages, sendInstructions, recordReply } = usePlan()
  const { data } = useFarmers()
  const farmerIds = useMemo(() => {
    const ids = new Set([...result.farmersInvolved, ...Object.keys(responses).filter((id) => responses[id].status !== 'not-sent')])
    return [...ids].filter((id) => data.farmers.some((f) => f.id === id) && (!only || only.includes(id)))
  }, [result, responses, data.farmers, only])
  const rows = useMemo(() => farmerIds.map((id) => ({ farmer: data.farmers.find((f) => f.id === id)!, state: replyStateFor(id, responses, result.allocations), allocations: result.allocations.filter((a) => a.farmerId === id) }))
    .sort((a, b) => order[a.state] - order[b.state] || a.farmer.name.localeCompare(b.farmer.name)), [farmerIds, data.farmers, responses, result.allocations])

  const [selectedId, setSelectedId] = useState<string>(() => rows[0]?.farmer.id ?? '')
  const selected = rows.find((r) => r.farmer.id === selectedId) ?? rows[0]
  const [channel, setChannel] = useState<Channel>('WhatsApp')
  const [language, setLanguage] = useState<Language>(() => languageFor(selected?.farmer.preferredLanguage ?? ''))
  const [replyMode, setReplyMode] = useState<'none' | 'constraint'>('none')
  const [kind, setKind] = useState<ConstraintKind>('land')
  const [acres, setAcres] = useState('1')
  const [note, setNote] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [lastChange, setLastChange] = useState<PlanChange | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (selected) setLanguage(languageFor(selected.farmer.preferredLanguage)); setReplyMode('none'); setLastChange(null) }, [selected?.farmer.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const thread = messages.filter((m) => m.farmerId === selected?.farmer.id)
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [thread.length, selected?.farmer.id])

  if (!selected) return <p className="m-small">{t('msg_no_farmers_group')}</p>

  const firstName = selected.farmer.name.split(' ')[0]
  const isUpdate = selected.state === 'needs-update' || (selected.state !== 'not-sent' && thread.some((m) => m.direction === 'out'))
  const draft = selected.allocations.length ? composeInstruction(firstName, selected.allocations, result.plans, language, channel, isUpdate) : ''
  const canSend = selected.allocations.length > 0 && (selected.state === 'not-sent' || selected.state === 'needs-update')
  const awaitingReply = selected.state === 'sent' || selected.state === 'constraint'
  const sms = smsSegments(draft)
  const pending = rows.filter((r) => (r.state === 'not-sent' || r.state === 'needs-update') && r.allocations.length)
  const uiLanguage = LANGUAGES.find((item) => item.code === lang)?.native ?? LANGUAGES[0].native
  const previewLanguage = languages.find((item) => item.id === language)?.label ?? language
  const languageDecision = individualMessageLanguageDecision(selected.farmer.preferredLanguage, language)
  const unsupportedPreference = languageDecision === 'unsupported-preference'
  const languageMismatch = languageDecision === 'preview-differs-from-preference'
  const preferred = resolveMessageLanguage(selected.farmer.preferredLanguage)

  function sendAll() {
    const fallback = pending.map((row) => row.farmer.preferredLanguage).filter((preferred) => resolveMessageLanguage(preferred).needsCoordinatorConfirmation)
    if (fallback.length && !window.confirm(t('message_fallback_batch_confirm', { count: fallback.length, languages: [...new Set(fallback)].join(', ') }))) return
    sendInstructions(pending.map((r) => { const lang = languageFor(r.farmer.preferredLanguage); return { farmerId: r.farmer.id, channel, language: lang, text: composeInstruction(r.farmer.name.split(' ')[0], r.allocations, result.plans, lang, channel, r.state === 'needs-update') } }))
  }

  function reply(input: ReplyInput, text: string) {
    const change = recordReply(selected.farmer.id, input, text, channel, language)
    setLastChange(change ?? { id: 'ok', at: new Date().toISOString(), title: '', details: [t('msg_confirmed_reply_detail')] })
    setReplyMode('none'); setNote('')
  }

  return <div className="m-stack">
    <div className="m-row" style={{ justifyContent: 'space-between' }}>
      <p className="m-small" style={{ margin: 0 }}>{t('msg_simulation_disclosure')}</p>
      {pending.length > 0 && <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={sendAll}><Send size={16} /> {t('msg_send_pending', { count: formatNumber(pending.length, lang) })}</button>}
    </div>
    <p className="m-small">{t('msg_interface_language', { language: uiLanguage })} · {t('msg_individual_language_policy', { language: previewLanguage })}</p>
    <p className="m-small">{t('msg_batch_language_policy')}</p>
    <div className="m-msg-layout">
      <section className="m-card m-card-tight" aria-label={t('msg_farmers_in_plan')}>
        <div className="m-farmer-list" role="list">
          {rows.map((r) => <button type="button" role="listitem" key={r.farmer.id} className="m-farmer-item" aria-current={r.farmer.id === selected.farmer.id} onClick={() => setSelectedId(r.farmer.id)}>
            <span className="m-avatar">{initials(r.farmer.name)}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong>{r.farmer.name}</strong>
              <span className="m-small">{r.allocations.length ? r.allocations.map((a) => `${cropLabel(a.crop, t)} ${acresText(a.acres, lang)}`).join(' · ') : t('msg_no_longer_in_plan')}</span>
              <span style={{ display: 'block', marginTop: 4 }}><ReplyBadge state={r.state} /></span>
            </span>
          </button>)}
        </div>
      </section>

      <section className="m-stack">
        <div className="m-card">
          <div className="m-card-head" style={{ marginBottom: 14 }}>
            <div><h2 className="m-h3">{selected.farmer.name}</h2><p className="m-sub"><Phone size={13} style={{ verticalAlign: '-2px' }} /> {selected.farmer.phone} · {selected.farmer.village} · {t('msg_preferred_language', { language: selected.farmer.preferredLanguage })}</p></div>
            <ReplyBadge state={selected.state} />
          </div>
          {unsupportedPreference && <p className="m-alert m-alert-warn" role="note">{t('message_fallback_warning', { language: selected.farmer.preferredLanguage, draftLanguage: previewLanguage })}</p>}
          {languageMismatch && <p className="m-alert m-alert-warn" role="note">{t('msg_language_mismatch_confirm', { preferred: languages.find((item) => item.id === preferred.language)?.label ?? preferred.language, actual: previewLanguage })}</p>}
          <div className="m-row" style={{ marginBottom: 16 }}>
            <div className="m-seg" role="group" aria-label={t('msg_channel')}>{(['WhatsApp', 'SMS'] as Channel[]).map((c) => <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}>{c === 'WhatsApp' ? <MessageSquareText size={14} style={{ verticalAlign: '-2px' }} /> : <Smartphone size={14} style={{ verticalAlign: '-2px' }} />} {c}</button>)}</div>
            <div className="m-seg" role="group" aria-label={t('msg_preview_language')}>{languages.map((l) => <button key={l.id} type="button" aria-pressed={language === l.id} onClick={() => setLanguage(l.id)}>{l.label}</button>)}</div>
          </div>

          <div className={`m-phone ${channel === 'SMS' ? 'sms' : ''}`}>
            <div className="m-phone-top"><span className="m-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(selected.farmer.name)}</span><div><strong>{selected.farmer.name}</strong><span>{channel} · {t('msg_from_fpo', { name: FPO_NAME })}</span></div></div>
            <div className="m-thread" ref={threadRef}>
              {thread.map((m) => <div key={m.id} className={`m-bubble ${m.direction}`}>{m.text}<time>{time(m.at, lang)} · {m.direction === 'out' ? m.channel : t('msg_simulated_reply')} · {t(m.direction === 'out' ? 'msg_actual_language' : 'msg_reply_language', { language: languages.find((item) => item.id === m.language)?.label ?? m.language })}</time></div>)}
              {canSend && <div className="m-bubble draft">{draft}</div>}
              {!thread.length && !canSend && <p className="m-thread-empty">{t('msg_no_messages')}</p>}
            </div>
          </div>
          {canSend && channel === 'SMS' && <p className="m-small" style={{ textAlign: 'center', margin: '8px 0 0' }}>{t('msg_sms_summary', { chars: formatNumber(sms.chars, lang), segments: formatNumber(sms.segments, lang), unicode: sms.unicode ? ` (${t('msg_unicode')})` : '' })}</p>}
          <div className="m-row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {canSend && <button type="button" className="m-btn m-btn-primary" onClick={() => {
              if (unsupportedPreference && !window.confirm(t('message_fallback_warning', { language: selected.farmer.preferredLanguage, draftLanguage: previewLanguage }))) return
              if (languageMismatch && !window.confirm(t('msg_language_mismatch_confirm', { preferred: languages.find((item) => item.id === preferred.language)?.label ?? preferred.language, actual: previewLanguage }))) return
              sendInstructions([{ farmerId: selected.farmer.id, text: draft, channel, language }])
            }}><Send size={17} /> {selected.state === 'needs-update' ? t('msg_send_updated_plan') : t('msg_send_channel_simulated', { channel })}</button>}
            {!selected.allocations.length && selected.state !== 'declined' && <p className="m-small">{t('msg_farmer_no_longer_assigned', { name: selected.farmer.name })}</p>}
          </div>
        </div>

        {awaitingReply && <div className="m-card">
          <h2 className="m-h3">{t('msg_simulate_reply')}</h2>
          <p className="m-sub" style={{ marginBottom: 14 }}>{t('msg_pick_reply', { name: firstName })} {t('msg_reply_language', { language: previewLanguage })}</p>
          <div className="m-reply-grid">
            <button type="button" className="m-reply-btn" onClick={() => reply({ status: 'confirmed' }, simulatedReplyText('confirmed', language))}><strong><CheckCircle2 size={16} color="var(--good)" /> 1 · {t('msg_will_plant')}</strong><span>{t('msg_farmer_confirmed_supply')}</span></button>
            <button type="button" className="m-reply-btn" onClick={() => reply({ status: 'declined' }, simulatedReplyText('declined', language))}><strong><X size={16} color="var(--bad)" /> 2 · {t('msg_not_this_season')}</strong><span>{t('msg_land_reassigned')}</span></button>
            <button type="button" className="m-reply-btn" aria-pressed={replyMode === 'constraint'} onClick={() => setReplyMode(replyMode === 'constraint' ? 'none' : 'constraint')}><strong><AlertTriangle size={16} color="var(--warn)" /> 3 · {t('msg_report_problem')}</strong><span>{t('msg_land_water_timing')}</span></button>
          </div>
          {replyMode === 'constraint' && <form className="m-stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); reply({ status: 'constraint', kind, note: note.trim() || t(constraintOptions.find((c) => c.id === kind)!.labelKey), availableAcres: kind === 'land' ? Math.max(0, Number(acres) || 0) : undefined, availableFrom: kind === 'timing' && fromDate ? fromDate : undefined }, `${simulatedReplyText(kind, language)}${note.trim() ? ` – ${note.trim()}` : ''}${kind === 'land' ? ` (${acres} ${language === 'Hindi' ? 'एकड़' : language === 'Marathi' ? 'एकर' : language === 'Tamil' ? 'ஏக்கர்' : language === 'Malayalam' ? 'ഏക്കർ' : 'acre'})` : ''}`) }}>
            <div className="m-form-grid">
              <label className="m-field">{t('msg_problem')}<select className="m-select" value={kind} onChange={(e) => setKind(e.target.value as ConstraintKind)}>{constraintOptions.map((c) => <option key={c.id} value={c.id}>{t(c.labelKey)}</option>)}</select><small>{t(constraintOptions.find((c) => c.id === kind)!.hintKey)}</small></label>
              {kind === 'land' ? <label className="m-field">{t('msg_acres_can_plant')}<input className="m-input" type="number" min={0} step={0.25} value={acres} onChange={(e) => setAcres(e.target.value)} /><small>{t('msg_currently_assigned', { area: acresText(selected.allocations.reduce((s, a) => s + a.acres, 0), lang) })}</small></label>
                : kind === 'timing' ? <label className="m-field">{t('msg_can_sow_from')}<input className="m-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><small>{t('msg_date_optional')}</small></label>
                : <label className="m-field">{t('msg_farmer_note_optional')}<input className="m-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('msg_note_placeholder')} /></label>}
            </div>
            <div><button type="submit" className="m-btn m-btn-primary m-btn-sm">{t('msg_record_reply')}</button></div>
          </form>}
        </div>}

        {lastChange && <div className="m-alert m-alert-good" role="status"><CheckCircle2 size={18} style={{ flex: 'none', marginTop: 2 }} /><div><strong>{t('msg_reply_recorded_feedback')}</strong><p className="m-small">{t('msg_plan_impact_details_language')}</p><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{lastChange.details.map((d) => <li key={d}>{d}</li>)}</ul><Link to="/plan" className="m-link" style={{ marginTop: 6 }}>{t('msg_review_plan')}</Link></div></div>}
      </section>
    </div>
  </div>
}

type Bucket = 'confirmed' | 'follow-up' | 'constraint' | 'waiting'

export default function Messages() {
  const { t, lang } = useI18n()
  const uiLanguage = LANGUAGES.find((item) => item.code === lang)?.native ?? LANGUAGES[0].native
  const { result, responses, messages, sendInstructions, scenario, exclusions, flaggedPlots, planState } = usePlan()
  const { data } = useFarmers()
  const { orders } = useBuyerOrders()
  const campaigns = result.plans.filter((p) => p.allocations.length)
  const [cropId, setCropId] = useState(() => [...campaigns].sort((a, b) => b.allocations.length - a.allocations.length)[0]?.crop.id ?? '')
  const camp = campaigns.find((p) => p.crop.id === cropId) ?? campaigns[0]
  const [channel, setChannel] = useState<Channel>('WhatsApp')
  const [language, setLanguage] = useState<Language>('English')
  const [bucket, setBucket] = useState<Bucket | null>(null)
  const [showFarmers, setShowFarmers] = useState(false)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [sentNotice, setSentNotice] = useState<{ count: number; crop: string; channel: Channel } | null>(null)

  const involved = [...new Set([...result.farmersInvolved, ...Object.keys(responses).filter((id) => responses[id].status !== 'not-sent')])]
  const stateOf = (id: string) => replyStateFor(id, responses, result.allocations)
  const contacted = involved.filter((id) => responses[id] && responses[id].status !== 'not-sent')
  const confirmedN = contacted.filter((id) => stateOf(id) === 'confirmed').length
  const waitingN = contacted.filter((id) => stateOf(id) === 'sent').length
  const villages = new Set(contacted.map((id) => data.farmers.find((f) => f.id === id)?.village)).size
  const pct = (n: number, d: number) => (d ? formatNumber(Math.round((n / d) * 100), lang) : '0')

  const before = useMemo(() => runPlan({ orders, data, scenario, responses: {}, exclusions, flaggedPlots: {} }), [orders, data, scenario, exclusions])

  if (!camp) return <div className="m-page"><PageHeader title={t('messages_title')} subtitle={t('messages_sub')} /><p className="m-small">{t('msg_interface_language', { language: uiLanguage })}</p><Link to="/plan" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start' }}>{t('nav_plans')}</Link></div>

  const campFarmers = [...new Set(camp.allocations.map((a) => a.farmerId))]
  const bucketOf = (id: string): Bucket => { const st = stateOf(id); return st === 'confirmed' ? 'confirmed' : st === 'constraint' ? 'constraint' : st === 'sent' ? 'waiting' : 'follow-up' }
  const counts: Record<Bucket, number> = { confirmed: 0, 'follow-up': 0, constraint: 0, waiting: 0 }
  campFarmers.forEach((id) => { counts[bucketOf(id)] += 1 })
  const campStatus = (p: typeof camp) => { const ids = [...new Set(p.allocations.map((a) => a.farmerId))]; const st = ids.map(stateOf); return st.every((x) => x === 'not-sent') ? 'Draft' : st.some((x) => x === 'needs-update') ? 'Update due' : st.some((x) => x === 'sent' || x === 'not-sent') ? 'Sent' : 'Replied' }
  const lastSent = (p: typeof camp) => { const ids = new Set(p.allocations.map((a) => a.farmerId)); return messages.filter((m) => m.direction === 'out' && ids.has(m.farmerId)).sort((a, b) => b.at.localeCompare(a.at))[0] }
  const sample = data.farmers.find((f) => f.id === campFarmers[0])!
  const sampleText = composeInstruction(sample.name.split(' ')[0], result.allocations.filter((a) => a.farmerId === sample.id && a.crop === camp.crop.name), result.plans, language, channel, false)
  const pendingIds = campFarmers.filter((id) => { const st = stateOf(id); return st === 'not-sent' || st === 'needs-update' })

  function sendCampaign() {
    if (!pendingIds.length) return
    const fallback = pendingIds.map((id) => data.farmers.find((farmer) => farmer.id === id)!.preferredLanguage).filter((preferred) => resolveMessageLanguage(preferred).needsCoordinatorConfirmation)
    if (fallback.length && !window.confirm(t('message_fallback_batch_confirm', { count: fallback.length, languages: [...new Set(fallback)].join(', ') }))) return
    setSentNotice({ count: pendingIds.length, crop: camp.crop.name, channel })
    sendInstructions(pendingIds.map((id) => { const f = data.farmers.find((x) => x.id === id)!; const lang = languageFor(f.preferredLanguage); return { farmerId: id, channel, language: lang, text: composeInstruction(f.name.split(' ')[0], result.allocations.filter((a) => a.farmerId === id), result.plans, lang, channel, stateOf(id) === 'needs-update') } }))
  }
  const openWorkspace = (b: Bucket | null) => { setBucket(b); setShowFarmers(true); window.setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }

  const bPlan = before.plans.find((p) => p.crop.id === camp.crop.id)
  const bFarmers = new Set(bPlan?.allocations.map((a) => a.farmerId) ?? [])
  const declined = [...bFarmers].filter((id) => responses[id]?.status === 'declined').length
  const confirmedKg = camp.allocations.filter((a) => stateOf(a.farmerId) === 'confirmed').reduce((s, a) => s + a.kg, 0)
  const rows: { id: Bucket; labelKey: TKey; icon: JSX.Element; cls: string }[] = [
    { id: 'confirmed', labelKey: 'reply_confirmed', icon: <CheckCircle2 size={20} />, cls: '' },
    { id: 'follow-up', labelKey: 'msg_draft_or_outdated', icon: <Clock3 size={20} />, cls: 'warn' },
    { id: 'constraint', labelKey: 'msg_constraint_reported', icon: <AlertTriangle size={20} />, cls: 'bad' },
    { id: 'waiting', labelKey: 'msg_sent_no_reply', icon: <UsersRound size={20} />, cls: '' },
  ]

  return <div className="m-page">
    <PageHeader title={t('messages_title')} subtitle={t('messages_sub')} />
    <p className="m-small">{t('msg_interface_language', { language: uiLanguage })}</p>

    <section className="m-stats three" aria-label={t('msg_farmer_responses')}>
      <StatCard icon={<UsersRound size={24} />} label={t('msg_farmers_contacted')} tip={t('msg_farmers_contacted_tip')} value={formatNumber(contacted.length, lang)} sub={t('msg_plan_villages', { count: formatNumber(involved.length, lang), villages: formatNumber(villages, lang) })} />
      <StatCard icon={<Sprout size={24} />} label={t('msg_farmer_confirmed')} tip={t('msg_farmer_confirmed_tip')} value={formatNumber(confirmedN, lang)} sub={<><span className="m-up">↗ {pct(confirmedN, contacted.length)}%</span> {t('msg_of_contacted')}</>} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label={t('msg_pending_responses')} tip={t('msg_pending_tip')} value={formatNumber(waitingN, lang)} sub={<>≈ {pct(waitingN, contacted.length)}% {t('msg_of_contacted')}</>} />
    </section>

    {planState !== 'finalized' && <div className="m-alert m-alert-warn"><AlertTriangle size={18} style={{ flex: 'none', marginTop: 2 }} /><span>{planState === 'changed' ? t('msg_plan_changed_after_finalized') : t('msg_plan_is_draft')} {t('msg_can_send_updates')} <Link to="/plan" className="m-link">{t('msg_review_finalize')}</Link></span></div>}
    {Object.keys(flaggedPlots).length > 0 && <div className="m-alert m-alert-info"><AlertTriangle size={18} style={{ flex: 'none', marginTop: 2 }} /><span>{t('msg_flagged_plots', { count: formatNumber(Object.keys(flaggedPlots).length, lang) })} <Link to="/farmers" className="m-link">{t('msg_verify_farms')}</Link></span></div>}
    <div className="m-cols-even m-cols-msg m-stretch">
      <section className="m-panel m-flexcol" aria-labelledby="camp-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="camp-title">{t('msg_campaigns')}</h2><p className="m-panel-sub">{t('msg_all_communications')}</p></div>
        </div>
        <div>{campaigns.map((p) => {
          const st = campStatus(p); const last = lastSent(p)
          return <button type="button" key={p.crop.id} className="m-camp" aria-current={p.crop.id === camp.crop.id} onClick={() => { setCropId(p.crop.id); setBucket(null); setSentNotice(null) }}>
            <span className="m-roundico" style={{ width: 44, height: 44 }}><Sprout size={22} /></span>
            <span style={{ minWidth: 0 }}><strong>{t('msg_crop_plan', { crop: cropLabel(p.crop.name, t) })}</strong><span className="m-small">{last ? t('msg_sent_date', { date: formatDate(last.at, lang, { day: 'numeric', month: 'short' }), channel: last.channel }) : t('msg_farmers_not_sent', { count: formatNumber(new Set(p.allocations.map((a) => a.farmerId)).size, lang) })}</span></span>
            <span className={`m-camp-pill ${st === 'Sent' ? 'active' : st === 'Draft' || st === 'Update due' ? 'draft' : ''}`}>{t(st === 'Draft' ? 'status_draft' : st === 'Update due' ? 'msg_update_due' : st === 'Sent' ? 'msg_sent_status' : 'msg_replied')}</span><ArrowRight size={18} />
          </button>
        })}</div>
      </section>

      <section className="m-panel m-flexcol" aria-labelledby="prev-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="prev-title">{t('msg_preview')}</h2><p className="m-panel-sub">{t('msg_preview_description', { crop: cropLabel(camp.crop.name, t) })}</p><p className="m-panel-sub">{t('msg_batch_language_policy')}</p></div>
          <div className="m-row">
            <span className="m-select-pill">{channel === 'WhatsApp' ? <MessageSquareText size={18} color="#25a244" /> : <Smartphone size={18} />}<select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label={t('msg_channel')}><option>WhatsApp</option><option>SMS</option></select></span>
            <span className="m-select-pill"><select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label={t('msg_preview_language')}>{languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></span>
          </div>
        </div>
        <div className={`m-wa ${channel === 'SMS' ? 'sms' : ''}`} style={{ flex: 1 }}>
          <span className="m-wa-date">{lastSent(camp) ? formatDate(lastSent(camp)!.at, lang, { day: 'numeric', month: 'short' }) : t('msg_draft_not_sent')}</span>
          <div className="m-wa-bubble">{sampleText}<time>{lastSent(camp) ? formatDate(lastSent(camp)!.at, lang, { hour: 'numeric', minute: '2-digit' }) : t('msg_not_sent')}{channel === 'WhatsApp' && lastSent(camp) ? ' ✓✓' : ''}</time></div>
          <span className="m-small" style={{ fontSize: 12 }}>{t('msg_example_for', { name: sample.name })}</span>
        </div>
        <div className="m-send-row">
          {pendingIds.length > 0
            ? <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={sendCampaign}><Send size={16} aria-hidden="true" />{t('msg_send_to_farmers', { count: formatNumber(pendingIds.length, lang), crop: cropLabel(camp.crop.name, t) })}</button>
            : <p className="m-small" style={{ margin: 0 }}><CheckCircle2 size={14} aria-hidden="true" />{t('msg_all_current', { crop: cropLabel(camp.crop.name, t) })}</p>}
          {sentNotice && <p className="m-send-notice" role="status">{t('msg_sent_notice', { count: formatNumber(sentNotice.count, lang), crop: cropLabel(sentNotice.crop, t), channel: sentNotice.channel })}</p>}
        </div>
      </section>
    </div>

    <div className="m-cols-even m-cols-msg m-stretch">
      <section className="m-panel m-flexcol" aria-labelledby="resp-title">
        <h2 className="m-panel-title sm" id="resp-title">{t('msg_farmer_responses')} <small>({formatNumber(campFarmers.length, lang)})</small></h2>
        <p className="m-panel-sub" style={{ marginBottom: 8 }}>{t('msg_latest_replies', { crop: cropLabel(camp.crop.name, t) })}</p>
        {rows.map((r) => <button type="button" key={r.id} className="m-resp" aria-pressed={showFarmers && bucket === r.id} onClick={() => openWorkspace(r.id)}>
          <span className={`m-roundico ${r.cls}`} style={{ width: 34, height: 34 }}>{r.icon}</span><span className="m-resp-label">{t(r.labelKey)}</span><b>{formatNumber(counts[r.id], lang)}</b><em>{pct(counts[r.id], campFarmers.length)}%</em><ArrowRight size={16} />
        </button>)}
        <button type="button" className="m-btn m-btn-secondary m-btn-block" onClick={() => openWorkspace(null)}><MessageSquareText size={18} /><span>{t('msg_view_farmer_responses')}</span><ArrowRight size={18} /></button>
      </section>

      <section className="m-panel m-flexcol" aria-labelledby="flow-title">
        <h2 className="m-panel-title sm" id="flow-title">{t('msg_how_responses_update')}</h2>
        <p className="m-panel-sub" style={{ marginBottom: 12 }}>{t('msg_responses_rerun', { crop: cropLabel(camp.crop.name, t) })}</p>
        <div className="m-flow-v">
          <div className="m-flowcard"><span className="m-roundico"><CalendarDays size={20} /></span><div><strong>{t('msg_before_responses')}</strong><strong className="big">{fmtT(bPlan?.expectedKg ?? 0, lang)}</strong><span className="m-small">{t('msg_farmer_acres', { count: formatNumber(bFarmers.size, lang), area: formatNumber(bPlan?.plannedAcres ?? 0, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span></div></div>
          <span className="m-flow-arrow" aria-hidden="true"><ArrowRight size={22} /></span>
          <div className="m-flowcard"><span className="m-roundico"><Sprout size={20} /></span><div><strong>{t('msg_after_responses')}</strong><strong className="big">{fmtT(camp.expectedKg, lang)}</strong><span className="m-small">{t('msg_farmer_acres', { count: formatNumber(campFarmers.length, lang), area: formatNumber(camp.plannedAcres, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })}</span></div></div>
        </div>
        <ul className="m-changed" style={{ marginTop: 16 }}>
          <li><CheckCircle2 size={17} color="var(--good)" />{t('msg_farmer_confirmed_quantity', { count: formatNumber(counts.confirmed, lang), quantity: fmtT(confirmedKg, lang) })}</li>
          <li><AlertTriangle size={17} color="var(--bad)" />{t('msg_reported_problems', { count: formatNumber(counts.constraint, lang) })}{declined ? t('msg_declined_count', { count: formatNumber(declined, lang) }) : ''} ({camp.expectedKg - (bPlan?.expectedKg ?? 0) >= 0 ? '+' : '−'}{fmtT(Math.abs(camp.expectedKg - (bPlan?.expectedKg ?? 0)), lang)})</li>
          <li><Clock3 size={17} color="var(--warn)" />{t('msg_still_confirm', { count: formatNumber(counts['follow-up'] + counts.waiting, lang) })}</li>
          <li><Sprout size={17} color="var(--forest)" />{bFarmers.size !== campFarmers.length || Math.abs(camp.expectedKg - (bPlan?.expectedKg ?? 0)) > 0 ? t('msg_plan_updated_auto') : t('msg_no_response_changes')}</li>
        </ul>
      </section>
    </div>

    {showFarmers && <section className="m-panel" ref={workspaceRef} aria-labelledby="fw-title" style={{ scrollMarginTop: 16 }}>
      <div className="m-panel-head"><div><h2 className="m-panel-title sm" id="fw-title">{t('msg_farmer_wise')}{bucket ? ` · ${t(rows.find((r) => r.id === bucket)!.labelKey)}` : ''}</h2><p className="m-panel-sub">{t('msg_send_resend_help')}</p></div>
        <div className="m-row">{bucket && <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setBucket(null)}>{t('msg_show_all_farmers')}</button>}<button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setShowFarmers(false)}>{t('msg_close')}</button></div></div>
      <FarmerWorkspace key={`${bucket ?? 'all'}`} only={bucket ? campFarmers.filter((id) => bucketOf(id) === bucket) : undefined} />
    </section>}
  </div>
}
