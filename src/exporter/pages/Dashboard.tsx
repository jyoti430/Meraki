import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ClipboardList, Gavel, Handshake, PackageSearch } from 'lucide-react'
import { Link } from 'react-router-dom'
import DemoNotice from '../components/DemoNotice'
import ExporterPageHeader from '../components/ExporterPageHeader'
import StatusBadge from '../components/StatusBadge'
import { exporterService } from '../exporterService'
import useRequirements from '../hooks/useRequirements'
import type { SupplyProjectionExample } from '../types'
import { cropLabel, formatDate, formatNumber, useI18n, type TKey } from '../../i18n'

const routes = [
  { to: '/exporter/requirements', icon: ClipboardList, titleKey: 'exporter_requirements', textKey: 'ex_requirements_text', source: 'ex_source_local', tone: 'muted' },
  { to: '/exporter/marketplace', icon: PackageSearch, titleKey: 'exporter_supply_examples', textKey: 'ex_supply_text', source: 'ex_source_synthetic', tone: 'muted' },
  { to: '/auctions', icon: Gavel, titleKey: 'exporter_shared_auctions', textKey: 'ex_auctions_text', source: 'ex_source_server', tone: 'live' },
  { to: '/trade', icon: Handshake, titleKey: 'exporter_trade_workflow', textKey: 'ex_trade_text', source: 'ex_source_actors', tone: 'live' },
] as const

function tons(kg: number, lang: 'en' | 'hi' | 'mr' | 'ta' | 'ml') { return `${formatNumber(kg / 1000, lang, { maximumFractionDigits: 1 })} t` }

export default function ExporterDashboard() {
  const { t, lang } = useI18n()
  const { items: requirements, error, refresh } = useRequirements()
  const [supply, setSupply] = useState<SupplyProjectionExample[] | null>(null)
  const [supplyError, setSupplyError] = useState<string | null>(null)
  useEffect(() => {
    exporterService.listSupplyProjections().then(setSupply).catch((cause: unknown) => setSupplyError(cause instanceof Error ? cause.message : 'Could not load the demo supply examples.'))
  }, [])

  const activeCount = requirements?.filter((item) => item.status === 'active').length ?? null
  const projectedKg = useMemo(() => supply?.reduce((sum, item) => sum + item.projectedKg, 0) ?? null, [supply])

  return <div className="e-page">
    <ExporterPageHeader eyebrow={t('ex_overview_eyebrow')} title={t('ex_overview_title')} description={t('ex_overview_description')} />
    <DemoNotice>{t('ex_demo_notice')}</DemoNotice>
    {error && <div className="e-error" role="alert">{error} <button type="button" className="e-text-button" onClick={() => void refresh()}>{t('ex_retry')}</button></div>}
    {supplyError && <div className="e-error" role="alert">{supplyError}</div>}

    <section className="e-route-grid" aria-label={t('ex_workflows_aria')}>
      {routes.map(({ to, icon: Icon, titleKey, textKey, source, tone }) => <Link to={to} className="e-route-card" key={to}>
        <span className="e-route-icon"><Icon size={20} aria-hidden="true" /></span>
        <span className="e-route-copy"><strong>{t(titleKey as TKey)}</strong><span>{t(textKey as TKey)}</span></span>
        <span className={`e-route-source ${tone}`}>{t(source as TKey)}</span>
        <ArrowRight className="e-route-arrow" size={17} aria-hidden="true" />
      </Link>)}
    </section>

    <div className="e-dashboard-grid">
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">{t('ex_requirement_count', { count: activeCount ?? '—' })}</p><h2>{t('ex_procurement_requirements')}</h2></div><Link to="/exporter/requirements" className="e-inline-link">{t('ex_view_all')} <ArrowRight size={16} /></Link></div>
        {requirements === null ? <p className="e-muted" role="status">{t('ex_loading_requirements')}</p> : requirements.filter((item) => item.status === 'active').length === 0 ? <div className="e-empty-inline"><p>{t('ex_no_active_requirements')}</p><Link to="/exporter/requirements/new" className="e-inline-link">{t('ex_create_local_draft')} <ArrowRight size={16} /></Link></div> :
          <div className="e-requirement-preview">{requirements.filter((item) => item.status === 'active').slice(0, 3).map((item) => <Link to={`/exporter/requirements/${item.id}`} className="e-requirement-row" key={item.id}>
            <span className="e-requirement-icon"><ClipboardList size={18} /></span><span className="e-requirement-main"><strong>{cropLabel(item.crop, t)} · {item.variety}</strong><small>{item.id} · {item.destination} · {t('ex_required_by').toLowerCase()} {formatDate(item.requiredBy, lang)}</small></span><StatusBadge tone="muted">{t('ex_example')}</StatusBadge>
          </Link>)}</div>}
      </section>
      <section className="e-panel">
        <div className="e-panel-head"><div><p className="e-eyebrow">{t('ex_supply_caption', { amount: projectedKg === null ? '—' : tons(projectedKg, lang) })}</p><h2>{t('ex_supply_heading')}</h2></div><Link to="/exporter/marketplace" className="e-inline-link">{t('ex_browse_supply')} <ArrowRight size={16} /></Link></div>
        {supply === null ? <p className="e-muted" role="status">{t('ex_loading_supply')}</p> : supply.slice(0, 2).map((item) => <div className="e-supply-preview" key={item.id}>
          <div className="e-supply-preview-copy"><strong>{cropLabel(item.crop, t)} · {item.variety}</strong><small>{item.fpoLabel} · {t('ex_week_of', { date: formatDate(item.deliveryWeekStart, lang) })}</small></div><div className="e-supply-preview-right"><b>{tons(item.projectedKg, lang)}</b><StatusBadge tone="muted">{t('ex_projected')}</StatusBadge></div>
        </div>)}
        <p className="e-footnote">{t('ex_forecast_not_offer')}</p>
      </section>
    </div>
    <p className="e-page-footnote">{t('ex_lifecycle_prompt')} <Link to="/exporter/orders" className="e-inline-link">{t('ex_view_lifecycle')}</Link> ({t('ex_hardcoded_sample')}).</p>
  </div>
}
