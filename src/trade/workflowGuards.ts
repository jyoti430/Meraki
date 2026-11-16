import type { Workspace } from './types'

export const MAX_SNAPSHOT_AGE_MS = 60_000
export function canWriteTrade({ token, workspace, loading, refreshing, error, receivedAt, now = Date.now() }: {
  token: string; workspace: Workspace | null; loading: boolean; refreshing: boolean; error: string; receivedAt: number; now?: number
}) {
  return Boolean(token && workspace && !loading && !refreshing && !error && receivedAt > 0
    && now >= receivedAt && now - receivedAt <= MAX_SNAPSHOT_AGE_MS)
}

/** JSON types are not a contract check: reject a changed/misrouted workspace. */
export function validateTradeWorkspace(value: unknown): Workspace {
  const obj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
  if (!obj(value) || typeof value.server_time !== 'string' || !Number.isFinite(Date.parse(value.server_time))
    || typeof value.synthetic !== 'boolean' || typeof value.production_ready !== 'boolean' || !Array.isArray(value.blockers)
    || !obj(value.principal) || ['id', 'organisation_id', 'role', 'display_name'].some(key => typeof (value.principal as Record<string, unknown>)[key] !== 'string')) {
    throw new Error('Trade workspace contract mismatch. Refresh or check the API configuration; actions are disabled.')
  }
  for (const key of ['lots', 'capacities', 'auctions', 'contracts', 'shipments', 'receipts', 'claims', 'settlements', 'audit_events']) {
    if (!Array.isArray(value[key]) || (value[key] as unknown[]).some(row => !obj(row) || typeof row.id !== 'string')) {
      throw new Error(`Trade workspace is missing valid ${key} records. Actions are disabled.`)
    }
  }
  return value as unknown as Workspace
}
