import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest, setTradeToken, TradeApiError } from './client'

afterEach(() => { vi.unstubAllGlobals(); setTradeToken('') })

describe('trade API boundary', () => {
  it('shows FastAPI validation field errors with their location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ loc: ['body', 'quantity_g'], msg: 'Input should be greater than 0' }] }), { status: 422 })))
    await expect(apiRequest('/lots')).rejects.toThrow('quantity_g: Input should be greater than 0')
    vi.unstubAllGlobals()
  })
  it('preserves status/code and refuses successful non-JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'stale_version', message: 'Refresh this contract' } }), { status: 409 })))
    const request = apiRequest('/contracts')
    await expect(request).rejects.toBeInstanceOf(TradeApiError)
    await expect(request).rejects.toMatchObject({ status: 409, code: 'stale_version', message: 'Refresh this contract' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Vite fallback</html>', { status: 200 })))
    await expect(apiRequest('/workspace')).rejects.toThrow('JSON')
    vi.unstubAllGlobals()
  })
  it('sends credentials and a retry-stable idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'bid-1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    setTradeToken('synthetic-test-token')
    await apiRequest('/auctions/a/bids', { method: 'POST', body: { price_paise: 5000 }, idempotencyKey: 'intent-1' })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: expect.objectContaining({ 'Idempotency-Key': 'intent-1', Authorization: 'Bearer synthetic-test-token' }) })
    vi.unstubAllGlobals()
  })
})
