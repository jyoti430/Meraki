/** A hosted gateway is explicit configuration, never an excuse to use mock data. */
export interface ApiConfiguration {
  backend?: string
  trade?: string
  liveData?: string
  sensors?: string
}

function cleanBase(value: string, protocol?: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed
  let url: URL
  try { url = new URL(trimmed) } catch { throw new Error('Invalid API URL. Configure an HTTPS backend or a same-origin /api path.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('API URLs must use HTTP(S) without credentials, query strings or fragments.')
  }
  if (protocol === 'https:' && url.protocol !== 'https:') throw new Error('An HTTPS website requires an HTTPS API. A cloud website cannot silently use a laptop HTTP/USB gateway.')
  return url.toString().replace(/\/+$/, '')
}

export function resolveApiUrl(path: string, config: ApiConfiguration = {}, pageProtocol?: string): string {
  if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('API paths must start with /api/.')
  for (const [prefix, override] of [['/api/trade', config.trade], ['/api/live-data', config.liveData], ['/api/sensors', config.sensors]] as const) {
    if (override && (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))) {
      return cleanBase(override, pageProtocol) + path.slice(prefix.length)
    }
  }
  if (!config.backend?.trim()) return path
  return cleanBase(config.backend, pageProtocol) + path
}

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env ?? {}
export const apiConfiguration: ApiConfiguration = {
  backend: env.VITE_BACKEND_URL,
  trade: env.VITE_TRADE_API_URL,
  liveData: env.VITE_LIVE_DATA_API_URL,
  sensors: env.VITE_SENSOR_API_URL,
}
export const apiUrl = (path: string) => resolveApiUrl(path, apiConfiguration, typeof window === 'undefined' ? undefined : window.location.protocol)
