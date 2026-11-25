import { describe, expect, it } from 'vitest'
import {
  formatINR,
  formatDate,
  formatNumber,
  cropLabel,
  getTranslationCoverage,
  interpolateTranslation,
  LANGUAGES,
  normalizeLang,
  readStoredLanguage,
  soilLabel,
  statusTranslationKey,
  translations,
  type Lang,
} from './index'

describe('Meraki UI locales', () => {
  it('supports only English, Hindi, Marathi, Tamil and Malayalam with native names', () => {
    expect(LANGUAGES.map(({ code }) => code)).toEqual(['en', 'hi', 'mr', 'ta', 'ml'])
    expect(LANGUAGES.map(({ native }) => native)).toEqual(['English', 'हिन्दी', 'मराठी', 'தமிழ்', 'മലയാളം'])
    expect(normalizeLang('zh')).toBe('en')
    expect(normalizeLang('ms')).toBe('en')
    expect(normalizeLang('xx')).toBe('en')
    expect(normalizeLang('mr')).toBe('mr')
  })

  it('migrates an unsupported saved UI locale without changing farmer language data', () => {
    const values = new Map([['meraki.lang.v1', 'zh'], ['farmer.preferredLanguage', 'Urdu']])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    expect(readStoredLanguage(storage)).toBe('en')
    expect(values.get('meraki.lang.v1')).toBe('en')
    expect(values.get('farmer.preferredLanguage')).toBe('Urdu')
  })

  it('has matching keys and interpolation placeholders across every locale', () => {
    const englishKeys = Object.keys(translations.en).sort()
    for (const { code } of LANGUAGES) {
      const dictionary = translations[code] as Record<string, string>
      expect(Object.keys(dictionary).sort()).toEqual(englishKeys)
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${code}.${key} must not be empty`).not.toBe('')
      }
      for (const key of englishKeys) {
        const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort()
        expect(placeholders(dictionary[key]), `${code}.${key}`).toEqual(placeholders(translations.en[key as keyof typeof translations.en]))
      }
    }
  })

  it('formats dynamic numbers and preserves critical message placeholders', () => {
    const message = interpolateTranslation(translations.mr.message_fallback_batch_confirm, { count: 2, languages: 'Urdu' }, 'mr')
    expect(message).not.toMatch(/\{(?:count|languages)\}/)
    expect(message).toContain('Urdu')
    expect(formatNumber(1234.5, 'en')).toContain(',')
    expect(formatINR(1234, 'en')).toContain('₹')
    expect(statusTranslationKey('part_paid')).toBe('status_part_paid')
    expect(statusTranslationKey('published')).toBe('status_published')
    expect(statusTranslationKey('partially_awarded')).toBe('status_partially_awarded')
    expect(statusTranslationKey('scheduled')).toBe('status_scheduled')
    expect(statusTranslationKey('completed')).toBe('status_completed')
    expect(statusTranslationKey('future_status')).toBeUndefined()
  })

  it('maps auction outcome codes to translated labels without changing the underlying codes', () => {
    const outcomes = ['scheduled', 'open', 'provisional', 'awarded', 'no_sale', 'cancelled'] as const
    for (const status of outcomes) {
      const key = statusTranslationKey(status)
      expect(key, status).toBeDefined()
      for (const { code } of LANGUAGES.filter(({ code }) => code !== 'en')) {
        expect(translations[code][key!], `${code}.${status}`).not.toBe(translations.en[key!])
      }
    }
  })

  it('translates core Trade and message context keys in every supported locale', () => {
    for (const { code } of LANGUAGES.filter(({ code }) => code !== 'en')) {
      const untranslated = getTranslationCoverage(code as Exclude<Lang, 'en'>).untranslated
      expect(untranslated.filter((key) => /^(trq_|trc_|trui_|trb_|msg_(interface_language|preview_language|individual_language_policy|batch_language_policy|actual_language|reply_language|language_mismatch_confirm|sms_summary|simulated_reply|unicode))/.test(key)), code).toEqual([])
      const summary = interpolateTranslation(translations[code].trc_contract_summary, { quantity: '500 kg', price: '₹42', version: 3 }, code)
      const link = interpolateTranslation(translations[code].trq_open_contract, { id: 'contract-01', status: 'Provisional' }, code)
      expect(summary).not.toMatch(/\{(?:quantity|price|version)\}/)
      expect(link).not.toMatch(/\{(?:id|status)\}/)
      expect(translations[code].msg_batch_language_policy).toContain(code === 'hi' ? 'किसान' : code === 'mr' ? 'शेतकऱ्याच्या' : code === 'ta' ? 'விவசாயியின்' : 'കർഷകന്റെ')
    }
  })

  it('translates Farmer Details and supply safety copy with intact interpolation', () => {
    for (const { code } of LANGUAGES.filter(({ code }) => code !== 'en')) {
      const untranslated = getTranslationCoverage(code as Exclude<Lang, 'en'>).untranslated
      expect(untranslated.filter((key) => /^(fd_|sp_)/.test(key)), code).toEqual([])
      const prompt = interpolateTranslation(translations[code].sp_confirm_plan, { quantity: '1,250 kg' }, code)
      const consent = interpolateTranslation(translations[code].fd_confirm_membership, { action: translations[code].fd_activate_membership, name: 'Farmer' }, code)
      expect(prompt).not.toContain('{quantity}')
      expect(consent).not.toMatch(/\{(?:action|name)\}/)
    }
  })

  it('localises the fallback message shown after a simulated farmer confirmation', () => {
    for (const { code } of LANGUAGES) {
      const detail = translations[code].msg_confirmed_reply_detail
      expect(detail).toBeTruthy()
      if (code !== 'en') expect(detail).not.toBe(translations.en.msg_confirmed_reply_detail)
    }
  })

  it('discloses that message drafts in all five languages are simulated and need review', () => {
    const fiveLanguagePhrases: Record<Lang, string> = {
      en: 'English, Hindi, Marathi, Tamil, and Malayalam',
      hi: 'पाँचों भाषाओं',
      mr: 'पाचही भाषांतील',
      ta: 'ஐந்து மொழிகளிலுள்ள',
      ml: 'അഞ്ച് ഭാഷകളിലുമുള്ള',
    }
    for (const { code } of LANGUAGES) {
      const disclosure = translations[code].msg_simulation_disclosure
      expect(disclosure).toContain(fiveLanguagePhrases[code])
      expect(disclosure).not.toContain('Hindi and Marathi')
    }
  })

  it('uses 0-9 for numbers, dates, currencies and numeric examples in every UI language', () => {
    const digits = (value: string) => value.match(/\p{Nd}/gu) ?? []
    for (const { code } of LANGUAGES) {
      for (const value of [formatNumber(12345.6, code), formatDate('2026-11-25', code), formatINR(12345, code)]) {
        expect(digits(value).every((digit) => /^[0-9]$/.test(digit)), `${code}: ${value}`).toBe(true)
      }
      expect(translations[code].pf_area_placeholder).toBe('0.00')
      expect(translations[code].pf_ph_placeholder).toContain('6.5')
      expect(translations[code].pf_moisture_placeholder).toContain('25')
    }
  })

  it('localises dynamic buyer-order preview and validation text in every UI language', () => {
    for (const { code } of LANGUAGES) {
      const dictionary = translations[code]
      const sowBy = interpolateTranslation(dictionary.order_preview_sow_by, { date: '12 Jan 2027', days: 7 }, code)
      const validation = interpolateTranslation(dictionary.order_error_spec_range, { index: 2 }, code)
      const deliveryWeek = interpolateTranslation(dictionary.ex_week_of, { date: formatDate('2026-12-07', code) }, code)
      expect(sowBy).not.toMatch(/\{(?:date|days)\}/)
      expect(validation).not.toMatch(/\{index\}/)
      expect(deliveryWeek).not.toContain('{date}')
      expect(validation).toContain(formatNumber(2, code))
    }
  })

  it('provides translated shared-auction headings and service notices in each supported language', () => {
    for (const { code } of LANGUAGES) {
      const dictionary = translations[code]
      expect(dictionary.auction_title).toBeTruthy()
      expect(dictionary.auction_context_description.length).toBeGreaterThan(20)
      expect(dictionary.auction_service_unavailable).toBeTruthy()
      if (code !== 'en') {
        expect(dictionary.auction_title).not.toBe(translations.en.auction_title)
        expect(dictionary.auction_context_description).not.toBe(translations.en.auction_context_description)
      }
    }
  })

  it('provides translated Trade shell copy and preserves dynamic crop placeholders', () => {
    for (const { code } of LANGUAGES) {
      const dictionary = translations[code]
      expect(dictionary.trade_page_requirements).toBeTruthy()
      expect(dictionary.trade_connect_continue).toBeTruthy()
      expect(dictionary.trade_live_blocked).toBeTruthy()
      expect(dictionary.trade_demo_notice).toBeTruthy()
      expect(interpolateTranslation(dictionary.trade_page_requirement_for, { crop: 'टोमॅटो' }, code)).toContain('टोमॅटो')
      if (code !== 'en') {
        expect(dictionary.trade_page_requirements).not.toBe(translations.en.trade_page_requirements)
        expect(dictionary.trade_live_blocked).not.toBe(translations.en.trade_live_blocked)
        expect(dictionary.trade_demo_notice).not.toBe(translations.en.trade_demo_notice)
      }
    }
  })

  it('localises farmer, plot and crop-cycle forms without changing dynamic record labels', () => {
    for (const { code } of LANGUAGES) {
      const dictionary = translations[code]
      expect(dictionary.f_form_review_before_save).toBeTruthy()
      expect(dictionary.pf_report_complete).toBeTruthy()
      expect(dictionary.cf_estimate_warning).toBeTruthy()
      expect(interpolateTranslation(dictionary.pf_back_farmer, { name: 'Rina' }, code)).toContain('Rina')
      expect(interpolateTranslation(dictionary.cf_back_plot, { plot: 'North field' }, code)).toContain('North field')
      if (code !== 'en') {
        expect(dictionary.f_form_review_before_save).not.toBe(translations.en.f_form_review_before_save)
        expect(dictionary.pf_report_complete).not.toBe(translations.en.pf_report_complete)
        expect(dictionary.cf_estimate_warning).not.toBe(translations.en.cf_estimate_warning)
      }
    }
  })

  it('localises soil suggestions while retaining canonical soil values', () => {
    for (const { code } of LANGUAGES) {
      const translate = (key: keyof typeof translations.en) => translations[code][key]
      const label = soilLabel('Black soil', translate)
      expect(label).toBe(code === 'en' ? 'Black soil' : translations[code].soil_label_black)
    }
    expect(soilLabel('Farmer-defined soil note', (key) => translations.en[key])).toBe('Farmer-defined soil note')
  })

  it('localises crop display names while preserving buyer-defined variety data', () => {
    for (const { code } of LANGUAGES) {
      const translate = (key: keyof typeof translations.en) => translations[code][key]
      const label = cropLabel('Okra', translate)
      expect(label).toBe(code === 'en' ? 'Okra' : translations[code].crop_name_okra)
      expect(cropLabel('Arka Anamika', translate)).toBe('Arka Anamika')
    }
  })

  it('reports untranslated dictionary entries instead of counting English inheritance as coverage', () => {
    const coverage = getTranslationCoverage('mr')
    expect(coverage.translated).toBeLessThan(coverage.total)
    expect(coverage.untranslated).toContain('public_data_title')
    expect(coverage.untranslated).not.toContain('overview_title')
  })
})
