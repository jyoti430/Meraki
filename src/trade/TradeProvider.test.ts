import { afterEach, describe, expect, it, vi } from 'vitest'
import { TradeSessionController } from './TradeProvider'
import { TradeApiError, setTradeToken } from './client'

const principal = (id = 'actor-a') => ({ id, organisation_id: 'org-' + id, display_name: 'Synthetic ' + id, role: 'fpo' })
const health = { status: 'ok', mode: 'synthetic_demo', synthetic: true, production_ready: false, blockers: [], server_time: '2026-11-16T10:00:00Z' }
const workspace = (id = 'actor-a') => ({ ...health, principal: principal(id), requirements: [], proposals: [], lots: [], capacities: [], auctions: [], contracts: [], shipments: [], receipts: [], claims: [], settlements: [], audit_events: [] })
const session = (id: string) => ({ token: 'token-' + id, principal: principal(id), synthetic: true })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fetchRoutes(handle?: (path: string, options: RequestInit) => Promise<Response> | Response | undefined) {
  const mock = vi.fn((url: string, options: RequestInit = {}) => {
    const path = url.split('/api/trade')[1]
    const custom = handle?.(path, options)
    if (custom) return Promise.resolve(custom)
    if (path === '/health') return Promise.resolve(json(health))
    const token = (options.headers as Record<string, string>)?.Authorization?.replace('Bearer token-', '') || 'actor-a'
    if (path === '/workspace') return Promise.resolve(json(workspace(token)))
    if (path === '/dev/sessions') return Promise.resolve(json(session(JSON.parse(String(options.body)).principal_id)))
    throw new Error('Unexpected API request: ' + path)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
async function connected() {
  const controller = new TradeSessionController('token-actor-a')
  await controller.refresh()
  expect(controller.canWrite()).toBe(true)
  return controller
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); setTradeToken('') })

describe('trade session round trips', () => {
  it('invalidates the old actor immediately and ignores an older login arriving last', async () => {
    const older = deferred<Response>()
    const newer = deferred<Response>()
    fetchRoutes((path, options) => path === '/dev/sessions' ? (JSON.parse(String(options.body)).principal_id === 'actor-b' ? older.promise : newer.promise) : undefined)
    const controller = await connected()
    const first = controller.connect('actor-b')
    expect(controller.canWrite()).toBe(false)
    expect(controller.getSnapshot()).toMatchObject({ token: '', workspace: null, loading: true })
    const second = controller.connect('actor-c')
    newer.resolve(json(session('actor-c')))
    await second
    older.resolve(json(session('actor-b')))
    await first
    expect(controller.getSnapshot().workspace?.principal.id).toBe('actor-c')
    expect(controller.canWrite()).toBe(true)
  })

  it('does not reconnect a login that completes after disconnect', async () => {
    const login = deferred<Response>()
    fetchRoutes((path) => path === '/dev/sessions' ? login.promise : undefined)
    const controller = await connected()
    const connect = controller.connect('actor-b')
    controller.disconnect()
    login.resolve(json(session('actor-b')))
    await connect
    expect(controller.getSnapshot()).toMatchObject({ token: '', workspace: null, loading: false })
    expect(controller.canWrite()).toBe(false)
  })

  it('keeps a reopened selection when a cancelled login fails late', async () => {
    const cancelled = deferred<Response>()
    fetchRoutes((path, options) => path === '/dev/sessions' && JSON.parse(String(options.body)).principal_id === 'actor-b' ? cancelled.promise : undefined)
    const controller = await connected()
    const earlier = controller.connect('actor-b')
    controller.disconnect()
    await controller.connect('actor-c')
    cancelled.reject(new TypeError('late cancelled response'))
    await earlier
    expect(controller.getSnapshot()).toMatchObject({ token: 'token-actor-c', error: '' })
    expect(controller.getSnapshot().workspace?.principal.id).toBe('actor-c')
    expect(controller.canWrite()).toBe(true)
  })

  it('ignores an old workspace response after an actor change', async () => {
    const stale = deferred<Response>()
    let hold = false
    const fetchMock = fetchRoutes((path, options) => path === '/workspace' && hold && (options.headers as Record<string, string>).Authorization === 'Bearer token-actor-a' ? stale.promise : undefined)
    const controller = await connected()
    hold = true
    const refresh = controller.refresh()
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/workspace'))).toHaveLength(2))
    await controller.connect('actor-b')
    stale.resolve(json(workspace('actor-a')))
    await refresh
    expect(controller.getSnapshot().workspace?.principal.id).toBe('actor-b')
    expect(controller.canWrite()).toBe(true)
  })

  it('rejects misrouted session and workspace identities', async () => {
    fetchRoutes((path) => path === '/dev/sessions' ? json(session('actor-b')) : undefined)
    const controller = new TradeSessionController('')
    await expect(controller.connect('actor-a')).rejects.toThrow('different identity')
    expect(controller.getSnapshot().token).toBe('')
    fetchRoutes((path) => path === '/workspace' ? json(workspace('actor-b')) : undefined)
    await expect(controller.connect('actor-a')).rejects.toThrow('different identity')
    expect(controller.canWrite()).toBe(false)
  })

  it('keeps stale records visible but blocks writes after a refresh failure', async () => {
    let fail = false
    fetchRoutes((path) => path === '/health' && fail ? Promise.reject(new TypeError('offline')) : undefined)
    const controller = await connected()
    fail = true
    await controller.refresh()
    expect(controller.getSnapshot().workspace?.principal.id).toBe('actor-a')
    expect(controller.getSnapshot().error).toContain('could not be reached')
    expect(controller.canWrite()).toBe(false)
    await expect(controller.command('/lots', {}, 'blocked')).rejects.toThrow('Refresh')
    fail = false
    await controller.refresh()
    expect(controller.canWrite()).toBe(true)
  })

  it('retains an authentication failure and removes the session on GET or POST 401', async () => {
    let expired = false
    fetchRoutes((path) => expired && (path === '/workspace' || path === '/lots') ? json({ detail: 'Session expired; reconnect' }, 401) : undefined)
    const controller = await connected()
    expired = true
    await controller.refresh()
    expect(controller.getSnapshot()).toMatchObject({ token: '', workspace: null, loading: false, refreshing: false, error: 'Session expired; reconnect' })
    expired = false
    await controller.connect('actor-a')
    expired = true
    await expect(controller.command('/lots', {}, 'expired-command')).rejects.toMatchObject({ status: 401, message: 'Session expired; reconnect' })
    expect(controller.getSnapshot()).toMatchObject({ token: '', workspace: null, error: 'Session expired; reconnect' })
  })

  it('does not report success when the POST saved but its refresh failed', async () => {
    let saved = false
    fetchRoutes((path) => {
      if (path === '/lots') { saved = true; return json({ id: 'lot-saved' }) }
      if (path === '/health' && saved) return Promise.reject(new TypeError('offline'))
    })
    const controller = await connected()
    await expect(controller.command('/lots', { quantity_g: 1000 }, 'saved-intent')).rejects.toMatchObject({ code: 'saved_refresh_failed', message: expect.stringContaining('action was saved') })
    expect(controller.canWrite()).toBe(false)
  })

  it('blocks overlapping actions and background refresh until a POST settles', async () => {
    const post = deferred<Response>()
    const fetchMock = fetchRoutes((path) => path === '/lots' ? post.promise : undefined)
    const controller = await connected()
    const pending = controller.command('/lots', {}, 'pending')
    const requests = fetchMock.mock.calls.length
    await controller.refresh()
    await expect(controller.command('/lots', {}, 'overlapping')).rejects.toThrow('Refresh')
    expect(fetchMock).toHaveBeenCalledTimes(requests)
    post.resolve(json({ id: 'saved' }))
    await pending
    expect(controller.canWrite()).toBe(true)
  })

  it('refreshes uncertain writes and retries only with the caller’s same key and actor', async () => {
    let attempts = 0
    const fetchMock = fetchRoutes((path) => path === '/lots' ? (++attempts === 1 ? Promise.reject(new TypeError('response lost after commit')) : json({ id: 'already-saved' })) : undefined)
    const controller = await connected()
    setTradeToken('unrelated-global-token')
    await expect(controller.command('/lots', { quantity_g: 1000 }, 'stable-intent')).rejects.toBeInstanceOf(TradeApiError)
    expect(controller.canWrite()).toBe(true)
    const result = await controller.command('/lots', { quantity_g: 1000 }, 'stable-intent')
    expect(result).toEqual({ id: 'already-saved' })
    const posts = fetchMock.mock.calls.filter(([url]) => url.endsWith('/lots'))
    expect(posts).toHaveLength(2)
    for (const [, options] of posts) expect(options).toMatchObject({ body: '{"quantity_g":1000}', headers: expect.objectContaining({ Authorization: 'Bearer token-actor-a', 'Idempotency-Key': 'stable-intent' }) })
  })

  it('preserves backend validation text after recovery', async () => {
    fetchRoutes((path) => path === '/lots' ? json({ detail: [{ loc: ['body', 'quantity_g'], msg: 'Must be a positive integer' }] }, 422) : undefined)
    const controller = await connected()
    await expect(controller.command('/lots', { quantity_g: 0 }, 'invalid')).rejects.toMatchObject({ status: 422, message: 'quantity_g: Must be a positive integer' })
    expect(controller.canWrite()).toBe(true)
  })

  it('does not replace the new actor when an earlier actor’s POST completes', async () => {
    const post = deferred<Response>()
    const fetchMock = fetchRoutes((path) => path === '/lots' ? post.promise : undefined)
    const controller = await connected()
    const pending = controller.command('/lots', {}, 'previous-actor').catch((error: unknown) => error)
    await controller.connect('actor-b')
    post.resolve(json({ id: 'saved-for-a' }))
    expect(await pending).toMatchObject({ message: expect.stringContaining('previous actor') })
    expect(controller.getSnapshot().workspace?.principal.id).toBe('actor-b')
    expect(controller.canWrite()).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/lots'))).toHaveLength(1)
  })
})
