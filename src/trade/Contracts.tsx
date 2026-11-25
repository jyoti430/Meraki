import { useParams } from 'react-router-dom'
import { useTrade } from './TradeProvider'
import { isoDate, kg, money } from './calculations'
import { ActionLink, CommandForm, Detail, Disclosure, Empty, Notice, Panel, ResourceId, Status, TermsView, TradeFrame, localizedTradeTimestamp, contributions, g, memberField, reasonField, termFields, termsFrom, weightField } from './ui'
import { formatNumber, useI18n } from '../i18n'
import type { Contract } from './types'

function ContractCard({ contract }: { contract: Contract }) {
  const { workspace } = useTrade()
  const { t, lang } = useI18n()
  if (!workspace) return null
  const organisation = workspace.principal.organisation_id
  const party = ['fpo', 'exporter'].includes(workspace.principal.role) && [contract.seller_org, contract.buyer_org].includes(organisation)
  const seller = workspace.principal.role === 'fpo' && contract.seller_org === organisation
  const confirmed = contract.confirmations.some((item) => item.organisation_id === organisation && item.terms_version === contract.terms_version)
  const approved = (organisationId: string) => contract.confirmations.some((item) => item.organisation_id === organisationId && item.terms_version === contract.terms_version)
  return <Panel title={t(contract.mode === 'spot' ? 'trc_spot_contract' : 'trc_forward_contract')} subtitle={t('trc_contract_summary', { quantity: kg(contract.quantity_g), price: money(contract.price_paise_per_kg), version: formatNumber(contract.terms_version, lang) })} aside={<Status value={contract.status} />}>
    <div className="t-resource-head"><ResourceId id={contract.id} />{contract.requirement_id ? <ActionLink to={`/trade/requirements/${contract.requirement_id}`}>{t('trc_buyer_requirement')}</ActionLink> : contract.auction_id ? <ActionLink to={`/trade/auctions/${contract.auction_id}`}>{t('trc_auction_record')}</ActionLink> : null}</div>
    <ol className="t-lifecycle" aria-label={t('trc_journey')}><li className="active"><b>1</b>{t('trc_awarded')}</li><li className={contract.status === 'confirmed' ? 'active' : ''}><b>2</b>{t('trc_terms_confirmed')}</li><li className={contract.shipped_g > 0 ? 'active' : ''}><b>3</b>{t('trc_shipment_recorded')}</li><li><b>4</b>{t('trc_receipt_settlement')}</li></ol>
    <dl className="t-details" style={{ margin: '20px 0' }}><Detail label={t('trc_seller')}>{contract.seller_org}</Detail><Detail label={t('trc_buyer')}>{contract.buyer_org}</Detail><Detail label={t('trc_provisional_deadline')}>{localizedTradeTimestamp(contract.expires_at, lang, t)}</Detail><Detail label={t('trc_shipment_commitments')}>{kg(contract.shipped_g || 0)} {t('trc_of')} {kg(contract.quantity_g)}</Detail><Detail label={t('trc_seller_approval')}>{approved(contract.seller_org) ? t('trc_current_approved') : t('trc_awaiting_approval')}</Detail><Detail label={t('trc_buyer_approval')}>{approved(contract.buyer_org) ? t('trc_current_approved') : t('trc_awaiting_approval')}</Detail></dl>
    <Disclosure title={t('trc_review_snapshot')} open><TermsView terms={contract.terms} /><p className="m-small" style={{ margin: '14px 0 0' }}>{t('trc_disclosed_fee', { amount: money(contract.terms.fee_paise) })} {t('trc_signing_limit')}</p></Disclosure>
    {party && contract.status === 'provisional' && !confirmed && <div style={{ marginTop: 18 }}><CommandForm key={`confirm-${contract.version}`} path={`/contracts/${contract.id}/confirm`} fields={[{ name: 'reviewed', label: t('trc_approve_snapshot', { version: formatNumber(contract.terms_version, lang) }), type: 'checkbox' }]} prepare={() => ({ expected_version: contract.version, terms_version: contract.terms_version })} submit={t('trc_confirm_terms')} success={t('trc_approval_recorded')} /></div>}
    {party && contract.status === 'provisional' && confirmed && <div style={{ marginTop: 16 }}><Notice>{t('trc_other_party_confirmation')}</Notice></div>}
    {contract.status === 'confirmed' && <div className="m-row" style={{ marginTop: 18 }}><ActionLink to="/trade/lots">{t('trc_lots_qc')}</ActionLink><ActionLink to="/trade/shipments">{t('trc_create_shipment')}</ActionLink><ActionLink to="/trade/settlements">{t('trc_settlement_ledger')}</ActionLink></div>}
    {seller && contract.mode === 'forward' && contract.status === 'confirmed' && !contract.lot_id && <div style={{ marginTop: 18 }}><Disclosure title={t('trc_convert_capacity')}><CommandForm key={`harvest-${contract.version}`} path={`/contracts/${contract.id}/harvest`} submit={t('trc_create_exclusive_lot')} fields={[weightField('quantity', t('trc_harvest_quantity'), contract.quantity_g), { name: 'harvest_date', label: t('trc_actual_harvest_date'), type: 'date' }, { name: 'pickup_deadline', label: t('trc_pickup_deadline'), type: 'datetime-local' }, memberField]} prepare={(values) => {
      const quantity = g(values, 'quantity')
      if (quantity !== contract.quantity_g) throw new Error(t('trc_quantity_entire_contract'))
      return { expected_version: contract.version, quantity_g: quantity, harvest_date: values.harvest_date, pickup_deadline: isoDate(values.pickup_deadline), member_contributions: contributions(values, quantity) }
    }} note={<>{t('trc_conversion_note')} {t('trc_lot_exclusive_hold')}</>} /></Disclosure></div>}
    {party && ['provisional', 'confirmed'].includes(contract.status) && contract.shipped_g === 0 && <div style={{ marginTop: 18 }}>
      <Disclosure title={t('trc_replacement_terms')}><CommandForm key={`amend-${contract.version}`} path={`/contracts/${contract.id}/amend`} fields={termFields(contract.terms)} prepare={(values) => ({ expected_version: contract.version, terms: termsFrom(values) })} submit={t('trc_save_bilateral_terms')} note={t('trc_amendment_effect')} /></Disclosure>
      <Disclosure title={t('trc_cancel_default')}><div className="t-grid"><CommandForm key={`cancel-${contract.version}`} path={`/contracts/${contract.id}/cancel`} fields={[reasonField]} prepare={(values) => ({ expected_version: contract.version, reason: values.reason.trim() })} submit={t('trc_cancel_release')} tone="danger" /><CommandForm key={`default-${contract.version}`} path={`/contracts/${contract.id}/default`} fields={[reasonField]} prepare={(values) => ({ expected_version: contract.version, reason: values.reason.trim() })} submit={t('trc_default_release')} tone="danger" /></div><p className="m-small" style={{ margin: '12px 0 0' }}>{t('trc_reason_runnerup')}</p></Disclosure>
    </div>}
  </Panel>
}

export function TradeContractsPage() {
  const { contractId } = useParams()
  const { workspace } = useTrade()
  const { t } = useI18n()
  const contracts = workspace?.contracts.filter((item) => !contractId || item.id === contractId) ?? []
  return <TradeFrame title={t('trade_page_contracts')} subtitle={t('trade_page_contracts_sub')}>
    <div className="t-list">{contracts.map((contract) => <ContractCard contract={contract} key={contract.id} />)}{!contracts.length && <Empty>{contractId ? t('trc_contract_unavailable') : t('trc_no_contracts')}</Empty>}</div>
  </TradeFrame>
}
