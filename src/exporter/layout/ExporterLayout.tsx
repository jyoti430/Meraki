import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ArrowLeftRight, ClipboardList, Home, PackageSearch, Truck } from 'lucide-react'
import { MerakiMark } from '../../components/ui'

const links = [
  { to: '/exporter', label: 'Dashboard', icon: Home, end: true },
  { to: '/exporter/requirements', label: 'Procurement & demand', icon: ClipboardList, end: false },
  { to: '/exporter/marketplace', label: 'FPO marketplace', icon: PackageSearch, end: false },
  { to: '/exporter/orders', label: 'Orders & fulfilment', icon: Truck, end: false },
]

export default function ExporterLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <div className="e-shell">
    <aside className="e-sidebar">
      <NavLink to="/" className="e-brand"><MerakiMark size={36} /><span>Meraki</span></NavLink>
      <div className="e-workspace-label">EXPORTER WORKSPACE</div>
      <nav className="e-nav" aria-label="Exporter navigation">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `e-nav-link${isActive ? ' active' : ''}`}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="e-sidebar-spacer" />
      <div className="e-sidebar-note"><span className="e-live-dot" /> Demo workspace<br /><small>No account is authenticated.</small></div>
      <NavLink to="/" className="e-switch-link"><ArrowLeftRight size={17} /> Switch workspace</NavLink>
    </aside>
    <section className="e-main-column">
      <header className="e-mobile-header">
        <NavLink to="/" className="e-brand"><MerakiMark size={30} /><span>Meraki</span></NavLink>
        <span className="e-demo-pill">Demo workspace</span>
      </header>
      <main className="e-main" key={location.pathname}>{children}</main>
    </section>
    <nav className="e-mobile-nav" aria-label="Exporter navigation">
      {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `e-mobile-nav-link${isActive ? ' active' : ''}`}>
        <Icon size={19} aria-hidden="true" /><span>{label === 'Procurement & demand' ? 'Demand' : label === 'FPO marketplace' ? 'Market' : label === 'Orders & fulfilment' ? 'Orders' : 'Home'}</span>
      </NavLink>)}
    </nav>
  </div>
}
