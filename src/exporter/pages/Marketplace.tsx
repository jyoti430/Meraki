import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Filter, MapPin, PackageSearch, ShieldAlert } from 'lucide-react'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { exporterService } from '../exporterService'
import useRequirements from '../hooks/useRequirements'
import type { SupplyProjectionExample } from '../types'
import { cropLabel, formatDate, formatNumber, useI18n, type TKey } from '../../i18n'

const projectionCopyKeys: Record<string, TKey> = {
  'No lot inspection is represented.': 'ex_no_inspection',
  'No evidence attached to this synthetic fixture.': 'ex_no_evidence',
  'Illustrative range; not calibrated.': 'ex_range_not_calibrated',
  'Consent and marketplace eligibility are not evaluated in demo data.': 'ex_consent_not_evaluated',
}

export default function Marketplace() {
  const { t, lang } = useI18n()
  const { items: requirements } = useRequirements()
  const [projections, setProjections] = useState<SupplyProjectionExample[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [crop, setCrop] = useState('all')
  const [grade, setGrade] = useState('all')
  const [region, setRegion] = useState('')
  const [requirementId, setRequirementId] = useState('')
  async function loadProjections() {
    setError(null)
    try { setProjections(await exporterService.listSupplyProjections()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('ex_loading_examples')) }
  }
  useEffect(() => { void loadProjections() }, [])

  const selectedRequirement = requirements?.find((item) => item.id === requirementId)
  const visible = useMemo(() => projections?.filter((listing) => {
    return (crop === 'all' || listing.crop === crop) && (grade === 'all' || listing.grade === grade) &&
      (!region.trim() || listing.region.toLocaleLowerCase().includes(region.trim().toLocaleLowerCase()))
  }) ?? [], [projections, crop, grade, region])

  return <div className="e-page">
    <ExporterPageHeader eyebrow={t('ex_market_eyebrow')} title={t('ex_market_title')} description={t('ex_market_description')} />
    <DemoNotice>{t('ex_market_notice')} <Link to="/trade">{t('ex_trade_market_bids')}</Link>.</DemoNotice>
    {error && <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void loadProjections()}>{t('ex_retry_load')}</button></div>}
    <section className="e-panel e-market-filters">
      <div className="e-filter-heading"><Filter size={18} /><strong>{t('ex_filter_heading')}</strong><span>{t('ex_filter_description')}</span></div>
      <div className="e-filter-grid">
        <label className="e-select-label">{t('ex_requirement_reference')}<select value={requirementId} onChange={(event) => setRequirementId(event.target.value)}><option value="">{t('ex_none_selected')}</option>{requirements?.map((item) => <option key={item.id} value={item.id}>{item.id} · {cropLabel(item.crop, t)} ({t(item.source === 'synthetic-demo' ? 'ex_demo_short' : 'ex_local_draft_short')})</option>)}</select></label>
        <label className="e-select-label">{t('ex_crop')}<select value={crop} onChange={(event) => setCrop(event.target.value)}><option value="all">{t('ex_all_crops')}</option>{Array.from(new Set(projections?.map((item) => item.crop) ?? [])).map((value) => <option key={value} value={value}>{cropLabel(value, t)}</option>)}</select></label>
        <label className="e-select-label">{t('ex_grade')}<select value={grade} onChange={(event) => setGrade(event.target.value)}><option value="all">{t('ex_all_grades')}</option>{Array.from(new Set(projections?.map((item) => item.grade) ?? [])).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="e-select-label">{t('ex_region')}<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder={t('ex_region_placeholder')} /></label>
      </div>
      {selectedRequirement && <p className="e-compare-hint">{t('ex_selected_requirement', { id: selectedRequirement.id, crop: cropLabel(selectedRequirement.crop, t), quantity: formatNumber(selectedRequirement.quantityKg, lang), grade: selectedRequirement.grade })}</p>}
    </section>
    {projections === null && !error ? <div className="e-loading" role="status">{t('ex_loading_examples')}</div> : visible.length === 0 ? <div className="e-empty-state"><span className="e-empty-icon"><PackageSearch size={25} /></span><h2>{t('ex_no_matches')}</h2><p>{t('ex_clear_filter_description')}</p><button className="e-button e-button-secondary" type="button" onClick={() => { setCrop('all'); setGrade('all'); setRegion('') }}>{t('ex_clear_filters')}</button></div> : <div className="e-market-grid">
      {visible.map((listing) => <article className="e-market-card" key={listing.id}>
        <div className="e-market-card-top"><span className="e-market-symbol"><PackageSearch size={20} /></span><StatusBadge tone="muted">{t('ex_projected_synthetic')}</StatusBadge></div>
        <div className="e-market-title"><h2>{cropLabel(listing.crop, t)}</h2><p>{listing.variety} · {listing.grade}</p></div>
        <div className="e-market-org"><strong>{listing.fpoLabel}</strong><span><MapPin size={14} />{listing.region}</span></div>
        <div className="e-project-quantity"><span>{t('ex_projected_volume')}</span><strong>{formatNumber(listing.projectedKg, lang)} kg</strong><small>{t('ex_range_not_harvested', { low: formatNumber(listing.lowKg, lang), high: formatNumber(listing.highKg, lang) })}</small></div>
        <div className="e-market-facts"><div><CalendarDays size={15} /><span>{t('ex_week_of', { date: formatDate(listing.deliveryWeekStart, lang) })}</span></div><div><ShieldAlert size={15} /><span>{t(projectionCopyKeys[listing.uncertaintySummary] ?? 'ex_range_not_calibrated')}</span></div></div>
        <div className="e-evidence-box"><strong>{t('ex_evidence_eligibility')}</strong><p>{t(projectionCopyKeys[listing.qualitySummary] ?? 'ex_no_inspection')} {t(projectionCopyKeys[listing.evidenceSummary] ?? 'ex_no_evidence')}</p><p>{t(projectionCopyKeys[listing.consentSummary] ?? 'ex_consent_not_evaluated')}</p></div>
        <p className="e-disabled-reason">{t('ex_reservations_unavailable')}</p>
      </article>)}
    </div>}
    <p className="e-page-footnote">{t('ex_market_footnote')}</p>
  </div>
}
