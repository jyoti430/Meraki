import { describe, expect, it } from 'vitest'
import { interpolateTranslation, translations } from '../i18n'
import { composeInstruction, individualMessageLanguageDecision, languageFor, languages, resolveMessageLanguage, simulatedReplyText } from './messages'
import type { Allocation } from './engine'

const allocation: Allocation = {
  crop: 'Okra', orderId: 'ORD-DEMO-024', buyerName: 'Buyer', variety: 'Arka Anamika',
  sowFrom: '2026-12-01', sowBy: '2026-12-15', harvestStart: '2027-02-01', harvestEnd: '2027-02-15',
  farmerId: 'FPO-DEMO-001', farmerName: 'Sita', plotId: 'PLOT-001', plotName: 'North field', acres: 0.75,
  kg: 500, kgRange: [400, 600], fit: 'good', reasons: [], phase: 'confirmed',
}

describe('farmer communication language', () => {
  it('offers reviewed-as-code templates for all five supported communication languages', () => {
    expect(languages.map(({ id }) => id)).toEqual(['English', 'Hindi', 'Marathi', 'Tamil', 'Malayalam'])
    expect(languages.map(({ label }) => label)).toEqual(['English', 'हिन्दी', 'मराठी', 'தமிழ்', 'മലയാളം'])
    expect(resolveMessageLanguage('English')).toEqual({ language: 'English', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('hi')).toEqual({ language: 'Hindi', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('हिन्दी')).toEqual({ language: 'Hindi', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('Marathi')).toEqual({ language: 'Marathi', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('मराठी')).toEqual({ language: 'Marathi', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('ta')).toEqual({ language: 'Tamil', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('தமிழ்')).toEqual({ language: 'Tamil', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('ml')).toEqual({ language: 'Malayalam', needsCoordinatorConfirmation: false })
    expect(resolveMessageLanguage('മലയാളം')).toEqual({ language: 'Malayalam', needsCoordinatorConfirmation: false })
  })

  it('does not silently map Urdu or other unsupported preferences to Hindi', () => {
    expect(resolveMessageLanguage('Urdu')).toEqual({ language: 'English', needsCoordinatorConfirmation: true })
    expect(languageFor('Urdu')).toBe('English')
  })

  it('separates the manually selected individual preview from farmer preference and batch language', () => {
    expect(individualMessageLanguageDecision('Hindi', 'Hindi')).toBeNull()
    expect(individualMessageLanguageDecision('Hindi', 'Marathi')).toBe('preview-differs-from-preference')
    expect(individualMessageLanguageDecision('Urdu', 'Marathi')).toBe('unsupported-preference')
    expect(languageFor('Tamil')).toBe('Tamil')
    expect(languageFor('Urdu')).toBe('English')
  })

  it('treats an empty preference as the default without changing stored values', () => {
    const storedPreference = ''
    expect(resolveMessageLanguage(storedPreference).needsCoordinatorConfirmation).toBe(false)
    expect(storedPreference).toBe('')
  })

  it('composes a localized draft while retaining Latin digits, crop context, and proposal-only meaning', () => {
    const expectedCrop: Record<string, string> = { English: 'Okra', Hindi: 'भिंडी', Marathi: 'भेंडी', Tamil: 'வெண்டைக்காய்', Malayalam: 'വെണ്ടയ്ക്ക' }
    for (const language of languages.map(({ id }) => id)) {
      const draft = composeInstruction('Sita', [allocation], [], language, 'SMS', true)
      expect(draft).toContain(expectedCrop[language])
      expect(draft).toContain('0.75')
      expect(draft).toContain('1 –')
      expect(draft).toMatch(/Proposal only|केवल एक प्रस्ताव|हा फक्त प्रस्ताव|ஒரு முன்மொழிவு மட்டுமே|ഒരു നിർദ്ദേശം മാത്രമാണിത്/)
      expect(draft).toMatch(/UPDATED plan|योजना में बदलाव|नियोजनात बदल|திருத்தப்பட்ட திட்டம்|പുതുക്കിയ പദ്ധതി/)
    }
  })

  it('localizes newly simulated farmer replies without rewriting prior messages', () => {
    expect(languages.map(({ id }) => simulatedReplyText('water', id))).toHaveLength(5)
    expect(simulatedReplyText('water', 'Tamil')).toContain('நீர்')
    expect(simulatedReplyText('water', 'Malayalam')).toContain('വെള്ളത്തിന്റെ')
    expect(simulatedReplyText('confirmed', 'Marathi')).toBe('1')
    expect(simulatedReplyText('declined', 'Malayalam')).toBe('2')
  })

  it('discloses unsupported farmer-language fallback and the actual draft language', () => {
    for (const language of ['en', 'hi', 'mr', 'ta', 'ml'] as const) {
      const warning = translations[language].message_fallback_warning
      const resolved = interpolateTranslation(warning, { language: 'Urdu', draftLanguage: 'தமிழ்' }, language)
      expect(resolved).toContain('Urdu')
      expect(resolved).toContain('தமிழ்')
      expect(resolved).not.toMatch(/\{(?:language|draftLanguage)\}/)
    }
  })
})
