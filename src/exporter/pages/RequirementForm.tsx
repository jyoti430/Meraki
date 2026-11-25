import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import { exporterService, type RequirementDraftInput } from '../exporterService'
import type { ProcurementRequirement, RequirementCriterion } from '../types'
import { crops } from '../../data/crops'
import { useI18n, cropLabel } from '../../i18n'

const blankCriterion = (): RequirementCriterion => ({ id: `criterion-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' })
const blankDraft = (): RequirementDraftInput => ({ crop: '', variety: '', quantityKg: 0, grade: '', criteria: [blankCriterion()], packaging: '', destination: '', requiredBy: '', notes: '' })

export default function RequirementForm() {
  const { t } = useI18n()
  const { requirementId } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<RequirementDraftInput>(blankDraft)
  const [loading, setLoading] = useState(Boolean(requirementId))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!requirementId) return
    let mounted = true
    exporterService.getRequirement(requirementId).then((item) => {
      if (!mounted) return
      if (!item || item.source !== 'local-draft' || item.status !== 'draft') {
        setError(t('ex_local_draft_only_edit'))
      } else {
        const { id: _id, status: _status, source: _source, updatedAt: _updatedAt, ...input } = item
        setDraft(input)
      }
    }).catch(() => setError(t('ex_draft_load_error')))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [requirementId, t])

  function update<K extends keyof RequirementDraftInput>(key: K, value: RequirementDraftInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  function updateCriterion(id: string, patch: Partial<RequirementCriterion>) {
    update('criteria', draft.criteria.map((item) => item.id === id ? { ...item, ...patch } : item))
  }
  function changeCrop(crop: string) {
    const profile = crops.find((item) => item.name === crop)
    setDraft((current) => ({ ...current, crop, variety: current.variety || profile?.defaultVariety || '' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const saved: ProcurementRequirement = await exporterService.saveDraft(draft, requirementId)
      navigate(`/exporter/requirements/${saved.id}`, { state: { justSaved: true } })
    } catch {
      setError(t('ex_draft_save_error'))
    } finally { setSaving(false) }
  }

  if (loading) return <div className="e-page"><p role="status" className="e-muted">{t('ex_loading_draft')}</p></div>

  return <div className="e-page e-form-page">
    <ExporterPageHeader eyebrow={t('ex_req_eyebrow')} title={requirementId ? t('ex_edit_local_draft') : t('ex_new_req')} description={t('ex_indicative_capture')} actions={<Link className="e-button e-button-secondary" to="/exporter/requirements"><ArrowLeft size={17} /> {t('ex_back_to_requirements')}</Link>} />
    <DemoNotice>{t('ex_save_disclosure')}</DemoNotice>
    {error && <div className="e-error" role="alert">{error}</div>}
    {!error || !requirementId ? <form className="e-form" onSubmit={submit}>
      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">01</span><div><h2>{t('ex_product_quantity')}</h2><p>{t('ex_describe_crop_volume')}</p></div></div>
        <div className="e-form-grid">
          <label className="e-field">{t('ex_crop')}<select required value={draft.crop} onChange={(event) => changeCrop(event.target.value)}><option value="">{t('ex_select_crop')}</option>{crops.map((crop) => <option key={crop.id} value={crop.name}>{cropLabel(crop.name, t)}</option>)}</select></label>
          <label className="e-field">{t('ex_variety')}<input required value={draft.variety} onChange={(event) => update('variety', event.target.value)} placeholder={t('ex_variety_placeholder')} /></label>
          <label className="e-field">{t('ex_required_quantity_kg')}<input required type="number" min="1" step="1" value={draft.quantityKg || ''} onChange={(event) => update('quantityKg', Number(event.target.value))} /></label>
          <label className="e-field">{t('ex_preferred_grade')}<input required value={draft.grade} onChange={(event) => update('grade', event.target.value)} placeholder={t('ex_grade_placeholder')} /></label>
          <label className="e-field">{t('ex_required_by')}<input required type="date" value={draft.requiredBy} onChange={(event) => update('requiredBy', event.target.value)} /></label>
          <label className="e-field">{t('ex_delivery_destination')}<input required value={draft.destination} onChange={(event) => update('destination', event.target.value)} placeholder={t('ex_destination_placeholder')} /></label>
        </div>
      </section>

      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">02</span><div><h2>{t('ex_buyer_quality')}</h2><p>{t('ex_set_criteria')}</p></div></div>
        <div className="e-criteria-list">{draft.criteria.map((criterion, index) => <div className="e-criterion" key={criterion.id}>
          <div className="e-criterion-title"><strong>{t('ex_criterion', { count: index + 1 })}</strong><button type="button" className="e-icon-button e-danger-button" aria-label={t('ex_remove_criterion', { count: index + 1 })} disabled={draft.criteria.length === 1} onClick={() => update('criteria', draft.criteria.filter((item) => item.id !== criterion.id))}><Trash2 size={16} /></button></div>
          <div className="e-form-grid e-criterion-grid">
            <label className="e-field">{t('ex_attribute')}<input value={criterion.attribute} onChange={(event) => updateCriterion(criterion.id, { attribute: event.target.value })} placeholder={t('ex_attribute_placeholder')} /></label>
            <label className="e-field">{t('ex_unit')}<input value={criterion.unit} onChange={(event) => updateCriterion(criterion.id, { unit: event.target.value })} placeholder={t('ex_unit_placeholder')} /></label>
            <label className="e-field">{t('ex_minimum_optional')}<input value={criterion.minimum ?? ''} onChange={(event) => updateCriterion(criterion.id, { minimum: event.target.value })} /></label>
            <label className="e-field">{t('ex_maximum_optional')}<input value={criterion.maximum ?? ''} onChange={(event) => updateCriterion(criterion.id, { maximum: event.target.value })} /></label>
            <label className="e-field e-criterion-notes">{t('ex_notes')}<textarea rows={2} value={criterion.notes} onChange={(event) => updateCriterion(criterion.id, { notes: event.target.value })} placeholder={t('ex_buyer_specific_details')} /></label>
            <label className="e-checkbox"><input type="checkbox" checked={criterion.required} onChange={(event) => updateCriterion(criterion.id, { required: event.target.checked })} /> {t('ex_required_criterion')}</label>
          </div>
        </div>)}</div>
        <button type="button" className="e-button e-button-secondary" onClick={() => update('criteria', [...draft.criteria, blankCriterion()])}><Plus size={16} /> {t('ex_add_criterion')}</button>
      </section>

      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">03</span><div><h2>{t('ex_packaging_notes')}</h2><p>{t('ex_handling_specific')}</p></div></div>
        <div className="e-form-grid"><label className="e-field e-field-wide">{t('ex_packaging_requirement')}<input value={draft.packaging} onChange={(event) => update('packaging', event.target.value)} placeholder={t('ex_packaging_placeholder')} /></label>
          <label className="e-field e-field-wide">{t('ex_additional_notes')}<textarea rows={3} value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder={t('ex_additional_placeholder')} /></label></div>
      </section>
      <div className="e-form-actions"><Link to="/exporter/requirements" className="e-button e-button-secondary">{t('ex_cancel')}</Link><button className="e-button e-button-primary" type="submit" disabled={saving}><Save size={17} /> {saving ? t('ex_saving') : t('ex_save_local_draft')}</button></div>
    </form> : null}
  </div>
}
