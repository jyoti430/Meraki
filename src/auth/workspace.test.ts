import { describe, expect, it } from 'vitest'
import { demoHome, previewRoleForPath, workspaceForPath, workspaceLabel } from './workspace'

describe('role-aware demo entry', () => {
  it('opens each demo in its own workspace instead of the trade board', () => {
    expect(demoHome('fpo')).toBe('/fpo')
    expect(demoHome('exporter')).toBe('/exporter')
  })
  it('classifies routes by workspace', () => {
    expect(workspaceForPath('/')).toBeNull()
    expect(workspaceForPath('/plan')).toBe('fpo')
    expect(workspaceForPath('/buyer-orders/ORD-1')).toBe('fpo')
    expect(workspaceForPath('/exporter/requirements')).toBe('exporter')
    expect(workspaceForPath('/exporterish')).toBe('fpo')
    expect(workspaceForPath('/trade/contracts')).toBe('market')
    expect(workspaceForPath('/auctions')).toBe('market')
  })
  it('follows the workspace being explored but keeps the role inside the shared marketplace', () => {
    expect(previewRoleForPath('/exporter', 'fpo')).toBe('exporter')
    expect(previewRoleForPath('/messages', 'exporter')).toBe('fpo')
    expect(previewRoleForPath('/auctions', 'exporter')).toBe('exporter')
    expect(previewRoleForPath('/trade', 'fpo')).toBe('fpo')
    expect(previewRoleForPath('/', 'exporter')).toBe('exporter')
  })
  it('names where the visitor is', () => {
    expect(workspaceLabel('fpo', 'fpo')).toBe('FPO workspace')
    expect(workspaceLabel('market', 'exporter')).toBe('Marketplace · as exporter')
    expect(workspaceLabel(null, 'exporter')).toBe('Exporter workspace')
  })
})
