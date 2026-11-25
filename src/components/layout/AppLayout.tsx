import ExporterLayout from '../../exporter/layout/ExporterLayout'
import { useAuth } from '../../auth/context'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Sidebar, { isNavActive, mobilePrimary, navGroups, navigation, useMessageBadge } from './Sidebar'
import { MerakiMark } from '../ui'
import { ArrowLeftRight, MoreHorizontal, RotateCcw, X } from 'lucide-react'
import { resetDemoData } from '../../context/PlanContext'
import WorkflowAuthorityNotice from '../WorkflowAuthorityNotice'
import { useI18n } from '../../i18n'
import LanguageSelector from '../../i18n/LanguageSelector'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { account, preview } = useAuth()
  const { pathname, hash } = useLocation()
  const badge = useMessageBadge()
  const { t } = useI18n()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreDialog = useRef<HTMLDialogElement>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { setMoreOpen(false) }, [pathname])
  useEffect(() => {
    const dialog = moreDialog.current
    if (!moreOpen || !dialog) return
    const trigger = moreTrigger.current
    const previousOverflow = document.body.style.overflow
    const desktop = window.matchMedia('(min-width: 901px)')
    const closeOnDesktop = () => { if (desktop.matches) setMoreOpen(false) }
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      desktop.removeEventListener('change', closeOnDesktop)
      document.body.style.overflow = previousOverflow
      dialog.close()
      if (trigger?.isConnected && !desktop.matches) trigger.focus()
    }
  }, [moreOpen])

  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return }
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
    return () => window.clearTimeout(id)
  }, [pathname, hash])

  if ((pathname.startsWith('/trade') || pathname === '/auctions') && (account?.role ?? preview) === 'exporter') return <ExporterLayout>{children}</ExporterLayout>

  if (pathname === '/' || pathname.startsWith('/exporter')) return <>{children}</>

  const secondary = navigation.filter((item) => !mobilePrimary.includes(item.to))
  const moreActive = secondary.some((item) => isNavActive(item.to, pathname))
  return <div className="m-shell">
    <Sidebar pathname={pathname} />
    <div>
      <header className="m-mobile-bar">
        <NavLink to="/fpo" className="m-brand"><MerakiMark size={30} /><div className="m-brand-name" style={{ fontSize: 21 }}>Meraki</div></NavLink>
        <span className="m-tag m-tag-neutral">{pathname === '/auctions' ? t('exporter_shared_auctions') : pathname.startsWith('/trade') ? t('exporter_trade_workspace') : t('season_rabi')}</span>
      </header>
      <main className="m-main"><WorkflowAuthorityNotice pathname={pathname} />{children}</main>
    </div>
    <dialog ref={moreDialog} className="m-more-sheet" id="more-menu" aria-labelledby="more-menu-title"
      onCancel={(event) => { event.preventDefault(); setMoreOpen(false) }}
      onClick={(event) => { if (event.target === event.currentTarget) setMoreOpen(false) }}>
      <div className="m-more-content">
        <header className="m-more-head"><h2 className="m-h3" id="more-menu-title">{t('nav_more')}</h2>
          <button className="m-btn m-btn-secondary" type="button" onClick={() => setMoreOpen(false)} autoFocus><X size={16} aria-hidden="true" /> {t('msg_close')}</button>
        </header>
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !mobilePrimary.includes(item.to))
          return items.length > 0 && <div key={group.key}><p className="m-nav-label">{t(group.key)}</p>
            {items.map(({ labelKey, to, icon: Icon }) => <NavLink key={to} to={to} className={() => `m-more-link${isNavActive(to, pathname) ? ' active' : ''}`} onClick={() => setMoreOpen(false)}><Icon size={19} aria-hidden="true" />{t(labelKey)}</NavLink>)}
          </div>
        })}
        <div className="m-more-foot">
          <LanguageSelector />
          <NavLink to="/" onClick={() => setMoreOpen(false)}><ArrowLeftRight size={15} aria-hidden="true" /> {t('switch_workspace')}</NavLink>
          <button type="button" onClick={() => { if (window.confirm(t('reset_confirm'))) resetDemoData() }}><RotateCcw size={15} aria-hidden="true" /> {t('reset_demo')}</button>
          <p className="m-small">{t('synthetic_note')}</p>
        </div>
      </div>
    </dialog>
    <nav className="m-tabbar" aria-label={t('main_navigation')}>
      {navigation.filter((item) => mobilePrimary.includes(item.to)).map(({ shortKey, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')}>
        <Icon size={20} strokeWidth={1.9} aria-hidden="true" />{t(shortKey)}{to === '/messages' && badge > 0 && <span className="m-nav-step">{badge}</span>}
      </NavLink>)}
      <button ref={moreTrigger} type="button" aria-haspopup="dialog" className={moreActive || moreOpen ? 'active' : ''} aria-expanded={moreOpen} aria-controls="more-menu" onClick={() => setMoreOpen((open) => !open)}>
        <MoreHorizontal size={20} strokeWidth={1.9} aria-hidden="true" />{t('nav_more')}
      </button>
    </nav>
  </div>
}
