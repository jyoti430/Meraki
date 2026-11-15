import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Info, Plus, Sprout, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { crops, findCrop } from '../data/crops'
import { PLANNING_DATE } from '../planning/engine'
import { addDays, daysBetween, fmtDate } from '../planning/format'
import type { BuyerDetails, BuyerOrder, CommercialDetails, OrderSpecification, ProductDetails, QualityCriterion } from '../types'

type OrderDraft = { buyer: BuyerDetails; product: ProductDetails; specification: OrderSpecification; commercial: CommercialDetails }
type FormErrors = Record<string, string>

const emptyDraft = (): OrderDraft => ({
  buyer: { name: '', contactPerson: '', email: '', phone: '', destinationCountry: 'India', destinationCityPort: '' },
  product: { crop: '', variety: '', requiredQuantityKg: '', orderType: 'Confirmed', deliveryStartDate: '', deliveryEndDate: '', preferredGrade: '' },
  specification: { criteria: [], safetyRequirements: { laboratoryReportRequired: false, residueTestingRequired: false, phytosanitaryDocumentationRequired: false, otherDocumentation: '' } },
  commercial: { packagingType: '', packagingInstructions: '', agreedPricePerKg: '', currency: 'INR', paymentTerms: '', additionalInstructions: '' },
})

const orderToDraft = (order: BuyerOrder): OrderDraft => ({ buyer: { ...order.buyer }, product: { ...order.product }, specification: JSON.parse(JSON.stringify(order.specification)) as OrderSpecification, commercial: { ...order.commercial } })

function Field({ label, error, hint, children, span }: { label: string; error?: string; hint?: string; children: ReactNode; span?: boolean }) {
  return <label className={`m-field ${span ? 'span-2' : ''}`}>{label}{children}{hint && !error && <small>{hint}</small>}{error && <small className="m-err">{error}</small>}</label>
}

function PlantingPreview({ product }: { product: ProductDetails }) {
  const crop = findCrop(product.crop)
  const qty = Number(product.requiredQuantityKg)
  if (!crop || !product.deliveryStartDate) return <div className="m-alert m-alert-info"><Sprout size={18} style={{ flex: 'none' }} /><span>Choose a crop and delivery start date to see when farmers would need to sow.</span></div>
  if (crop.perennial) return <div className="m-alert m-alert-info"><Sprout size={18} style={{ flex: 'none' }} /><span>{crop.name} is an orchard crop: supply comes from existing trees, so Meraki checks current crop cycles rather than new planting.</span></div>
  const sowBy = addDays(product.deliveryStartDate, -crop.daysToFirstHarvest)
  const left = daysBetween(PLANNING_DATE, sowBy)
  const acres = qty > 0 ? [qty / crop.yieldPerAcre[2], qty / crop.yieldPerAcre[0]] : null
  return <div className={`m-alert ${left < 0 ? 'm-alert-warn' : 'm-alert-good'}`}><Sprout size={18} style={{ flex: 'none', marginTop: 2 }} /><span>
    {left < 0 ? <>Too late for new planting: {crop.name.toLowerCase()} needs about {crop.daysToFirstHarvest} days, so sowing had to happen by <strong>{fmtDate(sowBy)}</strong>. Consider a later delivery window.</>
      : <>Farmers must sow by <strong>{fmtDate(sowBy)}</strong> ({left} days from now). {acres && <>This needs roughly <strong>{acres[0].toFixed(1)}–{acres[1].toFixed(1)} acres</strong> at indicative yields.</>}</>}
  </span></div>
}

export default function BuyerOrderForm() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders, createOrder, updateOrder, updateStatus } = useBuyerOrders()
  const existing = orders.find((order) => order.id === orderId)
  const [draft, setDraft] = useState<OrderDraft>(() => existing ? orderToDraft(existing) : emptyDraft())
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState('')
  const isEditing = Boolean(orderId)
  const editable = !existing || existing.status === 'Draft' || existing.status === 'Active'
  const hasDetails = Boolean(existing && (existing.buyer.contactPerson || existing.specification.criteria.length || existing.commercial.packagingType))

  const patchBuyer = (key: keyof BuyerDetails, value: string) => setDraft((c) => ({ ...c, buyer: { ...c.buyer, [key]: value } }))
  const patchProduct = (key: keyof ProductDetails, value: string | number) => setDraft((c) => ({ ...c, product: { ...c.product, [key]: value } }))
  const patchCommercial = (key: keyof CommercialDetails, value: string | number) => setDraft((c) => ({ ...c, commercial: { ...c.commercial, [key]: value } }))
  const patchSafety = (key: keyof OrderSpecification['safetyRequirements'], value: string | boolean) => setDraft((c) => ({ ...c, specification: { ...c.specification, safetyRequirements: { ...c.specification.safetyRequirements, [key]: value } } }))
  const addCriterion = () => setDraft((c) => ({ ...c, specification: { ...c.specification, criteria: [...c.specification.criteria, { id: `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' }] } }))
  const patchCriterion = (id: string, key: keyof QualityCriterion, value: string | boolean) => setDraft((c) => ({ ...c, specification: { ...c.specification, criteria: c.specification.criteria.map((x) => x.id === id ? { ...x, [key]: value } : x) } }))
  const removeCriterion = (id: string) => setDraft((c) => ({ ...c, specification: { ...c.specification, criteria: c.specification.criteria.filter((x) => x.id !== id) } }))

  function validate(status: 'Draft' | 'Active') {
    const next: FormErrors = {}
    if (draft.buyer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.buyer.email)) next.email = 'Enter a valid email address.'
    if (draft.product.requiredQuantityKg !== '' && Number(draft.product.requiredQuantityKg) < 0) next.quantity = 'Quantity must be zero or more.'
    if (draft.commercial.agreedPricePerKg !== '' && Number(draft.commercial.agreedPricePerKg) < 0) next.price = 'Price must be zero or more.'
    if (draft.product.deliveryStartDate && draft.product.deliveryEndDate && draft.product.deliveryEndDate < draft.product.deliveryStartDate) next.delivery = 'End date must be on or after the start date.'
    draft.specification.criteria.forEach((criterion, index) => {
      if (!criterion.attribute.trim()) next[`criterion-${criterion.id}`] = `Specification ${index + 1}: enter an attribute name.`
      else if (!criterion.unit.trim()) next[`criterion-${criterion.id}`] = `Specification ${index + 1}: enter a measurement unit.`
      else if (criterion.minimum !== '' && criterion.maximum !== '' && Number(criterion.minimum) > Number(criterion.maximum)) next[`criterion-${criterion.id}`] = `Specification ${index + 1}: minimum cannot exceed maximum.`
    })
    if (status === 'Active') {
      // Only the information needed for a production decision is required to plan.
      if (!draft.buyer.name.trim()) next.buyerName = 'Add the buyer’s name.'
      if (!draft.buyer.destinationCountry.trim()) next.destinationCountry = 'Choose the market.'
      if (!draft.product.crop.trim()) next.crop = 'Choose a crop.'
      if (draft.product.requiredQuantityKg === '' || Number(draft.product.requiredQuantityKg) <= 0) next.quantity = 'Enter a quantity greater than zero.'
      if (!draft.product.deliveryStartDate || !draft.product.deliveryEndDate) next.delivery = 'Add both dates so Meraki can work out sowing dates.'
      if (draft.product.orderType === 'Confirmed' && (draft.commercial.agreedPricePerKg === '' || Number(draft.commercial.agreedPricePerKg) <= 0)) next.price = 'Confirmed orders need an agreed price.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit(status: 'Draft' | 'Active') {
    setFormError('')
    if (!validate(status)) {
      setFormError(status === 'Active' ? 'A few details are needed before this demand can be used for planning.' : 'Fix the highlighted format errors before saving.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const input: OrderDraft = { ...draft, product: { ...draft.product, requiredQuantityKg: draft.product.requiredQuantityKg === '' ? '' : Number(draft.product.requiredQuantityKg) }, commercial: { ...draft.commercial, agreedPricePerKg: draft.commercial.agreedPricePerKg === '' ? '' : Number(draft.commercial.agreedPricePerKg) } }
    if (existing) {
      updateOrder(existing.id, input)
      if (status === 'Active' && existing.status === 'Draft') updateStatus(existing.id, 'Active')
      navigate(`/buyer-orders/${existing.id}`)
    } else {
      const order = createOrder(input, status)
      navigate(`/buyer-orders/${order.id}`)
    }
  }

  if (isEditing && !existing) return <div className="m-page"><h1 className="m-h1">Order not found</h1><p className="m-lead">This order may have been removed from local demo data.</p><Link className="m-btn m-btn-secondary" style={{ alignSelf: 'flex-start' }} to="/demand"><ArrowLeft size={16} /> Back to demand</Link></div>
  if (existing && !editable) return <div className="m-page"><h1 className="m-h1">This order can’t be edited</h1><p className="m-lead">{existing.id} is {existing.status.toLowerCase()}. Completed and cancelled orders are read-only.</p><Link className="m-btn m-btn-secondary" style={{ alignSelf: 'flex-start' }} to={`/buyer-orders/${existing.id}`}><ArrowLeft size={16} /> Back to details</Link></div>

  const knownCrop = !draft.product.crop || Boolean(findCrop(draft.product.crop))
  return <div className="m-page" style={{ maxWidth: 880 }}>
    <header>
      <Link className="m-link" to={existing ? `/buyer-orders/${existing.id}` : '/demand'}><ArrowLeft size={16} /> {existing ? 'Back to order' : 'Buyer demand'}</Link>
      <h1 className="m-h1">{isEditing ? `Edit ${existing?.id}` : 'Add buyer demand'}</h1>
      <p className="m-lead">Start with what matters for planting: crop, quantity and when it’s needed. Buyer specifications can be added now or later.</p>
    </header>
    {formError && <div className="m-alert m-alert-bad" role="alert">{formError}</div>}
    <form className="m-stack" onSubmit={(e) => e.preventDefault()} noValidate>
      <section className="m-card m-stack">
        <h2 className="m-h3">Is this order confirmed?</h2>
        <div className="m-choice" role="radiogroup">
          <label><input type="radio" name="orderType" checked={draft.product.orderType === 'Confirmed'} onChange={() => patchProduct('orderType', 'Confirmed')} /><div><strong>Confirmed</strong><span>The buyer has committed to quantity, window and price. Always planned.</span></div></label>
          <label><input type="radio" name="orderType" checked={draft.product.orderType === 'Indicative'} onChange={() => patchProduct('orderType', 'Indicative')} /><div><strong>Indicative</strong><span>Interest only. Planned only in scenarios that include it.</span></div></label>
        </div>
        <div className="m-form-grid">
          <Field label="Crop" error={errors.crop} hint={!knownCrop ? 'Meraki has no growing reference for this crop yet, so it can’t be planned automatically.' : undefined}>
            <input className="m-input" list="crop-options" value={draft.product.crop} onChange={(e) => { const v = e.target.value; patchProduct('crop', v); const c = findCrop(v); if (c && !draft.product.variety) patchProduct('variety', c.defaultVariety) }} placeholder="e.g. Okra" aria-invalid={Boolean(errors.crop)} />
            <datalist id="crop-options">{crops.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label="Variety"><input className="m-input" value={draft.product.variety} onChange={(e) => patchProduct('variety', e.target.value)} placeholder="Buyer-requested variety" /></Field>
          <Field label="Quantity (kg)" error={errors.quantity}><input className="m-input" type="number" min="0" step="10" value={draft.product.requiredQuantityKg} onChange={(e) => patchProduct('requiredQuantityKg', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" aria-invalid={Boolean(errors.quantity)} /></Field>
          <Field label={`Price per kg${draft.product.orderType === 'Indicative' ? ' (optional)' : ''}`} error={errors.price} hint="Price agreed or expected with the buyer">
            <div className="m-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <select className="m-select" style={{ width: 96 }} value={draft.commercial.currency} onChange={(e) => patchCommercial('currency', e.target.value)} aria-label="Currency"><option>INR</option><option>SGD</option><option>USD</option></select>
              <input className="m-input" type="number" min="0" step="0.5" value={draft.commercial.agreedPricePerKg} onChange={(e) => patchCommercial('agreedPricePerKg', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" aria-invalid={Boolean(errors.price)} />
            </div>
          </Field>
          <Field label="Delivery from" error={errors.delivery}><input className="m-input" type="date" value={draft.product.deliveryStartDate} onChange={(e) => patchProduct('deliveryStartDate', e.target.value)} aria-invalid={Boolean(errors.delivery)} /></Field>
          <Field label="Delivery until"><input className="m-input" type="date" value={draft.product.deliveryEndDate} onChange={(e) => patchProduct('deliveryEndDate', e.target.value)} aria-invalid={Boolean(errors.delivery)} /></Field>
          <div className="span-2"><PlantingPreview product={draft.product} /></div>
          <Field label="Buyer" error={errors.buyerName}><input className="m-input" value={draft.buyer.name} onChange={(e) => patchBuyer('name', e.target.value)} placeholder="Buyer organisation" aria-invalid={Boolean(errors.buyerName)} /></Field>
          <Field label="Market" error={errors.destinationCountry}>
            <select className="m-select" value={['India', 'Singapore'].includes(draft.buyer.destinationCountry) ? draft.buyer.destinationCountry : 'Other'} onChange={(e) => patchBuyer('destinationCountry', e.target.value === 'Other' ? '' : e.target.value)}><option value="India">India (domestic)</option><option value="Singapore">Singapore (export)</option><option value="Other">Other</option></select>
          </Field>
          {!['India', 'Singapore'].includes(draft.buyer.destinationCountry) && <Field label="Destination country" error={errors.destinationCountry}><input className="m-input" value={draft.buyer.destinationCountry} onChange={(e) => patchBuyer('destinationCountry', e.target.value)} placeholder="Country" /></Field>}
        </div>
      </section>

      <details className="m-card m-details" open={hasDetails} style={{ borderTop: '1px solid var(--line)' }}>
        <summary style={{ paddingTop: 0 }}><ChevronRight className="m-chev" size={16} />Buyer specifications, contacts and packaging (optional)</summary>
        <div className="m-stack" style={{ paddingTop: 12, gap: 22 }}>
          <div className="m-form-grid">
            <Field label="Contact person"><input className="m-input" value={draft.buyer.contactPerson} onChange={(e) => patchBuyer('contactPerson', e.target.value)} /></Field>
            <Field label="City / port"><input className="m-input" value={draft.buyer.destinationCityPort} onChange={(e) => patchBuyer('destinationCityPort', e.target.value)} /></Field>
            <Field label="Email" error={errors.email}><input className="m-input" type="email" value={draft.buyer.email} onChange={(e) => patchBuyer('email', e.target.value)} placeholder="name@company.com" /></Field>
            <Field label="Phone"><input className="m-input" type="tel" value={draft.buyer.phone} onChange={(e) => patchBuyer('phone', e.target.value)} /></Field>
            <Field label="Grade"><input className="m-input" value={draft.product.preferredGrade} onChange={(e) => patchProduct('preferredGrade', e.target.value)} placeholder="Buyer-defined grade" /></Field>
            <Field label="Payment terms"><input className="m-input" value={draft.commercial.paymentTerms} onChange={(e) => patchCommercial('paymentTerms', e.target.value)} /></Field>
            <Field label="Packaging"><input className="m-input" value={draft.commercial.packagingType} onChange={(e) => patchCommercial('packagingType', e.target.value)} placeholder="e.g. 5 kg ventilated carton" /></Field>
            <Field label="Packaging instructions"><input className="m-input" value={draft.commercial.packagingInstructions} onChange={(e) => patchCommercial('packagingInstructions', e.target.value)} /></Field>
            <Field label="Other instructions" span><textarea className="m-textarea" rows={2} value={draft.commercial.additionalInstructions} onChange={(e) => patchCommercial('additionalInstructions', e.target.value)} /></Field>
          </div>
          <div className="m-stack" style={{ gap: 12 }}>
            <div><h3 className="m-h3" style={{ fontSize: 15.5 }}>Quality criteria</h3><p className="m-sub">Buyer-defined limits for this order only. No universal thresholds are assumed.</p></div>
            {draft.specification.criteria.map((c, i) => <div key={c.id} className="m-card m-card-sage m-card-tight">
              <div className="m-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><strong>Criterion {i + 1}</strong><button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => removeCriterion(c.id)}><Trash2 size={14} /> Remove</button></div>
              <div className="m-form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                <Field label="Attribute"><input className="m-input" value={c.attribute} onChange={(e) => patchCriterion(c.id, 'attribute', e.target.value)} placeholder="e.g. Pod length" /></Field>
                <Field label="Unit"><input className="m-input" value={c.unit} onChange={(e) => patchCriterion(c.id, 'unit', e.target.value)} placeholder="cm, g, %" /></Field>
                <Field label="Min"><input className="m-input" value={c.minimum} onChange={(e) => patchCriterion(c.id, 'minimum', e.target.value)} /></Field>
                <Field label="Max"><input className="m-input" value={c.maximum} onChange={(e) => patchCriterion(c.id, 'maximum', e.target.value)} /></Field>
              </div>
              <div className="m-row" style={{ marginTop: 10 }}><label className="m-row" style={{ gap: 6, fontSize: 14 }}><input type="checkbox" checked={c.required} onChange={(e) => patchCriterion(c.id, 'required', e.target.checked)} /> Required</label><input className="m-input" style={{ flex: 1, minHeight: 38 }} value={c.notes} onChange={(e) => patchCriterion(c.id, 'notes', e.target.value)} placeholder="Notes" aria-label="Criterion notes" /></div>
              {errors[`criterion-${c.id}`] && <p className="m-small" style={{ color: 'var(--bad)', margin: '8px 0 0' }}>{errors[`criterion-${c.id}`]}</p>}
            </div>)}
            <div><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={addCriterion}><Plus size={15} /> Add criterion</button></div>
          </div>
          <div className="m-stack" style={{ gap: 8 }}>
            <h3 className="m-h3" style={{ fontSize: 15.5 }}>Documents requested</h3>
            {([['laboratoryReportRequired', 'Laboratory report'], ['residueTestingRequired', 'Residue testing'], ['phytosanitaryDocumentationRequired', 'Phytosanitary certificate']] as const).map(([key, label]) => <label key={key} className="m-row" style={{ gap: 8, fontSize: 14.5 }}><input type="checkbox" checked={draft.specification.safetyRequirements[key]} onChange={(e) => patchSafety(key, e.target.checked)} /> {label}</label>)}
            <input className="m-input" value={draft.specification.safetyRequirements.otherDocumentation} onChange={(e) => patchSafety('otherDocumentation', e.target.value)} placeholder="Other documents" aria-label="Other documents" />
            <p className="m-small" style={{ margin: 0 }}><Info size={13} style={{ verticalAlign: '-2px' }} /> Recording buyer requirements does not establish regulatory compliance.</p>
          </div>
        </div>
      </details>

      <div className="m-row" style={{ justifyContent: 'space-between' }}>
        <Link className="m-btn m-btn-ghost" to={existing ? `/buyer-orders/${existing.id}` : '/demand'}>Discard</Link>
        <div className="m-row">
          {(!existing || existing.status === 'Draft') && <button type="button" className="m-btn m-btn-secondary" onClick={() => submit('Draft')}>Save as draft</button>}
          <button type="button" className="m-btn m-btn-primary" onClick={() => submit('Active')}>{existing?.status === 'Active' ? 'Save changes' : 'Save & use in plan'}</button>
        </div>
      </div>
      <p className="m-small" style={{ margin: 0 }}>Records are stored in this browser as synthetic demo data. Drafts are not used for planning.</p>
    </form>
  </div>
}
