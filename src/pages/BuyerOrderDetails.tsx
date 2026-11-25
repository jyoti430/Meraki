import { useMemo, useState } from 'react'
import { ArrowLeft, Ban, CalendarDays, CircleCheck, Clock3, FileEdit, History, MapPin, Package, PencilLine, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import type { BuyerOrderStatus } from '../types'
import { usePlan } from '../context/PlanContext'
import { findCrop } from '../data/crops'
import { PlanStatus, SourceTag, SupplyMeter } from '../components/ui'
import { cropLabel, formatDate, formatNumber, formatINR, statusTranslationKey, useI18n } from '../i18n'

function PlanImpact({ crop, active, orderType, orderId }: { crop: string; active: boolean; orderType: string; orderId: string }) {
  const { t, lang } = useI18n()
  const { result } = usePlan()
  const profile = findCrop(crop)
  const plan = result.plans.find((p) => p.crop.name === profile?.name)
  return <section className="m-card" style={{ marginBottom: 14 }} aria-label={t('demand_planting_impact')}>
    <div className="m-card-head" style={{ marginBottom: 12 }}>
      <div><h3 className="m-h3">{t('demand_planting_impact')}</h3><p className="m-sub">{!active ? t('order_impact_inactive') : !profile ? t('demand_unknown_crop', { crop: cropLabel(crop, t) }) : orderType === 'Indicative' ? t('order_impact_indicative') : t('order_impact_committed')}</p></div>
      <SourceTag kind={orderType === 'Confirmed' ? 'order' : 'indicative'}>{orderType === 'Confirmed' ? t('demand_committed') : t('demand_indicative')}</SourceTag>
    </div>
    {active && plan && <>
      <SupplyMeter plan={plan} showLegend />
      <div className="m-row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        {(() => { const line = plan.lines.find((l) => l.order.id === orderId); return <span className="m-small"><PlanStatus plan={plan} /> &nbsp;{line ? <>{t('order_plan_line', { expected: formatNumber(line.expectedKg, lang), quantity: formatNumber(line.qtyKg, lang), plots: formatNumber(line.allocations.length, lang) })}{line.farmerConfirmedKg ? ` · ${t('order_plan_confirmed', { quantity: formatNumber(line.farmerConfirmedKg, lang) })}` : ` · ${t('order_plan_unconfirmed')}`}{line.sowBy ? ` · ${t('order_plan_sowing', { date: formatDate(line.sowBy, lang) })}` : ''}</> : t('order_plan_not_planned')}</span> })()}
        <Link className="m-btn m-btn-primary m-btn-sm" to={`/plan#${plan.crop.id}`}>{t('order_plan_open')}</Link>
      </div>
    </>}
  </section>
}

const statusClass: Record<BuyerOrderStatus, string> = { Draft: 'order-status-draft', Active: 'order-status-active', Completed: 'order-status-completed', Cancelled: 'order-status-cancelled' }

function Value({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useI18n()
  return <div className="detail-value"><small>{label}</small><div>{children || <span className="value-empty">{t('order_value_missing')}</span>}</div></div>
}

function DetailSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return <section className="order-detail-section"><div className="detail-section-heading"><span>{icon}</span><div><h3>{title}</h3>{description && <p>{description}</p>}</div></div><div className="detail-section-content">{children}</div></section>
}

export default function BuyerOrderDetails() {
  const { t, lang } = useI18n()
  const { orderId = '' } = useParams()
  const { orders, updateStatus } = useBuyerOrders()
  const order = orders.find((item) => item.id === orderId)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const versions = useMemo(() => order?.specificationHistory ?? [], [order])
  const selected = versions.find((version) => version.version === (selectedVersion ?? order?.specificationVersion))
  const specification = selected?.specification ?? order?.specification
  if (!order) return <div className="order-not-found"><h2>{t('order_not_found')}</h2><p>{t('order_removed_local')}</p><Link className="secondary-button" to="/demand"><ArrowLeft size={15} /> {t('order_back_demand')}</Link></div>

  const orderKey = order.id
  const canEdit = order.status === 'Draft' || order.status === 'Active'
  function confirmStatus(next: 'Cancelled' | 'Completed') {
    const prompt = next === 'Cancelled' ? t('order_confirm_cancel', { id: orderKey }) : t('order_confirm_complete', { id: orderKey })
    if (window.confirm(prompt)) updateStatus(orderKey, next)
  }

  return <div className="buyer-order-page buyer-order-detail-page">
    <div className="buyer-order-page-top detail-page-top"><div><Link className="back-link" to="/demand"><ArrowLeft size={15} /> {t('nav_demand')}</Link><div className="detail-title-line"><h2>{order.id}</h2><span className={`order-status-pill ${statusClass[order.status]}`}><i />{t(statusTranslationKey(order.status) ?? 'status')}</span></div><p>{order.buyer.name} <span className="detail-title-divider">·</span> {cropLabel(order.product.crop, t)}{order.product.variety ? `, ${order.product.variety}` : ''}</p></div><div className="buyer-order-top-actions"><span className="detail-version-chip"><History size={14} /> {t('order_spec_version_short', { version: formatNumber(order.specificationVersion, lang) })}</span>{canEdit && <Link className="primary-button" to={`/buyer-orders/${order.id}/edit`}><PencilLine size={15} /> {t('demand_edit')}</Link>}</div></div>

    <div className="order-detail-meta"><div><span><Clock3 size={14} /> {t('order_created')}</span><strong>{formatDate(order.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></div><div><span><Clock3 size={14} /> {t('order_last_updated')}</span><strong>{formatDate(order.updatedAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong></div><div><span><Package size={14} /> {t('order_type')}</span><strong>{order.product.orderType === 'Confirmed' ? t('demand_committed') : t('demand_indicative')}</strong></div></div>

    {canEdit && <div className="order-lifecycle-bar"><div><strong>{t(order.status === 'Draft' ? 'order_lifecycle_draft' : 'order_lifecycle_active')}</strong><span>{t(order.status === 'Draft' ? 'order_lifecycle_complete' : 'order_lifecycle_editable')}</span></div><div className="lifecycle-actions">{order.status === 'Draft' && <Link to={`/buyer-orders/${order.id}/edit`} className="secondary-button"><FileEdit size={14} /> {t('order_complete_draft')}</Link>}{order.status === 'Active' && <button type="button" className="secondary-button" onClick={() => confirmStatus('Completed')}><CircleCheck size={14} /> {t('order_mark_completed')}</button>}<button type="button" className="cancel-order-button" onClick={() => confirmStatus('Cancelled')}><Ban size={14} /> {t('order_cancel')}</button></div></div>}
    {!canEdit && <div className={`order-readonly-notice ${order.status === 'Cancelled' ? 'cancelled-notice' : ''}`}><ShieldCheck size={16} /> {t('order_lifecycle_readonly', { status: t(statusTranslationKey(order.status) ?? 'status') })}</div>}

    <PlanImpact crop={order.product.crop} active={order.status === 'Active'} orderType={order.product.orderType} orderId={order.id} />
    <div className="order-detail-layout"><div className="order-detail-main">
      <DetailSection icon={<MapPin size={17} />} title={t('order_buyer_information')} description={t('order_buyer_information_help')}>
        <div className="detail-values-grid"><Value label={t('demand_buyer')}>{order.buyer.name}</Value><Value label={t('order_contact_person')}>{order.buyer.contactPerson}</Value><Value label={t('auth_email')}>{order.buyer.email}</Value><Value label={t('order_phone')}>{order.buyer.phone}</Value><Value label={t('order_destination_country')}>{order.buyer.destinationCountry}</Value><Value label={t('order_city_port')}>{order.buyer.destinationCityPort}</Value></div>
      </DetailSection>
      <DetailSection icon={<Package size={17} />} title={t('order_product_delivery')} description={t('order_product_delivery_help')}>
        <div className="detail-values-grid"><Value label={t('farm_crop')}>{cropLabel(order.product.crop, t)}</Value><Value label={t('order_variety')}>{order.product.variety}</Value><Value label={t('order_quantity_kg')}>{order.product.requiredQuantityKg === '' ? '' : `${formatNumber(Number(order.product.requiredQuantityKg), lang)} kg`}</Value><Value label={t('order_grade')}>{order.product.preferredGrade}</Value><Value label={t('order_delivery_from')}>{order.product.deliveryStartDate ? formatDate(order.product.deliveryStartDate, lang) : ''}</Value><Value label={t('order_delivery_until')}>{order.product.deliveryEndDate ? formatDate(order.product.deliveryEndDate, lang) : ''}</Value><Value label={t('order_type')}>{order.product.orderType === 'Confirmed' ? t('demand_committed') : t('demand_indicative')}</Value></div>
      </DetailSection>
      <DetailSection icon={<History size={17} />} title={t('order_quality_specification')} description={t('order_quality_specification_help')}>
        <div className="version-bar"><div><strong>{t('order_spec_version', { version: formatNumber(selected?.version ?? order.specificationVersion, lang) })}</strong><span>{selected ? t(selected.version === 1 ? 'order_version_created' : 'order_version_changed', { date: formatDate(selected.changedAt, lang), name: selected.changedBy }) : t('order_current_specification')}</span></div>{versions.length > 1 && <label>{t('order_view_version')}<select value={selected?.version ?? order.specificationVersion} onChange={(event) => setSelectedVersion(Number(event.target.value))}>{versions.slice().reverse().map((version) => <option value={version.version} key={version.version}>{t('order_version_option', { version: formatNumber(version.version, lang), current: version.version === order.specificationVersion ? ` (${t('current')})` : '' })}</option>)}</select></label>}</div>
        {specification?.criteria.length ? <div className="specification-table-wrap"><table className="specification-table"><thead><tr><th>{t('order_attribute').toUpperCase()}</th><th>{t('order_minimum').toUpperCase()}</th><th>{t('order_maximum').toUpperCase()}</th><th>{t('order_requirement').toUpperCase()}</th><th>{t('notes').toUpperCase()}</th></tr></thead><tbody>{specification.criteria.map((criterion) => <tr key={criterion.id}><td><strong>{criterion.attribute}</strong><small>{criterion.unit}</small></td><td>{criterion.minimum ? `${criterion.minimum} ${criterion.unit}` : '—'}</td><td>{criterion.maximum ? `${criterion.maximum} ${criterion.unit}` : '—'}</td><td><span className={`criterion-requirement ${criterion.required ? 'criterion-required' : ''}`}>{criterion.required ? t('required') : t('optional')}</span></td><td>{criterion.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="detail-empty-inline">{t('order_no_quality_criteria')}</div>}
        <div className="detail-safety-grid"><div><strong>{t('order_laboratory_report')}</strong><span>{specification?.safetyRequirements.laboratoryReportRequired ? t('required') : t('order_not_required')}</span></div><div><strong>{t('order_residue_testing')}</strong><span>{specification?.safetyRequirements.residueTestingRequired ? t('required') : t('order_not_required')}</span></div><div><strong>{t('order_phytosanitary_certificate')}</strong><span>{specification?.safetyRequirements.phytosanitaryDocumentationRequired ? t('required') : t('order_not_required')}</span></div><div className="detail-other-docs"><strong>{t('order_other_buyer_documents')}</strong><span>{specification?.safetyRequirements.otherDocumentation || t('order_none_specified')}</span></div></div>
        <p className="detail-compliance-note">{t('order_compliance_disclaimer')}</p>
      </DetailSection>
      <DetailSection icon={<CalendarDays size={17} />} title={t('order_commercial_terms')} description={t('order_commercial_terms_help')}>
        <div className="detail-values-grid"><Value label={t('order_packaging')}>{order.commercial.packagingType}</Value><Value label={t('order_agreed_price')}>{order.commercial.agreedPricePerKg === '' ? '' : order.commercial.currency === 'INR' ? formatINR(Number(order.commercial.agreedPricePerKg), lang, { maximumFractionDigits: 2 }) : `${order.commercial.currency} ${formatNumber(Number(order.commercial.agreedPricePerKg), lang, { maximumFractionDigits: 2 })}`}</Value><Value label={t('order_currency')}>{order.commercial.currency}</Value><Value label={t('order_payment_terms')}>{order.commercial.paymentTerms}</Value><Value label={t('order_packaging_instructions')}>{order.commercial.packagingInstructions}</Value><Value label={t('order_other_instructions')}>{order.commercial.additionalInstructions}</Value></div>
      </DetailSection>
    </div><aside className="order-detail-aside"><div className="detail-aside-heading"><History size={16} /><h3>{t('order_specification_history')}</h3></div><p>{t('order_history_help')}</p><div className="history-timeline">{versions.slice().reverse().map((version) => <button type="button" key={version.version} className={`history-entry ${version.version === (selected?.version ?? order.specificationVersion) ? 'history-entry-selected' : ''}`} onClick={() => setSelectedVersion(version.version)}><span className="history-marker" /><span className="history-entry-copy"><strong>{t('order_version_option', { version: formatNumber(version.version, lang), current: version.version === order.specificationVersion ? ` (${t('current')})` : '' })}</strong><small>{formatDate(version.changedAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</small><small>{version.changedBy}</small></span></button>)}</div><div className="history-retention-note">{t('order_history_retention')}</div></aside></div>
    <div className="detail-bottom-actions"><Link className="secondary-button" to="/demand"><ArrowLeft size={15} /> {t('order_back_demand')}</Link>{canEdit && <Link className="primary-button" to={`/buyer-orders/${order.id}/edit`}><PencilLine size={15} /> {t('demand_edit')}</Link>}</div>
  </div>
}
