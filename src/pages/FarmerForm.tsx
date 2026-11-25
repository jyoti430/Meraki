import { useState } from 'react'
import { ArrowLeft, Fingerprint } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EntityAlert, EntityField, EntitySection } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { nextFarmerId } from '../services/FarmersService'
import type { FarmerInput } from '../services/FarmersService'
import { useI18n } from '../i18n'

type FarmerDraft = FarmerInput
type Errors = Record<string, string>

export default function FarmerForm() {
  const { farmerId } = useParams()
  const navigate = useNavigate()
  const { data, addFarmer, editFarmer } = useFarmers()
  const { t } = useI18n()
  const existing = data.farmers.find((farmer) => farmer.id === farmerId)
  const [draft, setDraft] = useState<FarmerDraft>(() => existing ? ({ name: existing.name, phone: existing.phone, village: existing.village, district: existing.district, state: existing.state, preferredLanguage: existing.preferredLanguage, membershipStatus: existing.membershipStatus, notes: existing.notes }) : ({ name: '', phone: '', village: '', district: '', state: '', preferredLanguage: '', membershipStatus: 'Active', notes: '' }))
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof FarmerDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const editing = Boolean(farmerId)

  if (editing && !existing) return <div className="entity-not-found"><h2>{t('f_form_farmer_not_found')}</h2><p>{t('f_form_record_unavailable')}</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={15} /> {t('nav_farmers')}</Link></div>

  function submit() {
    const next: Errors = {}
    if (!draft.name.trim()) next.name = t('f_form_enter_name')
    if (!draft.phone.trim()) next.phone = t('f_form_enter_phone')
    else if (!/^[+\d][\d\s().-]{6,20}$/.test(draft.phone.trim())) next.phone = t('f_form_phone_invalid')
    if (!draft.village.trim()) next.village = t('f_form_enter_village')
    if (!draft.district.trim()) next.district = t('f_form_enter_district')
    if (!draft.state.trim()) next.state = t('f_form_enter_state')
    if (!draft.preferredLanguage.trim()) next.preferredLanguage = t('f_form_enter_language')
    setErrors(next)
    if (Object.keys(next).length) {
      setFormError(t('f_form_review_before_save'))
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
      setFormError(error instanceof Error ? error.message : t('f_form_save_failed'))
    } finally {
      setSaving(false)
    }
  }

  return <div className="entity-page entity-form-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to={existing ? `/farmers-plots/${existing.id}` : '/farmers'}><ArrowLeft size={14} /> {existing ? t('f_form_back_profile') : t('nav_farmers')}</Link><h2>{existing ? t('f_form_edit_farmer') : t('f_form_register_farmer')}</h2><p>{t('f_form_farmer_intro')}</p></div><span className="entity-demo-label">{t('f_form_demo_records')}</span></div>
    {formError && <EntityAlert>{formError}</EntityAlert>}
    <div className="entity-form-layout"><div className="entity-form-main">
      <EntitySection number="01" title={t('f_form_information')} description={t('f_form_information_desc')}>
        <div className="entity-fields-grid">
          <EntityField label={t('f_form_name')} required error={errors.name}><input autoFocus value={draft.name} onChange={(event) => set('name', event.target.value)} placeholder={t('f_form_full_name')} /></EntityField>
          <EntityField label={t('f_form_phone')} required error={errors.phone}><input type="tel" value={draft.phone} onChange={(event) => set('phone', event.target.value)} placeholder={t('f_form_contact_number')} /></EntityField>
          <EntityField label={t('f_form_village')} required error={errors.village}><input value={draft.village} onChange={(event) => set('village', event.target.value)} placeholder={t('f_form_village_placeholder')} /></EntityField>
          <EntityField label={t('f_form_district')} required error={errors.district}><input value={draft.district} onChange={(event) => set('district', event.target.value)} placeholder={t('f_form_district_placeholder')} /></EntityField>
          <EntityField label={t('f_form_state')} required error={errors.state}><input value={draft.state} onChange={(event) => set('state', event.target.value)} placeholder={t('f_form_state_placeholder')} /></EntityField>
          <EntityField label={t('f_form_language')} required error={errors.preferredLanguage}><input value={draft.preferredLanguage} onChange={(event) => set('preferredLanguage', event.target.value)} placeholder={t('f_form_language_placeholder')} /></EntityField>
          <EntityField label={t('f_form_membership')} required><select value={draft.membershipStatus} onChange={(event) => set('membershipStatus', event.target.value as FarmerInput['membershipStatus'])}><option value="Active">{t('status_active')}</option><option value="Inactive">{t('status_inactive')}</option></select></EntityField>
          <EntityField label={`${t('f_form_notes')} (${t('f_form_optional').toLowerCase()})`} hint={t('f_form_notes_hint')}><textarea rows={3} value={draft.notes} onChange={(event) => set('notes', event.target.value)} placeholder={t('f_form_notes_placeholder')} /></EntityField>
        </div>
      </EntitySection>
    </div><aside className="entity-form-aside"><div className="entity-aside-icon"><Fingerprint size={19} /></div><h3>{t('f_form_record_id')}</h3><strong className="generated-id">{existing?.id ?? nextFarmerId(data)}</strong><p>{existing ? t('f_form_id_stable') : t('f_form_id_generated')}</p><div className="entity-aside-separator" /><h4>{t('f_form_participation_separate')}</h4><p>{t('f_form_participation_detail')}</p></aside></div>
    <div className="entity-form-footer"><Link className="secondary-button" to={existing ? `/farmers-plots/${existing.id}` : '/farmers'}>{t('f_form_cancel')}</Link><button className="primary-button" type="button" disabled={saving} onClick={submit}>{saving ? t('f_form_saving') : existing ? t('f_form_save_changes') : t('f_form_register_farmer')}</button></div>
  </div>
}
