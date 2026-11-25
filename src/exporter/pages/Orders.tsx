import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { DEMO_ORDERS } from '../demoData'
import { cropLabel, formatDate, formatINR, formatNumber, statusTranslationKey, useI18n } from '../../i18n'

export default function Orders() {
  const { t, lang } = useI18n()
  return <div className="e-page">
    <ExporterPageHeader eyebrow={t('ex_orders_eyebrow')} title={t('ex_orders_title')} description={t('ex_orders_description')} />
    <DemoNotice>{t('ex_orders_notice')}</DemoNotice>
    <section className="e-panel"><div className="e-panel-head"><h2>{t('ex_orders_sample_orders')}</h2><StatusBadge tone="muted">{t('ex_orders_demo_data')}</StatusBadge></div>
      <div className="e-fulfilment-list">{DEMO_ORDERS.map(order => <article className="e-fulfilment-row" key={order.id}>
        <span className="e-stage-number">{order.crop.slice(0, 1)}</span>
        <div className="e-stage-title"><strong>{cropLabel(order.crop, t)} · {formatNumber(order.quantityKg, lang)} kg</strong><p>{order.fpo} · {order.id}</p><p>{t('ex_orders_sample_delivery', { date: formatDate(order.delivery, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })} · {formatINR(order.amountInr, lang)}</p></div>
        <StatusBadge tone={order.status === 'Delivered' ? 'good' : 'warn'}>{`${t(statusTranslationKey(order.status)!)} · ${t('ex_orders_demo_suffix')}`}</StatusBadge>
      </article>)}</div>
    </section>
  </div>
}
