import { describe, expect, it } from 'vitest'
import { fetchLiveSnapshot, parseLiveSnapshot } from './client'

const envelope = (source: string) => ({
  source_id: source, source_name: source, source_url: 'https://example.org', documentation_url: 'https://example.org/docs',
  attribution: source, licence: 'See provider terms', status: 'ok', synthetic: false, location: null,
  retrieved_at: '2026-11-16T00:00:00Z', available_at: '2026-11-16T00:00:00Z', provider_issued_at: null,
  observation_start: '2026-11-16', observation_end: '2026-11-16', cache: { hit: false, ttl_seconds: 900, expires_at: '2026-11-16T00:15:00Z' },
  warnings: [], error: null, units: { temperature: '°C' }, data: [],
})
const fixture = () => ({ server_time: '2026-11-16T00:00:00Z', forecast: envelope('open-meteo'), history: envelope('nasa-power'), market: envelope('msamb') })

describe('public data response boundary', () => {
  it('keeps a failed source separate from successful sources and retains unknown issue time', () => {
    const input = fixture()
    input.forecast.provider_issued_at = null
    input.market = { ...input.market, status: 'error', error: { code: 'upstream', message: 'Unavailable' } } as never
    const parsed = parseLiveSnapshot(input)
    expect(parsed.forecast.provider_issued_at).toBeNull()
    expect(parsed.market.status).toBe('error')
    expect(parsed.history.status).toBe('ok')
  })

  it('rejects a synthetic response instead of displaying it as live', () => {
    const input = fixture()
    input.forecast.synthetic = true
    expect(() => parseLiveSnapshot(input)).toThrow(/synthetic/i)
  })

  it('preserves a missing weather measurement as null and rejects nonfinite numbers', () => {
    const input = fixture()
    input.forecast.data = [{ date: '2026-11-16', t2m_min_c: null, t2m_max_c: 30, precipitation_mm_day: 0, et0_mm_day: 3 }] as never
    expect(parseLiveSnapshot(input).forecast.data[0].t2m_min_c).toBeNull()
    input.forecast.data = [{ date: '2026-11-16', t2m_min_c: NaN, t2m_max_c: 30, precipitation_mm_day: 0 }] as never
    expect(() => parseLiveSnapshot(input)).toThrow(/measurement/i)
  })

  it('does not turn an HTTP failure or malformed JSON into an empty successful snapshot', async () => {
    await expect(fetchLiveSnapshot('nashik', 'tomato', undefined, async () => new Response('not available', { status: 503 }))).rejects.toThrow(/503/)
    await expect(fetchLiveSnapshot('nashik', 'tomato', undefined, async () => new Response('not JSON'))).rejects.toThrow(/JSON/)
  })

  it('sends only allowlisted public reference locations and crop names', async () => {
    let requested = ''
    await fetchLiveSnapshot('pune', 'green_chilli', undefined, async (url) => { requested = String(url); return Response.json(fixture()) })
    expect(requested).toBe('/api/live-data/snapshot?location=pune&crop=green_chilli')
    await expect(fetchLiveSnapshot('private-farm' as never, 'tomato')).rejects.toThrow(/reference location/i)
  })
})
