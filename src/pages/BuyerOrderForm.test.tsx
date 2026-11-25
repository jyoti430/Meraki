import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BuyerOrdersProvider } from '../context/BuyerOrdersContext'
import { I18nProvider, translations } from '../i18n'
import BuyerOrderForm from './BuyerOrderForm'

afterEach(() => vi.unstubAllGlobals())

describe('buyer demand form localisation', () => {
  it('renders the form in the saved UI language while keeping inputs available', () => {
    const stored = new Map([['meraki.lang.v1', 'mr']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    })

    const html = renderToStaticMarkup(
      <I18nProvider>
        <BuyerOrdersProvider>
          <MemoryRouter initialEntries={['/buyer-orders/new']}>
            <Routes><Route path="/buyer-orders/new" element={<BuyerOrderForm />} /></Routes>
          </MemoryRouter>
        </BuyerOrdersProvider>
      </I18nProvider>,
    )

    expect(html).toContain(translations.mr.order_confirmed_question)
    expect(html).toContain(translations.mr.order_confirmed_help)
    expect(html).toContain(translations.mr.order_save_draft)
    expect(html).toContain(`aria-label="${translations.mr.order_currency}"`)
    expect(html).not.toContain('Save draft')
    expect(html).not.toContain('Price per kg')
  })
})
