import { expect, it } from 'vitest'
import { canWriteTrade, MAX_SNAPSHOT_AGE_MS, validateTradeHealth, validateTradeSession, validateTradeWorkspace } from './workflowGuards'
import type { Workspace } from './types'

const snapshot = { server_time: '2026-11-16T00:00:00Z', synthetic: true, production_ready: false, blockers: [],
  principal: { id: 'actor-a', organisation_id: 'org-a', role: 'fpo', display_name: 'Synthetic A' },
  requirements: [], proposals: [], lots: [], capacities: [], auctions: [], contracts: [], shipments: [], receipts: [], claims: [], settlements: [], audit_events: [] }

it('allows commands only after a successful, fresh, authenticated snapshot', () => {
  const state = { token: 'synthetic-token', workspace: snapshot as Workspace, loading: false, refreshing: false, error: '', receivedAt: 1000, now: 2000 }
  expect(canWriteTrade(state)).toBe(true)
  for (const patch of [{ token: '' }, { workspace: null }, { loading: true }, { refreshing: true }, { error: 'Disconnected' }, { receivedAt: 0 }, { now: 999 }, { now: 1001 + MAX_SNAPSHOT_AGE_MS }]) expect(canWriteTrade({ ...state, ...patch })).toBe(false)
})
it('rejects shared-API or malformed responses instead of treating them as trade state', () => {
  expect(validateTradeWorkspace(snapshot)).toEqual(snapshot)
  for (const malformed of [{ items: [] }, { ...snapshot, principal: null }, { ...snapshot, principal: { ...snapshot.principal, role: 'admin' } }, { ...snapshot, blockers: [null] }, { ...snapshot, lots: [{ quantity_g: 10 }] }, { ...snapshot, lots: [{ id: 'lot-unversioned' }] }, { ...snapshot, contracts: null }]) expect(() => validateTradeWorkspace(malformed)).toThrow()
})
it('binds workspace identity and validates session and health envelopes', () => {
  expect(validateTradeWorkspace(snapshot, snapshot.principal as Workspace['principal'])).toEqual(snapshot)
  expect(() => validateTradeWorkspace(snapshot, { ...snapshot.principal, id: 'other' } as Workspace['principal'])).toThrow('different identity')
  expect(() => validateTradeSession({ token: '', principal: snapshot.principal, synthetic: true }, 'actor-a')).toThrow('contract mismatch')
  expect(() => validateTradeSession({ token: 'token', principal: snapshot.principal, synthetic: true }, 'actor-b')).toThrow('different identity')
  expect(() => validateTradeHealth({ status: 'healthy', services: {} })).toThrow('contract mismatch')
})
