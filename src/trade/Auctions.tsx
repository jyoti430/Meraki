import SharedAuctions from '../pages/Auctions'
import { useAuth } from '../auth/context'
import { DemoTradeBoard } from './DemoTradeBoard'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Clock3, Gavel, Leaf } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { isoDate, kg, money, timestamp } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, g, moneyField, paise, positive, reasonField, termFields, termsFrom, weightField, type FieldSpec } from './ui'
import type { Auction } from './types'
import { forwardCapacityOptions } from './qualification'
import { useI18n } from '../i18n'

function AuctionCard({ auction }: { auction: Auction }) {
  const forward = auction.mode === 'forward'
  const price = auction.leading_price_paise_per_kg ?? (forward ? auction.maximum_price_paise_per_kg : auction.reserve_price_paise_per_kg) ?? 0
  return <article className="t-opportunity">
    <div className="t-opportunity-head"><div><span className={`m-tag ${forward ? 'm-tag-order' : 'm-tag-plan'}`}>{forward ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{forward ? 'Forward procurement · lowest eligible offer' : 'Harvested lot · highest eligible bid'}</span><h3>{auction.crop} <span className="m-small">{auction.variety}</span></h3><p className="m-small">{kg(auction.quantity_g)} · grade {auction.grade} · whole {forward ? 'request' : 'lot'}</p></div><Status value={auction.status} /></div>
    <dl className="t-details"><Detail label="Delivery window">{auction.delivery_start} – {auction.delivery_end}</Detail><Detail label="Effective close"><Clock3 size={12} /> {timestamp(auction.closes_at)}</Detail><Detail label="Handover">{auction.handover}</Detail><Detail label="Quality protocol">{auction.grade_protocol}</Detail></dl>
    <div className="t-opportunity-foot"><div className="t-opportunity-price">{money(price)}<small> / kg · {auction.leading_price_paise_per_kg == null ? forward ? 'maximum' : 'reserve' : 'leading price'}</small></div><ActionLink to={`/trade/auctions/${auction.id}`}>View opportunity</ActionLink></div>
  </article>
}

const scheduleFields: FieldSpec[] = [
  { name: 'opens_at', label: 'Auction opens', type: 'datetime-local', required: false, help: 'Leave both schedule fields blank for server opening now and a two-hour window.' },
  { name: 'closes_at', label: 'Auction closes', type: 'datetime-local', required: false },
]

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
  return <TradeFrame demo={demo} controls={<div className="t-filter" role="group" aria-label={t('trade_board_sources_aria')} style={{ marginBottom: 20 }}><button className="m-btn m-btn-secondary" type="button" disabled={!account} aria-pressed={board === 'shared'} onClick={() => setBoard('shared')}>{t('trade_board_shared')}</button><button className="m-btn m-btn-secondary" type="button" aria-pressed={board === 'samples'} onClick={() => setBoard('samples')}>{t('trade_board_samples')}</button><button className="m-btn m-btn-secondary" type="button" aria-pressed={board === 'procurement'} onClick={() => setBoard('procurement')}>{t('trade_board_procurement')}</button></div>} title="Trade opportunities" subtitle="Agree a clear price and delivery basis, then carry the award through fulfilment and reconciliation.">

    {board === 'shared' && account && <SharedAuctions embedded />}
    {board === 'samples' && <DemoTradeBoard />}
    {!demo && workspace && <>
      <div className="t-metrics"><Metric label="Open opportunities" value={workspace.auctions.filter((auction) => auction.status === 'open').length} help="Server clock determines eligibility" /><Metric label="Provisional awards" value={workspace.contracts.filter((contract) => contract.status === 'provisional').length} help="Both parties must approve terms" /><Metric label="Confirmed contracts" value={workspace.contracts.filter((contract) => contract.status === 'confirmed').length} help="Ready for released-lot fulfilment" /><Metric label="Released lots" value={workspace.lots.filter((lot) => lot.qc_status === 'released').length} help="Scope-limited QC release" /></div>
      <div className="t-grid"><Panel title="Market board" subtitle="Published opportunities; private offers and evidence remain organisation scoped." aside={<Gavel size={23} color="var(--forest)" />}>
        <div className="t-filter" style={{ marginBottom: 18 }}><label><span className="sr-only">Search crop or variety</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search crop or variety" /></label><label><span className="sr-only">Auction mode</span><select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">Both modes</option><option value="spot">Harvested lots</option><option value="forward">Forward requests</option></select></label><label><span className="sr-only">Auction status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{['scheduled', 'open', 'awarded', 'no_sale', 'cancelled'].map((value) => <option value={value} key={value}>{value.replace(/_/g, ' ')}</option>)}</select></label></div>
        <div className="t-list">{auctions.map((auction) => <AuctionCard auction={auction} key={auction.id} />)}{!auctions.length && <Empty>No opportunities match these filters. Released harvested lots and exporter forward requests can be published here.</Empty>}</div>
      </Panel><div className="t-list">
        {(isFpo || isExporter) && <Panel title={isFpo ? 'Offer a harvested lot' : 'Request future supply'} subtitle={isFpo ? 'Publish a released whole lot with a reserve and upward price increment.' : 'Publish a whole-request procurement window for qualified FPO offers.'} aside={<Leaf size={23} color="var(--forest)" />}>
          {isFpo && !lots.length ? <Empty>Create a lot and record inspection evidence, then ask its assigned QC reviewer to release it. <Link className="m-link" to="/trade/lots">Open lots & QC</Link></Empty> : <Disclosure title={isFpo ? 'Create spot auction' : 'Create forward request'}>
            <CommandForm key={`${workspace.principal.id}-${lots.map((lot) => lot.id).join(',')}`} path="/auctions" submit={isFpo ? 'Publish spot auction' : 'Publish forward request'} success="Opportunity published. The server controls opening, closing and any award." fields={[
              ...(isFpo ? [{ name: 'lot_id', label: 'Released, unreserved lot', type: 'select' as const, options: lots.map((lot) => ({ value: lot.id, label: `${lot.crop} · ${kg(lot.quantity_g)} · ${lot.id}` })) }, moneyField('reserve', 'Reserve price per kg'), moneyField('increment', 'Minimum price increase per kg')] : [{ name: 'crop', label: 'Crop' }, { name: 'variety', label: 'Variety' }, { name: 'grade', label: 'Required grade' }, weightField('quantity', 'Whole-request quantity'), moneyField('maximum', 'Maximum price per kg')]),
              ...scheduleFields, ...termFields(),
            ]} prepare={(values) => {
              if (Boolean(values.opens_at) !== Boolean(values.closes_at)) throw new Error('Enter both opening and closing times, or leave both blank.')
              if (values.opens_at && new Date(values.closes_at) <= new Date(values.opens_at)) throw new Error('Auction closing must follow opening.')
              const schedule = values.opens_at ? { opens_at: isoDate(values.opens_at), closes_at: isoDate(values.closes_at) } : {}
              return { mode: isFpo ? 'spot' : 'forward', ...schedule, ...termsFrom(values), ...(isFpo ? { lot_id: values.lot_id, reserve_price_paise_per_kg: positive(paise(values, 'reserve'), 'Reserve price'), increment_paise_per_kg: positive(paise(values, 'increment'), 'Minimum increment') } : { crop: values.crop.trim(), variety: values.variety.trim(), grade: values.grade.trim(), quantity_g: positive(g(values, 'quantity'), 'Quantity'), maximum_price_paise_per_kg: positive(paise(values, 'maximum'), 'Maximum price') }) }
            }} note="Whole-lot or whole-request awards only. A provisional award still requires bilateral term confirmation. The fee shown in the terms is charged to the seller." />
          </Disclosure>}
        </Panel>}
        <Panel title="Published rules" subtitle="The two auction modes use different price directions."><dl className="t-details"><Detail label="Harvested lot">Highest eligible price. Each bid must meet reserve and improve the leader by the published increment.</Detail><Detail label="Forward supply">Lowest qualified, comparable offer. Whole-request capacity is reserved; equal prices use server acceptance order.</Detail><Detail label="Spot closure">Late accepted bids may extend by 2 minutes, up to 10 minutes beyond original close.</Detail><Detail label="Award">Provisional for 24 hours after close; both organisations approve the same terms version.</Detail></dl><p className="m-small" style={{ marginTop: 16 }}>The worker closes auctions without an open browser. A screen refresh retrieves persisted outcomes.</p></Panel>
        {isFpo && <Panel title="Qualification & capacity" subtitle="Synthetic capacity is a development adapter, separate from the crop planner.">{workspace.capacities.length ? <div className="t-list">{workspace.capacities.map((capacity) => <div key={capacity.id}><div className="m-row"><strong>{capacity.crop} · grade {capacity.grade}</strong><span className="m-tag m-tag-indicative">synthetic capacity</span></div><p className="m-small">{kg(capacity.available_g)} available · <ResourceId id={capacity.id} /></p></div>)}</div> : <Empty>No consented capacity is visible for this organisation. A forward offer cannot assume eligibility.</Empty>}</Panel>}
      </div></div>
    </>}
  </TradeFrame>
}

export function TradeAuctionPage() {
  const { auctionId } = useParams()
  const { workspace } = useTrade()
  const auction = workspace?.auctions.find((item) => item.id === auctionId)
  const organisation = workspace?.principal.organisation_id
  const canBid = auction && organisation !== auction.owner_org && (auction.mode === 'spot' ? workspace?.principal.role === 'exporter' : workspace?.principal.role === 'fpo')
  const capacity = auction && workspace ? forwardCapacityOptions(auction, workspace.capacities, workspace.principal.organisation_id) : []
  return <TradeFrame title={auction ? `${auction.crop} · ${auction.mode === 'spot' ? 'harvested lot' : 'forward supply'}` : 'Auction opportunity'} subtitle="Review the complete published terms before submitting a binding-capacity offer or buyer bid.">
    {workspace && (!auction ? <Empty>This auction is unavailable to this identity. <Link to="/trade" className="m-link">Return to the market board</Link></Empty> : <>
      <Link to="/trade" className="m-link"><ArrowLeft size={15} />Market board</Link>
      <div className="t-metrics"><Metric label="Whole quantity" value={kg(auction.quantity_g)} help={`${auction.variety} · grade ${auction.grade}`} /><Metric label={auction.leading_price_paise_per_kg == null ? auction.mode === 'spot' ? 'Reserve per kg' : 'Maximum per kg' : 'Leading price per kg'} value={money(auction.leading_price_paise_per_kg ?? auction.reserve_price_paise_per_kg ?? auction.maximum_price_paise_per_kg ?? 0)} /><Metric label="Effective close" value={new Date(auction.closes_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} help={timestamp(auction.closes_at)} /><Metric label="Auction status" value={<Status value={auction.status} />} help="Authoritative server projection" /></div>
      <div className="t-grid"><div className="t-list"><Panel title="Commercial terms" subtitle={`Version ${auction.version} · ${auction.mode === 'spot' ? 'highest eligible buyer price' : 'lowest qualified supplier price'}`} aside={<ResourceId id={auction.id} />}><TermsView terms={auction} /><dl className="t-details" style={{ marginTop: 16 }}><Detail label="Disclosed seller fee">{money(auction.fee_paise)}</Detail><Detail label="Opening">{timestamp(auction.opens_at)}</Detail><Detail label="Original close">{timestamp(auction.original_closes_at)}</Detail><Detail label="Spot extension used">{auction.mode === 'spot' ? `${auction.extension_seconds || 0} of 600 seconds` : 'Fixed forward window; no extension'}</Detail>{auction.mode === 'spot' && <Detail label="Minimum price increase">{money(auction.increment_paise_per_kg ?? 0)} / kg</Detail>}</dl></Panel>
        <Panel title="Visible bid receipts" subtitle="Only records permitted for this organisation are returned by the server.">{auction.bids?.length ? <div className="t-table-wrap"><table className="t-table"><thead><tr><th>Bidder</th><th>Accepted by server</th><th>Receipt</th><th>Price / kg</th></tr></thead><tbody>{auction.bids.map((bid) => <tr key={bid.id}><td>{bid.organisation_id}<br /><span className="m-small">{bid.status}</span></td><td>{timestamp(bid.accepted_at)}<br /><span className="m-small">Acceptance sequence {bid.sequence}</span></td><td><ResourceId id={bid.id} /></td><td>{money(bid.price_paise_per_kg)}</td></tr>)}</tbody></table></div> : <Empty>No bid receipts are visible yet.</Empty>}</Panel>
      </div><div className="t-list">
        {auction.contract_id && <Panel title="Provisional outcome" subtitle="Closing selected a winner using the published rule. Confirm the same term version with the counterparty."><ActionLink to={`/trade/contracts/${auction.contract_id}`}>Open award contract</ActionLink></Panel>}
        {['no_sale', 'cancelled'].includes(auction.status) && <Notice>{auction.status === 'no_sale' ? 'The auction closed without an eligible sale. No runner-up is automatically bound.' : 'This opportunity was cancelled. Its reservation release is recorded by the server.'}</Notice>}
        {canBid && <Panel title={auction.mode === 'spot' ? 'Submit buyer bid' : 'Submit qualified offer'} subtitle={auction.mode === 'spot' ? 'Your bid must improve the current price by at least the published increment.' : 'The entire request must be backed by one compatible reviewed capacity reference.'}>
          {auction.status !== 'open' ? <Notice>The server currently reports “{auction.status.replace(/_/g, ' ')}”. Bidding is available during the server-defined open window.</Notice> : auction.mode === 'forward' && !capacity.length ? <Empty>No visible capacity can cover this whole request. Crop, grade, timing, consent and protocol compatibility are checked by the server; missing qualification blocks an offer.</Empty> : <CommandForm key={`${auction.id}-${auction.version}`} path={`/auctions/${auction.id}/bids`} submit={auction.mode === 'spot' ? 'Submit bid to server' : 'Submit capacity-backed offer'} success="Offer accepted by the server. Your authoritative receipt appears in the visible bid history." fields={[
            moneyField('price', auction.mode === 'spot' ? 'Your price per kg' : 'Your offered price per kg'),
            ...(auction.mode === 'forward' ? [{ name: 'capacity_id', label: 'Consented, reviewed capacity', type: 'select' as const, options: capacity.map((item) => ({ value: item.id, label: `${item.id} · ${kg(item.available_g)} available` })) }] : []),
            { name: 'acknowledge', label: 'I reviewed the whole quantity, delivery, quality, fee and risk terms above.', type: 'checkbox' },
          ]} prepare={(values) => ({ expected_version: auction.version, price_paise_per_kg: positive(paise(values, 'price'), 'Price'), ...(auction.mode === 'forward' ? { capacity_id: values.capacity_id } : {}) })} note="A competing offer can make this version stale. Refresh and review the latest terms before retrying. Browser time does not decide acceptance." />}
        </Panel>}
        {organisation === auction.owner_org && ['scheduled', 'open'].includes(auction.status) && <Panel title="Auction management" subtitle="Unattended closing is performed by the server worker."><Disclosure title="Recover closing after the effective deadline"><CommandForm key={`close-${auction.version}`} path={`/auctions/${auction.id}/close`} prepare={() => ({ expected_version: auction.version })} submit="Request server close" note="The server refuses an early close and replays a completed close without creating a second contract." /></Disclosure><Disclosure title="Cancel this auction"><CommandForm key={`cancel-${auction.version}`} path={`/auctions/${auction.id}/cancel`} fields={[reasonField]} prepare={(values) => ({ expected_version: auction.version, reason: values.reason.trim() })} submit="Cancel auction and release reservation" tone="danger" /></Disclosure></Panel>}
        {!canBid && organisation !== auction.owner_org && <Notice>This identity can view the opportunity but does not have the required bidding role.</Notice>}
      </div></div>
    </>)}
  </TradeFrame>
}
