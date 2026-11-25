import { describe, expect, it } from 'vitest'
import { interpolateTranslation, translations } from './index'
import { formatOptionalDate, translateEligibilityReason, translatePlanningReason } from './planning'

const translator = (lang: 'hi' | 'mr' | 'ta' | 'ml') => (key: keyof typeof translations.en, vars?: Record<string, string | number>) =>
  interpolateTranslation(translations[lang][key], vars, lang)

describe('planning evidence localization', () => {
  it('translates generated water and soil suitability reasons without changing crop identifiers', () => {
    const t = translator('mr')
    expect(translatePlanningReason('No irrigation water – okra needs high water', t, 'mr')).toContain('भेंडी')
    expect(translatePlanningReason('Black soil suits tomato', t, 'mr')).toContain('टोमॅटो')
    expect(translatePlanningReason('Soil type not recorded', t, 'mr')).toContain('नोंदलेला नाही')
  })

  it('localizes engine short dates in the Rabi season', () => {
    const translated = translatePlanningReason('Free after okra harvest (4 Dec)', translator('ta'), 'ta')
    expect(translated).toContain('வெண்டைக்காய்')
    expect(translated).not.toContain('Dec')
  })

  it('keeps missing or invalid calendar dates from breaking the plan and labels them explicitly', () => {
    expect(formatOptionalDate('', 'mr', 'लागू नाही')).toBe('लागू नाही')
    expect(formatOptionalDate('not-a-date', 'mr', 'लागू नाही')).toBe('लागू नाही')
    expect(formatOptionalDate('2026-11-29', 'mr', 'लागू नाही')).not.toContain('Nov')
  })

  it('translates eligibility states and leaves unknown user-authored copy intact', () => {
    expect(translateEligibilityReason('Participation not yet recorded', translator('ml'))).not.toBe('Participation not yet recorded')
    expect(translatePlanningReason('Farmer reported: well is drying up – needs follow-up', translator('hi'), 'hi')).toContain('well is drying up')
    expect(translatePlanningReason('A future engine reason', translator('hi'), 'hi')).toBe('A future engine reason')
  })
})
