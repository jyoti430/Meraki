import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { demoHome, previewRoleForPath, workspaceForPath, type Role } from './workspace'
import type { ReactNode } from 'react'
import { AuthContext, useAuth } from './context'
import { AccountSession } from './session'
import SignIn from './SignIn'
import './auth.css'
import { useI18n, type TKey } from '../i18n'

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
  const { t } = useI18n()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  // Keep the demo role in step with the workspace being explored, so labels and
  // marketplace views match. Signed-in accounts keep their server-confirmed role.
  useEffect(() => {
    if (preview) { const role = previewRoleForPath(pathname, preview); if (role !== preview) session.enterDemo(role) }
  }, [pathname, preview, session])
  if (checking) return <main className="auth-page"><p role="status">{t('auth_checking_session')}</p></main>
  if (!account && !preview) return <SignIn />
  const role = (account?.role ?? preview) as Role
  const other: Role = role === 'fpo' ? 'exporter' : 'fpo'
  const workspace = workspaceForPath(pathname)
  const workspaceKey: TKey = workspace === 'market'
    ? role === 'fpo' ? 'session_market_fpo' : 'session_market_exporter'
    : role === 'fpo' ? 'session_fpo_workspace' : 'session_exporter_workspace'
  return <><div className="auth-account" role="region" aria-label={t('session_region')}>
    <span className="auth-account-context">{preview ? <><span className="auth-account-pill">{t('session_demo')}</span>{t(workspaceKey)} · {t('session_sample_data')}</> : <>{t('session_signed_in')} · {role === 'fpo' ? t('auth_fpo') : t('auth_exporter')} {t('session_account')}</>}</span>
    {preview && <button type="button" onClick={() => { session.enterDemo(other); navigate(demoHome(other)) }}>{t(other === 'fpo' ? 'session_switch_fpo' : 'session_switch_exporter')}</button>}
    <button type="button" onClick={() => void session.signOut()}>{preview ? t('session_sign_in') : t('session_sign_out')}</button>
  </div>{children}</>
}
