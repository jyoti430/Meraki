import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const localeDir = path.resolve('src/i18n/locales')
const exceptions = new Set(['app_name', 'fpo', 'auth_fpo', 'pf_area_placeholder'])

function readExplicitDictionary(code) {
  const file = path.join(localeDir, `${code}.ts`)
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let object
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === code && node.initializer) {
      let initializer = node.initializer
      while (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) initializer = initializer.expression
      if (ts.isObjectLiteralExpression(initializer)) object = initializer
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (!object) throw new Error(`Could not read locale dictionary: ${code}`)
  const result = new Map()
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer))) {
      result.set(property.name.text, property.initializer.text)
    }
  }
  return result
}

const english = readExplicitDictionary('en')
for (const code of ['hi', 'mr', 'ta', 'ml']) {
  const effective = new Map(english)
  for (const [key, value] of readExplicitDictionary(code)) effective.set(key, value)
  const untranslated = [...english].filter(([key, value]) => !exceptions.has(key) && effective.get(key) === value).map(([key]) => key)
  const translated = english.size - untranslated.length
  const percent = ((translated / english.size) * 100).toFixed(1)
  console.log(`${code}: ${translated}/${english.size} dictionary keys translated (${percent}%). ${untranslated.length} inherited English keys${untranslated.length ? `: ${untranslated.join(', ')}` : '.'}`)
}
console.log('This is dictionary value coverage only; it does not measure which keys are used on each route or remaining hardcoded UI text.')
