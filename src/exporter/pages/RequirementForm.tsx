import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import { exporterService, type RequirementDraftInput } from '../exporterService'
import type { ProcurementRequirement, RequirementCriterion } from '../types'
import { crops } from '../../data/crops'

const blankCriterion = (): RequirementCriterion => ({ id: `criterion-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' })
const blankDraft = (): RequirementDraftInput => ({ crop: '', variety: '', quantityKg: 0, grade: '', criteria: [blankCriterion()], packaging: '', destination: '', requiredBy: '', notes: '' })

export default function RequirementForm() {
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
        setError('Only a browser-local draft can be edited. Synthetic active examples are read-only.')
      } else {
        const { id: _id, status: _status, source: _source, updatedAt: _updatedAt, ...input } = item
        setDraft(input)
      }
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load this draft.'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [requirementId])

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this local draft.')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="e-page"><p role="status" className="e-muted">Loading draft…</p></div>

  return <div className="e-page e-form-page">
    <ExporterPageHeader eyebrow="Demand workspace" title={requirementId ? 'Edit local draft' : 'New procurement requirement'} description="Capture an indicative requirement as a browser-local draft. There is no publish or buyer submission endpoint connected." actions={<Link className="e-button e-button-secondary" to="/exporter/requirements"><ArrowLeft size={17} /> Back to requirements</Link>} />
    <DemoNotice>Save creates or updates a local draft only. Do not treat it as a confirmed buyer order or shared procurement commitment. Quality criteria are buyer-specific; this form applies no universal thresholds.</DemoNotice>
    {error && <div className="e-error" role="alert">{error}</div>}
    {!error || !requirementId ? <form className="e-form" onSubmit={submit}>
      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">01</span><div><h2>Product and quantity</h2><p>Describe the crop and volume requested.</p></div></div>
        <div className="e-form-grid">
          <label className="e-field">Crop<select required value={draft.crop} onChange={(event) => changeCrop(event.target.value)}><option value="">Select crop</option>{crops.map((crop) => <option key={crop.id} value={crop.name}>{crop.name}</option>)}</select></label>
          <label className="e-field">Variety<input required value={draft.variety} onChange={(event) => update('variety', event.target.value)} placeholder="Buyer-preferred variety" /></label>
          <label className="e-field">Required quantity (kg)<input required type="number" min="1" step="1" value={draft.quantityKg || ''} onChange={(event) => update('quantityKg', Number(event.target.value))} /></label>
          <label className="e-field">Preferred grade<input required value={draft.grade} onChange={(event) => update('grade', event.target.value)} placeholder="Specify the buyer's grade" /></label>
          <label className="e-field">Required delivery date<input required type="date" value={draft.requiredBy} onChange={(event) => update('requiredBy', event.target.value)} /></label>
          <label className="e-field">Delivery destination<input required value={draft.destination} onChange={(event) => update('destination', event.target.value)} placeholder="City, port or delivery point" /></label>
        </div>
      </section>

      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">02</span><div><h2>Buyer quality specification</h2><p>Set only the criteria that apply to this requirement.</p></div></div>
        <div className="e-criteria-list">{draft.criteria.map((criterion, index) => <div className="e-criterion" key={criterion.id}>
          <div className="e-criterion-title"><strong>Criterion {index + 1}</strong><button type="button" className="e-icon-button e-danger-button" aria-label={`Remove criterion ${index + 1}`} disabled={draft.criteria.length === 1} onClick={() => update('criteria', draft.criteria.filter((item) => item.id !== criterion.id))}><Trash2 size={16} /></button></div>
          <div className="e-form-grid e-criterion-grid">
            <label className="e-field">Attribute<input value={criterion.attribute} onChange={(event) => updateCriterion(criterion.id, { attribute: event.target.value })} placeholder="e.g. size, maturity, colour" /></label>
            <label className="e-field">Unit<input value={criterion.unit} onChange={(event) => updateCriterion(criterion.id, { unit: event.target.value })} placeholder="cm, %, stage…" /></label>
            <label className="e-field">Minimum (optional)<input value={criterion.minimum ?? ''} onChange={(event) => updateCriterion(criterion.id, { minimum: event.target.value })} /></label>
            <label className="e-field">Maximum (optional)<input value={criterion.maximum ?? ''} onChange={(event) => updateCriterion(criterion.id, { maximum: event.target.value })} /></label>
            <label className="e-field e-criterion-notes">Notes<textarea rows={2} value={criterion.notes} onChange={(event) => updateCriterion(criterion.id, { notes: event.target.value })} placeholder="Buyer-specific details" /></label>
            <label className="e-checkbox"><input type="checkbox" checked={criterion.required} onChange={(event) => updateCriterion(criterion.id, { required: event.target.checked })} /> Required criterion</label>
          </div>
        </div>)}</div>
        <button type="button" className="e-button e-button-secondary" onClick={() => update('criteria', [...draft.criteria, blankCriterion()])}><Plus size={16} /> Add criterion</button>
      </section>

      <section className="e-panel e-form-section"><div className="e-form-section-head"><span className="e-step">03</span><div><h2>Packaging and notes</h2><p>Keep handling instructions specific to this requirement.</p></div></div>
        <div className="e-form-grid"><label className="e-field e-field-wide">Packaging requirement<input value={draft.packaging} onChange={(event) => update('packaging', event.target.value)} placeholder="Packaging type or buyer instructions" /></label>
          <label className="e-field e-field-wide">Additional notes<textarea rows={3} value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Other requirement details" /></label></div>
      </section>
      <div className="e-form-actions"><Link to="/exporter/requirements" className="e-button e-button-secondary">Cancel</Link><button className="e-button e-button-primary" type="submit" disabled={saving}><Save size={17} /> {saving ? 'Saving…' : 'Save local draft'}</button></div>
    </form> : null}
  </div>
}
