import { NavLink } from 'react-router-dom'
import {
  BadgeIndianRupee, Boxes, ClipboardCheck, ClipboardList, FlaskConical, LayoutDashboard,
  MapPinned, Menu, PackageCheck, Truck, UsersRound, X,
} from 'lucide-react'

export const navigation = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Buyer Orders', to: '/buyer-orders', icon: ClipboardList },
  { label: 'Farmers & Plots', to: '/farmers-plots', icon: MapPinned },
  { label: 'Supply Planning', to: '/supply-planning', icon: Boxes },
  { label: 'Lots & Inspection', to: '/lots-inspection', icon: ClipboardCheck },
  { label: 'Lab & Release Review', to: '/lab-release-review', icon: FlaskConical },
  { label: 'Crates & Shipments', to: '/crates-shipments', icon: Truck },
  { label: 'Arrival & Claims', to: '/arrival-claims', icon: PackageCheck },
  { label: 'Farmer Settlements', to: '/farmer-settlements', icon: BadgeIndianRupee },
]

type SidebarProps = { open: boolean; onClose: () => void; onToggle: () => void }

export default function Sidebar({ open, onClose, onToggle }: SidebarProps) {
  return (
    <>
      <button className="mobile-menu" onClick={onToggle} aria-label={open ? 'Close navigation' : 'Open navigation'}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /></div>
          <div><div className="brand-name">Nexus<span>Supply</span></div><div className="brand-caption">FPO OPERATIONS</div></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="nav-list">
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-card"><div className="workspace-card-icon"><UsersRound size={16} /></div><div><strong>FPO Manager</strong><span>Workspace</span></div></div>
          <div className="sidebar-footnote">Nexus Supply <span>·</span> Demo workspace</div>
        </div>
      </aside>
    </>
  )
}
