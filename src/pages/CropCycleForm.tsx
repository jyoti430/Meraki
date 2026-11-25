import { useState } from 'react'
import { ArrowLeft, CalendarRange, Sprout } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextCropCycleId } from '../services/FarmersService'
import type { CropCycleInput } from '../services/FarmersService'
import type { CropCycleStatus } from '../types'
import { useI18n } from '../i18n'

type CropDraft = Omit<CropCycleInput, 'estimatedProductionKg'> & { estimatedProductionKg: number | '' }

const emptyCycle = (plotId = ''): CropDraft => ({ plotId, crop: '', variety: '', plantingDate: '', expectedHarvestStartDate: '', expectedHarvestEndDate: '', estimatedProductionKg: '', status: 'Planned', previousCrop: '', notes: '', waterConstraints: '', capitalInputConstraints: '', otherLimitations: '' })

export default function CropCycleForm() {
  const { cycleId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { data, addCropCycle, editCropCycle } = useFarmers()
  const { t } = useI18n()
  const existing = data.cropCycles.find((cycle) => cycle.id === cycleId)
  const requestedPlotId = searchParams.get('plotId') ?? ''
  const requestedFarmerId = searchParams.get('farmerId') ?? ''
  const availablePlots = data.plots.filter((plot) => !requestedFarmerId || plot.farmerId === requestedFarmerId)
  const [draft, setDraft] = useState<CropDraft>(() => existing ? ({ plotId: existing.plotId, crop: existing.crop, variety: existing.variety, plantingDate: existing.plantingDate, expectedHarvestStartDate: existing.expectedHarvestStartDate, expectedHarvestEndDate: existing.expectedHarvestEndDate, estimatedProductionKg: existing.estimatedProductionKg, status: existing.status, previousCrop: existing.previousCrop, notes: existing.notes, waterConstraints: existing.waterConstraints, capitalInputConstraints: existing.capitalInputConstraints, otherLimitations: existing.otherLimitations }) : emptyCycle(requestedPlotId))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof CropDraft>(key: K, value: CropDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const selectedPlot = data.plots.find((plot) => plot.id === draft.plotId)
  const selectedFarmer = data.farmers.find((farmer) => farmer.id === selectedPlot?.farmerId)

  if (cycleId && !existing) return <div className="entity-not-found"><h2>{t('cf_not_found')}</h2><p>{t('cf_record_unavailable')}</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={14} /> {t('nav_farmers')}</Link></div>

  function submit() {
    const next: Record<string, string> = {}
    if (!draft.plotId || !data.plots.some((plot) => plot.id === draft.plotId)) next.plotId = t('cf_select_plot')
    if (!draft.crop.trim()) next.crop = t('cf_enter_crop')
    if (!draft.variety.trim()) next.variety = t('cf_enter_variety')
    if (!draft.plantingDate) next.plantingDate = t('cf_enter_planting')
    if (!draft.expectedHarvestStartDate) next.expectedHarvestStartDate = t('cf_enter_harvest_start')
    if (!draft.expectedHarvestEndDate) next.expectedHarvestEndDate = t('cf_enter_harvest_end')
    if (draft.estimatedProductionKg === '' || !Number.isFinite(Number(draft.estimatedProductionKg)) || Number(draft.estimatedProductionKg) < 0) next.estimatedProductionKg = t('cf_enter_estimate')
    if (!next.plantingDate && !next.expectedHarvestStartDate && draft.plantingDate > draft.expectedHarvestStartDate) next.expectedHarvestStartDate = t('cf_harvest_before_planting')
    if (!next.expectedHarvestStartDate && !next.expectedHarvestEndDate && draft.expectedHarvestStartDate > draft.expectedHarvestEndDate) next.expectedHarvestEndDate = t('cf_harvest_end_order')
    setErrors(next)
    if (Object.keys(next).length) { setFormError(t('cf_review_before_save')); return }
    setFormError('')
    setSaving(true)
    const input: CropCycleInput = { ...draft, crop: draft.crop.trim(), variety: draft.variety.trim(), estimatedProductionKg: Number(draft.estimatedProductionKg) }
    try {
      if (existing) { editCropCycle(existing.id, input); navigate(`/crop-cycles/${existing.id}`) }
      else { const cycle = addCropCycle(input); navigate(`/crop-cycles/${cycle.id}`) }
    } catch (error) { setFormError(error instanceof Error ? error.message : t('cf_save_failed')) }
    finally { setSaving(false) }
  }

  if (!availablePlots.length) return <div className="entity-not-found"><h2>{t('cf_register_plot_first')}</h2><p>{t('cf_plot_required')}</p><Link className="primary-button" to={requestedFarmerId ? `/plots/new?farmerId=${requestedFarmerId}` : '/plots/new'}>{t('cf_register_plot')}</Link></div>

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={selectedPlot ? `/plots/${selectedPlot.id}` : '/farmers'}><ArrowLeft size={14} /> {selectedPlot ? t('cf_back_plot', { plot: selectedPlot.name }) : t('nav_farmers')}</Link><h2>{existing ? t('cf_edit_title') : t('cf_add_title')}</h2><p>{t('cf_intro')}</p></div><span className="entity-demo-label">{t('cf_demo')}</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title={t('cf_section_crop')} description={t('cf_section_crop_desc')}>
        <div className="entity-fields-grid">
          <EntityField label={t('cf_cycle_id')} hint={t('cf_id_generated')}><div className="generated-field"><Sprout size={14} />{existing?.id ?? nextCropCycleId(data)}</div></EntityField>
          <EntityField label={t('cf_associated_plot')} required error={errors.plotId}><select value={draft.plotId} onChange={(event) => set('plotId', event.target.value)}><option value="">{t('cf_select_plot_option')}</option>{availablePlots.map((plot) => { const farmer = data.farmers.find((item) => item.id === plot.farmerId); return <option key={plot.id} value={plot.id}>{plot.name} · {farmer?.name ?? t('cf_unknown_farmer')} · {plot.id}</option> })}</select></EntityField>
          {selectedFarmer && <div className="relationship-hint"><span>{t('cf_associated_farmer')}</span><Link to={`/farmers-plots/${selectedFarmer.id}`}>{selectedFarmer.name} · {selectedFarmer.id}</Link></div>}
          <EntityField label={t('cf_crop')} required error={errors.crop}><input value={draft.crop} onChange={(event) => set('crop', event.target.value)} placeholder={t('cf_crop_placeholder')} /></EntityField>
          <EntityField label={t('cf_variety')} required error={errors.variety}><input value={draft.variety} onChange={(event) => set('variety', event.target.value)} placeholder={t('cf_variety_placeholder')} /></EntityField>
          <EntityField label={t('cf_status')} required><select value={draft.status} onChange={(event) => set('status', event.target.value as CropCycleStatus)}><option value="Planned">{t('status_planned')}</option><option value="Growing">{t('status_growing')}</option><option value="Harvest-ready">{t('status_harvest_ready')}</option><option value="Harvested">{t('status_harvested')}</option><option value="Cancelled">{t('status_cancelled')}</option></select></EntityField>
          <EntityField label={`${t('cf_previous_crop')} (${t('f_form_optional').toLowerCase()})`}><input value={draft.previousCrop} onChange={(event) => set('previousCrop', event.target.value)} placeholder={t('cf_previous_crop_placeholder')} /></EntityField>
        </div>
      </EntitySection>
      <EntitySection number="02" title={t('cf_section_timeline')} description={t('cf_section_timeline_desc')}>
        <div className="entity-fields-grid">
          <EntityField label={t('cf_planting_date')} required error={errors.plantingDate}><input type="date" value={draft.plantingDate} onChange={(event) => set('plantingDate', event.target.value)} /></EntityField>
          <EntityField label={t('cf_harvest_start')} required error={errors.expectedHarvestStartDate}><input type="date" value={draft.expectedHarvestStartDate} onChange={(event) => set('expectedHarvestStartDate', event.target.value)} /></EntityField>
          <EntityField label={t('cf_harvest_end')} required error={errors.expectedHarvestEndDate}><input type="date" value={draft.expectedHarvestEndDate} onChange={(event) => set('expectedHarvestEndDate', event.target.value)} /></EntityField>
          <EntityField label={t('cf_estimated_production')} required error={errors.estimatedProductionKg} hint={t('cf_estimate_hint')}><input type="number" min="0" step="0.1" value={draft.estimatedProductionKg} onChange={(event) => set('estimatedProductionKg', event.target.value === '' ? '' : Number(event.target.value))} placeholder="0" /></EntityField>
        </div>
        <div className="estimate-warning"><CalendarRange size={15} /><span>{t('cf_estimate_warning')}</span></div>
      </EntitySection>
      <EntitySection number="03" title={t('cf_section_limitations')} description={t('cf_section_limitations_desc')}>
        <div className="entity-fields-grid"><EntityField label={t('cf_water_constraints')}><textarea rows={3} value={draft.waterConstraints} onChange={(event) => set('waterConstraints', event.target.value)} placeholder={t('cf_water_constraints_placeholder')} /></EntityField><EntityField label={t('cf_input_constraints')}><textarea rows={3} value={draft.capitalInputConstraints} onChange={(event) => set('capitalInputConstraints', event.target.value)} placeholder={t('cf_input_constraints_placeholder')} /></EntityField><EntityField label={t('cf_other_limitations')}><textarea rows={3} value={draft.otherLimitations} onChange={(event) => set('otherLimitations', event.target.value)} placeholder={t('cf_other_limitations_placeholder')} /></EntityField><EntityField label={t('cf_notes')}><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder={t('cf_notes_placeholder')} /></EntityField></div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><CalendarRange size={19} /></div><h3>{t('cf_aside_dates')}</h3><p>{t('cf_date_sequence')}</p><div className="entity-aside-separator" /><h4>{t('cf_overlap')}</h4><p>{t('cf_overlap_detail')}</p><div className="entity-aside-separator" /><h4>{t('cf_participation')}</h4><p>{t('cf_participation_detail')}</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={selectedPlot ? `/plots/${selectedPlot.id}` : '/farmers'}>{t('cf_cancel')}</Link><button className="primary-button" type="button" disabled={saving} onClick={submit}>{saving ? t('cf_saving') : existing ? t('cf_save_changes') : t('cf_add_cycle')}</button></div>
  </div>
}
