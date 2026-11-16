import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = process.env.SENSOR_PUSH_TOKEN || randomBytes(24).toString('hex')
const python = process.env.TRADE_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const serialPort = process.env.SENSOR_SERIAL_PORT || process.argv[2] || ''
const baud = process.env.SENSOR_BAUD || '115200'
const env = { ...process.env, SENSOR_PUSH_TOKEN: token, SENSOR_SERIAL_PORT: serialPort, SENSOR_BAUD: baud }
const children = []
let stopping = false
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code }
function run(executable, args) {
  const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
}
if (serialPort) console.log(`USB sensor: ${serialPort} @ ${baud} baud (expecting lines like: @SENSOR {"device_id":"crate-01","temperature":26.4,"humidity":72.0,"opened_count":12,"closed_count":11,"warnings":[]})`)
else console.log('USB sensor: choose COM port in the UI at /sensors (or set SENSOR_SERIAL_PORT=COM3 / /dev/ttyUSB0). Default baud 115200. HTTP push still available if configured.')
console.log('ESP X-Sensor-Key (keep private):', token)
for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || []) if (address.family === 'IPv4' && !address.internal) console.log(`LAN website: http://${address.address}:5173/sensors | ESP POST: http://${address.address}:5173/api/sensors`)
run(python, ['-m', 'uvicorn', 'server.sensors:app', '--host', '127.0.0.1', '--port', '8001'])
run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', '5173', '--strictPort'])
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
