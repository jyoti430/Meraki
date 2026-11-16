import { describe, expect, it } from 'vitest'
import { DEMO_REQUIREMENTS, DEMO_SUPPLY_PROJECTIONS } from './demoData'
import { createExporterService, type RequirementDraftInput } from './exporterService'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const draftInput: RequirementDraftInput = {
  crop: 'Okra', variety: 'Buyer variety', quantityKg: 1200, grade: 'Buyer-defined grade',
  criteria: [{ id: 'criterion-1', attribute: 'Pod length', unit: 'cm', minimum: '8', required: true, notes: '' }],
  packaging: 'Buyer-defined carton', destination: 'Synthetic destination', requiredBy: '2027-01-20', notes: '',
}

describe('exporter demo service', () => {
  it('keeps synthetic fixtures labelled and returns copied supply examples', async () => {
    const service = createExporterService(memoryStorage())
    expect(service.dataMode).toBe('synthetic-demo')
    expect((await service.listRequirements()).every((item) => item.source === 'synthetic-demo')).toBe(true)
    const projections = await service.listSupplyProjections()
    expect(projections).toEqual(DEMO_SUPPLY_PROJECTIONS)
    projections[0].projectedKg = 0
    expect((await service.listSupplyProjections())[0].projectedKg).toBe(DEMO_SUPPLY_PROJECTIONS[0].projectedKg)
  })

  it('creates and edits only browser-local drafts without changing sample requirements', async () => {
    const storage = memoryStorage()
    let sequence = 0
    const service = createExporterService(storage, () => `LOCAL-${++sequence}`, () => '2026-11-16T12:00:00.000Z')
    const created = await service.saveDraft(draftInput)
    expect(created).toMatchObject({ id: 'LOCAL-1', status: 'draft', source: 'local-draft' })
    const edited = await service.saveDraft({ ...draftInput, quantityKg: 1500 }, created.id)
    expect(edited).toMatchObject({ id: created.id, quantityKg: 1500, status: 'draft', source: 'local-draft' })
    expect((await service.listRequirements()).find((item) => item.id === created.id)?.quantityKg).toBe(1500)
    await expect(service.saveDraft(draftInput, DEMO_REQUIREMENTS[0].id)).rejects.toThrow('Only a browser-local draft can be edited.')
    expect((await service.getRequirement(DEMO_REQUIREMENTS[0].id))?.quantityKg).toBe(DEMO_REQUIREMENTS[0].quantityKg)
  })
})
