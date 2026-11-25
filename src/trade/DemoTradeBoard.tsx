import { useEffect, useRef, useState } from 'react'
import { demoOpportunities, filterDemoOpportunities } from './demoOpportunities'
import { Detail, Empty, Metric, Notice, Panel, Status } from './ui'
import { cropLabel, formatINR, formatNumber, useI18n } from '../i18n'

export function DemoTradeBoard() {
  const { t, lang } = useI18n()
  const items = demoOpportunities
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const details = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) { details.current?.focus({ preventScroll: true }); details.current?.scrollIntoView({ block: 'nearest' }) } }, [selected])
  const active = items.find(item => item.id === selected)
  const filtered = filterDemoOpportunities(items, query, mode, status)
  return <>
    <Notice><strong>{t('trade_demo_notice_title')}</strong> {t('trade_demo_notice')}</Notice>
    <div className="t-metrics" style={{ marginTop: 20 }}><Metric label={t('trade_demo_open_count')} value={formatNumber(items.filter(item => item.status === 'open').length, lang)} /><Metric label={t('trade_demo_sample_quantity')} value={`${formatNumber(items.reduce((total, item) => total + item.quantityKg, 0), lang)} kg`} /><Metric label={t('trade_demo_offer_count')} value={formatNumber(items.reduce((total, item) => total + item.bids, 0), lang)} /><Metric label={t('trade_demo_awarded_count')} value={formatNumber(items.filter(item => item.status === 'awarded').length, lang)} /></div>
    <div className="t-grid"><Panel title={t('trade_demo_board')} subtitle={t('trade_demo_board_sub')}>
      <div className="t-filter" style={{ marginBottom: 18 }}>
        <label><span className="sr-only">{t('trade_demo_search_label')}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('trade_demo_search_placeholder')} /></label>
        <label><span className="sr-only">{t('trade_demo_type_label')}</span><select value={mode} onChange={event => setMode(event.target.value)}><option value="all">{t('trade_demo_both_types')}</option><option value="spot">{t('trade_demo_harvested')}</option><option value="forward">{t('trade_demo_forward')}</option></select></label>
        <label><span className="sr-only">{t('trade_demo_status_label')}</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t('trade_demo_all_statuses')}</option><option value="open">{t('status_open')}</option><option value="awarded">{t('status_awarded')}</option></select></label>
      </div>
      <div className="t-list">{filtered.map(item => <article key={item.id} className="t-opportunity">
        <div className="t-opportunity-head"><div><span className="m-tag m-tag-indicative">{t(item.mode === 'spot' ? 'trade_demo_kind_spot' : 'trade_demo_kind_forward')}</span><h3>{cropLabel(item.crop, t)}</h3><p className="m-small">{item.variety} · {formatNumber(item.quantityKg, lang)} kg</p></div><Status value={item.status} /></div>
        <p>{item.organisation}</p><dl className="t-details"><Detail label={t('trade_demo_handover')}>{item.location}</Detail><Detail label={t('trade_demo_delivery')}>{item.delivery}</Detail><Detail label={t('trade_demo_sample_offers')}>{formatNumber(item.bids, lang)}</Detail></dl>
        <div className="t-opportunity-foot"><div className="t-opportunity-price">{formatINR(item.pricePaise / 100, lang, { maximumFractionDigits: 2 })}<small> / <span>kg</span> · {t('trade_demo_sample_price').toLowerCase()}</small></div><button type="button" className="m-btn m-btn-secondary" aria-expanded={selected === item.id} onClick={() => setSelected(item.id)}>{t('trade_demo_view_crop', { crop: cropLabel(item.crop, t) })}</button></div>
      </article>)}{!filtered.length && <Empty>{t('trade_demo_empty')}</Empty>}</div>
    </Panel><div ref={details} tabIndex={-1} role="region" aria-label={t('trade_demo_details_aria')}><Panel title={active ? `${cropLabel(active.crop, t)} · ${t('trade_demo_sample_details').toLowerCase()}` : t('trade_demo_sample_details')}>
      {!active ? <p>{t('trade_demo_select_details')}</p> : <>
        <p>{t('trade_demo_item_body', { organisation: active.organisation, quantity: formatNumber(active.quantityKg, lang), unit: t(active.mode === 'spot' ? 'trade_demo_whole_lot' : 'trade_demo_whole_request') })}</p>
        <dl className="t-details"><Detail label={t('trade_demo_handover')}>{t('trade_demo_handover_body', { location: active.location })}</Detail><Detail label={t('trade_demo_quality')}>{t('trade_demo_quality_body')}</Detail><Detail label={t('order_payment_terms')}>{t('trade_demo_payment_body')}</Detail><Detail label={t('auction_cancellation')}>{t('trade_demo_cancellation_body')}</Detail><Detail label={t('trade_demo_sample_offers')}>{t(active.mode === 'spot' ? 'trade_demo_spot_rule' : 'trade_demo_forward_rule', { step: formatINR(active.stepPaise / 100, lang, { maximumFractionDigits: 2 }) })}</Detail><Detail label={t('trade_demo_current_price')}>{formatINR(active.pricePaise / 100, lang, { maximumFractionDigits: 2 })} / <span>kg</span></Detail></dl>
        <p>{t('trade_demo_read_only')}</p>
      </>}
    </Panel></div></div>
  </>
}
