import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, auctionRequest, money, priceToPaise } from '../services/auctionApi'
import type { Account, Auction, Capacity } from '../services/auctionApi'
import '../styles/auctions.css'

const storageKey = 'meraki-auction-session-v1'
function restored(): Account | null {
  try { const a = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); return a?.access_token && a?.organisation_id && ['fpo', 'exporter'].includes(a.role) ? a : null } catch { return null }
}
const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export default function Auctions() {
  const [account, setAccount] = useState<Account | null>(restored)
  const [register, setRegister] = useState(false)
  const [items, setItems] = useState<Auction[]>([])
  const [capacities, setCapacities] = useState<Capacity[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  // Retain the same request key for an uncertain network retry of identical content.
  const retry = useRef<{ payload: string; key: string } | null>(null)
  const active = items.find(item => item.id === selected)
  function saveAccount(value: Account | null) {
    retry.current = null; setCapacities([]); setShowCreate(false); setAccount(value); setItems([]); setSelected(null); setLoaded(false)
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey)
  }
  const refresh = useCallback(async () => {
    if (!account) return
    try {
      const data = await auctionRequest<{ items: Auction[] }>('/auctions', account)
      setItems(data.items); setLoaded(true)
      if (account.role === 'fpo') {
        const data = await auctionRequest<{ items: Capacity[] }>('/auction-capacities', account)
        setCapacities(data.items)
      }
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) saveAccount(null)
      setError(cause instanceof Error ? cause.message : 'Could not load auctions. Use Refresh to retry.')
    }
  }, [account])
  useEffect(() => { void refresh(); if (!account) return; const id = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(id) }, [refresh, account])
  async function run(operation: () => Promise<void>) {
    setPending(true); setError(''); setNotice('')
    try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed. Retry the same action.') } finally { setPending(false) }
  }
  async function mutate<T>(path: string, body: unknown): Promise<T> {
    const payload = JSON.stringify({ path, body })
    if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() }
    try {
      const result = await auctionRequest<T>(path, account, body, retry.current.key)
      retry.current = null
      return result
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500 && ![408, 429].includes(cause.status)) retry.current = null
      throw cause
    }
  }
  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    void run(async () => {
      const data = { username: f.get('username'), password: f.get('password'), ...(register ? { display_name: f.get('display_name'), organisation_name: f.get('organisation_name'), role: f.get('role') } : {}) }
      saveAccount(await auctionRequest<Account>(register ? '/auth/register' : '/auth/login', null, data))
    })
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    void run(async () => {
      const quantity = Number(f.get('quantity')) * 1000
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Enter kilograms with at most three decimal places.')
      const body = {
        title: f.get('title'), mode: account?.role === 'fpo' ? 'spot' : 'forward',
        crop: f.get('crop'), variety: f.get('variety'), grade: f.get('grade'), quantity_g: quantity,
        week_start: f.get('week_start'), week_end: f.get('week_end'), limit_price: priceToPaise(String(f.get('limit_price'))), increment: priceToPaise(String(f.get('increment'))),
        opens_at: new Date(String(f.get('opens_at'))).toISOString(), closes_at: new Date(String(f.get('closes_at'))).toISOString(),
        ...(account?.role === 'fpo' ? { capacity_id: f.get('capacity_id') } : { eligible_org_ids: String(f.get('eligible')).split(',').map(s => s.trim()).filter(Boolean) }),
        terms: { handover: f.get('handover'), acceptance: f.get('acceptance'), payment: f.get('payment'), cancellation: f.get('cancellation'), evidence_reference: f.get('evidence_reference'), evidence_status: f.get('evidence_status'), fee_paise_per_kg: 0 },
      }
      const result = await mutate<Auction>('/auctions', body)
      setShowCreate(false); setSelected(result.id); setNotice('Auction published. Its terms and bidding rules are now fixed.'); await refresh()
    })
  }
  function bid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    if (!active) return
    void run(async () => {
      const result = await mutate<{ receipt: { id: string; accepted_at: string } }>(`/auctions/${active.id}/bids`, { price: priceToPaise(String(f.get('price'))), accept_terms: true, ...(active.mode === 'forward' ? { capacity_id: f.get('capacity_id') } : {}) })
      setNotice(`Bid accepted at ${dateTime(result.receipt.accepted_at)}. Receipt: ${result.receipt.id}`); await refresh()
    })
  }
  const field = (label: string, name: string, type = 'text', extra: Record<string, string | number> = {}) => <label>{label}<input name={name} type={type} required {...extra} /></label>
  return <div className="a-workspace">
    <div className="a-heading"><div><h1>Crop auctions</h1><p>Whole-lot sales and prequalified forward procurement.</p></div><Link to={account?.role === 'exporter' ? '/exporter' : '/fpo'}>Back to workspace</Link></div>
    <p className="a-context">This workspace uses the shared database. Planning pages elsewhere still contain their labelled demo data. No emails or payments are sent. Real harvested-lot trading stays disabled until the QC bridge is verified.</p>
    {error && <div className="a-error" role="alert">{error}</div>}{notice && <div className="a-notice" role="status">{notice}</div>}
    {!account ? <section className="a-panel a-login"><h2>{register ? 'Create an organisation account' : 'Sign in to auctions'}</h2><p>Use a username and password. Creating an account creates a separate organisation; it does not join an existing one.</p>
      <form onSubmit={signIn}><div className="a-fields">{field('Username', 'username', 'text', { minLength: 3, maxLength: 60, autoComplete: 'username', pattern: '[a-zA-Z0-9_.-]+' })}{field('Password', 'password', 'password', { minLength: 10, maxLength: 128, autoComplete: register ? 'new-password' : 'current-password' })}
        {register && <>{field('Your name', 'display_name', 'text', { maxLength: 100 })}{field('Organisation name', 'organisation_name', 'text', { minLength: 2, maxLength: 150 })}<label>Organisation type<select name="role"><option value="fpo">FPO · sell crops</option><option value="exporter">Exporter · buy crops</option></select></label></>}
      </div><button disabled={pending} type="submit">{pending ? 'Connecting…' : register ? 'Create account' : 'Sign in'}</button></form><button className="a-secondary" disabled={pending} onClick={() => setRegister(!register)}>{register ? 'Use an existing account' : 'Create an account'}</button></section> : <>
      <div className="a-toolbar"><span>Signed in as {account.role.toUpperCase()} · <span className="a-id">Organisation {account.organisation_id}</span></span><div><button className="a-secondary" disabled={pending} onClick={() => void run(refresh)}>Refresh</button><button disabled={pending} onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Close form' : account.role === 'fpo' ? 'Sell a harvested lot' : 'Request future supply'}</button><button className="a-secondary" disabled={pending} onClick={() => void run(async () => { await auctionRequest('/auth/logout', account, {}); saveAccount(null) })}>Sign out</button></div></div>
      {showCreate && <section className="a-panel"><h2>{account.role === 'fpo' ? 'Publish a whole-lot sale' : 'Publish forward procurement'}</h2><p>Prices include the agreed handover basis. Whole-lot awards only. Valid late bids extend closing by 2 minutes, up to 10 minutes total. Confirmation expires after 24 hours.</p><form onSubmit={create}><div className="a-fields">
        {field('Auction title', 'title', 'text', { minLength: 3, maxLength: 200 })}{field('Crop', 'crop')}{field('Variety', 'variety')}{field('Grade', 'grade')}{field('Whole-lot quantity (kg)', 'quantity', 'number', { min: 0.001, step: 0.001 })}
        {account.role === 'fpo' ? <label>Reviewed harvested capacity<select name="capacity_id" required><option value="">Choose capacity</option>{capacities.filter(c => c.reviewed && c.source_type === 'harvested_lot').map(c => <option key={c.id} value={c.id}>{c.crop} · {c.variety} · {c.grade} · {(c.quantity_g - c.reserved_g - c.committed_g) / 1000} kg</option>)}</select><small>Spot lots currently use explicit development fixtures; real QC linkage remains gated.</small></label> : field('Prequalified FPO organisation IDs (comma separated)', 'eligible')}
        {field('First delivery date', 'week_start', 'date')}{field('Last delivery date', 'week_end', 'date')}{field(account.role === 'fpo' ? 'Reserve (₹/kg)' : 'Maximum quote (₹/kg)', 'limit_price', 'number', { min: 0.01, step: 0.01 })}{field('Minimum price step (₹/kg)', 'increment', 'number', { min: 0.01, step: 0.01 })}{field('Opens at (your local time)', 'opens_at', 'datetime-local')}{field('Closes at (your local time)', 'closes_at', 'datetime-local')}
        {field('Handover location and price inclusions', 'handover', 'text', { minLength: 3, maxLength: 300 })}{field('Quality acceptance protocol', 'acceptance', 'text', { minLength: 3, maxLength: 1000 })}{field('Payment terms', 'payment', 'text', { minLength: 3, maxLength: 1000 })}{field('Cancellation and default terms', 'cancellation', 'text', { minLength: 3, maxLength: 1000 })}{field('Evidence / production plan reference', 'evidence_reference', 'text', { minLength: 3, maxLength: 200 })}<label>Evidence status<select name="evidence_status"><option value="synthetic">Synthetic demonstration</option><option value="reviewed">Reviewed evidence</option></select></label>
      </div><button disabled={pending} type="submit">{pending ? 'Publishing…' : 'Publish fixed terms'}</button></form></section>}
      <div className="a-columns"><section className="a-panel"><h2>Market board</h2>{!loaded ? <p role="status">Loading auctions…</p> : !items.length ? <p>No auctions yet. Publish a lot or procurement request to begin.</p> : <ul className="a-list">{items.map(item => <li key={item.id}><button className={`a-list-item ${selected === item.id ? 'a-selected' : ''}`} onClick={() => setSelected(item.id)}><span><strong>{item.title}</strong><small>{item.mode === 'spot' ? 'Highest eligible price' : 'Lowest eligible quote'} · {item.terms.evidence_status}</small></span><span>{item.status}<small>{item.leading_price === null ? 'No bids' : `${money(item.leading_price)}/kg`}</small></span></button></li>)}</ul>}</section>
        <section className="a-panel">{!active ? <><h2>Auction details</h2><p>Select an auction to review its terms, place a bid, or confirm an award.</p></> : <><h2>{active.title}</h2><p>{active.crop} · {active.variety} · {active.grade} · {(active.quantity_g / 1000).toLocaleString()} kg</p><p><strong>{active.status}</strong> · {active.bid_count} accepted bids · {active.terms.evidence_status}</p><dl className="a-facts"><dt>Delivery</dt><dd>{active.week_start} to {active.week_end}</dd><dt>Opens</dt><dd>{dateTime(active.opens_at)}</dd><dt>Closes</dt><dd>{dateTime(active.closes_at)}</dd><dt>Server updated</dt><dd>{dateTime(active.server_time)}</dd><dt>{active.mode === 'spot' ? 'Reserve' : 'Maximum quote'}</dt><dd>{money(active.limit_price)}/kg</dd><dt>Leading price</dt><dd>{active.leading_price === null ? 'No bids' : `${money(active.leading_price)}/kg`}</dd><dt>Minimum step</dt><dd>{money(active.increment)}/kg</dd><dt>Handover</dt><dd>{active.terms.handover}</dd><dt>Acceptance</dt><dd>{active.terms.acceptance}</dd><dt>Payment</dt><dd>{active.terms.payment}</dd><dt>Cancellation</dt><dd>{active.terms.cancellation}</dd><dt>Evidence</dt><dd>{active.terms.evidence_reference}</dd><dt>Disclosed fee</dt><dd>{money(active.terms.fee_paise_per_kg)}/kg</dd></dl><p className="a-small">{active.rule_version} · Whole lot. Last {active.extension_window_s}s: extend {active.extension_s}s per improving bid, capped at {active.extension_cap_s}s. The server accepts bids and determines closure. Refreshes every 5 seconds.</p>
          {active.status === 'open' && !active.is_owner && active.eligible && account.role === (active.mode === 'spot' ? 'exporter' : 'fpo') && <form key={active.id} onSubmit={bid}><div className="a-fields">{field('Your offer (₹/kg)', 'price', 'number', { min: 0.01, step: 0.01 })}{active.mode === 'forward' && <label>Reviewed production capacity<select name="capacity_id" required><option value="">Choose a projection</option>{active.own_capacity_id && !capacities.some(c => c.id === active.own_capacity_id) && <option value={active.own_capacity_id}>Your held capacity · {active.own_capacity_id}</option>}{capacities.filter(c => c.reviewed && c.source_type === 'projection').map(c => <option key={c.id} value={c.id}>{c.crop} · {c.variety} · {c.grade} · {c.id}</option>)}</select></label>}</div><label className="a-check"><input type="checkbox" required /> I accept the published terms and whole-lot quantity.</label><button disabled={pending} type="submit">{pending ? 'Submitting…' : 'Submit bid'}</button></form>}
          {active.status === 'open' && <div className="a-actions"><button className="a-secondary" disabled={pending} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/close`, {}); await refresh() })}>Check server closure</button>{active.is_owner && active.bid_count === 0 && <button className="a-secondary" disabled={pending} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/cancel`, {}); await refresh() })}>Cancel auction</button>}</div>}
          {active.award && <div className="a-award"><h3>Your {active.award.status} award</h3><p>Buyer: {active.award.buyer_confirmed ? 'confirmed' : 'pending'} · Seller: {active.award.seller_confirmed ? 'confirmed' : 'pending'}. Confirm by {dateTime(active.award.expires_at)}.</p>{active.award.status === 'provisional' && <div className="a-actions">{!active.award[`${active.award.your_side}_confirmed`] && <button disabled={pending} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'confirm' }); await refresh() })}>Confirm agreed terms</button>}<button className="a-secondary" disabled={pending} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'decline' }); await refresh() })}>Decline award</button></div>}</div>}
        </>}</section></div>
    </>}
  </div>
}
