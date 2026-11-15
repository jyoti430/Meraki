import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, Plus, Sprout, UsersRound } from 'lucide-react'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { runPlan } from '../planning/engine'
import { fmtDay } from '../planning/format'
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

export function FarmerWorkspace({ only }: { only?: string[] }) {
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
  const [lastChange, setLastChange] = useState<PlanChange | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (selected) setLanguage(languageFor(selected.farmer.preferredLanguage)); setReplyMode('none'); setLastChange(null) }, [selected?.farmer.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const thread = messages.filter((m) => m.farmerId === selected?.farmer.id)
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) }, [thread.length, selected?.farmer.id])

  if (!selected) return <p className="m-small">No farmers in this group.</p>

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

  return <div className="m-stack">
    <div className="m-row" style={{ justifyContent: 'space-between' }}>
      <p className="m-small" style={{ margin: 0 }}>Simulation: nothing reaches a real phone. Hindi and Marathi texts are template drafts – have field staff review them.</p>
      {pending.length > 0 && <button type="button" className="m-btn m-btn-primary m-btn-sm" style={{ borderRadius: 10 }} onClick={sendAll}><Send size={16} /> Send to {pending.length} pending</button>}
    </div>
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

type Bucket = 'confirmed' | 'follow-up' | 'constraint' | 'waiting'

export default function Messages() {
  const { result, responses, messages, sendInstructions, scenario, exclusions } = usePlan()
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

  const involved = [...new Set([...result.farmersInvolved, ...Object.keys(responses).filter((id) => responses[id].status !== 'not-sent')])]
  const stateOf = (id: string) => replyStateFor(id, responses, result.allocations)
  const contacted = involved.filter((id) => responses[id] && responses[id].status !== 'not-sent')
  const confirmedN = contacted.filter((id) => stateOf(id) === 'confirmed').length
  const waitingN = contacted.filter((id) => stateOf(id) === 'sent').length
  const villages = new Set(contacted.map((id) => data.farmers.find((f) => f.id === id)?.village)).size
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)

  const before = useMemo(() => runPlan({ orders, data, scenario, responses: {}, exclusions }), [orders, data, scenario, exclusions])

  if (!camp) return <div className="m-page"><PageHeader title="Farmer messages" subtitle="Plan, send, and track planting updates with your farmers via SMS or WhatsApp." /><Link to="/plan" className="m-btn m-btn-primary" style={{ alignSelf: 'flex-start' }}>Open planting plan</Link></div>

  const campFarmers = [...new Set(camp.allocations.map((a) => a.farmerId))]
  const bucketOf = (id: string): Bucket => { const st = stateOf(id); return st === 'confirmed' ? 'confirmed' : st === 'constraint' ? 'constraint' : st === 'sent' ? 'waiting' : 'follow-up' }
  const counts: Record<Bucket, number> = { confirmed: 0, 'follow-up': 0, constraint: 0, waiting: 0 }
  campFarmers.forEach((id) => { counts[bucketOf(id)] += 1 })
  const campStatus = (p: typeof camp) => { const ids = [...new Set(p.allocations.map((a) => a.farmerId))]; const st = ids.map(stateOf); return st.every((x) => x === 'not-sent') ? 'Draft' : st.some((x) => x === 'sent' || x === 'not-sent' || x === 'needs-update') ? 'Active' : 'Completed' }
  const lastSent = (p: typeof camp) => { const ids = new Set(p.allocations.map((a) => a.farmerId)); return messages.filter((m) => m.direction === 'out' && ids.has(m.farmerId)).sort((a, b) => b.at.localeCompare(a.at))[0] }
  const sample = data.farmers.find((f) => f.id === campFarmers[0])!
  const sampleText = composeInstruction(sample.name.split(' ')[0], result.allocations.filter((a) => a.farmerId === sample.id && a.crop === camp.crop.name), result.plans, language, channel, false)
  const pendingIds = campFarmers.filter((id) => { const st = stateOf(id); return st === 'not-sent' || st === 'needs-update' })

  function sendCampaign() {
    if (!pendingIds.length) { window.alert('Every farmer in this campaign already has the current plan.'); return }
    sendInstructions(pendingIds.map((id) => { const f = data.farmers.find((x) => x.id === id)!; const lang = languageFor(f.preferredLanguage); return { farmerId: id, channel, language: lang, text: composeInstruction(f.name.split(' ')[0], result.allocations.filter((a) => a.farmerId === id), result.plans, lang, channel, stateOf(id) === 'needs-update') } }))
  }
  const openWorkspace = (b: Bucket | null) => { setBucket(b); setShowFarmers(true); window.setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }

  const bPlan = before.plans.find((p) => p.crop.id === camp.crop.id)
  const bFarmers = new Set(bPlan?.allocations.map((a) => a.farmerId) ?? [])
  const declined = [...bFarmers].filter((id) => responses[id]?.status === 'declined').length
  const confirmedKg = camp.allocations.filter((a) => stateOf(a.farmerId) === 'confirmed').reduce((s, a) => s + a.kg, 0)
  const rows: { id: Bucket; label: string; icon: JSX.Element; cls: string }[] = [
    { id: 'confirmed', label: 'Confirmed', icon: <CheckCircle2 size={20} />, cls: '' },
    { id: 'follow-up', label: 'Needs follow-up', icon: <Clock3 size={20} />, cls: 'warn' },
    { id: 'constraint', label: 'Constraint reported', icon: <AlertTriangle size={20} />, cls: 'bad' },
    { id: 'waiting', label: 'No response yet', icon: <UsersRound size={20} />, cls: '' },
  ]

  return <div className="m-page">
    <PageHeader title="Farmer messages" subtitle="Plan, send, and track planting updates with your farmers via SMS or WhatsApp." />

    <section className="m-stats three" aria-label="Messaging summary">
      <StatCard icon={<UsersRound size={24} />} label="Farmers contacted" tip="Farmers who have received planting instructions" value={contacted.length} sub={<>of {involved.length} in the plan · {villages} villages</>} />
      <StatCard icon={<Sprout size={24} />} label="Confirmed participation" tip="Farmers who replied 1 to the current plan" value={confirmedN} sub={<><span className="m-up">↗ {pct(confirmedN, contacted.length)}%</span> of contacted farmers</>} />
      <StatCard icon={<AlertTriangle size={24} />} tone="warn" label="Pending responses" tip="Messaged farmers who haven't replied yet" value={waitingN} sub={<>≈ {pct(waitingN, contacted.length)}% of contacted farmers</>} />
    </section>

    <div className="m-cols-even m-cols-msg">
      <section className="m-panel" aria-labelledby="camp-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="camp-title">Message campaigns</h2><p className="m-panel-sub">All planting communications for this season.</p></div>
          <button type="button" className="m-btn m-btn-secondary m-btn-sm" style={{ borderRadius: 10, background: '#e5f1de' }} onClick={sendCampaign}><Plus size={17} />New message</button>
        </div>
        <div>{campaigns.map((p) => {
          const st = campStatus(p); const last = lastSent(p)
          return <button type="button" key={p.crop.id} className="m-camp" aria-current={p.crop.id === camp.crop.id} onClick={() => { setCropId(p.crop.id); setBucket(null) }}>
            <span className="m-roundico" style={{ width: 44, height: 44 }}><Sprout size={22} /></span>
            <span style={{ minWidth: 0 }}><strong>{p.crop.name} planting plan</strong><span className="m-small">{last ? `Sent ${fmtDay(last.at.slice(0, 10))} · ${last.channel}` : `${new Set(p.allocations.map((a) => a.farmerId)).size} farmer${new Set(p.allocations.map((a) => a.farmerId)).size === 1 ? '' : 's'} · not sent yet`}</span></span>
            <span className={`m-camp-pill ${st === 'Active' ? 'active' : st === 'Draft' ? 'draft' : ''}`}>{st}</span><ArrowRight size={18} />
          </button>
        })}</div>
      </section>

      <section className="m-panel" aria-labelledby="prev-title">
        <div className="m-panel-head">
          <div><h2 className="m-panel-title" id="prev-title">Message preview &amp; responses</h2><p className="m-panel-sub">The {camp.crop.name.toLowerCase()} message and farmers’ latest responses.</p></div>
          <div className="m-row">
            <span className="m-select-pill">{channel === 'WhatsApp' ? <MessageSquareText size={18} color="#25a244" /> : <Smartphone size={18} />}<select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="Channel"><option>WhatsApp</option><option>SMS</option></select></span>
            <span className="m-select-pill"><select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label="Language">{languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></span>
          </div>
        </div>
        <div className="m-cols-even m-cols-preview">
          <div className={`m-wa ${channel === 'SMS' ? 'sms' : ''}`}>
            <span className="m-wa-date">{lastSent(camp) ? fmtDay(lastSent(camp)!.at.slice(0, 10)) : 'Draft'}</span>
            <div className="m-wa-bubble">{sampleText}<time>{lastSent(camp) ? new Date(lastSent(camp)!.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : 'not sent'}{channel === 'WhatsApp' && lastSent(camp) ? ' ✓✓' : ''}</time></div>
            <span className="m-small" style={{ fontSize: 12 }}>Example for {sample.name}; each farmer gets their own plot, area and language.</span>
          </div>
          <div>
            <h3 className="m-h3" style={{ marginBottom: 6 }}>Farmer responses ({campFarmers.length})</h3>
            {rows.map((r) => <button type="button" key={r.id} className="m-resp" aria-pressed={showFarmers && bucket === r.id} onClick={() => openWorkspace(r.id)}>
              <span className={`m-roundico ${r.cls}`} style={{ width: 34, height: 34 }}>{r.icon}</span>{r.label}<b>{counts[r.id]}</b><em>{pct(counts[r.id], campFarmers.length)}%</em><ArrowRight size={16} />
            </button>)}
            <button type="button" className="m-btn m-btn-secondary" style={{ width: '100%', marginTop: 14, borderRadius: 12, background: '#e5f1de', justifyContent: 'space-between' }} onClick={() => openWorkspace(null)}><span className="m-row" style={{ gap: 10, flexWrap: 'nowrap' }}><MessageSquareText size={18} />View farmer-wise responses</span><ArrowRight size={18} /></button>
          </div>
        </div>
      </section>
    </div>

    {showFarmers && <section className="m-panel" ref={workspaceRef} aria-labelledby="fw-title" style={{ scrollMarginTop: 16 }}>
      <div className="m-panel-head"><div><h2 className="m-panel-title sm" id="fw-title">Farmer-wise responses{bucket ? ` · ${rows.find((r) => r.id === bucket)?.label}` : ''}</h2><p className="m-panel-sub">Send or resend each farmer’s instructions and simulate their reply.</p></div>
        <div className="m-row">{bucket && <button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setBucket(null)}>Show all farmers</button>}<button type="button" className="m-btn m-btn-ghost m-btn-sm" onClick={() => setShowFarmers(false)}>Close</button></div></div>
      <FarmerWorkspace key={`${bucket ?? 'all'}`} only={bucket ? campFarmers.filter((id) => bucketOf(id) === bucket) : undefined} />
    </section>}

    <section className="m-panel" aria-labelledby="flow-title">
      <div className="m-row" style={{ gap: 14, marginBottom: 16, flexWrap: 'nowrap' }}><span className="m-roundico" style={{ width: 48, height: 48 }}><Sprout size={24} /></span><div><h2 className="m-panel-title sm" id="flow-title">How responses update the planting plan</h2><p className="m-panel-sub">Farmer confirmations and constraints automatically adjust the season plan.</p></div></div>
      <div className="m-flow">
        <div className="m-flowcard"><span className="m-roundico"><CalendarDays size={20} /></span><div><strong>Plan (before responses)</strong><strong className="big">{camp.crop.name}: {fmtT(bPlan?.expectedKg ?? 0)}</strong><span className="m-small">({bFarmers.size} farmer{bFarmers.size === 1 ? '' : 's'}, {(bPlan?.plannedAcres ?? 0).toFixed(1)} acres)</span></div></div>
        <span className="arrow" style={{ textAlign: 'center' }}><ArrowRight size={26} /></span>
        <div className="m-flowcard"><span className="m-roundico"><Sprout size={20} /></span><div><strong>Updated plan (after responses)</strong><strong className="big">{camp.crop.name}: {fmtT(camp.expectedKg)}</strong><span className="m-small">({campFarmers.length} farmer{campFarmers.length === 1 ? '' : 's'}, {camp.plannedAcres.toFixed(1)} acres)</span></div></div>
        <div><strong style={{ display: 'block', marginBottom: 8 }}>What changed</strong>
          <ul className="m-changed">
            <li><CheckCircle2 size={17} color="var(--good)" />+{counts.confirmed} farmers confirmed ({fmtT(confirmedKg)})</li>
            <li><AlertTriangle size={17} color="var(--bad)" />{counts.constraint} reported constraints{declined ? `, ${declined} declined` : ''} ({camp.expectedKg - (bPlan?.expectedKg ?? 0) >= 0 ? '+' : '−'}{fmtT(Math.abs(camp.expectedKg - (bPlan?.expectedKg ?? 0)))})</li>
            <li><Clock3 size={17} color="var(--warn)" />{counts['follow-up'] + counts.waiting} need follow-up (to confirm)</li>
            <li><Sprout size={17} color="var(--forest)" />{bFarmers.size !== campFarmers.length || Math.abs(camp.expectedKg - (bPlan?.expectedKg ?? 0)) > 0 ? 'Plan updated automatically' : 'No changes from responses yet'}</li>
          </ul>
        </div>
      </div>
    </section>
  </div>
}
