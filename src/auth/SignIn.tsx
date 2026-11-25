import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MerakiMark } from '../components/ui'
import { auctionRequest, validateAuctionCapabilities } from '../services/auctionApi'
import type { AuctionCapabilities } from '../services/auctionApi'
import { useAuth } from './context'
import { demoHome, type Role } from './workspace'
import { ArrowRight, Building2, Sprout } from 'lucide-react'

export default function SignIn() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
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
      if (!health.password_auth_enabled || value.mobile_auth_enabled !== true) throw new Error('Mobile sign-in is still being connected. Please try again shortly.')
      setService(health)
      if (!health.registration_enabled) setRegister(false)
    }).catch(() => { if (active) setError('Mobile sign-in is still being connected. Please try again shortly.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [attempt])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !service || (register && !service.registration_enabled)) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    busy.current = true; setPending(true); setError('')
    try { await session.connect(register, { ...values, ...(register ? { role } : {}) }, role); if (pathname === '/') navigate(role === 'fpo' ? '/fpo' : '/exporter') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not sign in. Please retry.') }
    finally { busy.current = false; setPending(false) }
  }
  const explore = (demoRole: Role) => { session.enterDemo(demoRole); navigate(demoHome(demoRole)) }
  return <main className="auth-page"><div className="auth-layout">
    <section className="auth-intro" aria-labelledby="demo-title">
      <div className="auth-brand"><MerakiMark size={40} /><span>Meraki</span></div>
      <p className="auth-eyebrow">Demand-driven crop planning for FPOs</p>
      <h1 id="demo-title">Explore without an account</h1>
      <p>Open a demo workspace with sample farms, buyers and orders. Everything stays in this browser; no messages, bids or payments are sent.</p>
      <div className="auth-demo-grid">
        <button type="button" className="auth-demo-card" disabled={pending} onClick={() => explore('fpo')}>
          <span className="auth-demo-icon"><Sprout size={22} aria-hidden="true" /></span>
          <span className="auth-demo-copy"><strong>FPO planning demo</strong><span>Turn buyer demand into a collective planting plan, then coordinate farmers and see the plan adjust.</span></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="auth-demo-card" disabled={pending} onClick={() => explore('exporter')}>
          <span className="auth-demo-icon"><Building2 size={22} aria-hidden="true" /></span>
          <span className="auth-demo-copy"><strong>Exporter demo</strong><span>Review sample requirements, compare FPO supply examples and preview the bidding marketplace.</span></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
    <section className="auth-card" aria-labelledby="auth-title">
    <h2 id="auth-title">{register ? 'Create your account' : 'Sign in'}</h2>
    <p>{register ? 'Start with your mobile number and organisation details.' : 'Use your mobile number and password to open your workspace.'}</p>
    <div className="auth-roles" role="group" aria-label="Account type"><button type="button" disabled={pending} aria-pressed={role === 'fpo'} onClick={() => setRole('fpo')}>FPO</button><button type="button" disabled={pending} aria-pressed={role === 'exporter'} onClick={() => setRole('exporter')}>Exporter</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={pending}><label htmlFor="mobile-number">Mobile number</label>
        <input id="mobile-number" name="mobile_number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 followed by your number" maxLength={40} aria-describedby="mobile-help" required />
        <small id="mobile-help">Include your country code, for example +91. No OTP or SMS is sent.</small>
        <label htmlFor="account-password">Password</label><div className="auth-password">
          <input id="account-password" name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={10} maxLength={128} aria-describedby="password-help" required />
          <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
        </div><small id="password-help">At least 10 characters.</small>
        {register && <><label htmlFor="account-name">Your name</label><input id="account-name" name="display_name" autoComplete="name" maxLength={100} required />
          <label htmlFor="organisation-name">Organisation name</label><input id="organisation-name" name="organisation_name" autoComplete="organization" minLength={2} maxLength={150} required />
          <small>Creates a separate organisation account. Your mobile number is collected, but its ownership is not verified.</small></>}
        {(error || sessionError) && <p className="auth-error" role="alert">{error || sessionError}</p>}
        {checking && <p role="status">Connecting to sign-in…</p>}
        <button className="auth-submit" type="submit" disabled={pending || !service}>{pending ? 'Connecting…' : register ? 'Create account' : 'Sign in'}</button>
      </fieldset>
    </form>
    {!checking && !service && <button className="auth-link" type="button" onClick={() => setAttempt(attempt + 1)}>Retry connection</button>}
    {service?.registration_enabled && <button className="auth-link" type="button" disabled={pending} onClick={() => { setRegister(!register); setError(''); setVisible(false) }}>{register ? 'Already registered? Sign in' : 'New here? Create an account'}</button>}
    {service && !service.registration_enabled && <p>Need an account? Ask your workspace operator.</p>}
    <p className="auth-footnote">An account is only needed to place bids in shared auctions that other users can see.</p>
  </section></div></main>
}
