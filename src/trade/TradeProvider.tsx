import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { apiRequest, TradeApiError } from './client'
import type { Health, Principal, Workspace } from './types'
import { canWriteTrade, validateTradeHealth, validateTradePrincipal, validateTradeSession, validateTradeWorkspace } from './workflowGuards'

const SESSION_KEY = 'meraki.trade.development-session.v1'
const readSession = () => { try { return sessionStorage.getItem(SESSION_KEY) || '' } catch { return '' } }
const persistSession = (token: string) => {
  try { if (token) sessionStorage.setItem(SESSION_KEY, token); else sessionStorage.removeItem(SESSION_KEY) } catch { /* optional identity storage, never ledger state */ }
}
type TradeSnapshot = {
  token: string; workspace: Workspace | null; health: Health | null; loading: boolean; refreshing: boolean; error: string; receivedAt: number
}
type TradeContextValue = {
  workspace: Workspace | null; health: Health | null; loading: boolean; refreshing: boolean; error: string; session: boolean
  writesEnabled: boolean
  refresh: () => Promise<void>; connect: (principalId: string) => Promise<void>; disconnect: () => void
  principals: () => Promise<Principal[]>; command: <T = unknown>(path: string, body: unknown, key: string) => Promise<T>
}
const TradeContext = createContext<TradeContextValue | null>(null)

/** Owns asynchronous session state so no old actor or response can enable writes. */
export class TradeSessionController {
  private state: TradeSnapshot
  private listeners = new Set<() => void>()
  private generation = 0
  private identity = 0
  private expectedPrincipal: Principal | null = null
  private submitting = false

  constructor(token = readSession()) {
    this.state = { token, workspace: null, health: null, loading: true, refreshing: false, error: '', receivedAt: 0 }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<TradeSnapshot>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  canWrite = () => !this.submitting && canWriteTrade(this.state)
  private clearSession(error = '') {
    this.generation += 1
    this.identity += 1
    this.expectedPrincipal = null
    this.submitting = false
    persistSession('')
    this.update({ token: '', workspace: null, loading: false, refreshing: false, error, receivedAt: 0 })
  }
  disconnect = () => { this.clearSession() }

  refresh = async () => {
    // A periodic GET must not re-enable actions while a POST is unresolved.
    if (this.submitting) return
    const request = ++this.generation
    const token = this.state.token
    this.update({ refreshing: true, receivedAt: 0 })
    try {
      const health = validateTradeHealth(await apiRequest<unknown>('/health', { token: '' }))
      if (request !== this.generation) return
      this.update({ health })
      const workspace = token ? validateTradeWorkspace(await apiRequest<unknown>('/workspace', { token }), this.expectedPrincipal) : null
      if (request !== this.generation) return
      if (workspace) this.expectedPrincipal = workspace.principal
      this.update({ workspace, error: '', receivedAt: workspace ? Date.now() : 0 })
    } catch (cause) {
      if (request !== this.generation) return
      const error = cause instanceof Error ? cause.message : 'Could not refresh the trade workspace.'
      if (cause instanceof TradeApiError && cause.status === 401) this.clearSession(error)
      else this.update({ error })
    } finally {
      if (request === this.generation) this.update({ refreshing: false, loading: false })
    }
  }

  connect = async (principalId: string) => {
    // Invalidate the old actor at selection time, before the session request.
    this.clearSession()
    const identity = this.identity
    this.update({ loading: true })
    try {
      const response = await apiRequest<unknown>('/dev/sessions', { method: 'POST', body: { principal_id: principalId }, token: '' })
      if (identity !== this.identity) return
      const result = validateTradeSession(response, principalId)
      this.expectedPrincipal = result.principal
      persistSession(result.token)
      this.update({ token: result.token })
      await this.refresh()
      if (identity !== this.identity) return
      if (!this.canWrite()) throw new Error(this.state.error || 'Refresh the selected workspace before submitting actions.')
    } catch (cause) {
      if (identity !== this.identity) return
      this.update({ loading: false, error: cause instanceof Error ? cause.message : 'Could not connect to the trade workspace.' })
      throw cause
    }
  }

  principals = async () => {
    const result = await apiRequest<unknown>('/dev/principals', { token: '' })
    if (!result || typeof result !== 'object' || !('principals' in result) || !Array.isArray(result.principals)) throw new Error('Trade identities contract mismatch. Check the API configuration.')
    return result.principals.map(validateTradePrincipal)
  }

  command = async <T,>(path: string, body: unknown, key: string): Promise<T> => {
    if (!this.canWrite()) throw new Error('Refresh this organisation’s trade workspace successfully before submitting an action.')
    const identity = this.identity
    const token = this.state.token
    this.submitting = true
    this.generation += 1
    this.update({ receivedAt: 0 })
    let result: T
    try {
      result = await apiRequest<T>(path, { method: 'POST', body, idempotencyKey: key, token })
    } catch (cause) {
      if (identity !== this.identity) throw new Error('The session changed while this action was submitted. Its outcome may be saved for the previous actor; reconnect that actor and refresh before retrying.')
      this.submitting = false
      if (cause instanceof TradeApiError && cause.status === 401) this.clearSession(cause.message)
      else await this.refresh()
      // Preserve the actual backend validation/conflict if recovery also fails.
      throw cause
    }
    if (identity !== this.identity) throw new Error('The session changed while this action was submitted. Its outcome may be saved for the previous actor; reconnect that actor and refresh before retrying.')
    this.submitting = false
    await this.refresh()
    if (identity !== this.identity) throw new Error('The session changed while refreshing the saved action. Reconnect the previous actor to inspect its recorded outcome.')
    if (!this.canWrite()) throw new TradeApiError('The action was saved, but the workspace could not be refreshed. Refresh before continuing; retry only the unchanged action with the same request key. ' + this.state.error, 0, 'saved_refresh_failed')
    return result
  }
}

export function TradeProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new TradeSessionController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => { void controller.refresh() }, [controller])
  useEffect(() => {
    if (!state.token) return
    const timer = window.setInterval(() => {
      const snapshot = controller.getSnapshot()
      if (document.visibilityState === 'visible' && !snapshot.loading && !snapshot.refreshing) void controller.refresh()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [controller, state.token])
  return <TradeContext.Provider value={{ ...state, session: Boolean(state.token), writesEnabled: controller.canWrite(), refresh: controller.refresh, connect: controller.connect, disconnect: controller.disconnect, principals: controller.principals, command: controller.command }}>{children}</TradeContext.Provider>
}

export function useTrade() {
  const value = useContext(TradeContext)
  if (!value) throw new Error('Trade pages require TradeProvider.')
  return value
}
