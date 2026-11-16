import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Gavel, ArrowLeftRight, ClipboardList, Home, PackageSearch, Truck, Handshake } from 'lucide-react'
import { MerakiMark } from '../../components/ui'

const links = [
  { to: '/exporter', label: 'Layout example', shortLabel: 'Overview', icon: Home, end: true },
  { to: '/exporter/requirements', label: 'Local draft examples', shortLabel: 'Drafts', icon: ClipboardList, end: false },
  { to: '/exporter/marketplace', label: 'Supply examples', shortLabel: 'Supply', icon: PackageSearch, end: false },
  { to: '/exporter/auctions', label: 'Crop auctions', shortLabel: 'Auctions', icon: Gavel, end: false },
  { to: '/exporter/orders', label: 'Lifecycle example', shortLabel: 'Lifecycle', icon: Truck, end: false },
  { to: '/trade/requirements', label: 'Shared procurement', shortLabel: 'Procure', icon: Handshake, end: false },
]

export default function ExporterLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <div className="e-shell">
    <aside className="e-sidebar">
      <NavLink to="/" className="e-brand"><MerakiMark size={36} /><span>Meraki</span></NavLink>
      <div className="e-workspace-label">EXPORTER EXAMPLES</div>
      <nav className="e-nav" aria-label="Exporter navigation">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `e-nav-link${isActive ? ' active' : ''}`}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="e-sidebar-spacer" />
      <div className="e-sidebar-note"><span className="e-live-dot" /> {location.pathname.endsWith('/auctions') ? 'Auction workspace' : 'Example workspace'}<br /><small>{location.pathname.endsWith('/auctions') ? 'Account status is shown in auctions.' : 'Local examples; shared records use the procurement workspace.'}</small></div>
      <NavLink to="/" className="e-switch-link"><ArrowLeftRight size={17} /> Switch workspace</NavLink>
    </aside>
    <section className="e-main-column">
      <header className="e-mobile-header">
        <NavLink to="/" className="e-brand"><MerakiMark size={30} /><span>Meraki</span></NavLink>
        <span className="e-demo-pill">Example workspace</span>
      </header>
      <main className="e-main" key={location.pathname}>{children}</main>
    </section>
    <nav className="e-mobile-nav" aria-label="Exporter navigation">
      {links.map(({ to, shortLabel, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `e-mobile-nav-link${isActive ? ' active' : ''}`}>
        <Icon size={19} aria-hidden="true" /><span>{shortLabel}</span>
      </NavLink>)}
    </nav>
  </div>
}
