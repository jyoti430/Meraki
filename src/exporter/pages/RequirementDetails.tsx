import { ArrowLeft, Edit3 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import useRequirements from '../hooks/useRequirements'
import { cropLabel, formatDate, formatNumber, useI18n } from '../../i18n'

export default function RequirementDetails() {
  const { lang, t } = useI18n()
  const { requirementId = '' } = useParams()
  const { items, error } = useRequirements()
  const item = items?.find((record) => record.id === requirementId)

  if (error) return <div className="e-page"><div className="e-error" role="alert">{t('ex_requirements_load_error')}</div><Link className="e-inline-link" to="/exporter/requirements">{t('ex_back_to_requirements')}</Link></div>
  if (!items) return <div className="e-page"><p role="status" className="e-muted">{t('ex_loading_requirement')}</p></div>
  if (!item) return <div className="e-page"><div className="e-empty-state"><h1>{t('ex_draft_not_found')}</h1><p>{t('ex_draft_removed')}</p><Link to="/exporter/requirements" className="e-button e-button-secondary">{t('ex_back_to_requirements')}</Link></div></div>

  const editable = item.status === 'draft' && item.source === 'local-draft'
  return <div className="e-page">
    <ExporterPageHeader eyebrow={t('ex_req_detail_eyebrow')} title={cropLabel(item.crop, t)} description={`${item.variety} · ${item.id}`} actions={<><Link className="e-button e-button-secondary" to="/exporter/requirements"><ArrowLeft size={17} /> {t('ex_back')}</Link>{editable && <Link className="e-button e-button-primary" to={`/exporter/requirements/${item.id}/edit`}><Edit3 size={16} /> {t('ex_edit_draft_button')}</Link>}</>} />
    <DemoNotice>{item.source === 'synthetic-demo' ? t('ex_synthetic_sample_req') : t('ex_browser_draft_not_submitted')}</DemoNotice>
    <section className="e-detail-overview e-panel">
      <div><span className="e-field-label">{t('ex_status')}</span><StatusBadge tone={item.status === 'active' ? 'good' : 'neutral'}>{item.status === 'active' ? t('ex_active_synthetic') : t('ex_draft_local_only')}</StatusBadge></div>
      <div><span className="e-field-label">{t('ex_required_quantity_label')}</span><strong>{formatNumber(item.quantityKg, lang)} kg</strong></div>
      <div><span className="e-field-label">{t('ex_preferred_grade')}</span><strong>{item.grade}</strong></div>
      <div><span className="e-field-label">{t('ex_required_by')}</span><strong>{formatDate(item.requiredBy, lang)}</strong></div>
      <div><span className="e-field-label">{t('ex_destination')}</span><strong>{item.destination}</strong></div>
      <div><span className="e-field-label">{t('ex_packaging_requirement')}</span><strong>{item.packaging || t('ex_not_specified')}</strong></div>
    </section>
    <section className="e-panel"><div className="e-panel-head"><div><p className="e-eyebrow">{t('ex_buyer_defined')}</p><h2>{t('ex_quality_specification')}</h2></div></div>
      {item.criteria.length === 0 ? <p className="e-muted">{t('ex_no_buyer_criteria')}</p> : <div className="e-criteria-display">{item.criteria.map((criterion) => <article className="e-criteria-display-row" key={criterion.id}>
        <div><strong>{criterion.attribute || t('ex_unspecified_attribute')}</strong><small>{criterion.required ? t('ex_required_short') : t('ex_optional')}{criterion.unit ? ` · ${criterion.unit}` : ''}</small></div>
        <span>{criterion.minimum || '—'} {t('ex_range_to')} {criterion.maximum || '—'}</span><p>{criterion.notes || t('ex_no_additional_notes')}</p>
      </article>)}</div>}
    </section>
    <section className="e-panel"><div className="e-panel-head"><div><p className="e-eyebrow">{t('ex_additional_information')}</p><h2>{t('ex_notes_heading')}</h2></div></div><p className="e-notes-text">{item.notes || t('ex_no_additional_notes')}</p></section>
    {!editable && <p className="e-page-footnote">{t('ex_only_local_drafts_edit')}</p>}
  </div>
}
