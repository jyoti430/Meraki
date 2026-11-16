import { apiUrl } from '../api/config'
export type Account = { access_token: string; organisation_id: string; role: 'fpo' | 'exporter' }
export type AuctionCapabilities = { password_auth_enabled: boolean; registration_enabled: boolean; auction_mutations_enabled: boolean }
export type Capacity = { id: string; source_type: string; crop: string; variety: string; grade: string; week_start: string; week_end: string; quantity_g: number; reserved_g: number; committed_g: number; reviewed: boolean }
export type Auction = {
  id: string; title: string; mode: 'spot' | 'forward'; status: string; crop: string; variety: string; grade: string;
  quantity_g: number; week_start: string; week_end: string; limit_price: number; increment: number;
  opens_at: string; closes_at: string; server_time: string; leading_price: number | null; bid_count: number; confirmation_hours: number;
  own_capacity_id: string | null; is_owner: boolean; eligible: boolean; rule_version: string; extension_window_s: number; extension_s: number; extension_cap_s: number;
  terms: { handover: string; acceptance: string; payment: string; cancellation: string; evidence_reference: string; evidence_status: string; fee_paise_per_kg: number };
  award: null | { status: string; buyer_confirmed: boolean; seller_confirmed: boolean; expires_at: string; your_side: 'buyer' | 'seller' }
}
export class ApiError extends Error { constructor(public status: number, message: string, public code = 'request_failed') { super(message); this.name = 'AuctionApiError' } }

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, minimum = 0) => Number.isSafeInteger(value) && Number(value) >= minimum
const timestamp = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const mismatch = (resource: string): never => { throw new ApiError(0, `The shared auction API returned invalid ${resource}. Check the API configuration and refresh; actions are paused.`, 'invalid_response') }
export function validateAccount(value: unknown): Account {
  if (!object(value) || !text(value.access_token) || !text(value.organisation_id) || !['fpo', 'exporter'].includes(String(value.role))) return mismatch('account details')
  return value as Account
}
export function validateAuctionCapabilities(value: unknown): AuctionCapabilities {
  if (!object(value) || ['password_auth_enabled', 'registration_enabled', 'auction_mutations_enabled'].some((key) => typeof value[key] !== 'boolean')) return mismatch('service capabilities')
  return value as AuctionCapabilities
}
export function validateAuction(value: unknown): Auction {
  if (!object(value) || ['id', 'title', 'status', 'crop', 'variety', 'grade', 'week_start', 'week_end', 'rule_version'].some((key) => !text(value[key]))
    || !['spot', 'forward'].includes(String(value.mode)) || ['quantity_g', 'limit_price', 'increment', 'confirmation_hours'].some((key) => !integer(value[key], 1))
    || ['bid_count', 'extension_window_s', 'extension_s', 'extension_cap_s'].some((key) => !integer(value[key]))
    || ['opens_at', 'closes_at', 'server_time'].some((key) => !timestamp(value[key]))
    || ['is_owner', 'eligible'].some((key) => typeof value[key] !== 'boolean')
    || !(value.leading_price === null || integer(value.leading_price, 1)) || !(value.own_capacity_id === null || text(value.own_capacity_id))
    || !object(value.terms) || ['handover', 'acceptance', 'payment', 'cancellation', 'evidence_reference'].some((key) => !text((value.terms as Record<string, unknown>)[key]))
    || !['synthetic', 'reviewed'].includes(String(value.terms.evidence_status)) || !integer(value.terms.fee_paise_per_kg)) return mismatch('auction records')
  if (value.award !== null && (!object(value.award) || !text(value.award.status) || !['buyer', 'seller'].includes(String(value.award.your_side))
    || !timestamp(value.award.expires_at) || typeof value.award.buyer_confirmed !== 'boolean' || typeof value.award.seller_confirmed !== 'boolean')) return mismatch('award records')
  return value as Auction
}
export function validateAuctionList(value: unknown): Auction[] {
  if (!object(value) || !Array.isArray(value.items)) return mismatch('auction list')
  return value.items.map(validateAuction)
}
export function validateBidReceipt(value: unknown): { receipt: { id: string; accepted_at: string }; auction: Auction } {
  if (!object(value) || !object(value.receipt) || !text(value.receipt.id) || !timestamp(value.receipt.accepted_at)) return mismatch('bid receipt')
  return { receipt: { id: value.receipt.id, accepted_at: String(value.receipt.accepted_at) }, auction: validateAuction(value.auction) }
}
export function validateCapacityList(value: unknown): Capacity[] {
  if (!object(value) || !Array.isArray(value.items)) return mismatch('capacity list')
  return value.items.map((row) => {
    if (!object(row) || ['id', 'source_type', 'crop', 'variety', 'grade', 'week_start', 'week_end'].some((key) => !text(row[key]))
      || !integer(row.quantity_g, 1) || !integer(row.reserved_g) || !integer(row.committed_g) || Number(row.reserved_g) + Number(row.committed_g) > Number(row.quantity_g)
      || typeof row.reviewed !== 'boolean') return mismatch('capacity records')
    return row as Capacity
  })
}

function errorMessage(value: unknown, status: number) {
  if (!object(value)) return `Auction request failed (HTTP ${status}).`
  const error = object(value.error) ? value.error : value
  const details = Array.isArray(error.details) ? error.details : Array.isArray(value.detail) ? value.detail : null
  if (details) return details.map((item) => {
    if (!object(item)) return 'Input: Invalid value'
    const location = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body' && (typeof part === 'string' || typeof part === 'number')).join('.') : ''
    return `${location || 'Input'}: ${typeof item.msg === 'string' ? item.msg : 'Invalid value'}`
  }).join('; ') || `Auction request failed (HTTP ${status}).`
  return typeof error.message === 'string' ? error.message : typeof value.detail === 'string' ? value.detail : `Auction request failed (HTTP ${status}).`
}

export async function auctionRequest<T>(path: string, account: Account | null, body?: unknown, key?: string): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new ApiError(0, 'Invalid shared auction API path.', 'invalid_request')
  let payload: string | undefined
  try { payload = body === undefined ? undefined : JSON.stringify(body) } catch { throw new ApiError(0, 'This action cannot be sent as JSON.', 'invalid_request') }
  let response: Response
  let raw: string
  try { response = await fetch(apiUrl(`/api/v1${path}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(account ? { Authorization: `Bearer ${account.access_token}`, 'X-Organisation-ID': account.organisation_id } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: payload }), signal: AbortSignal.timeout(45000),
  }); raw = response.status === 204 ? '' : await response.text() } catch {
    throw new ApiError(0, body === undefined ? 'Could not reach the auction API. Check the connection and refresh.' : 'The auction response was interrupted. This action may already be saved; refresh, then retry the unchanged action with the same request key.', 'network_error')
  }
  if (response.status === 204) return undefined as T
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new ApiError(response.status, `The auction service returned invalid JSON (HTTP ${response.status}). Check the API configuration.`, 'invalid_response') }
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(data, response.status))
  }
  if (!object(data)) return mismatch('response envelope')
  return data as T
}
export function priceToPaise(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive price with at most two decimal places.')
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result <= 0 || result > 10000000) throw new Error('Price must be between ₹0.01 and ₹100,000.')
  return result
}
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
