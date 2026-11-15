import { useMemo, useState } from 'react'
import { ArrowLeft, Ban, CalendarDays, CircleCheck, Clock3, FileEdit, History, MapPin, Package, PencilLine, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { formatOrderDateTime } from '../data/buyerOrders'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import type { BuyerOrderStatus } from '../types'
import { usePlan } from '../context/PlanContext'
import { findCrop } from '../data/crops'
import { fmtDay, fmtKg } from '../planning/format'
import { PlanStatus, SourceTag, SupplyMeter } from '../components/ui'

function PlanImpact({ crop, active, orderType, orderId }: { crop: string; active: boolean; orderType: string; orderId: string }) {
  const { result } = usePlan()
  const profile = findCrop(crop)
  const plan = result.plans.find((p) => p.crop.name === profile?.name)
  return <section className="m-card" style={{ marginBottom: 14 }} aria-label="Planting plan impact">
    <div className="m-card-head" style={{ marginBottom: 12 }}>
      <div><h3 className="m-h3">How this order shapes the planting plan</h3><p className="m-sub">{!active ? 'Only active orders are used for planning.' : !profile ? 'Meraki has no growing reference for this crop, so it can’t be planned automatically.' : orderType === 'Indicative' ? 'Indicative demand is planned only in scenarios that include it.' : 'Committed demand is always planned first, order by order.'}</p></div>
      <SourceTag kind={orderType === 'Confirmed' ? 'order' : 'indicative'}>{orderType === 'Confirmed' ? 'Committed' : 'Indicative'}</SourceTag>
    </div>
    {active && plan && <>
      <SupplyMeter plan={plan} showLegend />
      <div className="m-row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        {(() => { const line = plan.lines.find((l) => l.order.id === orderId); return <span className="m-small"><PlanStatus plan={plan} /> &nbsp;This order: {line ? `${fmtKg(line.expectedKg)} planned of ${fmtKg(line.qtyKg)}${line.farmerConfirmedKg ? ` (${fmtKg(line.farmerConfirmedKg)} farmer-confirmed)` : ' – not yet farmer-confirmed'} · ${line.allocations.length} plots${line.sowBy ? ` · sow by ${fmtDay(line.sowBy)}` : ''}` : 'not planned'}</span> })()}
        <Link className="m-btn m-btn-primary m-btn-sm" to={`/plan#${plan.crop.id}`}>Open in plan</Link>
      </div>
    </>}
  </section>
}

const statusClass: Record<BuyerOrderStatus, string> = { Draft: 'order-status-draft', Active: 'order-status-active', Completed: 'order-status-completed', Cancelled: 'order-status-cancelled' }

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="detail-value"><small>{label}</small><div>{children || <span className="value-empty">Not provided</span>}</div></div>
}

function DetailSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return <section className="order-detail-section"><div className="detail-section-heading"><span>{icon}</span><div><h3>{title}</h3>{description && <p>{description}</p>}</div></div><div className="detail-section-content">{children}</div></section>
}

export default function BuyerOrderDetails() {
  const { orderId = '' } = useParams()
  const { orders, updateStatus } = useBuyerOrders()
  const order = orders.find((item) => item.id === orderId)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const versions = useMemo(() => order?.specificationHistory ?? [], [order])
  const selected = versions.find((version) => version.version === (selectedVersion ?? order?.specificationVersion))
  const specification = selected?.specification ?? order?.specification
  if (!order) return <div className="order-not-found"><h2>Order not found</h2><p>This order may have been removed from local demo data.</p><Link className="secondary-button" to="/demand"><ArrowLeft size={15} /> Back to buyer demand</Link></div>

  const orderKey = order.id
  const canEdit = order.status === 'Draft' || order.status === 'Active'
  function confirmStatus(next: 'Cancelled' | 'Completed') {
    const action = next === 'Cancelled' ? 'cancel' : 'mark as completed'
    if (window.confirm(`Are you sure you want to ${action} ${orderKey}?`)) updateStatus(orderKey, next)
  }

  return <div className="buyer-order-page buyer-order-detail-page">
    <div className="buyer-order-page-top detail-page-top"><div><Link className="back-link" to="/demand"><ArrowLeft size={15} /> Buyer demand</Link><div className="detail-title-line"><h2>{order.id}</h2><span className={`order-status-pill ${statusClass[order.status]}`}><i />{order.status}</span></div><p>{order.buyer.name} <span className="detail-title-divider">·</span> {order.product.crop}{order.product.variety ? `, ${order.product.variety}` : ''}</p></div><div className="buyer-order-top-actions"><span className="detail-version-chip"><History size={14} /> Spec v{order.specificationVersion}</span>{canEdit && <Link className="primary-button" to={`/buyer-orders/${order.id}/edit`}><PencilLine size={15} /> Edit order</Link>}</div></div>

    <div className="order-detail-meta"><div><span><Clock3 size={14} /> Created</span><strong>{formatOrderDateTime(order.createdAt)}</strong></div><div><span><Clock3 size={14} /> Last updated</span><strong>{formatOrderDateTime(order.updatedAt)}</strong></div><div><span><Package size={14} /> Order type</span><strong>{order.product.orderType}</strong></div></div>

    {canEdit && <div className="order-lifecycle-bar"><div><strong>{order.status === 'Draft' ? 'This order is a draft.' : 'This order is active.'}</strong><span>{order.status === 'Draft' ? 'Complete the required information to activate it.' : 'Order requirements can be edited and specification changes are versioned.'}</span></div><div className="lifecycle-actions">{order.status === 'Draft' && <Link to={`/buyer-orders/${order.id}/edit`} className="secondary-button"><FileEdit size={14} /> Complete draft</Link>}{order.status === 'Active' && <button type="button" className="secondary-button" onClick={() => confirmStatus('Completed')}><CircleCheck size={14} /> Mark completed</button>}<button type="button" className="cancel-order-button" onClick={() => confirmStatus('Cancelled')}><Ban size={14} /> Cancel order</button></div></div>}
    {!canEdit && <div className={`order-readonly-notice ${order.status === 'Cancelled' ? 'cancelled-notice' : ''}`}><ShieldCheck size={16} /> This {order.status.toLowerCase()} order is read-only.</div>}

    <PlanImpact crop={order.product.crop} active={order.status === 'Active'} orderType={order.product.orderType} orderId={order.id} />
    <div className="order-detail-layout"><div className="order-detail-main">
      <DetailSection icon={<MapPin size={17} />} title="Buyer information" description="Buyer contact and destination for this order.">
        <div className="detail-values-grid"><Value label="Buyer name">{order.buyer.name}</Value><Value label="Contact person">{order.buyer.contactPerson}</Value><Value label="Email">{order.buyer.email}</Value><Value label="Phone">{order.buyer.phone}</Value><Value label="Destination country">{order.buyer.destinationCountry}</Value><Value label="Destination city / port">{order.buyer.destinationCityPort}</Value></div>
      </DetailSection>
      <DetailSection icon={<Package size={17} />} title="Product and delivery" description="Requested crop, quantity and timing.">
        <div className="detail-values-grid"><Value label="Crop">{order.product.crop}</Value><Value label="Variety">{order.product.variety}</Value><Value label="Required quantity">{order.product.requiredQuantityKg === '' ? '' : `${Number(order.product.requiredQuantityKg).toLocaleString()} kg`}</Value><Value label="Preferred grade">{order.product.preferredGrade}</Value><Value label="Delivery start">{order.product.deliveryStartDate || ''}</Value><Value label="Delivery end">{order.product.deliveryEndDate || ''}</Value><Value label="Order type">{order.product.orderType}</Value></div>
      </DetailSection>
      <DetailSection icon={<History size={17} />} title="Buyer quality specification" description="Buyer-defined criteria recorded for this order.">
        <div className="version-bar"><div><strong>Specification version {selected?.version ?? order.specificationVersion}</strong><span>{selected ? `${selected.version === 1 ? 'Created' : 'Changed'} ${formatOrderDateTime(selected.changedAt)} by ${selected.changedBy}` : 'Current specification'}</span></div>{versions.length > 1 && <label>View version<select value={selected?.version ?? order.specificationVersion} onChange={(event) => setSelectedVersion(Number(event.target.value))}>{versions.slice().reverse().map((version) => <option value={version.version} key={version.version}>Version {version.version}{version.version === order.specificationVersion ? ' (current)' : ''}</option>)}</select></label>}</div>
        {specification?.criteria.length ? <div className="specification-table-wrap"><table className="specification-table"><thead><tr><th>ATTRIBUTE</th><th>MINIMUM</th><th>MAXIMUM</th><th>REQUIREMENT</th><th>NOTES</th></tr></thead><tbody>{specification.criteria.map((criterion) => <tr key={criterion.id}><td><strong>{criterion.attribute}</strong><small>{criterion.unit}</small></td><td>{criterion.minimum ? `${criterion.minimum} ${criterion.unit}` : '—'}</td><td>{criterion.maximum ? `${criterion.maximum} ${criterion.unit}` : '—'}</td><td><span className={`criterion-requirement ${criterion.required ? 'criterion-required' : ''}`}>{criterion.required ? 'Required' : 'Optional'}</span></td><td>{criterion.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="detail-empty-inline">No quality criteria recorded in this specification version.</div>}
        <div className="detail-safety-grid"><div><strong>Laboratory report</strong><span>{specification?.safetyRequirements.laboratoryReportRequired ? 'Required' : 'Not required'}</span></div><div><strong>Residue testing</strong><span>{specification?.safetyRequirements.residueTestingRequired ? 'Required' : 'Not required'}</span></div><div><strong>Phytosanitary documentation</strong><span>{specification?.safetyRequirements.phytosanitaryDocumentationRequired ? 'Required' : 'Not required'}</span></div><div className="detail-other-docs"><strong>Other buyer-specific documentation</strong><span>{specification?.safetyRequirements.otherDocumentation || 'None specified'}</span></div></div>
        <p className="detail-compliance-note">Recorded buyer requirements do not represent a compliance determination.</p>
      </DetailSection>
      <DetailSection icon={<CalendarDays size={17} />} title="Packaging and commercial terms" description="Packaging, pricing and payment details.">
        <div className="detail-values-grid"><Value label="Packaging type">{order.commercial.packagingType}</Value><Value label="Agreed price per kg">{order.commercial.agreedPricePerKg === '' ? '' : `${order.commercial.currency} ${Number(order.commercial.agreedPricePerKg).toLocaleString()}`}</Value><Value label="Currency">{order.commercial.currency}</Value><Value label="Payment terms">{order.commercial.paymentTerms}</Value><Value label="Packaging instructions">{order.commercial.packagingInstructions}</Value><Value label="Additional instructions">{order.commercial.additionalInstructions}</Value></div>
      </DetailSection>
    </div><aside className="order-detail-aside"><div className="detail-aside-heading"><History size={16} /><h3>Specification history</h3></div><p>Previous buyer requirements stay available when specifications change.</p><div className="history-timeline">{versions.slice().reverse().map((version) => <button type="button" key={version.version} className={`history-entry ${version.version === (selected?.version ?? order.specificationVersion) ? 'history-entry-selected' : ''}`} onClick={() => setSelectedVersion(version.version)}><span className="history-marker" /><span className="history-entry-copy"><strong>Version {version.version}{version.version === order.specificationVersion && <i>Current</i>}</strong><small>{formatOrderDateTime(version.changedAt)}</small><small>{version.changedBy}</small></span></button>)}</div><div className="history-retention-note">Each saved version preserves the buyer's criteria and documentation requirements at that point in time.</div></aside></div>
    <div className="detail-bottom-actions"><Link className="secondary-button" to="/demand"><ArrowLeft size={15} /> Back to buyer demand</Link>{canEdit && <Link className="primary-button" to={`/buyer-orders/${order.id}/edit`}><PencilLine size={15} /> Edit order</Link>}</div>
  </div>
}
