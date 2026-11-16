import { apiUrl } from '../api/config'

export class TradeApiError extends Error {
  constructor(message: string, public status = 0, public code = 'request_failed') { super(message); this.name = 'TradeApiError' }
}

type Options = { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal }
let accessToken = ''
export function setTradeToken(token: string) { accessToken = token }
export const API_BASE = apiUrl('/api/trade')

function errorMessage(data: unknown, fallback: string): { message: string; code: string } {
  if (!data || typeof data !== 'object') return { message: fallback, code: 'request_failed' }
  const record = data as Record<string, unknown>
  const detail = record.detail ?? record
  if (typeof detail === 'string') return { message: detail, code: String(record.code || 'request_failed') }
  if (Array.isArray(detail)) return { message: detail.map((item) => `${Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : 'Input'}: ${item.msg || 'Invalid value'}`).join('; '), code: 'validation_error' }
  if (detail && typeof detail === 'object') {
    const body = detail as Record<string, unknown>
    return { message: String(body.message || body.error || fallback), code: String(body.code || record.code || 'request_failed') }
  }
  return { message: fallback, code: 'request_failed' }
}

export async function apiRequest<T = unknown>(path: string, options: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET', credentials: 'include', signal: options.signal,
      headers: { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new TradeApiError('The trade service could not be reached. Check the connection, then retry the same action.', 0, 'network_error')
  }
  if (response.status === 204) return undefined as T
  const raw = await response.text()
  let data: unknown
  try { data = JSON.parse(raw) } catch {
    throw new TradeApiError(response.ok ? 'The trade service returned an invalid JSON response. Check the API configuration.' : `The trade service returned HTTP ${response.status}. Check the API and retry.`, response.status, 'invalid_response')
  }
  if (!response.ok) {
    const error = errorMessage(data, `Trade request failed (HTTP ${response.status}).`)
    throw new TradeApiError(error.message, response.status, error.code)
  }
  return data as T
}
