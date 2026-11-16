import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Sidebar, { isNavActive, navigation, useMessageBadge } from './Sidebar'
import { MerakiMark } from '../ui'
import { Archive, RotateCcw } from 'lucide-react'
import { resetDemoData } from '../../context/PlanContext'
import WorkflowAuthorityNotice from '../WorkflowAuthorityNotice'
import { SEASON_LABEL } from '../../planning/engine'
import { LANGUAGES, useI18n } from '../../i18n'
import GoogleTranslate from '../../i18n/GoogleTranslate'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()
  const badge = useMessageBadge()
  const { t, lang, setLang } = useI18n()

  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return }
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
    return () => window.clearTimeout(id)
  }, [pathname, hash])

  if (pathname === '/' || pathname.startsWith('/exporter') || pathname.startsWith('/trade')) return <>{children}</>

  return <div className="m-shell">
    <GoogleTranslate />
    <Sidebar pathname={pathname} />
    <div>
      <header className="m-mobile-bar">
        <NavLink to="/fpo" className="m-brand"><MerakiMark size={30} /><div className="m-brand-name" style={{ fontSize: 21 }}>Meraki</div></NavLink>
        <div className="m-row" style={{ gap: 8 }}>
          <select aria-label={t('language')} value={lang} onChange={(e) => setLang(e.target.value as any)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8 }}>
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
          </select>
          <span className="m-tag m-tag-neutral">{SEASON_LABEL}</span>
        </div>
      </header>
      <main className="m-main"><WorkflowAuthorityNotice pathname={pathname} />{children}</main>
      <footer className="m-mobile-foot">
        <div className="m-synthetic-note m-small">{t('synthetic_note')}</div>
        <div className="m-row" style={{ gap: 18 }}>
          <NavLink to="/later"><Archive size={15} /> {t('nav_later')}</NavLink>
          <button type="button" onClick={() => { if (window.confirm(t('reset_confirm'))) resetDemoData() }}><RotateCcw size={15} /> {t('reset_demo')}</button>
        </div>
      </footer>
    </div>
    <nav className="m-tabbar" aria-label="Main navigation">
      {navigation.map(({ shortKey, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')}>
        <Icon size={20} strokeWidth={1.9} />{t(shortKey)}{to === '/messages' && badge > 0 && <span className="m-nav-step">{badge}</span>}
      </NavLink>)}
    </nav>
  </div>
}
