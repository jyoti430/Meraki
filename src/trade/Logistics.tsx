import { useState } from 'react'
import { useTrade } from './TradeProvider'
import { isoDate, kg, timestamp, validateReceipt } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TradeFrame, evidenceField, g, positive, weightField } from './ui'
import type { Shipment } from './types'

export function ReceiveForm({ shipment }: { shipment: Shipment }) {
  return <CommandForm key={`receive-${shipment.id}-${shipment.version}`} path={`/shipments/${shipment.id}/receive`} submit="Record receipt and immutable weight partition" fields={[
    weightField('received', 'Total physically received', shipment.quantity_g), weightField('accepted', 'Accepted at full grade', shipment.quantity_g), weightField('downgraded', 'Downgraded at agreed rate', 0), weightField('rejected', 'Rejected', 0),
    { name: 'reason', label: 'Inspection / transit discrepancy reason', type: 'textarea', required: false, help: 'Required for any downgrade, rejection or transit shortfall. Distinguish cosmetic downgrade from safety rejection.' }, evidenceField,
  ]} prepare={(values) => {
    const received = g(values, 'received'), accepted = g(values, 'accepted'), downgraded = g(values, 'downgraded'), rejected = g(values, 'rejected')
    const reason = values.reason.trim()
    const invalid = validateReceipt(received, accepted, downgraded, rejected, reason)
    if (invalid) throw new Error(invalid)
    if (received > shipment.quantity_g) throw new Error('Received weight cannot exceed the dispatched shipment quantity.')
    if (received < shipment.quantity_g && !reason) throw new Error('Record a reason for transit shortfall.')
    return { expected_version: shipment.version, received_g: received, accepted_g: accepted, downgraded_g: downgraded, rejected_g: rejected, reason, evidence_reference: values.evidence_reference.trim() }
  }} note={`Dispatched: ${kg(shipment.quantity_g)}. Accepted + downgraded + rejected must equal received weight. The server separately records transit shortfall. A later claim cannot rewrite dispatch or receiving history.`} />
}

function ShipmentCard({ shipment }: { shipment: Shipment }) {
  const { workspace } = useTrade()
  const seller = workspace?.principal.role === 'fpo' && workspace.principal.organisation_id === shipment.seller_org
  return <Panel title={`${kg(shipment.quantity_g)} shipment`} subtitle={`${shipment.seller_org} → ${shipment.buyer_org}`} aside={<Status value={shipment.status} />}>
    <div className="t-resource-head"><ResourceId id={shipment.id} /><ActionLink to={`/trade/contracts/${shipment.contract_id}`}>Contract</ActionLink></div>
    <dl className="t-details"><Detail label="Pickup">{timestamp(shipment.pickup_at)}</Detail><Detail label="Expected delivery">{timestamp(shipment.delivery_at)}</Detail><Detail label="Packing">{shipment.packing}</Detail><Detail label="Handover record">{shipment.handover_reference}</Detail><Detail label="Lot"><ResourceId id={shipment.lot_id} /></Detail><Detail label="Dispatched at">{timestamp(shipment.dispatched_at)}</Detail></dl>
    {shipment.status === 'draft' && seller && <div style={{ marginTop: 18 }}><CommandForm key={`dispatch-${shipment.version}`} path={`/shipments/${shipment.id}/dispatch`} fields={[{ name: 'acknowledge', label: 'Packing and handover details are correct; record the physical dispatch now.', type: 'checkbox' }]} prepare={() => ({ expected_version: shipment.version })} submit="Dispatch shipment" note="The server rechecks the lot's QC release. Draft quantity already counts against stock and contract commitments." /></div>}
    {shipment.status === 'dispatched' && <div style={{ marginTop: 16 }}><ActionLink to="/trade/arrivals">Record or track buyer receipt</ActionLink></div>}
  </Panel>
}

export function TradeShipmentsPage() {
  const { workspace } = useTrade()
  const [selectedId, setSelectedId] = useState('')
  const contracts = workspace?.contracts.filter((contract) => contract.seller_org === workspace.principal.organisation_id && contract.status === 'confirmed' && contract.shipped_g < contract.quantity_g) ?? []
  const selected = contracts.find((contract) => contract.id === selectedId) ?? contracts[0]
  const lots = workspace?.lots.filter((lot) => selected && lot.qc_status === 'released' && (selected.mode === 'spot' ? selected.lot_id === lot.id : lot.forward_contract_id === selected.id) && lot.quantity_g > lot.shipped_g) ?? []
  return <TradeFrame title="Crates & shipments" subtitle="Prepare partial deliveries against a confirmed obligation and a released, exclusively eligible lot.">
    {workspace && <>
      <div className="t-metrics"><Metric label="Draft shipments" value={workspace.shipments.filter((shipment) => shipment.status === 'draft').length} help="Draft quantity already reserves stock" /><Metric label="In transit" value={workspace.shipments.filter((shipment) => shipment.status === 'dispatched').length} /><Metric label="Received shipments" value={workspace.shipments.filter((shipment) => shipment.status === 'received').length} /><Metric label="Committed shipment weight" value={kg(workspace.shipments.reduce((sum, shipment) => sum + shipment.quantity_g, 0))} /></div>
      {workspace.principal.role === 'fpo' && <Panel title="Prepare a shipment" subtitle="Multiple partial deliveries are allowed. The server checks cumulative contract and lot quantities atomically.">
        {!contracts.length ? <Empty>No confirmed contract has remaining shipment quantity. Complete bilateral confirmation first. <ActionLink to="/trade/contracts">Review contracts</ActionLink></Empty> : <>
          <label className="t-field" style={{ marginBottom: 16 }}><span>Confirmed contract</span><select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.id} · {kg(contract.quantity_g - contract.shipped_g)} remaining · {contract.buyer_org}</option>)}</select></label>
          {selected && !lots.length ? <Notice>No released eligible lot is available for this contract. Forward contracts must convert committed capacity to a harvest lot, then pass QC. <ActionLink to="/trade/lots">Open lots & QC</ActionLink></Notice> : selected && <Disclosure title={`Create partial shipment · ${kg(selected.quantity_g - selected.shipped_g)} contract quantity remaining`}><CommandForm key={`shipment-${selected.id}-${selected.version}-${lots.map((lot) => `${lot.id}:${lot.version}`).join(',')}`} path="/shipments" submit="Reserve draft shipment" fields={[
            { name: 'lot_id', label: 'Released eligible lot', type: 'select', options: lots.map((lot) => ({ value: lot.id, label: `${lot.id} · ${kg(lot.quantity_g - lot.shipped_g)} before draft reservations` })) }, weightField('quantity', 'Shipment quantity'), { name: 'pickup_at', label: 'Planned pickup (local time)', type: 'datetime-local' }, { name: 'delivery_at', label: 'Planned delivery (local time)', type: 'datetime-local' }, { name: 'packing', label: 'Crates, packing and handling details', type: 'textarea' }, { name: 'handover_reference', label: 'Handover reference' },
          ]} prepare={(values) => {
            const quantity = positive(g(values, 'quantity'), 'Shipment quantity')
            if (quantity > selected.quantity_g - selected.shipped_g) throw new Error('Shipment exceeds remaining contract quantity.')
            if (new Date(values.delivery_at) < new Date(values.pickup_at)) throw new Error('Delivery cannot precede pickup.')
            return { contract_id: selected.id, lot_id: values.lot_id, quantity_g: quantity, pickup_at: isoDate(values.pickup_at), delivery_at: isoDate(values.delivery_at), packing: values.packing.trim(), handover_reference: values.handover_reference.trim() }
          }} note="A draft reserves quantity immediately. Record dispatch separately when produce physically leaves the handover point. Releasing draft commitments requires an explicit future cancellation workflow; avoid speculative drafts." /></Disclosure>}
        </>}
      </Panel>}
      <div className="t-list">{workspace.shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} />)}{!workspace.shipments.length && <Empty>No shipment records are visible yet.</Empty>}</div>
    </>}
  </TradeFrame>
}
