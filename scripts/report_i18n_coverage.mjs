import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const localeDir = path.resolve('src/i18n/locales')
const exceptions = new Set(['app_name', 'fpo', 'auth_fpo', 'pf_area_placeholder'])

function objectFor(file, seen = new Set()) {
  const full = path.resolve(file)
  if (seen.has(full)) throw new Error(`Circular locale import: ${full}`)
  seen.add(full)
  const source = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const imports = new Map()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const clause = statement.importClause
    if (!clause) continue
    const target = path.resolve(path.dirname(full), `${statement.moduleSpecifier.text}.ts`)
    if (clause.name) imports.set(clause.name.text, target)
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) imports.set(element.name.text, target)
    }
  }
  const declarations = new Map()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) declarations.set(declaration.name.text, declaration.initializer)
    }
  }
  let defaultName
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) defaultName = statement.expression.text
  }
  let initializer = declarations.get(defaultName)
  while (initializer && (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer))) initializer = initializer.expression
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) throw new Error(`Could not read locale dictionary: ${full}`)
  const result = new Map()
  for (const property of initializer.properties) {
    if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression)) {
      const name = property.expression.text
      const target = imports.get(name)
      if (target) for (const [key, value] of objectFor(target, new Set(seen))) result.set(key, value)
      else {
        const local = declarations.get(name)
        if (local && ts.isObjectLiteralExpression(local)) {
          for (const item of local.properties) if (ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && (ts.isStringLiteral(item.initializer) || ts.isNoSubstitutionTemplateLiteral(item.initializer))) result.set(item.name.text, item.initializer.text)
        }
      }
    }
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) {
      result.set(property.name.text, property.initializer.text)
    }
  }
  seen.delete(full)
  return result
}

const english = objectFor(path.join(localeDir, 'en.ts'))
for (const code of ['hi', 'mr', 'ta', 'ml']) {
  const effective = objectFor(path.join(localeDir, `${code}.ts`))
  const missing = [...english.keys()].filter((key) => !effective.has(key))
  const untranslated = [...english].filter(([key, value]) => !exceptions.has(key) && effective.get(key) === value).map(([key]) => key)
  const translated = english.size - untranslated.length
  const percent = ((translated / english.size) * 100).toFixed(1)
  console.log(`${code}: ${translated}/${english.size} dictionary keys translated (${percent}%). ${untranslated.length} inherited English keys${untranslated.length ? `: ${untranslated.join(', ')}` : '.'}`)
  if (missing.length) console.error(`${code}: ${missing.length} missing keys: ${missing.join(', ')}`)
}
console.log('Coverage resolves locale module spreads and imports. It measures string differences across the bundle, not route usage or hardcoded English copy; consult docs/I18N_AUDIT.md for route status.')
