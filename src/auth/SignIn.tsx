import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MerakiMark } from '../components/ui'
import { auctionRequest, validateAuctionCapabilities } from '../services/auctionApi'
import type { AuctionCapabilities } from '../services/auctionApi'
import { useAuth } from './context'
import { demoHome, type Role } from './workspace'
import { ArrowRight, Building2, Sprout } from 'lucide-react'
import { useI18n, type TKey } from '../i18n'
import LanguageSelector from '../i18n/LanguageSelector'

export default function SignIn() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useI18n()
  const [role, setRole] = useState<'fpo' | 'exporter'>(pathname.startsWith('/exporter') ? 'exporter' : 'fpo')
  const { session, error: sessionError } = useAuth()
  const [register, setRegister] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [service, setService] = useState<AuctionCapabilities | null>(null)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    setChecking(true); setService(null); setError('')
    void auctionRequest<Record<string, unknown>>('/health', null).then(value => {
      const health = validateAuctionCapabilities(value)
      if (!active) return
      if (!health.password_auth_enabled || value.mobile_auth_enabled !== true) throw new Error(t('auth_connection_not_ready'))
      setService(health)
      if (!health.registration_enabled) setRegister(false)
    }).catch(() => { if (active) setError(t('auth_connection_not_ready')) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [attempt])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !service || (register && !service.registration_enabled)) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    busy.current = true; setPending(true); setError('')
    try { await session.connect(register, { ...values, ...(register ? { role } : {}) }, role); if (pathname === '/') navigate(role === 'fpo' ? '/fpo' : '/exporter') }
    catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : ''
      const key: TKey = /invalid credential|incorrect password|unauthorized/.test(message) ? 'auth_invalid_credentials'
        : /already exists|already registered|duplicate/.test(message) ? 'auth_account_exists'
          : /too many|rate limit|429/.test(message) ? 'auth_too_many_attempts'
            : /fetch|network|unavailable|502|503/.test(message) ? 'auth_network_error' : 'auth_submit_error'
      setError(t(key))
    }
    finally { busy.current = false; setPending(false) }
  }
  const explore = (demoRole: Role) => { session.enterDemo(demoRole); navigate(demoHome(demoRole)) }
  return <main className="auth-page"><div className="auth-topbar"><LanguageSelector className="m-lang" /></div><div className="auth-layout">
    <section className="auth-intro" aria-labelledby="demo-title">
      <div className="auth-brand"><MerakiMark size={40} /><span>Meraki</span></div>
      <p className="auth-eyebrow">{t('entry_eyebrow')}</p>
      <h1 id="demo-title">{t('auth_demo_title')}</h1>
      <p>{t('auth_demo_desc')}</p>
      <div className="auth-demo-grid">
        <button type="button" className="auth-demo-card" disabled={pending} onClick={() => explore('fpo')}>
          <span className="auth-demo-icon"><Sprout size={22} aria-hidden="true" /></span>
          <span className="auth-demo-copy"><strong>{t('auth_fpo_demo_title')}</strong><span>{t('auth_fpo_demo_desc')}</span></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="auth-demo-card" disabled={pending} onClick={() => explore('exporter')}>
          <span className="auth-demo-icon"><Building2 size={22} aria-hidden="true" /></span>
          <span className="auth-demo-copy"><strong>{t('auth_exporter_demo_title')}</strong><span>{t('auth_exporter_demo_desc')}</span></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
    <section className="auth-card" aria-labelledby="auth-title">
    <h2 id="auth-title">{register ? t('auth_title_register') : t('auth_title_signin')}</h2>
    <p>{register ? t('auth_register_desc') : t('auth_signin_desc')}</p>
    <div className="auth-roles" role="group" aria-label={t('auth_account_type')}><button type="button" disabled={pending} aria-pressed={role === 'fpo'} onClick={() => setRole('fpo')}>{t('auth_fpo')}</button><button type="button" disabled={pending} aria-pressed={role === 'exporter'} onClick={() => setRole('exporter')}>{t('auth_exporter')}</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={pending}><label htmlFor="mobile-number">{t('auth_mobile')}</label>
        <input id="mobile-number" name="mobile_number" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('auth_mobile_placeholder')} maxLength={40} aria-describedby="mobile-help" required />
        <small id="mobile-help">{t('auth_mobile_help')}</small>
        <label htmlFor="account-password">{t('auth_password')}</label><div className="auth-password">
          <input id="account-password" name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={10} maxLength={128} aria-describedby="password-help" required />
          <button type="button" aria-label={visible ? t('auth_hide_password') : t('auth_show_password')} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? t('auth_hide_password') : t('auth_show_password')}</button>
        </div><small id="password-help">{t('auth_password_help')}</small>
        {register && <><label htmlFor="account-name">{t('auth_name')}</label><input id="account-name" name="display_name" autoComplete="name" maxLength={100} required />
          <label htmlFor="organisation-name">{t('auth_organisation')}</label><input id="organisation-name" name="organisation_name" autoComplete="organization" minLength={2} maxLength={150} required />
          <small>{t('auth_organisation_help')}</small></>}
        {(error || sessionError) && <p className="auth-error" role="alert">{error || t('auth_submit_error')}</p>}
        {checking && <p role="status">{t('auth_connecting')}</p>}
        <button className="auth-submit" type="submit" disabled={pending || !service}>{pending ? t('auth_connecting_short') : register ? t('auth_create_account') : t('auth_title_signin')}</button>
      </fieldset>
    </form>
    {!checking && !service && <button className="auth-link" type="button" onClick={() => setAttempt(attempt + 1)}>{t('auth_retry')}</button>}
    {service?.registration_enabled && <button className="auth-link" type="button" disabled={pending} onClick={() => { setRegister(!register); setError(''); setVisible(false) }}>{register ? t('auth_existing_account') : t('auth_new_account')}</button>}
    {service && !service.registration_enabled && <p>{t('auth_ask_operator')}</p>}
    <p className="auth-footnote">{t('auth_footnote')}</p>
  </section></div></main>
}
