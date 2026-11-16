import { NavLink } from 'react-router-dom'
import { Activity, ArrowLeftRight, Gavel, Handshake, Home, MessageSquareText, RotateCcw, ShoppingBag, Sprout, UsersRound } from 'lucide-react'
import { usePlan, resetDemoData } from '../../context/PlanContext'
import { replyStateFor } from '../../planning/engine'
import { MerakiMark } from '../ui'
import { LANGUAGES, useI18n, type TKey } from '../../i18n'

export const navigation: { labelKey: TKey; shortKey: TKey; to: string; icon: any }[] = [
  { labelKey: 'nav_overview', shortKey: 'short_overview', to: '/fpo', icon: Home },
  { labelKey: 'nav_plans', shortKey: 'short_plans', to: '/plan', icon: Sprout },
  { labelKey: 'nav_yield_poc', shortKey: 'short_yield_poc', to: '/yield-poc', icon: Sprout },
  { labelKey: 'nav_demand', shortKey: 'short_demand', to: '/demand', icon: ShoppingBag },
  { labelKey: 'nav_farmers', shortKey: 'short_farmers', to: '/farmers', icon: UsersRound },
  { labelKey: 'nav_messages', shortKey: 'short_messages', to: '/messages', icon: MessageSquareText },
  { labelKey: 'nav_trade', shortKey: 'short_trade', to: '/trade', icon: Handshake },
  { labelKey: 'nav_auctions', shortKey: 'short_auctions', to: '/auctions', icon: Gavel },
  { labelKey: 'nav_sensors', shortKey: 'short_sensors', to: '/sensors', icon: Activity },
]

export function useMessageBadge() {
  const { result, responses } = usePlan()
  return result.farmersInvolved.filter((id) => { const s = replyStateFor(id, responses, result.allocations); return s === 'not-sent' || s === 'needs-update' }).length
}

export function isNavActive(to: string, pathname: string) {
  if (to === '/fpo') return pathname === '/fpo'
  if (to === '/demand') return pathname.startsWith('/demand') || pathname.startsWith('/buyer-orders')
  if (to === '/plan') return pathname.startsWith('/plan') || pathname.startsWith('/supply-planning')
  if (to === '/farmers') return pathname.startsWith('/farmers') || pathname.startsWith('/plots') || pathname.startsWith('/crop-cycles')
  return pathname.startsWith(to)
}

export default function Sidebar({ pathname }: { pathname: string }) {
  const badge = useMessageBadge()
  const { t, lang, setLang } = useI18n()
  return <aside className="m-sidebar">
    <NavLink to="/fpo" className="m-brand" aria-label="Meraki home"><MerakiMark size={38} /><div className="m-brand-name">Meraki</div></NavLink>
    <div style={{ padding: '0 12px 8px' }}>
      <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{t('language')}</label>
      <select value={lang} onChange={(e) => setLang(e.target.value as any)} style={{ width: '100%', padding: '6px 8px', borderRadius: 8 }}>
        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
      </select>
    </div>
    <nav className="m-nav" aria-label="Main navigation">
      {navigation.map(({ labelKey, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')} aria-current={isNavActive(to, pathname) ? 'page' : undefined}>
        <Icon size={21} strokeWidth={1.8} /><span>{t(labelKey)}</span>{to === '/messages' && badge > 0 && <span className="m-nav-step" aria-label={`${badge} farmers to message`}>{badge}</span>}
      </NavLink>)}
    </nav>
    <div className="m-sidebar-foot">
      <NavLink to="/"><ArrowLeftRight size={15} /> Change workspace</NavLink>
      <div className="m-synthetic-note">{t('synthetic_note')}</div>
      <button type="button" onClick={() => { if (window.confirm(t('reset_confirm'))) resetDemoData() }}><RotateCcw size={15} /> {t('reset_demo')}</button>
    </div>
  </aside>
}
