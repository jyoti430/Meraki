import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleHelp, Info, RefreshCw, Save, ShieldCheck, Sprout } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { useSupplyPlanning } from '../context/SupplyPlanningContext'
import { applyManualAllocations, generateSupplyPreview } from '../services/SupplyPlanningService'
import type { CandidateAdjustment } from '../services/SupplyPlanningService'
import type { SupplyCandidate } from '../types'

const displayDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Not scheduled'
const kg = (value: number) => `${Number(value || 0).toLocaleString()} kg`

export default function SupplyPlanPreview() {
  const [params] = useSearchParams()
  const orderId = params.get('orderId') ?? ''
  const programmeId = params.get('programmeId')?.trim() || 'FPO-SUPPLY'
  const navigate = useNavigate()
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const { data: planning, savePlan, confirmNewPlan } = useSupplyPlanning()
  const order = orders.find((item) => item.id === orderId && item.status === 'Active')
  const [adjustments, setAdjustments] = useState<Record<string, CandidateAdjustment>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const previewResult = useMemo(() => {
    if (!order) return { preview: null, error: '' }
    try { return { preview: generateSupplyPreview(order, farmers, planning, programmeId), error: '' } }
    catch (caught) { return { preview: null, error: caught instanceof Error ? caught.message : 'Could not generate the preview.' } }
  }, [order, farmers, planning, programmeId])
  const preview = previewResult.preview
  const adjustedResult = useMemo(() => {
    if (!preview) return { adjusted: null, error: '' }
    try { return { adjusted: applyManualAllocations(preview, adjustments), error: '' } }
    catch (caught) { return { adjusted: null, error: caught instanceof Error ? caught.message : 'Review manual allocation changes.' } }
  }, [preview, adjustments])

  useEffect(() => { setAdjustments({}); setError('') }, [preview?.sourceFingerprint])

  if (!order) return <div className="supply-not-found"><h2>Active buyer order not found</h2><p>Only active buyer orders can be used to create a new supply plan.</p><Link className="secondary-button" to="/supply-planning/new"><ArrowLeft size={14} /> Select an active order</Link></div>
  const activeOrder = order
  if (!preview) return <div className="supply-not-found"><h2>Preview unavailable</h2><p>{previewResult.error || 'The plan could not be generated.'}</p><Link className="secondary-button" to="/supply-planning/new"><ArrowLeft size={14} /> Back to order selection</Link></div>
  const currentPreview = preview

  const adjusted = adjustedResult.adjusted
  const eligibleCandidates = preview.candidates.filter((candidate) => candidate.eligible)
  const excludedCandidates = preview.candidates.filter((candidate) => !candidate.eligible)
  const allocation = (candidate: SupplyCandidate) => adjustments[candidate.candidateId] ?? { quantityKg: candidate.proposedAllocationKg, included: candidate.proposedAllocationKg > 0, reason: '' }

  function changeCandidate(candidate: SupplyCandidate, patch: Partial<CandidateAdjustment>) {
    setAdjustments((current) => {
      const previous = current[candidate.candidateId] ?? { quantityKg: candidate.proposedAllocationKg, included: candidate.proposedAllocationKg > 0, reason: '' }
      return { ...current, [candidate.candidateId]: { ...previous, ...patch } }
    })
    setError('')
  }

  function save(status: 'Draft' | 'Previewed') {
    if (!adjusted) { setError(adjustedResult.error || 'Resolve allocation validation before saving.'); return }
    setSaving(true)
    try { const plan = savePlan(activeOrder.id, currentPreview, adjustments, status); navigate(`/supply-planning/${plan.id}`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be saved.') }
    finally { setSaving(false) }
  }

  function confirm() {
    if (!adjusted) { setError(adjustedResult.error || 'Resolve allocation validation before confirming.'); return }
    if (adjusted.allocatedQuantityKg <= 0) { setError('Allocate a positive quantity before confirming the plan.'); return }
    const partial = adjusted.uncoveredDemandKg > 0 ? ` ${kg(adjusted.uncoveredDemandKg)} of demand will remain uncovered.` : ''
    const commitment = activeOrder.product.orderType === 'Indicative' ? ' This order is indicative, not a confirmed commercial commitment.' : ''
    if (!window.confirm(`Confirm this plan with ${kg(adjusted.allocatedQuantityKg)} in planning reservations?${partial}${commitment} Reservations are estimates, not harvested stock.`)) return
    setSaving(true)
    try { const plan = confirmNewPlan(activeOrder.id, currentPreview, adjustments); navigate(`/supply-planning/${plan.id}`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be confirmed.') }
    finally { setSaving(false) }
  }

  return <div className="supply-page supply-preview-page">
    <div className="supply-page-top"><div><Link to={`/supply-planning/new?orderId=${order.id}&programmeId=${encodeURIComponent(programmeId)}`} className="supply-back-link"><ArrowLeft size={14} /> Change buyer order</Link><h2>Allocation preview</h2><p>Review candidate crop cycles and adjust the proposal before saving or confirming.</p></div><span className="supply-demo-label">Programme {programmeId} · Planning estimate only</span></div>
    {error && <div className="supply-form-error" role="alert">{error}</div>}
    <section className="preview-order-banner"><div><small>BUYER ORDER</small><strong>{order.id}</strong><span>{order.buyer.name} · {order.product.orderType} order</span></div><div><small>PRODUCT</small><strong>{order.product.crop} · {order.product.variety}</strong><span>{displayDate(order.product.deliveryStartDate)} – {displayDate(order.product.deliveryEndDate)}</span></div><div><small>REQUIRED</small><strong>{kg(preview.orderQuantityKg)}</strong><span>Order status: {order.status}</span></div><Link to={`/buyer-orders/${order.id}`}>Order details <ArrowRight size={13} /></Link></section>

    <div className="preview-metrics-grid"><PreviewMetric label="Order requirement" value={kg(preview.orderQuantityKg)} note="Buyer order quantity" /><PreviewMetric label="Eligible estimate" value={kg(preview.totalEligibleEstimatedSupplyKg)} note={`${eligibleCandidates.length} eligible crop cycles`} tone="green" /><PreviewMetric label="Proposed allocation" value={kg(adjusted?.allocatedQuantityKg ?? preview.proposedAllocationKg)} note="After manager adjustments" tone="blue" /><PreviewMetric label="Uncovered demand" value={kg(adjusted?.uncoveredDemandKg ?? preview.uncoveredDemandKg)} note="Requirement less proposal" tone="amber" /></div>

    <div className="allocation-explainer"><span><Info size={16} /></span><p><strong>Deterministic proposal:</strong> eligible cycles are sorted by earliest expected harvest start, then farmer ID, then crop cycle ID. Each estimate is used once, existing reservations are deducted, and total allocation is capped at order demand.</p></div>
    {preview.warnings.length > 0 && <section className="allocation-warnings"><h3><AlertTriangle size={15} /> Warnings and assumptions to review</h3><ul>{preview.warnings.map((warning, index) => <li key={`${warning.code}-${warning.candidateId ?? 'plan'}-${index}`}><span className={`warning-severity warning-${warning.severity}`} />{warning.message}</li>)}</ul></section>}

    <section className="allocation-table-panel"><div className="allocation-table-heading"><div><h3>Candidate farmers &amp; crop cycles</h3><p>{eligibleCandidates.length} eligible · {excludedCandidates.length} excluded · Crop compatibility does not establish buyer quality.</p></div><button type="button" className="recalculate-button" onClick={() => { setAdjustments({}); setError('') }}><RefreshCw size={13} /> Reset to engine proposal</button></div>
      {preview.candidates.length ? <div className="allocation-table-scroll"><table className="allocation-table"><thead><tr><th>FARMER / PLOT / CYCLE</th><th>CROP / VARIETY</th><th>EXPECTED HARVEST</th><th>ESTIMATE</th><th>RESERVED</th><th>REMAINING ESTIMATE</th><th>CONSENT / ELIGIBILITY</th><th>PROPOSED KG</th></tr></thead><tbody>{preview.candidates.map((candidate) => {
        const farmer = farmers.farmers.find((item) => item.id === candidate.farmerId)
        const plot = farmers.plots.find((item) => item.id === candidate.plotId)
        const edit = allocation(candidate)
        const changed = edit.quantityKg !== candidate.proposedAllocationKg
        return <tr key={candidate.candidateId} className={candidate.eligible ? '' : 'candidate-excluded-row'}><td><div className="candidate-identity"><strong>{farmer?.name ?? 'Farmer unavailable'}</strong><small>{candidate.farmerId ?? 'No farmer ID'}</small><small>{plot?.name ?? 'Plot unavailable'} · {candidate.plotId}</small><small>{candidate.cropCycleId} · {candidate.cycleStatus}</small></div></td><td><strong>{candidate.crop}</strong><small>{candidate.variety}</small></td><td>{displayDate(candidate.harvestStartDate)}<small>to {displayDate(candidate.harvestEndDate)}</small></td><td>{kg(candidate.estimatedProductionKg)}</td><td>{kg(candidate.previouslyReservedKg)}</td><td><strong>{kg(candidate.remainingEstimateKg)}</strong></td><td><span className={`candidate-result ${candidate.eligible ? 'candidate-eligible' : 'candidate-ineligible'}`}><i />{candidate.eligible ? 'Eligible' : 'Excluded'}</span><small className="candidate-consent">Consent: {candidate.consentStatus.replace('-', ' ')}</small>{candidate.exclusionReasons.map((reason) => <small className="candidate-reason" key={reason.code}>{reason.message}</small>)}{candidate.warnings.map((warning) => <small className="candidate-warning" key={warning.code}>{warning.message}</small>)}</td><td><label className="allocation-editor"><span><input type="checkbox" checked={edit.included} disabled={!candidate.eligible} onChange={(event) => changeCandidate(candidate, { included: event.target.checked, quantityKg: event.target.checked && edit.quantityKg === 0 ? candidate.proposedAllocationKg : event.target.checked ? edit.quantityKg : 0 })} /> Include</span><input type="number" min="0" max={candidate.remainingEstimateKg} step="0.1" disabled={!candidate.eligible || !edit.included} value={edit.quantityKg} onChange={(event) => changeCandidate(candidate, { quantityKg: event.target.value === '' ? 0 : Number(event.target.value), included: true })} aria-label={`Proposed allocation for ${candidate.candidateId}`} />{changed && <input className="override-reason-input" value={edit.reason} onChange={(event) => changeCandidate(candidate, { reason: event.target.value })} placeholder="Reason required for adjustment" aria-label={`Reason for adjustment to ${candidate.candidateId}`} />}</label></td></tr>
      })}</tbody></table></div> : <div className="allocation-empty"><Sprout size={18} /><p>No crop cycles are recorded to evaluate. Add farmer, plot and crop-cycle information before planning this order.</p></div>}
      {adjustedResult.error && <div className="allocation-validation-error" role="alert">{adjustedResult.error}</div>}
      <div className="allocation-table-footer"><span>Allocations above zero create planning reservations only after plan confirmation.</span><strong>{kg(adjusted?.allocatedQuantityKg ?? preview.proposedAllocationKg)} allocated · {kg(adjusted?.uncoveredDemandKg ?? preview.uncoveredDemandKg)} uncovered</strong></div>
    </section>

    <div className="preview-bottom-grid"><section className="preview-assumptions"><h3><CircleHelp size={15} /> Planning assumptions</h3><ul>{preview.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section><div className="preview-safety-note"><ShieldCheck size={17} /><p>This proposal uses synthetic and farmer-reported estimates. It does not verify crop quality, create harvested stock, or guarantee fulfilment.</p></div></div>
    <div className="supply-create-footer"><Link to="/supply-planning" className="secondary-button">Cancel</Link><div><button className="secondary-button" type="button" disabled={saving} onClick={() => save('Draft')}><Save size={14} /> Save Draft</button><button className="secondary-button" type="button" disabled={saving} onClick={() => save('Previewed')}>Save Preview</button><button className="primary-button" type="button" disabled={saving || !adjusted || adjusted.allocatedQuantityKg <= 0} onClick={confirm}><Check size={14} /> Confirm Plan</button></div></div>
  </div>
}

function PreviewMetric({ label, value, note, tone = '' }: { label: string; value: string; note: string; tone?: string }) { return <article className="preview-metric"><small>{label}</small><strong className={tone}>{value}</strong><span>{note}</span></article> }
