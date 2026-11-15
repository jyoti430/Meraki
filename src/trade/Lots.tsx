import { useTrade } from './TradeProvider'
import { isoDate, kg, localDateTime, timestamp } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TradeFrame, contributions, g, memberField, positive, reasonField, weightField, whole } from './ui'
import type { Lot } from './types'

function LotRecord({ lot, review = false }: { lot: Lot; review?: boolean }) {
  const { workspace } = useTrade()
  const ownFpo = workspace?.principal.role === 'fpo' && workspace.principal.organisation_id === lot.seller_org
  const assignedReviewer = workspace?.principal.role === 'qc_reviewer' && workspace.principal.organisation_id === lot.seller_org
  const latestInspection = lot.inspections[lot.inspections.length - 1]
  return <Panel title={`${lot.crop} · ${lot.variety} · grade ${lot.grade}`} subtitle={`${kg(lot.quantity_g)} harvested ${lot.harvest_date}`} aside={<Status value={lot.qc_status} />}>
    <div className="t-resource-head"><ResourceId id={lot.id} />{lot.forward_contract_id && <span className="m-tag m-tag-order">Exclusive forward-contract stock</span>}</div>
    <dl className="t-details"><Detail label="Seller organisation">{lot.seller_org}</Detail><Detail label="Pickup deadline">{timestamp(lot.pickup_deadline)}</Detail><Detail label="Reserved / shipped">{kg(lot.reserved_g)} reserved · {kg(lot.shipped_g)} shipped</Detail><Detail label="Evidence records">{lot.inspections.length} inspections · {lot.reviews.length} reviewer decisions</Detail></dl>
    {lot.forward_contract_id && <div style={{ marginTop: 14 }}><ActionLink to={`/trade/contracts/${lot.forward_contract_id}`}>Reserved contract</ActionLink></div>}
    {latestInspection?.safety_hold && <div style={{ marginTop: 16 }}><Notice error>The latest inspection records a safety hold. Photos or declarations cannot establish chemical safety. An authorised reviewer must evaluate a later safe inspection before release.</Notice></div>}
    <div style={{ marginTop: 18 }}><Disclosure title="Inspection evidence and review history" open={review}>
      {lot.inspections.length ? <div className="t-list">{lot.inspections.map((inspection, index) => <div key={inspection.id || `${inspection.sample_id}-${index}`}>
        <div className="m-row" style={{ marginBottom: 9 }}><strong>Sample {inspection.sample_id}</strong><Status value={inspection.safety_hold ? 'hold' : 'recorded'} /></div>
        <dl className="t-details"><Detail label="Protocol">{inspection.protocol} · version {inspection.protocol_version}</Detail><Detail label="Observed grade / defects">{inspection.observed_grade} · {inspection.defects}</Detail><Detail label="Inspection extent">{kg(inspection.inspected_weight_g)} · {inspection.sample_count} samples</Detail><Detail label="Issuer / time">{inspection.issuer} · {timestamp(inspection.inspected_at)}</Detail><Detail label="Private report reference">{inspection.report_reference}</Detail></dl>
      </div>)}</div> : <Empty>No inspection evidence recorded. A released status requires an assigned reviewer decision after evidence is recorded.</Empty>}
      {lot.reviews.length > 0 && <div className="t-table-wrap" style={{ marginTop: 16 }}><table className="t-table"><thead><tr><th>Decision</th><th>Reason</th><th>Recorded at</th></tr></thead><tbody>{lot.reviews.map((item, index) => <tr key={index}><td><Status value={item.decision} /></td><td style={{ whiteSpace: 'normal' }}>{item.reason}</td><td>{timestamp(item.reviewed_at)}</td></tr>)}</tbody></table></div>}
    </Disclosure></div>
    {!review && ownFpo && <div style={{ marginTop: 12 }}><Disclosure title="Record a new lot inspection"><CommandForm key={`${lot.id}-${lot.version}`} path={`/lots/${lot.id}/inspections`} submit="Record inspection and place on review hold" fields={[
      { name: 'sample_id', label: 'Sample identity' }, { name: 'protocol', label: 'Inspection protocol' }, { name: 'protocol_version', label: 'Protocol version' }, weightField('inspected_weight', 'Inspected weight'), { name: 'sample_count', label: 'Sample count', type: 'number', min: '1', step: '1' }, { name: 'observed_grade', label: 'Observed grade' }, { name: 'defects', label: 'Observed defects / limitations', type: 'textarea', help: 'Record the actual observation. Use “none observed in this sample” where applicable; this does not establish hidden-defect or chemical safety.' }, { name: 'report_reference', label: 'Private inspection report reference' }, { name: 'issuer', label: 'Inspection issuer' }, { name: 'inspected_at', label: 'Inspected at (local time)', type: 'datetime-local', value: localDateTime(new Date().toISOString()) }, { name: 'safety_hold', label: 'This inspection identifies an unresolved safety hold.', type: 'checkbox', required: false },
    ]} prepare={(values) => ({ expected_version: lot.version, sample_id: values.sample_id.trim(), protocol: values.protocol.trim(), protocol_version: values.protocol_version.trim(), inspected_weight_g: positive(g(values, 'inspected_weight'), 'Inspected weight'), sample_count: whole(values.sample_count, 'Sample count', 1), observed_grade: values.observed_grade.trim(), defects: values.defects.trim(), report_reference: values.report_reference.trim(), issuer: values.issuer.trim(), inspected_at: isoDate(values.inspected_at), safety_hold: values.safety_hold === 'true' })} note="A new evidence record is immutable and resets any prior release to pending. QC release is scoped to the recorded protocol; it is not certification." /></Disclosure></div>}
    {review && assignedReviewer && <div style={{ marginTop: 16 }}><CommandForm key={`review-${lot.id}-${lot.version}`} path={`/lots/${lot.id}/reviews`} fields={[{ name: 'decision', label: 'Assigned reviewer decision', type: 'select', options: [{ value: 'hold', label: 'Maintain hold' }, { value: 'release', label: 'Release under recorded QC scope' }] }, reasonField]} prepare={(values) => ({ expected_version: lot.version, decision: values.decision, reason: values.reason.trim() })} submit="Record reviewer decision" note="Release requires recorded inspection evidence and no unresolved safety hold. The server verifies reviewer assignment and retains every decision." /></div>}
    {!review && <div className="m-row" style={{ marginTop: 16 }}><ActionLink to="/trade/review">Release review</ActionLink>{lot.qc_status === 'released' && <ActionLink to="/trade/shipments">Prepare shipment</ActionLink>}</div>}
  </Panel>
}

export function TradeLotsPage() {
  const { workspace } = useTrade()
  const ownFpo = workspace?.principal.role === 'fpo'
  return <TradeFrame title="Lots & inspection" subtitle="Keep harvest identity, member contributions and scoped quality evidence linked to every physical lot.">
    {workspace && <>
      <div className="t-metrics"><Metric label="Visible lots" value={workspace.lots.length} /><Metric label="Awaiting review / held" value={workspace.lots.filter((lot) => lot.qc_status !== 'released').length} /><Metric label="Released quantity" value={kg(workspace.lots.filter((lot) => lot.qc_status === 'released').reduce((sum, lot) => sum + lot.quantity_g, 0))} help="Includes reserved quantities" /><Metric label="Inspection records" value={workspace.lots.reduce((sum, lot) => sum + lot.inspections.length, 0)} /></div>
      {ownFpo && <Panel title="Create a harvested lot" subtitle="New lots start on hold. Member weights become the settlement contribution basis."><Disclosure title="Add lot details and member contributions"><CommandForm key={workspace.principal.id} path="/lots" submit="Create held lot" fields={[{ name: 'crop', label: 'Crop' }, { name: 'variety', label: 'Variety' }, { name: 'grade', label: 'Declared grade' }, weightField('quantity', 'Harvested quantity'), { name: 'harvest_date', label: 'Actual harvest date', type: 'date' }, { name: 'pickup_deadline', label: 'Pickup deadline (local time)', type: 'datetime-local' }, memberField]} prepare={(values) => { const quantity = positive(g(values, 'quantity'), 'Quantity'); return { crop: values.crop.trim(), variety: values.variety.trim(), grade: values.grade.trim(), quantity_g: quantity, harvest_date: values.harvest_date, pickup_deadline: isoDate(values.pickup_deadline), member_contributions: contributions(values, quantity) } }} note="A forward contract's committed harvest must be created through that contract's conversion form, so reserved capacity cannot leak into the spot market." /></Disclosure></Panel>}
      <div className="t-list">{workspace.lots.map((lot) => <LotRecord lot={lot} key={lot.id} />)}{!workspace.lots.length && <Empty>No lots are visible to this identity. Create a harvested lot as its FPO seller, or convert a confirmed forward contract's committed capacity.</Empty>}</div>
    </>}
  </TradeFrame>
}

export function TradeReviewPage() {
  const { workspace } = useTrade()
  return <TradeFrame title="QC release review" subtitle="An assigned reviewer records a reasoned release or hold after checking private inspection evidence.">
    {workspace && <>
      {workspace.principal.role !== 'qc_reviewer' && <Notice>This identity can inspect visible records. Release decisions require the separately assigned QC reviewer; use explicit synthetic actor switching to exercise that development role.</Notice>}
      <div className="t-list">{workspace.lots.map((lot) => <LotRecord lot={lot} review key={lot.id} />)}{!workspace.lots.length && <Empty>No lots are assigned or visible for review. Missing reports are not treated as passed inspections.</Empty>}</div>
    </>}
  </TradeFrame>
}
