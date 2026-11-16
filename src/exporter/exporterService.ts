import { DEMO_REQUIREMENTS, DEMO_SUPPLY_PROJECTIONS } from './demoData'
import type { ProcurementRequirement, RequirementCriterion, SupplyProjectionExample } from './types'

const STORAGE_KEY = 'meraki-exporter-local-drafts-v1'
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export type RequirementDraftInput = Omit<ProcurementRequirement, 'id' | 'status' | 'source' | 'updatedAt'>

export interface ExporterService {
  readonly dataMode: 'synthetic-demo'
  listRequirements(): Promise<ProcurementRequirement[]>
  getRequirement(id: string): Promise<ProcurementRequirement | undefined>
  saveDraft(input: RequirementDraftInput, existingId?: string): Promise<ProcurementRequirement>
  listSupplyProjections(): Promise<SupplyProjectionExample[]>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readDrafts(storage: StorageLike): ProcurementRequirement[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Saved local exporter drafts have an invalid format.')
  return parsed as ProcurementRequirement[]
}

function makeId() {
  return `LOCAL-DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export function createExporterService(storage: StorageLike, idFactory: () => string = makeId, now: () => string = () => new Date().toISOString()): ExporterService {
  return {
    dataMode: 'synthetic-demo',
    async listRequirements() {
      return [...clone(DEMO_REQUIREMENTS), ...readDrafts(storage).map(clone)]
    },
    async getRequirement(id) {
      return (await this.listRequirements()).find((item) => item.id === id)
    },
    async saveDraft(input, existingId) {
      const drafts = readDrafts(storage)
      const existing = existingId ? drafts.find((item) => item.id === existingId) : undefined
      if (existingId && !existing) throw new Error('Only a browser-local draft can be edited.')
      const requirement: ProcurementRequirement = {
        ...input,
        criteria: input.criteria.map((criterion: RequirementCriterion) => ({ ...criterion })),
        id: existing?.id ?? idFactory(),
        status: 'draft',
        source: 'local-draft',
        updatedAt: now(),
      }
      const next = existing ? drafts.map((item) => item.id === existingId ? requirement : item) : [...drafts, requirement]
      storage.setItem(STORAGE_KEY, JSON.stringify(next))
      return clone(requirement)
    },
    async listSupplyProjections() {
      return clone(DEMO_SUPPLY_PROJECTIONS)
    },
  }
}

function browserStorage(): StorageLike {
  if (typeof window === 'undefined') throw new Error('Exporter demo storage is available in a browser only.')
  return window.localStorage
}

const lazyBrowserStorage: StorageLike = {
  getItem: (key) => browserStorage().getItem(key),
  setItem: (key, value) => browserStorage().setItem(key, value),
}

export const exporterService = createExporterService(lazyBrowserStorage)

export const requirementSources = {
  backend: 'Shared procurement is available at /trade/requirements. This service intentionally retains local examples only.',
  drafts: 'Drafts stay in this browser and are not shared with an FPO or buyer.',
  reservations: 'Reservation calls require authenticated organisation access and are not enabled in this demo.',
} as const
