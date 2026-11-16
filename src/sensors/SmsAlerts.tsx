import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiUrl } from '../api/config'

type Profile = { id: string; name: string; phone: string; sms_enabled: boolean }
type Rule = { device_id: string; profile_id: string; temperature_min: number | null; temperature_max: number | null; humidity_min: number | null; humidity_max: number | null; location: string; alert_on_warnings: boolean; cooldown_seconds: number }
type Alert = { id: number; device_id: string; profile_id: string; body: string; status: string; error: string | null; created_at: number }
type Settings = { provider_configured: boolean; profiles: Profile[]; rules: Rule[]; alerts: Alert[] }
const blankProfile: Profile = { id: '', name: '', phone: '', sms_enabled: true }
type RuleDraft = Omit<Rule, 'temperature_min' | 'temperature_max' | 'humidity_min' | 'humidity_max' | 'cooldown_seconds'> & { temperature_min: string; temperature_max: string; humidity_min: string; humidity_max: string; cooldown_minutes: string; check_limits: boolean }
const blankRule: RuleDraft = { device_id: '', profile_id: '', temperature_min: '', temperature_max: '', humidity_min: '', humidity_max: '', location: '', alert_on_warnings: true, cooldown_minutes: '30', check_limits: false }
const toDraft = (value: Rule): RuleDraft => ({ ...value, temperature_min: value.temperature_min?.toString() ?? '', temperature_max: value.temperature_max?.toString() ?? '', humidity_min: value.humidity_min?.toString() ?? '', humidity_max: value.humidity_max?.toString() ?? '', cooldown_minutes: String(value.cooldown_seconds / 60), check_limits: value.temperature_min != null || value.humidity_min != null })

export default function SmsAlerts() {
  const [key, setKey] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profile, setProfile] = useState(blankProfile)
  const [rule, setRule] = useState(blankRule)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const generation = useRef(0)

  // Keys and phone numbers stay out of browser persistence. Discard requests
  // from an earlier unlock when the operator changes or clears the key.
  useEffect(() => { generation.current += 1; setSettings(null); setError(''); setNotice(''); setProfile(blankProfile); setRule(blankRule) }, [key])

  async function request(path: string, body?: unknown) {
    const response = await fetch(apiUrl(path), {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Sensor-Admin-Key': key },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      let detail = ''
      try { const data = await response.json(); if (typeof data.detail === 'string') detail = data.detail } catch { /* retain HTTP status */ }
      throw new Error(detail || `Settings returned HTTP ${response.status}. Check the gateway and form values.`)
    }
    return response.json()
  }

  async function refresh() {
    const data = await request('/api/sensors/alerts')
    if (typeof data.provider_configured !== 'boolean' || !Array.isArray(data.profiles) || !Array.isArray(data.rules) || !Array.isArray(data.alerts)) throw new Error('Invalid SMS settings response.')
    return data as Settings
  }

  async function perform(action: () => Promise<void>) {
    const current = ++generation.current
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : 'SMS settings unavailable.') }
    finally { setBusy(false) }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault()
    await perform(async () => { const current = generation.current; const data = await refresh(); if (current === generation.current) setSettings(data) })
  }

  async function save(event: FormEvent, kind: 'profiles' | 'crates') {
    event.preventDefault()
    const crateBody = { device_id: rule.device_id, profile_id: rule.profile_id, location: rule.location, alert_on_warnings: rule.alert_on_warnings, cooldown_seconds: Number(rule.cooldown_minutes) * 60,
      temperature_min: rule.check_limits ? Number(rule.temperature_min) : null, temperature_max: rule.check_limits ? Number(rule.temperature_max) : null,
      humidity_min: rule.check_limits ? Number(rule.humidity_min) : null, humidity_max: rule.check_limits ? Number(rule.humidity_max) : null }
    if (kind === 'crates' && rule.check_limits && (Number(rule.temperature_min) >= Number(rule.temperature_max) || Number(rule.humidity_min) >= Number(rule.humidity_max))) { setError('Each minimum must be below its maximum.'); return }
    if (kind === 'crates' && !rule.check_limits && !rule.alert_on_warnings) { setError('Enable device warnings or add handling limits.'); return }
    await perform(async () => {
      const current = generation.current
      await request(`/api/sensors/alerts/${kind}`, kind === 'profiles' ? profile : crateBody)
      if (current !== generation.current) return
      setNotice(`${kind === 'profiles' ? 'FPO contact' : 'Crate rule'} saved. New readings use these settings.`)
      try { const data = await refresh(); if (current === generation.current) setSettings(data) }
      catch { if (current === generation.current) setError('Saved, but the list could not refresh. Use Refresh status to reload it.') }
    })
  }

  return <section className="m-card sensor-sms" aria-labelledby="sms-heading">
    <h2 id="sms-heading">Automatic SMS alerts</h2>
    <p>Save an FPO contact and assign its crates. A device warning sends the crate ID and problem to that phone. Location is optional.</p>
    <form onSubmit={unlock} className="sensor-sms-unlock">
      <label>Gateway admin key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} required placeholder="Enter the key from your local launcher" /></label>
      <button className="m-btn" disabled={busy || !key}> {busy ? 'Working…' : settings ? 'Refresh status' : 'Open alert settings'}</button>
      {settings && <button type="button" className="m-btn" onClick={() => setKey('')}>Lock settings</button>}
    </form>
    {error && <p role="alert" className="sensor-alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {settings && <>
      <p role="status" className={settings.provider_configured ? 'm-small' : 'sensor-alert'}>{settings.provider_configured ? 'Twilio is configured. The gateway checks queued alerts every two seconds.' : 'Twilio is not configured. Alerts are queued locally; SMS will start after provider credentials are set and the gateway restarts.'}</p>
      <div className="sensor-sms-forms">
        <form onSubmit={e => save(e, 'profiles')}>
          <h3>FPO phone number</h3>
          <label>Saved contact<select value={profile.id && settings.profiles.some(p => p.id === profile.id) ? profile.id : ''} onChange={e => setProfile(settings.profiles.find(p => p.id === e.target.value) || blankProfile)}><option value="">New FPO contact</option>{settings.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>FPO ID<input value={profile.id} onChange={e => setProfile({ ...profile, id: e.target.value })} pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} required placeholder="fpo-01" /></label>
          <label>FPO name<input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} maxLength={100} required /></label>
          <label>Phone number with country code<input type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} pattern="\+[1-9][0-9]{7,14}" required placeholder="+91…" autoComplete="tel" /></label>
          <label className="sensor-sms-check"><input type="checkbox" checked={profile.sms_enabled} onChange={e => setProfile({ ...profile, sms_enabled: e.target.checked })} /> Enable SMS for this FPO</label>
          <button className="m-btn" disabled={busy}>Save FPO contact</button>
        </form>
        <form onSubmit={e => save(e, 'crates')}>
          <h3>Crate warnings</h3>
          <label>Saved crate<select value={settings.rules.some(r => r.device_id === rule.device_id) ? rule.device_id : ''} onChange={e => { const saved = settings.rules.find(r => r.device_id === e.target.value); setRule(saved ? toDraft(saved) : blankRule) }}><option value="">New crate rule</option>{settings.rules.map(r => <option key={r.device_id} value={r.device_id}>{r.device_id}</option>)}</select></label>
          <label>Crate ID<input value={rule.device_id} onChange={e => setRule({ ...rule, device_id: e.target.value })} pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} required placeholder="Match the sensor device_id" /></label>
          <label>Responsible FPO<select value={rule.profile_id} onChange={e => setRule({ ...rule, profile_id: e.target.value })} required><option value="">Select a saved FPO</option>{settings.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="sensor-sms-check"><input type="checkbox" checked={rule.check_limits} onChange={e => setRule({ ...rule, check_limits: e.target.checked })} /> Also check custom handling limits</label>
          {rule.check_limits && <div className="sensor-sms-ranges">{(['temperature_min', 'temperature_max', 'humidity_min', 'humidity_max'] as const).map(field => <label key={field}>{({ temperature_min: 'Min temperature (°C)', temperature_max: 'Max temperature (°C)', humidity_min: 'Min humidity (% RH)', humidity_max: 'Max humidity (% RH)' })[field]}<input type="number" step="0.1" min={field.startsWith('temperature') ? -50 : 0} max={100} value={rule[field]} onChange={e => setRule({ ...rule, [field]: e.target.value })} required /></label>)}</div>}
          <label>Location (optional)<input value={rule.location} onChange={e => setRule({ ...rule, location: e.target.value })} maxLength={120} placeholder="Collection centre or vehicle" /></label>
          <label>Minimum gap between SMS (minutes)<input type="number" min={1} max={1440} step={1} value={rule.cooldown_minutes} onChange={e => setRule({ ...rule, cooldown_minutes: e.target.value })} required /></label>
          <label className="sensor-sms-check"><input type="checkbox" checked={rule.alert_on_warnings} onChange={e => setRule({ ...rule, alert_on_warnings: e.target.checked })} /> Send the device warnings shown in the app</label>
          <p className="m-small">Device warnings trigger SMS automatically. Ongoing warnings send reminders after the minimum gap, while fresh readings continue.</p>
          <button className="m-btn" disabled={busy || settings.profiles.length === 0}>Save crate rule</button>
        </form>
      </div>
      <h3>Recent SMS activity</h3>
      <p className="m-small">Accepted means Twilio received the message. Check delivery in Twilio. An uncertain send needs review there before retrying.</p>
      {settings.alerts.length ? <ul className="sensor-sms-history">{settings.alerts.map(alert => <li key={alert.id}><div><strong>{alert.device_id}</strong><span className="m-tag m-tag-neutral">{alert.status}</span></div><p>{alert.body}</p><small>{alert.profile_id} · {new Date(alert.created_at * 1000).toLocaleString()}</small>{alert.error && <p className="sensor-alert">{alert.error}</p>}</li>)}</ul> : <p className="m-small">No alerts yet. Saved rules apply to the next sensor reading.</p>}
    </>}
  </section>
}
