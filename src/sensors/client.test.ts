import { expect, it } from 'vitest'
import { fetchBluetoothState, fetchSensorSnapshot, parseBluetoothState, parseSensorSnapshot, updateBluetoothEnabled } from './client'

const snapshot = { server_time: 1000, stale_after_seconds: 15, devices: [{ id: 1, device_id: 'crate-01', temperature: 26.4, humidity: 72, warnings: [], received_at: 999, stale: false }] }
it('keeps empty real sensor data empty and validates actual measurements', () => {
  expect(parseSensorSnapshot({ ...snapshot, devices: [] }).devices).toEqual([])
  expect(parseSensorSnapshot(snapshot)).toEqual(snapshot)
  for (const patch of [{ temperature: null }, { humidity: 101 }, { received_at: 'yesterday' }, { stale: undefined }, { opened_count: -1 }]) expect(() => parseSensorSnapshot({ ...snapshot, devices: [{ ...snapshot.devices[0], ...patch }] })).toThrow()
})
it('fails on gateway errors without returning fabricated sensor readings', async () => {
  await expect(fetchSensorSnapshot(undefined, async () => new Response('{}', { status: 503 }))).rejects.toThrow('503')
  await expect(fetchSensorSnapshot(undefined, async () => new Response(JSON.stringify({ detail: 'Local USB gateway required' }), { status: 503 }))).rejects.toThrow('Local USB gateway required')
  await expect(fetchSensorSnapshot(undefined, async () => new Response('<html>SPA fallback</html>'))).rejects.toThrow()
})
const bluetooth = { available: true, status: 'disconnected', enabled: false, device: '', device_name: 'Configured local BLE', tx_uuid: 'configured-tx', error: '', last_ok_at: null, http_push_available: true }
it('requires an explicit Bluetooth capability and preserves hosted unavailability', () => {
  expect(parseBluetoothState(bluetooth)).toEqual(bluetooth)
  const hosted = { ...bluetooth, available: false, reason: 'Render cannot access a laptop Bluetooth radio.', status: 'unavailable', http_push_available: false }
  expect(parseBluetoothState(hosted)).toEqual(hosted)
  for (const value of [{ ...bluetooth, available: undefined }, { ...hosted, reason: '' }, { ...hosted, enabled: true }, { ...bluetooth, enabled: 'false' }, { ...bluetooth, last_ok_at: 'yesterday' }, { ...bluetooth, http_push_available: 'true' }, { ...bluetooth, error: null }]) expect(() => parseBluetoothState(value)).toThrow('Controls are disabled')
})
it('surfaces Bluetooth GET and POST backend errors instead of silently retaining success', async () => {
  const failure = async () => new Response(JSON.stringify({ detail: 'Bluetooth is only available through a local gateway.' }), { status: 503 })
  await expect(fetchBluetoothState(undefined, failure)).rejects.toThrow('503. Bluetooth is only available')
  await expect(updateBluetoothEnabled(true, undefined, failure)).rejects.toThrow('503. Bluetooth is only available')
  await expect(fetchBluetoothState(undefined, async () => new Response('<html>SPA fallback</html>'))).rejects.toThrow('invalid JSON')
  await expect(updateBluetoothEnabled(true, undefined, async () => { throw new TypeError('gateway offline') })).rejects.toThrow('gateway offline')
})
it('sends explicit connection intent and validates the returned Bluetooth state', async () => {
  let sent: RequestInit | undefined, url: RequestInfo | URL | undefined
  const response = { ...bluetooth, enabled: true, status: 'scanning' }
  expect(await updateBluetoothEnabled(true, undefined, async (input, options) => { url = input; sent = options; return new Response(JSON.stringify(response)) })).toEqual(response)
  expect(String(url)).toContain('/api/sensors/bluetooth')
  expect(sent).toMatchObject({ method: 'POST', body: '{"enabled":true}', headers: { 'Content-Type': 'application/json' } })
  await expect(updateBluetoothEnabled(false, undefined, async () => new Response(JSON.stringify({ status: 'connected' })))).rejects.toThrow('capability response')
})
