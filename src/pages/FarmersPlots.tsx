import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, CircleUserRound, ClipboardList, MapPinned, Plus, Search, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFarmers } from '../context/FarmersContext'
import { getActiveCropCycles, getFarmersOptedOutOfAnyProgramme, getPlotsForFarmer } from '../services/FarmersService'
import type { Farmer, MembershipStatus, ParticipationStatus } from '../types'

type MembershipFilter = 'All members' | MembershipStatus
type ParticipationFilter = 'All participation' | ParticipationStatus

function StatusBadge({ status, type = 'membership' }: { status: MembershipStatus | ParticipationStatus; type?: 'membership' | 'participation' }) {
  const labels: Record<MembershipStatus | ParticipationStatus, string> = { Active: 'Active member', Inactive: 'Inactive', 'not-recorded': 'Not recorded', 'opted-in': 'Opted in', 'opted-out': 'Opted out', unavailable: 'Unavailable' }
  return <span className={`farmer-status-badge ${type === 'membership' ? `membership-${status.toLowerCase()}` : `participation-${status}`} `}><i />{labels[status]}</span>
}

function FarmerRow({ farmer, plotCount, activeCycles }: { farmer: Farmer; plotCount: number; activeCycles: number }) {
  const { changeMembership } = useFarmers()
  function toggleMembership() {
    const next = farmer.membershipStatus === 'Active' ? 'Inactive' : 'Active'
    if (window.confirm(`${next === 'Inactive' ? 'Deactivate' : 'Activate'} FPO membership for ${farmer.name}?`)) changeMembership(farmer.id, next)
  }
  return <tr>
    <td><Link className="farmer-id-link" to={`/farmers-plots/${farmer.id}`}>{farmer.id}</Link></td>
    <td><Link className="farmer-name-link" to={`/farmers-plots/${farmer.id}`}>{farmer.name}</Link><small>{farmer.village}, {farmer.district}</small></td>
    <td>{farmer.phone}</td><td>{plotCount}</td><td><span className="cycle-count">{activeCycles}</span></td>
    <td><StatusBadge status={farmer.membershipStatus} /></td><td><StatusBadge status={farmer.consent.status} type="participation" /></td>
    <td><div className="farmer-row-actions"><Link className="entity-row-action" to={`/farmers-plots/${farmer.id}`} aria-label={`View ${farmer.name}`} title="View farmer"><ArrowRight size={15} /></Link><Link className="entity-row-action" to={`/farmers-plots/${farmer.id}/edit`} aria-label={`Edit ${farmer.name}`} title="Edit farmer"><ClipboardList size={14} /></Link><button type="button" className="membership-action" onClick={toggleMembership}>{farmer.membershipStatus === 'Active' ? 'Deactivate' : 'Activate'}</button></div></td>
  </tr>
}

export default function FarmersPlots() {
  const { data } = useFarmers()
  const [query, setQuery] = useState('')
  const [membership, setMembership] = useState<MembershipFilter>('All members')
  const [participation, setParticipation] = useState<ParticipationFilter>('All participation')
  const activeFarmers = useMemo(() => data.farmers.filter((farmer) => farmer.membershipStatus === 'Active').length, [data.farmers])
  const farmerCycleCount = useMemo(() => data.farmers.filter((farmer) => getActiveCropCycles(data, farmer.id).length > 0).length, [data])
  const optedOutCount = useMemo(() => getFarmersOptedOutOfAnyProgramme(data).length, [data])
  const rows = useMemo(() => {
    const search = query.trim().toLowerCase()
    return data.farmers.filter((farmer) => {
      const matchesText = !search || [farmer.id, farmer.name, farmer.phone].some((item) => item.toLowerCase().includes(search))
      const matchesMembership = membership === 'All members' || farmer.membershipStatus === membership
      const matchesParticipation = participation === 'All participation' || farmer.consent.status === participation
      return matchesText && matchesMembership && matchesParticipation
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [data.farmers, query, membership, participation])

  return <div className="entity-page farmers-page">
    <div className="entity-page-top"><div><div className="entity-kicker"><UsersIcon /> FARMER DIRECTORY</div><h2>Farmers &amp; Plots</h2><p>Manage FPO membership, supply participation and the plots and crop cycles linked to each farmer.</p></div><div className="entity-top-actions"><span className="entity-demo-label">Synthetic demo records</span><Link to="/farmers-plots/new" className="primary-button"><UserRoundPlus size={15} /> Add Farmer</Link></div></div>

    <div className="entity-summary-grid">
      <Summary icon={<CircleUserRound size={17} />} label="Total farmers" value={data.farmers.length} caption="In this directory" />
      <Summary icon={<CheckCircle2 size={17} />} label="Active members" value={activeFarmers} caption="FPO membership active" tone="green" />
      <Summary icon={<MapPinned size={17} />} label="Farmers with active crop cycles" value={farmerCycleCount} caption="Planned, growing or harvest-ready" tone="blue" />
      <Summary icon={<ShieldCheck size={17} />} label="Opted out of a programme / order" value={optedOutCount} caption="Scope-specific participation records" tone="amber" />
    </div>

    <section className="entity-list-panel"><div className="entity-list-heading"><div><h3>Farmer records</h3><p>Consent and participation are tracked separately from FPO membership.</p></div><span className="entity-record-count">{rows.length} of {data.farmers.length}</span></div>
      <div className="entity-list-controls"><label className="entity-search"><Search size={16} /><input aria-label="Search by farmer name, farmer ID or phone" placeholder="Search name, farmer ID or phone" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button>}</label><label className="entity-filter"><span>Membership</span><select value={membership} onChange={(event) => setMembership(event.target.value as MembershipFilter)}><option>All members</option><option>Active</option><option>Inactive</option></select></label><label className="entity-filter"><span>Participation</span><select value={participation} onChange={(event) => setParticipation(event.target.value as ParticipationFilter)}><option>All participation</option><option value="not-recorded">Not recorded</option><option value="opted-in">Opted in</option><option value="opted-out">Opted out</option><option value="unavailable">Unavailable</option></select></label></div>
      {rows.length ? <div className="entity-table-scroll"><table className="farmers-table"><thead><tr><th>FARMER ID</th><th>FARMER</th><th>CONTACT NUMBER</th><th>PLOTS</th><th>ACTIVE CYCLES</th><th>MEMBERSHIP</th><th>SUPPLY PARTICIPATION</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((farmer) => <FarmerRow key={farmer.id} farmer={farmer} plotCount={getPlotsForFarmer(data, farmer.id).length} activeCycles={getActiveCropCycles(data, farmer.id).length} />)}</tbody></table></div> : <div className="entity-empty-state"><div><Search size={19} /></div><h3>{data.farmers.length ? 'No matching farmers' : 'No farmers registered yet'}</h3><p>{data.farmers.length ? 'Try a different search or clear one of the filters.' : 'Register a farmer to start connecting plots and crop cycles.'}</p>{data.farmers.length ? <button className="secondary-button" onClick={() => { setQuery(''); setMembership('All members'); setParticipation('All participation') }}>Clear filters</button> : <Link className="primary-button" to="/farmers-plots/new"><Plus size={15} /> Add Farmer</Link>}</div>}
      <div className="entity-list-footnote">All people, contact numbers, locations and crop details are synthetic demo data.</div>
    </section>
  </div>
}

function Summary({ icon, label, value, caption, tone = '' }: { icon: React.ReactNode; label: string; value: number; caption: string; tone?: string }) {
  return <article className="entity-summary-card"><span className={`entity-summary-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><span>{caption}</span></div></article>
}

function UsersIcon() { return <CircleUserRound size={14} /> }
