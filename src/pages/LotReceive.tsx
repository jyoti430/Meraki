import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react'
import { useSupplyPlanning } from '../context/SupplyPlanningContext'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { useFarmers } from '../context/FarmersContext'
import { useLots } from '../context/LotsContext'

const localDateTime = () => { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
export default function LotReceive() {
  const navigate = useNavigate()
  const supply = useSupplyPlanning()
  const { orders } = useBuyerOrders()
  const { data: farmers } = useFarmers()
  const { data: lots, receive } = useLots()
  const plans = supply.data.plans.filter((plan) => plan.status === 'Confirmed')
  const [planId, setPlanId] = useState('')
  const [allocationIndex, setAllocationIndex] = useState('')
  const [harvestDate, setHarvestDate] = useState('')
  const [arrivalAt, setArrivalAt] = useState(localDateTime())
  const [gross, setGross] = useState('')
  const [tare, setTare] = useState('')
  const [operator, setOperator] = useState('')
  const [observations, setObservations] = useState('')
  const [error, setError] = useState('')
  const submitted = useRef(false)
  const receiptToken = useRef(`RECEIPT-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [submitting, setSubmitting] = useState(false)
  const selectedPlan = plans.find((plan) => plan.id === planId)
  const choices = useMemo(() => selectedPlan?.allocations.map((allocation, index) => ({ allocation, index })).filter(({ allocation }) => {
    const received = lots.lots.filter((lot) => lot.supplyPlanId === selectedPlan?.id && lot.farmerId === allocation.farmerId && lot.cropCycleId === allocation.cropCycleId).reduce((sum, lot) => sum + lot.weights.netReceivedWeightKg, 0)
    return allocation.included && allocation.adjustedQuantityKg > received
  }) ?? [], [selectedPlan, lots.lots])
  const selectedChoice = choices.find((choice) => String(choice.index) === allocationIndex)
  const allocation = selectedChoice?.allocation
  const farmer = allocation ? farmers.farmers.find((item) => item.id === allocation.farmerId) : undefined
  const plot = allocation ? farmers.plots.find((item) => item.id === allocation.plotId) : undefined
  const cycle = allocation ? farmers.cropCycles.find((item) => item.id === allocation.cropCycleId) : undefined
  const order = selectedPlan ? orders.find((item) => item.id === selectedPlan.orderId) : undefined
  const net = Number(gross || 0) - Number(tare || 0)
  const remaining = allocation ? allocation.adjustedQuantityKg - lots.lots.filter((lot) => lot.supplyPlanId === selectedPlan?.id && lot.farmerId === allocation.farmerId && lot.cropCycleId === allocation.cropCycleId).reduce((sum, lot) => sum + lot.weights.netReceivedWeightKg, 0) : 0
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (submitted.current) return
    submitted.current = true; setSubmitting(true)
    try {
      if (!selectedPlan || !order || !farmer || !plot || !cycle || !selectedChoice) throw new Error('Choose an available allocation from a confirmed supply plan.')
      const lot = receive({ receiptToken: receiptToken.current, plan: selectedPlan, order, allocationIndex: selectedChoice.index, farmer, plot, cycle, harvestDate, arrivalAt, grossWeightKg: Number(gross), tareWeightKg: Number(tare), operator, observations })
      navigate(`/lots-inspection/${lot.id}`)
    } catch (err) { submitted.current = false; setSubmitting(false); setError(err instanceof Error ? err.message : 'Could not record the receipt.') }
  }
  return <div className="page-shell lot-workflow-page"><Link className="lot-back-link" to="/lots-inspection"><ArrowLeft size={15} /> Back to Lots &amp; Inspection</Link><div className="page-heading-row"><div><div className="eyebrow">COLLECTION CENTRE · INTAKE</div><h1>Receive Produce</h1><p>Create a physical receipt linked to one confirmed plan allocation.</p></div></div>
    {!plans.length ? <section className="lot-empty lot-no-plan"><div><ShieldCheck size={22} /></div><h3>No confirmed supply plans available</h3><p>Confirm a supply plan first. Estimated production and reservations are not physical stock and cannot be received directly.</p><Link className="secondary-button" to="/supply-planning">Open Supply Planning</Link></section> : <form className="lot-form" onSubmit={submit}>
      <section className="lot-form-section"><div className="lot-section-heading"><span>01</span><div><h2>Planned allocation</h2><p>Trace this delivery to its approved plan and farm records.</p></div></div>
        <div className="lot-form-grid"><label className="lot-field lot-field-wide">Confirmed supply plan<select required value={planId} onChange={(event) => { setPlanId(event.target.value); setAllocationIndex('') }}><option value="">Select a confirmed supply plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.id} · {orders.find((item) => item.id === plan.orderId)?.id ?? plan.orderId} · confirmed {new Date(plan.confirmedAt ?? plan.updatedAt).toLocaleDateString()}</option>)}</select></label>
          {planId && <label className="lot-field lot-field-wide">Farmer allocation<select required value={allocationIndex} onChange={(event) => setAllocationIndex(event.target.value)}><option value="">Select an allocation with quantity remaining</option>{choices.map(({ allocation: item, index }) => <option key={item.candidateId} value={index}>{farmers.farmers.find((person) => person.id === item.farmerId)?.name ?? item.farmerId} · {farmers.cropCycles.find((cropCycle) => cropCycle.id === item.cropCycleId)?.crop} · {item.adjustedQuantityKg.toLocaleString()} kg planned</option>)}</select>{!choices.length && <small>All included allocations on this plan are fully received.</small>}</label>}
        </div>
        {allocation && farmer && plot && cycle && <div className="lot-allocation-panel"><div><small>Farmer</small><strong>{farmer.name}</strong><span>{farmer.id}</span></div><div><small>Plot / crop cycle</small><strong>{plot.name}</strong><span>{plot.id} · {cycle.id}</span></div><div><small>Crop / variety</small><strong>{cycle.crop}</strong><span>{cycle.variety}</span></div><div><small>Buyer order</small><strong>{order?.id}</strong><span>{order?.buyer.name}</span></div><div><small>Remaining plan quantity</small><strong>{remaining.toLocaleString()} kg</strong><span>Planned allocation remainder</span></div></div>}
      </section>
      <section className="lot-form-section"><div className="lot-section-heading"><span>02</span><div><h2>Harvest and arrival</h2><p>Record the delivery measurements as received at the collection centre.</p></div></div><div className="lot-form-grid"><label className="lot-field">Harvest date<input required type="date" value={harvestDate} onChange={(event) => setHarvestDate(event.target.value)} /></label><label className="lot-field">Arrival date and time<input required type="datetime-local" value={arrivalAt} onChange={(event) => setArrivalAt(event.target.value)} /></label><label className="lot-field">Gross weight (kg)<input required min="0" step="0.01" type="number" value={gross} onChange={(event) => setGross(event.target.value)} /></label><label className="lot-field">Tare weight (kg)<input required min="0" step="0.01" type="number" value={tare} onChange={(event) => setTare(event.target.value)} /></label></div>
        <div className="lot-net-calc"><span><Scale size={18} /> Net received weight</span><strong>{net > 0 ? net.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} kg</strong>{net > remaining && remaining > 0 && <em>Excess of {(net - remaining).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg will be flagged for review.</em>}{net > 0 && net < remaining && <em>Shortage of {(remaining - net).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg will be recorded.</em>}</div>
      </section>
      <section className="lot-form-section"><div className="lot-section-heading"><span>03</span><div><h2>Operator record</h2><p>Lot IDs are generated automatically. The receipt becomes an immutable event in lot history.</p></div></div><div className="lot-form-grid"><label className="lot-field">Operator name<input required value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Name of receiving operator" /></label><label className="lot-field lot-field-wide">Initial observations <span className="lot-optional">Optional</span><textarea rows={3} value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Condition on arrival, packaging state, or other observations" /></label></div></section>
      {error && <div className="lot-form-error" role="alert">{error}</div>}<div className="lot-form-actions"><Link className="secondary-button" to="/lots-inspection">Cancel</Link><button className="primary-button" type="submit" disabled={!allocation || net <= 0 || submitting}>{submitting ? 'Recording receipt…' : 'Create lot record'}</button></div>
    </form>}
  </div>
}
