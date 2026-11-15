import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python = process.env.TRADE_PYTHON || path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) {
  console.error('Create .venv and install server/requirements.txt first. See docs/LIVE_DATA.md.')
  process.exit(1)
}
const check = spawnSync(python, ['-c', 'import fastapi, uvicorn, httpx'], { cwd: root, encoding: 'utf8' })
if (check.status !== 0) { console.error('Install server/requirements.txt using the .venv Python first.'); process.exit(1) }
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
function run(command, args) {
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
console.log('Public reference data development. No farm identities, private reports or trade commands are sent.')
run(python, ['-m', 'uvicorn', 'server.live_data:app', '--host', '127.0.0.1', '--port', '8002'])
let ready = false
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:8002/api/live-data/health', { signal: AbortSignal.timeout(1000) })
    const health = response.ok ? await response.json() : null
    if (health?.mode === 'public_reference_development' && health?.synthetic === false) { ready = true; break }
  } catch { /* New API process may still be starting. */ }
  await new Promise(resolve => setTimeout(resolve, 200))
}
if (ready && !stopping) run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5175', '--strictPort'])
else if (!stopping) { console.error('Live data API could not start on port 8002. Check port availability and logs.'); stop(1) }
