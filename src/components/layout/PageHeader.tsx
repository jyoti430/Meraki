import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarDays, UserRound, UsersRound } from 'lucide-react'
import { FPO_NAME } from '../../planning/messages'
import { PLANNING_DATE } from '../../planning/engine'
import { fmtDate } from '../../planning/format'
import { useMessageBadge } from './Sidebar'
import { useI18n } from '../../i18n'

export default function PageHeader({ title, subtitle, actions, season = true }: { title: string; subtitle: string; actions?: ReactNode; season?: boolean }) {
  const badge = useMessageBadge()
  const { t } = useI18n()
  const h = new Date().getHours()
  const greet = h < 12 ? t('good_morning') : h < 17 ? t('good_afternoon') : t('good_evening')
  return <header className="m-topbar">
    <div style={{ minWidth: 0, flex: 1 }}>
      <p className="m-greet">{greet}</p>
      <h1 className="m-title">{title}</h1>
      <p className="m-subtitle">{subtitle}</p>
    </div>
    <div className="m-top-tools">
      <div className="m-top-row">
        <label className="m-select-pill"><UsersRound size={19} /><span className="sr-only">FPO</span><select aria-label="FPO" defaultValue={FPO_NAME}><option>{FPO_NAME}</option></select></label>
        <Link to="/messages" className="m-bell" aria-label={badge ? `${badge} farmers need a message` : t('nav_messages')}><Bell size={22} />{badge > 0 && <i />}</Link>
        <span className="m-me" aria-label={t('demo_manager')}><UserRound size={21} /></span>
      </div>
      <div className="m-top-row">
        {actions}
        {season && <label className="m-select-pill"><CalendarDays size={18} /><span className="sr-only">Season</span><select aria-label="Season" defaultValue="rabi"><option value="rabi">{t('season_rabi')}</option></select></label>}
      </div>
      {season && <span className="m-asof">{t('planning_as_of', { date: fmtDate(PLANNING_DATE) })}</span>}
    </div>
  </header>
}
