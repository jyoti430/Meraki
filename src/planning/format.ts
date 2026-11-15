const DAY = 86_400_000

export const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
export const addDays = (iso: string, days: number) => new Date(toDate(iso).getTime() + days * DAY).toISOString().slice(0, 10)
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY)
export const minDate = (a: string, b: string) => (a < b ? a : b)
export const maxDate = (a: string, b: string) => (a > b ? a : b)

const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })

export const fmtDay = (iso: string) => (iso ? shortFmt.format(toDate(iso)) : '—')
export const fmtDate = (iso: string) => (iso ? longFmt.format(toDate(iso)) : '—')
export const fmtMonth = (iso: string) => monthFmt.format(toDate(iso))
export const fmtRange = (start: string, end: string) => (start && end ? `${fmtDay(start)} – ${fmtDay(end)}` : 'Dates not set')

export function fmtKg(kg: number) {
  if (!Number.isFinite(kg)) return '—'
  if (Math.abs(kg) >= 10_000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t`
  return `${Math.round(kg).toLocaleString('en-IN')} kg`
}

export const fmtAcres = (acres: number) => `${(Math.round(acres * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ac`
export const fmtPct = (ratio: number) => `${Math.round(ratio * 100)}%`
export const fmtInr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`
export const roundTo = (value: number, step: number) => Math.round(value / step) * step
export const ceilTo = (value: number, step: number) => Math.ceil(value / step - 1e-9) * step
