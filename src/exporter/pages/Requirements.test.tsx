import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n'
import Requirements from './Requirements'

vi.mock('../hooks/useRequirements', () => ({
  default: () => ({
    items: [{
      id: 'DEMO-REQ-2101', crop: 'Okra', variety: 'Arka Anamika', quantityKg: 2400,
      grade: 'Export grade A', destination: 'Singapore (demo destination)', requiredBy: '2026-12-18', status: 'active', source: 'synthetic-demo',
    }],
    error: null,
    refresh: vi.fn(),
  }),
}))

describe('Exporter requirements localization', () => {
  it('renders localized crop labels from sample requirements', () => {
    const html = renderToStaticMarkup(<I18nProvider><MemoryRouter><Requirements /></MemoryRouter></I18nProvider>)
    expect(html).toContain('Okra')
    expect(html).toContain('DEMO-REQ-2101')
  })
})
