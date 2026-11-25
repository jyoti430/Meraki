import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useI18n } from '../i18n'

/** Make disconnected state authorities explicit at the point of action. */
export default function WorkflowAuthorityNotice({ pathname }: { pathname: string }) {
  const { t } = useI18n()
  const localQc = ['/lots-inspection', '/lab-release-review'].some(path => pathname === path || pathname.startsWith(`${path}/`))
  const localPlanning = ['/plan', '/demand', '/buyer-orders', '/farmers', '/farmers-plots', '/plots', '/crop-cycles', '/supply-planning', '/farm-intelligence', '/messages']
    .some(path => pathname === path || pathname.startsWith(`${path}/`))
  if (!localQc && !localPlanning) return null
  const title = localQc ? t('authority_local_qc_title') : t('authority_local_planning_title')
  const description = localQc ? t('authority_local_qc_detail') : t('authority_local_planning_detail')
  return <aside role="note" className="m-authority">
    <Info size={16} aria-hidden="true" />
    <span><strong>{title}</strong>{' '}{description}{' '}
      <Link to={localQc ? '/trade/lots' : '/trade'}>{t('nav_trade')}</Link></span>
  </aside>
}
