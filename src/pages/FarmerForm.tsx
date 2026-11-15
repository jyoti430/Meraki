import { useState } from 'react'
import { ArrowLeft, Fingerprint } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextFarmerId } from '../services/FarmersService'
import type { FarmerInput } from '../services/FarmersService'

type FarmerDraft = FarmerInput
type Errors = Record<string, string>

export default function FarmerForm() {
  const { farmerId } = useParams()
  const navigate = useNavigate()
  const { data, addFarmer, editFarmer } = useFarmers()
  const existing = data.farmers.find((farmer) => farmer.id === farmerId)
  const [draft, setDraft] = useState<FarmerDraft>(() => existing ? ({ name: existing.name, phone: existing.phone, village: existing.village, district: existing.district, state: existing.state, preferredLanguage: existing.preferredLanguage, membershipStatus: existing.membershipStatus, notes: existing.notes }) : ({ name: '', phone: '', village: '', district: '', state: '', preferredLanguage: '', membershipStatus: 'Active', notes: '' }))
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof FarmerDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const editing = Boolean(farmerId)

  if (editing && !existing) return <div className="entity-not-found"><h2>Farmer not found</h2><p>This farmer record is not available in the current demo data.</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={15} /> Back to farmers</Link></div>

  function submit() {
    const next: Errors = {}
    if (!draft.name.trim()) next.name = 'Enter the farmer name.'
    if (!draft.phone.trim()) next.phone = 'Enter a contact number.'
    else if (!/^[+\d][\d\s().-]{6,20}$/.test(draft.phone.trim())) next.phone = 'Enter a valid phone number.'
    if (!draft.village.trim()) next.village = 'Enter the village.'
    if (!draft.district.trim()) next.district = 'Enter the district.'
    if (!draft.state.trim()) next.state = 'Enter the state.'
    if (!draft.preferredLanguage.trim()) next.preferredLanguage = 'Enter the preferred communication language.'
    setErrors(next)
    if (Object.keys(next).length) {
      setFormError('Review the highlighted fields before saving this farmer.')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      if (existing) {
        editFarmer(existing.id, draft)
        navigate(`/farmers-plots/${existing.id}`)
      } else {
        const farmer = addFarmer(draft)
        navigate(`/farmers-plots/${farmer.id}`)
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The farmer could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={existing ? `/farmers-plots/${existing.id}` : '/farmers'}><ArrowLeft size={14} /> {existing ? 'Back to profile' : 'Farmers & farms'}</Link><h2>{existing ? 'Edit farmer' : 'Register farmer'}</h2><p>Capture only the contact and FPO information needed to manage participation and farm records.</p></div><span className="entity-demo-label">Synthetic demo records</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title="Farmer information" description="Basic contact and location information for the FPO directory.">
        <div className="entity-fields-grid">
          <EntityField label="Farmer name" required error={errors.name}><input autoFocus value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder="Full name" /></EntityField>
          <EntityField label="Phone number" required error={errors.phone}><input type="tel" value={draft.phone} onChange={(event) => set('phone', event.target.value)} placeholder="Contact number" /></EntityField>
          <EntityField label="Village" required error={errors.village}><input value={draft.village} onChange={(event) => set('village', event.target.value)} placeholder="Village" /></EntityField>
          <EntityField label="District" required error={errors.district}><input value={draft.district} onChange={(event) => set('district', event.target.value)} placeholder="District" /></EntityField>
          <EntityField label="State" required error={errors.state}><input value={draft.state} onChange={(event) => set('state', event.target.value)} placeholder="State" /></EntityField>
          <EntityField label="Preferred communication language" required error={errors.preferredLanguage}><input value={draft.preferredLanguage} onChange={(event) => set('preferredLanguage', event.target.value)} placeholder="e.g. Marathi, Hindi" /></EntityField>
          <EntityField label="FPO membership status" required><select value={draft.membershipStatus} onChange={(event) => set('membershipStatus', event.target.value as FarmerInput['membershipStatus'])}><option>Active</option><option>Inactive</option></select></EntityField>
          <EntityField label="Notes (optional)" hint="Avoid adding sensitive personal details that are not needed for FPO operations."><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Operational notes" /></EntityField>
        </div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><Fingerprint size={19} /></div><h3>Farmer record ID</h3><strong className="generated-id">{existing?.id ?? nextFarmerId(data)}</strong><p>{existing ? 'Farmer IDs stay stable so plots and crop cycles remain linked to this record.' : 'A unique ID is generated when you save this record.'}</p><div className="entity-aside-separator" /><h4>Participation is separate</h4><p>FPO membership does not mean a farmer has consented to a supply programme. Record participation from the farmer profile.</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={existing ? `/farmers-plots/${existing.id}` : '/farmers'}>Cancel</Link><button className="primary-button" type="button" disabled={saving} onClick={submit}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Register farmer'}</button></div>
  </div>
}
