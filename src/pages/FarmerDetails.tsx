import { useState } from 'react'
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CircleAlert, CirclePlus, Edit3, MapPinned, Plus, Sprout, UserRound, UserRoundCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { EntityField } from '../components/farmers/EntityFormControls'
import { useFarmers } from '../context/FarmersContext'
import { formatEntityDate, formatEntityDateTime, getActiveCropCycles, getEligibleFarmers, getFarmerParticipation, getPlotsForFarmer } from '../services/FarmersService'
import type { ParticipationScope, ParticipationStatus } from '../types'

export default function FarmerDetails() {
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
  if (!farmer) return <div className="entity-not-found"><h2>Farmer not found</h2><p>This farmer record is not available in the current demo data.</p><Link className="secondary-button" to="/farmers-plots"><ArrowLeft size={14} /> Back to farmers</Link></div>
  const currentFarmer = farmer

  const plots = getPlotsForFarmer(data, farmer.id)
  const cycles = data.cropCycles.filter((cycle) => plots.some((plot) => plot.id === cycle.plotId)).sort((a, b) => b.plantingDate.localeCompare(a.plantingDate))
  const activeCycles = getActiveCropCycles(data, farmer.id)
  const participation = getFarmerParticipation(data, farmer.id)
  const eligible = getEligibleFarmers(data).some((item) => item.id === farmer.id)
  const recentHistory = participation.history

  function toggleMembership() {
    const next = currentFarmer.membershipStatus === 'Active' ? 'Inactive' : 'Active'
    if (window.confirm(`${next === 'Inactive' ? 'Deactivate' : 'Activate'} FPO membership for ${currentFarmer.name}?`)) changeMembership(currentFarmer.id, next)
  }

  function submitParticipation() {
    if (!reason.trim()) { setFormError('Add a reason so the participation change has context.'); return }
    if (scope !== 'supply-programme' && !scopeId.trim()) { setFormError(scope === 'buyer-order' ? 'Enter the buyer order ID for this order-specific record.' : 'Enter the supply programme ID for this scoped record.'); return }
    addParticipation({ farmerId: currentFarmer.id, scope: scope === 'buyer-order' ? 'buyer-order' : 'supply-programme', scopeId: scope === 'supply-programme' ? null : scopeId.trim(), status, reason: reason.trim(), notes: participationNotes.trim() })
    setFormError('')
    setFeedback('Participation record saved with a timestamp.')
    setReason('')
    setParticipationNotes('')
    setScopeId('')
  }

  return <div className="entity-page farmer-detail-page">
    <div className="entity-page-top"><div><Link className="entity-back-link" to="/farmers-plots"><ArrowLeft size={14} /> Farmer directory</Link><div className="farmer-profile-title"><span className="farmer-avatar"><UserRound size={20} /></span><div><h2>{farmer.name}</h2><p>{farmer.id} <span>·</span> {farmer.village}, {farmer.district}, {farmer.state}</p></div></div></div><div className="entity-top-actions"><Link to={`/farmers-plots/${farmer.id}/edit`} className="secondary-button"><Edit3 size={14} /> Edit farmer</Link><button className="secondary-button" type="button" onClick={toggleMembership}>{farmer.membershipStatus === 'Active' ? 'Deactivate membership' : 'Activate membership'}</button><Link to={`/plots/new?farmerId=${farmer.id}`} className="primary-button"><Plus size={15} /> Add plot</Link></div></div>

    <div className="farmer-profile-status-row"><div><span className="profile-label">FPO membership</span><span className={`farmer-status-badge membership-${farmer.membershipStatus.toLowerCase()}`}><i />{farmer.membershipStatus}</span></div><div><span className="profile-label">Supply participation</span><span className={`farmer-status-badge participation-${farmer.consent.status}`}><i />{farmer.consent.status === 'not-recorded' ? 'Not recorded' : farmer.consent.status.replace('-', ' ')}</span></div><div><span className="profile-label">General programme eligibility</span><span className={`eligibility-badge ${eligible ? 'eligible' : 'ineligible'}`}><i />{eligible ? 'Eligible to be considered' : 'Not eligible'}</span></div><p>Eligibility only confirms current consent and membership. It does not reserve or allocate estimated production.</p></div>

    <div className="farmer-detail-grid"><div className="farmer-detail-main">
      <section className="entity-detail-card"><header><span className="entity-card-icon"><UserRoundCheck size={16} /></span><div><h3>Farmer information</h3><p>Contact and location details in the FPO directory.</p></div></header><div className="entity-detail-values"><DetailValue label="Phone number">{farmer.phone}</DetailValue><DetailValue label="Village">{farmer.village}</DetailValue><DetailValue label="District">{farmer.district}</DetailValue><DetailValue label="State">{farmer.state}</DetailValue><DetailValue label="Preferred language">{farmer.preferredLanguage}</DetailValue><DetailValue label="Notes">{farmer.notes}</DetailValue></div></section>

      <section className="entity-detail-card"><header><span className="entity-card-icon"><MapPinned size={16} /></span><div><h3>Plots <small>{plots.length}</small></h3><p>Plots are attached to this farmer and keep their own crop cycle records.</p></div><Link className="entity-inline-link" to={`/plots/new?farmerId=${farmer.id}`}><CirclePlus size={14} /> Add plot</Link></header>
        {plots.length ? <div className="farmer-plot-list">{plots.map((plot) => <Link className="farmer-plot-row" to={`/plots/${plot.id}`} key={plot.id}><span className="plot-mini-icon"><MapPinned size={16} /></span><span className="farmer-plot-copy"><strong>{plot.name}</strong><small>{plot.villageLocation} · {plot.area} {plot.areaUnit}{plot.area === 1 ? '' : 's'}</small></span><span className="farmer-plot-cycle-count">{getActiveCropCycles(data).filter((cycle) => cycle.plotId === plot.id).length} active cycles</span><ArrowRight size={15} /></Link>)}</div> : <div className="entity-inline-empty"><p>No plots registered for this farmer yet.</p><Link to={`/plots/new?farmerId=${farmer.id}`}>Add the first plot <ArrowRight size={13} /></Link></div>}
      </section>

      <section className="entity-detail-card"><header><span className="entity-card-icon"><Sprout size={16} /></span><div><h3>Crop cycle overview <small>{activeCycles.length} active</small></h3><p>Estimates are planning information and are not harvested or available stock.</p></div><Link className="entity-inline-link" to={`/crop-cycles/new?farmerId=${farmer.id}`}><CirclePlus size={14} /> Add crop cycle</Link></header>
        {cycles.length ? <div className="cycle-overview-list">{cycles.map((cycle) => { const plot = data.plots.find((item) => item.id === cycle.plotId); return <Link className="cycle-overview-row" to={`/crop-cycles/${cycle.id}`} key={cycle.id}><span className={`crop-status-marker crop-status-${cycle.status.toLowerCase().replace(/-/g, '')}`} /><span className="cycle-overview-copy"><strong>{cycle.crop} <small>{cycle.variety}</small></strong><span>{plot?.name ?? 'Plot'} · Harvest {formatEntityDate(cycle.expectedHarvestStartDate)} – {formatEntityDate(cycle.expectedHarvestEndDate)}</span></span><span className="cycle-overview-quantity">~{cycle.estimatedProductionKg.toLocaleString()} kg<small>estimated</small></span><span className="crop-cycle-status">{cycle.status}</span><ArrowRight size={14} /></Link> })}</div> : <div className="entity-inline-empty"><p>No crop cycles registered on this farmer’s plots.</p><span>Add a plot first, then add its crop cycles.</span></div>}
      </section>
    </div>

    <aside className="farmer-detail-aside">
      <section className="participation-card"><div className="participation-card-heading"><span><BadgeCheck size={17} /></span><div><h3>Participation &amp; consent</h3><p>Consent is separate from FPO membership.</p></div></div><div className="consent-current"><small>General supply programme</small><strong>{farmer.consent.status === 'not-recorded' ? 'No consent recorded' : farmer.consent.status.replace('-', ' ')}</strong><span>{farmer.consent.recordedAt ? `Recorded ${formatEntityDateTime(farmer.consent.recordedAt)}` : 'Farmer has not opted in.'}</span>{farmer.consent.reason && <p>{farmer.consent.reason}</p>}</div>
        <div className="participation-form"><h4>Record participation</h4>{formError && <p className="inline-form-error" role="alert">{formError}</p>}{feedback && <p className="inline-form-success" role="status">{feedback}</p>}
          <EntityField label="Participation scope"><select value={scope} onChange={(event) => { setScope(event.target.value as ParticipationScope | 'specific-programme'); setFormError(''); setFeedback('') }}><option value="supply-programme">General supply programme</option><option value="specific-programme">Specific supply programme</option><option value="buyer-order">Specific buyer order</option></select></EntityField>
          {scope === 'buyer-order' && <EntityField label="Buyer order ID" required><input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder="e.g. ORD-DEMO-024" /></EntityField>}
          {scope === 'specific-programme' && <EntityField label="Supply programme ID" required><input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder="Programme identifier" /></EntityField>}
          <EntityField label="Participation status" required><select value={status} onChange={(event) => setStatus(event.target.value as Exclude<ParticipationStatus, 'not-recorded'>)}><option value="opted-in">Opted in</option><option value="opted-out">Opted out</option><option value="unavailable">Unavailable for this scope</option></select></EntityField>
          <EntityField label="Reason" required><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this status being recorded?" /></EntityField>
          <EntityField label="Notes or restrictions"><textarea rows={2} value={participationNotes} onChange={(event) => setParticipationNotes(event.target.value)} placeholder="Optional details" /></EntityField>
          <button className="primary-button participation-save" type="button" onClick={submitParticipation}>Save participation record</button>
          <p className="participation-scope-note">A buyer-order record affects only that order. It does not replace general supply-programme consent.</p>
        </div>
      </section>
      <section className="participation-history-card"><header><CalendarClock size={15} /><h3>Participation history</h3></header>{recentHistory.length ? <div className="participation-history-list">{recentHistory.map((record) => <article key={record.id}><span className={`history-status-dot participation-dot-${record.status}`} /><div><strong>{record.status.replace('-', ' ')}</strong><small>{record.scope === 'buyer-order' ? `Buyer order ${record.scopeId}` : record.scopeId ? `Programme ${record.scopeId}` : 'General supply programme'}</small><small>{formatEntityDateTime(record.recordedAt)}</small><p>{record.reason}{record.notes ? ` · ${record.notes}` : ''}</p></div></article>)}</div> : <div className="participation-history-empty"><CircleAlert size={14} /><span>No participation updates recorded.</span></div>}</section>
    </aside></div>
  </div>
}

function DetailValue({ label, children }: { label: string; children: React.ReactNode }) { return <div><small>{label}</small><span>{children || <i>Not provided</i>}</span></div> }
