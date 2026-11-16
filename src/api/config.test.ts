import { describe, expect, it } from 'vitest'
import { resolveApiUrl } from './config'

describe('hosted API routing', () => {
  it('routes trade, public data and sensor calls to the same configured backend', () => {
    for (const path of ['/api/trade/workspace', '/api/live-data/snapshot?location=pune', '/api/sensors', '/api/sensors/serial']) {
      expect(resolveApiUrl(path, { backend: 'https://meraki.example/' }, 'https:')).toBe(`https://meraki.example${path}`)
    }
  })
  it('retains same-origin local proxies and explicit per-service gateways', () => {
    expect(resolveApiUrl('/api/trade/requirements')).toBe('/api/trade/requirements')
    expect(resolveApiUrl('/api/sensors/serial', { backend: 'https://cloud.example', sensors: 'https://local-gateway.example/api/sensors' })).toBe('https://local-gateway.example/api/sensors/serial')
    expect(resolveApiUrl('/api/trade/workspace', { trade: '/proxy/trade/' })).toBe('/proxy/trade/workspace')
  })
  it('rejects unsafe or malformed routing instead of using mock or localhost fallback', () => {
    for (const backend of ['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com?token=secret', '//elsewhere.example']) {
      expect(() => resolveApiUrl('/api/trade/workspace', { backend })).toThrow()
    }
    expect(() => resolveApiUrl('/api/sensors', { sensors: 'http://127.0.0.1:8001/api/sensors' }, 'https:')).toThrow(/HTTPS/)
    expect(() => resolveApiUrl('https://elsewhere.example/api/trade')).toThrow()
  })
})
