import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Gavel, ArrowLeftRight, ClipboardList, Home, PackageSearch, Handshake } from 'lucide-react'
import { MerakiMark } from '../../components/ui'
import { useI18n, type TKey } from '../../i18n'
import LanguageSelector from '../../i18n/LanguageSelector'

const links = [
  { to: '/exporter', labelKey: 'nav_overview', shortKey: 'nav_overview', icon: Home, end: true },
  { to: '/exporter/requirements', labelKey: 'exporter_requirements', shortKey: 'exporter_short_requirements', icon: ClipboardList, end: false },
  { to: '/exporter/marketplace', labelKey: 'exporter_supply_examples', shortKey: 'exporter_short_supply', icon: PackageSearch, end: false },
  { to: '/auctions', labelKey: 'exporter_shared_auctions', shortKey: 'short_auctions', icon: Gavel, end: false },
  { to: '/trade', labelKey: 'exporter_trade_workflow', shortKey: 'short_trade', icon: Handshake, end: false },
]

export default function ExporterLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { t } = useI18n()
  const sharedAuctions = location.pathname === '/auctions'
  const trade = location.pathname.startsWith('/trade')
  const workspace = sharedAuctions ? t('exporter_shared_auctions') : trade ? t('exporter_trade_workspace') : t('exporter_local_examples')
  const context = sharedAuctions ? t('exporter_context_shared')
    : trade ? t('exporter_context_trade')
      : t('exporter_context_local')
  return <div className="e-shell">
    <aside className="e-sidebar">
      <NavLink to="/" className="e-brand"><MerakiMark size={36} /><span>Meraki</span></NavLink>
      <div className="e-workspace-label">{t('exporter_workspace')}</div>
      <nav className="e-nav" aria-label={t('exporter_nav_aria')}>
        {links.map(({ to, labelKey, icon: Icon, end }, index) => <Fragment key={to}>
          {index === 0 && <p className="e-nav-label">{t('nav_procurement')}</p>}
          {index === 3 && <p className="e-nav-label">{t('nav_group_market')}</p>}
          <NavLink to={to} end={end} className={({ isActive }) => `e-nav-link${isActive ? ' active' : ''}`}>
            <Icon size={19} aria-hidden="true" /><span>{t(labelKey as TKey)}</span>
          </NavLink>
        </Fragment>)}
      </nav>
      <div className="e-sidebar-spacer" />
      <div className="e-sidebar-note"><span className="e-live-dot" /> {workspace}<br /><small>{context}</small></div>
      <LanguageSelector />
      <NavLink to="/" className="e-switch-link"><ArrowLeftRight size={17} /> {t('switch_workspace')}</NavLink>
    </aside>
    <section className="e-main-column">
      <header className="e-mobile-header">
        <NavLink to="/" className="e-brand"><MerakiMark size={30} /><span>Meraki</span></NavLink>
        <span className="m-tag m-tag-neutral">{workspace}</span>
        <LanguageSelector className="m-lang e-mobile-language" />
      </header>
      <main className="e-main" key={location.pathname}>{children}</main>
    </section>
    <nav className="e-mobile-nav" aria-label={t('exporter_nav_aria')}>
      {links.map(({ to, shortKey, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `e-mobile-nav-link${isActive ? ' active' : ''}`}>
        <Icon size={19} aria-hidden="true" /><span>{t(shortKey as TKey)}</span>
      </NavLink>)}
    </nav>
  </div>
}
