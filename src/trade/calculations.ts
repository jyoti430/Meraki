/** UI previews only. The server recomputes every authoritative amount. */
export function decimalToInteger(value: string, decimals: number): number {
  const text = value.trim()
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text)) throw new Error(`Enter a non-negative number with at most ${decimals} decimal places.`)
  const [whole, fraction = ''] = text.split('.')
  const scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'))
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('This amount is too large.')
  return Number(scaled)
}

function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Amounts must be non-negative safe integers.')
  return BigInt(value)
}

export function lineAmount(weightG: number, pricePaisePerKg: number): number {
  const result = (integer(weightG) * integer(pricePaisePerKg) + 500n) / 1000n
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('This amount is too large.')
  return Number(result)
}

export function allocateMembers(totalPaise: number, members: { member_id: string; weight_g: number }[]) {
  const total = integer(totalPaise)
  if (!members.length || new Set(members.map((m) => m.member_id)).size !== members.length) throw new Error('Add unique member references.')
  const sum = members.reduce((s, m) => s + integer(m.weight_g), 0n)
  if (sum === 0n || members.some((m) => !m.member_id.trim() || m.weight_g <= 0)) throw new Error('Each member needs a positive contribution.')
  const shares = members.map((m, index) => ({ ...m, index, amount: total * BigInt(m.weight_g) / sum, remainder: total * BigInt(m.weight_g) % sum }))
  let remaining = total - shares.reduce((s, m) => s + m.amount, 0n)
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? compareMemberIds(a.member_id, b.member_id) : a.remainder > b.remainder ? -1 : 1)
  for (const share of ranked) { if (remaining <= 0n) break; share.amount += 1n; remaining -= 1n }
  return shares.map((m) => ({ member_id: m.member_id, amount_paise: Number(m.amount) }))
}

// Python's authoritative ledger sorts Unicode code points, independent of
// browser locale and UTF-16 surrogate ordering.
function compareMemberIds(a: string, b: string): number {
  const left = Array.from(a, (character) => character.codePointAt(0)!), right = Array.from(b, (character) => character.codePointAt(0)!)
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

export function validateReceipt(receivedG: number, acceptedG: number, downgradedG: number, rejectedG: number, reason: string): string {
  if ([receivedG, acceptedG, downgradedG, rejectedG].some((n) => !Number.isSafeInteger(n) || n < 0)) return 'Weights must be non-negative whole grams.'
  if (acceptedG + downgradedG + rejectedG !== receivedG) return 'Accepted, downgraded and rejected weights must equal received weight.'
  if ((downgradedG > 0 || rejectedG > 0) && !reason.trim()) return 'Add a reason for downgraded or rejected produce.'
  return ''
}

/** Supports both signed legacy adjustments and the explicit debit/credit ledger. */
export function adjustmentBreakdown(statement: { adjustments_paise: number; deductions_paise?: number; credits_paise?: number }) {
  return {
    deductions_paise: statement.deductions_paise ?? Math.max(0, statement.adjustments_paise),
    credits_paise: statement.credits_paise ?? Math.max(0, -statement.adjustments_paise),
  }
}

export const kg = (grams: number) => `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(grams / 1000)} kg`
export const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100)
export const timestamp = (value?: string) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
export const localDateTime = (value: string) => {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
export const isoDate = (value: string) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) throw new Error('Choose a valid date and time.')
  return new Date(value).toISOString()
}
