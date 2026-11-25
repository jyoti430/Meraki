import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const identity = vi.hoisted(() => ({ preview: 'fpo', account: null, session: {} }))
vi.mock('../auth/context', () => ({ useAuth: () => identity }))

import Auctions from './Auctions'

describe('Shared auction workspace', () => {
  it.each([
    ['fpo', '/fpo', 'FPO overview'],
    ['exporter', '/exporter', 'Exporter overview'],
  ])('shows the %s overview link while service availability is being checked', (role, path, label) => {
    identity.preview = role
    const html = renderToStaticMarkup(<MemoryRouter><Auctions /></MemoryRouter>)
    expect(html).toMatch(/<h1[^>]*>Shared crop auctions<\/h1>/)
    expect(html).toContain(`href="${path}"`)
    expect(html).toContain(label)
    expect(html).toContain('Actions are paused')
    expect(html).not.toContain('<form')
  })

  it('uses a section heading when embedded in Trade', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Auctions embedded /></MemoryRouter>)
    expect(html).toMatch(/<h2[^>]*>Shared crop auctions<\/h2>/)
    expect(html).not.toContain('<h1')
  })
})
