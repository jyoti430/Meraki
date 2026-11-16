import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FlaskConical, Search, ShieldCheck } from 'lucide-react'
import { useLots } from '../context/LotsContext'
import { useLabReview } from '../context/LabReviewContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { getCurrentReleaseStatus, getLabEvidenceStatus, getReleaseEligibility, getRequirementDefinitions } from '../services/LabReviewService'

const badge = (status: string) => <span className={`lab-badge lab-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{status}</span>
export default function LabReleaseReview() {
  const { data: lots } = useLots()
  const { data } = useLabReview()
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All review statuses')
  const [product, setProduct] = useState('All products')
  const [buyer, setBuyer] = useState('All buyers')
  const [dateFilter, setDateFilter] = useState('')
  const rows = useMemo(() => lots.lots.map((lot) => {
    const order = orders.find((item) => item.id === lot.buyerOrderId)
    const result = order ? getCurrentReleaseStatus(lot, order, data) : { status: 'Review Required' as const, stale: true }
    const requirements = order ? getRequirementDefinitions(lot, order, data) : []
    const eligibility = order ? getReleaseEligibility(lot, order, data) : { blockers: ['Linked buyer order not found.'], eligible: false, warnings: [], fingerprint: '', reviews: [] }
    const outstanding = eligibility.blockers.length
    return { lot, order, result, requirements, eligibility, outstanding, farmer: farmers.farmers.find((item) => item.id === lot.farmerId)?.name ?? lot.farmerId }
  }).filter(({ lot, order, result, farmer }) => {
    const matchesText = `${lot.id} ${lot.crop} ${lot.variety} ${farmer} ${order?.buyer.name ?? ''} ${order?.id ?? ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (status === 'All review statuses' || result.status === status) && (product === 'All products' || lot.crop === product) && (buyer === 'All buyers' || order?.buyer.name === buyer) && (!dateFilter || lot.arrivalAt.slice(0, 10) === dateFilter)
  }).sort((a, b) => a.lot.arrivalAt.localeCompare(b.lot.arrivalAt)), [lots.lots, orders, farmers.farmers, data, query, status, product, buyer, dateFilter])
  const summary = [
    { label: 'Lots requiring review', value: lots.lots.filter((lot) => { const order = orders.find((item) => item.id === lot.buyerOrderId); return !order || getCurrentReleaseStatus(lot, order, data).status !== 'Released' }).length, icon: <FlaskConical size={17} /> },
    { label: 'Evidence pending', value: lots.lots.filter((lot) => ['Unknown', 'Pending', 'Under Review'].includes(getLabEvidenceStatus(lot, data))).length, icon: <AlertTriangle size={17} /> },
    { label: 'Release eligible', value: lots.lots.filter((lot) => { const order = orders.find((item) => item.id === lot.buyerOrderId); return order ? getReleaseEligibility(lot, order, data).eligible : false }).length, icon: <ShieldCheck size={17} /> },
  ]
  const products = [...new Set(lots.lots.map((lot) => lot.crop))]
  const buyers = [...new Set(orders.filter((order) => lots.lots.some((lot) => lot.buyerOrderId === order.id)).map((order) => order.buyer.name))]
  return <div className="page-shell lab-page"><div className="page-heading-row"><div><div className="eyebrow">QUALITY GOVERNANCE</div><h1>Lab &amp; Release Review</h1><p>Review evidence against the buyer’s saved specification before recording an explicit lot decision.</p></div></div>
    <div className="lab-demo-note"><FlaskConical size={15} /> Local synthetic demo workspace. Reports and review decisions are saved in this browser; no lab integration or automatic certification.</div>
    <div className="lab-summary-grid">{summary.map((item) => <article key={item.label}><span>{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong></div></article>)}</div>
    <section className="lab-list-card"><header className="lab-list-header"><div><h2>Lots requiring review</h2><p>Report values are entered by the reviewer and remain unchanged after saving.</p></div><div className="lab-filters"><label className="lab-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lot, buyer, farmer or crop" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All review statuses</option>{['Review Required', 'Released', 'Held', 'Rejected'].map((item) => <option key={item}>{item}</option>)}</select><select value={product} onChange={(event) => setProduct(event.target.value)}><option>All products</option>{products.map((item) => <option key={item}>{item}</option>)}</select><select value={buyer} onChange={(event) => setBuyer(event.target.value)}><option>All buyers</option>{buyers.map((item) => <option key={item}>{item}</option>)}</select><input aria-label="Filter by arrival date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></div></header>
      {rows.length ? <div className="lab-table-scroll"><table className="lab-table"><thead><tr><th>LOT</th><th>BUYER ORDER</th><th>PRODUCT</th><th>FARMER / FPO</th><th>INSPECTION</th><th>LAB EVIDENCE</th><th>OUTSTANDING REQUIREMENTS</th><th>OVERALL REVIEW</th><th /></tr></thead><tbody>{rows.map(({ lot, order, result, outstanding, eligibility, farmer }) => <tr key={lot.id}><td><Link to={`/lab-release-review/${lot.id}`}>{lot.id}</Link></td><td>{order?.id ?? lot.buyerOrderId}<small>{order?.buyer.name ?? 'Buyer order unavailable'}</small></td><td>{lot.crop}<small>{lot.variety}</small></td><td>{farmer}<small>{lot.farmerId}</small></td><td>{badge(lot.inspectionStatus)}</td><td>{badge(getLabEvidenceStatus(lot, data))}<small>{data.reports.filter((report) => report.lotId === lot.id).length} report(s)</small></td><td>{outstanding} item(s)<small>{eligibility.blockers.slice(0, 2).join('; ')}</small></td><td>{badge(result.status)}{result.stale && <small>Evidence changed since decision</small>}</td><td><Link className="lab-open-link" to={`/lab-release-review/${lot.id}`}>Review lot</Link></td></tr>)}</tbody></table></div> : <div className="lab-empty"><div><FlaskConical size={20} /></div><h3>{lots.lots.length ? 'No lots match these filters' : 'No received lots to review'}</h3><p>{lots.lots.length ? 'Change the filters or search to find a lot.' : 'Receive and inspect produce first. This workspace does not seed fictional lot or laboratory results.'}</p><Link className="secondary-button" to="/lots-inspection">Open Lots &amp; Inspection</Link></div>}
    </section>
  </div>
}
