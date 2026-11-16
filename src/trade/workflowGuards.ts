import type { Health, Principal, Workspace } from './types'

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const timestamp = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const roles = ['fpo', 'exporter', 'qc_reviewer', 'finance_reviewer']

export function validateTradePrincipal(value: unknown): Principal {
  if (!object(value) || ['id', 'organisation_id', 'display_name'].some((key) => !text(value[key])) || !roles.includes(String(value.role))) {
    throw new Error('Trade identity contract mismatch. Check the API configuration before reconnecting.')
  }
  return value as Principal
}

export function validateTradeHealth(value: unknown): Health {
  if (!object(value) || !text(value.status) || !text(value.mode) || typeof value.synthetic !== 'boolean' || typeof value.production_ready !== 'boolean'
    || !timestamp(value.server_time) || !Array.isArray(value.blockers) || value.blockers.some((item) => typeof item !== 'string')) {
    throw new Error('Trade health contract mismatch. Check the API configuration; actions are disabled.')
  }
  return value as Health
}

export function validateTradeSession(value: unknown, principalId: string): { token: string; principal: Principal; synthetic: boolean } {
  if (!object(value) || !text(value.token) || value.synthetic !== true) throw new Error('Trade session contract mismatch. No development session was accepted.')
  const principal = validateTradePrincipal(value.principal)
  if (principal.id !== principalId) throw new Error('The trade service returned a different identity. No session was accepted.')
  return { token: value.token, principal, synthetic: true }
}

export const MAX_SNAPSHOT_AGE_MS = 60_000
export function canWriteTrade({ token, workspace, loading, refreshing, error, receivedAt, now = Date.now() }: {
  token: string; workspace: Workspace | null; loading: boolean; refreshing: boolean; error: string; receivedAt: number; now?: number
}) {
  return Boolean(token && workspace && !loading && !refreshing && !error && receivedAt > 0
    && now >= receivedAt && now - receivedAt <= MAX_SNAPSHOT_AGE_MS)
}

/** JSON types are not a contract check: reject a changed/misrouted workspace. */
export function validateTradeWorkspace(value: unknown, expectedPrincipal?: Principal | null): Workspace {
  if (!object(value) || !timestamp(value.server_time)
    || typeof value.synthetic !== 'boolean' || typeof value.production_ready !== 'boolean' || !Array.isArray(value.blockers)
    || value.blockers.some((item) => typeof item !== 'string')) {
    throw new Error('Trade workspace contract mismatch. Refresh or check the API configuration; actions are disabled.')
  }
  const principal = validateTradePrincipal(value.principal)
  if (expectedPrincipal && ['id', 'organisation_id', 'role'].some((key) => principal[key as keyof Principal] !== expectedPrincipal[key as keyof Principal])) {
    throw new Error('The trade workspace belongs to a different identity. Reconnect the intended actor; actions are disabled.')
  }
  for (const key of ['requirements', 'proposals', 'lots', 'capacities', 'auctions', 'contracts', 'shipments', 'receipts', 'claims', 'settlements', 'audit_events']) {
    if (!Array.isArray(value[key]) || (value[key] as unknown[]).some(row => !object(row) || !text(row.id)
      || !Number.isSafeInteger(row.version) || Number(row.version) < 1 || !timestamp(row.created_at) || !timestamp(row.updated_at))) {
      throw new Error(`Trade workspace is missing valid ${key} records. Actions are disabled.`)
    }
  }
  return value as unknown as Workspace
}
