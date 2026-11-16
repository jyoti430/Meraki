import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { g, paise, positive, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, termFields, termsFrom, weightField, type FieldSpec } from './ui'
import { timestamp, kg, money } from './calculations'
import type { Proposal, Requirement } from './types'

const moneyField = (name: string, label: string): FieldSpec => ({ name, label: label + ' (₹)', type: 'number', min: '0.01', step: '0.01' })
const draftFields: FieldSpec[] = [
  { name: 'crop', label: 'Crop' }, { name: 'variety', label: 'Variety' }, { name: 'grade', label: 'Required grade' },
  weightField('quantity', 'Required quantity'), moneyField('maximum', 'Maximum price per kg'),
  { name: 'proposal_deadline', label: 'Proposal deadline', type: 'datetime-local' }, ...termFields(),
]
function requirementBody(v: Record<string, string>) {
  return { ...termsFrom(v), crop: v.crop.trim(), variety: v.variety.trim(), grade: v.grade.trim(),
    quantity_g: positive(g(v, 'quantity'), 'Quantity'), maximum_price_paise_per_kg: positive(paise(v, 'maximum'), 'Maximum price'),
    proposal_deadline: new Date(v.proposal_deadline).toISOString() }
}

function RequirementCard({ item }: { item: Requirement }) {
  return <article className="t-opportunity"><div className="t-opportunity-head"><div><span className="m-tag m-tag-order">Exporter requirement</span><h3>{item.crop} <span className="m-small">{item.variety}</span></h3><p className="m-small">{kg(item.quantity_g)} · grade {item.grade} · {item.owner_org}</p></div><Status value={item.status} /></div>
    <dl className="t-details"><Detail label="Delivery window">{timestamp(item.terms.delivery_start)} – {timestamp(item.terms.delivery_end)}</Detail><Detail label="Proposal deadline">{timestamp(item.proposal_deadline)}</Detail><Detail label="Buyer maximum">{money(item.maximum_price_paise_per_kg)} / kg</Detail><Detail label="Buyer criteria">{item.terms.quality_specification?.length || 0} criteria</Detail></dl>
    <div className="t-opportunity-foot"><span className="m-small">{item.proposal_count} submitted proposal(s) · {kg(item.allocated_g ?? 0)} allocated · {kg(item.remaining_g ?? item.quantity_g)} remaining</span><Link className="m-link" to={'/trade/requirements/' + item.id}>Review requirement →</Link></div></article>
}

export function TradeRequirementsPage() {
  const { workspace } = useTrade()
  const [query, setQuery] = useState('')
  const exporter = workspace?.principal.role === 'exporter'
  const items = (workspace?.requirements || []).filter((i) => !exporter || i.owner_org === workspace?.principal.organisation_id)
    .filter((i) => (i.id + ' ' + i.crop + ' ' + i.variety + ' ' + i.grade).toLowerCase().includes(query.toLowerCase()))
  return <TradeFrame title="Buyer requirements & proposals" subtitle="Exporters publish demand; FPOs respond with consented, capacity-backed proposals. Award remains a human decision.">
    {workspace && <><Notice>These records use the synthetic Part 3 trade service, separate from Part 1 projections and Part 2 shared capacity. No real supply or order is implied.</Notice>
      <div className="t-metrics"><Metric label="Visible requirements" value={items.length} /><Metric label="My active proposals" value={workspace.proposals.filter((p) => p.supplier_org === workspace.principal.organisation_id && p.status === 'submitted').length} /><Metric label="Requirement contracts" value={workspace.contracts.filter((c) => c.requirement_id).length} /></div>
      <div className="t-grid"><Panel title="Requirements" subtitle="Search crop, variety, grade or ID." aside={<ClipboardList size={22} color="var(--forest)" />}><div className="t-filter" style={{ marginBottom: 16 }}><label><span className="sr-only">Search requirements</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search crop, variety, grade or ID" /></label></div>
        <div className="t-list">{items.map((item) => <RequirementCard key={item.id} item={item} />)}{!items.length && <Empty>No published requirements match this view.</Empty>}</div></Panel>
        <div className="t-list">{exporter ? <Panel title="Create buyer requirement" subtitle="Save a draft, review it, then publish for proposals."><Disclosure title="New procurement requirement"><CommandForm path="/requirements" submit="Save requirement draft" success="Draft saved on the server." fields={draftFields} prepare={requirementBody} note="Publishing does not award a proposal or create an order." /></Disclosure></Panel> : <Panel title="My proposals" subtitle="Statuses are private to your organisation."><div className="t-list">{workspace.proposals.filter((p) => p.supplier_org === workspace.principal.organisation_id).map((p) => <ProposalCard key={p.id} proposal={p} />)}{!workspace.proposals.some((p) => p.supplier_org === workspace.principal.organisation_id) && <Empty>No proposals submitted yet.</Empty>}</div></Panel>}
        <Panel title="Supply-driven harvested lots" subtitle="Sell actual harvested produce independently of buyer requirements."><p>Only harvested lots with a recorded QC release can enter spot bidding.</p><Link className="m-link" to="/trade/lots">Open lots & QC →</Link><p><Link className="m-link" to="/trade">Open market and bids →</Link></p></Panel></div></div>
    </>}
  </TradeFrame>
}

function ProposalCard({ proposal, requirement, owner = false }: { proposal: Proposal; requirement?: Requirement; owner?: boolean }) {
  const { command, writesEnabled } = useTrade()
  const [error, setError] = useState('')
  const act = async (action: 'withdraw' | 'reject') => {
    if (action === 'reject' && !window.confirm('Reject this proposal and release its capacity reservation?')) return
    try { setError(''); await command('/proposals/' + proposal.id + '/' + action, { expected_version: proposal.version, ...(action === 'reject' ? { reason: 'Exporter selected another procurement outcome.' } : {}) }, crypto.randomUUID()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update proposal.') }
  }
  return <div className="t-opportunity"><div className="t-opportunity-head"><div><strong>{owner ? proposal.supplier_org : requirement?.crop || 'Proposal'}</strong><p className="m-small">{kg(proposal.quantity_g)} · grade {proposal.grade} · expected {timestamp(proposal.expected_availability)}</p></div><Status value={proposal.status} /></div>
    <dl className="t-details"><Detail label="Price">{money(proposal.price_paise_per_kg)} / kg</Detail><Detail label="Evidence reference">{proposal.evidence_reference === undefined ? 'Private to supplier' : proposal.evidence_reference || 'Not supplied'}</Detail><Detail label="Notes">{proposal.notes || '—'}</Detail><Detail label="Submitted">{timestamp(proposal.submitted_at)}</Detail></dl>
    {error && <Notice error>{error}</Notice>}
    {proposal.status === 'submitted' && owner && requirement && proposal.quantity_g > (requirement.remaining_g ?? requirement.quantity_g) && <Notice>This proposal exceeds the remaining requirement. Reject it or ask the FPO to withdraw and submit a smaller quantity.</Notice>}
    {proposal.status === 'submitted' && !owner && <button className="m-btn m-btn-secondary m-btn-sm" disabled={!writesEnabled} onClick={() => void act('withdraw')}>Withdraw proposal</button>}
    {proposal.status === 'submitted' && owner && requirement?.status === 'published' && <div className="m-row" style={{ flexWrap: 'wrap' }}>
      {proposal.quantity_g <= (requirement.remaining_g ?? requirement.quantity_g) && <CommandForm key={'award-' + proposal.id + '-' + requirement.version} path={'/requirements/' + proposal.requirement_id + '/award'} submit="Award this proposal" prepare={() => { if (!window.confirm('Award this proposal? Both organisations must confirm a provisional contract.')) throw new Error('Award cancelled.'); return { expected_version: requirement.version, proposal_id: proposal.id } }} success="Award created; both parties must confirm." note="No automatic cheapest-proposal selection." />}
      <button type="button" className="m-btn m-btn-ghost m-btn-sm" disabled={!writesEnabled} onClick={() => void act('reject')}>Reject</button></div>}</div>
}

export function TradeRequirementDetailsPage() {
  const { requirementId = '' } = useParams()
  const { workspace } = useTrade()
  const requirement = workspace?.requirements.find((i) => i.id === requirementId)
  const own = Boolean(workspace && requirement?.owner_org === workspace.principal.organisation_id)
  const proposals = workspace?.proposals.filter((p) => p.requirement_id === requirementId) ?? []
  const visibleContracts = workspace?.contracts.filter((c) => c.requirement_id === requirementId) ?? []
  const matching = workspace?.capacities.filter((c) => requirement && c.consented && c.reviewed && c.crop === requirement.crop && c.variety === requirement.variety && c.grade === requirement.grade && c.grade_protocol === requirement.terms.grade_protocol && c.available_g > 0 && new Date(c.delivery_start || '') <= new Date(requirement.terms.delivery_start) && new Date(c.delivery_end || '') >= new Date(requirement.terms.delivery_end)) ?? []
  const prepareProposal = (v: Record<string, string>) => {
    if (!requirement) throw new Error('Refresh the requirement before submitting.')
    const quantity = positive(g(v, 'quantity'), 'Quantity')
    if (quantity > (requirement.remaining_g ?? requirement.quantity_g)) throw new Error('Quantity exceeds the requirement remaining quantity.')
    const capacity = matching.find((c) => c.id === v.capacity_id)
    if (!capacity || quantity > capacity.available_g) throw new Error('Quantity exceeds the selected qualified capacity.')
    return { quantity_g: quantity, grade: requirement.grade, price_paise_per_kg: positive(paise(v, 'price'), 'Price'), capacity_id: capacity.id, expected_availability: new Date(v.expected_availability).toISOString(), evidence_reference: v.evidence_reference, notes: v.notes }
  }
  return <TradeFrame title={requirement ? requirement.crop + ' requirement' : 'Requirement details'} subtitle="Buyer specification, proposal comparison and contract traceability.">
    {workspace && (!requirement ? <Empty>This requirement is unavailable to this identity. <Link to="/trade/requirements">Back to requirements</Link></Empty> : <>
      <Link className="m-link" to="/trade/requirements"><ArrowLeft size={15} /> Back to requirements</Link>
      <div className="t-metrics"><Metric label="Required quantity" value={kg(requirement.quantity_g)} /><Metric label="Allocated to active awards" value={kg(requirement.allocated_g ?? 0)} /><Metric label="Remaining requirement" value={kg(requirement.remaining_g ?? requirement.quantity_g)} /><Metric label="Proposal deadline" value={timestamp(requirement.proposal_deadline)} /><Metric label="Version" value={requirement.version} /></div>
      <div className="t-grid"><div className="t-list"><Panel title="Buyer specification" subtitle={requirement.crop + ' · ' + requirement.variety + ' · grade ' + requirement.grade}><ResourceId id={requirement.id} /><dl className="t-details" style={{ margin: '16px 0' }}><Detail label="Status"><Status value={requirement.status} /></Detail><Detail label="Allocation">{(requirement.allocation_status ?? 'unallocated').replace(/_/g, ' ')}</Detail></dl><TermsView terms={requirement.terms} /></Panel>
        <Panel title="Proposal comparison" subtitle="Facts are shown side by side; the exporter makes the selection."><div className="t-list">{proposals.map((p) => <ProposalCard key={p.id} proposal={p} requirement={requirement} owner={own} />)}{!proposals.length && <Empty>No submitted proposals are visible.</Empty>}</div></Panel></div>
        <div className="t-list">{own && requirement.status === 'draft' && <Panel title="Publish requirement"><CommandForm key={requirement.version} path={'/requirements/' + requirement.id + '/publish'} submit="Publish for FPO proposals" prepare={() => ({ expected_version: requirement.version })} note="Publication does not award or reserve supply." /></Panel>}
        {!own && requirement.status === 'published' && <Panel title="Submit supply proposal" subtitle="Consent, evidence review and capacity are checked by the server.">{!matching.length ? <Empty>No matching consented, reviewed capacity covers this delivery window. Forecast supply is not harvested inventory.</Empty> : workspace.proposals.some((p) => p.requirement_id === requirement.id && p.supplier_org === workspace.principal.organisation_id && p.status === 'submitted') ? <Notice>An active proposal already exists. Withdraw it before resubmitting.</Notice> : <CommandForm path={'/requirements/' + requirement.id + '/proposals'} submit="Submit capacity-backed proposal" fields={[{ ...weightField('quantity', 'Proposed partial or full quantity'), min: '0.001', max: String((requirement.remaining_g ?? requirement.quantity_g) / 1000), value: String(Math.min(requirement.remaining_g ?? requirement.quantity_g, matching[0]?.available_g ?? 0) / 1000) }, moneyField('price', 'Offer price per kg'), { name: 'capacity_id', label: 'Qualified capacity', type: 'select', options: matching.map((c) => ({ value: c.id, label: c.id + ' · ' + kg(c.available_g) + ' available' })) }, { name: 'expected_availability', label: 'Expected availability', type: 'datetime-local' }, { name: 'evidence_reference', label: 'Evidence reference (optional)', required: false }, { name: 'notes', label: 'Delivery commitment and notes', type: 'textarea', required: false }]} prepare={prepareProposal} note="Multiple FPOs may cover the requirement through separate explicit awards. Propose no more than your capacity and the requirement remaining quantity. References are not uploads or verified evidence; the server validates every award atomically." />}</Panel>}
        {!!visibleContracts.length && <Panel title="Award contracts"><p>{kg(requirement.allocated_g ?? 0)} allocated across active contracts. Provisional awards still need both parties’ confirmation. Links below include only contracts available to this organisation.</p>{visibleContracts.map(contract => <p key={contract.id}><Link className="m-link" to={'/trade/contracts/' + contract.id}>Open contract {contract.id} ({contract.status}) →</Link></p>)}</Panel>}
        {own && <Notice>Supplier capacity and evidence references are organisation-scoped by the API.</Notice>}</div></div>
    </>)}
  </TradeFrame>
}
