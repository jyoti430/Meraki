import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Sidebar, { isNavActive, navigation, useMessageBadge } from './Sidebar'
import { MerakiMark } from '../ui'
import { Archive, RotateCcw } from 'lucide-react'
import { resetDemoData } from '../../context/PlanContext'
import { SEASON_LABEL } from '../../planning/engine'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation()
  const badge = useMessageBadge()

  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return }
    // Wait a frame so the target page has rendered before scrolling to the anchor.
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
    return () => window.clearTimeout(id)
  }, [pathname, hash])

  return <div className="m-shell">
    <Sidebar pathname={pathname} />
    <div>
      <header className="m-mobile-bar">
        <NavLink to="/" className="m-brand"><MerakiMark size={30} /><div className="m-brand-name" style={{ fontSize: 21 }}>Meraki</div></NavLink>
        <span className="m-tag m-tag-neutral">{SEASON_LABEL}</span>
      </header>
      <main className="m-main">{children}</main>
      <footer className="m-mobile-foot">
        <div className="m-synthetic-note m-small">Planning demo uses synthetic farm and order records. Public data and sensor uploads have separate source labels. No messages are sent.</div>
        <div className="m-row" style={{ gap: 18 }}>
          <NavLink to="/later"><Archive size={15} /> Later modules</NavLink>
          <button type="button" onClick={() => { if (window.confirm('Reset all demo data? Your edits, messages and replies in this browser will be cleared.')) resetDemoData() }}><RotateCcw size={15} /> Reset demo data</button>
        </div>
      </footer>
    </div>
    <nav className="m-tabbar" aria-label="Main navigation">
      {navigation.map(({ short, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')}>
        <Icon size={20} strokeWidth={1.9} />{short}{to === '/messages' && badge > 0 && <span className="m-nav-step">{badge}</span>}
      </NavLink>)}
    </nav>
  </div>
}
