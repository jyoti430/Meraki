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
  it('handles malformed validation details without hiding the HTTP rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [null, 'bad', { loc: ['body', 'rows', 0, 'quantity_g'], msg: 'Invalid integer' }] }), { status: 422 })))
    await expect(apiRequest('/lots')).rejects.toMatchObject({ status: 422, code: 'validation_error', message: 'Input: Invalid value; Input: Invalid value; rows.0.quantity_g: Invalid integer' })
  })
  it('normalizes interrupted response bodies and preserves aborts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, text: async () => { throw new TypeError('body interrupted') } }))
    await expect(apiRequest('/lots', { method: 'POST', body: {}, idempotencyKey: 'same-intent' })).rejects.toMatchObject({ code: 'network_error', message: expect.stringContaining('may already be saved') })
    const aborted = new DOMException('Cancelled', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))
    await expect(apiRequest('/workspace')).rejects.toBe(aborted)
  })
  it('rejects unserializable input before sending or claiming a network failure', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiRequest('/lots', { method: 'POST', body: { weight: BigInt(1) } })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('supports a captured token and an explicit public request without global-auth leakage', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}')))
    vi.stubGlobal('fetch', fetchMock)
    setTradeToken('global-actor')
    await apiRequest('/workspace', { token: 'captured-actor' })
    await apiRequest('/health', { token: '' })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer captured-actor')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined()
  })
})
