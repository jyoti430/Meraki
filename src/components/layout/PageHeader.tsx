import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarDays, UserRound, UsersRound } from 'lucide-react'
import { FPO_NAME } from '../../planning/messages'
import { PLANNING_DATE } from '../../planning/engine'
import { fmtDate } from '../../planning/format'
import { useMessageBadge } from './Sidebar'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function PageHeader({ title, subtitle, actions, season = true }: { title: string; subtitle: string; actions?: ReactNode; season?: boolean }) {
  const badge = useMessageBadge()
  return <header className="m-topbar">
    <div style={{ minWidth: 0, flex: 1 }}>
      <p className="m-greet">{greeting()}</p>
      <h1 className="m-title">{title}</h1>
      <p className="m-subtitle">{subtitle}</p>
    </div>
    <div className="m-top-tools">
      <div className="m-top-row">
        <label className="m-select-pill"><UsersRound size={19} /><span className="sr-only">FPO</span><select aria-label="FPO" defaultValue={FPO_NAME}><option>{FPO_NAME}</option></select></label>
        <Link to="/messages" className="m-bell" aria-label={badge ? `${badge} farmers need a message` : 'Messages'}><Bell size={22} />{badge > 0 && <i />}</Link>
        <span className="m-me" aria-label="Demo manager"><UserRound size={21} /></span>
      </div>
      <div className="m-top-row">
        {actions}
        {season && <label className="m-select-pill"><CalendarDays size={18} /><span className="sr-only">Season</span><select aria-label="Season" defaultValue="rabi"><option value="rabi">Rabi (Nov – Apr)</option></select></label>}
      </div>
      {season && <span className="m-asof">Planning as of {fmtDate(PLANNING_DATE)} · synthetic demo data</span>}
    </div>
  </header>
}
