import { useTrade } from './TradeProvider'
import { kg, money, timestamp } from './calculations'
import { ReceiveForm } from './Logistics'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TradeFrame, evidenceField, g, moneyField, paise, positive, reasonField, weightField } from './ui'
import type { Claim, Receipt } from './types'

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { workspace } = useTrade()
  const party = workspace && ['fpo', 'exporter'].includes(workspace.principal.role) && [receipt.seller_org, receipt.buyer_org].includes(workspace.principal.organisation_id)
  return <Panel title="Arrival inspection" subtitle={`Received ${kg(receipt.received_g)} · ${timestamp(receipt.received_at)}`} aside={<Status value="received" />}>
    <div className="t-resource-head"><ResourceId id={receipt.id} /><ActionLink to={`/trade/contracts/${receipt.contract_id}`}>Contract</ActionLink></div>
    <dl className="t-details"><Detail label="Dispatched">{kg(receipt.quantity_g)}</Detail><Detail label="Accepted at full grade">{kg(receipt.accepted_g)}</Detail><Detail label="Downgraded">{kg(receipt.downgraded_g)}</Detail><Detail label="Rejected">{kg(receipt.rejected_g)}</Detail><Detail label="Transit shortfall">{kg(receipt.transit_shortfall_g)}</Detail><Detail label="Private receiving evidence">{receipt.evidence_reference}</Detail><Detail label="Recorded reasons">{receipt.reason || 'No discrepancy reported'}</Detail><Detail label="Shipment"><ResourceId id={receipt.shipment_id} /></Detail></dl>
    {party && <div style={{ marginTop: 18 }}><Disclosure title="Open an attributed claim"><CommandForm path="/claims" submit="Open claim and settlement hold" fields={[{ name: 'direction', label: 'Requested adjustment direction', type: 'select', options: [{ value: 'seller_deduction', label: 'Seller deduction · reduce seller proceeds' }, { value: 'seller_credit', label: 'Seller credit · additional buyer obligation' }], help: 'A seller credit can contest a rejection or downgrade by asking the buyer to restore attributable value. Both counterparties must agree before it changes the ledger.' }, weightField('affected', 'Affected weight'), moneyField('amount', 'Requested claim adjustment'), reasonField, evidenceField]} prepare={(values) => {
      const affected = positive(g(values, 'affected'), 'Affected quantity')
      if (affected > receipt.quantity_g) throw new Error('Affected weight cannot exceed this shipment quantity.')
      return { receipt_id: receipt.id, direction: values.direction, affected_g: affected, amount_paise: positive(paise(values, 'amount'), 'Requested claim amount'), reason: values.reason.trim(), evidence_reference: values.evidence_reference.trim() }
    }} note="A requested adjustment does not change an obligation. It holds settlement until both counterparties approve the same resolution; the server rejects duplicate recovery or requests exceeding the attributable obligation." /></Disclosure></div>}
  </Panel>
}

function ClaimCard({ claim }: { claim: Claim }) {
  const { workspace } = useTrade()
  if (!workspace) return null
  const party = ['fpo', 'exporter'].includes(workspace.principal.role) && [claim.seller_org, claim.buyer_org].includes(workspace.principal.organisation_id)
  const proposal = claim.proposal
  const credit = claim.direction === 'seller_credit'
  const adjustmentLabel = credit ? 'seller credit' : 'seller deduction'
  const approved = claim.approvals?.some((item) => item.organisation_id === workspace.principal.organisation_id)
  return <Panel title={`Claim · ${money(claim.amount_paise)} ${adjustmentLabel} requested`} subtitle={`${kg(claim.affected_g)} affected · receipt ${claim.receipt_id}`} aside={<Status value={claim.status} />}>
    <div className="m-row" style={{ marginBottom: 16 }}><ResourceId id={claim.id} /><span className={`m-tag ${credit ? 'm-tag-order' : 'm-tag-warn'}`}>{credit ? 'Seller credit · additional buyer obligation' : 'Seller deduction · reduced proceeds'}</span></div>
    <dl className="t-details"><Detail label="Reason">{claim.reason}</Detail><Detail label="Private evidence">{claim.evidence_reference}</Detail><Detail label={`Requested ${adjustmentLabel}`}>{money(claim.amount_paise)}</Detail><Detail label="Settlement effect">{claim.status === 'resolved' ? `${money(proposal?.adjustment_paise ?? 0)} bilaterally agreed ${adjustmentLabel}` : 'Open dispute; settlement on hold. Requested adjustments are not applied.'}</Detail></dl>
    {proposal && <div style={{ marginTop: 16 }}><Notice><strong>Resolution version {proposal.version}: {money(proposal.adjustment_paise)} {adjustmentLabel}</strong><p>{proposal.reason}</p><p>{claim.approvals?.length || 0} of 2 counterparty approvals recorded.</p></Notice></div>}
    {party && claim.status !== 'resolved' && <div style={{ marginTop: 18 }}>
      {proposal && !approved && <CommandForm key={`agree-${claim.id}-${claim.version}`} path={`/claims/${claim.id}/agree`} fields={[{ name: 'agree', label: `I approve resolution version ${proposal.version}, with a ${adjustmentLabel} of ${money(proposal.adjustment_paise)} and the stated reason.`, type: 'checkbox' }]} prepare={() => ({ expected_version: claim.version, resolution_version: proposal.version })} submit="Approve this resolution version" note="Both organisations must approve this exact version. Replacing the proposal clears earlier approvals." />}
      {proposal && approved && <Notice>Your organisation approved this proposal. The other counterparty must approve the same version.</Notice>}
      <div style={{ marginTop: 14 }}><Disclosure title={proposal ? 'Propose a revised resolution' : 'Propose a resolution'}><CommandForm key={`propose-${claim.id}-${claim.version}`} path={`/claims/${claim.id}/propose`} fields={[moneyField('adjustment', `Proposed ${adjustmentLabel}`, proposal?.adjustment_paise), reasonField]} prepare={(values) => {
        const adjustment = paise(values, 'adjustment')
        if (adjustment > claim.amount_paise) throw new Error('Resolution adjustment cannot exceed the requested claim amount.')
        return { expected_version: claim.version, adjustment_paise: adjustment, reason: values.reason.trim() }
      }} submit="Save resolution for bilateral approval" note="A zero adjustment explicitly rejects the requested adjustment while retaining the claim history. The immutable claim direction also applies to every resolution version. This is a proposal until both counterparties agree." /></Disclosure></div>
    </div>}
  </Panel>
}

export function TradeArrivalsPage() {
  const { workspace } = useTrade()
  const arrivals = workspace?.shipments.filter((shipment) => shipment.status === 'dispatched' && shipment.buyer_org === workspace.principal.organisation_id) ?? []
  return <TradeFrame title="Arrival & claims" subtitle="Reconcile physical weights, record inspection evidence and resolve disagreements without rewriting movement history.">
    {workspace && <>
      <div className="t-metrics"><Metric label="Awaiting buyer receipt" value={arrivals.length} /><Metric label="Recorded arrivals" value={workspace.receipts.length} /><Metric label="Open claims" value={workspace.claims.filter((claim) => claim.status !== 'resolved').length} help="Requested amounts do not deduct automatically" /><Metric label="Accepted weight" value={kg(workspace.receipts.reduce((sum, receipt) => sum + receipt.accepted_g, 0))} help="Full-grade accepted quantity" /></div>
      {workspace.principal.role === 'exporter' && <Panel title="Record incoming delivery" subtitle="The buyer records actual receiving weights and private evidence.">{arrivals.length ? <div className="t-list">{arrivals.map((shipment) => <Disclosure key={shipment.id} title={`${kg(shipment.quantity_g)} · ${shipment.id} · delivery ${timestamp(shipment.delivery_at)}`}><ReceiveForm shipment={shipment} /></Disclosure>)}</div> : <Empty>No dispatched shipments currently await your receipt. Dispatch is recorded by the FPO seller.</Empty>}</Panel>}
      <div className="t-grid"><div className="t-list">{workspace.receipts.map((receipt) => <ReceiptCard key={receipt.id} receipt={receipt} />)}{!workspace.receipts.length && <Panel title="Receiving records"><Empty>No arrival inspection has been recorded yet.</Empty></Panel>}</div><div className="t-list">{workspace.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)}{!workspace.claims.length && <Panel title="Claims & agreement"><Empty>No claims are visible. Open a claim from its receipt when there is an attributed disagreement.</Empty><p className="m-small" style={{ margin: '15px 0 0' }}>Cosmetic grade changes, safety rejection and transit shortfall are recorded separately. Payment records remain distinct from claim requests.</p></Panel>}</div></div>
    </>}
  </TradeFrame>
}
