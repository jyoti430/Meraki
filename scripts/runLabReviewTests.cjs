const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, '.test-build')
fs.rmSync(output, { recursive: true, force: true })

try {
  execFileSync(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    path.join(root, 'src/services/LabReviewService.ts'),
    '--outDir', output,
    '--module', 'commonjs',
    '--target', 'es2020',
    '--moduleResolution', 'node',
    '--skipLibCheck',
  ], { cwd: root, stdio: 'inherit' })
  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  execFileSync(process.execPath, ['--test', path.join(root, 'tests/labReviewService.test.cjs')], { cwd: root, stdio: 'inherit' })
} finally {
  fs.rmSync(output, { recursive: true, force: true })
}
