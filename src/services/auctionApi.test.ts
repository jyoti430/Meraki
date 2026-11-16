import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, auctionRequest, priceToPaise, validateAccount, validateAuction, validateAuctionCapabilities, validateAuctionList, validateBidReceipt, validateCapacityList } from './auctionApi'
import * as apiConfiguration from '../api/config'

const auction = { id: 'auction-a', title: 'Synthetic whole lot', mode: 'spot', status: 'open', crop: 'okra', variety: 'okra', grade: 'A', quantity_g: 1000,
  week_start: '2026-11-17', week_end: '2026-11-18', limit_price: 2000, increment: 100, opens_at: '2026-11-16T00:00:00Z', closes_at: '2026-11-16T12:00:00Z',
  server_time: '2026-11-16T10:00:00Z', leading_price: null, bid_count: 0, confirmation_hours: 24, own_capacity_id: null, is_owner: false, eligible: true,
  rule_version: 'auction-v1', extension_window_s: 120, extension_s: 120, extension_cap_s: 600,
  terms: { handover: 'Packhouse', acceptance: 'Synthetic protocol', payment: 'After receipt', cancellation: 'Recorded reason', evidence_reference: 'synthetic://lot', evidence_status: 'synthetic', fee_paise_per_kg: 0 }, award: null }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('auction API boundary', () => {
  it('converts decimal currency exactly and rejects ambiguous prices', () => {
    expect(priceToPaise('20.01')).toBe(2001)
    for (const price of ['-1', '2e3', '20.001', 'Infinity', '']) expect(() => priceToPaise(price)).toThrow()
  })
  it('sends the account scope and the same caller idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ receipt: 'r1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const account = { access_token: 'test-token', organisation_id: 'org-a', role: 'fpo' as const }
    await auctionRequest('/auctions', account, { title: 'Test' }, 'same-key')
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer test-token', 'X-Organisation-ID': 'org-a', 'Idempotency-Key': 'same-key' })
  })
  it('routes shared auction calls through the configured hosted backend root', async () => {
    const configured = vi.spyOn(apiConfiguration, 'apiUrl').mockImplementation((path) => 'https://render.example' + path)
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"items":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    await auctionRequest('/auctions?limit=200', null)
    expect(configured).toHaveBeenCalledWith('/api/v1/auctions?limit=200')
    expect(fetchMock.mock.calls[0][0]).toBe('https://render.example/api/v1/auctions?limit=200')
  })
  it('surfaces server failures instead of falling back to demo state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Insufficient capacity' } }), { status: 409 })))
    await expect(auctionRequest('/auctions', null, {})).rejects.toMatchObject({ status: 409, message: 'Insufficient capacity' })
    expect(new ApiError(401, 'Expired').status).toBe(401)
  })
  it('preserves both shared and FastAPI field validation errors', async () => {
    for (const body of [
      { error: { message: 'Request validation failed', details: [{ loc: ['body', 'terms', 'handover'], msg: 'String should have at least 3 characters' }] } },
      { detail: [{ loc: ['body', 'terms', 'handover'], msg: 'String should have at least 3 characters' }] },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 422 })))
      await expect(auctionRequest('/auctions', null, {})).rejects.toMatchObject({ status: 422, message: 'terms.handover: String should have at least 3 characters' })
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Password accounts are disabled' }), { status: 404 })))
    await expect(auctionRequest('/auth/login', null, {})).rejects.toThrow('Password accounts are disabled')
  })
  it('rejects SPA, malformed JSON and non-object successful envelopes', async () => {
    for (const body of ['<html>SPA fallback</html>', 'not JSON', 'null', '[]']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
      await expect(auctionRequest('/auctions', null)).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })
  it('normalizes interrupted response bodies and does not automatically repeat uncertain writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, text: async () => { throw new TypeError('connection lost after commit') } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(auctionRequest('/auctions', null, {}, 'stable-key')).rejects.toMatchObject({ status: 0, code: 'network_error', message: expect.stringContaining('may already be saved') })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('validates scoped account and capability responses before enabling controls', () => {
    expect(validateAccount({ access_token: 'token', organisation_id: 'org', role: 'fpo' })).toMatchObject({ role: 'fpo' })
    for (const value of [null, { access_token: true, organisation_id: 'org', role: 'fpo' }, { access_token: 'token', organisation_id: '', role: 'exporter' }, { access_token: 'token', organisation_id: 'org', role: 'admin' }]) expect(() => validateAccount(value)).toThrow()
    const disabled = { password_auth_enabled: false, registration_enabled: false, auction_mutations_enabled: false }
    expect(validateAuctionCapabilities(disabled)).toEqual(disabled)
    expect(() => validateAuctionCapabilities({ status: 'ok' })).toThrow('capabilities')
  })
  it('validates board, award and receipt structures instead of enabling actions on changed schemas', () => {
    expect(validateAuctionList({ items: [auction] })).toEqual([auction])
    for (const row of [{ ...auction, terms: null }, { ...auction, quantity_g: 0 }, { ...auction, award: { status: 'provisional' } }, { ...auction, server_time: 'unknown' }]) expect(() => validateAuction(row)).toThrow()
    expect(() => validateAuctionList({ results: [] })).toThrow('list')
    expect(validateBidReceipt({ receipt: { id: 'bid-a', accepted_at: auction.server_time }, auction }).receipt.id).toBe('bid-a')
    expect(() => validateBidReceipt({ receipt: { id: 'bid-a', accepted_at: 'invalid' }, auction })).toThrow('receipt')
  })
  it('rejects capacity totals that cannot back an offer', () => {
    const capacity = { id: 'capacity-a', source_type: 'projection', crop: 'okra', variety: 'okra', grade: 'A', week_start: '2026-11-17', week_end: '2026-11-18', quantity_g: 1000, reserved_g: 200, committed_g: 300, reviewed: true }
    expect(validateCapacityList({ items: [capacity] })).toEqual([capacity])
    expect(() => validateCapacityList({ items: [{ ...capacity, committed_g: 900 }] })).toThrow('capacity')
  })
})
