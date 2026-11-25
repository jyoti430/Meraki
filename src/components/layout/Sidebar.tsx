import { NavLink } from 'react-router-dom'
import { Activity, ArrowLeftRight, BarChart3, Gavel, Handshake, Home, MessageSquareText, RotateCcw, ShoppingBag, Sprout, UsersRound } from 'lucide-react'
import { usePlan, resetDemoData } from '../../context/PlanContext'
import { replyStateFor } from '../../planning/engine'
import { MerakiMark } from '../ui'
import { useI18n, type TKey } from '../../i18n'
import LanguageSelector from '../../i18n/LanguageSelector'

type NavItem = { labelKey: TKey; shortKey: TKey; to: string; icon: any }
const item = (labelKey: TKey, shortKey: TKey, to: string, icon: any): NavItem => ({ labelKey, shortKey, to, icon })

/** Core FPO journey first; the optional marketplace and experiments are grouped below it. */
export const navGroups: { key: TKey; items: NavItem[] }[] = [
  { key: 'nav_group_plan', items: [
    item('nav_overview', 'short_overview', '/fpo', Home),
    item('nav_demand', 'short_demand', '/demand', ShoppingBag),
    item('nav_plans', 'short_plans', '/plan', Sprout),
    item('nav_yield_poc', 'short_yield_poc', '/yield-poc', BarChart3),
  ] },
  { key: 'nav_group_coordinate', items: [
    item('nav_farmers', 'short_farmers', '/farmers', UsersRound),
    item('nav_messages', 'short_messages', '/messages', MessageSquareText),
  ] },
  { key: 'nav_group_market', items: [
    item('nav_auctions', 'short_auctions', '/auctions', Gavel),
    item('nav_trade', 'short_trade', '/trade', Handshake),
  ] },
  { key: 'nav_group_experimental', items: [item('nav_sensors', 'short_sensors', '/sensors', Activity)] },
]
export const navigation = navGroups.flatMap((group) => group.items)
/** The mobile tab bar holds the core journey; everything else lives under "More". */
export const mobilePrimary = ['/fpo', '/demand', '/plan', '/farmers', '/messages']

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
  const { t } = useI18n()
  return <aside className="m-sidebar">
    <NavLink to="/fpo" className="m-brand" aria-label="Meraki home"><MerakiMark size={38} /><div className="m-brand-name">Meraki</div></NavLink>
    <nav className="m-nav" aria-label={t('main_navigation')}>
      {navGroups.map((group) => <div className="m-nav-group" key={group.key}>
        <p className="m-nav-label">{t(group.key)}</p>
        {group.items.map(({ labelKey, to, icon: Icon }) => <NavLink key={to} to={to} className={() => (isNavActive(to, pathname) ? 'active' : '')} aria-current={isNavActive(to, pathname) ? 'page' : undefined}>
          <Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{t(labelKey)}</span>{to === '/messages' && badge > 0 && <span className="m-nav-step" aria-label={t('nav_farmers_to_message', { count: badge })}>{badge}</span>}
        </NavLink>)}
      </div>)}
    </nav>
    <div className="m-sidebar-foot">
      <LanguageSelector />
      <NavLink to="/"><ArrowLeftRight size={15} aria-hidden="true" /> {t('switch_workspace')}</NavLink>
      <button type="button" onClick={() => { if (window.confirm(t('reset_confirm'))) resetDemoData() }}><RotateCcw size={15} aria-hidden="true" /> {t('reset_demo')}</button>
      <div className="m-synthetic-note">{t('synthetic_note')}</div>
    </div>
  </aside>
}
