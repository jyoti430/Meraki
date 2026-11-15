import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, FlaskConical, PackageCheck, Plus, Search, ShieldAlert, Truck } from 'lucide-react'
import { useLots } from '../context/LotsContext'
import { useFarmers } from '../context/FarmersContext'

const badge = (value: string) => <span className={`lot-badge lot-${value.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{value}</span>
const date = (value: string) => new Intl.DateTimeFormat('en-SG', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))

export default function LotsInspection() {
  const { data: lots } = useLots()
  const { data: farmers } = useFarmers()
  const [query, setQuery] = useState('')
  const [crop, setCrop] = useState('All crops')
  const [inspection, setInspection] = useState('All inspection statuses')
  const [status, setStatus] = useState('All lot statuses')
  const crops = [...new Set(lots.lots.map((lot) => lot.crop))]
  const rows = useMemo(() => lots.lots.filter((lot) => {
    const farmer = farmers.farmers.find((item) => item.id === lot.farmerId)?.name ?? lot.farmerId
    const textMatch = `${lot.id} ${farmer} ${lot.crop} ${lot.variety}`.toLowerCase().includes(query.toLowerCase())
    return textMatch && (crop === 'All crops' || lot.crop === crop) && (inspection === 'All inspection statuses' || lot.inspectionStatus === inspection) && (status === 'All lot statuses' || lot.status === status)
  }), [lots.lots, farmers.farmers, query, crop, inspection, status])
  const summary = [
    { label: 'Total lots received', value: lots.lots.length, icon: <PackageCheck size={18} /> },
    { label: 'Awaiting inspection', value: lots.lots.filter((lot) => lot.inspectionStatus === 'Unassessed' || lot.inspectionStatus === 'In Progress').length, icon: <ClipboardCheck size={18} /> },
    { label: 'Inspection completed', value: lots.lots.filter((lot) => lot.inspectionStatus === 'Completed').length, icon: <Truck size={18} /> },
    { label: 'Pending laboratory evidence', value: lots.lots.filter((lot) => lot.safetyEvidenceStatus === 'Pending' || lot.safetyEvidenceStatus === 'Unknown' || lot.safetyEvidenceStatus === 'Under Review').length, icon: <FlaskConical size={18} /> },
    { label: 'Lots on hold', value: lots.lots.filter((lot) => lot.status === 'On Hold' || lot.safetyEvidenceStatus === 'Hold').length, icon: <ShieldAlert size={18} /> },
  ]
  return <div className="page-shell lot-page">
    <div className="page-heading-row"><div><div className="eyebrow">COLLECTION CENTRE</div><h1>Lots &amp; Inspection</h1><p>Receive allocated produce, record inspection evidence and keep each lot traceable.</p></div><Link className="primary-button" to="/lots-inspection/receive"><Plus size={16} /> Receive Produce</Link></div>
    <div className="lot-summary-grid">{summary.map((item) => <article className="lot-summary-card" key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong><em>Synthetic demo workspace</em></div></article>)}</div>
    <section className="lot-table-card"><div className="lot-table-toolbar"><div><h2>Received lots</h2><p>Every record is synthetic or entered by your team in this browser.</p></div><div className="lot-filters"><label className="lot-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lot, farmer or crop" /></label><select value={crop} onChange={(event) => setCrop(event.target.value)} aria-label="Filter by crop"><option>All crops</option>{crops.map((item) => <option key={item}>{item}</option>)}</select><select value={inspection} onChange={(event) => setInspection(event.target.value)} aria-label="Filter by inspection status"><option>All inspection statuses</option>{['Unassessed', 'In Progress', 'Completed', 'Needs Review'].map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by lot status"><option>All lot statuses</option>{['Received', 'Inspecting', 'Awaiting Evidence', 'Ready for Review', 'On Hold'].map((item) => <option key={item}>{item}</option>)}</select></div></div>
      {rows.length ? <div className="lot-table-scroll"><table className="lot-table"><thead><tr><th>LOT ID</th><th>FARMER</th><th>CROP / VARIETY</th><th>PLAN / BUYER ORDER</th><th>RECEIVED</th><th>INSPECTION</th><th>SAFETY EVIDENCE</th><th>LOT STATUS</th><th>RECEIVED DATE</th><th /></tr></thead><tbody>{rows.map((lot) => <tr key={lot.id}><td><Link className="lot-id-link" to={`/lots-inspection/${lot.id}`}>{lot.id}</Link></td><td>{farmers.farmers.find((item) => item.id === lot.farmerId)?.name ?? lot.farmerId}<small>{lot.farmerId}</small></td><td>{lot.crop}<small>{lot.variety}</small></td><td><Link to={`/supply-planning/${lot.supplyPlanId}`}>{lot.supplyPlanId}</Link><small>{lot.buyerOrderId}</small></td><td>{lot.weights.netReceivedWeightKg.toLocaleString()} kg{lot.weights.excessKg > 0 && <small className="lot-warn-text">{lot.weights.excessKg} kg excess review</small>}</td><td>{badge(lot.inspectionStatus)}</td><td>{badge(lot.safetyEvidenceStatus)}</td><td>{badge(lot.status)}</td><td>{date(lot.arrivalAt)}</td><td><Link className="lot-row-action" to={`/lots-inspection/${lot.id}`}>View</Link></td></tr>)}</tbody></table></div> : <div className="lot-empty"><div><PackageCheck size={21} /></div><h3>{lots.lots.length ? 'No lots match these filters' : 'No produce received yet'}</h3><p>{lots.lots.length ? 'Change your search or clear the filters.' : 'Receive produce against a confirmed supply plan to start a traceable collection record. Estimated and reserved quantities are not physical stock.'}</p>{lots.lots.length ? <button className="secondary-button" onClick={() => { setQuery(''); setCrop('All crops'); setInspection('All inspection statuses'); setStatus('All lot statuses') }}>Clear filters</button> : <Link className="primary-button" to="/lots-inspection/receive"><Plus size={15} /> Receive Produce</Link>}</div>}
    </section>
  </div>
}
