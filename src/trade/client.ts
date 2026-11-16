import { apiUrl } from '../api/config'

export class TradeApiError extends Error {
  constructor(message: string, public status = 0, public code = 'request_failed') { super(message); this.name = 'TradeApiError' }
}

type Options = { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal; token?: string }
let accessToken = ''
export function setTradeToken(token: string) { accessToken = token }
export const API_BASE = apiUrl('/api/trade')

function errorMessage(data: unknown, fallback: string): { message: string; code: string } {
  if (!data || typeof data !== 'object') return { message: fallback, code: 'request_failed' }
  const record = data as Record<string, unknown>
  const detail = record.detail ?? record
  if (typeof detail === 'string') return { message: detail, code: String(record.code || 'request_failed') }
  if (Array.isArray(detail)) return { message: detail.map((item: unknown) => {
    if (!item || typeof item !== 'object') return 'Input: Invalid value'
    const issue = item as Record<string, unknown>
    const location = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== 'body' && (typeof part === 'string' || typeof part === 'number')).join('.') : ''
    return `${location || 'Input'}: ${typeof issue.msg === 'string' ? issue.msg : 'Invalid value'}`
  }).join('; ') || fallback, code: 'validation_error' }
  if (detail && typeof detail === 'object') {
    const body = detail as Record<string, unknown>
    return { message: String(body.message || body.error || fallback), code: String(body.code || record.code || 'request_failed') }
  }
  return { message: fallback, code: 'request_failed' }
}

export async function apiRequest<T = unknown>(path: string, options: Options = {}): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#')) throw new TradeApiError('Invalid trade API path.', 0, 'invalid_request')
  const token = options.token ?? accessToken
  const method = (options.method || 'GET').toUpperCase()
  let body: string | undefined
  try { body = options.body === undefined ? undefined : JSON.stringify(options.body) } catch {
    throw new TradeApiError('This action contains values that cannot be sent as JSON.', 0, 'invalid_request')
  }
  let response: Response
  let raw: string
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include', signal: options.signal,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) },
      ...(body === undefined ? {} : { body }),
    })
    raw = response.status === 204 ? '' : await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new TradeApiError(method === 'GET' ? 'The trade service could not be reached. Check the connection and refresh.' : 'The trade response was interrupted. This action may already be saved; refresh, then retry the unchanged action with the same request key.', 0, 'network_error')
  }
  if (response.status === 204) return undefined as T
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
