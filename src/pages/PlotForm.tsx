import { useState } from 'react'
import { ArrowLeft, FilePlus2, MapPinned } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextPlotId } from '../services/FarmersService'
import { soilTypes } from '../data/crops'
import type { SoilMeasurement } from '../types'
import type { PlotInput } from '../services/FarmersService'
import { soilLabel, useI18n } from '../i18n'

type PlotDraft = PlotInput

const emptyPlot = (farmerId = ''): PlotDraft => ({ farmerId, name: '', villageLocation: '', area: 0, areaUnit: 'acre', waterAvailability: 'Unknown', irrigationType: '', soilType: '', soilReport: null, notes: '' })

export default function PlotForm() {
  const { plotId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { data, addPlot, editPlot } = useFarmers()
  const { t } = useI18n()
  const existing = data.plots.find((plot) => plot.id === plotId)
  const [draft, setDraft] = useState<PlotDraft>(() => existing ? ({ farmerId: existing.farmerId, name: existing.name, villageLocation: existing.villageLocation, area: existing.area, areaUnit: existing.areaUnit, waterAvailability: existing.waterAvailability, irrigationType: existing.irrigationType, soilType: existing.soilType, soilReport: existing.soilReport ? { ...existing.soilReport } : null, soilMeasurement: existing.soilMeasurement ? { ...existing.soilMeasurement } : null, notes: existing.notes }) : emptyPlot(searchParams.get('farmerId') ?? ''))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(plotId)
  const set = <K extends keyof PlotDraft>(key: K, value: PlotDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const owner = data.farmers.find((farmer) => farmer.id === draft.farmerId)
  const measurement = draft.soilMeasurement ?? null
  const setMeasurement = (patch: Partial<SoilMeasurement>) => set('soilMeasurement', { source: 'Field test kit', ph: null, moisturePct: null, measuredAt: '', ...(measurement ?? {}), ...patch })

  if (editing && !existing) return <div className="entity-not-found"><h2>{t('pf_plot_not_found')}</h2><p>{t('pf_record_unavailable')}</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={14} /> {t('nav_farmers')}</Link></div>

  function submit() {
    const next: Record<string, string> = {}
    if (!draft.farmerId || !data.farmers.some((farmer) => farmer.id === draft.farmerId)) next.farmerId = t('pf_enter_farmer')
    if (!draft.name.trim()) next.name = t('pf_enter_name')
    if (!draft.villageLocation.trim()) next.villageLocation = t('pf_enter_location')
    if (!Number.isFinite(draft.area) || draft.area <= 0) next.area = t('pf_area_positive')
    if (measurement && measurement.ph != null && (measurement.ph < 3 || measurement.ph > 10)) next.soilMeasurement = t('pf_ph_range')
    if (measurement && measurement.moisturePct != null && (measurement.moisturePct < 0 || measurement.moisturePct > 100)) next.soilMeasurement = t('pf_moisture_range')
    if (draft.soilReport && (draft.soilReport.details.trim() || draft.soilReport.reportDate) && (!draft.soilReport.details.trim() || !draft.soilReport.reportDate)) next.soilReport = t('pf_report_complete')
    setErrors(next)
    if (Object.keys(next).length) { setFormError(t('pf_review_before_save')); return }
    setFormError('')
    setSaving(true)
    const input = { ...draft, name: draft.name.trim(), villageLocation: draft.villageLocation.trim(), soilReport: draft.soilReport?.details.trim() && draft.soilReport.reportDate ? { ...draft.soilReport, details: draft.soilReport.details.trim() } : null, soilMeasurement: measurement && (measurement.ph != null || measurement.moisturePct != null) ? { ...measurement, measuredAt: measurement.measuredAt || new Date().toISOString().slice(0, 10) } : null }
    try {
      if (existing) { editPlot(existing.id, input); navigate(`/plots/${existing.id}`) }
      else { const plot = addPlot(input); navigate(`/plots/${plot.id}`) }
    } catch (error) { setFormError(error instanceof Error ? error.message : t('pf_save_failed')) }
    finally { setSaving(false) }
  }

  if (!data.farmers.length) return <div className="entity-not-found"><h2>{t('pf_add_farmer_first')}</h2><p>{t('pf_farmer_required')}</p><Link className="primary-button" to="/farmers-plots/new">{t('pf_register_farmer')}</Link></div>

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={owner ? `/farmers-plots/${owner.id}` : '/farmers'}><ArrowLeft size={14} /> {owner ? t('pf_back_farmer', { name: owner.name }) : t('nav_farmers')}</Link><h2>{existing ? t('pf_edit_title') : t('pf_register_title')}</h2><p>{t('pf_intro')}</p></div><span className="entity-demo-label">{t('pf_demo')}</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title={t('pf_section_identity')} description={t('pf_section_identity_desc')}>
        <div className="entity-fields-grid">
          <EntityField label={t('pf_plot_id')} required hint={t('pf_id_generated')}><div className="generated-field"><MapPinned size={14} />{existing?.id ?? nextPlotId(data)}</div></EntityField>
          <EntityField label={t('pf_associated_farmer')} required error={errors.farmerId}><select value={draft.farmerId} onChange={(event) => set('farmerId', event.target.value)}><option value="">{t('pf_select_farmer')}</option>{data.farmers.map((farmer) => <option value={farmer.id} key={farmer.id}>{farmer.name} · {farmer.id}</option>)}</select></EntityField>
          <EntityField label={t('pf_name')} required error={errors.name}><input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder={t('pf_name_placeholder')} /></EntityField>
          <EntityField label={t('pf_location')} required error={errors.villageLocation}><input value={draft.villageLocation} onChange={(event) => set('villageLocation', event.target.value)} placeholder={t('pf_location_placeholder')} /></EntityField>
          <EntityField label={t('pf_area')} required error={errors.area}><input type="number" min="0" step="0.01" value={draft.area || ''} onChange={(event) => set('area', event.target.value === '' ? 0 : Number(event.target.value))} placeholder={t('pf_area_placeholder')} /></EntityField>
          <EntityField label={t('pf_area_unit')} required><select value={draft.areaUnit} onChange={(event) => set('areaUnit', event.target.value as PlotDraft['areaUnit'])}><option value="acre">{t('pf_acre')}</option><option value="hectare">{t('pf_hectare')}</option></select></EntityField>
        </div>
      </EntitySection>
      <EntitySection number="02" title={t('pf_section_conditions')} description={t('pf_section_conditions_desc')}>
        <div className="entity-fields-grid">
          <EntityField label={t('pf_water_availability')} required><select value={draft.waterAvailability} onChange={(event) => set('waterAvailability', event.target.value as PlotDraft['waterAvailability'])}><option value="Unknown">{t('pf_water_unknown')}</option><option value="Available">{t('pf_water_available')}</option><option value="Limited">{t('pf_water_limited')}</option><option value="None">{t('pf_water_none')}</option></select></EntityField>
          <EntityField label={`${t('pf_irrigation')} (${t('f_form_optional').toLowerCase()})`}><input value={draft.irrigationType} onChange={(event) => set('irrigationType', event.target.value)} placeholder={t('pf_irrigation_placeholder')} /></EntityField>
          <EntityField label={`${t('pf_soil_type')} (${t('f_form_optional').toLowerCase()})`} hint={t('pf_soil_hint')}><input list="soil-types" value={draft.soilType} onChange={(event) => set('soilType', event.target.value)} placeholder={t('pf_soil_placeholder')} /><datalist id="soil-types">{soilTypes.map((soil) => <option key={soil} value={soil} label={soilLabel(soil, t)} />)}</datalist></EntityField>
          <EntityField label={t('pf_plot_notes')}><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder={t('pf_plot_notes_placeholder')} /></EntityField>
        </div>
        <div className="soil-report-heading"><span><FilePlus2 size={15} /></span><div><strong>{t('pf_measurements')}</strong><small>{t('pf_measurements_hint')}</small></div></div>
        <div className="entity-fields-grid soil-report-fields">
          <EntityField label={t('pf_source')} error={errors.soilMeasurement}><select value={measurement?.source ?? 'Field test kit'} onChange={(event) => setMeasurement({ source: event.target.value as SoilMeasurement['source'] })}><option value="Field test kit">{t('pf_field_kit')}</option><option value="Lab test">{t('pf_lab')}</option><option value="Soil sensor">{t('pf_sensor')}</option></select></EntityField>
          <EntityField label={t('pf_measured_on')}><input type="date" value={measurement?.measuredAt ?? ''} onChange={(event) => setMeasurement({ measuredAt: event.target.value })} /></EntityField>
          <EntityField label={t('pf_ph')}><input type="number" step="0.1" min="3" max="10" value={measurement?.ph ?? ''} onChange={(event) => setMeasurement({ ph: event.target.value === '' ? null : Number(event.target.value) })} placeholder={t('pf_ph_placeholder')} /></EntityField>
          <EntityField label={t('pf_moisture')}><input type="number" step="1" min="0" max="100" value={measurement?.moisturePct ?? ''} onChange={(event) => setMeasurement({ moisturePct: event.target.value === '' ? null : Number(event.target.value) })} placeholder={t('pf_moisture_placeholder')} /></EntityField>
        </div>
        <div className="soil-report-heading"><span><FilePlus2 size={15} /></span><div><strong>{t('pf_report')}</strong><small>{t('pf_report_hint')}</small></div></div>
        <div className="entity-fields-grid soil-report-fields"><EntityField label={t('pf_report_reference')} error={errors.soilReport}><textarea rows={3} value={draft.soilReport?.details ?? ''} onChange={(event) => set('soilReport', { details: event.target.value, reportDate: draft.soilReport?.reportDate ?? '' })} placeholder={t('pf_report_placeholder')} /></EntityField><EntityField label={t('pf_report_date')} error={errors.soilReport}><input type="date" value={draft.soilReport?.reportDate ?? ''} onChange={(event) => set('soilReport', { details: draft.soilReport?.details ?? '', reportDate: event.target.value })} /></EntityField></div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><MapPinned size={19} /></div><h3>{t('pf_relationship')}</h3><p>{t('pf_relationship_desc')}</p><div className="entity-aside-separator" /><h4>{t('pf_attachment')}</h4><p>{t('pf_attachment_note')}</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={owner ? `/farmers-plots/${owner.id}` : '/farmers'}>{t('pf_cancel')}</Link><button className="primary-button" disabled={saving} type="button" onClick={submit}>{saving ? t('pf_saving') : existing ? t('pf_save_changes') : t('pf_register_plot')}</button></div>
  </div>
}
