import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'

/** Make disconnected state authorities explicit at the point of action. */
export default function WorkflowAuthorityNotice({ pathname }: { pathname: string }) {
  const localQc = ['/lots-inspection', '/lab-release-review'].some(path => pathname === path || pathname.startsWith(`${path}/`))
  const localPlanning = ['/plan', '/demand', '/buyer-orders', '/farmers', '/farmers-plots', '/plots', '/crop-cycles', '/supply-planning', '/farm-intelligence', '/messages']
    .some(path => pathname === path || pathname.startsWith(`${path}/`))
  if (!localQc && !localPlanning) return null
  return <aside role="note" className="m-authority">
    <Info size={16} aria-hidden="true" />
    <span><strong>{localQc ? 'Browser-local intake & QC demo.' : 'Browser-local planning demo.'}</strong>{' '}
      {localQc ? 'Receipts and release decisions here do not change server trade records.'
        : 'Plans, farmer replies and reservations stay in this browser; messages are simulated.'}{' '}
      <Link to={localQc ? '/trade/lots' : '/trade'}>Shared trade workspace</Link></span>
  </aside>
}
