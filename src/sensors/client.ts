import { apiUrl } from '../api/config'

export type Device = { id: number; device_id: string; temperature: number; humidity: number; opened_count?: number | null; closed_count?: number | null; warnings: string[]; received_at: number; stale: boolean }
export type SensorSnapshot = { server_time: number; stale_after_seconds: number; devices: Device[] }
export type SerialPort = { port: string; description: string; hwid: string }
export type SerialState = { available?: boolean; reason?: string; status: string; port: string; baud: number; error: string; last_ok_at: number | null; ports: SerialPort[] }

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export function parseSensorSnapshot(value: unknown): SensorSnapshot {
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (!object(value) || !finite(value.server_time) || value.server_time <= 0 || !finite(value.stale_after_seconds) || value.stale_after_seconds <= 0 || !Array.isArray(value.devices)) throw new Error('Invalid sensor gateway response.')
  for (const row of value.devices) {
    if (!object(row) || typeof row.device_id !== 'string' || !Number.isSafeInteger(row.id) || !finite(row.temperature) || !finite(row.humidity)
      || row.humidity < 0 || row.humidity > 100 || !finite(row.received_at) || row.received_at <= 0 || typeof row.stale !== 'boolean'
      || !Array.isArray(row.warnings) || row.warnings.some(item => typeof item !== 'string')) throw new Error('Invalid sensor measurement. No mock readings were substituted.')
    for (const key of ['opened_count', 'closed_count']) if (row[key] != null && (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0)) throw new Error('Invalid sensor event count.')
  }
  return value as unknown as SensorSnapshot
}

export async function fetchSensorSnapshot(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<SensorSnapshot> {
  const response = await fetcher(apiUrl('/api/sensors'), { cache: 'no-store', signal })
  if (!response.ok) {
    let detail = ''
    try {
      const error: unknown = await response.json()
      if (object(error) && typeof error.detail === 'string') detail = error.detail
    } catch { /* Keep the HTTP error when an upstream returns HTML. */ }
    throw new Error(`Sensor gateway returned HTTP ${response.status}.${detail ? ` ${detail}` : ''}`)
  }
  return parseSensorSnapshot(await response.json())
}
