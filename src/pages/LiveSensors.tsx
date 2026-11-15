import { useEffect, useState } from 'react'
import { Activity, Droplets, Thermometer, TriangleAlert } from 'lucide-react'
import './LiveSensors.css'

type Device = { id: number; device_id: string; temperature: number; humidity: number; warnings: string[]; received_at: number; stale: boolean }
type Snapshot = { server_time: number; stale_after_seconds: number; devices: Device[] }

export default function LiveSensors() {
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
        if (!stopped) setError('Cannot reach the sensor gateway. Check that it is running and connected.')
      } finally { if (!stopped) timer = setTimeout(poll, 2000) }
    }
    void poll()
    return () => { stopped = true; controller.abort(); clearTimeout(timer) }
  }, [refresh])
  useEffect(() => { const timer = setInterval(() => setAge(value => value + 1), 1000); return () => clearInterval(timer) }, [])
  return <div className="m-page sensor-page">
    <header><div className="m-eyebrow">Additional feature · final handling checkpoint</div><h1 className="m-h1">Live sensor data</h1><p className="m-lead">Monitor the sensor-equipped crate after the exporter and FPO procurement journey. Spot handling warnings and decide which crate needs an inspection.</p></header>
    <section className="m-card sensor-status" aria-label="Gateway status"><Activity size={22} /><div><strong>{error ? 'Gateway disconnected' : snapshot ? 'Auto-sync active · every 2 seconds' : 'Connecting to gateway…'}</strong><p className="m-small">ESP → Wi-Fi gateway → live crate readings. Values come from received device uploads.</p></div><button type="button" className="m-btn" onClick={() => setRefresh(value => value + 1)}>Reconnect</button></section>
    {error && <p role="alert" className="sensor-alert">{error} Previous readings below are retained and are not current.</p>}
    {snapshot && snapshot.devices.length === 0 && <section className="m-card"><h2>Waiting for the first ESP reading</h2><p>No sensor values have been received yet. Connect the ESP and laptop to the same Wi-Fi, then push readings to this website’s sensor endpoint.</p></section>}
    <div className="sensor-devices">{snapshot?.devices.map(device => {
      const stale = device.stale || snapshot.server_time + age - device.received_at > snapshot.stale_after_seconds
      return <section key={device.device_id} className="m-card sensor-device">
        <div className="sensor-heading"><h2>{device.device_id}</h2><span className={`m-tag ${error || stale ? 'm-tag-neutral' : 'm-tag-success'}`}>{error ? 'Disconnected' : stale ? 'Stale · check device' : 'Receiving'}</span></div>
        <p className="m-small">Last received {new Date(device.received_at * 1000).toLocaleString()} · {Math.max(0, Math.floor(snapshot.server_time + age - device.received_at))}s ago</p>
        <div className="sensor-metrics"><div><Thermometer /><span>Temperature</span><strong>{device.temperature.toFixed(1)} <small>°C</small></strong></div><div><Droplets /><span>Humidity</span><strong>{device.humidity.toFixed(1)} <small>% RH</small></strong></div><div><TriangleAlert /><span>Device warnings</span><strong>{device.warnings.length}</strong></div></div>
        <div className="sensor-warnings"><h3>Warnings reported by ESP</h3>{device.warnings.length ? <ul>{device.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p>{stale || error ? 'No warnings in the last received upload. Current condition is unknown.' : 'No warnings reported in the latest upload.'}</p>}</div>
      </section>
    })}</div>
    <section className="m-card"><h2>Extra visibility across the supply chain</h2><p>Present the exporter/FPO workflow and business model first, then use this crate layer as the final handling checkpoint. Temperature, humidity and device warnings support inspection and handling decisions; they do not certify produce safety, export compliance or remaining shelf life.</p><p className="m-small">Readings are associated with device IDs. Linking crates to actual lots, shipments or release decisions remains a separate integration.</p></section>
    <details className="m-card sensor-setup"><summary>ESP connection details</summary><p>Send a JSON POST to <code>{window.location.origin}/api/sensors</code> with <code>Content-Type: application/json</code> and the <code>X-Sensor-Key</code> configured on the laptop gateway.</p><pre>{JSON.stringify({ device_id: 'crate-01', temperature: 26.4, humidity: 72, warnings: ['Inspect crate airflow'] }, null, 2)}</pre><p>Use the laptop’s Wi-Fi IPv4 address in the URL on the ESP, not localhost. Send every 5 seconds. Send an empty warnings array to clear earlier warnings.</p></details>
  </div>
}
