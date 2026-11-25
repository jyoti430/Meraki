import { useState } from 'react'
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CircleAlert, CirclePlus, Edit3, MapPinned, Plus, Sprout, UserRound, UserRoundCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EntityField } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { getActiveCropCycles, getEligibleFarmers, getFarmerParticipation, getPlotsForFarmer } from '../services/FarmersService'
import type { ParticipationScope, ParticipationStatus } from '../types'
import { cropLabel, formatDate, formatNumber, useI18n } from '../i18n'

export default function FarmerDetails() {
  const { t, lang } = useI18n()
  const formatDateTime = (value: string) => formatDate(value, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const { farmerId = '' } = useParams()
  const { data, changeMembership, addParticipation } = useFarmers()
  const farmer = data.farmers.find((item) => item.id === farmerId)
  const [scope, setScope] = useState<ParticipationScope | 'specific-programme'>('supply-programme')
  const [scopeId, setScopeId] = useState('')
  const [status, setStatus] = useState<Exclude<ParticipationStatus, 'not-recorded'>>('opted-in')
  const [reason, setReason] = useState('')
  const [participationNotes, setParticipationNotes] = useState('')
  const [feedback, setFeedback] = useState('')
  const [formError, setFormError] = useState('')
  if (!farmer) return <div className="entity-not-found"><h2>{t('fd_not_found')}</h2><p>{t('fd_unavailable')}</p><Link className="secondary-button" to="/farmers"><ArrowLeft size={14} /> {t('fd_back')}</Link></div>
  const currentFarmer = farmer

  const plots = getPlotsForFarmer(data, farmer.id)
  const cycles = data.cropCycles.filter((cycle) => plots.some((plot) => plot.id === cycle.plotId)).sort((a, b) => b.plantingDate.localeCompare(a.plantingDate))
  const activeCycles = getActiveCropCycles(data, farmer.id)
  const participation = getFarmerParticipation(data, farmer.id)
  const eligible = getEligibleFarmers(data).some((item) => item.id === farmer.id)
  const recentHistory = participation.history

  function toggleMembership() {
    const next = currentFarmer.membershipStatus === 'Active' ? 'Inactive' : 'Active'
    if (window.confirm(t('fd_confirm_membership', { action: t(next === 'Inactive' ? 'fd_action_deactivate' : 'fd_action_activate'), name: currentFarmer.name }))) changeMembership(currentFarmer.id, next)
  }

  function submitParticipation() {
    if (!reason.trim()) { setFormError(t('fd_reason_required')); return }
    if (scope !== 'supply-programme' && !scopeId.trim()) { setFormError(scope === 'buyer-order' ? t('fd_order_id_required') : t('fd_programme_id_required')); return }
    addParticipation({ farmerId: currentFarmer.id, scope: scope === 'buyer-order' ? 'buyer-order' : 'supply-programme', scopeId: scope === 'supply-programme' ? null : scopeId.trim(), status, reason: reason.trim(), notes: participationNotes.trim() })
    setFormError('')
    setFeedback(t('fd_record_saved'))
    setReason('')
    setParticipationNotes('')
    setScopeId('')
  }

  return <div className="entity-page farmer-detail-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to="/farmers"><ArrowLeft size={14} /> {t('fd_farmers_farms')}</Link><div className="farmer-profile-title"><span className="farmer-avatar"><UserRound size={20} /></span><div><h2>{farmer.name}</h2><p>{farmer.id} <span>·</span> {farmer.village}, {farmer.district}, {farmer.state}</p></div></div></div><div className="entity-top-actions"><Link to={`/farmers-plots/${farmer.id}/edit`} className="secondary-button"><Edit3 size={14} /> {t('fd_edit_farmer')}</Link><button className="secondary-button" type="button" onClick={toggleMembership}>{t(farmer.membershipStatus === 'Active' ? 'fd_deactivate_membership' : 'fd_activate_membership')}</button><Link to={`/plots/new?farmerId=${farmer.id}`} className="primary-button"><Plus size={15} /> {t('fd_add_plot')}</Link></div></div>

    <div className="farmer-profile-status-row"><div><span className="profile-label">{t('fd_fpo_membership')}</span><span className={`farmer-status-badge membership-${farmer.membershipStatus.toLowerCase()}`}><i />{t(farmer.membershipStatus === 'Active' ? 'fd_status_active' : 'fd_status_inactive')}</span></div><div><span className="profile-label">{t('fd_supply_participation')}</span><span className={`farmer-status-badge participation-${farmer.consent.status}`}><i />{t(`fd_status_${farmer.consent.status.replace('-', '_')}` as 'fd_status_not_recorded' | 'fd_status_opted_in' | 'fd_status_opted_out' | 'fd_status_unavailable')}</span></div><div><span className="profile-label">{t('fd_general_eligibility')}</span><span className={`eligibility-badge ${eligible ? 'eligible' : 'ineligible'}`}><i />{t(eligible ? 'fd_eligible' : 'fd_not_eligible')}</span></div><p>{t('fd_eligibility_limit')}</p></div>

    <div className="farmer-detail-grid"><div className="farmer-detail-main">
      <section className="entity-detail-card"><header><span className="entity-card-icon"><UserRoundCheck size={16} /></span><div><h3>{t('fd_information')}</h3><p>{t('fd_contact_location')}</p></div></header><div className="entity-detail-values"><DetailValue label={t('fd_phone')}>{farmer.phone}</DetailValue><DetailValue label={t('fd_village')}>{farmer.village}</DetailValue><DetailValue label={t('fd_district')}>{farmer.district}</DetailValue><DetailValue label={t('fd_state')}>{farmer.state}</DetailValue><DetailValue label={t('fd_preferred_language')}>{farmer.preferredLanguage}</DetailValue><DetailValue label={t('fd_notes')}>{farmer.notes}</DetailValue></div></section>

      <section className="entity-detail-card"><header><span className="entity-card-icon"><MapPinned size={16} /></span><div><h3>{t('fd_plots')} <small>{formatNumber(plots.length, lang)}</small></h3><p>{t('fd_plots_attached')}</p></div><Link className="entity-inline-link" to={`/plots/new?farmerId=${farmer.id}`}><CirclePlus size={14} /> {t('fd_add_plot')}</Link></header>
        {plots.length ? <div className="farmer-plot-list">{plots.map((plot) => <Link className="farmer-plot-row" to={`/plots/${plot.id}`} key={plot.id}><span className="plot-mini-icon"><MapPinned size={16} /></span><span className="farmer-plot-copy"><strong>{plot.name}</strong><small>{plot.villageLocation} · {formatNumber(plot.area, lang)} {plot.areaUnit}{plot.area === 1 ? '' : 's'}</small></span><span className="farmer-plot-cycle-count">{t('fd_active_cycles', { count: formatNumber(getActiveCropCycles(data).filter((cycle) => cycle.plotId === plot.id).length, lang) })}</span><ArrowRight size={15} /></Link>)}</div> : <div className="entity-inline-empty"><p>{t('fd_no_plots')}</p><Link to={`/plots/new?farmerId=${farmer.id}`}>{t('fd_add_first_plot')} <ArrowRight size={13} /></Link></div>}
      </section>

      <section className="entity-detail-card"><header><span className="entity-card-icon"><Sprout size={16} /></span><div><h3>{t('fd_cycle_overview')} <small>{t('fd_active_cycles', { count: formatNumber(activeCycles.length, lang) })}</small></h3><p>{t('fd_cycle_estimates')}</p></div><Link className="entity-inline-link" to={`/crop-cycles/new?farmerId=${farmer.id}`}><CirclePlus size={14} /> {t('fd_add_cycle')}</Link></header>
        {cycles.length ? <div className="cycle-overview-list">{cycles.map((cycle) => { const plot = data.plots.find((item) => item.id === cycle.plotId); const cycleStatusKeys = { Planned: 'fd_cycle_status_planned', Growing: 'fd_cycle_status_growing', 'Harvest-ready': 'fd_cycle_status_harvest_ready', Harvested: 'fd_cycle_status_harvested', Cancelled: 'fd_cycle_status_cancelled' } as const; return <Link className="cycle-overview-row" to={`/crop-cycles/${cycle.id}`} key={cycle.id}><span className={`crop-status-marker crop-status-${cycle.status.toLowerCase().replace(/-/g, '')}`} /><span className="cycle-overview-copy"><strong>{cropLabel(cycle.crop, t)} <small>{cycle.variety}</small></strong><span>{plot?.name ?? t('fd_plot')} · {t('fd_harvest')} {formatDate(cycle.expectedHarvestStartDate, lang)} – {formatDate(cycle.expectedHarvestEndDate, lang)}</span></span><span className="cycle-overview-quantity">~{formatNumber(cycle.estimatedProductionKg, lang)} kg<small>{t('fd_estimated')}</small></span><span className="crop-cycle-status">{t(cycleStatusKeys[cycle.status])}</span><ArrowRight size={14} /></Link> })}</div> : <div className="entity-inline-empty"><p>{t('fd_no_cycles')}</p><span>{t('fd_add_plot_first')}</span></div>}
      </section>
    </div>

    <aside className="farmer-detail-aside">
      <section className="participation-card"><div className="participation-card-heading"><span><BadgeCheck size={17} /></span><div><h3>{t('fd_participation_consent')}</h3><p>{t('fd_consent_separate')}</p></div></div><div className="consent-current"><small>{t('fd_general_programme')}</small><strong>{t(farmer.consent.status === 'not-recorded' ? 'fd_no_consent' : `fd_status_${farmer.consent.status.replace('-', '_')}` as 'fd_status_opted_in' | 'fd_status_opted_out' | 'fd_status_unavailable')}</strong><span>{farmer.consent.recordedAt ? t('fd_recorded_at', { date: formatDateTime(farmer.consent.recordedAt) }) : t('fd_farmer_not_opted_in')}</span>{farmer.consent.reason && <p>{farmer.consent.reason}</p>}</div>
        <div className="participation-form"><h4>{t('fd_record_participation')}</h4>{formError && <p className="inline-form-error" role="alert">{formError}</p>}{feedback && <p className="inline-form-success" role="status">{feedback}</p>}
          <EntityField label={t('fd_scope')}><select value={scope} onChange={(event) => { setScope(event.target.value as ParticipationScope | 'specific-programme'); setFormError(''); setFeedback('') }}><option value="supply-programme">{t('fd_general_programme')}</option><option value="specific-programme">{t('fd_specific_programme')}</option><option value="buyer-order">{t('fd_buyer_order')}</option></select></EntityField>
          {scope === 'buyer-order' && <EntityField label={t('fd_buyer_order_id')} required><input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder="ORD-DEMO-024" /></EntityField>}
          {scope === 'specific-programme' && <EntityField label={t('fd_programme_id')} required><input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder={t('fd_programme_id')} /></EntityField>}
          <EntityField label={t('fd_participation_status')} required><select value={status} onChange={(event) => setStatus(event.target.value as Exclude<ParticipationStatus, 'not-recorded'>)}><option value="opted-in">{t('fd_status_opted_in')}</option><option value="opted-out">{t('fd_status_opted_out')}</option><option value="unavailable">{t('fd_status_unavailable')}</option></select></EntityField>
          <EntityField label={t('fd_reason')} required><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('fd_reason_placeholder')} /></EntityField>
          <EntityField label={t('fd_notes_restrictions')}><textarea rows={2} value={participationNotes} onChange={(event) => setParticipationNotes(event.target.value)} placeholder={t('fd_optional_details')} /></EntityField>
          <button className="primary-button participation-save" type="button" onClick={submitParticipation}>{t('fd_save_participation')}</button>
          <p className="participation-scope-note">{t('fd_buyer_order_scope_note')}</p>
        </div>
      </section>
      <section className="participation-history-card"><header><CalendarClock size={15} /><h3>{t('fd_history')}</h3></header>{recentHistory.length ? <div className="participation-history-list">{recentHistory.map((record) => { const recordStatus = `fd_status_${record.status.replace('-', '_')}` as 'fd_status_opted_in' | 'fd_status_opted_out' | 'fd_status_unavailable'; return <article key={record.id}><span className={`history-status-dot participation-dot-${record.status}`} /><div><strong>{t(recordStatus)}</strong><small>{record.scope === 'buyer-order' ? t('fd_buyer_order_history', { id: record.scopeId || '' }) : record.scopeId ? t('fd_programme_history', { id: record.scopeId }) : t('fd_general_programme')}</small><small>{formatDateTime(record.recordedAt)}</small><p>{record.reason}{record.notes ? ` · ${record.notes}` : ''}</p></div></article> })}</div> : <div className="participation-history-empty"><CircleAlert size={14} /><span>{t('fd_no_updates')}</span></div>}</section>
    </aside></div>
  </div>
}

function DetailValue({ label, children }: { label: string; children: React.ReactNode }) { const { t } = useI18n(); return <div><small>{label}</small><span>{children || <i>{t('fd_not_provided')}</i>}</span></div> }
