import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { I18nProvider } from '../i18n'

const identity = vi.hoisted(() => ({ account: null as null | { role: 'fpo' | 'exporter' } }))
vi.mock('../auth/context', () => ({ useAuth: () => identity }))
vi.mock('./TradeProvider', () => ({ useTrade: () => ({ workspace: null }) }))
vi.mock('../pages/Auctions', () => ({ default: ({ embedded }: { embedded?: boolean }) => <div data-shared-board={embedded}>Server auction board</div> }))
vi.mock('./ui', async importOriginal => {
  const original = await importOriginal<typeof import('./ui')>()
  return { ...original, TradeFrame: ({ controls, children }: { controls: ReactNode; children: ReactNode }) => <main>{controls}{children}</main> }
})
import { TradeBoardPage } from './Auctions'

describe('trade entry uses shared bidding', () => {
  it.each(['fpo', 'exporter'] as const)('opens the server-backed board for %s without requiring a second identity', role => {
    identity.account = { role }
    const html = renderToStaticMarkup(<I18nProvider><MemoryRouter><TradeBoardPage /></MemoryRouter></I18nProvider>)
    expect(html).toContain('Server auction board')
    expect(html).toContain('data-shared-board="true"')
    expect(html).not.toContain('Demo Sahyadri FPO')
    expect(html).not.toContain('Submit demo offer')
  })
  it('keeps unauthenticated sample preview read-only', () => {
    identity.account = null
    const html = renderToStaticMarkup(<I18nProvider><MemoryRouter><TradeBoardPage /></MemoryRouter></I18nProvider>)
    expect(html).toContain('Demo Sahyadri FPO')
    expect(html).toContain('Read-only sample')
    expect(html).not.toContain('Server auction board')
    expect(html).not.toContain('Submit demo offer')
    expect(html).not.toContain('<form')
  })
})
