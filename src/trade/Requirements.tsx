import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { useTrade } from './TradeProvider'
import { g, paise, positive, CommandForm, Detail, Disclosure, Empty, Metric, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, localizedTradeTimestamp, termFields, termsFrom, weightField, type FieldSpec } from './ui'
import { kg, money } from './calculations'
import type { Proposal, Requirement } from './types'
import { cropLabel, formatNumber, statusTranslationKey, useI18n } from '../i18n'

const moneyField = (name: string, label: string): FieldSpec => ({ name, label: label + ' (₹)', type: 'number', min: '0.01', step: '0.01' })
function requirementBody(v: Record<string, string>) {
  return { ...termsFrom(v), crop: v.crop.trim(), variety: v.variety.trim(), grade: v.grade.trim(),
    quantity_g: positive(g(v, 'quantity'), 'Quantity'), maximum_price_paise_per_kg: positive(paise(v, 'maximum'), 'Maximum price'),
    proposal_deadline: new Date(v.proposal_deadline).toISOString() }
}

function RequirementCard({ item }: { item: Requirement }) {
  const { t, lang } = useI18n()
  return <article className="t-opportunity"><div className="t-opportunity-head"><div><span className="m-tag m-tag-order">{t('trq_exporter_badge')}</span><h3>{cropLabel(item.crop, t)} <span className="m-small">{item.variety}</span></h3><p className="m-small">{kg(item.quantity_g)} · {t('ex_grade').toLowerCase()} {item.grade} · {item.owner_org}</p></div><Status value={item.status} /></div>
    <dl className="t-details"><Detail label={t('trq_delivery_window')}>{localizedTradeTimestamp(item.terms.delivery_start, lang, t)} – {localizedTradeTimestamp(item.terms.delivery_end, lang, t)}</Detail><Detail label={t('trq_proposal_deadline')}>{localizedTradeTimestamp(item.proposal_deadline, lang, t)}</Detail><Detail label={t('trq_buyer_maximum')}>{money(item.maximum_price_paise_per_kg)} / kg</Detail><Detail label={t('trui_quality_criteria')}>{formatNumber(item.terms.quality_specification?.length || 0, lang)}</Detail></dl>
    <div className="t-opportunity-foot"><span className="m-small">{t('trq_proposal_summary', { count: formatNumber(item.proposal_count, lang), allocated: kg(item.allocated_g ?? 0), remaining: kg(item.remaining_g ?? item.quantity_g) })}</span><Link className="m-link" to={'/trade/requirements/' + item.id}>{t('trq_review_requirement')} →</Link></div></article>
}

export function TradeRequirementsPage() {
  const { workspace } = useTrade()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const exporter = workspace?.principal.role === 'exporter'
  const items = (workspace?.requirements || []).filter((i) => !exporter || i.owner_org === workspace?.principal.organisation_id)
    .filter((i) => (i.id + ' ' + i.crop + ' ' + i.variety + ' ' + i.grade).toLowerCase().includes(query.toLowerCase()))
  const draftFields: FieldSpec[] = [
    { name: 'crop', label: t('ex_crop') }, { name: 'variety', label: t('plan_ui_variety') }, { name: 'grade', label: t('trq_required_grade') },
    weightField('quantity', t('trq_required_quantity')), moneyField('maximum', t('trq_maximum_price_per_kg')),
    { name: 'proposal_deadline', label: t('trq_proposal_deadline'), type: 'datetime-local' }, ...termFields(),
  ]
  return <TradeFrame title={t('trade_page_requirements')} subtitle={t('trade_page_requirements_sub')}>
    {workspace && <><Notice>{t('trq_notice')}</Notice>
      <div className="t-metrics"><Metric label={t('trq_visible')} value={items.length} /><Metric label={t('trq_my_proposals_count')} value={workspace.proposals.filter((p) => p.supplier_org === workspace.principal.organisation_id && p.status === 'submitted').length} /><Metric label={t('trq_requirement_contracts_count')} value={workspace.contracts.filter((c) => c.requirement_id).length} /></div>
      <div className="t-grid"><Panel title={t('exporter_requirements')} subtitle={t('trq_search_placeholder')} aside={<ClipboardList size={22} color="var(--forest)" />}><div className="t-filter" style={{ marginBottom: 16 }}><label><span className="sr-only">{t('trq_search_label')}</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('trq_search_placeholder')} /></label></div>
        <div className="t-list">{items.map((item) => <RequirementCard key={item.id} item={item} />)}{!items.length && <Empty>{t('trq_no_matches')}</Empty>}</div></Panel>
        <div className="t-list">{exporter ? <Panel title={t('trq_create_title')} subtitle={t('trq_create_subtitle')}><Disclosure title={t('trq_new_requirement')}><CommandForm path="/requirements" submit={t('trq_save_draft')} success={t('trq_draft_saved')} fields={draftFields} prepare={requirementBody} note={t('trq_publish_notice')} /></Disclosure></Panel> : <Panel title={t('trq_my_proposals')} subtitle={t('trq_my_proposals_hint')}><div className="t-list">{workspace.proposals.filter((p) => p.supplier_org === workspace.principal.organisation_id).map((p) => <ProposalCard key={p.id} proposal={p} />)}{!workspace.proposals.some((p) => p.supplier_org === workspace.principal.organisation_id) && <Empty>{t('trq_no_proposals')}</Empty>}</div></Panel>}
        <Panel title={t('trq_supply_lots')} subtitle={t('trq_supply_lots_hint')}><p>{t('trq_spot_qc')}</p><Link className="m-link" to="/trade/lots">{t('trq_open_lots')} →</Link><p><Link className="m-link" to="/trade">{t('trq_market_bids')} →</Link></p></Panel></div></div>
    </>}
  </TradeFrame>
}

function ProposalCard({ proposal, requirement, owner = false }: { proposal: Proposal; requirement?: Requirement; owner?: boolean }) {
  const { command, writesEnabled } = useTrade()
  const { t, lang } = useI18n()
  const [error, setError] = useState('')
  const act = async (action: 'withdraw' | 'reject') => {
    if (action === 'reject' && !window.confirm(t('trq_reject_confirm'))) return
    try { setError(''); await command('/proposals/' + proposal.id + '/' + action, { expected_version: proposal.version, ...(action === 'reject' ? { reason: 'Exporter selected another procurement outcome.' } : {}) }, crypto.randomUUID()) }
    catch { setError(t('trq_proposal_update_failed')) }
  }
  return <div className="t-opportunity"><div className="t-opportunity-head"><div><strong>{owner ? proposal.supplier_org : requirement ? cropLabel(requirement.crop, t) : t('trq_my_proposals')}</strong><p className="m-small">{kg(proposal.quantity_g)} · {t('ex_grade').toLowerCase()} {proposal.grade} · {t('trq_expected_availability').toLowerCase()} {localizedTradeTimestamp(proposal.expected_availability, lang, t)}</p></div><Status value={proposal.status} /></div>
    <dl className="t-details"><Detail label={t('order_price_per_kg')}>{money(proposal.price_paise_per_kg)} / kg</Detail><Detail label={t('trq_evidence_optional')}>{proposal.evidence_reference === undefined ? t('trq_private_supplier') : proposal.evidence_reference || t('trq_not_supplied')}</Detail><Detail label={t('trui_notes')}>{proposal.notes || t('trq_no_notes')}</Detail><Detail label={t('trq_submitted_at')}>{localizedTradeTimestamp(proposal.submitted_at, lang, t)}</Detail></dl>
    {error && <Notice error>{error}</Notice>}
    {proposal.status === 'submitted' && owner && requirement && proposal.quantity_g > (requirement.remaining_g ?? requirement.quantity_g) && <Notice>{t('trq_over_remaining')}</Notice>}
    {proposal.status === 'submitted' && !owner && <button className="m-btn m-btn-secondary m-btn-sm" disabled={!writesEnabled} onClick={() => void act('withdraw')}>{t('trq_withdraw')}</button>}
    {proposal.status === 'submitted' && owner && requirement?.status === 'published' && <div className="m-row" style={{ flexWrap: 'wrap' }}>
      {proposal.quantity_g <= (requirement.remaining_g ?? requirement.quantity_g) && <CommandForm key={'award-' + proposal.id + '-' + requirement.version} path={'/requirements/' + proposal.requirement_id + '/award'} submit={t('trq_award')} prepare={() => { if (!window.confirm(t('trq_award_confirmation'))) throw new Error(t('trq_award_cancelled')); return { expected_version: requirement.version, proposal_id: proposal.id } }} success={t('trq_award_created')} note={t('trq_no_auto_selection')} />}
      <button type="button" className="m-btn m-btn-ghost m-btn-sm" disabled={!writesEnabled} onClick={() => void act('reject')}>{t('status_rejected')}</button></div>}</div>
}

export function TradeRequirementDetailsPage() {
  const { requirementId = '' } = useParams()
  const { workspace } = useTrade()
  const { t, lang } = useI18n()
  const requirement = workspace?.requirements.find((i) => i.id === requirementId)
  const own = Boolean(workspace && requirement?.owner_org === workspace.principal.organisation_id)
  const proposals = workspace?.proposals.filter((p) => p.requirement_id === requirementId) ?? []
  const visibleContracts = workspace?.contracts.filter((c) => c.requirement_id === requirementId) ?? []
  const matching = workspace?.capacities.filter((c) => requirement && c.consented && c.reviewed && c.crop === requirement.crop && c.variety === requirement.variety && c.grade === requirement.grade && c.grade_protocol === requirement.terms.grade_protocol && c.available_g > 0 && new Date(c.delivery_start || '') <= new Date(requirement.terms.delivery_start) && new Date(c.delivery_end || '') >= new Date(requirement.terms.delivery_end)) ?? []
  const prepareProposal = (v: Record<string, string>) => {
    if (!requirement) throw new Error('Refresh the requirement before submitting.')
    const quantity = positive(g(v, 'quantity'), 'Quantity')
    if (quantity > (requirement.remaining_g ?? requirement.quantity_g)) throw new Error('Quantity exceeds the remaining requirement.')
    const capacity = matching.find((c) => c.id === v.capacity_id)
    if (!capacity || quantity > capacity.available_g) throw new Error('Quantity exceeds the selected qualified capacity.')
    return { quantity_g: quantity, grade: requirement.grade, price_paise_per_kg: positive(paise(v, 'price'), 'Price'), capacity_id: capacity.id, expected_availability: new Date(v.expected_availability).toISOString(), evidence_reference: v.evidence_reference, notes: v.notes }
  }
  const proposalFields: FieldSpec[] = [
    { ...weightField('quantity', t('trq_proposed_quantity')), min: '0.001', max: String((requirement?.remaining_g ?? requirement?.quantity_g ?? 0) / 1000), value: String(Math.min(requirement?.remaining_g ?? requirement?.quantity_g ?? 0, matching[0]?.available_g ?? 0) / 1000) },
    moneyField('price', t('trq_offer_price_per_kg')),
    { name: 'capacity_id', label: t('trq_qualified_capacity'), type: 'select', options: matching.map((c) => ({ value: c.id, label: c.id + ' · ' + kg(c.available_g) + ' ' + t('trq_available') })) },
    { name: 'expected_availability', label: t('trq_expected_availability'), type: 'datetime-local' },
    { name: 'evidence_reference', label: t('trq_evidence_optional'), required: false },
    { name: 'notes', label: t('trq_delivery_notes'), type: 'textarea', required: false },
  ]
  return <TradeFrame title={requirement ? t('trade_page_requirement_for', { crop: cropLabel(requirement.crop, t) }) : t('trade_page_requirement_details')} subtitle={t('trq_requirement_details_subtitle')}>
    {workspace && (!requirement ? <Empty>{t('trq_unavailable')} <Link to="/trade/requirements">{t('trq_back')}</Link></Empty> : <>
      <Link className="m-link" to="/trade/requirements"><ArrowLeft size={15} /> {t('trq_back')}</Link>
      <div className="t-metrics"><Metric label={t('trq_required_quantity')} value={kg(requirement.quantity_g)} /><Metric label={t('trq_allocated_awards')} value={kg(requirement.allocated_g ?? 0)} /><Metric label={t('trq_remaining')} value={kg(requirement.remaining_g ?? requirement.quantity_g)} /><Metric label={t('trq_proposal_deadline')} value={localizedTradeTimestamp(requirement.proposal_deadline, lang, t)} /><Metric label={t('trq_version')} value={formatNumber(requirement.version, lang)} /></div>
      <div className="t-grid"><div className="t-list"><Panel title={t('trq_buyer_specification')} subtitle={`${cropLabel(requirement.crop, t)} · ${requirement.variety} · ${t('ex_grade').toLowerCase()} ${requirement.grade}`}><ResourceId id={requirement.id} /><dl className="t-details" style={{ margin: '16px 0' }}><Detail label={t('trq_status')}><Status value={requirement.status} /></Detail><Detail label={t('trq_allocation')}><Status value={requirement.allocation_status ?? 'unallocated'} /></Detail></dl><TermsView terms={requirement.terms} /></Panel>
        <Panel title={t('trq_proposal_comparison')} subtitle={t('trq_comparison_subtitle')}><div className="t-list">{proposals.map((p) => <ProposalCard key={p.id} proposal={p} requirement={requirement} owner={own} />)}{!proposals.length && <Empty>{t('trq_no_visible_proposals')}</Empty>}</div></Panel></div>
        <div className="t-list">{own && requirement.status === 'draft' && <Panel title={t('trq_publish_requirement')}><CommandForm key={requirement.version} path={'/requirements/' + requirement.id + '/publish'} submit={t('trq_publish_for_proposals')} prepare={() => ({ expected_version: requirement.version })} note={t('trq_publish_no_reserve')} /></Panel>}
        {!own && requirement.status === 'published' && <Panel title={t('trq_submit_proposal')} subtitle={t('trq_submit_subtitle')}>{!matching.length ? <Empty>{t('trq_no_matching_capacity')} {t('trq_forecast_not_inventory')}</Empty> : workspace.proposals.some((p) => p.requirement_id === requirement.id && p.supplier_org === workspace.principal.organisation_id && p.status === 'submitted') ? <Notice>{t('trq_active_proposal_exists')} {t('trq_withdraw_before_resubmit')}</Notice> : <CommandForm path={'/requirements/' + requirement.id + '/proposals'} submit={t('trq_submit_capacity_backed')} fields={proposalFields} prepare={prepareProposal} note={<>{t('trq_multiple_fpo_awards')} {t('trq_propose_no_more')} {t('trq_evidence_not_verification')}</>} />}</Panel>}
        {!!visibleContracts.length && <Panel title={t('trq_award_contracts')}><p>{t('trq_allocated_active_contracts', { quantity: kg(requirement.allocated_g ?? 0) })} {t('trq_both_confirmation')}</p>{visibleContracts.map(contract => <p key={contract.id}><Link className="m-link" to={'/trade/contracts/' + contract.id}>{t('trq_open_contract', { id: contract.id, status: t(statusTranslationKey(contract.status) ?? 'status') })} →</Link></p>)}</Panel>}
        {own && <Notice>{t('trq_supplier_scope')}</Notice>}</div></div>
    </>)}
  </TradeFrame>
}
