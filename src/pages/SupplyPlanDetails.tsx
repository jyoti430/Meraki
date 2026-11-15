import { useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Check, CircleCheck, Clock3, History, RotateCw, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { useSupplyPlanning } from '../context/SupplyPlanningContext'
import { displaySupplyPlanStatus, getAllocationTotals, isSupplyPlanOutdated } from '../services/SupplyPlanningService'
import type { SupplyPlanStatus } from '../types'

const classes: Record<SupplyPlanStatus, string> = { Draft: 'plan-status-draft', Previewed: 'plan-status-previewed', Confirmed: 'plan-status-confirmed', 'Needs Review': 'plan-status-review', Cancelled: 'plan-status-cancelled' }
const kg = (value: number) => `${Number(value || 0).toLocaleString()} kg`
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const date = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) : 'Not scheduled'

export default function SupplyPlanDetails() {
  const { planId = '' } = useParams()
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const { data: planning, confirmPlan, cancelPlan } = useSupplyPlanning()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const plan = planning.plans.find((item) => item.id === planId)
  const order = orders.find((item) => item.id === plan?.orderId)
  if (!plan) return <div className="supply-not-found"><h2>Supply plan not found</h2><p>This plan is not available in the current browser data.</p><Link className="secondary-button" to="/supply-planning"><ArrowLeft size={14} /> Back to plans</Link></div>
  const currentPlan = plan

  const freshness = isSupplyPlanOutdated(plan, order, farmers, planning)
  const status = displaySupplyPlanStatus(plan, order, farmers, planning)
  const allocations = getAllocationTotals(plan.allocations)
  const reservations = planning.reservations.filter((reservation) => reservation.planId === plan.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const isOpen = plan.status === 'Draft' || plan.status === 'Previewed'

  function confirm() {
    if (!window.confirm(`Confirm ${currentPlan.id} and create ${currentPlan.allocations.filter((item) => item.included).length} planning reservation(s)? The quantity remains an estimate, not harvested stock.`)) return
    setBusy(true)
    try { confirmPlan(currentPlan.id); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be confirmed.') }
    finally { setBusy(false) }
  }

  function cancel() {
    if (!window.confirm(`Cancel ${currentPlan.id}? Active reservations will be released and retained in its history.`)) return
    const reason = window.prompt('Enter a reason for cancelling this plan:')
    if (!reason?.trim()) return
    setBusy(true)
    try { cancelPlan(currentPlan.id, reason); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be cancelled.') }
    finally { setBusy(false) }
  }

  return <div className="supply-page supply-plan-detail-page">
    <div className="supply-page-top"><div><Link className="supply-back-link" to="/supply-planning"><ArrowLeft size={14} /> Supply plans</Link><div className="supply-detail-title"><h2>{plan.id}</h2><span className={`plan-status-pill ${classes[status]}`}><i />{status}</span></div><p>Buyer order {plan.orderId}{order ? ` · ${order.buyer.name} · ${order.product.crop} / ${order.product.variety}` : ' · Order record unavailable'}</p></div><div className="supply-top-actions"><span className="supply-demo-label">Plan status: {status}</span>{order && <Link className="secondary-button" to={`/supply-planning/new?orderId=${order.id}&programmeId=${encodeURIComponent(plan.programmeId)}`}><RotateCw size={14} /> Create replacement plan</Link>}</div></div>
    {error && <div className="supply-form-error" role="alert">{error}</div>}
    {freshness && plan.status !== 'Cancelled' && <div className="stale-plan-alert"><AlertTriangle size={16} /><div><strong>Source data has changed since this plan was generated.</strong><span>The saved allocation is unchanged. Review the farmer, consent, crop-cycle or reservation changes by generating a replacement plan before confirming or relying on this plan.</span></div></div>}
    {order && <div className="plan-order-context"><div><small>BUYER ORDER STATUS</small><strong>{order.status}</strong><span>{order.product.orderType} · {kg(Number(order.product.requiredQuantityKg))}</span></div><div><small>DELIVERY WINDOW</small><strong>{date(order.product.deliveryStartDate)} – {date(order.product.deliveryEndDate)}</strong><span>{order.product.crop} · {order.product.variety}</span></div><div><small>PLAN STATUS</small><strong>{plan.status}</strong><span>{plan.status === 'Confirmed' ? 'Reservations are planning estimates.' : 'No reservation until confirmation.'}</span></div><div><small>SUPPLY PROGRAMME</small><strong>{plan.programmeId}</strong><span>General consent plus programme scope</span></div><div><small>UNCOVERED IN THIS PLAN</small><strong>{kg(Math.max(0, plan.orderQuantityKg - allocations))}</strong><span>Order requirement less this plan’s allocation</span></div></div>}

    {!order && <div className="stale-plan-alert"><AlertTriangle size={16} /><div><strong>Buyer order record is unavailable.</strong><span>The plan snapshot remains available for review. It cannot be confirmed against a missing order.</span></div></div>}
    <div className="plan-detail-layout"><main className="plan-detail-main">
      <section className="allocation-table-panel plan-detail-allocations"><div className="allocation-table-heading"><div><h3>Plan allocation</h3><p>Original engine proposal and manager-adjusted quantities are both retained.</p></div><span className="plan-detail-total">{kg(allocations)} proposed</span></div><div className="allocation-table-scroll"><table className="allocation-table"><thead><tr><th>FARMER / CROP CYCLE</th><th>ELIGIBILITY</th><th>ESTIMATE AT PREVIEW</th><th>RESERVED BEFORE PREVIEW</th><th>ENGINE PROPOSAL</th><th>PLAN ALLOCATION</th><th>OVERRIDE REASON</th></tr></thead><tbody>{plan.candidates.map((candidate) => {
        const allocation = plan.allocations.find((item) => item.candidateId === candidate.candidateId)
        const farmer = farmers.farmers.find((item) => item.id === candidate.farmerId)
        return <tr key={candidate.candidateId}><td><strong>{farmer?.name ?? 'Farmer unavailable'}</strong><small>{candidate.farmerId ?? 'No farmer ID'}</small><small>{candidate.cycleStatus} · {candidate.crop} / {candidate.variety}</small><small>{date(candidate.harvestStartDate)} – {date(candidate.harvestEndDate)}</small><Link className="candidate-detail-link" to={candidate.farmerId ? `/farmers-plots/${candidate.farmerId}` : '/farmers-plots'}>Farmer details <ArrowRight size={11} /></Link></td><td><span className={`candidate-result ${candidate.eligible ? 'candidate-eligible' : 'candidate-ineligible'}`}><i />{candidate.eligible ? 'Eligible' : 'Excluded'}</span>{candidate.exclusionReasons.map((reason) => <small className="candidate-reason" key={reason.code}>{reason.message}</small>)}</td><td>{kg(candidate.estimatedProductionKg)}</td><td>{kg(candidate.previouslyReservedKg)}</td><td>{kg(allocation?.proposedQuantityKg ?? 0)}</td><td><strong>{allocation?.included ? kg(allocation.adjustedQuantityKg) : 'Excluded'}</strong></td><td>{allocation?.overrideReason || '—'}</td></tr>
      })}</tbody></table></div>{!plan.candidates.length && <div className="allocation-empty">No crop cycles were available at preview time.</div>}</section>

      {plan.overrides.length > 0 && <section className="plan-audit-card"><header><History size={15} /><div><h3>Manual adjustment history</h3><p>Engine proposals were preserved separately from manager changes.</p></div></header><div>{plan.overrides.map((override) => { const candidate = plan.candidates.find((item) => item.candidateId === override.candidateId); const farmer = farmers.farmers.find((item) => item.id === candidate?.farmerId); return <article key={`${override.candidateId}-${override.changedAt}`}><strong>{farmer?.name ?? candidate?.farmerId ?? override.candidateId}</strong><span>{kg(override.originalQuantityKg)} → {kg(override.adjustedQuantityKg)}</span><p>{override.reason}</p><small>{override.changedBy} · {dateTime(override.changedAt)}</small></article> })}</div></section>}

      <section className="plan-audit-card"><header><ShieldCheck size={15} /><div><h3>Warnings and assumptions</h3><p>Decision context saved with this preview.</p></div></header><ul>{plan.warnings.map((warning, index) => <li key={`${warning.code}-${warning.candidateId ?? ''}-${index}`}><i className={`warning-severity warning-${warning.severity}`} />{warning.message}</li>)}{!plan.warnings.length && <li>No warnings were raised at preview time.</li>}</ul><h4>Allocation rules</h4><ul>{plan.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section>

      <section className="reservation-card"><header><CircleCheck size={15} /><div><h3>Reservation history</h3><p>Reservations block reuse of the same crop-cycle estimate until released.</p></div></header>{reservations.length ? <div className="reservation-list">{reservations.map((reservation) => <article key={reservation.id}><div><strong>{reservation.id} · {kg(reservation.quantityKg)}</strong><small>{reservation.cropCycleId} · {reservation.status}</small></div><div className="reservation-events">{reservation.history.map((entry, index) => <span key={`${entry.status}-${entry.changedAt}-${index}`}><i />{entry.status} · {entry.changedBy} · {dateTime(entry.changedAt)}{entry.reason ? ` · ${entry.reason}` : ''}</span>)}</div></article>)}</div> : <div className="reservation-empty">No reservation has been created for this plan.</div>}</section>
    </main><aside className="plan-detail-aside"><div className="plan-lifecycle-card"><h3>Plan lifecycle</h3><div><span className="lifecycle-dot" /><section><strong>Created</strong><small>{dateTime(plan.createdAt)} · {plan.createdBy}</small></section></div>{plan.confirmedAt && <div><span className="lifecycle-dot lifecycle-confirmed" /><section><strong>Confirmed</strong><small>{dateTime(plan.confirmedAt)} · {plan.confirmedBy}</small></section></div>}{plan.cancelledAt && <div><span className="lifecycle-dot lifecycle-cancelled" /><section><strong>Cancelled</strong><small>{dateTime(plan.cancelledAt)} · {plan.cancelledBy}</small><p>{plan.cancellationReason}</p></section></div>}<div className="plan-lifecycle-current"><Clock3 size={13} /> Saved status: {plan.status}</div></div>
      {isOpen && <div className="plan-next-actions"><p>{freshness ? 'This preview is outdated. Create a replacement plan after reviewing current source data.' : 'Review all candidate exclusions and warnings before confirmation.'}</p><button type="button" className="primary-button" disabled={busy || freshness || allocations <= 0} onClick={confirm}><Check size={14} /> Confirm &amp; reserve estimates</button><button type="button" className="cancel-plan-button" disabled={busy} onClick={cancel}><Ban size={14} /> Cancel plan</button></div>}
      {plan.status === 'Confirmed' && <div className="plan-confirmed-note"><ShieldCheck size={15} /><p>Confirmation records planning reservations. It does not prove the crop was harvested, inspected or released.</p></div>}
      {plan.status !== 'Cancelled' && plan.status !== 'Confirmed' && !isOpen && <div className="plan-next-actions"><button type="button" className="cancel-plan-button" disabled={busy} onClick={cancel}><Ban size={14} /> Cancel plan</button></div>}
      {plan.status === 'Cancelled' && <div className="plan-confirmed-note"><History size={15} /><p>This plan is cancelled. Released reservation history is retained.</p></div>}
    </aside></div>
    <div className="supply-detail-footer"><Link className="secondary-button" to="/supply-planning"><ArrowLeft size={14} /> Back to plans</Link>{order && <Link className="secondary-button" to={`/supply-planning/new?orderId=${order.id}&programmeId=${encodeURIComponent(plan.programmeId)}`}><RotateCw size={14} /> Create new plan</Link>}</div>
  </div>
}
