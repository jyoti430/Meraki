import { isValidIsoDate, isFiniteNumber, parseCsv } from './csv'
import type {
  EvidenceRef,
  Provenance,
  SoilAnalyte,
  SoilAnalyteCode,
  SoilAnalyteDefinition,
  SoilEvidence,
  SoilImportResult,
  SoilSample,
  SoilSampleKind,
} from './types'
import { SOIL_IMPORT_TEMPLATE_VERSION } from './types'
import { daysBetween } from '../planning/format'

export const SOIL_IMPORT_HEADERS = ['plot_id', 'sample_date', 'depth_from_cm', 'depth_to_cm', 'analyte', 'value', 'unit', 'method', 'lab', 'source_kind'] as const

const unitList = (units: string[]) => units

export const soilAnalyteDefinitions: Record<SoilAnalyteCode, SoilAnalyteDefinition> = {
  ph: { code: 'ph', label: 'pH', basis: 'measured', canonicalUnit: 'pH', allowedUnits: unitList(['pH']), toCanonical: { pH: (v) => v } },
  ec: { code: 'ec', label: 'Electrical conductivity', basis: 'measured', canonicalUnit: 'dS/m', allowedUnits: unitList(['dS/m', 'mS/cm']), toCanonical: { 'dS/m': (v) => v, 'mS/cm': (v) => v } },
  organic_carbon: { code: 'organic_carbon', label: 'Organic carbon', basis: 'measured', canonicalUnit: 'g/kg', allowedUnits: unitList(['g/kg', '%']), toCanonical: { 'g/kg': (v) => v, '%': (v) => v * 10 } },
  available_n: { code: 'available_n', label: 'Available nitrogen (N)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  total_n: { code: 'total_n', label: 'Total nitrogen (N)', basis: 'total', canonicalUnit: 'g/kg', allowedUnits: unitList(['g/kg', '%']), toCanonical: { 'g/kg': (v) => v, '%': (v) => v * 10 } },
  available_p: { code: 'available_p', label: 'Available phosphorus (P)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  total_p: { code: 'total_p', label: 'Total phosphorus (P)', basis: 'total', canonicalUnit: 'g/kg', allowedUnits: unitList(['g/kg', '%']), toCanonical: { 'g/kg': (v) => v, '%': (v) => v * 10 } },
  available_k: { code: 'available_k', label: 'Available potassium (K)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  total_k: { code: 'total_k', label: 'Total potassium (K)', basis: 'total', canonicalUnit: 'g/kg', allowedUnits: unitList(['g/kg', '%']), toCanonical: { 'g/kg': (v) => v, '%': (v) => v * 10 } },
  available_s: { code: 'available_s', label: 'Available sulphur (S)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  zinc: { code: 'zinc', label: 'Zinc (Zn)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  iron: { code: 'iron', label: 'Iron (Fe)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  copper: { code: 'copper', label: 'Copper (Cu)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  manganese: { code: 'manganese', label: 'Manganese (Mn)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
  boron: { code: 'boron', label: 'Boron (B)', basis: 'available', canonicalUnit: 'mg/kg', allowedUnits: unitList(['mg/kg', 'ppm']), toCanonical: { 'mg/kg': (v) => v, ppm: (v) => v } },
}

const sourceKinds: Record<string, SoilSampleKind> = {
  laboratory: 'laboratory',
  lab: 'laboratory',
  'field-test-kit': 'field-test-kit',
  'field test kit': 'field-test-kit',
  sensor: 'soil-sensor',
  'soil-sensor': 'soil-sensor',
  'mapped-estimate': 'mapped-estimate',
  'map-estimate': 'mapped-estimate',
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const normaliseUnit = (unit: string) => unit.trim().replace(/\s+/g, ' ')

export function soilSampleEvidence(sample: SoilSample, decisionDate: string, maxAgeDays = 365): EvidenceRef {
  const age = Math.max(0, daysBetween(sample.sampledAt, decisionDate))
  const stale = age > maxAgeDays
  const status = sample.kind === 'mapped-estimate' ? 'estimated' : stale ? 'stale' : sample.kind === 'laboratory' ? 'verified' : 'reported'
  const caveats: string[] = []
  if (stale) caveats.push(`Soil sample is ${age} days old at the decision date (limit ${maxAgeDays} days).`)
  if (sample.kind === 'mapped-estimate') caveats.push('Mapped estimate, not a laboratory measurement; never used to overwrite a lab result.')
  if (!sample.method.trim()) caveats.push('Laboratory/field method was not recorded; values need review.')
  for (const analyte of sample.analytes) {
    if (analyte.value === null) caveats.push(`${analyte.label} kept as raw ${analyte.rawValue} ${analyte.rawUnit}; no safe conversion to ${analyte.unit}.`)
  }
  return {
    id: `soil-evidence-${sample.id}`,
    label: `${sample.kind === 'mapped-estimate' ? 'Mapped soil estimate' : sample.kind === 'laboratory' ? 'Laboratory soil sample' : 'Field soil observation'} · ${sample.depthFromCm}–${sample.depthToCm} cm`,
    status,
    confidence: sample.kind === 'mapped-estimate' ? 'low' : stale ? 'low' : sample.kind === 'laboratory' ? 'high' : 'medium',
    asOf: sample.sampledAt,
    validUntil: null,
    provenance: sample.provenance,
    caveats,
  }
}

function valueOf(sample: SoilSample | null, code: SoilAnalyteCode): number | null {
  return sample?.analytes.find((a) => a.code === code)?.value ?? null
}

/** Resolve a plot's soil evidence without letting a map estimate replace a measured result. */
export function resolveSoilEvidence(samples: SoilSample[], plotId: string, decisionDate: string, maxAgeDays = 365): SoilEvidence {
  const eligible = samples.filter((s) => s.plotId === plotId && s.sampledAt <= decisionDate)
  const measured = eligible.filter((s) => s.kind !== 'mapped-estimate').sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))[0] ?? null
  const estimates = eligible.filter((s) => s.kind === 'mapped-estimate').sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))
  const refs = [...(measured ? [soilSampleEvidence(measured, decisionDate, maxAgeDays)] : []), ...estimates.map((s) => soilSampleEvidence(s, decisionDate, maxAgeDays))]
  const caveats = refs.flatMap((r) => r.caveats)
  if (!measured && estimates.length) caveats.unshift('No measured soil result for this plot; mapped estimates are shown separately and are not verified.')
  if (!measured && !estimates.length) caveats.unshift('No soil sample available at or before the decision date. Soil condition is unknown, not zero.')
  if (measured && estimates.length) caveats.unshift(`${estimates.length} mapped estimate${estimates.length === 1 ? ' is' : 's are'} retained separately and did not overwrite the measured result.`)
  const status = measured ? soilSampleEvidence(measured, decisionDate, maxAgeDays).status : estimates.length ? 'estimated' : 'unknown'
  const confidence = measured ? soilSampleEvidence(measured, decisionDate, maxAgeDays).confidence : estimates.length ? 'low' : 'none'
  return {
    status,
    confidence,
    refs,
    measured,
    estimates,
    caveats,
    ph: valueOf(measured, 'ph'),
    availableN: valueOf(measured, 'available_n'),
    availableP: valueOf(measured, 'available_p'),
    availableK: valueOf(measured, 'available_k'),
    organicCarbon: valueOf(measured, 'organic_carbon'),
  }
}

/** Import reviewed plot-linked soil rows. Unknown plots and incompatible units are rejected, not guessed. */
export function importSoilCsv(csv: string, options: { knownPlotIds: string[]; today?: string }): SoilImportResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const rows = parseCsv(csv)
  const rejected: SoilImportResult['rejected'] = []
  const warnings: string[] = []
  const acceptedRows: { rowNumber: number; raw: string; sampleKey: string; sample: Omit<SoilSample, 'id' | 'analytes' | 'sourceRows'>; analyte: SoilAnalyte }[] = []
  if (!rows.length) return { templateVersion: SOIL_IMPORT_TEMPLATE_VERSION, accepted: [], rejected: [], warnings: ['The import is empty.'], rowsRead: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const missing = SOIL_IMPORT_HEADERS.filter((h) => !header.includes(h))
  if (missing.length) {
    return {
      templateVersion: SOIL_IMPORT_TEMPLATE_VERSION,
      accepted: [],
      rejected: [{ rowNumber: 1, raw: rows[0].join(','), errors: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`] }],
      warnings: [],
      rowsRead: rows.length - 1,
    }
  }
  const index = Object.fromEntries(SOIL_IMPORT_HEADERS.map((h) => [h, header.indexOf(h)]))
  const known = new Set(options.knownPlotIds)
  const seen = new Set<string>()
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]
    const get = (name: (typeof SOIL_IMPORT_HEADERS)[number]) => (cells[index[name]] ?? '').trim()
    const raw = cells.join(',')
    const errors: string[] = []
    const plotId = get('plot_id')
    const sampleDate = get('sample_date')
    const depthFrom = get('depth_from_cm')
    const depthTo = get('depth_to_cm')
    const code = get('analyte').toLowerCase() as SoilAnalyteCode
    const rawValue = get('value')
    const rawUnit = normaliseUnit(get('unit'))
    const method = get('method')
    const lab = get('lab')
    const source = sourceKinds[get('source_kind').toLowerCase()]
    if (!known.has(plotId)) errors.push(`Plot ${plotId || '(blank)'} does not exist; the row was not linked to a plot.`)
    if (!isValidIsoDate(sampleDate)) errors.push('sample_date must be a real YYYY-MM-DD calendar date.')
    else if (sampleDate > today) errors.push('sample_date is in the future; future observations cannot be imported as evidence.')
    if (!isFiniteNumber(depthFrom) || !isFiniteNumber(depthTo)) errors.push('depth_from_cm and depth_to_cm must be numbers.')
    else if (Number(depthFrom) < 0 || Number(depthTo) <= Number(depthFrom)) errors.push('depth_to_cm must be greater than depth_from_cm and both must be non-negative.')
    const def = soilAnalyteDefinitions[code]
    if (!def) errors.push(`Unknown analyte "${get('analyte')}". Use total_n or available_n, never one substituted for the other.`)
    if (!source) errors.push('source_kind must be laboratory, field-test-kit, soil-sensor or mapped-estimate.')
    if (!isFiniteNumber(rawValue)) errors.push('value must be numeric.')
    let normalised: number | null = null
    if (def) {
      const unitKey = Object.keys(def.toCanonical).find((u) => u.toLowerCase() === rawUnit.toLowerCase())
      if (!unitKey) errors.push(`Unit "${rawUnit || '(blank)'}" is incompatible with ${def.label}. Allowed: ${def.allowedUnits.join(', ')}. No guessed conversion is applied.`)
      else if (isFiniteNumber(rawValue)) normalised = def.toCanonical[unitKey](Number(rawValue))
    }
    if (code === 'total_n' && rawUnit.toLowerCase() === 'mg/kg') errors.push('Total nitrogen in mg/kg is not converted to g/kg without a reviewed method; import total_n in g/kg or % or review the row.')
    const key = `${plotId}|${sampleDate}|${depthFrom}|${depthTo}|${source ?? ''}|${lab}|${method}|${code}`
    if (seen.has(key)) errors.push(`Duplicate ${code} row for the same plot, date, depth and source.`)
    if (errors.length) {
      rejected.push({ rowNumber: r + 1, raw, errors })
      continue
    }
    seen.add(key)
    const provenance: Provenance = {
      sourceId: lab || `${source}-${sampleDate}`,
      kind: source === 'laboratory' ? 'laboratory' : source === 'mapped-estimate' ? 'mapped-estimate' : source === 'soil-sensor' ? 'soil-sensor' : 'field-test-kit',
      label: lab || (source === 'mapped-estimate' ? 'Mapped soil estimate' : 'Soil observation'),
      organisation: lab || 'Imported record',
      capturedAt: sampleDate,
      receivedAt: new Date().toISOString(),
      method,
      reference: lab,
      synthetic: false,
      note: source === 'mapped-estimate' ? 'Mapped estimate imported separately from laboratory results.' : '',
    }
    const sampleKey = `${plotId}|${sampleDate}|${depthFrom}|${depthTo}|${source}|${lab}`
    acceptedRows.push({
      rowNumber: r + 1,
      raw,
      sampleKey,
      sample: {
        plotId,
        sampledAt: sampleDate,
        receivedAt: new Date().toISOString(),
        depthFromCm: Number(depthFrom),
        depthToCm: Number(depthTo),
        kind: source!,
        lab,
        method,
        provenance,
      },
      analyte: {
        code,
        label: def!.label,
        rawValue,
        rawUnit,
        value: normalised,
        unit: def!.canonicalUnit,
        basis: def!.basis,
        method,
        rawRow: raw,
      },
    })
  }

  const bySample = new Map<string, SoilSample>()
  for (const row of acceptedRows) {
    const existing = bySample.get(row.sampleKey)
    if (existing) {
      existing.analytes.push(row.analyte)
      existing.sourceRows.push(row.raw)
    } else {
      bySample.set(row.sampleKey, { ...row.sample, id: uid('SOIL'), analytes: [row.analyte], sourceRows: [row.raw] })
    }
  }
  const accepted = [...bySample.values()]
  for (const sample of accepted) {
    const methods = [...new Set(sample.analytes.map((analyte) => analyte.method.trim()).filter(Boolean))]
    sample.method = methods.length ? methods.join('; ') : ''
    const unknown = sample.analytes.filter((a) => a.value === null)
    if (unknown.length) warnings.push(`${sample.plotId} ${sample.sampledAt}: ${unknown.length} value(s) preserved as raw text without conversion.`)
    if (!sample.lab && sample.kind === 'laboratory') warnings.push(`${sample.plotId} ${sample.sampledAt}: laboratory name is blank.`)
  }
  return { templateVersion: SOIL_IMPORT_TEMPLATE_VERSION, accepted, rejected, warnings, rowsRead: rows.length - 1 }
}

export const soilImportTemplate = `${SOIL_IMPORT_HEADERS.join(',')}
PLOT-DEMO-006,2026-11-02,0,20,ph,6.8,pH,1:2.5 soil:water suspension,DEMO-LAB-A,laboratory
PLOT-DEMO-006,2026-11-02,0,20,available_n,242,mg/kg,Kjeldahl/alkaline permanganate,DEMO-LAB-A,laboratory
PLOT-DEMO-006,2026-11-02,0,20,total_n,1.4,g/kg,Combustion,DEMO-LAB-A,laboratory
PLOT-DEMO-006,2026-11-02,0,20,available_p,18,mg/kg,Olsen,DEMO-LAB-A,laboratory
PLOT-DEMO-006,2026-11-02,0,20,available_k,190,mg/kg,Ammonium acetate,DEMO-LAB-A,laboratory
PLOT-DEMO-009,2026-11-01,0,15,ph,6.4,pH,Field kit,Field kit,field-test-kit
`
