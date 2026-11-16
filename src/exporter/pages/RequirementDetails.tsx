import { ArrowLeft, Edit3 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import useRequirements from '../hooks/useRequirements'

export default function RequirementDetails() {
  const { requirementId = '' } = useParams()
  const { items, error } = useRequirements()
  const item = items?.find((record) => record.id === requirementId)

  if (error) return <div className="e-page"><div className="e-error" role="alert">{error}</div><Link className="e-inline-link" to="/exporter/requirements">Back to requirements</Link></div>
  if (!items) return <div className="e-page"><p role="status" className="e-muted">Loading requirement…</p></div>
  if (!item) return <div className="e-page"><div className="e-empty-state"><h1>Requirement not found</h1><p>This demo record may have been removed from local storage.</p><Link to="/exporter/requirements" className="e-button e-button-secondary">Back to requirements</Link></div></div>

  const editable = item.status === 'draft' && item.source === 'local-draft'
  return <div className="e-page">
    <ExporterPageHeader eyebrow="Requirement details" title={item.crop} description={`${item.variety} · ${item.id}`} actions={<><Link className="e-button e-button-secondary" to="/exporter/requirements"><ArrowLeft size={17} /> Back</Link>{editable && <Link className="e-button e-button-primary" to={`/exporter/requirements/${item.id}/edit`}><Edit3 size={16} /> Edit draft</Link>}</>} />
    <DemoNotice>{item.source === 'synthetic-demo' ? 'This is a synthetic sample requirement and does not represent a real buyer or order.' : 'This draft is stored in this browser only. It has not been shared or submitted.'}</DemoNotice>
    <section className="e-detail-overview e-panel">
      <div><span className="e-field-label">Status</span><StatusBadge tone={item.status === 'active' ? 'good' : 'neutral'}>{item.status === 'active' ? 'Active · synthetic example' : 'Draft · local only'}</StatusBadge></div>
      <div><span className="e-field-label">Required quantity</span><strong>{item.quantityKg.toLocaleString()} kg</strong></div>
      <div><span className="e-field-label">Preferred grade</span><strong>{item.grade}</strong></div>
      <div><span className="e-field-label">Required by</span><strong>{item.requiredBy}</strong></div>
      <div><span className="e-field-label">Destination</span><strong>{item.destination}</strong></div>
      <div><span className="e-field-label">Packaging</span><strong>{item.packaging || 'Not specified'}</strong></div>
    </section>
    <section className="e-panel"><div className="e-panel-head"><div><p className="e-eyebrow">Buyer-defined</p><h2>Quality specification</h2></div></div>
      {item.criteria.length === 0 ? <p className="e-muted">No buyer-specific criteria provided.</p> : <div className="e-criteria-display">{item.criteria.map((criterion) => <article className="e-criteria-display-row" key={criterion.id}>
        <div><strong>{criterion.attribute || 'Unspecified attribute'}</strong><small>{criterion.required ? 'Required' : 'Optional'}{criterion.unit ? ` · ${criterion.unit}` : ''}</small></div>
        <span>{criterion.minimum || '—'} to {criterion.maximum || '—'}</span><p>{criterion.notes || 'No additional notes.'}</p>
      </article>)}</div>}
    </section>
    <section className="e-panel"><div className="e-panel-head"><div><p className="e-eyebrow">Additional information</p><h2>Notes</h2></div></div><p className="e-notes-text">{item.notes || 'No additional notes.'}</p></section>
    {!editable && <p className="e-page-footnote">Only local drafts can be edited. Requirement publishing and fulfilment transitions are not connected.</p>}
  </div>
}
