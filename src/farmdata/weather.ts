import { isValidIsoDate, isFiniteNumber, parseCsv } from './csv'
import type { EvidenceRef, Provenance, WeatherAdapter, WeatherImportResult, WeatherRecord, WeatherVariable } from './types'
import { WEATHER_IMPORT_TEMPLATE_VERSION } from './types'
import { addDays, daysBetween } from '../planning/format'

const units: Record<WeatherVariable, { unit: string; allowed: string[] }> = {
  temp_min_c: { unit: '°C', allowed: ['°c', 'c', 'degc'] },
  temp_max_c: { unit: '°C', allowed: ['°c', 'c', 'degc'] },
  rainfall_mm: { unit: 'mm', allowed: ['mm'] },
  humidity_pct: { unit: '%', allowed: ['%'] },
  solar_mj_m2: { unit: 'MJ/m²', allowed: ['mj/m2', 'mj/m²'] },
  et0_mm: { unit: 'mm', allowed: ['mm'] },
}

export const WEATHER_IMPORT_HEADERS = ['date', 'variable', 'value', 'unit', 'kind', 'issued_at', 'horizon_days', 'source'] as const

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Parse weather rows while preserving forecast issue time and horizon. */
export function importWeatherCsv(csv: string, options: { today?: string; plotId?: string | null } = {}): WeatherImportResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const rows = parseCsv(csv)
  const errors: string[] = []
  const warnings: string[] = []
  const records: WeatherRecord[] = []
  if (!rows.length) return { templateVersion: WEATHER_IMPORT_TEMPLATE_VERSION, records, errors: ['The weather import is empty.'], warnings, rowsRead: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const missing = WEATHER_IMPORT_HEADERS.filter((h) => !header.includes(h))
  if (missing.length) return { templateVersion: WEATHER_IMPORT_TEMPLATE_VERSION, records, errors: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`], warnings, rowsRead: rows.length - 1 }
  const index = Object.fromEntries(WEATHER_IMPORT_HEADERS.map((h) => [h, header.indexOf(h)]))
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]
    const get = (name: (typeof WEATHER_IMPORT_HEADERS)[number]) => (cells[index[name]] ?? '').trim()
    const rowErrors: string[] = []
    const date = get('date')
    const variable = get('variable') as WeatherVariable
    const value = get('value')
    const unit = get('unit').toLowerCase()
    const kind = get('kind').toLowerCase()
    const issuedAt = get('issued_at')
    const horizonText = get('horizon_days')
    const source = get('source') || 'Imported weather row'
    if (!isValidIsoDate(date)) rowErrors.push('date must be a real YYYY-MM-DD calendar date.')
    if (!(variable in units)) rowErrors.push(`Unknown weather variable "${get('variable')}".`)
    else if (!units[variable].allowed.includes(unit)) rowErrors.push(`Unit "${get('unit')}" is incompatible with ${variable}; expected ${units[variable].unit}.`)
    if (!isFiniteNumber(value)) rowErrors.push('value must be numeric.')
    if (kind !== 'observed' && kind !== 'forecast') rowErrors.push('kind must be observed or forecast.')
    let horizon: number | null = null
    if (kind === 'forecast') {
      if (!issuedAt) rowErrors.push('Forecast rows require issued_at; an undated forecast is not evidence.')
      if (!isFiniteNumber(horizonText)) rowErrors.push('Forecast rows require horizon_days.')
      else {
        horizon = Number(horizonText)
        if (!Number.isInteger(horizon) || horizon < 0 || horizon > 30) rowErrors.push('horizon_days must be a whole number between 0 and 30.')
      }
      if (issuedAt && isValidIsoDate(issuedAt.slice(0, 10)) && isValidIsoDate(date) && horizon != null) {
        const issuedDate = issuedAt.slice(0, 10)
        if (date < issuedDate) rowErrors.push('A forecast date cannot be before its issue date.')
        if (date > addDays(issuedDate, horizon)) rowErrors.push('Forecast date falls outside its stated horizon.')
      }
    }
    if (kind === 'observed' && isValidIsoDate(date) && date > today) rowErrors.push('An observed weather value cannot be in the future.')
    if (rowErrors.length) {
      errors.push(`Row ${r + 1}: ${rowErrors.join(' ')}`)
      continue
    }
    const provenance: Provenance = {
      sourceId: source,
      kind: 'manual-import',
      label: source,
      organisation: source,
      capturedAt: date,
      receivedAt: new Date().toISOString(),
      method: 'CSV import',
      reference: source,
      synthetic: /synthetic|fixture|demo/i.test(source),
      note: '',
    }
    records.push({
      id: uid('WX'),
      adapterId: 'weather-csv',
      plotId: options.plotId ?? null,
      date,
      variable,
      value: Number(value),
      unit: units[variable].unit,
      kind: kind === 'forecast' ? 'forecast' : 'observed',
      issuedAt: kind === 'forecast' ? issuedAt : null,
      horizonDays: kind === 'forecast' ? horizon : null,
      provenance,
      caveats: kind === 'forecast' ? ['Forecast, not an observation. Retained with issue time and horizon.'] : [],
    })
  }
  if (!records.some((r) => r.kind === 'forecast')) warnings.push('No forecast rows were imported; only historical observations are available.')
  return { templateVersion: WEATHER_IMPORT_TEMPLATE_VERSION, records, errors, warnings, rowsRead: rows.length - 1 }
}

function fixtureProvenance(capturedAt: string): Provenance {
  return {
    sourceId: 'synthetic-weather-fixture',
    kind: 'synthetic-fixture',
    label: 'Synthetic weather fixture',
    organisation: 'Meraki development fixture',
    capturedAt,
    receivedAt: new Date().toISOString(),
    method: 'Deterministic fixture; no external API call',
    reference: 'weather-fixture-2026-11-16',
    synthetic: true,
    note: 'Synthetic values for development. Not a live forecast and not a field observation.',
  }
}

/**
 * A deterministic adapter used to exercise the contract without claiming a permitted
 * government/commercial weather API. A failure can be injected so the UI can show it.
 */
export function createFixtureWeatherAdapter(options: { failReason?: string } = {}): WeatherAdapter {
  return {
    id: 'synthetic-weather-fixture',
    label: 'Synthetic weather fixture',
    kind: 'fixture',
    synthetic: true,
    fetch({ plotId, decisionDate }) {
      const startedAt = new Date().toISOString()
      if (options.failReason) {
        return {
          id: uid('WXRUN'), adapterId: this.id, adapterLabel: this.label, status: 'failed', startedAt, finishedAt: new Date().toISOString(),
          records: [], issuedAt: null, horizonDays: null, error: options.failReason, caveats: ['Adapter failure is visible; no weather evidence was recorded.'], synthetic: true,
        }
      }
      const issuedAt = `${decisionDate}T06:00:00Z`
      const records: WeatherRecord[] = []
      const shape = [
        { d: 0, min: 17.2, max: 30.4, rain: 0 },
        { d: 1, min: 16.8, max: 31.1, rain: 0 },
        { d: 2, min: 18.1, max: 29.6, rain: 2.4 },
        { d: 3, min: 17.4, max: 28.8, rain: 5.1 },
        { d: 4, min: 16.9, max: 29.2, rain: 0.8 },
        { d: 5, min: 17.8, max: 30.7, rain: 0 },
        { d: 6, min: 18.4, max: 31.5, rain: 0 },
      ]
      for (const point of shape) {
        const date = addDays(decisionDate, point.d)
        for (const [variable, value] of [['temp_min_c', point.min], ['temp_max_c', point.max], ['rainfall_mm', point.rain]] as const) {
          records.push({
            id: uid('WX'), adapterId: this.id, plotId, date, variable, value,
            unit: units[variable].unit, kind: 'forecast', issuedAt, horizonDays: 7,
            provenance: fixtureProvenance(date),
            caveats: ['Synthetic forecast fixture; not a live weather service.'],
          })
        }
      }
      return {
        id: uid('WXRUN'), adapterId: this.id, adapterLabel: this.label, status: 'ok', startedAt, finishedAt: new Date().toISOString(),
        records, issuedAt, horizonDays: 7,
        error: '',
        caveats: ['Synthetic 7-day forecast fixture. A week forecast cannot establish conditions for a whole crop cycle.'],
        synthetic: true,
      }
    },
  }
}

export function weatherEvidenceFrom(records: WeatherRecord[], decisionDate: string): EvidenceRef | null {
  const forecasts = records.filter((r) => r.kind === 'forecast' && r.date >= decisionDate && r.issuedAt && r.issuedAt.slice(0, 10) <= decisionDate && (r.horizonDays ?? 0) >= daysBetween(decisionDate, r.date))
  if (!forecasts.length) return null
  const issueDates = forecasts.map((r) => r.issuedAt!).sort()
  const latestIssueAt = issueDates[issueDates.length - 1]
  const issueRecords = forecasts.filter((r) => r.issuedAt === latestIssueAt)
  const horizon = Math.max(...issueRecords.map((r) => r.horizonDays ?? 0))
  const synthetic = issueRecords.some((r) => r.provenance.synthetic)
  return {
    id: `weather-evidence-${latestIssueAt}`,
    label: `${synthetic ? 'Synthetic' : 'Imported'} ${horizon}-day forecast issued ${latestIssueAt.slice(0, 10)}`,
    status: synthetic ? 'estimated' : 'reported',
    confidence: synthetic ? 'low' : 'medium',
    asOf: latestIssueAt.slice(0, 10),
    validUntil: addDays(latestIssueAt.slice(0, 10), horizon),
    provenance: issueRecords[0].provenance,
    caveats: [
      'Forecast issue time and horizon are preserved.',
      'A short forecast is context for the decision date; it does not establish weather over the crop cycle.',
      ...(synthetic ? ['Synthetic fixture; not a live forecast.'] : []),
    ],
  }
}
