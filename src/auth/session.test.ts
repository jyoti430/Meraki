import { describe, expect, it, vi } from 'vitest'
import { AccountSession, normalizeMobile, previewKey, sessionKey } from './session'
import type { Account } from '../services/auctionApi'

const account: Account = { access_token: 'test-token', organisation_id: 'demo-org', role: 'fpo' }
function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
function deferred() { let resolve!: (value: unknown) => void; return { promise: new Promise(resolvePromise => { resolve = resolvePromise }), resolve: (value: unknown) => resolve(value) } }

describe('entry account session', () => {
  it('requires a country code and normalizes formatted numbers', () => {
    expect(normalizeMobile('+1 (202) 555-0100')).toBe('+12025550100')
    for (const number of ['2025550100', '+01234567', '+12345', '+1234567890123456', '+12abc34567']) expect(() => normalizeMobile(number)).toThrow(/country code/)
  })
  it('does not trust a stored identity until the server confirms its organisation and role', async () => {
    const saved = storage(); saved.setItem(sessionKey, JSON.stringify(account))
    const response = deferred(); const session = new AccountSession(saved, () => response.promise)
    const restoring = session.restore()
    expect(session.getSnapshot()).toMatchObject({ account: null, checking: true })
    response.resolve({ user_id: 'demo-user', organisation_id: account.organisation_id, role: 'fpo' }); await restoring
    expect(session.getSnapshot()).toMatchObject({ account, checking: false })
  })
  it('rejects changed membership and clears a separate trade identity', async () => {
    const saved = storage(); saved.setItem(sessionKey, JSON.stringify(account)); saved.setItem('meraki.trade.development-session.v1', 'stale-trade-token')
    const session = new AccountSession(saved, async () => ({ user_id: 'demo-user', organisation_id: 'wrong-org', role: 'exporter' }))
    await session.restore()
    expect(session.getSnapshot().account).toBeNull()
    expect(saved.getItem(sessionKey)).toBeNull()
    expect(saved.getItem('meraki.trade.development-session.v1')).toBeNull()
  })
  it('sends mobile credentials without altering password whitespace', async () => {
    const request = vi.fn(async () => account); const saved = storage(); const session = new AccountSession(saved, request)
    await session.connect(false, { mobile_number: '+1 202-555-0100', password: '  preserved password  ' }, 'fpo')
    expect(request).toHaveBeenCalledWith('/auth/login', null, { mobile_number: '+12025550100', password: '  preserved password  ' })
    expect(JSON.parse(saved.getItem(sessionKey)!)).toEqual(account)
  })
  it('keeps an exporter login out of an FPO session and revokes the mismatched token', async () => {
    const exporter = { ...account, role: 'exporter' }; const request = vi.fn(async () => exporter)
    const session = new AccountSession(storage(), request)
    await expect(session.connect(false, { mobile_number: '+12025550100', password: 'demo-password' }, 'fpo')).rejects.toThrow(/exporter account/)
    expect(session.getSnapshot().account).toBeNull()
    expect(request).toHaveBeenLastCalledWith('/auth/logout', exporter, {})
  })
  it('a late login cannot restore a signed out account', async () => {
    const response = deferred(); const session = new AccountSession(storage(), () => response.promise)
    const connecting = session.connect(false, { mobile_number: '+12025550100', password: 'demo-password' })
    await session.signOut(); response.resolve(account); await connecting
    expect(session.getSnapshot().account).toBeNull()
  })
  it('a late restore cannot replace the chosen demo identity', async () => {
    const saved = storage(); saved.setItem(sessionKey, JSON.stringify(account))
    const response = deferred(); const session = new AccountSession(saved, () => response.promise)
    const restoring = session.restore(); session.enterDemo('exporter')
    response.resolve({ user_id: 'demo-user', organisation_id: account.organisation_id, role: 'fpo' }); await restoring
    expect(session.getSnapshot()).toMatchObject({ account: null, preview: 'exporter', checking: false })
    expect(saved.getItem(sessionKey)).toBeNull()
  })
  it('clears local access even when remote revocation fails', async () => {
    const saved = storage(); const request = vi.fn(async (path: string) => { if (path === '/auth/logout') throw new Error('offline'); return account })
    const session = new AccountSession(saved, request)
    await session.connect(false, { mobile_number: '+12025550100', password: 'demo-password' }); await session.signOut()
    expect(session.getSnapshot()).toMatchObject({ account: null, preview: null })
    expect(session.getSnapshot().error).toContain('could not confirm')
    expect(saved.getItem(sessionKey)).toBeNull()
  })
  it('supports private browsing without persistent storage', async () => {
    const session = new AccountSession(undefined, async () => account)
    await session.restore(); await session.connect(true, { mobile_number: '+12025550100', password: 'demo-password', role: 'fpo' })
    expect(session.getSnapshot().account).toEqual(account)
  })
  it('keeps an explicit demo preview across a reload without contacting the server', async () => {
    const saved = storage(); const request = vi.fn()
    new AccountSession(saved, request).enterDemo('fpo')
    const reloaded = new AccountSession(saved, request)
    await reloaded.restore()
    expect(reloaded.getSnapshot()).toMatchObject({ preview: 'fpo', account: null, checking: false })
    expect(request).not.toHaveBeenCalled()
  })
  it('clears the demo preview on sign-out and when a real account signs in', async () => {
    const saved = storage()
    const session = new AccountSession(saved, async () => ({ access_token: 'test-token', organisation_id: 'demo-org', role: 'fpo' }))
    session.enterDemo('exporter'); await session.signOut()
    expect(saved.getItem(previewKey)).toBeNull()
    session.enterDemo('fpo')
    await session.connect(false, { mobile_number: '+12025550100', password: 'demo-password' }, 'fpo')
    expect(saved.getItem(previewKey)).toBeNull()
    expect(session.getSnapshot()).toMatchObject({ preview: null, account: { role: 'fpo' } })
  })
  it('ignores an unknown stored preview value', async () => {
    const saved = storage(); saved.setItem(previewKey, 'admin')
    const session = new AccountSession(saved, vi.fn())
    await session.restore()
    expect(session.getSnapshot()).toMatchObject({ preview: null, account: null, checking: false })
  })
})
