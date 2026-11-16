import { useParams } from 'react-router-dom'
import { useTrade } from './TradeProvider'
import { isoDate, kg, money, timestamp } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, contributions, g, memberField, reasonField, termFields, termsFrom, weightField } from './ui'
import type { Contract } from './types'

function ContractCard({ contract }: { contract: Contract }) {
  const { workspace } = useTrade()
  if (!workspace) return null
  const organisation = workspace.principal.organisation_id
  const party = ['fpo', 'exporter'].includes(workspace.principal.role) && [contract.seller_org, contract.buyer_org].includes(organisation)
  const seller = workspace.principal.role === 'fpo' && contract.seller_org === organisation
  const confirmed = contract.confirmations.some((item) => item.organisation_id === organisation && item.terms_version === contract.terms_version)
  return <Panel title={`${contract.mode === 'spot' ? 'Harvested lot' : 'Forward supply'} contract`} subtitle={`${kg(contract.quantity_g)} at ${money(contract.price_paise_per_kg)} / kg · terms version ${contract.terms_version}`} aside={<Status value={contract.status} />}>
    <div className="t-resource-head"><ResourceId id={contract.id} />{contract.requirement_id ? <ActionLink to={`/trade/requirements/${contract.requirement_id}`}>Buyer requirement</ActionLink> : contract.auction_id ? <ActionLink to={`/trade/auctions/${contract.auction_id}`}>Auction record</ActionLink> : null}</div>
    <ol className="t-lifecycle" aria-label="Contract journey"><li className="active"><b>1</b>Awarded</li><li className={contract.status === 'confirmed' ? 'active' : ''}><b>2</b>Both terms confirmed</li><li className={contract.shipped_g > 0 ? 'active' : ''}><b>3</b>Shipment recorded</li><li><b>4</b>Receipt & settlement</li></ol>
    <dl className="t-details" style={{ margin: '20px 0' }}><Detail label="Seller">{contract.seller_org}</Detail><Detail label="Buyer">{contract.buyer_org}</Detail><Detail label="Provisional deadline">{timestamp(contract.expires_at)}</Detail><Detail label="Shipment commitments">{kg(contract.shipped_g || 0)} of {kg(contract.quantity_g)}</Detail><Detail label="Seller term approval">{contract.confirmations.some((item) => item.organisation_id === contract.seller_org && item.terms_version === contract.terms_version) ? 'Approved current version' : 'Awaiting approval'}</Detail><Detail label="Buyer term approval">{contract.confirmations.some((item) => item.organisation_id === contract.buyer_org && item.terms_version === contract.terms_version) ? 'Approved current version' : 'Awaiting approval'}</Detail></dl>
    <Disclosure title="Review agreed commercial snapshot" open><TermsView terms={contract.terms} /><p className="m-small" style={{ margin: '14px 0 0' }}>Disclosed seller fee: {money(contract.terms.fee_paise)}. Term confirmation records this workflow; it is not a claim of legally reviewed electronic signing.</p></Disclosure>
    {party && contract.status === 'provisional' && !confirmed && <div style={{ marginTop: 18 }}><CommandForm key={`confirm-${contract.version}`} path={`/contracts/${contract.id}/confirm`} fields={[{ name: 'reviewed', label: `I approve the complete commercial snapshot at terms version ${contract.terms_version}.`, type: 'checkbox' }]} prepare={() => ({ expected_version: contract.version, terms_version: contract.terms_version })} submit="Confirm this terms version" success="Your organisation's approval was recorded. The contract becomes confirmed only after both parties approve this version." /></div>}
    {party && contract.status === 'provisional' && confirmed && <div style={{ marginTop: 16 }}><Notice>Your organisation approved the current version. The other party must confirm before the deadline.</Notice></div>}
    {contract.status === 'confirmed' && <div className="m-row" style={{ marginTop: 18 }}><ActionLink to="/trade/lots">Lots & QC</ActionLink><ActionLink to="/trade/shipments">Create partial shipment</ActionLink><ActionLink to="/trade/settlements">Settlement ledger</ActionLink></div>}
    {seller && contract.mode === 'forward' && contract.status === 'confirmed' && !contract.lot_id && <div style={{ marginTop: 18 }}><Disclosure title="Convert committed capacity to identified harvest lot"><CommandForm key={`harvest-${contract.version}`} path={`/contracts/${contract.id}/harvest`} submit="Create exclusively reserved harvest lot" fields={[weightField('quantity', 'Whole-contract harvest quantity', contract.quantity_g), { name: 'harvest_date', label: 'Actual harvest date', type: 'date' }, { name: 'pickup_deadline', label: 'Pickup deadline', type: 'datetime-local' }, memberField]} prepare={(values) => {
      const quantity = g(values, 'quantity')
      if (quantity !== contract.quantity_g) throw new Error('The first implementation converts the entire contract quantity. Partial capacity conversion is not supported.')
      return { expected_version: contract.version, quantity_g: quantity, harvest_date: values.harvest_date, pickup_deadline: isoDate(values.pickup_deadline), member_contributions: contributions(values, quantity) }
    }} note="The server atomically converts the capacity commitment. The resulting lot remains exclusive to this contract and starts on QC hold." /></Disclosure></div>}
    {party && ['provisional', 'confirmed'].includes(contract.status) && contract.shipped_g === 0 && <div style={{ marginTop: 18 }}>
      <Disclosure title="Propose a replacement terms version"><CommandForm key={`amend-${contract.version}`} path={`/contracts/${contract.id}/amend`} fields={termFields(contract.terms)} prepare={(values) => ({ expected_version: contract.version, terms: termsFrom(values) })} submit="Save new terms for bilateral approval" note="Quantity and price remain the award snapshot. Replacing commercial terms clears both approvals and starts a new provisional confirmation window. Terms cannot change after a shipment exists." /></Disclosure>
      <Disclosure title="Record cancellation or default"><div className="t-grid"><CommandForm key={`cancel-${contract.version}`} path={`/contracts/${contract.id}/cancel`} fields={[reasonField]} prepare={(values) => ({ expected_version: contract.version, reason: values.reason.trim() })} submit="Cancel and release commitment" tone="danger" /><CommandForm key={`default-${contract.version}`} path={`/contracts/${contract.id}/default`} fields={[reasonField]} prepare={(values) => ({ expected_version: contract.version, reason: values.reason.trim() })} submit="Record default and release" tone="danger" /></div><p className="m-small" style={{ margin: '12px 0 0' }}>Requires a recorded reason; no runner-up is bound automatically.</p></Disclosure>
    </div>}
  </Panel>
}

export function TradeContractsPage() {
  const { contractId } = useParams()
  const { workspace } = useTrade()
  const contracts = workspace?.contracts.filter((item) => !contractId || item.id === contractId) ?? []
  return <TradeFrame title="Contracts & confirmations" subtitle="A winning offer is provisional until both counterparties approve the same versioned terms.">
    <div className="t-list">{contracts.map((contract) => <ContractCard contract={contract} key={contract.id} />)}{!contracts.length && <Empty>{contractId ? 'This contract is unavailable to this identity.' : 'No contracts are visible yet. The server worker creates a provisional contract when an eligible auction closes.'}</Empty>}</div>
  </TradeFrame>
}
