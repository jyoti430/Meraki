import type { ReactNode } from 'react'
import { CalendarDays, UsersRound } from 'lucide-react'
import { FPO_NAME } from '../../planning/messages'
import { PLANNING_DATE } from '../../planning/engine'
import { formatDate, useI18n } from '../../i18n'

/**
 * Page title plus the planning context. The demo has one FPO and one season, so they are
 * shown as plain labels rather than selectors that offer a single choice.
 */
export default function PageHeader({ title, subtitle, actions, season = true }: { title: string; subtitle: string; actions?: ReactNode; season?: boolean }) {
  const { t, lang } = useI18n()
  return <header className="m-topbar">
    <div style={{ minWidth: 0, flex: 1 }}>
      {season && <p className="m-context">
        <span><UsersRound size={15} aria-hidden="true" />{FPO_NAME}</span>
        <span><CalendarDays size={15} aria-hidden="true" />{t('season_rabi')}</span>
        <span className="m-context-muted">{t('planning_as_of', { date: formatDate(PLANNING_DATE, lang, { day: 'numeric', month: 'short' }) })}</span>
      </p>}
      <h1 className="m-title">{title}</h1>
      <p className="m-subtitle">{subtitle}</p>
    </div>
    {actions && <div className="m-top-tools"><div className="m-top-row">{actions}</div></div>}
  </header>
}
