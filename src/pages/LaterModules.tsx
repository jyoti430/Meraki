import { Link } from 'react-router-dom'
import { ArrowRight, BadgeIndianRupee, ClipboardCheck, FlaskConical, PackageCheck, Truck } from 'lucide-react'
import { useI18n } from '../i18n'

export default function LaterModules() {
  const { t } = useI18n()
  const modules = [
    { to: '/trade/lots', title: t('mod_lots'), icon: ClipboardCheck, text: t('mod_lots_desc') },
    { to: '/trade/review', title: t('mod_lab'), icon: FlaskConical, text: t('mod_lab_desc') },
    { to: '/crates-shipments', title: t('mod_crates'), icon: Truck, text: t('mod_crates_desc') },
    { to: '/arrival-claims', title: t('mod_arrival'), icon: PackageCheck, text: t('mod_arrival_desc') },
    { to: '/farmer-settlements', title: t('mod_settlements'), icon: BadgeIndianRupee, text: t('mod_settlements_desc') },
  ]
  return <div className="m-page">
    <header><div className="m-eyebrow">{t('beyond_planning')}</div><h1 className="m-h1">{t('nav_trade')}</h1><p className="m-lead">{t('trade_sub')}</p></header>
    <div className="m-later-grid">
      {modules.map(({ to, title, icon: Icon, text }) => <Link key={to} to={to} className="m-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="m-action-ico info"><Icon size={17} /></span><strong>{title}</strong><span className="m-small">{text}</span><span className="m-tag m-tag-neutral" style={{ alignSelf: 'flex-start' }}>Trade API</span><span className="m-action-cta">{t('open_workflow')} <ArrowRight size={13} /></span>
      </Link>)}
    </div>
  </div>
}
