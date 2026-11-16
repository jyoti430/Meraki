import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, Plus, Search } from 'lucide-react'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import useRequirements from '../hooks/useRequirements'

export default function Requirements() {
  const { items, error, refresh } = useRequirements()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => items?.filter((item) => {
    const q = query.trim().toLocaleLowerCase()
    const matchesQuery = !q || [item.id, item.crop, item.variety, item.destination].some((value) => value.toLocaleLowerCase().includes(q))
    return matchesQuery && (status === 'all' || item.status === status)
  }) ?? [], [items, query, status])

  return <div className="e-page">
    <ExporterPageHeader eyebrow="Demand workspace" title="Procurement requirements" description="Review synthetic example demand and create browser-local drafts. Drafts are not submitted to a buyer, FPO or shared service." actions={<Link className="e-button e-button-primary" to="/exporter/requirements/new"><Plus size={17} /> Create requirement</Link>} />
    <DemoNotice>The sample active requirements are synthetic fixtures. New requirements are stored as local drafts in this browser only; publishing or sharing demand is not implemented. For the server-backed synthetic proposal workflow, open <Link to="/trade/requirements">Requirements & proposals</Link>.</DemoNotice>
    <section className="e-panel e-requirements-panel">
      <div className="e-filter-bar">
        <label className="e-search"><Search size={17} /><span className="sr-only">Search requirements</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search crop, variety, destination or ID" /></label>
        <label className="e-select-label">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active examples</option><option value="draft">Local drafts</option></select></label>
      </div>
      {error ? <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void refresh()}>Retry</button></div> : items === null ? <div className="e-loading" role="status">Loading requirements…</div> : filtered.length === 0 ? <div className="e-empty-state"><span className="e-empty-icon"><ClipboardList size={25} /></span><h2>No matching requirements</h2><p>Try another search or status filter, or create a local draft.</p><Link to="/exporter/requirements/new" className="e-button e-button-secondary"><Plus size={17} /> Create local draft</Link></div> : <>
        <div className="e-table-wrap"><table className="e-table"><thead><tr><th>Requirement</th><th>Crop & variety</th><th>Quantity</th><th>Grade</th><th>Destination</th><th>Required by</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{filtered.map((item) => <tr key={item.id}>
            <td><Link className="e-table-primary" to={`/exporter/requirements/${item.id}`}>{item.id}</Link><small>{item.source === 'synthetic-demo' ? 'Synthetic example' : 'Local browser draft'}</small></td>
            <td>{item.crop}<small>{item.variety}</small></td><td>{item.quantityKg.toLocaleString()} kg</td><td>{item.grade}</td><td>{item.destination}</td><td>{item.requiredBy}</td>
            <td><StatusBadge tone={item.status === 'active' ? 'good' : 'neutral'}>{item.status === 'active' ? 'Active · demo' : 'Draft · local'}</StatusBadge></td>
            <td><Link aria-label={`View ${item.id}`} className="e-icon-link" to={`/exporter/requirements/${item.id}`}><ArrowRight size={17} /></Link></td>
          </tr>)}</tbody>
        </table></div>
        <p className="e-table-footnote">{filtered.length} {filtered.length === 1 ? 'requirement' : 'requirements'} · Sample data and local drafts are kept separate from live backend records.</p>
      </>}
    </section>
  </div>
}
