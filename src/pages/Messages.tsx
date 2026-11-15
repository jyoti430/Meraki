import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, MessageSquareText, Phone, Send, Smartphone, X } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import type { PlanChange, ReplyInput } from '../context/PlanContext'
import { useFarmers } from '../context/FarmersContext'
import { replyStateFor } from '../planning/engine'
import type { ConstraintKind } from '../planning/engine'
import { FPO_NAME, composeInstruction, languageFor, languages, replyText, smsSegments } from '../planning/messages'
import type { Channel, Language } from '../planning/messages'
import { fmtAcres } from '../planning/format'
import { ReplyBadge, initials } from '../components/ui'
import type { ReplyState } from '../components/ui'

const constraintOptions: { id: ConstraintKind; label: string; hint: string }[] = [
  { id: 'land', label: 'Less land available', hint: 'Caps this farmer’s area; the rest is reassigned.' },
  { id: 'water', label: 'Water problem', hint: 'Downgrades water on their plots in Farmers & farms.' },
  { id: 'timing', label: 'Cannot sow in time', hint: 'Keeps the plot but flags it as a risk.' },
  { id: 'other', label: 'Other problem', hint: 'Recorded and flagged for follow-up.' },
]

const order: Record<ReplyState, number> = { 'needs-update': 0, 'not-sent': 1, constraint: 2, sent: 3, confirmed: 4, declined: 5 }
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function Messages() {
  const { result, responses, messages, sendInstructions, recordReply } = usePlan()
  const { data } = useFarmers()
  const farmerIds = useMemo(() => {
    const ids = new Set([...result.farmersInvolved, ...Object.keys(responses).filter((id) => responses[id].status !== 'not-sent')])
    return [...ids].filter((id) => data.farmers.some((f) => f.id === id))
  }, [result, responses, data.farmers])
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
  const [lastChange, setLastChange] = useState<PlanChange | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (selected) setLanguage(languageFor(selected.farmer.preferredLanguage)); setReplyMode('none'); setLastChange(null) }, [selected?.farmer.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const thread = messages.filter((m) => m.farmerId === selected?.farmer.id)
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [thread.length, selected?.farmer.id])

  if (!selected) return <div className="m-page"><header className="m-pagehead"><div><div className="m-eyebrow">Step 5 · Farmer communication</div><h1 className="m-h1">Messages</h1><p className="m-lead">No farmers are assigned in the current plan yet.</p></div></header><Link to="/plan" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start' }}>Open planting plan</Link></div>

  const firstName = selected.farmer.name.split(' ')[0]
  const isUpdate = selected.state === 'needs-update' || (selected.state !== 'not-sent' && thread.some((m) => m.direction === 'out'))
  const draft = selected.allocations.length ? composeInstruction(firstName, selected.allocations, result.plans, language, channel, isUpdate) : ''
  const canSend = selected.allocations.length > 0 && (selected.state === 'not-sent' || selected.state === 'needs-update')
  const awaitingReply = selected.state === 'sent' || selected.state === 'constraint'
  const sms = smsSegments(draft)
  const pending = rows.filter((r) => (r.state === 'not-sent' || r.state === 'needs-update') && r.allocations.length)

  function sendAll() {
    sendInstructions(pending.map((r) => { const lang = languageFor(r.farmer.preferredLanguage); return { farmerId: r.farmer.id, channel, language: lang, text: composeInstruction(r.farmer.name.split(' ')[0], r.allocations, result.plans, lang, channel, r.state === 'needs-update') } }))
  }

  function reply(input: ReplyInput, text: string) {
    const change = recordReply(selected.farmer.id, input, text, channel, language)
    setLastChange(change ?? { id: 'ok', at: new Date().toISOString(), title: `${selected.farmer.name} confirmed`, details: ['Their planned supply now counts as farmer-confirmed.'] })
    setReplyMode('none'); setNote('')
  }

  return <div className="m-page">
    <header className="m-pagehead">
      <div><div className="m-eyebrow">Step 5 · Farmer communication</div><h1 className="m-h1">Planting instructions</h1><p className="m-lead">Each farmer gets one short message with what to plant, where and when – in their language. Their reply goes straight back into the plan.</p></div>
      <div className="m-pagehead-actions">{pending.length > 0 && <button type="button" className="m-btn m-btn-primary" onClick={sendAll}><Send size={17} /> Send to {pending.length} pending</button>}</div>
    </header>
    <div className="m-alert m-alert-info"><Info size={18} style={{ flex: 'none', marginTop: 1 }} /><span>Simulation: nothing is sent to a real phone. Use “Simulate farmer reply” to see how responses change the plan. Hindi and Marathi texts are template drafts – have field staff review them before real use.</span></div>

    <div className="m-msg-layout">
      <section className="m-card m-card-tight" aria-label="Farmers in plan">
        <div className="m-farmer-list" role="list">
          {rows.map((r) => <button type="button" role="listitem" key={r.farmer.id} className="m-farmer-item" aria-current={r.farmer.id === selected.farmer.id} onClick={() => setSelectedId(r.farmer.id)}>
            <span className="m-avatar">{initials(r.farmer.name)}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong>{r.farmer.name}</strong>
              <span className="m-small">{r.allocations.length ? r.allocations.map((a) => `${a.crop} ${fmtAcres(a.acres)}`).join(' · ') : 'No longer in plan'}</span>
              <span style={{ display: 'block', marginTop: 4 }}><ReplyBadge state={r.state} /></span>
            </span>
          </button>)}
        </div>
      </section>

      <section className="m-stack">
        <div className="m-card">
          <div className="m-card-head" style={{ marginBottom: 14 }}>
            <div><h2 className="m-h3">{selected.farmer.name}</h2><p className="m-sub"><Phone size={13} style={{ verticalAlign: '-2px' }} /> {selected.farmer.phone} · {selected.farmer.village} · prefers {selected.farmer.preferredLanguage}</p></div>
            <ReplyBadge state={selected.state} />
          </div>
          <div className="m-row" style={{ marginBottom: 16 }}>
            <div className="m-seg" role="group" aria-label="Channel">{(['WhatsApp', 'SMS'] as Channel[]).map((c) => <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)}>{c === 'WhatsApp' ? <MessageSquareText size={14} style={{ verticalAlign: '-2px' }} /> : <Smartphone size={14} style={{ verticalAlign: '-2px' }} />} {c}</button>)}</div>
            <div className="m-seg" role="group" aria-label="Language">{languages.map((l) => <button key={l.id} type="button" aria-pressed={language === l.id} onClick={() => setLanguage(l.id)}>{l.label}</button>)}</div>
          </div>

          <div className={`m-phone ${channel === 'SMS' ? 'sms' : ''}`}>
            <div className="m-phone-top"><span className="m-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(selected.farmer.name)}</span><div><strong>{selected.farmer.name}</strong><span>{channel} · from {FPO_NAME}</span></div></div>
            <div className="m-thread" ref={threadRef}>
              {thread.map((m) => <div key={m.id} className={`m-bubble ${m.direction}`}>{m.text}<time>{time(m.at)}{m.direction === 'out' ? ` · ${m.channel}` : ''}</time></div>)}
              {canSend && <div className="m-bubble draft">{draft}</div>}
              {!thread.length && !canSend && <p className="m-thread-empty">No messages yet.</p>}
            </div>
          </div>
          {canSend && channel === 'SMS' && <p className="m-small" style={{ textAlign: 'center', margin: '8px 0 0' }}>{sms.chars} characters · {sms.segments} SMS segment{sms.segments > 1 ? 's' : ''}{sms.unicode ? ' (Unicode)' : ''}</p>}
          <div className="m-row" style={{ justifyContent: 'center', marginTop: 16 }}>
            {canSend && <button type="button" className="m-btn m-btn-primary" onClick={() => sendInstructions([{ farmerId: selected.farmer.id, text: draft, channel, language }])}><Send size={17} /> {selected.state === 'needs-update' ? 'Send updated plan' : `Send ${channel} (simulated)`}</button>}
            {!selected.allocations.length && selected.state !== 'declined' && <p className="m-small">{selected.farmer.name} is no longer assigned in the current plan.</p>}
          </div>
        </div>

        {awaitingReply && <div className="m-card">
          <h2 className="m-h3">Simulate farmer reply</h2>
          <p className="m-sub" style={{ marginBottom: 14 }}>Pick what {firstName} replies. Meraki records it and rebalances the plan.</p>
          <div className="m-reply-grid">
            <button type="button" className="m-reply-btn" onClick={() => reply({ status: 'confirmed' }, replyText.confirmed)}><strong><CheckCircle2 size={16} color="var(--good)" /> 1 · Will plant</strong><span>Counts as farmer-confirmed supply</span></button>
            <button type="button" className="m-reply-btn" onClick={() => reply({ status: 'declined' }, replyText.declined)}><strong><X size={16} color="var(--bad)" /> 2 · Not this season</strong><span>Their land is reassigned to others</span></button>
            <button type="button" className="m-reply-btn" aria-pressed={replyMode === 'constraint'} onClick={() => setReplyMode(replyMode === 'constraint' ? 'none' : 'constraint')}><strong><AlertTriangle size={16} color="var(--warn)" /> 3 · Report a problem</strong><span>Land, water or timing</span></button>
          </div>
          {replyMode === 'constraint' && <form className="m-stack" style={{ marginTop: 16 }} onSubmit={(e) => { e.preventDefault(); reply({ status: 'constraint', kind, note: note.trim() || constraintOptions.find((c) => c.id === kind)!.label, availableAcres: kind === 'land' ? Math.max(0, Number(acres) || 0) : undefined }, `${replyText[kind]}${note.trim() ? ` – ${note.trim()}` : ''}${kind === 'land' ? ` (${acres} acre)` : ''}`) }}>
            <div className="m-form-grid">
              <label className="m-field">Problem<select className="m-select" value={kind} onChange={(e) => setKind(e.target.value as ConstraintKind)}>{constraintOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><small>{constraintOptions.find((c) => c.id === kind)!.hint}</small></label>
              {kind === 'land' ? <label className="m-field">Acres the farmer can still plant<input className="m-input" type="number" min={0} step={0.25} value={acres} onChange={(e) => setAcres(e.target.value)} /><small>Currently assigned: {fmtAcres(selected.allocations.reduce((s, a) => s + a.acres, 0))}</small></label>
                : <label className="m-field">Farmer’s note (optional)<input className="m-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. well is drying up" /></label>}
            </div>
            <div><button type="submit" className="m-btn m-btn-primary m-btn-sm">Record reply</button></div>
          </form>}
        </div>}

        {lastChange && <div className="m-alert m-alert-good" role="status"><CheckCircle2 size={18} style={{ flex: 'none', marginTop: 2 }} /><div><strong>Plan updated: {lastChange.title}</strong><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{lastChange.details.map((d) => <li key={d}>{d}</li>)}</ul><Link to="/plan" className="m-link" style={{ marginTop: 6 }}>Review the plan</Link></div></div>}
      </section>
    </div>
  </div>
}
