import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Filter, MapPin, PackageSearch, ShieldAlert } from 'lucide-react'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { exporterService } from '../exporterService'
import useRequirements from '../hooks/useRequirements'
import type { SupplyProjectionExample } from '../types'

export default function Marketplace() {
  const { items: requirements } = useRequirements()
  const [projections, setProjections] = useState<SupplyProjectionExample[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [crop, setCrop] = useState('all')
  const [grade, setGrade] = useState('all')
  const [region, setRegion] = useState('')
  const [requirementId, setRequirementId] = useState('')
  async function loadProjections() {
    setError(null)
    try { setProjections(await exporterService.listSupplyProjections()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load supply examples.') }
  }
  useEffect(() => { void loadProjections() }, [])

  const selectedRequirement = requirements?.find((item) => item.id === requirementId)
  const visible = useMemo(() => projections?.filter((listing) => {
    return (crop === 'all' || listing.crop === crop) && (grade === 'all' || listing.grade === grade) &&
      (!region.trim() || listing.region.toLocaleLowerCase().includes(region.trim().toLocaleLowerCase()))
  }) ?? [], [projections, crop, grade, region])

  return <div className="e-page">
    <ExporterPageHeader eyebrow="Supply discovery" title="FPO marketplace" description="Compare illustrative weekly projections against a requirement. Forecasts are not harvested or available-to-reserve stock." />
    <DemoNotice>Marketplace cards are synthetic examples. FPO labels and regions are placeholders, consent and eligibility are not verified, and no farmer or private organisation details are shown. Live reservation is disabled.</DemoNotice>
    {error && <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void loadProjections()}>Retry</button></div>}
    <section className="e-panel e-market-filters">
      <div className="e-filter-heading"><Filter size={18} /><strong>Compare supply examples</strong><span>Filters only narrow the displayed sample rows; they do not evaluate eligibility.</span></div>
      <div className="e-filter-grid">
        <label className="e-select-label">Compare with requirement<select value={requirementId} onChange={(event) => setRequirementId(event.target.value)}><option value="">No requirement selected</option>{requirements?.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.crop} ({item.source === 'synthetic-demo' ? 'demo' : 'local draft'})</option>)}</select></label>
        <label className="e-select-label">Crop<select value={crop} onChange={(event) => setCrop(event.target.value)}><option value="all">All crops</option>{Array.from(new Set(projections?.map((item) => item.crop) ?? [])).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="e-select-label">Grade<select value={grade} onChange={(event) => setGrade(event.target.value)}><option value="all">All grades</option>{Array.from(new Set(projections?.map((item) => item.grade) ?? [])).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="e-select-label">Region<input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Filter example regions" /></label>
      </div>
      {selectedRequirement && <p className="e-compare-hint">Comparing against <strong>{selectedRequirement.id}</strong>: {selectedRequirement.crop} · {selectedRequirement.quantityKg.toLocaleString()} kg · {selectedRequirement.grade}. These figures are not a match decision or reservation.</p>}
    </section>
    {projections === null && !error ? <div className="e-loading" role="status">Loading synthetic supply examples…</div> : visible.length === 0 ? <div className="e-empty-state"><span className="e-empty-icon"><PackageSearch size={25} /></span><h2>No examples match those filters</h2><p>Clear a filter to review the available synthetic projections.</p><button className="e-button e-button-secondary" type="button" onClick={() => { setCrop('all'); setGrade('all'); setRegion('') }}>Clear filters</button></div> : <div className="e-market-grid">
      {visible.map((listing) => <article className="e-market-card" key={listing.id}>
        <div className="e-market-card-top"><span className="e-market-symbol"><PackageSearch size={20} /></span><StatusBadge tone="muted">Projected · synthetic</StatusBadge></div>
        <div className="e-market-title"><h2>{listing.crop}</h2><p>{listing.variety} · {listing.grade}</p></div>
        <div className="e-market-org"><strong>{listing.fpoLabel}</strong><span><MapPin size={14} />{listing.region}</span></div>
        <div className="e-project-quantity"><span>Projected volume</span><strong>{listing.projectedKg.toLocaleString()} kg</strong><small>Range {listing.lowKg.toLocaleString()}–{listing.highKg.toLocaleString()} kg · not harvested stock</small></div>
        <div className="e-market-facts"><div><CalendarDays size={15} /><span>{listing.deliveryWeek}</span></div><div><ShieldAlert size={15} /><span>{listing.uncertaintySummary}</span></div></div>
        <div className="e-evidence-box"><strong>Evidence & eligibility</strong><p>{listing.qualitySummary} {listing.evidenceSummary}</p><p>{listing.consentSummary}</p></div>
        <button className="e-button e-button-disabled" type="button" disabled title="Reservation requires an authenticated organisation and a live eligible listing">Reservation unavailable</button>
        <small className="e-disabled-reason">No auth provider or live eligibility check is connected.</small>
      </article>)}
    </div>}
    <p className="e-page-footnote">Part 2 exposes an authenticated market endpoint for consented, reviewed capacities. This no-login demo does not call it or bypass its organisation permissions.</p>
  </div>
}
