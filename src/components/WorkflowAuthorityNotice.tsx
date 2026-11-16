import { Link } from 'react-router-dom'

/** Make disconnected state authorities explicit at the point of action. */
export default function WorkflowAuthorityNotice({ pathname }: { pathname: string }) {
  const localQc = ['/lots-inspection', '/lab-release-review'].some(path => pathname === path || pathname.startsWith(`${path}/`))
  const localPlanning = ['/plan', '/demand', '/buyer-orders', '/farmers', '/farmers-plots', '/plots', '/crop-cycles', '/supply-planning', '/farm-intelligence', '/messages']
    .some(path => pathname === path || pathname.startsWith(`${path}/`))
  if (!localQc && !localPlanning) return null
  return <aside role="note" className="m-card" style={{ margin: '16px 24px 0', padding: '14px 18px', background: '#fff6df', borderColor: '#dcc48c', color: '#654918', lineHeight: 1.6 }}>
    <strong>{localQc ? 'Browser-local intake & QC demo' : 'Browser-local planning demo'}</strong>
    <div>{localQc ? 'Lot receipts, reports and release decisions here are separate from the server trade ledger. A local release cannot release server stock.'
      : 'Saved plans, farmer replies and “confirmed” demo reservations here are separate from shared backend capacity and bilateral trade contracts. Messages are simulated.'}</div>
    <Link to={localQc ? '/trade/lots' : '/trade'}>Open the server-validated trade workspace</Link>
  </aside>
}
