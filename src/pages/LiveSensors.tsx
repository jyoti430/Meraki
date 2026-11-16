import { useEffect, useState } from 'react'
import { Activity, Droplets, Thermometer, TriangleAlert } from 'lucide-react'
import { useI18n } from '../i18n'
import './LiveSensors.css'

type Device = { id: number; device_id: string; temperature: number; humidity: number; warnings: string[]; received_at: number; stale: boolean }
type Snapshot = { server_time: number; stale_after_seconds: number; devices: Device[] }

export default function LiveSensors() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [age, setAge] = useState(0)
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
  return <div className="m-page sensor-page">
    <header><div className="m-eyebrow">{t('nav_sensors')}</div><h1 className="m-h1">{t('sensors_title')}</h1><p className="m-lead">{t('sensors_sub')}</p></header>
    <section className="m-card sensor-status" aria-label="Gateway status"><Activity size={22} /><div><strong>{error ? t('sensors_status_disconnected') : snapshot ? t('sensors_status_active') : t('sensors_status_connecting')}</strong><p className="m-small">{t('sensors_status_desc')}</p></div><button type="button" className="m-btn" onClick={() => setRefresh(value => value + 1)}>{t('reconnect')}</button></section>
    {error && <p role="alert" className="sensor-alert">{error} {t('previous_retained')}</p>}
    {snapshot && snapshot.devices.length === 0 && <section className="m-card"><h2>{t('waiting_first')}</h2><p>{t('waiting_first_desc')}</p></section>}
    <div className="sensor-devices">{snapshot?.devices.map(device => {
      const stale = device.stale || snapshot.server_time + age - device.received_at > snapshot.stale_after_seconds
      return <section key={device.device_id} className="m-card sensor-device">
        <div className="sensor-heading"><h2>{device.device_id}</h2><span className={`m-tag ${error || stale ? 'm-tag-neutral' : 'm-tag-success'}`}>{error ? t('disconnected') : stale ? t('stale_check') : t('receiving')}</span></div>
        <p className="m-small">{t('last_received', { time: new Date(device.received_at * 1000).toLocaleString(), sec: Math.max(0, Math.floor(snapshot.server_time + age - device.received_at)) })}</p>
        <div className="sensor-metrics"><div><Thermometer /><span>{t('temperature')}</span><strong>{device.temperature.toFixed(1)} <small>°C</small></strong></div><div><Droplets /><span>{t('humidity')}</span><strong>{device.humidity.toFixed(1)} <small>% RH</small></strong></div><div><TriangleAlert /><span>{t('device_warnings')}</span><strong>{device.warnings.length}</strong></div></div>
        <div className="sensor-warnings"><h3>{t('warnings_reported')}</h3>{device.warnings.length ? <ul>{device.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>{stale || error ? t('no_warnings_unknown') : t('no_warnings_latest')}</p>}</div>
      </section>
    })}</div>
    <section className="m-card"><h2>{t('extra_visibility')}</h2><p>{t('extra_visibility_desc')}</p><p className="m-small">{t('extra_visibility_note')}</p></section>
    <details className="m-card sensor-setup"><summary>{t('esp_details')}</summary><p>{t('esp_desc', { url: endpoint })}</p><pre>{JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72, warnings: ['Inspect crate airflow'] }, null, 2)}</pre><p>{t('esp_desc2')}</p></details>
  </div>
}
