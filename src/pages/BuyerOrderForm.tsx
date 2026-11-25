import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Info, Plus, Sprout, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBuyerOrders } from '../context/BuyerOrdersContext'
import { crops, findCrop } from '../data/crops'
import { PLANNING_DATE } from '../planning/engine'
import { addDays, daysBetween } from '../planning/format'
import type { BuyerDetails, BuyerOrder, CommercialDetails, OrderSpecification, ProductDetails, QualityCriterion } from '../types'
import { cropLabel, formatDate, formatNumber, statusTranslationKey, useI18n } from '../i18n'

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
  const { t, lang } = useI18n()
  const crop = findCrop(product.crop)
  const qty = Number(product.requiredQuantityKg)
  if (!crop || !product.deliveryStartDate) return <div className="m-alert m-alert-info"><Sprout size={18} style={{ flex: 'none' }} /><span>{t('order_preview_choose_crop_date')}</span></div>
  if (crop.perennial) return <div className="m-alert m-alert-info"><Sprout size={18} style={{ flex: 'none' }} /><span>{t('order_preview_perennial', { crop: cropLabel(crop.name, t) })}</span></div>
  const sowBy = addDays(product.deliveryStartDate, -crop.daysToFirstHarvest)
  const left = daysBetween(PLANNING_DATE, sowBy)
  const acres = qty > 0 ? [qty / crop.yieldPerAcre[2], qty / crop.yieldPerAcre[0]] : null
  return <div className={`m-alert ${left < 0 ? 'm-alert-warn' : 'm-alert-good'}`}><Sprout size={18} style={{ flex: 'none', marginTop: 2 }} /><span>
    {left < 0 ? <>{t('order_preview_too_late', { crop: cropLabel(crop.name, t).toLowerCase(), days: formatNumber(crop.daysToFirstHarvest, lang), date: formatDate(sowBy, lang) })}</>
      : <>{t('order_preview_sow_by', { date: formatDate(sowBy, lang), days: formatNumber(left, lang) })} {acres && <>{t('order_preview_area_prefix')} <strong>{formatNumber(acres[0], lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}–{formatNumber(acres[1], lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ac</strong> {t('order_preview_area_suffix')}</>}</>}
  </span></div>
}

export default function BuyerOrderForm() {
  const { t, lang } = useI18n()
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
    if (draft.buyer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.buyer.email)) next.email = t('order_error_email')
    if (draft.product.requiredQuantityKg !== '' && Number(draft.product.requiredQuantityKg) < 0) next.quantity = t('order_error_quantity_nonnegative')
    if (draft.commercial.agreedPricePerKg !== '' && Number(draft.commercial.agreedPricePerKg) < 0) next.price = t('order_error_price_nonnegative')
    if (draft.product.deliveryStartDate && draft.product.deliveryEndDate && draft.product.deliveryEndDate < draft.product.deliveryStartDate) next.delivery = t('order_error_delivery_range')
    draft.specification.criteria.forEach((criterion, index) => {
      if (!criterion.attribute.trim()) next[`criterion-${criterion.id}`] = t('order_error_spec_attribute', { index: formatNumber(index + 1, lang) })
      else if (!criterion.unit.trim()) next[`criterion-${criterion.id}`] = t('order_error_spec_unit', { index: formatNumber(index + 1, lang) })
      else if (criterion.minimum !== '' && criterion.maximum !== '' && Number(criterion.minimum) > Number(criterion.maximum)) next[`criterion-${criterion.id}`] = t('order_error_spec_range', { index: formatNumber(index + 1, lang) })
    })
    if (status === 'Active') {
      // Only the information needed for a production decision is required to plan.
      if (!draft.buyer.name.trim()) next.buyerName = t('order_error_buyer_name')
      if (!draft.buyer.destinationCountry.trim()) next.destinationCountry = t('order_error_market')
      if (!draft.product.crop.trim()) next.crop = t('order_error_crop')
      if (draft.product.requiredQuantityKg === '' || Number(draft.product.requiredQuantityKg) <= 0) next.quantity = t('order_error_quantity_positive')
      if (!draft.product.deliveryStartDate || !draft.product.deliveryEndDate) next.delivery = t('order_error_both_dates')
      if (draft.product.orderType === 'Confirmed' && (draft.commercial.agreedPricePerKg === '' || Number(draft.commercial.agreedPricePerKg) <= 0)) next.price = t('order_error_confirmed_price')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function submit(status: 'Draft' | 'Active') {
    setFormError('')
    if (!validate(status)) {
      setFormError(status === 'Active' ? t('order_error_activate') : t('order_error_save'))
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

  if (isEditing && !existing) return <div className="m-page"><h1 className="m-h1">{t('order_not_found')}</h1><p className="m-lead">{t('order_removed_local')}</p><Link className="m-btn m-btn-secondary" style={{ alignSelf: 'flex-start' }} to="/demand"><ArrowLeft size={16} /> {t('order_back_demand')}</Link></div>
  if (existing && !editable) return <div className="m-page"><h1 className="m-h1">{t('order_readonly_title')}</h1><p className="m-lead">{t('order_readonly_body', { id: existing.id, status: t(statusTranslationKey(existing.status) ?? 'status') })}</p><Link className="m-btn m-btn-secondary" style={{ alignSelf: 'flex-start' }} to={`/buyer-orders/${existing.id}`}><ArrowLeft size={16} /> {t('order_back_details')}</Link></div>

  const knownCrop = !draft.product.crop || Boolean(findCrop(draft.product.crop))
  return <div className="m-page" style={{ maxWidth: 880 }}>
    <header>
      <Link className="m-link" to={existing ? `/buyer-orders/${existing.id}` : '/demand'}><ArrowLeft size={16} /> {existing ? t('order_back_order') : t('nav_demand')}</Link>
      <h1 className="m-h1">{isEditing ? t('order_edit_title', { id: existing?.id ?? '' }) : t('demand_add_button')}</h1>
      <p className="m-lead">{t('order_form_intro')}</p>
    </header>
    {formError && <div className="m-alert m-alert-bad" role="alert">{formError}</div>}
    <form className="m-stack" onSubmit={(e) => e.preventDefault()} noValidate>
      <section className="m-card m-stack">
        <h2 className="m-h3">{t('order_confirmed_question')}</h2>
        <div className="m-choice" role="radiogroup">
          <label><input type="radio" name="orderType" checked={draft.product.orderType === 'Confirmed'} onChange={() => patchProduct('orderType', 'Confirmed')} /><div><strong>{t('demand_committed')}</strong><span>{t('order_confirmed_help')}</span></div></label>
          <label><input type="radio" name="orderType" checked={draft.product.orderType === 'Indicative'} onChange={() => patchProduct('orderType', 'Indicative')} /><div><strong>{t('demand_indicative')}</strong><span>{t('order_indicative_help')}</span></div></label>
        </div>
        <div className="m-form-grid">
          <Field label={t('farm_crop')} error={errors.crop} hint={!knownCrop ? t('demand_unknown_crop', { crop: cropLabel(draft.product.crop, t) }) : undefined}>
            <input className="m-input" list="crop-options" value={draft.product.crop} onChange={(e) => { const v = e.target.value; patchProduct('crop', v); const c = findCrop(v); if (c && !draft.product.variety) patchProduct('variety', c.defaultVariety) }} placeholder={t('order_crop_placeholder')} aria-invalid={Boolean(errors.crop)} />
            <datalist id="crop-options">{crops.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label={t('order_variety')}><input className="m-input" value={draft.product.variety} onChange={(e) => patchProduct('variety', e.target.value)} placeholder={t('order_variety_placeholder')} /></Field>
          <Field label={t('order_quantity_kg')} error={errors.quantity}><input className="m-input" type="number" min="0" step="10" value={draft.product.requiredQuantityKg} onChange={(e) => patchProduct('requiredQuantityKg', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" aria-invalid={Boolean(errors.quantity)} /></Field>
          <Field label={`${t('order_price_per_kg')}${draft.product.orderType === 'Indicative' ? ` (${t('optional')})` : ''}`} error={errors.price} hint={t('order_price_hint')}>
            <div className="m-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
              <select className="m-select" style={{ width: 96 }} value={draft.commercial.currency} onChange={(e) => patchCommercial('currency', e.target.value)} aria-label={t('order_currency')}><option>INR</option><option>SGD</option><option>USD</option></select>
              <input className="m-input" type="number" min="0" step="0.5" value={draft.commercial.agreedPricePerKg} onChange={(e) => patchCommercial('agreedPricePerKg', e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" aria-invalid={Boolean(errors.price)} />
            </div>
          </Field>
          <Field label={t('order_delivery_from')} error={errors.delivery}><input className="m-input" type="date" value={draft.product.deliveryStartDate} onChange={(e) => patchProduct('deliveryStartDate', e.target.value)} aria-invalid={Boolean(errors.delivery)} /></Field>
          <Field label={t('order_delivery_until')}><input className="m-input" type="date" value={draft.product.deliveryEndDate} onChange={(e) => patchProduct('deliveryEndDate', e.target.value)} aria-invalid={Boolean(errors.delivery)} /></Field>
          <div className="span-2"><PlantingPreview product={draft.product} /></div>
          <Field label={t('demand_buyer')} error={errors.buyerName}><input className="m-input" value={draft.buyer.name} onChange={(e) => patchBuyer('name', e.target.value)} placeholder={t('order_buyer_placeholder')} aria-invalid={Boolean(errors.buyerName)} /></Field>
          <Field label={t('order_market')} error={errors.destinationCountry}>
            <select className="m-select" value={['India', 'Singapore'].includes(draft.buyer.destinationCountry) ? draft.buyer.destinationCountry : 'Other'} onChange={(e) => patchBuyer('destinationCountry', e.target.value === 'Other' ? '' : e.target.value)}><option value="India">{t('market_india_domestic')}</option><option value="Singapore">{t('market_singapore_export')}</option><option value="Other">{t('other')}</option></select>
          </Field>
          {!['India', 'Singapore'].includes(draft.buyer.destinationCountry) && <Field label={t('order_destination_country')} error={errors.destinationCountry}><input className="m-input" value={draft.buyer.destinationCountry} onChange={(e) => patchBuyer('destinationCountry', e.target.value)} placeholder={t('order_country_placeholder')} /></Field>}
        </div>
      </section>

      <details className="m-card m-details" open={hasDetails} style={{ borderTop: '1px solid var(--line)' }}>
        <summary style={{ paddingTop: 0 }}><ChevronRight className="m-chev" size={16} />{t('order_optional_details')}</summary>
        <div className="m-stack" style={{ paddingTop: 12, gap: 22 }}>
          <div className="m-form-grid">
            <Field label={t('order_contact_person')}><input className="m-input" value={draft.buyer.contactPerson} onChange={(e) => patchBuyer('contactPerson', e.target.value)} /></Field>
            <Field label={t('order_city_port')}><input className="m-input" value={draft.buyer.destinationCityPort} onChange={(e) => patchBuyer('destinationCityPort', e.target.value)} /></Field>
            <Field label={t('auth_email')} error={errors.email}><input className="m-input" type="email" value={draft.buyer.email} onChange={(e) => patchBuyer('email', e.target.value)} placeholder="name@company.com" /></Field>
            <Field label={t('order_phone')}><input className="m-input" type="tel" value={draft.buyer.phone} onChange={(e) => patchBuyer('phone', e.target.value)} /></Field>
            <Field label={t('order_grade')}><input className="m-input" value={draft.product.preferredGrade} onChange={(e) => patchProduct('preferredGrade', e.target.value)} placeholder={t('order_grade_placeholder')} /></Field>
            <Field label={t('order_payment_terms')}><input className="m-input" value={draft.commercial.paymentTerms} onChange={(e) => patchCommercial('paymentTerms', e.target.value)} /></Field>
            <Field label={t('order_packaging')}><input className="m-input" value={draft.commercial.packagingType} onChange={(e) => patchCommercial('packagingType', e.target.value)} placeholder={t('order_packaging_placeholder')} /></Field>
            <Field label={t('order_packaging_instructions')}><input className="m-input" value={draft.commercial.packagingInstructions} onChange={(e) => patchCommercial('packagingInstructions', e.target.value)} /></Field>
            <Field label={t('order_other_instructions')} span><textarea className="m-textarea" rows={2} value={draft.commercial.additionalInstructions} onChange={(e) => patchCommercial('additionalInstructions', e.target.value)} /></Field>
          </div>
          <div className="m-stack" style={{ gap: 12 }}>
            <div><h3 className="m-h3" style={{ fontSize: 15.5 }}>{t('order_quality_criteria')}</h3><p className="m-sub">{t('order_quality_help')}</p></div>
            {draft.specification.criteria.map((c, i) => <div key={c.id} className="m-card m-card-sage m-card-tight">
              <div className="m-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><strong>{t('order_criterion', { index: formatNumber(i + 1, lang) })}</strong><button type="button" className="m-btn m-btn-ghost m-btn-xs" onClick={() => removeCriterion(c.id)}><Trash2 size={14} /> {t('remove')}</button></div>
              <div className="m-form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                <Field label={t('order_attribute')}><input className="m-input" value={c.attribute} onChange={(e) => patchCriterion(c.id, 'attribute', e.target.value)} placeholder={t('order_attribute_placeholder')} /></Field>
                <Field label={t('order_unit')}><input className="m-input" value={c.unit} onChange={(e) => patchCriterion(c.id, 'unit', e.target.value)} placeholder="cm, g, %" /></Field>
                <Field label={t('order_minimum')}><input className="m-input" value={c.minimum} onChange={(e) => patchCriterion(c.id, 'minimum', e.target.value)} /></Field>
                <Field label={t('order_maximum')}><input className="m-input" value={c.maximum} onChange={(e) => patchCriterion(c.id, 'maximum', e.target.value)} /></Field>
              </div>
              <div className="m-row" style={{ marginTop: 10 }}><label className="m-row" style={{ gap: 6, fontSize: 14 }}><input type="checkbox" checked={c.required} onChange={(e) => patchCriterion(c.id, 'required', e.target.checked)} /> {t('required')}</label><input className="m-input" style={{ flex: 1, minHeight: 38 }} value={c.notes} onChange={(e) => patchCriterion(c.id, 'notes', e.target.value)} placeholder={t('notes')} aria-label={t('order_criterion_notes')} /></div>
              {errors[`criterion-${c.id}`] && <p className="m-small" style={{ color: 'var(--bad)', margin: '8px 0 0' }}>{errors[`criterion-${c.id}`]}</p>}
            </div>)}
            <div><button type="button" className="m-btn m-btn-secondary m-btn-sm" onClick={addCriterion}><Plus size={15} /> {t('order_add_criterion')}</button></div>
          </div>
          <div className="m-stack" style={{ gap: 8 }}>
            <h3 className="m-h3" style={{ fontSize: 15.5 }}>{t('order_documents_requested')}</h3>
            {([['laboratoryReportRequired', 'order_laboratory_report'], ['residueTestingRequired', 'order_residue_testing'], ['phytosanitaryDocumentationRequired', 'order_phytosanitary_certificate']] as const).map(([key, labelKey]) => <label key={key} className="m-row" style={{ gap: 8, fontSize: 14.5 }}><input type="checkbox" checked={draft.specification.safetyRequirements[key]} onChange={(e) => patchSafety(key, e.target.checked)} /> {t(labelKey)}</label>)}
            <input className="m-input" value={draft.specification.safetyRequirements.otherDocumentation} onChange={(e) => patchSafety('otherDocumentation', e.target.value)} placeholder={t('order_other_documents')} aria-label={t('order_other_documents')} />
            <p className="m-small" style={{ margin: 0 }}><Info size={13} style={{ verticalAlign: '-2px' }} /> {t('order_compliance_disclaimer')}</p>
          </div>
        </div>
      </details>

      <div className="m-row" style={{ justifyContent: 'space-between' }}>
        <Link className="m-btn m-btn-ghost" to={existing ? `/buyer-orders/${existing.id}` : '/demand'}>{t('discard')}</Link>
        <div className="m-row">
          {(!existing || existing.status === 'Draft') && <button type="button" className="m-btn m-btn-secondary" onClick={() => submit('Draft')}>{t('order_save_draft')}</button>}
          <button type="button" className="m-btn m-btn-primary" onClick={() => submit('Active')}>{existing?.status === 'Active' ? t('save_changes') : t('order_save_use_plan')}</button>
        </div>
      </div>
      <p className="m-small" style={{ margin: 0 }}>{t('order_storage_disclosure')}</p>
    </form>
  </div>
}
