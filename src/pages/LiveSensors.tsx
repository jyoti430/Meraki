import { useEffect, useState } from 'react'
import { Activity, Bluetooth, DoorOpen, Droplets, RefreshCw, Thermometer, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import './LiveSensors.css'
import { apiUrl } from '../api/config'
import { fetchSensorSnapshot, type SensorSnapshot as Snapshot } from '../sensors/client'

type BleState = { status: string; enabled: boolean; device: string; device_name: string; tx_uuid: string; error: string; last_ok_at: number | null }

export default function LiveSensors() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [age, setAge] = useState(0)
  const [ble, setBle] = useState<BleState | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadBle() {
    try {
      const r = await fetch(apiUrl('/api/sensors/bluetooth'), { cache: 'no-store' })
      if (r.ok) setBle(await r.json())
    } catch {}
  }
  async function setBleEnabled(enabled: boolean) {
    setBusy(true)
    try {
      const r = await fetch(apiUrl('/api/sensors/bluetooth'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) })
      if (r.ok) setBle(await r.json())
    } finally { setBusy(false) }
  }

  useEffect(() => { loadBle(); const tmr = setInterval(loadBle, 3000); return () => clearInterval(tmr) }, [])

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

  return <div className="m-page sensor-page">
    <header><div className="m-eyebrow">{t('nav_sensors')}</div><h1 className="m-h1">{t('sensors_title')}</h1><p className="m-lead">{t('sensors_sub')}</p></header>

    <section className="m-card" aria-label="Bluetooth connection">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Bluetooth size={22} /><div><strong>Bluetooth (BLE)</strong><div className="m-small">Scans and connects to <code>{ble?.device_name || 'AgriTrust-Nexus'}</code> (Nordic UART TX <code>{ble?.tx_uuid || '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'}</code>) and reads <code>@SENSOR</code> data.</div></div></div>
        <span className={`m-tag ${ble?.status === 'connected' ? 'm-tag-success' : 'm-tag-neutral'}`}>{ble?.status || 'unknown'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="m-btn" disabled={busy} onClick={() => setBleEnabled(true)}>Connect / Scan</button>
        <button type="button" className="m-btn" disabled={busy} onClick={() => setBleEnabled(false)}>Disconnect</button>
        <button type="button" className="m-btn" onClick={loadBle}><RefreshCw size={15} /> Refresh status</button>
      </div>
      {ble?.error && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{ble.error}</p>}
      <p className="m-small" style={{ marginTop: 6 }}>Device: <strong>{ble?.device || ble?.device_name || 'AgriTrust-Nexus'}</strong> · Enabled: {String(ble?.enabled ?? true)}{ble?.last_ok_at ? ` · Last reading: ${new Date(ble.last_ok_at * 1000).toLocaleString()}` : ''}</p>
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
    <details className="m-card sensor-setup"><summary>{t('esp_details')}</summary><p>Bluetooth mode: gateway scans for <strong>AgriTrust-Nexus</strong> and subscribes to Nordic UART TX (<code>6E400003-B5A3-F393-E0A9-E50E24DCCA9E</code>). Device should send notifications like:</p><pre>{`@SENSOR ${JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72.0, opened_count: 12, closed_count: 11, warnings: ['Temperature outside selected crop range', 'Crate door is OPEN'] }, null, 2)}`}</pre><p>HTTP push is also supported at <code>{endpoint}</code> with header <code>X-Sensor-Key</code> (see gateway logs for token).</p></details>
  </div>
}
