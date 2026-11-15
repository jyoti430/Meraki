import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import type { BuyerDetails, BuyerOrder, CommercialDetails, OrderSpecification, ProductDetails, QualityCriterion } from '../types'

type OrderDraft = { buyer: BuyerDetails; product: ProductDetails; specification: OrderSpecification; commercial: CommercialDetails }
type FormErrors = Record<string, string>

const emptyDraft = (): OrderDraft => ({
  buyer: { name: '', contactPerson: '', email: '', phone: '', destinationCountry: '', destinationCityPort: '' },
  product: { crop: '', variety: '', requiredQuantityKg: '', orderType: 'Confirmed', deliveryStartDate: '', deliveryEndDate: '', preferredGrade: '' },
  specification: { criteria: [], safetyRequirements: { laboratoryReportRequired: false, residueTestingRequired: false, phytosanitaryDocumentationRequired: false, otherDocumentation: '' } },
  commercial: { packagingType: '', packagingInstructions: '', agreedPricePerKg: '', currency: 'INR', paymentTerms: '', additionalInstructions: '' },
})

function orderToDraft(order: BuyerOrder): OrderDraft {
  return { buyer: { ...order.buyer }, product: { ...order.product }, specification: JSON.parse(JSON.stringify(order.specification)) as OrderSpecification, commercial: { ...order.commercial } }
}

function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return <label className="order-field"><span className="field-label">{label}{required && <i>Required</i>}</span>{children}{hint && <small className="field-hint">{hint}</small>}{error && <small className="field-error">{error}</small>}</label>
}

function Section({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="order-form-section"><div className="order-section-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="order-section-content">{children}</div></section>
}

export default function BuyerOrderForm() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { orders, createOrder, updateOrder, updateStatus } = useBuyerOrders()
  const existing = orders.find((order) => order.id === orderId)
  const [draft, setDraft] = useState<OrderDraft>(() => existing ? orderToDraft(existing) : emptyDraft())
  const [errors, setErrors] = useState<FormErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const isEditing = Boolean(orderId)
  const editable = !existing || existing.status === 'Draft' || existing.status === 'Active'
  const pageTitle = isEditing ? 'Edit buyer order' : 'Create buyer order'
  const currentName = useMemo(() => existing?.buyer.name ?? '', [existing])

  const patchBuyer = (key: keyof BuyerDetails, value: string) => setDraft((current) => ({ ...current, buyer: { ...current.buyer, [key]: value } }))
  const patchProduct = (key: keyof ProductDetails, value: string | number) => setDraft((current) => ({ ...current, product: { ...current.product, [key]: value } }))
  const patchCommercial = (key: keyof CommercialDetails, value: string | number) => setDraft((current) => ({ ...current, commercial: { ...current.commercial, [key]: value } }))
  const patchSafety = (key: keyof OrderSpecification['safetyRequirements'], value: string | boolean) => setDraft((current) => ({ ...current, specification: { ...current.specification, safetyRequirements: { ...current.specification.safetyRequirements, [key]: value } } }))

  const addCriterion = () => setDraft((current) => ({ ...current, specification: { ...current.specification, criteria: [...current.specification.criteria, { id: `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, attribute: '', unit: '', minimum: '', maximum: '', required: true, notes: '' }] } }))
  const patchCriterion = (id: string, key: keyof QualityCriterion, value: string | boolean) => setDraft((current) => ({ ...current, specification: { ...current.specification, criteria: current.specification.criteria.map((criterion) => criterion.id === id ? { ...criterion, [key]: value } : criterion) } }))
  const removeCriterion = (id: string) => setDraft((current) => ({ ...current, specification: { ...current.specification, criteria: current.specification.criteria.filter((criterion) => criterion.id !== id) } }))

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
      const required: [string, string][] = [
        ['buyerName', 'Buyer name'], ['contactPerson', 'Buyer contact person'], ['destinationCountry', 'Destination country'], ['destinationCityPort', 'Destination city / port'],
        ['crop', 'Crop'], ['variety', 'Variety'], ['quantity', 'Required quantity'], ['orderType', 'Order type'], ['deliveryStartDate', 'Delivery start date'], ['deliveryEndDate', 'Delivery end date'],
        ['preferredGrade', 'Preferred grade'], ['packagingType', 'Packaging type'], ['price', 'Agreed price per kg'], ['currency', 'Currency'], ['paymentTerms', 'Payment terms'],
      ]
      for (const [key, label] of required) {
        const value = key === 'buyerName' ? draft.buyer.name : key === 'contactPerson' ? draft.buyer.contactPerson : key === 'destinationCountry' ? draft.buyer.destinationCountry : key === 'destinationCityPort' ? draft.buyer.destinationCityPort : key in draft.product ? draft.product[key as keyof ProductDetails] : draft.commercial[key as keyof CommercialDetails]
        if (value === '' || value === undefined || value === null) next[key] = `${label} is required to create an active order.`
      }
      if (draft.product.requiredQuantityKg !== '' && Number(draft.product.requiredQuantityKg) <= 0) next.quantity = 'Enter a quantity greater than zero.'
      if (draft.commercial.agreedPricePerKg !== '' && Number(draft.commercial.agreedPricePerKg) <= 0) next.price = 'Enter a price greater than zero.'
      if (!draft.product.deliveryStartDate || !draft.product.deliveryEndDate) next.delivery = 'Add both dates to define the delivery window.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit(status: 'Draft' | 'Active') {
    setFormError('')
    if (!validate(status)) {
      if (status === 'Active') setFormError('Review the highlighted fields before creating an active order.')
      else setFormError('Review the highlighted specification and format errors before saving.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSaving(true)
    const input: OrderDraft = { ...draft, product: { ...draft.product, requiredQuantityKg: draft.product.requiredQuantityKg === '' ? '' : Number(draft.product.requiredQuantityKg) }, commercial: { ...draft.commercial, agreedPricePerKg: draft.commercial.agreedPricePerKg === '' ? '' : Number(draft.commercial.agreedPricePerKg) } }
    if (existing) {
      updateOrder(existing.id, input)
      if (status === 'Active' && existing.status === 'Draft') updateStatus(existing.id, 'Active')
      navigate(`/buyer-orders/${existing.id}`)
    } else {
      const order = createOrder(input, status)
      navigate(`/buyer-orders/${order.id}`)
    }
    setSaving(false)
  }

  if (isEditing && !existing) return <div className="order-not-found"><h2>Order not found</h2><p>This order may have been removed from local demo data.</p><Link className="secondary-button" to="/buyer-orders"><ArrowLeft size={15} /> Back to orders</Link></div>
  if (existing && !editable) return <div className="order-not-found"><h2>This order can’t be edited</h2><p>{existing.id} is {existing.status.toLowerCase()}. Completed and cancelled orders are read-only.</p><Link className="secondary-button" to={`/buyer-orders/${existing.id}`}><ArrowLeft size={15} /> Back to details</Link></div>

  return <div className="buyer-order-page buyer-order-form-page">
    <div className="buyer-order-page-top"><div><Link className="back-link" to={existing ? `/buyer-orders/${existing.id}` : '/buyer-orders'}><ArrowLeft size={15} /> {existing ? 'Back to order' : 'All orders'}</Link><h2>{pageTitle}</h2><p>{existing ? `Update buyer and order requirements for ${currentName}. Specification changes are versioned automatically.` : 'Capture buyer requirements and commercial terms. Specifications are recorded per order.'}</p></div><span className="demo-data-note">Synthetic demo data</span></div>
    {formError && <div className="form-alert" role="alert">{formError}</div>}
    <form onSubmit={(event) => event.preventDefault()} noValidate>
      <Section number="01" title="Buyer information" description="Who is placing the order and where should it be delivered?">
        <div className="order-fields-grid">
          <Field label="Buyer name" required error={errors.buyerName}><input value={draft.buyer.name} onChange={(event) => patchBuyer('name', event.target.value)} placeholder="Buyer organisation" /></Field>
          <Field label="Contact person" required error={errors.contactPerson}><input value={draft.buyer.contactPerson} onChange={(event) => patchBuyer('contactPerson', event.target.value)} placeholder="Primary contact" /></Field>
          <Field label="Email" error={errors.email}><input type="email" value={draft.buyer.email} onChange={(event) => patchBuyer('email', event.target.value)} placeholder="name@company.com" /></Field>
          <Field label="Phone"><input type="tel" value={draft.buyer.phone} onChange={(event) => patchBuyer('phone', event.target.value)} placeholder="Country code and number" /></Field>
          <Field label="Destination country" required error={errors.destinationCountry}><input value={draft.buyer.destinationCountry} onChange={(event) => patchBuyer('destinationCountry', event.target.value)} placeholder="Country" /></Field>
          <Field label="Destination city / port" required error={errors.destinationCityPort}><input value={draft.buyer.destinationCityPort} onChange={(event) => patchBuyer('destinationCityPort', event.target.value)} placeholder="City or port" /></Field>
        </div>
      </Section>

      <Section number="02" title="Product and order information" description="Define the requested product, quantity and delivery window.">
        <div className="order-fields-grid">
          <Field label="Crop" required error={errors.crop}><input value={draft.product.crop} onChange={(event) => patchProduct('crop', event.target.value)} placeholder="e.g. Mango" /></Field>
          <Field label="Variety" required error={errors.variety}><input value={draft.product.variety} onChange={(event) => patchProduct('variety', event.target.value)} placeholder="Buyer-requested variety" /></Field>
          <Field label="Required quantity (kg)" required error={errors.quantity}><input type="number" min="0" step="0.1" value={draft.product.requiredQuantityKg} onChange={(event) => patchProduct('requiredQuantityKg', event.target.value === '' ? '' : Number(event.target.value))} placeholder="0" /></Field>
          <Field label="Order type" required error={errors.orderType}><select value={draft.product.orderType} onChange={(event) => patchProduct('orderType', event.target.value)}><option value="Indicative">Indicative</option><option value="Confirmed">Confirmed</option></select></Field>
          <Field label="Delivery start date" required error={errors.delivery}><input type="date" value={draft.product.deliveryStartDate} onChange={(event) => patchProduct('deliveryStartDate', event.target.value)} /></Field>
          <Field label="Delivery end date" required error={errors.delivery}><input type="date" value={draft.product.deliveryEndDate} onChange={(event) => patchProduct('deliveryEndDate', event.target.value)} /></Field>
          <Field label="Preferred grade" required error={errors.preferredGrade}><input value={draft.product.preferredGrade} onChange={(event) => patchProduct('preferredGrade', event.target.value)} placeholder="Buyer-defined grade" /></Field>
        </div>
      </Section>

      <Section number="03" title="Buyer quality specification" description="Set criteria for this buyer and order. No universal thresholds are assumed.">
        <div className="specification-callout">Quality limits are buyer-defined and apply only to this order. Add only the attributes requested by the buyer.</div>
        {draft.specification.criteria.length > 0 ? <div className="criteria-list">{draft.specification.criteria.map((criterion, index) => <div className="criterion-card" key={criterion.id}>
          <div className="criterion-card-top"><strong>Criterion {index + 1}</strong><button type="button" className="remove-criterion" onClick={() => removeCriterion(criterion.id)} aria-label={`Remove criterion ${index + 1}`}><Trash2 size={15} /> Remove</button></div>
          <div className="criterion-fields">
            <Field label="Attribute name"><input value={criterion.attribute} onChange={(event) => patchCriterion(criterion.id, 'attribute', event.target.value)} placeholder="e.g. Fruit size, colour, appearance" /></Field>
            <Field label="Measurement unit"><input value={criterion.unit} onChange={(event) => patchCriterion(criterion.id, 'unit', event.target.value)} placeholder="e.g. cm, g, %, description" /></Field>
            <Field label="Minimum value"><input value={criterion.minimum} onChange={(event) => patchCriterion(criterion.id, 'minimum', event.target.value)} placeholder="Optional" /></Field>
            <Field label="Maximum value"><input value={criterion.maximum} onChange={(event) => patchCriterion(criterion.id, 'maximum', event.target.value)} placeholder="Optional" /></Field>
            <Field label="Notes"><input value={criterion.notes} onChange={(event) => patchCriterion(criterion.id, 'notes', event.target.value)} placeholder="Buyer-specific notes" /></Field>
            <label className="required-toggle"><input type="checkbox" checked={criterion.required} onChange={(event) => patchCriterion(criterion.id, 'required', event.target.checked)} /><span>Required criterion</span></label>
          </div>
          {errors[`criterion-${criterion.id}`] && <p className="field-error criterion-error">{errors[`criterion-${criterion.id}`]}</p>}
        </div>)}</div> : <div className="criteria-empty">No quality criteria added. Add buyer-specific criteria as needed.</div>}
        <button type="button" className="add-criterion-button" onClick={addCriterion}><Plus size={15} /> Add specification criterion</button>
      </Section>

      <Section number="04" title="Safety and documentation" description="Record requirements requested for this order. Entering them does not establish regulatory compliance.">
        <div className="requirement-list">
          <label><input type="checkbox" checked={draft.specification.safetyRequirements.laboratoryReportRequired} onChange={(event) => patchSafety('laboratoryReportRequired', event.target.checked)} /><span><strong>Laboratory report required</strong><small>Buyer-requested report for this order</small></span></label>
          <label><input type="checkbox" checked={draft.specification.safetyRequirements.residueTestingRequired} onChange={(event) => patchSafety('residueTestingRequired', event.target.checked)} /><span><strong>Residue testing required</strong><small>Testing requested by the buyer</small></span></label>
          <label><input type="checkbox" checked={draft.specification.safetyRequirements.phytosanitaryDocumentationRequired} onChange={(event) => patchSafety('phytosanitaryDocumentationRequired', event.target.checked)} /><span><strong>Phytosanitary documentation required</strong><small>Documentation requested for this order</small></span></label>
        </div>
        <div className="order-fields-grid one-column"><Field label="Other buyer-specific documentation"><textarea rows={3} value={draft.specification.safetyRequirements.otherDocumentation} onChange={(event) => patchSafety('otherDocumentation', event.target.value)} placeholder="List any other documents requested by the buyer" /></Field></div>
        <p className="compliance-note">These fields capture buyer instructions only. They do not confirm or establish regulatory compliance.</p>
      </Section>

      <Section number="05" title="Packaging and commercial information" description="Capture the agreed pack format, price and payment terms.">
        <div className="order-fields-grid">
          <Field label="Packaging type" required error={errors.packagingType}><input value={draft.commercial.packagingType} onChange={(event) => patchCommercial('packagingType', event.target.value)} placeholder="e.g. 5 kg ventilated carton" /></Field>
          <Field label="Agreed price per kg" required error={errors.price}><input type="number" min="0" step="0.01" value={draft.commercial.agreedPricePerKg} onChange={(event) => patchCommercial('agreedPricePerKg', event.target.value === '' ? '' : Number(event.target.value))} placeholder="0.00" /></Field>
          <Field label="Currency" required error={errors.currency} hint="Enter a currency code, for example INR, SGD or USD."><input value={draft.commercial.currency} onChange={(event) => patchCommercial('currency', event.target.value.toUpperCase())} placeholder="INR" /></Field>
          <Field label="Payment terms" required error={errors.paymentTerms}><input value={draft.commercial.paymentTerms} onChange={(event) => patchCommercial('paymentTerms', event.target.value)} placeholder="Agreed payment terms" /></Field>
          <Field label="Packaging instructions"><textarea rows={3} value={draft.commercial.packagingInstructions} onChange={(event) => patchCommercial('packagingInstructions', event.target.value)} placeholder="Packing and labelling instructions" /></Field>
          <Field label="Additional instructions"><textarea rows={3} value={draft.commercial.additionalInstructions} onChange={(event) => patchCommercial('additionalInstructions', event.target.value)} placeholder="Other order-specific instructions" /></Field>
        </div>
      </Section>
      <div className="order-form-footer"><Link className="secondary-button" to={existing ? `/buyer-orders/${existing.id}` : '/buyer-orders'}>Discard</Link><div>{(!existing || existing.status === 'Draft') && <button type="button" className="secondary-button" disabled={saving} onClick={() => submit('Draft')}>Save as Draft</button>}<button type="button" className="primary-button" disabled={saving} onClick={() => submit('Active')}>{saving ? 'Saving…' : existing?.status === 'Draft' ? 'Save & activate' : existing ? 'Save changes' : 'Create Active Order'}</button></div></div>
      <p className="form-data-footnote">All order records are stored in this browser as synthetic demo data.</p>
    </form>
  </div>
}
