import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Backend secrets remain local and never use VITE_ names.
if (existsSync(path.join(root, '.env'))) loadEnvFile(path.join(root, '.env'))
function enabled(name, fallback) {
  const value = String(process.env[name] ?? (fallback ? '1' : '0')).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  console.error(`${name} must be 1 or 0 (true/false also accepted).`)
  process.exit(1)
}
const bleEnabled = enabled('SENSOR_BLE_ENABLED', true)
const lanEnabled = enabled('SENSOR_LAN', false)
const token = process.env.SENSOR_PUSH_TOKEN || randomBytes(24).toString('hex')
const adminToken = process.env.SENSOR_ADMIN_TOKEN || randomBytes(24).toString('hex')
const python = process.env.SENSOR_PYTHON || process.env.TRADE_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const bleName = process.env.SENSOR_BLE_NAME?.trim() || 'AgriTrust-Nexus'
const env = { ...process.env, SENSOR_PUSH_TOKEN: token, SENSOR_ADMIN_TOKEN: adminToken, SENSOR_BLE_NAME: bleName, SENSOR_BLE_ENABLED: bleEnabled ? '1' : '0', PYTHONUNBUFFERED: '1' }
const vite = path.join(root, 'node_modules/vite/bin/vite.js')
if (!existsSync(vite)) {
  console.error('Install the frontend dependencies with npm ci before starting the sensor gateway.')
  process.exit(1)
}
const check = spawnSync(python, ['-c', `import fastapi, uvicorn${bleEnabled ? ', bleak' : ''}`], { cwd: root, encoding: 'utf8', windowsHide: true })
if (check.status !== 0) {
  console.error('The selected sensor Python is unavailable or its dependencies are missing. Install server/requirements.txt into .venv, or set SENSOR_PYTHON to the configured Python executable.')
  process.exit(1)
}
const children = []
let stopping = false
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code }
function run(executable, args) {
  const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
}
console.log(bleEnabled ? `BLE sensor: scanning for "${bleName}" (Nordic UART TX 6E400003-B5A3-F393-E0A9-E50E24DCCA9E).` : 'BLE scanning starts disabled; use Connect/Scan in the local /sensors UI to enable it.')
console.log('Local sensor website: http://127.0.0.1:5173/sensors. HTTP push is available on this local gateway.')
console.log('ESP X-Sensor-Key (keep private):', token)
console.log('SMS settings admin key (keep private; do not put on the ESP):', adminToken)
if (lanEnabled) {
  console.log('SENSOR_LAN is enabled: the development website and sensor telemetry are reachable on the local network.')
  for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`LAN website: http://${address.address}:5173/sensors | ESP POST: http://${address.address}:5173/api/sensors`)
}
run(python, ['-m', 'uvicorn', 'server.sensors:app', '--host', '127.0.0.1', '--port', '8001'])
run(process.execPath, [vite, '--host', lanEnabled ? '0.0.0.0' : '127.0.0.1', '--port', '5173', '--strictPort'])
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
