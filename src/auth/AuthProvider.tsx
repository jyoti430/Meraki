import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { demoHome, previewRoleForPath, workspaceForPath, workspaceLabel, type Role } from './workspace'
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
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Keep the demo role in step with the workspace being explored, so labels and
  // marketplace views match. Signed-in accounts keep their server-confirmed role.
  useEffect(() => {
    if (preview) { const role = previewRoleForPath(pathname, preview); if (role !== preview) session.enterDemo(role) }
  }, [pathname, preview, session])
  if (checking) return <main className="auth-page"><p role="status">Checking your session…</p></main>
  if (!account && !preview) return <SignIn />
  const role = (account?.role ?? preview) as Role
  const other: Role = role === 'fpo' ? 'exporter' : 'fpo'
  return <><div className="auth-account" role="region" aria-label="Session">
    <span className="auth-account-context">{preview ? <><span className="auth-account-pill">Demo</span>{workspaceLabel(workspaceForPath(pathname), role)} · sample data</> : <>Signed in · {role === 'fpo' ? 'FPO' : 'Exporter'} account</>}</span>
    {preview && <button type="button" onClick={() => { session.enterDemo(other); navigate(demoHome(other)) }}>Switch to {other === 'fpo' ? 'FPO' : 'exporter'} demo</button>}
    <button type="button" onClick={() => void session.signOut()}>{preview ? 'Sign in' : 'Sign out'}</button>
  </div>{children}</>
}
