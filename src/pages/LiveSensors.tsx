import { useEffect, useRef, useState } from 'react'
import { Activity, Bluetooth, DoorOpen, Droplets, RefreshCw, Thermometer, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import './LiveSensors.css'
import SmsAlerts from '../sensors/SmsAlerts'
import { apiUrl } from '../api/config'
import { fetchBluetoothState, fetchSensorSnapshot, updateBluetoothEnabled, type BluetoothState, type SensorSnapshot as Snapshot } from '../sensors/client'

export default function LiveSensors() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [age, setAge] = useState(0)
  const [ble, setBle] = useState<BluetoothState | null>(null)
  const [bleFresh, setBleFresh] = useState(false)
  const [bleStatusError, setBleStatusError] = useState('')
  const [bleCommandError, setBleCommandError] = useState('')
  const [busy, setBusy] = useState(false)
  const bleGeneration = useRef(0)
  const bleBusy = useRef(false)
  const bleLoading = useRef(false)

  async function loadBle() {
    if (bleBusy.current || bleLoading.current) return
    const request = ++bleGeneration.current
    bleLoading.current = true
    try {
      const data = await fetchBluetoothState(AbortSignal.timeout(5000))
      if (request === bleGeneration.current) { setBle(data); setBleFresh(true); setBleStatusError('') }
    } catch (cause) {
      if (request === bleGeneration.current) { setBleFresh(false); setBleStatusError(cause instanceof Error ? cause.message : 'Could not load Bluetooth gateway status.') }
    } finally { bleLoading.current = false }
  }
  async function setBleEnabled(enabled: boolean) {
    if (bleBusy.current || !bleFresh || ble?.available !== true) return
    const request = ++bleGeneration.current
    bleBusy.current = true
    setBusy(true); setBleFresh(false); setBleCommandError('')
    try {
      const data = await updateBluetoothEnabled(enabled, AbortSignal.timeout(5000))
      if (request === bleGeneration.current) { setBle(data); setBleFresh(true); setBleStatusError('') }
    } catch (cause) {
      if (request === bleGeneration.current) setBleCommandError(cause instanceof Error ? cause.message : 'Could not update Bluetooth connection. Refresh status before retrying.')
    } finally {
      if (request === bleGeneration.current) { bleBusy.current = false; setBusy(false) }
    }
  }

  useEffect(() => { void loadBle(); const tmr = setInterval(() => { void loadBle() }, 3000); return () => { bleGeneration.current += 1; clearInterval(tmr) } }, [])

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

  let endpoint: string | null = null
  try {
    const sensorEndpoint = apiUrl('/api/sensors')
    endpoint = typeof window === 'undefined' ? sensorEndpoint : new URL(sensorEndpoint, window.location.origin).href
  } catch { /* The polling errors display invalid/mixed-content API configuration. */ }

  return <div className="m-page sensor-page">
    <header><div className="m-eyebrow">{t('nav_sensors')}</div><h1 className="m-h1">{t('sensors_title')}</h1><p className="m-lead">{t('sensors_sub')}</p></header>

    <section className="m-card" aria-label="Bluetooth connection">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Bluetooth size={22} /><div><strong>Bluetooth (BLE)</strong><div className="m-small">A local gateway scans its configured BLE device and reads <code>@SENSOR</code> notifications. The gateway computer needs the Bluetooth radio; a cloud gateway cannot scan your laptop's radio.</div></div></div>
        <span className={`m-tag ${bleFresh && ble?.status === 'connected' ? 'm-tag-success' : 'm-tag-neutral'}`}>{bleFresh ? ble?.status : 'status unavailable'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
        <button type="button" className="m-btn" disabled={busy || !bleFresh || ble?.available !== true} onClick={() => { void setBleEnabled(true) }}>Connect / Scan</button>
        <button type="button" className="m-btn" disabled={busy || !bleFresh || ble?.available !== true} onClick={() => { void setBleEnabled(false) }}>Disconnect</button>
        <button type="button" className="m-btn" disabled={busy} onClick={() => { void loadBle() }}><RefreshCw size={15} /> Refresh status</button>
      </div>
      {ble?.available === false && <p role="status" className="m-small" style={{ marginTop: 8 }}>{ble.reason}</p>}
      {bleStatusError && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{bleStatusError}</p>}
      {bleCommandError && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{bleCommandError}</p>}
      {ble?.error && <p role="alert" className="sensor-alert" style={{ marginTop: 8 }}>{ble.error}</p>}
      <p className="m-small" style={{ marginTop: 6 }}>Last reported device: <strong>{ble?.device || ble?.device_name || 'Not provided'}</strong> · Enabled: {ble ? String(ble.enabled) : 'Unknown'}{ble?.last_ok_at ? ` · Last reading: ${new Date(ble.last_ok_at * 1000).toLocaleString()}` : ''}</p>
    </section>

    <section className="m-card sensor-status" aria-label="Gateway status"><Activity size={22} /><div><strong>{error ? t('sensors_status_disconnected') : snapshot ? t('sensors_status_active') : t('sensors_status_connecting')}</strong><p className="m-small">Gateway readings come from received BLE notifications or explicitly configured local HTTP pushes.</p></div><button type="button" className="m-btn" onClick={() => setRefresh(value => value + 1)}>{t('reconnect')}</button></section>
    {error && <p role="alert" className="sensor-alert">{error} {t('previous_retained')}</p>}
    <SmsAlerts />
    {snapshot && snapshot.devices.length === 0 && <section className="m-card"><h2>{t('waiting_first')}</h2><p>No measurements have been received. Connect a BLE device to a local gateway, or use that gateway's configured HTTP push input.</p></section>}
    <div className="sensor-devices">{snapshot?.devices.map(device => {
      const stale = device.stale || snapshot.server_time + age - device.received_at > snapshot.stale_after_seconds
      return <section key={device.device_id} className="m-card sensor-device">
        <div className="sensor-heading"><h2>{device.device_id}</h2><span className={`m-tag ${error || stale ? 'm-tag-neutral' : 'm-tag-success'}`}>{error ? t('disconnected') : stale ? t('stale_check') : t('receiving')}</span></div>
        <p className="m-small">{t('last_received', { time: new Date(device.received_at * 1000).toLocaleString(), sec: Math.max(0, Math.floor(snapshot.server_time + age - device.received_at)) })}</p>
        {device.range_configured ? device.range_problems?.map((problem, index) => <p className="sensor-alert" key={index}>{problem}</p>) : <p className="m-small">No SMS alert rule is configured for this crate.</p>}
        <div className="sensor-metrics"><div><Thermometer /><span>{t('temperature')}</span><strong>{device.temperature.toFixed(1)} <small>°C</small></strong></div><div><Droplets /><span>{t('humidity')}</span><strong>{device.humidity.toFixed(1)} <small>% RH</small></strong></div><div><DoorOpen /><span>Door open / closed</span><strong>{(device.opened_count ?? '—')} / {(device.closed_count ?? '—')}</strong></div><div><TriangleAlert /><span>{t('device_warnings')}</span><strong>{device.warnings.length}</strong></div></div>
        <div className="sensor-warnings"><h3>{t('warnings_reported')}</h3>{device.warnings.length ? <ul>{device.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>{stale || error ? t('no_warnings_unknown') : t('no_warnings_latest')}</p>}</div>
      </section>
    })}</div>
    <section className="m-card"><h2>{t('extra_visibility')}</h2><p>{t('extra_visibility_desc')}</p><p className="m-small">{t('extra_visibility_note')}</p></section>
    <details className="m-card sensor-setup"><summary>{t('esp_details')}</summary><p>Bluetooth uses a separately running local gateway. Its reported device name is <strong>{ble?.device_name || 'not available'}</strong> and notification UUID is <code>{ble?.tx_uuid || 'not available'}</code>. The following is a protocol example, not a received measurement:</p><pre>{`@SENSOR ${JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72.0, opened_count: 12, closed_count: 11, warnings: ['Device-defined warning'] }, null, 2)}`}</pre>{ble?.http_push_available === true && endpoint ? <p>This gateway reports HTTP push enabled at <code>{endpoint}</code> with its configured <code>X-Sensor-Key</code>. A physical device needs the gateway's reachable LAN address; keep the key private.</p> : <p>HTTP push is not reported as enabled by this gateway. A local gateway and private sensor key must be configured before sending readings; the hosted site does not provide laptop Bluetooth access or an automatic local HTTP bridge.</p>}</details>
  </div>
}
