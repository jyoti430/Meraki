import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, Gavel, Info, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ApiError, auctionRequest, priceToPaise, validateAuction, validateAuctionCapabilities, validateAuctionList, validateBidReceipt, validateCapacityList } from '../services/auctionApi'
import type { Auction, AuctionCapabilities, Capacity } from '../services/auctionApi'
import { decimalToInteger } from '../trade/calculations'
import '../styles/auctions.css'
import { useAuth } from '../auth/context'
import { cropLabel, formatDate, formatINR, formatNumber, statusTranslationKey, useI18n } from '../i18n'

export default function Auctions({ embedded = false }: { embedded?: boolean }) {
  const { account, preview, session } = useAuth()
  const { t, lang } = useI18n()
  const dateTime = (value: string) => formatDate(value, lang, { dateStyle: 'medium', timeStyle: 'short' })
  const date = (value: string) => formatDate(value, lang, { dateStyle: 'medium' })
  const currency = (paise: number) => formatINR(paise / 100, lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const localizedStatus = (value: string) => { const key = statusTranslationKey(value); return key ? t(key) : value.replace(/_/g, ' ') }
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
  const detailsHeading = useRef<HTMLHeadingElement>(null)
  const selectedRow = useRef<HTMLButtonElement>(null)
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
  function selectAuction(id: string) {
    setSelected(id)
    if (window.matchMedia('(max-width: 820px)').matches) {
      // Wait for React to mount the selected details before moving focus.
      window.requestAnimationFrame(() => detailsHeading.current?.focus())
    }
  }
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
      setShowCreate(false); setSelected(result.id); setNotice(t('auction_publish_success')); await refreshSaved()
    })
  }
  function bid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f = new FormData(event.currentTarget)
    if (!active) return
    void run(async () => {
      const result = await mutate<{ receipt: { id: string; accepted_at: string } }>(`/auctions/${active.id}/bids`, { price: priceToPaise(String(f.get('price'))), accept_terms: true, ...(active.mode === 'forward' ? { capacity_id: f.get('capacity_id') } : {}) })
      if (!result.receipt || typeof result.receipt.id !== 'string' || !Number.isFinite(Date.parse(result.receipt.accepted_at))) throw new Error('The bid may be saved, but its receipt response is invalid. Refresh before retrying.')
      setNotice(t('auction_bid_success', { date: dateTime(result.receipt.accepted_at), receipt: result.receipt.id })); await refreshSaved()
    })
  }
  const field = (label: string, name: string, type = 'text', extra: Record<string, string | number> = {}) => <label>{label}<input name={name} type={type} required {...extra} /></label>
  return <div className="m-page a-workspace">
    <header className="m-pagehead a-heading">
      <div>
        <p className="m-eyebrow">{t('auction_eyebrow')}</p>
        {embedded ? <h2 className="m-h2">{t('auction_title')}</h2> : <h1 className="m-h1">{t('auction_title')}</h1>}
        <p className="m-lead">{t('auction_subtitle')}</p>
      </div>
      {!embedded && <Link className="m-btn m-btn-secondary" to={(account?.role ?? preview) === 'exporter' ? '/exporter' : '/fpo'}><ArrowLeft size={16} aria-hidden="true" />{(account?.role ?? preview) === 'exporter' ? t('auction_back_exporter') : t('auction_back_fpo')}</Link>}
    </header>
    <aside className="a-context" aria-label={t('auction_context_aria')}>
      <Info size={18} aria-hidden="true" />
      <div><strong>{t('auction_context_title')}</strong><p>{t('auction_context_description')}</p>
        <Link to="/trade/requirements">{t('auction_context_requirements')}</Link>
      </div>
    </aside>
    {error && <div className="a-error" role="alert"><p>{t('auction_error_generic')}</p><details><summary>{t('auction_error_details')}</summary><code>{error}</code></details></div>}{notice && <div className="a-notice" role="status">{notice}</div>}
    {!capabilities ? <p className="a-service" role="status">{t('auction_service_unavailable')}</p> : !authEnabled ? <p className="a-service" role="status">{t('auction_auth_disabled')} <Link to="/trade/requirements">{t('auction_context_requirements')}</Link>.</p> : !capabilities.auction_mutations_enabled && <p className="a-service" role="status">{t('auction_writes_disabled')}</p>}
    {!account && authEnabled && <section className="m-card a-empty"><span className="a-icon"><Gavel size={22} aria-hidden="true" /></span><div><h2 className="m-h2">{t('auction_sign_in_title')}</h2><p>{t('auction_sign_in_description')}</p></div></section>}
    {account && <>
      <div className="m-card a-toolbar"><div><strong>{t(account.role === 'fpo' ? 'auction_toolbar_fpo' : 'auction_toolbar_exporter')}</strong><div className="a-id">{t('auction_organisation')} {account.organisation_id}</div></div><div className="a-actions"><button className="m-btn m-btn-secondary" disabled={pending} onClick={() => void run(refresh)}><RefreshCw size={16} aria-hidden="true" />{t('refresh')}</button><button className={`m-btn ${showCreate ? 'm-btn-secondary' : 'm-btn-primary'}`} disabled={!showCreate && !writesEnabled} aria-expanded={showCreate} aria-controls={showCreate ? 'auction-create' : undefined} onClick={() => setShowCreate(!showCreate)}>{showCreate ? t('auction_close_form') : t(account.role === 'fpo' ? 'auction_sell_spot_cta' : 'auction_request_forward_cta')}</button></div></div>
      {!fresh && <p role="status">{t('auction_loading_snapshot')}</p>}
      {showCreate && <section className="m-card a-panel" id="auction-create"><h2 className="m-h2">{t(account.role === 'fpo' ? 'auction_create_spot_title' : 'auction_create_forward_title')}</h2><p>{t('auction_create_disclosure')}</p><form onSubmit={create}><fieldset className="a-fieldset"><legend>{t('auction_group_crop_capacity')}</legend><div className="a-fields">
        {field(t('auction_field_title'), 'title', 'text', { minLength: 3, maxLength: 200 })}{field(t('ex_crop'), 'crop')}{field(t('order_variety'), 'variety')}{field(t('ex_grade'), 'grade')}{field(t('order_quantity_kg'), 'quantity', 'number', { min: 0.001, step: 0.001 })}
        {account.role === 'fpo' ? <label>{t('auction_reviewed_harvest_capacity')}<select name="capacity_id" required><option value="">{t('auction_choose_capacity')}</option>{capacities.filter(c => c.reviewed && c.source_type === 'harvested_lot').map(c => <option key={c.id} value={c.id}>{cropLabel(c.crop, t)} · {c.variety} · {c.grade} · {formatNumber((c.quantity_g - c.reserved_g - c.committed_g) / 1000, lang)} kg</option>)}</select><small>{t('auction_spot_fixture_note')}</small></label> : field(t('auction_eligible_orgs'), 'eligible')}
        </div></fieldset><fieldset className="a-fieldset"><legend>{t('auction_group_delivery')}</legend><div className="a-fields">
        {field(t('auction_first_delivery'), 'week_start', 'date')}{field(t('auction_last_delivery'), 'week_end', 'date')}{field(t(account.role === 'fpo' ? 'auction_reserve' : 'auction_maximum_quote'), 'limit_price', 'number', { min: 0.01, step: 0.01 })}{field(t('auction_minimum_step'), 'increment', 'number', { min: 0.01, step: 0.01 })}{field(t('auction_opens_local'), 'opens_at', 'datetime-local')}{field(t('auction_closes_local'), 'closes_at', 'datetime-local')}
        </div></fieldset><fieldset className="a-fieldset"><legend>{t('auction_group_terms_evidence')}</legend><div className="a-fields">
        {field(t('auction_handover'), 'handover', 'text', { minLength: 3, maxLength: 300 })}{field(t('auction_quality_protocol'), 'acceptance', 'text', { minLength: 3, maxLength: 1000 })}{field(t('order_payment_terms'), 'payment', 'text', { minLength: 3, maxLength: 1000 })}{field(t('auction_cancellation'), 'cancellation', 'text', { minLength: 3, maxLength: 1000 })}{field(t('auction_evidence_reference'), 'evidence_reference', 'text', { minLength: 3, maxLength: 200 })}<label>{t('auction_evidence_status')}<select name="evidence_status"><option value="synthetic">{t('auction_synthetic_evidence')}</option><option value="reviewed" disabled={account.role === 'fpo'}>{t('auction_reviewed_evidence')}</option></select></label>
      </div></fieldset><button className="m-btn m-btn-primary" disabled={!writesEnabled} type="submit">{pending ? t('auction_publishing') : t('auction_publish_terms')}</button></form></section>}
      <div className="a-columns"><section className="m-card a-panel"><h2 className="m-h2">{t('auction_records')}</h2><p className="a-small">{t('auction_recent_count')}</p>{!loaded ? <p role="status">{t('auction_loading')}</p> : !items.length ? <p className="a-empty-copy">{t('auction_empty')}</p> : <ul className="a-list">{items.map(item => <li key={item.id}><button className={`a-list-item ${selected === item.id ? 'a-selected' : ''}`} ref={selected === item.id ? selectedRow : undefined} aria-pressed={selected === item.id} onClick={() => selectAuction(item.id)}><span><strong>{item.title}</strong><small>{t(item.mode === 'spot' ? 'auction_highest_price' : 'auction_lowest_quote')} · {t(item.terms.evidence_status === 'reviewed' ? 'auction_reviewed_evidence' : 'auction_synthetic_evidence')}</small></span><span className="a-list-meta"><span className="m-tag m-tag-neutral a-status" data-status={item.status}>{localizedStatus(item.status)}</span><small>{item.leading_price === null ? t('auction_no_bids') : `${currency(item.leading_price)}/kg`}</small></span></button></li>)}</ul>}</section>
        <section className="m-card a-panel">{!active ? <><h2 className="m-h2">{t('auction_details')}</h2><p>{t('auction_select_details')}</p></> : <><p className="m-eyebrow">{t(active.mode === 'spot' ? 'auction_spot_sale' : 'auction_forward_procurement')}</p><h2 className="m-h2" ref={detailsHeading} tabIndex={-1}>{active.title}</h2><button className="m-btn m-btn-secondary a-back-to-list" type="button" onClick={() => selectedRow.current?.focus()}>{t('auction_back_list')}</button><p>{active.crop} · {active.variety} · {active.grade} · {formatNumber(active.quantity_g / 1000, lang)} kg</p><p><span className="m-tag m-tag-neutral a-status" data-status={active.status}>{localizedStatus(active.status)}</span> · {t('auction_accepted_bids', { count: active.bid_count })} · {t(active.terms.evidence_status === 'reviewed' ? 'auction_reviewed_evidence' : 'auction_synthetic_evidence')}</p><dl className="a-facts"><dt>{t('auction_delivery')}</dt><dd>{date(active.week_start)} – {date(active.week_end)}</dd><dt>{t('auction_opens')}</dt><dd>{dateTime(active.opens_at)}</dd><dt>{t('auction_closes')}</dt><dd>{dateTime(active.closes_at)}</dd><dt>{t('auction_server_updated')}</dt><dd>{dateTime(active.server_time)}</dd><dt>{t(active.mode === 'spot' ? 'auction_reserve' : 'auction_maximum_quote')}</dt><dd>{currency(active.limit_price)}/kg</dd><dt>{t('auction_leading_price')}</dt><dd>{active.leading_price === null ? t('auction_no_bids') : `${currency(active.leading_price)}/kg`}</dd><dt>{t('auction_minimum_step')}</dt><dd>{currency(active.increment)}/kg</dd></dl><details className="a-terms"><summary>{t('auction_published_rules')}</summary><dl className="a-facts"><dt>{t('auction_handover')}</dt><dd>{active.terms.handover}</dd><dt>{t('auction_quality_protocol')}</dt><dd>{active.terms.acceptance}</dd><dt>{t('order_payment_terms')}</dt><dd>{active.terms.payment}</dd><dt>{t('auction_cancellation')}</dt><dd>{active.terms.cancellation}</dd><dt>{t('auction_evidence_reference')}</dt><dd>{active.terms.evidence_reference}</dd><dt>{t('auction_disclosed_fee')}</dt><dd>{currency(active.terms.fee_paise_per_kg)}/kg</dd></dl><p className="a-small">{active.rule_version} · {t('auction_rule_description', { window: active.extension_window_s, extension: active.extension_s, cap: active.extension_cap_s })}</p></details>
          {active.status === 'open' && Date.parse(active.server_time) >= Date.parse(active.opens_at) && Date.parse(active.server_time) < Date.parse(active.closes_at) && !active.is_owner && active.eligible && account.role === (active.mode === 'spot' ? 'exporter' : 'fpo') && <form className="a-bid" key={active.id} onSubmit={bid}><h3 className="m-h3">{t('auction_bid_form')}</h3><div className="a-fields">{field(t('auction_your_offer'), 'price', 'number', { min: 0.01, step: 0.01 })}{active.mode === 'forward' && <label>{t('auction_reviewed_capacity')}<select name="capacity_id" required><option value="">{t('auction_choose_projection')}</option>{active.own_capacity_id && !capacities.some(c => c.id === active.own_capacity_id) && <option value={active.own_capacity_id}>{t('auction_held_capacity')} · {active.own_capacity_id}</option>}{capacities.filter(c => c.reviewed && c.source_type === 'projection').map(c => <option key={c.id} value={c.id}>{c.crop} · {c.variety} · {c.grade} · {c.id}</option>)}</select></label>}</div><label className="a-check"><input type="checkbox" required /> {t('auction_accept_terms')}</label><button className="m-btn m-btn-primary" disabled={!writesEnabled} type="submit">{pending ? t('auction_submitting') : t('auction_submit_bid')}</button></form>}
          {active.status === 'open' && <div className="a-actions"><button className="m-btn m-btn-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/close`, {}); await refreshSaved() })}>{t('auction_check_closure')}</button>{active.is_owner && active.bid_count === 0 && <button className="m-btn m-btn-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/cancel`, {}); await refreshSaved() })}>{t('auction_cancel')}</button>}</div>}
          {active.award && <div className="a-award"><h3 className="m-h3">{t('auction_award')} <span className="m-tag m-tag-neutral a-status" data-status={active.award.status}>{localizedStatus(active.award.status)}</span></h3><p>{t('auction_buyer')}: {t(active.award.buyer_confirmed ? 'status_confirmed' : 'status_pending')} · {t('auction_seller')}: {t(active.award.seller_confirmed ? 'status_confirmed' : 'status_pending')}. {t('auction_confirm_by', { date: dateTime(active.award.expires_at), hours: active.confirmation_hours })}</p>{active.award.status === 'provisional' && <div className="a-actions">{!active.award[`${active.award.your_side}_confirmed`] && <button className="m-btn m-btn-primary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'confirm' }); await refreshSaved() })}>{t('auction_confirm_terms')}</button>}<button className="m-btn m-btn-secondary" disabled={!writesEnabled} onClick={() => void run(async () => { await mutate(`/auctions/${active.id}/award`, { action: 'decline' }); await refreshSaved() })}>{t('auction_decline_award')}</button></div>}</div>}
        </>}</section></div>
    </>}
  </div>
}
