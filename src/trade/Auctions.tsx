import SharedAuctions from '../pages/Auctions'
import { useAuth } from '../auth/context'
import { DemoTradeBoard } from './DemoTradeBoard'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Clock3, Gavel, Leaf } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { isoDate, kg, money } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, g, localizedTradeTimestamp, moneyField, paise, positive, reasonField, termFields, termsFrom, weightField, type FieldSpec } from './ui'
import type { Auction } from './types'
import { forwardCapacityOptions } from './qualification'
import { cropLabel, formatDate, formatNumber, statusTranslationKey, useI18n } from '../i18n'

function AuctionCard({ auction }: { auction: Auction }) {
  const { t, lang } = useI18n()
  const forward = auction.mode === 'forward'
  const price = auction.leading_price_paise_per_kg ?? (forward ? auction.maximum_price_paise_per_kg : auction.reserve_price_paise_per_kg) ?? 0
  const quantityType = t(forward ? 'trb_whole_request' : 'trb_whole_lot')
  const priceLabel = auction.leading_price_paise_per_kg == null ? t(forward ? 'trb_price_maximum' : 'trb_price_reserve') : t('trb_price_leading')
  return <article className="t-opportunity">
    <div className="t-opportunity-head"><div><span className={`m-tag ${forward ? 'm-tag-order' : 'm-tag-plan'}`}>{forward ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{t(forward ? 'trb_forward_mode' : 'trb_spot_mode')}</span><h3>{cropLabel(auction.crop, t)} <span className="m-small">{auction.variety}</span></h3><p className="m-small">{t('trb_quantity_grade_whole', { quantity: kg(auction.quantity_g), grade: auction.grade, unit: quantityType })}</p></div><Status value={auction.status} /></div>
    <dl className="t-details"><Detail label={t('trui_terms_delivery_window')}>{formatDate(auction.delivery_start, lang, { day: 'numeric', month: 'short', year: 'numeric' })} – {formatDate(auction.delivery_end, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</Detail><Detail label={t('trb_effective_close')}><Clock3 size={12} /> {localizedTradeTimestamp(auction.closes_at, lang, t)}</Detail><Detail label={t('trui_terms_handover')}>{auction.handover}</Detail><Detail label={t('trui_terms_grade_protocol')}>{auction.grade_protocol}</Detail></dl>
    <div className="t-opportunity-foot"><div className="t-opportunity-price">{money(price)}<small> / <span>kg</span> · {priceLabel}</small></div><ActionLink to={`/trade/auctions/${auction.id}`}>{t('trb_view_opportunity')}</ActionLink></div>
  </article>
}

function scheduleFields(t: ReturnType<typeof useI18n>['t']): FieldSpec[] {
  return [
    { name: 'opens_at', label: t('trb_schedule_open'), type: 'datetime-local', required: false, help: t('trb_schedule_open_help') },
    { name: 'closes_at', label: t('trb_schedule_close'), type: 'datetime-local', required: false },
  ]
}

function translatedStatus(status: string, t: ReturnType<typeof useI18n>['t']) {
  const key = statusTranslationKey(status)
  return key ? t(key) : status.replace(/_/g, ' ')
}

export function TradeBoardPage() {
  const { workspace } = useTrade()
  const { account } = useAuth()
  const { t } = useI18n()
  const [board, setBoard] = useState<'shared' | 'samples' | 'procurement'>(account ? 'shared' : 'samples')
  const demo = board !== 'procurement'
  const [mode, setMode] = useState('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const lots = workspace?.lots.filter((lot) => lot.seller_org === workspace.principal.organisation_id && lot.qc_status === 'released' && !lot.forward_contract_id && lot.reserved_g === 0 && lot.shipped_g === 0) ?? []
  const auctions = (workspace?.auctions ?? []).filter((auction) => (mode === 'all' || auction.mode === mode) && (status === 'all' || auction.status === status) && `${auction.crop} ${auction.variety} ${auction.grade}`.toLowerCase().includes(query.toLowerCase()))
  const isFpo = workspace?.principal.role === 'fpo'
  const isExporter = workspace?.principal.role === 'exporter'
  return <TradeFrame demo={demo} controls={<div className="t-filter" role="group" aria-label={t('trade_board_sources_aria')} style={{ marginBottom: 20 }}><button className="m-btn m-btn-secondary" type="button" disabled={!account} aria-pressed={board === 'shared'} onClick={() => setBoard('shared')}>{t('trade_board_shared')}</button><button className="m-btn m-btn-secondary" type="button" aria-pressed={board === 'samples'} onClick={() => setBoard('samples')}>{t('trade_board_samples')}</button><button className="m-btn m-btn-secondary" type="button" aria-pressed={board === 'procurement'} onClick={() => setBoard('procurement')}>{t('trade_board_procurement')}</button></div>} title={t('trade_title')} subtitle={t('trade_sub')}>

    {board === 'shared' && account && <SharedAuctions embedded />}
    {board === 'samples' && <DemoTradeBoard />}
    {!demo && workspace && <>
      <div className="t-metrics"><Metric label={t('trb_open_opportunities')} value={workspace.auctions.filter((auction) => auction.status === 'open').length} help={t('trb_open_opportunities_help')} /><Metric label={t('trb_provisional_awards')} value={workspace.contracts.filter((contract) => contract.status === 'provisional').length} help={t('trb_provisional_awards_help')} /><Metric label={t('trb_confirmed_contracts')} value={workspace.contracts.filter((contract) => contract.status === 'confirmed').length} help={t('trb_confirmed_contracts_help')} /><Metric label={t('trb_released_lots')} value={workspace.lots.filter((lot) => lot.qc_status === 'released').length} help={t('trb_released_lots_help')} /></div>
      <div className="t-grid"><Panel title={t('trb_market_board')} subtitle={t('trb_market_board_sub')} aside={<Gavel size={23} color="var(--forest)" />}>
        <div className="t-filter" style={{ marginBottom: 18 }}><label><span className="sr-only">{t('trb_search_label')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('trb_search_placeholder')} /></label><label><span className="sr-only">{t('trb_mode_label')}</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">{t('trb_all_modes')}</option><option value="spot">{t('trb_harvested_lots')}</option><option value="forward">{t('trb_forward_requests')}</option></select></label><label><span className="sr-only">{t('trb_status_label')}</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t('trb_all_statuses')}</option>{['scheduled', 'open', 'awarded', 'no_sale', 'cancelled'].map((value) => <option value={value} key={value}>{translatedStatus(value, t)}</option>)}</select></label></div>
        <div className="t-list">{auctions.map((auction) => <AuctionCard auction={auction} key={auction.id} />)}{!auctions.length && <Empty>{t('trb_no_matches')} {t('trb_no_matches_help')}</Empty>}</div>
      </Panel><div className="t-list">
        {(isFpo || isExporter) && <Panel title={t(isFpo ? 'trb_offer_harvested_lot' : 'trb_request_future_supply')} subtitle={t(isFpo ? 'trb_offer_lot_sub' : 'trb_request_supply_sub')} aside={<Leaf size={23} color="var(--forest)" />}>
          {isFpo && !lots.length ? <Empty>{t('trb_create_lot_qc')} <Link className="m-link" to="/trade/lots">{t('trb_open_lots_qc')}</Link></Empty> : <Disclosure title={t(isFpo ? 'trb_create_spot' : 'trb_create_forward')}>
            <CommandForm key={`${workspace.principal.id}-${lots.map((lot) => lot.id).join(',')}`} path="/auctions" submit={t(isFpo ? 'trb_publish_spot' : 'trb_publish_forward')} success={t('trb_opportunity_published')} fields={[
              ...(isFpo ? [{ name: 'lot_id', label: t('trb_released_unreserved_lot'), type: 'select' as const, options: lots.map((lot) => ({ value: lot.id, label: `${cropLabel(lot.crop, t)} · ${kg(lot.quantity_g)} · ${lot.id}` })) }, moneyField('reserve', t('trb_reserve_price_per_kg')), moneyField('increment', t('trb_min_price_increase_per_kg'))] : [{ name: 'crop', label: t('trb_crop') }, { name: 'variety', label: t('trb_variety') }, { name: 'grade', label: t('trq_required_grade') }, weightField('quantity', t('trb_whole_request_quantity')), moneyField('maximum', t('trb_max_price_per_kg'))]),
              ...scheduleFields(t), ...termFields(),
            ]} prepare={(values) => {
              if (Boolean(values.opens_at) !== Boolean(values.closes_at)) throw new Error(t('trb_schedule_required_both'))
              if (values.opens_at && new Date(values.closes_at) <= new Date(values.opens_at)) throw new Error(t('trb_schedule_order'))
              const schedule = values.opens_at ? { opens_at: isoDate(values.opens_at), closes_at: isoDate(values.closes_at) } : {}
              return { mode: isFpo ? 'spot' : 'forward', ...schedule, ...termsFrom(values), ...(isFpo ? { lot_id: values.lot_id, reserve_price_paise_per_kg: positive(paise(values, 'reserve'), t('trb_reserve_price_per_kg')), increment_paise_per_kg: positive(paise(values, 'increment'), t('trb_min_price_increase_per_kg')) } : { crop: values.crop.trim(), variety: values.variety.trim(), grade: values.grade.trim(), quantity_g: positive(g(values, 'quantity'), t('trb_whole_request_quantity')), maximum_price_paise_per_kg: positive(paise(values, 'maximum'), t('trb_max_price_per_kg')) }) }
            }} note={t('trb_publication_terms_note')} />
          </Disclosure>}
        </Panel>}
        <Panel title={t('trb_rules')} subtitle={t('trb_price_direction_sub')}><dl className="t-details"><Detail label={t('trb_whole_lot')}>{t('trb_rule_harvested')}</Detail><Detail label={t('trb_forward_requests')}>{t('trb_rule_forward')}</Detail><Detail label={t('trb_spot_mode')}>{t('trb_rule_spot_close')}</Detail><Detail label={t('status_provisional')}>{t('trb_rule_award')}</Detail></dl><p className="m-small" style={{ marginTop: 16 }}>{t('trb_worker_close')}</p></Panel>
        {isFpo && <Panel title={t('trb_capacity')} subtitle={t('trb_capacity_sub')}>{workspace.capacities.length ? <div className="t-list">{workspace.capacities.map((capacity) => <div key={capacity.id}><div className="m-row"><strong>{cropLabel(capacity.crop, t)} · {t('trui_terms_grade_protocol').toLowerCase()} {capacity.grade}</strong><span className="m-tag m-tag-indicative">{t('trb_capacity_synthetic')}</span></div><p className="m-small">{t('trb_quantity_available', { quantity: kg(capacity.available_g), id: capacity.id })}</p></div>)}</div> : <Empty>{t('trb_capacity_empty')}</Empty>}</Panel>}
      </div></div>
    </>}
  </TradeFrame>
}

export function TradeAuctionPage() {
  const { auctionId } = useParams()
  const { workspace } = useTrade()
  const { t, lang } = useI18n()
  const auction = workspace?.auctions.find((item) => item.id === auctionId)
  const organisation = workspace?.principal.organisation_id
  const canBid = auction && organisation !== auction.owner_org && (auction.mode === 'spot' ? workspace?.principal.role === 'exporter' : workspace?.principal.role === 'fpo')
  const capacity = auction && workspace ? forwardCapacityOptions(auction, workspace.capacities, workspace.principal.organisation_id) : []
  const title = auction ? t(auction.mode === 'spot' ? 'trade_page_harvested_title' : 'trade_page_forward_title', { crop: cropLabel(auction.crop, t) }) : t('trade_page_auction')
  return <TradeFrame title={title} subtitle={t('trade_page_auction_sub')}>
    {workspace && (!auction ? <Empty>{t('trb_unavailable')} <Link to="/trade" className="m-link">{t('trb_return_market')}</Link></Empty> : <>
      <Link to="/trade" className="m-link"><ArrowLeft size={15} />{t('trb_back_market')}</Link>
      <div className="t-metrics"><Metric label={t('trb_whole_quantity')} value={kg(auction.quantity_g)} help={`${cropLabel(auction.crop, t)} · ${t('trui_terms_grade_protocol').toLowerCase()} ${auction.grade}`} /><Metric label={auction.leading_price_paise_per_kg == null ? auction.mode === 'spot' ? t('trb_reserve_per_kg') : t('trb_maximum_per_kg') : t('trb_leading_per_kg')} value={money(auction.leading_price_paise_per_kg ?? auction.reserve_price_paise_per_kg ?? auction.maximum_price_paise_per_kg ?? 0)} /><Metric label={t('trb_effective_close_metric')} value={localizedTradeTimestamp(auction.closes_at, lang, t)} /><Metric label={t('trb_status_label')} value={<Status value={auction.status} />} help={t('trb_authoritative_projection')} /></div>
      <div className="t-grid"><div className="t-list"><Panel title={t('trb_commercial_terms')} subtitle={t('trb_version_price_sub', { version: formatNumber(auction.version, lang), rule: t(auction.mode === 'spot' ? 'trb_highest_buyer_price' : 'trb_lowest_supplier_price') })} aside={<ResourceId id={auction.id} />}><TermsView terms={auction} /><dl className="t-details" style={{ marginTop: 16 }}><Detail label={t('trb_disclosed_seller_fee')}>{money(auction.fee_paise)}</Detail><Detail label={t('trb_opening')}>{localizedTradeTimestamp(auction.opens_at, lang, t)}</Detail><Detail label={t('trb_original_close')}>{localizedTradeTimestamp(auction.original_closes_at, lang, t)}</Detail><Detail label={t('trb_spot_extension_used')}>{auction.mode === 'spot' ? t('trb_extension_seconds', { used: formatNumber(auction.extension_seconds || 0, lang), total: formatNumber(600, lang) }) : t('trb_forward_fixed_window')}</Detail>{auction.mode === 'spot' && <Detail label={t('trb_minimum_price_increase')}>{money(auction.increment_paise_per_kg ?? 0)} / <span>kg</span></Detail>}</dl></Panel>
        <Panel title={t('trb_bid_receipts')} subtitle={t('trb_visible_records_sub')}>{auction.bids?.length ? <div className="t-table-wrap"><table className="t-table"><thead><tr><th>{t('trb_bidder')}</th><th>{t('trb_accepted_by_server')}</th><th>{t('trb_receipt')}</th><th>{t('trb_price_per_kg')}</th></tr></thead><tbody>{auction.bids.map((bid) => <tr key={bid.id}><td>{bid.organisation_id}<br /><Status value={bid.status} /></td><td>{localizedTradeTimestamp(bid.accepted_at, lang, t)}<br /><span className="m-small">{t('trb_acceptance_sequence', { sequence: formatNumber(bid.sequence, lang) })}</span></td><td><ResourceId id={bid.id} /></td><td>{money(bid.price_paise_per_kg)}</td></tr>)}</tbody></table></div> : <Empty>{t('trb_no_receipts')}</Empty>}</Panel>
      </div><div className="t-list">
        {auction.contract_id && <Panel title={t('trb_provisional_outcome')} subtitle={t('trb_winner_sub')}><ActionLink to={`/trade/contracts/${auction.contract_id}`}>{t('trb_open_contract')}</ActionLink></Panel>}
        {['no_sale', 'cancelled'].includes(auction.status) && <Notice>{t(auction.status === 'no_sale' ? 'trb_no_sale' : 'trb_cancelled_opportunity')}</Notice>}
        {canBid && <Panel title={t(auction.mode === 'spot' ? 'trb_submit_bid' : 'trb_submit_offer')} subtitle={t(auction.mode === 'spot' ? 'trb_bid_sub' : 'trb_offer_sub')}>
          {auction.status !== 'open' ? <Notice>{t('trb_status_not_open', { status: translatedStatus(auction.status, t) })} {t('trb_server_open_window')}</Notice> : auction.mode === 'forward' && !capacity.length ? <Empty>{t('trb_no_capacity_for_request')} {t('trb_capacity_compatibility')}</Empty> : <CommandForm key={`${auction.id}-${auction.version}`} path={`/auctions/${auction.id}/bids`} submit={t(auction.mode === 'spot' ? 'trb_submit_bid' : 'trb_submit_offer')} success={t('trb_offer_success')} fields={[
            moneyField('price', t(auction.mode === 'spot' ? 'trb_price_your_kg' : 'trb_offer_price_kg')),
            ...(auction.mode === 'forward' ? [{ name: 'capacity_id', label: t('trb_capacity_field'), type: 'select' as const, options: capacity.map((item) => ({ value: item.id, label: `${item.id} · ${t('trb_available_quantity', { quantity: kg(item.available_g) })}` })) }] : []),
            { name: 'acknowledge', label: t('trb_ack_terms'), type: 'checkbox' as const },
          ]} prepare={(values) => ({ expected_version: auction.version, price_paise_per_kg: positive(paise(values, 'price'), t('trb_price_per_kg')), ...(auction.mode === 'forward' ? { capacity_id: values.capacity_id } : {}) })} note={<>{t('trb_stale_version_note')} {t('trb_browser_clock_note')}</>} />}
        </Panel>}
        {organisation === auction.owner_org && ['scheduled', 'open'].includes(auction.status) && <Panel title={t('trb_management')} subtitle={t('trb_management_sub')}><Disclosure title={t('trb_recover_closing')}><CommandForm key={`close-${auction.version}`} path={`/auctions/${auction.id}/close`} prepare={() => ({ expected_version: auction.version })} submit={t('trb_request_server_close')} note={t('trb_close_note')} /></Disclosure><Disclosure title={t('trb_cancel_auction')}><CommandForm key={`cancel-${auction.version}`} path={`/auctions/${auction.id}/cancel`} fields={[reasonField]} prepare={(values) => ({ expected_version: auction.version, reason: values.reason.trim() })} submit={t('trb_cancel_release')} tone="danger" /></Disclosure></Panel>}
        {!canBid && organisation !== auction.owner_org && <Notice>{t('trb_no_bidding_role')}</Notice>}
      </div></div>
    </>)}
  </TradeFrame>
}
