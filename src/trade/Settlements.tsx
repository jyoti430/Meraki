import { useTrade } from './TradeProvider'
import { adjustmentBreakdown, kg, money, timestamp } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TradeFrame, evidenceField, moneyField, paise, positive } from './ui'
import type { Settlement } from './types'

function SettlementCard({ settlement }: { settlement: Settlement }) {
  const { workspace } = useTrade()
  const finance = workspace?.principal.role === 'finance_reviewer' && workspace.principal.organisation_id === settlement.seller_org
  const payments = settlement.payments ?? []
  const disbursals = settlement.disbursals ?? []
  const allocations = settlement.allocations ?? []
  const adjustments = adjustmentBreakdown(settlement)
  const memberDisbursed = (memberId: string) => disbursals.filter((item) => item.member_id === memberId).reduce((sum, item) => sum + item.amount_paise, 0)
  const outstanding = allocations.filter((allocation) => allocation.amount_paise > memberDisbursed(allocation.member_id))
  const verificationBasis = { name: 'verification_basis', label: 'Verification basis', type: 'textarea' as const, help: 'State how the bank, provider or authorised ledger evidence was independently checked. A screenshot reference alone does not establish payment.' }
  return <Panel title="Member settlement statement" subtitle="Integer paise ledger · contribution-weighted largest-remainder distribution" aside={<Status value={settlement.payment_status} />}>
    <div className="t-resource-head"><ResourceId id={settlement.id} /><ActionLink to={`/trade/contracts/${settlement.contract_id}`}>Contract</ActionLink></div>
    <div className="t-grid"><div><div className="t-summary-line"><span>Accepted / agreed-grade gross</span><strong>{money(settlement.gross_paise)}</strong></div><div className="t-summary-line"><span>Bilaterally agreed seller deductions</span><strong>− {money(adjustments.deductions_paise)}</strong></div><div className="t-summary-line"><span>Bilaterally agreed seller credits</span><strong>+ {money(adjustments.credits_paise)}</strong></div><div className="t-summary-line"><span>Disclosed seller fee</span><strong>− {money(settlement.fee_paise)}</strong></div><div className="t-summary-line"><span>Distributable to members</span><strong>{money(settlement.net_paise)}</strong></div></div><dl className="t-details"><Detail label="Exporter invoice obligation">{money(settlement.invoice_paise)}</Detail><Detail label="Verified FPO receipts">{money(settlement.verified_receipt_paise)}</Detail><Detail label="Recorded member disbursals">{money(settlement.disbursed_paise)}</Detail><Detail label="Unreconciled invoice">{money(Math.max(0, settlement.invoice_paise - settlement.verified_receipt_paise))}</Detail></dl></div>
    {settlement.allocations ? <div className="t-table-wrap" style={{ marginTop: 20 }}><table className="t-table"><thead><tr><th>Member reference</th><th>Contribution basis</th><th>Allocated</th><th>Reconciled disbursal</th></tr></thead><tbody>{allocations.map((allocation) => <tr key={allocation.member_id}><td>{allocation.member_id}</td><td>{kg(allocation.contribution_g)}</td><td>{money(allocation.amount_paise)}</td><td>{money(memberDisbursed(allocation.member_id))}</td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{kg(allocations.reduce((sum, allocation) => sum + allocation.contribution_g, 0))}</th><th>{money(allocations.reduce((sum, allocation) => sum + allocation.amount_paise, 0))}</th><th>{money(settlement.disbursed_paise)}</th></tr></tfoot></table></div> : <p className="m-small" style={{ margin: '18px 0 0' }}>Member allocations and payment evidence are private to the seller organisation. This view shows the permitted contract summary.</p>}
    {finance && <div className="t-grid" style={{ marginTop: 20 }}>
      <Disclosure title="Reconcile verified FPO receipt">
        {settlement.verified_receipt_paise >= settlement.invoice_paise ? <Notice>The invoice is fully reconciled. Additional receipt amounts are rejected.</Notice> : <CommandForm key={`payment-${settlement.id}-${settlement.version}`} path={`/settlements/${settlement.id}/payments`} fields={[moneyField('amount', 'Independently verified receipt', settlement.invoice_paise - settlement.verified_receipt_paise), evidenceField, verificationBasis]} prepare={(values) => {
          const amount = positive(paise(values, 'amount'), 'Verified amount')
          if (amount > settlement.invoice_paise - settlement.verified_receipt_paise) throw new Error('Verified receipt exceeds the outstanding invoice.')
          return { expected_version: settlement.version, amount_paise: amount, evidence_reference: values.evidence_reference.trim(), verification_basis: values.verification_basis.trim() }
        }} submit="Record verified FPO receipt" note="This saves reconciliation evidence and the verifier identity. It does not collect, transfer or charge money." />}
      </Disclosure>
      <Disclosure title="Reconcile member disbursal">
        {!outstanding.length ? <Notice>Every member allocation is reconciled.</Notice> : <CommandForm key={`disbursal-${settlement.id}-${settlement.version}`} path={`/settlements/${settlement.id}/disbursals`} fields={[{ name: 'member_id', label: 'Member allocation', type: 'select', options: outstanding.map((allocation) => ({ value: allocation.member_id, label: `${allocation.member_id} · ${money(allocation.amount_paise - memberDisbursed(allocation.member_id))} remaining` })) }, moneyField('amount', 'Independently verified member disbursal'), evidenceField, verificationBasis]} prepare={(values) => {
          const allocation = outstanding.find((item) => item.member_id === values.member_id)
          const amount = positive(paise(values, 'amount'), 'Disbursal amount')
          if (!allocation || amount > allocation.amount_paise - memberDisbursed(allocation.member_id)) throw new Error('Disbursal exceeds this member allocation remainder.')
          return { expected_version: settlement.version, member_id: values.member_id, amount_paise: amount, evidence_reference: values.evidence_reference.trim(), verification_basis: values.verification_basis.trim() }
        }} submit="Record verified member disbursal" note="The server also checks total disbursals against verified FPO receipts after the disclosed fee. This action does not move funds." />}
      </Disclosure>
    </div>}
    {!finance && <p className="m-small" style={{ margin: '18px 0 0' }}>Only the seller organisation's separate finance reviewer can reconcile FPO receipts or member disbursals.</p>}
    {settlement.allocations && <div style={{ marginTop: 16 }}><Disclosure title="Financial evidence audit">
      {!payments.length && !disbursals.length ? <Empty>No independently verified payment or disbursal evidence has been recorded. Creating a statement does not mean the invoice was paid.</Empty> : <div className="t-table-wrap"><table className="t-table"><thead><tr><th>Record</th><th>Evidence / verification basis</th><th>Amount</th></tr></thead><tbody>{payments.map((payment, index) => <tr key={`p-${index}`}><td>FPO receipt<br /><span className="m-small">{timestamp(payment.verified_at)}</span></td><td style={{ whiteSpace: 'normal', minWidth: 180 }}>{payment.evidence_reference}<br /><span className="m-small">{payment.verification_basis}</span></td><td>{money(payment.amount_paise)}</td></tr>)}{disbursals.map((disbursal, index) => <tr key={`d-${index}`}><td>Member {disbursal.member_id}<br /><span className="m-small">{timestamp(disbursal.verified_at)}</span></td><td style={{ whiteSpace: 'normal', minWidth: 180 }}>{disbursal.evidence_reference}<br /><span className="m-small">{disbursal.verification_basis}</span></td><td>{money(disbursal.amount_paise)}</td></tr>)}</tbody></table></div>}
    </Disclosure></div>}
  </Panel>
}

export function TradeSettlementsPage() {
  const { workspace } = useTrade()
  const candidates = workspace?.contracts.filter((contract) => contract.seller_org === workspace.principal.organisation_id && contract.status === 'confirmed' && !workspace.settlements.some((settlement) => settlement.contract_id === contract.id)) ?? []
  return <TradeFrame title="Farmer settlements" subtitle="Keep the invoice obligation, independently verified FPO receipt and each member disbursal distinct.">
    {workspace && <>
      <div className="t-metrics"><Metric label="Invoice obligations" value={money(workspace.settlements.reduce((sum, settlement) => sum + settlement.invoice_paise, 0))} /><Metric label="Member allocations" value={money(workspace.settlements.reduce((sum, settlement) => sum + settlement.net_paise, 0))} /><Metric label="Verified FPO receipts" value={money(workspace.settlements.reduce((sum, settlement) => sum + settlement.verified_receipt_paise, 0))} /><Metric label="Reconciled disbursals" value={money(workspace.settlements.reduce((sum, settlement) => sum + settlement.disbursed_paise, 0))} /></div>
      {workspace.principal.role === 'fpo' && <Panel title="Calculate a final statement" subtitle="All contract quantity must have receipt records, and every claim must have a bilaterally agreed resolution.">
        {!candidates.length ? <Empty>No confirmed contract is awaiting a statement.</Empty> : <CommandForm key={candidates.map((contract) => contract.id).join(',')} path="/settlements" fields={[{ name: 'contract_id', label: 'Contract', type: 'select', options: candidates.map((contract) => ({ value: contract.id, label: `${contract.id} · ${kg(contract.quantity_g)} · ${contract.buyer_org}` })) }, { name: 'acknowledge', label: 'I reviewed receipt weights, agreed claim adjustments, member contributions and the disclosed seller fee.', type: 'checkbox' }]} prepare={(values) => ({ contract_id: values.contract_id })} submit="Calculate immutable settlement statement" note="The server calculates money in integer paise, rounds line amounts half up and allocates every remaining paise deterministically. Open claims, missing deliveries, negative net proceeds or duplicate statements are rejected." />}
      </Panel>}
      <div className="t-list">{workspace.settlements.map((settlement) => <SettlementCard key={settlement.id} settlement={settlement} />)}{!workspace.settlements.length && <Empty>No settlement statements are visible yet. Complete receiving and resolve claims first.</Empty>}</div>
    </>}
  </TradeFrame>
}
