import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, auctionRequest, priceToPaise } from './auctionApi'

afterEach(() => vi.unstubAllGlobals())
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
  it('surfaces server failures instead of falling back to demo state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Insufficient capacity' } }), { status: 409 })))
    await expect(auctionRequest('/auctions', null, {})).rejects.toMatchObject({ status: 409, message: 'Insufficient capacity' })
    expect(new ApiError(401, 'Expired').status).toBe(401)
  })
})
