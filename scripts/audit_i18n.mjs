import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve('src')
const userFacingProps = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'aria-roledescription'])
const copyFields = new Set(['label', 'title', 'description', 'placeholder', 'help', 'hint', 'error', 'emptyLabel', 'emptyText'])
// These exact values are deliberately shared brand, acronym, unit, protocol, or locale metadata.
// Longer phrases containing them remain visible to the audit (for example, "Meraki home").
const explicitExceptions = new Set([
  'Meraki', 'FPO', 'INR', 'SGD', 'USD', 'SMS', 'BLE', 'HTTP', 'API', 'QC',
  'kg', 't', 'ac', 'ha', '°C', '% RH', '@SENSOR', 'device_id', 'X-Sensor-Key',
  'CC BY 4.0', 'Open-Meteo terms', 'English', 'Hindi', 'Marathi', 'Tamil', 'Malayalam',
])
const coreFiles = new Set([
  'src/components/layout/Sidebar.tsx',
  'src/pages/Auctions.tsx', 'src/pages/FarmerDetails.tsx', 'src/pages/Messages.tsx',
  'src/exporter/pages/Dashboard.tsx', 'src/exporter/pages/Requirements.tsx', 'src/exporter/pages/RequirementDetails.tsx',
  'src/trade/Auctions.tsx', 'src/trade/DemoTradeBoard.tsx', 'src/trade/Requirements.tsx', 'src/trade/Contracts.tsx', 'src/trade/ui.tsx',
])
const coreLiteralExceptions = new Map([
  ['src/pages/Auctions.tsx', new Set(['/kg'])],
  ['src/pages/FarmerDetails.tsx', new Set(['ORD-DEMO-024'])],
  ['src/pages/Messages.tsx', new Set(['WhatsApp'])],
  ['src/trade/DemoTradeBoard.tsx', new Set(['/ kg'])],
  ['src/trade/Requirements.tsx', new Set(['/ kg'])],
  ['src/trade/ui.tsx', new Set(['{value} (kg)', '{value} (₹)'])],
])
const findings = new Map()

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'locales' || entry.name === '__snapshots__' ? [] : walk(full)
    return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
  })
}

function record(file, node, value, category) {
  const text = String(value).replace(/\s+/g, ' ').trim()
  if (!text || explicitExceptions.has(text) || /^[\p{P}\p{S}\d\s]+$/u.test(text)) return
  const relative = path.relative(process.cwd(), file)
  const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
  const rows = findings.get(relative) ?? []
  rows.push({ line, category, text })
  findings.set(relative, rows)
}

function templateCopy(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (!ts.isTemplateExpression(node)) return null
  const literalParts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
  if (!/[\p{L}]/u.test(literalParts.join(''))) return null
  return literalParts.join(' {value} ')
}

for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  function visit(node) {
    if (ts.isJsxText(node)) record(file, node, node.getText(), 'JSX text')
    if (ts.isJsxAttribute(node) && userFacingProps.has(node.name.getText()) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) record(file, node.initializer, node.initializer.text, node.name.getText())
      const directTemplate = templateCopy(node.initializer)
      if (directTemplate !== null) record(file, node.initializer, directTemplate, node.name.getText())
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expression = node.initializer.expression
        if (ts.isStringLiteral(expression)) record(file, expression, expression.text, node.name.getText())
        const template = templateCopy(expression)
        if (template !== null) record(file, expression, template, node.name.getText())
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && copyFields.has(node.name.text) && ts.isStringLiteral(node.initializer)) {
      record(file, node.initializer, node.initializer.text, `copy field: ${node.name.text}`)
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && copyFields.has(node.name.text)) {
      const template = templateCopy(node.initializer)
      if (template !== null) record(file, node.initializer, template, `copy field: ${node.name.text}`)
    }
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression) {
      if (ts.isStringLiteral(node.expression)) record(file, node.expression, node.expression.text, 'JSX string expression')
      const template = templateCopy(node.expression)
      if (template !== null) record(file, node.expression, template, 'JSX template expression')
    }
    if (ts.isCallExpression(node)) {
      const callName = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ''
      if (['confirm', 'alert', 'setError', 'setNotice', 'setSentNotice', 'setMessage'].includes(callName)) {
        const arg = node.arguments[0]
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) record(file, arg, arg.text, `message call: ${callName}`)
      if (arg) { const template = templateCopy(arg); if (template !== null) record(file, arg, template, `message call: ${callName}`) }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}

const total = [...findings.values()].reduce((sum, entries) => sum + entries.length, 0)
const coreFindings = [...findings.entries()].filter(([file]) => coreFiles.has(file)).flatMap(([file, entries]) => entries.filter(({ text }) => !coreLiteralExceptions.get(file)?.has(text)).map((entry) => ({ file, ...entry })))
const coreOnly = process.argv.includes('--check-core')
console.log(`Static user-facing literal audit: ${total} candidates in ${findings.size} source files.`)
console.log(`Exact shared-value exceptions: ${explicitExceptions.size} brand, acronym, unit, protocol, licence and locale metadata values.`)
console.log('The scan reports hardcoded JSX copy, accessible labels, selected copy fields, interpolated JSX templates and literal feedback calls. Review each candidate; identifiers and data values still need human classification.')
console.log(`Core route check: ${coreFiles.size} routes/components scanned; ${coreFindings.length ? `FAIL (${coreFindings.length} unallowlisted candidates)` : 'PASS'}.`)
for (const { file, line, category, text } of coreFindings) console.error(`${file}:${line} ${category}: ${text}`)
if (!coreOnly) {
  for (const [file, entries] of [...findings.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const preview = entries.slice(0, 5).map(({ line, category, text }) => `${line} ${category}: ${text.slice(0, 100)}`).join(' | ')
    console.log(`${file}: ${entries.length}${preview ? ` — ${preview}` : ''}`)
  }
}
if (coreFindings.length) process.exitCode = 1
