import { apiUrl } from '../api/config'
export type Account = { access_token: string; organisation_id: string; role: 'fpo' | 'exporter' }
export type Capacity = { id: string; source_type: string; crop: string; variety: string; grade: string; week_start: string; week_end: string; quantity_g: number; reserved_g: number; committed_g: number; reviewed: boolean }
export type Auction = {
  id: string; title: string; mode: 'spot' | 'forward'; status: string; crop: string; variety: string; grade: string;
  quantity_g: number; week_start: string; week_end: string; limit_price: number; increment: number;
  opens_at: string; closes_at: string; server_time: string; leading_price: number | null; bid_count: number;
  own_capacity_id: string | null; is_owner: boolean; eligible: boolean; rule_version: string; extension_window_s: number; extension_s: number; extension_cap_s: number;
  terms: { handover: string; acceptance: string; payment: string; cancellation: string; evidence_reference: string; evidence_status: string; fee_paise_per_kg: number };
  award: null | { status: string; buyer_confirmed: boolean; seller_confirmed: boolean; expires_at: string; your_side: 'buyer' | 'seller' }
}
export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }

export async function auctionRequest<T>(path: string, account: Account | null, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(apiUrl(`/api/v1${path}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(account ? { Authorization: `Bearer ${account.access_token}`, 'X-Organisation-ID': account.organisation_id } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new ApiError(response.status, typeof error?.error?.message === 'string' ? error.error.message : `Request failed (${response.status}). Retry after checking the API connection.`)
  }
  return response.status === 204 ? undefined as T : response.json()
}
export function priceToPaise(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive price with at most two decimal places.')
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result <= 0 || result > 10000000) throw new Error('Price must be between ₹0.01 and ₹100,000.')
  return result
}
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
