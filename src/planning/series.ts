import type { CropPlan } from './engine'
import { addDays, daysBetween, maxDate, minDate, toDate } from './format'

export interface WeekPoint { start: string; demand: number; supply: number; confirmed: number }

/** Spread an amount evenly across the days of [from, to] into weekly buckets. */
function spread(buckets: WeekPoint[], key: 'demand' | 'supply' | 'confirmed', amount: number, from: string, to: string) {
  if (!from || !to || amount <= 0 || to < from) return
  const days = daysBetween(from, to) + 1
  for (const b of buckets) {
    const bEnd = addDays(b.start, 6)
    const s = maxDate(b.start, from)
    const e = minDate(bEnd, to)
    if (s > e) continue
    b[key] += (amount * (daysBetween(s, e) + 1)) / days
  }
}

const mondayOf = (iso: string) => { const d = toDate(iso); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, -dow) }

/** Weekly buyer demand (orders spread over delivery windows) vs projected supply (harvest spread over harvest windows). */
export function weeklySeries(plans: CropPlan[]): WeekPoint[] {
  const dated = plans.filter((p) => p.deliveryStart && p.deliveryEnd)
  if (!dated.length) return []
  const from = mondayOf(dated.reduce((m, p) => minDate(m, p.deliveryStart), dated[0].deliveryStart))
  const to = dated.reduce((m, p) => maxDate(m, maxDate(p.deliveryEnd, p.harvestEnd || p.deliveryEnd)), dated[0].deliveryEnd)
  const buckets: WeekPoint[] = []
  for (let d = from; d <= to; d = addDays(d, 7)) buckets.push({ start: d, demand: 0, supply: 0, confirmed: 0 })
  for (const p of dated) {
    for (const o of p.orders) {
      const qty = Number(o.product.requiredQuantityKg) || 0
      const s = o.product.deliveryStartDate || p.deliveryStart
      const e = o.product.deliveryEndDate || p.deliveryEnd
      spread(buckets, 'demand', qty, s, e)
      if (o.product.orderType === 'Confirmed') spread(buckets, 'confirmed', qty, s, e)
    }
    // Each planted area harvests in its own order's window; existing crops only within the window they were counted for.
    for (const a of p.allocations) spread(buckets, 'supply', a.kg, a.harvestStart, a.harvestEnd)
    for (const ex of p.existing) spread(buckets, 'supply', ex.kg, ex.windowStart, ex.windowEnd)
  }
  return buckets
}

export const cumulative = (values: number[]) => values.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], [])
