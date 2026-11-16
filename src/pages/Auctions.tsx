import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, auctionRequest, money, priceToPaise, validateAuction, validateAuctionCapabilities, validateAuctionList, validateBidReceipt, validateCapacityList } from '../services/auctionApi'
import type { Auction, AuctionCapabilities, Capacity } from '../services/auctionApi'
import { decimalToInteger } from '../trade/calculations'
import '../styles/auctions.css'
import { useAuth } from '../auth/context'

const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export default function Auctions({ embedded = false }: { embedded?: boolean }) {
  const { account, session } = useAuth()
  const [items, setItems] = useState<Auction[]>([])
  const [capacities, setCapacities] = useState<Capacity[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [capabilities, setCapabilities] = useState<AuctionCapabilities | null>(null)
  const [fresh, setFresh] = useState(false)
  const accountRef = useRef(account)
  const identity = useRef(0)
  const readGeneration = useRef(0)
  const operationGeneration = useRef(0)
  const busy = useRef(false)
  const refreshing = useRef(false)
  const receivedAt = useRef(0)
  const capabilitiesRef = useRef(capabilities)
  // Retain the same request key for an uncertain network retry of identical content.
  const retry = useRef<{ payload: string; key: string } | null>(null)
  const active = items.find(item => item.id === selected)
  const authEnabled = capabilities?.password_auth_enabled === true
  const writesEnabled = fresh && !pending && authEnabled && capabilities?.auction_mutations_enabled === true
  const refresh = useCallback(async () => {
    const actor = accountRef.current
    const epoch = identity.current
    const request = ++readGeneration.current
    receivedAt.current = 0; refreshing.current = true; setFresh(false)
    let healthRead = false
    try {
      const service = validateAuctionCapabilities(await auctionRequest<unknown>('/health', null))
      if (request !== readGeneration.current || epoch !== identity.current) return
      capabilitiesRef.current = service; setCapabilities(service)
      healthRead = true
      if (!actor) return
      const [board, supply] = await Promise.all([
        auctionRequest<unknown>('/auctions?limit=200', actor),
        actor.role === 'fpo' ? auctionRequest<unknown>('/auction-capacities', actor) : Promise.resolve({ items: [] }),
      ])
      const auctions = validateAuctionList(board), capacity = validateCapacityList(supply)
      if (request !== readGeneration.current || epoch !== identity.current) return
      setItems(auctions); setCapacities(capacity); setLoaded(true); setError(''); receivedAt.current = Date.now(); setFresh(true)
    } catch (cause) {
      if (request !== readGeneration.current || epoch !== identity.current) return
      if (!healthRead) { capabilitiesRef.current = null; setCapabilities(null) }
      if (cause instanceof ApiError && cause.status === 401) session.invalidate()
      setError(cause instanceof Error ? cause.message : 'Could not load auctions. Use Refresh to retry.')
      throw cause
    } finally {
      if (request === readGeneration.current) refreshing.current = false
    }
  }, [session])
  useEffect(() => {
    void refresh().catch(() => {})
    const id = window.setInterval(() => { if (!busy.current && !refreshing.current && document.visibilityState === 'visible') void refresh().catch(() => {}) }, 5000)
    return () => window.clearInterval(id)
  }, [refresh, account])
  useEffect(() => () => { identity.current += 1; readGeneration.current += 1; operationGeneration.current += 1 }, [])
  async function run(operation: () => Promise<void>) {
    if (busy.current) return
    const request = ++operationGeneration.current
    busy.current = true
    setPending(true); setError(''); setNotice('')
    try { await operation() } catch (cause) {
      if (request === operationGeneration.current) setError(cause instanceof Error ? cause.message : 'Request failed. Retry the same action.')
    } finally {
      if (request === operationGeneration.current) { busy.current = false; setPending(false) }
    }
  }
  async function mutate<T>(path: string, body: unknown): Promise<T> {
    const actor = accountRef.current, epoch = identity.current
    if (!actor || !capabilitiesRef.current?.password_auth_enabled || !capabilitiesRef.current?.auction_mutations_enabled || !receivedAt.current || Date.now() - receivedAt.current > 60_000 || refreshing.current) throw new Error('Load a fresh auction snapshot on an enabled backend before submitting an action.')
    const payload = JSON.stringify({ path, body })
    if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() }
    receivedAt.current = 0; setFresh(false); readGeneration.current += 1
    try {
      const result = await auctionRequest<T>(path, actor, body, retry.current.key)
      if (epoch !== identity.current) throw new Error('The account changed while this action was submitted. Reconnect the previous account and inspect its recorded outcome.')
      if (path.endsWith('/bids')) validateBidReceipt(result); else validateAuction(result)
      retry.current = null
      return result
    } catch (cause) {
      if (epoch !== identity.current) throw new Error('The account changed while this action was submitted. Reconnect the previous account and inspect its recorded outcome.')
      if (cause instanceof ApiError && cause.status > 0 && cause.status < 500 && ![408, 429].includes(cause.status) && cause.code !== 'invalid_response') retry.current = null
      if (cause instanceof ApiError && cause.status === 401) session.invalidate()
      else await refresh().catch(() => {})
      throw cause
    }
  }
  async function refreshSaved() {
    try { await refresh() } catch (cause) { throw new Error('The action was saved, but its refreshed state is unavailable. Refresh before continuing. ' + (cause instanceof Error ? cause.message : '')) }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    void run(async () => {
      const quantity = decimalToInteger(String(f.get('quantity')), 3)
      if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Enter kilograms with at most three decimal places.')
      const body = {
        title: f.get('title'), mode: account?.role === 'fpo' ? 'spot' : 'forward',
        crop: f.get('crop'), variety: f.get('variety'), grade: f.get('grade'), quantity_g: quantity,
        week_start: f.get('week_start'), week_end: f.get('week_end'), limit_price: priceToPaise(String(f.get('limit_price'))), increment: priceToPaise(String(f.get('increment'))),
        opens_at: new Date(String(f.get('opens_at'))).toISOString(), closes_at: new Date(String(f.get('closes_at'))).toISOString(),
        extension_window_s: 120, extension_s: 120, extension_cap_s: 600, confirmation_hours: 24,
        ...(account?.role === 'fpo' ? { capacity_id: f.get('capacity_id') } : { eligible_org_ids: String(f.get('eligible')).split(',').map(s => s.trim()).filter(Boolean) }),
        terms: { handover: f.get('handover'), acceptance: f.get('acceptance'), payment: f.get('payment'), cancellation: f.get('cancellation'), evidence_reference: f.get('evidence_reference'), evidence_status: f.get('evidence_status'), fee_paise_per_kg: 0 },
      }
      const result = validateAuction(await mutate<unknown>('/auctions', body))
      setShowCreate(false); setSelected(result.id); setNotice('Auction published in the shared auction service. Its terms and bidding rules are now fixed.'); await refreshSaved()
    })
  }
  function bid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    if (!active) return
    void run(async () => {
      const result = await mutate<{ receipt: { id: string; accepted_at: string } }>(`/auctions/${active.id}/bids`, { price: priceToPaise(String(f.get('price'))), accept_terms: true, ...(active.mode === 'forward' ? { capacity_id: f.get('capacity_id') } : {}) })
      if (!result.receipt || typeof result.receipt.id !== 'string' || !Number.isFinite(Date.parse(result.receipt.accepted_at))) throw new Error('The bid may be saved, but its receipt response is invalid. Refresh before retrying.')
      setNotice(`Bid accepted at ${dateTime(result.receipt.accepted_at)}. Receipt: ${result.receipt.id}`); await refreshSaved()
    })
  }
  const field = (label: string, name: string, type = 'text', extra: Record<string, string | number> = {}) => <label>{label}<input name={name} type={type} required {...extra} /></label>
  return <div className="a-workspace">
    {!embedded && <div className="a-heading"><div><h1>Shared crop auctions</h1><p>Whole-lot sales and prequalified forward procurement.</p></div><Link to={account?.role === 'exporter' ? '/exporter' : '/fpo'}>Back to planning examples</Link></div>}
    <p className="a-context">These accounts and awards use the shared auction service. Confirming an award here does not create a procurement-workspace contract, shipment or settlement. <Link to="/trade/requirements">Open buyer requirements and partial FPO proposals</Link> or <Link to="/trade">procurement auctions and fulfilment</Link>. Planning examples remain separate. No emails or payments are sent. Real harvested-lot trading stays disabled until the QC bridge is verified.</p>
    {error && <div className="a-error" role="alert">{error}</div>}{notice && <div className="a-notice" role="status">{notice}</div>}
    {!capabilities ? <p role="status">Auction service capabilities are unavailable until a successful health check. Actions are paused.</p> : !authEnabled ? <p className="a-context" role="status">This backend has not enabled password accounts for shared auctions. An operator must configure this workspace before sign-in. The separate <Link to="/trade/requirements">synthetic procurement workspace</Link> remains available where enabled.</p> : !capabilities.auction_mutations_enabled && <p className="a-context" role="status">Auction writes are disabled on this backend. Existing records may be viewed after sign-in; publication, bidding and award decisions remain paused.</p>}
    {account && <>
      <div className="a-toolbar"><span>Signed in as {account.role.toUpperCase()} · <span className="a-id">Organisation {account.organisation_id}</span></span><div><button className="a-secondary" disabled={pending} onClick={() => void run(refresh)}>Refresh</button><button disabled={!writesEnabled} onClick={() => setShowCreate(!showCreate)}>{showCreate ? 'Close form' : account.role === 'fpo' ? 'Sell a synthetic harvested lot' : 'Request future supply'}</button></div></div>
      {!fresh && <p role="status">Loading or refreshing scoped auction records. Displayed records may be stale; actions are paused.</p>}
      {showCreate && <section className="a-panel"><h2>{account.role === 'fpo' ? 'Publish a synthetic whole-lot sale' : 'Publish forward procurement'}</h2><p>Prices include the agreed handover basis. Whole-lot awards only. Valid late bids extend closing by 2 minutes, up to 10 minutes total. This form sets a 24-hour confirmation deadline.</p><form onSubmit={create}><div className="a-fields">
        {field('Auction title', 'title', 'text', { minLength: 3, maxLength: 200 })}{field('Crop', 'crop')}{field('Variety', 'variety')}{field('Grade', 'grade')}{field('Whole-lot quantity (kg)', 'quantity', 'number', { min: 0.001, step: 0.001 })}
        {account.role === 'fpo' ? <label>Reviewed harvested capacity<select name="capacity_id" required><option value="">Choose capacity</option>{capacities.filter(c => c.reviewed && c.source_type === 'harvested_lot').map(c => <option key={c.id} value={c.id}>{c.crop} · {c.variety} · {c.grade} · {(c.quantity_g - c.reserved_g - c.committed_g) / 1000} kg</option>)}</select><small>Spot lots currently use explicit development fixtures; real QC linkage remains gated.</small></label> : field('Prequalified FPO organisation IDs (comma separated)', 'eligible')}
        {field('First delivery date', 'week_start', 'date')}{field('Last delivery date', 'week_end', 'date')}{field(account.role === 'fpo' ? 'Reserve (₹/kg)' : 'Maximum quote (₹/kg)', 'limit_price', 'number', { min: 0.01, step: 0.01 })}{field('Minimum price step (₹/kg)', 'increment', 'number', { min: 0.01, step: 0.01 })}{field('Opens at (your local time)', 'opens_at', 'datetime-local')}{field('Closes at (your local time)', 'closes_at', 'datetime-local')}
        {field('Handover location and price inclusions', 'handover', 'text', { minLength: 3, maxLength: 300 })}{field('Quality acceptance protocol', 'acceptance', 'text', { minLength: 3, maxLength: 1000 })}{field('Payment terms', 'payment', 'text', { minLength: 3, maxLength: 1000 })}{field('Cancellation and default terms', 'cancellation', 'text', { minLength: 3, maxLength: 1000 })}{field('Evidence / production plan reference', 'evidence_reference', 'text', { minLength: 3, maxLength: 200 })}<label>Evidence status<select name="evidence_status"><option value="synthetic">Synthetic demonstration</option><option value="reviewed" disabled={account.role === 'fpo'}>Reviewed evidence</option></select></label>
      </div><button disabled={!writesEnabled} type="submit">{pending ? 'Publishing…' : 'Publish fixed terms'}</button></form></section>}
      <div className="a-columns"><section className="a-panel"><h2>Latest auction records</h2><p className="a-small">Up to 200 most recent auctions.</p>{!loaded ? <p role="status">Loading auctions…</p> : !items.length ? <p>No auction records are visible.</p> : <ul className="a-list">{items.map(item => <li key={item.id}><button className={`a-list-item ${selected === item.id ? 'a-selected' : ''}`} onClick={() => setSelected(item.id)}><span><strong>{item.title}</strong><small>{item.mode === 'spot' ? 'Highest eligible price' : 'Lowest eligible quote'} · {item.terms.evidence_status}</small></span><span>{item.status}<small>{item.leading_price === null ? 'No bids' : `${money(item.leading_price)}/kg`}</small></span></button></li>)}</ul>}</section>
        <section className="a-panel">{!active ? <><h2>Auction details</h2><p>Select an auction to review its terms, place a bid, or confirm an award.</p></> : <><h2>{active.title}</h2><p>{active.crop} · {active.variety} · {active.grade} · {(active.quantity_g / 1000).toLocaleString()} kg</p><p><strong>{active.status}</strong> · {active.bid_count} accepted bids · {active.terms.evidence_status}</p><dl className="a-facts"><dt>Delivery</dt><dd>{active.week_start} to {active.week_end}</dd><dt>Opens</dt><dd>{dateTime(active.opens_at)}</dd><dt>Closes</dt><dd>{dateTime(active.closes_at)}</dd><dt>Server updated</dt><dd>{dateTime(active.server_time)}</dd><dt>{active.mode === 'spot' ? 'Reserve' : 'Maximum quote'}</dt><dd>{money(active.limit_price)}/kg</dd><dt>Leading price</dt><dd>{active.leading_price === null ? 'No bids' : `${money(active.leading_price)}/kg`}</dd><dt>Minimum step</dt><dd>{money(active.increment)}/kg</dd><dt>Handover</dt><dd>{active.terms.handover}</dd><dt>Acceptance</dt><dd>{active.terms.acceptance}</dd><dt>Payment</dt><dd>{active.terms.payment}</dd><dt>Cancellation</dt><dd>{active.terms.cancellation}</dd><dt>Evidence</dt><dd>{active.terms.evidence_reference}</dd><dt>Disclosed fee</dt><dd>{money(active.terms.fee_paise_per_kg)}/kg</dd></dl><p className="a-small">{active.rule_version} · Whole lot. Last {active.extension_window_s}s: extend {active.extension_s}s per improving bid, capped at {active.extension_cap_s}s. The server accepts bids and determines closure. Refreshes every 5 seconds.</p>
          {active.status === 'open' && Date.parse(active.server_time) >= Date.parse(active.opens_at) && Date.parse(active.server_time) < Date.parse(active.closes_at) && !active.is_owner && active.eligible && account.role === (active.mode === 'spot' ? 'exporter' : 'fpo') && <form key={active.id} onSubmit={bid}><div className="a-fields">{field('Your offer (₹/kg)', 'price', 'number', { min: 0.01, step: 0.01 })}{active.mode === 'forward' && <label>Reviewed production capacity<select name="capacity_id" required><option value="">Choose a projection</option>{active.own_capacity_id && !capacities.some(c => c.id === active.own_capacity_id) && <option value={active.own_capacity_id}>Your held capacity · {active.own_capacity_id}</option>}{capacities.filter(c => c.reviewed && c.source_type === 'projection').map(c => <option key={c.id} value={c.id}>{c.crop} · {c.variety} · {c.grade} · {c.id}</option>)}</select></label>}</div><label className="a-check"><input type="checkbox" required /> I accept the published terms and whole-lot quantity.</label><button disabled={!writesEnabled} type="submit">{pending ? 'Submitting…' : 'Submit bid'}</button></form>}
          {active.status === 'open' && <div className="a-actions"><button className="a-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/close`, {}); await refreshSaved() })}>Check server closure</button>{active.is_owner && active.bid_count === 0 && <button className="a-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/cancel`, {}); await refreshSaved() })}>Cancel auction</button>}</div>}
          {active.award && <div className="a-award"><h3>Your {active.award.status} shared auction award</h3><p>Buyer: {active.award.buyer_confirmed ? 'confirmed' : 'pending'} · Seller: {active.award.seller_confirmed ? 'confirmed' : 'pending'}. Confirm by {dateTime(active.award.expires_at)} ({active.confirmation_hours}-hour window).</p>{active.award.status === 'provisional' && <div className="a-actions">{!active.award[`${active.award.your_side}_confirmed`] && <button disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'confirm' }); await refreshSaved() })}>Confirm agreed terms</button>}<button className="a-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'decline' }); await refreshSaved() })}>Decline award</button></div>}</div>}
        </>}</section></div>
    </>}
  </div>
}
