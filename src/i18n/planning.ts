import { cropLabel, formatDate, type Lang, type TKey } from './index'
import { PLANNING_DATE } from '../planning/engine'

export type Translate = (key: TKey, vars?: Record<string, string | number>) => string

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }

export function formatOptionalDate(value: string | null | undefined, lang: Lang, fallback: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return fallback
  return formatDate(value, lang, options)
}

function localShortDate(value: string, lang: Lang): string {
  const match = value.match(/^(\d{1,2}) ([A-Za-z]{3})$/)
  if (!match || !MONTHS[match[2]]) return value
  const [baseYear, baseMonth] = PLANNING_DATE.split('-').map(Number)
  const month = MONTHS[match[2]]
  const year = month < baseMonth ? baseYear + 1 : baseYear
  return formatDate(`${year}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`, lang, { day: 'numeric', month: 'short' })
}

export function translateEligibilityReason(value: string, t: Translate): string {
  const keys: Record<string, TKey> = {
    'Membership inactive': 'reason_member_inactive',
    'Opted out this season': 'reason_opted_out',
    'Marked unavailable': 'reason_unavailable',
    'Participation not yet recorded': 'reason_participation_pending',
    'Declined this season’s plan': 'reason_declined',
  }
  return keys[value] ? t(keys[value]) : value
}

export function translatePlanningReason(value: string, t: Translate, lang: Lang): string {
  let match = value.match(/^No irrigation water – (.+) needs (low|medium|high) water$/)
  if (match) {
    const needKey = match[2] === 'high' ? 'market_high' : match[2] === 'medium' ? 'market_medium' : 'market_low'
    return t('reason_no_water', { crop: cropLabel(match[1], t).toLowerCase(), need: t(needKey).toLowerCase() })
  }
  if (value === 'Water availability not recorded – confirm with farmer') return t('reason_water_unknown')
  if (value === 'Assured water for a high-water crop') return t('reason_assured_water')
  match = value.match(/^Limited water – (.+) needs assured irrigation$/)
  if (match) return t('reason_limited_water', { crop: cropLabel(match[1], t).toLowerCase() })
  if (value === 'Water available') return t('reason_water_available')
  if (value === 'Limited water, but drip irrigation makes it workable') return t('reason_limited_drip')
  if (value === 'Limited water and no drip – yield risk in dry spells') return t('reason_dry_risk')
  if (value === 'Low-water crop suits limited water') return t('reason_low_water_fit')
  if (value === 'Soil type not recorded') return t('reason_soil_unknown')
  match = value.match(/^(.+) suits (.+)$/)
  if (match) return t('reason_soil_fit', { soil: match[1], crop: cropLabel(match[2], t).toLowerCase() })
  match = value.match(/^(.+) is less suited to (.+)$/)
  if (match) return t('reason_soil_caution', { soil: match[1], crop: cropLabel(match[2], t).toLowerCase() })
  match = value.match(/^pH ([\d.]+) \(([^)]+)\) within ([\d.]+)–([\d.]+)$/)
  if (match) return t('reason_ph_in_range', { ph: match[1], source: match[2], low: match[3], high: match[4] })
  match = value.match(/^pH ([\d.]+) \(([^)]+)\) outside preferred ([\d.]+)–([\d.]+)$/)
  if (match) return t('reason_ph_outside_range', { ph: match[1], source: match[2], low: match[3], high: match[4] })
  match = value.match(/^(.+) – verify before planning$/)
  if (match) return t('reason_verify_flag', { reason: match[1] })
  match = value.match(/^Occupied by (.+) until (.+) – past the sow-by date$/)
  if (match) return t('reason_occupied_past', { crop: cropLabel(match[1], t).toLowerCase(), date: localShortDate(match[2], lang) })
  match = value.match(/^Free after (.+) harvest \((.+)\)$/)
  if (match) return t('reason_free_after', { crop: cropLabel(match[1], t).toLowerCase(), date: localShortDate(match[2], lang) })
  if (value === 'Plot free now') return t('reason_plot_free')
  match = value.match(/^Farmer can sow only from (.+) – after the sow-by date$/)
  if (match) return t('reason_farmer_sow_late', { date: localShortDate(match[1], lang) })
  match = value.match(/^Farmer can sow only from (.+)$/)
  if (match) return t('reason_farmer_sow_from', { date: localShortDate(match[1], lang) })
  if (value === 'Farmer reported they cannot sow in time') return t('reason_cannot_sow')
  match = value.match(/^Farmer reported: (.+) – needs follow-up$/)
  if (match) return t('reason_farmer_reported', { note: match[1] === 'a problem' ? t('msg_problem').toLowerCase() : match[1] })
  const fixed: Record<string, TKey> = {
    'Perennial crop – supply comes only from existing orchards': 'reason_perennial',
    'Removed from this crop by you': 'reason_removed',
    'Land already assigned to other crops': 'reason_land_assigned',
    'Sowing window has passed': 'reason_window_passed',
    'Suitable reserve – not needed at current demand': 'reason_reserve',
  }
  return fixed[value] ? t(fixed[value]) : value
}
