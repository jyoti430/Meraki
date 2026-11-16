import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = process.env.TRADE_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) {
  console.error('Create .venv with Python 3.10+ and install server/requirements.txt first. See docs/PART3_OPERATIONS.md.')
  process.exit(1)
}
const check = spawnSync(python, ['-c', 'import fastapi, uvicorn, sqlalchemy'], { cwd: root, encoding: 'utf8' })
if (check.status !== 0) {
  console.error('Trade API dependencies are missing. Run the .venv Python with -m pip install -r server/requirements.txt.')
  process.exit(1)
}
// This launcher is deliberately local-only and explicitly synthetic.
const env = { ...process.env, TRADE_DEMO_MODE: '1', TRADE_ENV: 'development', PYTHONUNBUFFERED: '1' }
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
function run(executable, args) {
  const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
}
console.log('Meraki synthetic trade development: frontend + API + unattended auction worker. No real transactions.')
run(python, ['-m', 'uvicorn', 'server.app:app', '--host', '127.0.0.1', '--port', '8004'])
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
// Initialise the API schema before starting a second process against it.
let ready = false
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8004/api/trade/health', { signal: AbortSignal.timeout(1000) })
    const health = response.ok ? await response.json() : null
    if (health?.synthetic === true) { ready = true; break }
  } catch { /* API may still be starting */ }
  await new Promise(resolve => setTimeout(resolve, 200))
}
if (ready && !stopping) {
  run(python, ['-m', 'server.worker'])
  run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'])
} else if (!stopping) {
  console.error('Synthetic trade API did not become ready on port 8004. Check its logs and port availability.')
  stop(1)
}
