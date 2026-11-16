import { useEffect, useState } from 'react'
import { Activity, DoorOpen, Droplets, Plug, RefreshCw, Thermometer, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import './LiveSensors.css'

type Device = { id: number; device_id: string; temperature: number; humidity: number; opened_count?: number | null; closed_count?: number | null; warnings: string[]; received_at: number; stale: boolean }
type Snapshot = { server_time: number; stale_after_seconds: number; devices: Device[] }
type SerialPort = { port: string; description: string; hwid: string }
type SerialState = { status: string; port: string; baud: number; error: string; last_ok_at: number | null; ports: SerialPort[] }

export default function LiveSensors() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [age, setAge] = useState(0)
  const [serial, setSerial] = useState<SerialState | null>(null)
  const [selPort, setSelPort] = useState('')
  const [selBaud, setSelBaud] = useState('115200')
  const [serialBusy, setSerialBusy] = useState(false)

  async function loadSerial() {
    try {
      const r = await fetch('/api/sensors/serial', { cache: 'no-store' })
      if (!r.ok) return
      const d: SerialState = await r.json()
      setSerial(d)
      setSelPort(p => p || d.port || '')
      setSelBaud(String(d.baud || 115200))
    } catch {}
  }

  async function connectSerial(port: string) {
    setSerialBusy(true)
    try {
      const r = await fetch('/api/sensors/serial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port, baud: Number(selBaud) || 115200 }) })
      if (r.ok) { const d = await r.json(); setSerial(d); setSelPort(d.port || '') }
    } finally { setSerialBusy(false) }
  }

  useEffect(() => { loadSerial(); const tmr = setInterval(loadSerial, 3000); return () => clearInterval(tmr) }, [])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function poll() {
      try {
        const response = await fetch('/api/sensors', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
        if (!response.ok) throw new Error('Gateway unavailable')
        const data: Snapshot = await response.json()
        if (!Array.isArray(data.devices)) throw new Error('Invalid gateway response')
        if (!stopped) { setSnapshot(data); setAge(0); setError('') }
      } catch {
        if (!stopped) setError(t('cannot_reach_gateway'))
      } finally { if (!stopped) timer = setTimeout(poll, 2000) }
    }
    void poll()
    return () => { stopped = true; controller.abort(); clearTimeout(timer) }
  }, [refresh, t])
  useEffect(() => { const timer = setInterval(() => setAge(value => value + 1), 1000); return () => clearInterval(timer) }, [])

  const endpoint = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/sensors`
  const ports = serial?.ports || []
  const hasSel = ports.some(p => p.port === selPort)

  return <div className="m-page sensor-page">
    <header><div className="m-eyebrow">{t('nav_sensors')}</div><h1 className="m-h1">{t('sensors_title')}</h1><p className="m-lead">{t('sensors_sub')}</p></header>

    <section className="m-card" aria-label="USB serial connection">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Plug size={22} /><div><strong>USB serial (COM port)</strong><div className="m-small">Select the device port and baud (default 115200) to read <code>@SENSOR</code> data.</div></div></div>
        <span className={`m-tag ${serial?.status === 'connected' ? 'm-tag-success' : 'm-tag-neutral'}`}>{serial?.status || 'unknown'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <select value={hasSel || !selPort ? selPort : selPort} onChange={e => setSelPort(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, minWidth: 220 }}>
          <option value="">-- Select COM port --</option>
          {selPort && !hasSel && <option value={selPort}>{selPort} (current)</option>}
          {ports.map(p => <option key={p.port} value={p.port}>{p.port}{p.description ? ` — ${p.description}` : ''}</option>)}
        </select>
        <label className="m-small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Baud
          <input value={selBaud} onChange={e => setSelBaud(e.target.value)} list="baud-options" style={{ width: 110, padding: '8px 10px', borderRadius: 8 }} />
        </label>
        <datalist id="baud-options">{['9600','19200','38400','57600','115200','230400','460800','921600'].map(b => <option key={b} value={b} />)}</datalist>
        <button type="button" className="m-btn" disabled={serialBusy || !selPort} onClick={() => connectSerial(selPort)}>Connect</button>
        <button type="button" className="m-btn" disabled={serialBusy} onClick={() => connectSerial('')}>Disconnect</button>
        <button type="button" className="m-btn" onClick={loadSerial}><RefreshCw size={15} /> Refresh ports</button>
      </div>
      {serial?.error && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{serial.error}</p>}
      {serial?.port && <p className="m-small" style={{ marginTop: 6 }}>Configured: <strong>{serial.port}</strong> @ {serial.baud} baud</p>}
    </section>

    <section className="m-card sensor-status" aria-label="Gateway status"><Activity size={22} /><div><strong>{error ? t('sensors_status_disconnected') : snapshot ? t('sensors_status_active') : t('sensors_status_connecting')}</strong><p className="m-small">{t('sensors_status_desc')}</p></div><button type="button" className="m-btn" onClick={() => setRefresh(value => value + 1)}>{t('reconnect')}</button></section>
    {error && <p role="alert" className="sensor-alert">{error} {t('previous_retained')}</p>}
    {snapshot && snapshot.devices.length === 0 && <section className="m-card"><h2>{t('waiting_first')}</h2><p>{t('waiting_first_desc')}</p></section>}
    <div className="sensor-devices">{snapshot?.devices.map(device => {
      const stale = device.stale || snapshot.server_time + age - device.received_at > snapshot.stale_after_seconds
      return <section key={device.device_id} className="m-card sensor-device">
        <div className="sensor-heading"><h2>{device.device_id}</h2><span className={`m-tag ${error || stale ? 'm-tag-neutral' : 'm-tag-success'}`}>{error ? t('disconnected') : stale ? t('stale_check') : t('receiving')}</span></div>
        <p className="m-small">{t('last_received', { time: new Date(device.received_at * 1000).toLocaleString(), sec: Math.max(0, Math.floor(snapshot.server_time + age - device.received_at)) })}</p>
        <div className="sensor-metrics"><div><Thermometer /><span>{t('temperature')}</span><strong>{device.temperature.toFixed(1)} <small>°C</small></strong></div><div><Droplets /><span>{t('humidity')}</span><strong>{device.humidity.toFixed(1)} <small>% RH</small></strong></div><div><DoorOpen /><span>Door open / closed</span><strong>{(device.opened_count ?? '—')} / {(device.closed_count ?? '—')}</strong></div><div><TriangleAlert /><span>{t('device_warnings')}</span><strong>{device.warnings.length}</strong></div></div>
        <div className="sensor-warnings"><h3>{t('warnings_reported')}</h3>{device.warnings.length ? <ul>{device.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>{stale || error ? t('no_warnings_unknown') : t('no_warnings_latest')}</p>}</div>
      </section>
    })}</div>
    <section className="m-card"><h2>{t('extra_visibility')}</h2><p>{t('extra_visibility_desc')}</p><p className="m-small">{t('extra_visibility_note')}</p></section>
    <details className="m-card sensor-setup"><summary>{t('esp_details')}</summary><p>USB mode: choose the COM port above (baud default <strong>115200</strong>). The device should send lines like:</p><pre>{`@SENSOR ${JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72.0, opened_count: 12, closed_count: 11, warnings: ['Temperature outside selected crop range', 'Crate door is OPEN'] }, null, 2)}`}</pre><p>HTTP push is also supported at <code>{endpoint}</code> with header <code>X-Sensor-Key</code> (see gateway logs for token).</p></details>
  </div>
}
