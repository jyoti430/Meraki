import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { termFields, termsFrom, TermsView } from './ui'
import type { CommercialTerms } from './types'

const snapshot: CommercialTerms = {
  handover: 'Packhouse', grade_protocol: 'export-v1', delivery_start: '2026-12-01T00:00:00.000Z',
  delivery_end: '2026-12-03T00:00:00.000Z', payment_due_days: 7, downgrade_bps: 5000, fee_paise: 1250,
  shortfall_liability: 'seller', payment_terms: 'After accepted receipt', cancellation_terms: 'Bilateral review',
  production_risk: 'Seller declares shortfall', dispute_procedure: 'Reinspect retained sample',
  packaging_requirements: 'Ventilated 5 kg crates', additional_requirements: 'Collection appointment required',
  quality_specification: [
    { attribute: 'Length', unit: 'cm', minimum: '0', maximum: '12', required: true, notes: 'Sample at collection' },
    { attribute: 'Colour', unit: '', minimum: null, maximum: null, required: false, notes: 'Buyer preference only' },
  ],
}

describe('versioned commercial terms', () => {
  it('preserves all buyer criteria and packaging when only payment terms are amended', () => {
    const fields = termFields(snapshot)
    const values = Object.fromEntries(fields.map(field => [field.name, field.value ?? '']))
    values.payment_due_days = '14'
    const amended = termsFrom(values)
    expect(amended).toEqual({ ...snapshot, payment_due_days: 14 })
    expect(new Set(fields.map(field => field.name)).size).toBe(fields.length)
  })

  it('displays the complete buyer specification in the contract confirmation snapshot', () => {
    const html = renderToStaticMarkup(<TermsView terms={snapshot} />)
    for (const text of ['Ventilated 5 kg crates', 'Collection appointment required', 'Length', 'cm', '12', 'Sample at collection', 'Colour', 'Buyer preference only', 'Optional']) expect(html).toContain(text)
    expect(html).toContain('<td>0</td>')
  })

  it('rejects malformed criteria instead of silently clearing them', () => {
    const values = Object.fromEntries(termFields(snapshot).map(field => [field.name, field.value ?? '']))
    for (const quality_specification of ['broken JSON', '{}', JSON.stringify([{ attribute: 'Length' }])]) {
      expect(() => termsFrom({ ...values, quality_specification })).toThrow(/criteri/)
    }
  })
})
