import { useEffect, useState } from 'react'
import { Activity, DoorOpen, Droplets, Plug, RefreshCw, Thermometer, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import './LiveSensors.css'
import { apiUrl } from '../api/config'
import { fetchSensorSnapshot, type SensorSnapshot as Snapshot, type SerialState } from '../sensors/client'
import SmsAlerts from '../sensors/SmsAlerts'

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
  const [serialError, setSerialError] = useState('')

  async function loadSerial() {
    try {
      const r = await fetch(apiUrl('/api/sensors/serial'), { cache: 'no-store' })
      if (!r.ok) throw new Error(`USB gateway returned HTTP ${r.status}. USB devices require a local gateway.`)
      const d: SerialState = await r.json()
      if (!Array.isArray(d.ports) || typeof d.status !== 'string') throw new Error('Invalid USB gateway response.')
      setSerial(d); setSerialError('')
      setSelPort(p => p || d.port || '')
    } catch (cause) { setSerial(null); setSerialError(cause instanceof Error ? cause.message : 'USB gateway unavailable.') }
  }

  async function connectSerial(port: string) {
    const baud = Number(selBaud)
    if (!Number.isSafeInteger(baud) || baud < 1200 || baud > 921600) { setSerialError('Baud must be a whole number between 1200 and 921600.'); return }
    setSerialBusy(true)
    try {
      const r = await fetch(apiUrl('/api/sensors/serial'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port, baud }) })
      if (!r.ok) throw new Error(`USB connection was not accepted (HTTP ${r.status}).`)
      const d: SerialState = await r.json(); setSerial(d); setSelPort(d.port || ''); setSelBaud(String(d.baud)); setSerialError('')
    } catch (cause) { setSerialError(cause instanceof Error ? cause.message : 'USB connection failed.') } finally { setSerialBusy(false) }
  }

  useEffect(() => { loadSerial(); const tmr = setInterval(loadSerial, 3000); return () => clearInterval(tmr) }, [])

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function poll() {
      try {
        const data = await fetchSensorSnapshot(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]))
        if (!stopped) { setSnapshot(data); setAge(0); setError('') }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : t('cannot_reach_gateway'))
      } finally { if (!stopped) timer = setTimeout(poll, 2000) }
    }
    void poll()
    return () => { stopped = true; controller.abort(); clearTimeout(timer) }
  }, [refresh, t])
  useEffect(() => { const timer = setInterval(() => setAge(value => value + 1), 1000); return () => clearInterval(timer) }, [])

  const sensorEndpoint = apiUrl('/api/sensors')
  const endpoint = typeof window === 'undefined' ? sensorEndpoint : new URL(sensorEndpoint, window.location.origin).href
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
        <select aria-label="USB serial port" disabled={!serial || serial.available === false} value={hasSel || !selPort ? selPort : selPort} onChange={e => setSelPort(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, minWidth: 220 }}>
          <option value="">-- Select COM port --</option>
          {selPort && !hasSel && <option value={selPort}>{selPort} (current)</option>}
          {ports.map(p => <option key={p.port} value={p.port}>{p.port}{p.description ? ` — ${p.description}` : ''}</option>)}
        </select>
        <label className="m-small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Baud
          <input disabled={!serial || serial.available === false} value={selBaud} onChange={e => setSelBaud(e.target.value)} list="baud-options" style={{ width: 110, padding: '8px 10px', borderRadius: 8 }} />
        </label>
        <datalist id="baud-options">{['9600','19200','38400','57600','115200','230400','460800','921600'].map(b => <option key={b} value={b} />)}</datalist>
        <button type="button" className="m-btn" disabled={serialBusy || !selPort || !serial || serial.available === false} onClick={() => connectSerial(selPort)}>Connect</button>
        <button type="button" className="m-btn" disabled={serialBusy || !serial || serial.available === false} onClick={() => connectSerial('')}>Disconnect</button>
        <button type="button" className="m-btn" onClick={loadSerial}><RefreshCw size={15} /> Refresh ports</button>
      </div>
      {serial?.available === false && <p role="note" className="m-small">{serial.reason || 'USB ports belong to a local gateway. Render cannot access the laptop USB device.'}</p>}
      {serialError && <p role="alert" className="sensor-alert">{serialError}</p>}
      {serial?.error && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{serial.error}</p>}
      {serial?.port && <p className="m-small" style={{ marginTop: 6 }}>Configured: <strong>{serial.port}</strong> @ {serial.baud} baud</p>}
    </section>

    <section className="m-card sensor-status" aria-label="Gateway status"><Activity size={22} /><div><strong>{error ? t('sensors_status_disconnected') : snapshot ? t('sensors_status_active') : t('sensors_status_connecting')}</strong><p className="m-small">{t('sensors_status_desc')}</p></div><button type="button" className="m-btn" onClick={() => setRefresh(value => value + 1)}>{t('reconnect')}</button></section>
    {error && <p role="alert" className="sensor-alert">{error} {t('previous_retained')}</p>}
    <SmsAlerts />
    {snapshot && snapshot.devices.length === 0 && <section className="m-card"><h2>{t('waiting_first')}</h2><p>{t('waiting_first_desc')}</p></section>}
    <div className="sensor-devices">{snapshot?.devices.map(device => {
      const stale = device.stale || snapshot.server_time + age - device.received_at > snapshot.stale_after_seconds
      return <section key={device.device_id} className="m-card sensor-device">
        <div className="sensor-heading"><h2>{device.device_id}</h2><span className={`m-tag ${error || stale ? 'm-tag-neutral' : 'm-tag-success'}`}>{error ? t('disconnected') : stale ? t('stale_check') : t('receiving')}</span></div>
        <p className="m-small">{t('last_received', { time: new Date(device.received_at * 1000).toLocaleString(), sec: Math.max(0, Math.floor(snapshot.server_time + age - device.received_at)) })}</p>
        {device.range_configured ? device.range_problems?.map((problem, index) => <p className="sensor-alert" key={index}>{problem}</p>) : <p className="m-small">SMS handling limits have not been set for this crate.</p>}
        <div className="sensor-metrics"><div><Thermometer /><span>{t('temperature')}</span><strong>{device.temperature.toFixed(1)} <small>°C</small></strong></div><div><Droplets /><span>{t('humidity')}</span><strong>{device.humidity.toFixed(1)} <small>% RH</small></strong></div><div><DoorOpen /><span>Door open / closed</span><strong>{(device.opened_count ?? '—')} / {(device.closed_count ?? '—')}</strong></div><div><TriangleAlert /><span>{t('device_warnings')}</span><strong>{device.warnings.length}</strong></div></div>
        <div className="sensor-warnings"><h3>{t('warnings_reported')}</h3>{device.warnings.length ? <ul>{device.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>{stale || error ? t('no_warnings_unknown') : t('no_warnings_latest')}</p>}</div>
      </section>
    })}</div>
    <section className="m-card"><h2>{t('extra_visibility')}</h2><p>{t('extra_visibility_desc')}</p><p className="m-small">{t('extra_visibility_note')}</p></section>
    <details className="m-card sensor-setup"><summary>{t('esp_details')}</summary>
      {serial?.available === false ? <p>{serial.reason || 'This hosted API has no connected sensor gateway.'} Device uploads are unavailable here. Run the authorised local gateway to use USB or HTTP sensor ingestion.</p> : serial ? <><p>USB mode: choose the COM port above (baud default <strong>115200</strong>). The device should send lines like:</p><pre>{`@SENSOR ${JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72.0, opened_count: 12, closed_count: 11, warnings: ['Temperature outside selected crop range', 'Crate door is OPEN'] }, null, 2)}`}</pre><p>The local gateway supports HTTP push at <code>{endpoint}</code> with header <code>X-Sensor-Key</code> (see gateway logs for token).</p></> : <p>Connect to the sensor gateway before configuring device uploads. No sensor readings are substituted while the gateway is unavailable.</p>}
    </details>
  </div>
}
