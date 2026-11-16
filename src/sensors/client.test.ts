import { expect, it } from 'vitest'
import { fetchSensorSnapshot, parseSensorSnapshot } from './client'

const snapshot = { server_time: 1000, stale_after_seconds: 15, devices: [{ id: 1, device_id: 'crate-01', temperature: 26.4, humidity: 72, warnings: [], received_at: 999, stale: false }] }
it('keeps empty real sensor data empty and validates actual measurements', () => {
  expect(parseSensorSnapshot({ ...snapshot, devices: [] }).devices).toEqual([])
  expect(parseSensorSnapshot(snapshot)).toEqual(snapshot)
  for (const patch of [{ temperature: null }, { humidity: 101 }, { received_at: 'yesterday' }, { stale: undefined }, { opened_count: -1 }, { range_configured: 'yes' }, { range_problems: [null] }]) expect(() => parseSensorSnapshot({ ...snapshot, devices: [{ ...snapshot.devices[0], ...patch }] })).toThrow()
})
it('fails on gateway errors without returning fabricated sensor readings', async () => {
  await expect(fetchSensorSnapshot(undefined, async () => new Response('{}', { status: 503 }))).rejects.toThrow('503')
  await expect(fetchSensorSnapshot(undefined, async () => new Response(JSON.stringify({ detail: 'Local USB gateway required' }), { status: 503 }))).rejects.toThrow('Local USB gateway required')
  await expect(fetchSensorSnapshot(undefined, async () => new Response('<html>SPA fallback</html>'))).rejects.toThrow()
})
