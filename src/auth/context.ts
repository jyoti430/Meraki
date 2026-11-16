import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AccountSession } from './session'

export const AuthContext = createContext<AccountSession | null>(null)
export function useAuth() {
  const session = useContext(AuthContext)
  if (!session) throw new Error('Account provider is required')
  return { ...useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), session }
}
