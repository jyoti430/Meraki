export type ReferenceLocation = 'nashik' | 'pune' | 'satara'
export type MarketCrop = 'tomato' | 'green_chilli'
export type SourceStatus = 'ok' | 'partial' | 'stale' | 'error'
export interface WeatherRow { date: string; t2m_min_c: number | null; t2m_max_c: number | null; precipitation_mm_day: number | null; et0_mm_day?: number | null }
export interface MarketRow {
  observation_date: string; market: string; commodity: string; variety: string | null; grade: string | null;
  price_min_rs_per_unit: number | null; price_max_rs_per_unit: number | null; price_modal_rs_per_unit: number | null;
  price_unit: string; arrivals_value: number | null; arrivals_unit: string;
}
export interface SourceEnvelope<T> {
  source_id: string; source_name: string; source_url: string; documentation_url: string; attribution: string; licence: string;
  status: SourceStatus; synthetic: false; location: { id: string; name: string; latitude: number; longitude: number; scope: string } | null;
  retrieved_at: string | null; available_at: string | null; provider_issued_at: string | null;
  observation_start: string | null; observation_end: string | null;
  cache: { hit: boolean; ttl_seconds: number; expires_at: string | null };
  warnings: string[]; error: { code: string; message: string } | null; units: Record<string, string>; data: T[];
}
export interface LiveSnapshot {
  server_time: string; forecast: SourceEnvelope<WeatherRow>; history: SourceEnvelope<WeatherRow>; market: SourceEnvelope<MarketRow>;
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const nullableNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const nullableString = (value: unknown) => value === null || typeof value === 'string'

/** Reject malformed envelopes instead of accidentally relabelling fixtures or missing data as live. */
export function parseLiveSnapshot(value: unknown): LiveSnapshot {
  if (!object(value) || typeof value.server_time !== 'string' || !Number.isFinite(Date.parse(value.server_time))) throw new Error('Invalid public data server timestamp.')
  for (const key of ['forecast', 'history', 'market'] as const) {
    const source = value[key]
    if (!object(source) || source.synthetic !== false) throw new Error('Public source response is missing or marked synthetic.')
    if (!['ok', 'partial', 'stale', 'error'].includes(String(source.status)) || !Array.isArray(source.data) || source.data.length > 5000
      || !Array.isArray(source.warnings) || source.warnings.some(w => typeof w !== 'string') || !object(source.cache) || !object(source.units)) throw new Error('Invalid public source response.')
    for (const field of ['source_id', 'source_name', 'source_url', 'documentation_url', 'attribution', 'licence']) if (typeof source[field] !== 'string') throw new Error('Missing public source attribution.')
    for (const field of ['retrieved_at', 'available_at', 'provider_issued_at', 'observation_start', 'observation_end']) if (!nullableString(source[field])) throw new Error('Invalid public source time metadata.')
    if (source.error !== null && (!object(source.error) || typeof source.error.message !== 'string')) throw new Error('Invalid source error metadata.')
    for (const row of source.data) {
      if (!object(row)) throw new Error('Invalid public source row.')
      const numbers = key === 'market' ? ['price_min_rs_per_unit', 'price_max_rs_per_unit', 'price_modal_rs_per_unit', 'arrivals_value'] : ['t2m_min_c', 't2m_max_c', 'precipitation_mm_day']
      if (numbers.some(field => !nullableNumber(row[field]))) throw new Error('Invalid public source measurement; missing values must be explicit nulls.')
      if (key === 'market' && ['market', 'commodity', 'observation_date', 'price_unit', 'arrivals_unit'].some(field => typeof row[field] !== 'string')) throw new Error('Invalid market row or units.')
      if (key !== 'market' && (typeof row.date !== 'string' || ('et0_mm_day' in row && !nullableNumber(row.et0_mm_day)))) throw new Error('Invalid weather row.')
    }
  }
  return value as unknown as LiveSnapshot
}

export async function fetchLiveSnapshot(location: ReferenceLocation, crop: MarketCrop, lang = 'en', signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LiveSnapshot> {
  if (!['nashik', 'pune', 'satara'].includes(location)) throw new Error('Select a public reference location.')
  if (!['tomato', 'green_chilli'].includes(crop)) throw new Error('Select a supported market crop.')
  const response = await fetcher(`/api/live-data/snapshot?${new URLSearchParams({ location, crop, lang })}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Public data gateway returned HTTP ${response.status}. Start npm run dev:live or check the gateway.`)
  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('Public data gateway returned invalid JSON.') }
  return parseLiveSnapshot(payload)
}
