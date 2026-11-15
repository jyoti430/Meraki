import { NavLink } from 'react-router-dom'
import { Activity, Archive, Database, Gavel, Home, Layers, MessageSquareText, RotateCcw, ShoppingBag, Sprout, UsersRound } from 'lucide-react'
import { usePlan, resetDemoData } from '../../context/PlanContext'
import { replyStateFor } from '../../planning/engine'
import { MerakiMark } from '../ui'

export const navigation = [
  { label: 'Overview', short: 'Overview', to: '/', icon: Home },
  { label: 'Planting Plans', short: 'Plans', to: '/plan', icon: Sprout },
  { label: 'Buyer Demand', short: 'Demand', to: '/demand', icon: ShoppingBag },
  { label: 'Farmers & Farms', short: 'Farmers', to: '/farmers', icon: UsersRound },
  { label: 'Farm intelligence', short: 'Farm data', to: '/farm-intelligence', icon: Layers },
  { label: 'Public data & models', short: 'Public data', to: '/live-data', icon: Database },
  { label: 'Messages', short: 'Messages', to: '/messages', icon: MessageSquareText },
  { label: 'Trade & fulfilment', short: 'Trade', to: '/trade', icon: Gavel },
  { label: 'Live sensor data', short: 'Sensors', to: '/sensors', icon: Activity },
]

export function useMessageBadge() {
  const { result, responses } = usePlan()
  return result.farmersInvolved.filter((id) => { const s = replyStateFor(id, responses, result.allocations); return s === 'not-sent' || s === 'needs-update' }).length
}

export function isNavActive(to: string, pathname: string) {
  if (to === '/') return pathname === '/'
  if (to === '/demand') return pathname.startsWith('/demand') || pathname.startsWith('/buyer-orders')
  if (to === '/plan') return pathname.startsWith('/plan') || pathname.startsWith('/supply-planning')
  if (to === '/farmers') return pathname.startsWith('/farmers') || pathname.startsWith('/plots') || pathname.startsWith('/crop-cycles')
  return pathname.startsWith(to)
}

export default function Sidebar({ pathname }: { pathname: string }) {
  const badge = useMessageBadge()
  return <aside className="m-sidebar">
    <NavLink to="/" className="m-brand" aria-label="Meraki home"><MerakiMark size={38} /><div className="m-brand-name">Meraki</div></NavLink>
    <nav className="m-nav" aria-label="Main navigation">
      {navigation.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')} aria-current={isNavActive(to, pathname) ? 'page' : undefined}>
        <Icon size={21} strokeWidth={1.8} /><span>{label}</span>{to === '/messages' && badge > 0 && <span className="m-nav-step" aria-label={`${badge} farmers to message`}>{badge}</span>}
      </NavLink>)}
    </nav>
    <div className="m-sidebar-foot">
      <div className="m-synthetic-note">Planning demo uses <strong>synthetic</strong> farm and order records. Public data and sensor uploads have separate source labels. No messages are sent.</div>
      <NavLink to="/later"><Archive size={15} /> Later modules</NavLink>
      <button type="button" onClick={() => { if (window.confirm('Reset all demo data? Your edits, messages and replies in this browser will be cleared.')) resetDemoData() }}><RotateCcw size={15} /> Reset demo data</button>
    </div>
  </aside>
}
