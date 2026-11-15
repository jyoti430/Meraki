import { useState } from 'react'
import { ArrowLeft, FilePlus2, MapPinned } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextPlotId } from '../services/FarmersService'
import type { PlotInput } from '../services/FarmersService'

type PlotDraft = PlotInput

const emptyPlot = (farmerId = ''): PlotDraft => ({ farmerId, name: '', villageLocation: '', area: 0, areaUnit: 'acre', waterAvailability: 'Unknown', irrigationType: '', soilType: '', soilReport: null, notes: '' })

export default function PlotForm() {
  const { plotId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { data, addPlot, editPlot } = useFarmers()
  const existing = data.plots.find((plot) => plot.id === plotId)
  const [draft, setDraft] = useState<PlotDraft>(() => existing ? ({ farmerId: existing.farmerId, name: existing.name, villageLocation: existing.villageLocation, area: existing.area, areaUnit: existing.areaUnit, waterAvailability: existing.waterAvailability, irrigationType: existing.irrigationType, soilType: existing.soilType, soilReport: existing.soilReport ? { ...existing.soilReport } : null, notes: existing.notes }) : emptyPlot(searchParams.get('farmerId') ?? ''))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const editing = Boolean(plotId)
  const set = <K extends keyof PlotDraft>(key: K, value: PlotDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const owner = data.farmers.find((farmer) => farmer.id === draft.farmerId)

  if (editing && !existing) return <div className="entity-not-found"><h2>Plot not found</h2><p>This plot record is not available in the current demo data.</p><Link className="secondary-button" to="/farmers-plots"><ArrowLeft size={14} /> Back to farmers</Link></div>

  function submit() {
    const next: Record<string, string> = {}
    if (!draft.farmerId || !data.farmers.some((farmer) => farmer.id === draft.farmerId)) next.farmerId = 'Select an existing farmer.'
    if (!draft.name.trim()) next.name = 'Enter a plot name or identifier.'
    if (!draft.villageLocation.trim()) next.villageLocation = 'Enter the plot village or location.'
    if (!Number.isFinite(draft.area) || draft.area <= 0) next.area = 'Plot area must be greater than zero.'
    if (draft.soilReport && (draft.soilReport.details.trim() || draft.soilReport.reportDate) && (!draft.soilReport.details.trim() || !draft.soilReport.reportDate)) next.soilReport = 'Enter both report details and the soil report date, or clear the report fields.'
    setErrors(next)
    if (Object.keys(next).length) { setFormError('Review the highlighted fields before saving this plot.'); return }
    setFormError('')
    setSaving(true)
    const input = { ...draft, name: draft.name.trim(), villageLocation: draft.villageLocation.trim(), soilReport: draft.soilReport?.details.trim() && draft.soilReport.reportDate ? { ...draft.soilReport, details: draft.soilReport.details.trim() } : null }
    try {
      if (existing) { editPlot(existing.id, input); navigate(`/plots/${existing.id}`) }
      else { const plot = addPlot(input); navigate(`/plots/${plot.id}`) }
    } catch (error) { setFormError(error instanceof Error ? error.message : 'The plot could not be saved.') }
    finally { setSaving(false) }
  }

  if (!data.farmers.length) return <div className="entity-not-found"><h2>Add a farmer first</h2><p>Every plot must be linked to a farmer record.</p><Link className="primary-button" to="/farmers-plots/new">Register farmer</Link></div>

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={owner ? `/farmers-plots/${owner.id}` : '/farmers-plots'}><ArrowLeft size={14} /> {owner ? `Back to ${owner.name}` : 'Farmer directory'}</Link><h2>{existing ? 'Edit plot' : 'Register plot'}</h2><p>Record location, area, water access and available soil report information.</p></div><span className="entity-demo-label">Synthetic demo records</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title="Plot identity and location" description="Connect the plot to a registered farmer. Precise GPS coordinates are not required.">
        <div className="entity-fields-grid">
          <EntityField label="Plot ID" required hint="Generated when the plot is saved."><div className="generated-field"><MapPinned size={14} />{existing?.id ?? nextPlotId(data)}</div></EntityField>
          <EntityField label="Associated farmer" required error={errors.farmerId}><select value={draft.farmerId} onChange={(event) => set('farmerId', event.target.value)}><option value="">Select farmer</option>{data.farmers.map((farmer) => <option value={farmer.id} key={farmer.id}>{farmer.name} · {farmer.id}</option>)}</select></EntityField>
          <EntityField label="Plot name or identifier" required error={errors.name}><input value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="e.g. North field" /></EntityField>
          <EntityField label="Village / location" required error={errors.villageLocation}><input value={draft.villageLocation} onChange={(event) => set('villageLocation', event.target.value)} placeholder="Village and local area" /></EntityField>
          <EntityField label="Plot area" required error={errors.area}><input type="number" min="0" step="0.01" value={draft.area || ''} onChange={(event) => set('area', event.target.value === '' ? 0 : Number(event.target.value))} placeholder="0.00" /></EntityField>
          <EntityField label="Area unit" required><select value={draft.areaUnit} onChange={(event) => set('areaUnit', event.target.value as PlotDraft['areaUnit'])}><option value="acre">Acre</option><option value="hectare">Hectare</option></select></EntityField>
        </div>
      </EntitySection>
      <EntitySection number="02" title="Water and soil information" description="Capture known constraints and any report information supplied for this plot.">
        <div className="entity-fields-grid">
          <EntityField label="Water availability" required><select value={draft.waterAvailability} onChange={(event) => set('waterAvailability', event.target.value as PlotDraft['waterAvailability'])}><option>Unknown</option><option>Available</option><option>Limited</option><option>None</option></select></EntityField>
          <EntityField label="Irrigation type (optional)"><input value={draft.irrigationType} onChange={(event) => set('irrigationType', event.target.value)} placeholder="e.g. Drip, furrow" /></EntityField>
          <EntityField label="Soil type (optional)"><input value={draft.soilType} onChange={(event) => set('soilType', event.target.value)} placeholder="If known" /></EntityField>
          <EntityField label="Other plot notes"><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Plot-level notes or limitations" /></EntityField>
        </div>
        <div className="soil-report-heading"><span><FilePlus2 size={15} /></span><div><strong>Soil-test report details</strong><small>Report files are not stored by this frontend; record a summary or reference below.</small></div></div>
        <div className="entity-fields-grid soil-report-fields"><EntityField label="Available report details / reference" error={errors.soilReport}><textarea rows={3} value={draft.soilReport?.details ?? ''} onChange={(event) => set('soilReport', { details: event.target.value, reportDate: draft.soilReport?.reportDate ?? '' })} placeholder="Summary, provider or report reference" /></EntityField><EntityField label="Soil report date" error={errors.soilReport}><input type="date" value={draft.soilReport?.reportDate ?? ''} onChange={(event) => set('soilReport', { details: draft.soilReport?.details ?? '', reportDate: event.target.value })} /></EntityField></div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><MapPinned size={19} /></div><h3>Plot relationship</h3><p>This record belongs to one farmer. Crop cycles reference the plot ID, so they remain connected to the farmer through this relationship.</p><div className="entity-aside-separator" /><h4>Soil report attachment</h4><p>There is no file upload service in the current frontend. Store report details and a reference here; no attachment is uploaded.</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={owner ? `/farmers-plots/${owner.id}` : '/farmers-plots'}>Cancel</Link><button className="primary-button" disabled={saving} type="button" onClick={submit}>{saving ? 'Saving…' : existing ? 'Save plot changes' : 'Register plot'}</button></div>
  </div>
}
