import { useState } from 'react'
import { ArrowLeft, CalendarRange, Sprout } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextCropCycleId } from '../services/FarmersService'
import type { CropCycleInput } from '../services/FarmersService'
import type { CropCycleStatus } from '../types'

type CropDraft = Omit<CropCycleInput, 'estimatedProductionKg'> & { estimatedProductionKg: number | '' }

const emptyCycle = (plotId = ''): CropDraft => ({ plotId, crop: '', variety: '', plantingDate: '', expectedHarvestStartDate: '', expectedHarvestEndDate: '', estimatedProductionKg: '', status: 'Planned', previousCrop: '', notes: '', waterConstraints: '', capitalInputConstraints: '', otherLimitations: '' })

export default function CropCycleForm() {
  const { cycleId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { data, addCropCycle, editCropCycle } = useFarmers()
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

  if (cycleId && !existing) return <div className="entity-not-found"><h2>Crop cycle not found</h2><p>This crop cycle is not available in the current demo data.</p><Link className="secondary-button" to="/farmers-plots"><ArrowLeft size={14} /> Back to farmers</Link></div>

  function submit() {
    const next: Record<string, string> = {}
    if (!draft.plotId || !data.plots.some((plot) => plot.id === draft.plotId)) next.plotId = 'Select an existing plot.'
    if (!draft.crop.trim()) next.crop = 'Enter the crop.'
    if (!draft.variety.trim()) next.variety = 'Enter the variety.'
    if (!draft.plantingDate) next.plantingDate = 'Enter the planting or sowing date.'
    if (!draft.expectedHarvestStartDate) next.expectedHarvestStartDate = 'Enter the expected harvest start date.'
    if (!draft.expectedHarvestEndDate) next.expectedHarvestEndDate = 'Enter the expected harvest end date.'
    if (draft.estimatedProductionKg === '' || !Number.isFinite(Number(draft.estimatedProductionKg)) || Number(draft.estimatedProductionKg) < 0) next.estimatedProductionKg = 'Enter a non-negative estimated quantity in kg.'
    if (!next.plantingDate && !next.expectedHarvestStartDate && draft.plantingDate > draft.expectedHarvestStartDate) next.expectedHarvestStartDate = 'Harvest cannot start before planting.'
    if (!next.expectedHarvestStartDate && !next.expectedHarvestEndDate && draft.expectedHarvestStartDate > draft.expectedHarvestEndDate) next.expectedHarvestEndDate = 'Harvest end must be on or after harvest start.'
    setErrors(next)
    if (Object.keys(next).length) { setFormError('Review the highlighted fields. Crop dates and quantity must be valid before saving.'); return }
    setFormError('')
    setSaving(true)
    const input: CropCycleInput = { ...draft, crop: draft.crop.trim(), variety: draft.variety.trim(), estimatedProductionKg: Number(draft.estimatedProductionKg) }
    try {
      if (existing) { editCropCycle(existing.id, input); navigate(`/crop-cycles/${existing.id}`) }
      else { const cycle = addCropCycle(input); navigate(`/crop-cycles/${cycle.id}`) }
    } catch (error) { setFormError(error instanceof Error ? error.message : 'The crop cycle could not be saved.') }
    finally { setSaving(false) }
  }

  if (!availablePlots.length) return <div className="entity-not-found"><h2>Register a plot first</h2><p>Every crop cycle must belong to a plot. Add a plot before recording this crop cycle.</p><Link className="primary-button" to={requestedFarmerId ? `/plots/new?farmerId=${requestedFarmerId}` : '/plots/new'}>Register plot</Link></div>

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={selectedPlot ? `/plots/${selectedPlot.id}` : '/farmers-plots'}><ArrowLeft size={14} /> {selectedPlot ? `Back to ${selectedPlot.name}` : 'Farmer directory'}</Link><h2>{existing ? 'Edit crop cycle' : 'Add crop cycle'}</h2><p>Capture dates, status, estimated production and known supply limitations for this plot.</p></div><span className="entity-demo-label">Synthetic demo records</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title="Plot and crop" description="Crop cycles reference a plot. Farmer and plot details remain linked by their IDs.">
        <div className="entity-fields-grid">
          <EntityField label="Crop cycle ID" hint="Generated when the cycle is saved."><div className="generated-field"><Sprout size={14} />{existing?.id ?? nextCropCycleId(data)}</div></EntityField>
          <EntityField label="Associated plot" required error={errors.plotId}><select value={draft.plotId} onChange={(event) => set('plotId', event.target.value)}><option value="">Select plot</option>{availablePlots.map((plot) => { const farmer = data.farmers.find((item) => item.id === plot.farmerId); return <option key={plot.id} value={plot.id}>{plot.name} · {farmer?.name ?? 'Unknown farmer'} · {plot.id}</option> })}</select></EntityField>
          {selectedFarmer && <div className="relationship-hint"><span>Associated farmer</span><Link to={`/farmers-plots/${selectedFarmer.id}`}>{selectedFarmer.name} · {selectedFarmer.id}</Link></div>}
          <EntityField label="Crop" required error={errors.crop}><input value={draft.crop} onChange={(event) => set('crop', event.target.value)} placeholder="e.g. Mango" /></EntityField>
          <EntityField label="Variety" required error={errors.variety}><input value={draft.variety} onChange={(event) => set('variety', event.target.value)} placeholder="Variety name" /></EntityField>
          <EntityField label="Crop cycle status" required><select value={draft.status} onChange={(event) => set('status', event.target.value as CropCycleStatus)}><option>Planned</option><option>Growing</option><option>Harvest-ready</option><option>Harvested</option><option>Cancelled</option></select></EntityField>
          <EntityField label="Previous crop (optional)"><input value={draft.previousCrop} onChange={(event) => set('previousCrop', event.target.value)} placeholder="Crop previously grown on this plot" /></EntityField>
        </div>
      </EntitySection>
      <EntitySection number="02" title="Crop timeline and estimate" description="Estimated production is a planning estimate only; it is not harvested or physically available stock.">
        <div className="entity-fields-grid">
          <EntityField label="Planting / sowing date" required error={errors.plantingDate}><input type="date" value={draft.plantingDate} onChange={(event) => set('plantingDate', event.target.value)} /></EntityField>
          <EntityField label="Expected harvest start" required error={errors.expectedHarvestStartDate}><input type="date" value={draft.expectedHarvestStartDate} onChange={(event) => set('expectedHarvestStartDate', event.target.value)} /></EntityField>
          <EntityField label="Expected harvest end" required error={errors.expectedHarvestEndDate}><input type="date" value={draft.expectedHarvestEndDate} onChange={(event) => set('expectedHarvestEndDate', event.target.value)} /></EntityField>
          <EntityField label="Estimated production (kg)" required error={errors.estimatedProductionKg} hint="Enter the farmer-provided estimate. Plot area is not used to calculate a yield."><input type="number" min="0" step="0.1" value={draft.estimatedProductionKg} onChange={(event) => set('estimatedProductionKg', event.target.value === '' ? '' : Number(event.target.value))} placeholder="0" /></EntityField>
        </div>
        <div className="estimate-warning"><CalendarRange size={15} /><span>Harvest timing and estimated quantity are planning information only. They do not confirm a harvest or create available stock.</span></div>
      </EntitySection>
      <EntitySection number="03" title="Supply-related limitations" description="Record farmer-reported constraints that may affect future supply planning.">
        <div className="entity-fields-grid"><EntityField label="Water constraints"><textarea rows={3} value={draft.waterConstraints} onChange={(event) => set('waterConstraints', event.target.value)} placeholder="Known crop-cycle water constraints" /></EntityField><EntityField label="Capital / input constraints"><textarea rows={3} value={draft.capitalInputConstraints} onChange={(event) => set('capitalInputConstraints', event.target.value)} placeholder="Input or working-capital limitations" /></EntityField><EntityField label="Other limitations"><textarea rows={3} value={draft.otherLimitations} onChange={(event) => set('otherLimitations', event.target.value)} placeholder="Other supply-related limitations" /></EntityField><EntityField label="Crop cycle notes"><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Additional notes" /></EntityField></div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><CalendarRange size={19} /></div><h3>Crop cycle dates</h3><p>Dates must follow the crop cycle sequence: planting, expected harvest start, then expected harvest end.</p><div className="entity-aside-separator" /><h4>Overlapping cycles</h4><p>A plot cannot have overlapping Planned, Growing or Harvest-ready cycles. Mark an earlier cycle Harvested or Cancelled before creating an overlapping active cycle.</p><div className="entity-aside-separator" /><h4>Participation</h4><p>Crop-cycle estimates are not allocated. Farmers who opt out are excluded from eligible participant queries.</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={selectedPlot ? `/plots/${selectedPlot.id}` : '/farmers-plots'}>Cancel</Link><button className="primary-button" type="button" disabled={saving} onClick={submit}>{saving ? 'Saving…' : existing ? 'Save crop cycle' : 'Add crop cycle'}</button></div>
  </div>
}
