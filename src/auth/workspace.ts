export type Role = 'fpo' | 'exporter'
export type Workspace = 'fpo' | 'exporter' | 'market'

/** Where a demo preview starts for each role. */
export const demoHome = (role: Role) => (role === 'fpo' ? '/fpo' : '/exporter')

/** Which part of the app a route belongs to. The workspace chooser at "/" belongs to none. */
export function workspaceForPath(pathname: string): Workspace | null {
  if (pathname === '/') return null
  if (pathname === '/exporter' || pathname.startsWith('/exporter/')) return 'exporter'
  if (pathname === '/trade' || pathname.startsWith('/trade/') || pathname === '/auctions' || pathname.startsWith('/auctions/')) return 'market'
  return 'fpo'
}

/**
 * The demo role a route implies. FPO and exporter pages set the preview role so the
 * header and marketplace views match what the visitor is exploring; shared marketplace
 * routes keep the current role.
 */
export function previewRoleForPath(pathname: string, current: Role): Role {
  const workspace = workspaceForPath(pathname)
  return workspace === 'fpo' || workspace === 'exporter' ? workspace : current
}

export const workspaceLabel = (workspace: Workspace | null, role: Role) =>
  workspace === 'market' ? `Marketplace · as ${role === 'fpo' ? 'FPO' : 'exporter'}`
    : workspace === 'exporter' || (!workspace && role === 'exporter') ? 'Exporter workspace' : 'FPO workspace'
