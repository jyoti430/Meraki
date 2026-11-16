import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { apiRequest, setTradeToken, TradeApiError } from './client'
import type { Health, Principal, Workspace } from './types'

const SESSION_KEY = 'meraki.trade.development-session.v1'
const readSession = () => { try { return sessionStorage.getItem(SESSION_KEY) || '' } catch { return '' } }
type TradeContextValue = {
  workspace: Workspace | null; health: Health | null; loading: boolean; refreshing: boolean; error: string; session: boolean
  refresh: () => Promise<void>; connect: (principalId: string) => Promise<void>; disconnect: () => void
  principals: () => Promise<Principal[]>; command: <T = unknown>(path: string, body: unknown, key: string) => Promise<T>
}
const TradeContext = createContext<TradeContextValue | null>(null)

export function TradeProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(readSession)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const currentToken = useRef(token)
  currentToken.current = token

  const disconnect = useCallback(() => {
    generation.current += 1
    currentToken.current = ''
    setTradeToken(''); setToken(''); setWorkspace(null); setError('')
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* in-memory session remains supported */ }
  }, [])

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setRefreshing(true)
    try {
      setTradeToken(currentToken.current)
      const service = await apiRequest<Health>('/health')
      if (request !== generation.current) return
      setHealth(service)
      if (currentToken.current) {
        const data = await apiRequest<Workspace>('/workspace')
        if (request !== generation.current) return
        setWorkspace(data)
      }
      setError('')
    } catch (cause) {
      if (request !== generation.current) return
      if (cause instanceof TradeApiError && cause.status === 401) {
        setToken(''); currentToken.current = ''; setTradeToken(''); setWorkspace(null)
        try { sessionStorage.removeItem(SESSION_KEY) } catch { /* optional storage */ }
      }
      setError(cause instanceof Error ? cause.message : 'Could not refresh the trade workspace.')
    } finally {
      if (request === generation.current) { setRefreshing(false); setLoading(false) }
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh, token])
  useEffect(() => {
    if (!token) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 20_000)
    return () => window.clearInterval(timer)
  }, [token, refresh])

  const connect = async (principalId: string) => {
    const result = await apiRequest<{ token: string; principal: Principal; synthetic: boolean }>('/dev/sessions', { method: 'POST', body: { principal_id: principalId } })
    generation.current += 1
    setWorkspace(null); setTradeToken(result.token); currentToken.current = result.token; setToken(result.token); setLoading(true)
    try { sessionStorage.setItem(SESSION_KEY, result.token) } catch { /* optional identity storage, never ledger state */ }
  }
  const principals = async () => (await apiRequest<{ principals: Principal[] }>('/dev/principals')).principals
  const command = async <T,>(path: string, body: unknown, key: string) => {
    const result = await apiRequest<T>(path, { method: 'POST', body, idempotencyKey: key })
    await refresh()
    return result
  }

  return <TradeContext.Provider value={{ workspace, health, loading, refreshing, error, session: Boolean(token), refresh, connect, disconnect, principals, command }}>{children}</TradeContext.Provider>
}

export function useTrade() {
  const value = useContext(TradeContext)
  if (!value) throw new Error('Trade pages require TradeProvider.')
  return value
}
