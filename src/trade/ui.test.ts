import { describe, expect, it } from 'vitest'
import { interpolateTranslation, LANGUAGES, translations } from '../i18n'
import { localizeTradeError, localizedTradeTimestamp } from './ui'

describe('Trade form validation localisation', () => {
  it('localises shared field validation and exact criteria errors in every UI language', () => {
    for (const { code } of LANGUAGES) {
      const translate = (key: keyof typeof translations.en, vars?: Record<string, string | number>) => interpolateTranslation(translations[code][key], vars, code)
      const positive = localizeTradeError('Quantity must be greater than zero.', translate)
      const expected = interpolateTranslation(translations[code].trui_validation_positive, { field: translate('ex_quantity') }, code)
      expect(positive).toBe(expected)
      expect(positive).not.toMatch(/\{field\}/)
      expect(localizeTradeError('Add at most 30 buyer quality criteria.', translate)).toBe(translate('trui_validation_quality_count'))
      expect(localizeTradeError('Quantity exceeds the remaining requirement.', translate)).toBe(translate('trui_validation_quantity_remaining'))
      const decimalError = localizeTradeError('Enter a non-negative number with at most 3 decimal places.', translate)
      expect(decimalError).toBe(translate('trui_validation_decimal', { count: '3' }))
      expect(decimalError).not.toContain('{count}')
      expect(localizeTradeError('This amount is too large.', translate)).toBe(translate('trui_validation_too_large'))
      expect(localizeTradeError('Amounts must be non-negative safe integers.', translate)).toBe(translate('trui_validation_safe_integer'))
      expect(localizedTradeTimestamp(undefined, code, translate)).toBe(translate('trui_not_recorded'))
      if (code !== 'en') {
        expect(positive).not.toBe('Quantity must be greater than zero.')
        expect(localizeTradeError('Check each buyer quality criterion.', translate)).not.toBe('Check each buyer quality criterion.')
      }
    }
  })
})
