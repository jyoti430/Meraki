import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext, useAuth } from './context'
import { AccountSession } from './session'
import SignIn from './SignIn'
import './auth.css'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => {
    let storage: Storage | undefined
    try { storage = window.sessionStorage } catch { /* in-memory only */ }
    return new AccountSession(storage)
  })
  useEffect(() => { void session.restore() }, [session])
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
}
export function AccountGate({ children }: { children: ReactNode }) {
  const { account, checking, preview, session } = useAuth()
  if (checking) return <main className="auth-page"><p role="status">Checking your session…</p></main>
  if (!account && !preview) return <SignIn />
  return <><div className="auth-account"><span>{preview ? 'Demo preview' : 'Meraki'} · {(account?.role ?? preview) === 'fpo' ? 'FPO' : 'Exporter'}</span><button type="button" onClick={() => void session.signOut()}>{preview ? 'Back to sign in' : 'Sign out'}</button></div>{children}</>
}
