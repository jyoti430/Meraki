import { demoCropCycles, demoFarmers, demoParticipationRecords, demoPlots } from '../data/farmersDemo'
import type { CropCycle, CropCycleStatus, Farmer, FarmerConsent, ParticipationRecord, ParticipationScope, ParticipationStatus, Plot } from '../types'

export interface FarmersData {
  farmers: Farmer[]
  plots: Plot[]
  cropCycles: CropCycle[]
  participationRecords: ParticipationRecord[]
}

export type FarmerInput = Omit<Farmer, 'id' | 'createdAt' | 'updatedAt' | 'consent'>
export type PlotInput = Omit<Plot, 'id' | 'createdAt' | 'updatedAt'>
export type CropCycleInput = Omit<CropCycle, 'id' | 'createdAt' | 'updatedAt'>
export type ParticipationInput = { farmerId: string; scope: ParticipationScope; scopeId: string | null; status: Exclude<ParticipationStatus, 'not-recorded'>; reason: string; notes: string }

const STORAGE_KEY = 'nexus-supply-farmers-v1'
const ACTIVE_CYCLE_STATUSES: CropCycleStatus[] = ['Planned', 'Growing', 'Harvest-ready']
const timestamp = () => new Date().toISOString()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const initialFarmersData: FarmersData = {
  farmers: demoFarmers,
  plots: demoPlots,
  cropCycles: demoCropCycles,
  participationRecords: demoParticipationRecords,
}

export function loadFarmersData(): FarmersData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isFarmersData(parsed)) return parsed
    }
  } catch {
    // Keep the demo usable when local storage is unavailable or contains invalid JSON.
  }
  return clone(initialFarmersData)
}

export function persistFarmersData(data: FarmersData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Changes remain available in memory for this session if browser storage is unavailable.
  }
}

function isFarmersData(value: unknown): value is FarmersData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return Array.isArray(data.farmers) && Array.isArray(data.plots) && Array.isArray(data.cropCycles) && Array.isArray(data.participationRecords)
}

function nextId(prefix: string, ids: string[]) {
  const next = Math.max(0, ...ids.map((id) => Number(id.match(/(\d+)$/)?.[1] ?? 0))) + 1
  return `${prefix}-${String(next).padStart(3, '0')}`
}

export const nextFarmerId = (data: FarmersData) => nextId('FPO-DEMO', data.farmers.map((item) => item.id))
export const nextPlotId = (data: FarmersData) => nextId('PLOT-DEMO', data.plots.map((item) => item.id))
export const nextCropCycleId = (data: FarmersData) => nextId('CYCLE-DEMO', data.cropCycles.map((item) => item.id))
export const formatEntityDate = (value: string) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`)) : 'Not scheduled'
export const formatEntityDateTime = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function createFarmer(data: FarmersData, input: FarmerInput): { data: FarmersData; farmer: Farmer } {
  const farmer: Farmer = {
    ...input,
    id: nextId('FPO-DEMO', data.farmers.map((item) => item.id)),
    consent: { consented: false, status: 'not-recorded', recordedAt: null, reason: '', notes: '' },
    createdAt: timestamp(),
    updatedAt: timestamp(),
  }
  return { data: { ...data, farmers: [farmer, ...data.farmers] }, farmer }
}

export function updateFarmer(data: FarmersData, farmerId: string, input: FarmerInput): FarmersData {
  if (!data.farmers.some((farmer) => farmer.id === farmerId)) throw new Error('Farmer not found.')
  return { ...data, farmers: data.farmers.map((farmer) => farmer.id === farmerId ? { ...farmer, ...input, updatedAt: timestamp() } : farmer) }
}

export function setFarmerMembership(data: FarmersData, farmerId: string, status: Farmer['membershipStatus']): FarmersData {
  if (!data.farmers.some((farmer) => farmer.id === farmerId)) throw new Error('Farmer not found.')
  return { ...data, farmers: data.farmers.map((farmer) => farmer.id === farmerId ? { ...farmer, membershipStatus: status, updatedAt: timestamp() } : farmer) }
}

export function recordParticipation(data: FarmersData, input: ParticipationInput): { data: FarmersData; record: ParticipationRecord } {
  if (!data.farmers.some((farmer) => farmer.id === input.farmerId)) throw new Error('Farmer not found.')
  if (input.scope === 'buyer-order' && !input.scopeId?.trim()) throw new Error('Enter the buyer order ID for an order-specific participation record.')
  const record: ParticipationRecord = { ...input, scopeId: input.scopeId?.trim() || null, id: nextId('PART-DEMO', data.participationRecords.map((item) => item.id)), recordedAt: timestamp() }
  const updatedFarmers = data.farmers.map((farmer) => {
    if (farmer.id !== input.farmerId || input.scope !== 'supply-programme' || record.scopeId !== null) return farmer
    const consent: FarmerConsent = {
      consented: record.status === 'opted-in',
      status: record.status,
      recordedAt: record.recordedAt,
      reason: record.reason,
      notes: record.notes,
    }
    return { ...farmer, consent, updatedAt: record.recordedAt }
  })
  return { data: { ...data, farmers: updatedFarmers, participationRecords: [...data.participationRecords, record] }, record }
}

export function createPlot(data: FarmersData, input: PlotInput): { data: FarmersData; plot: Plot } {
  if (!data.farmers.some((farmer) => farmer.id === input.farmerId)) throw new Error('Select an existing farmer for this plot.')
  if (!Number.isFinite(input.area) || input.area <= 0) throw new Error('Plot area must be greater than zero.')
  const plot: Plot = { ...input, id: nextId('PLOT-DEMO', data.plots.map((item) => item.id)), createdAt: timestamp(), updatedAt: timestamp() }
  return { data: { ...data, plots: [plot, ...data.plots] }, plot }
}

export function updatePlot(data: FarmersData, plotId: string, input: PlotInput): FarmersData {
  if (!data.plots.some((plot) => plot.id === plotId)) throw new Error('Plot not found.')
  if (!data.farmers.some((farmer) => farmer.id === input.farmerId)) throw new Error('Select an existing farmer for this plot.')
  if (!Number.isFinite(input.area) || input.area <= 0) throw new Error('Plot area must be greater than zero.')
  return { ...data, plots: data.plots.map((plot) => plot.id === plotId ? { ...plot, ...input, updatedAt: timestamp() } : plot) }
}

export function validateCropCycle(data: FarmersData, input: CropCycleInput, editingCycleId?: string): void {
  if (!data.plots.some((plot) => plot.id === input.plotId)) throw new Error('A crop cycle must reference an existing plot.')
  if (!input.crop.trim() || !input.variety.trim()) throw new Error('Crop and variety are required.')
  if (!input.plantingDate || !input.expectedHarvestStartDate || !input.expectedHarvestEndDate) throw new Error('Add the planting date and both expected harvest dates.')
  if (![input.plantingDate, input.expectedHarvestStartDate, input.expectedHarvestEndDate].every(isValidDate)) throw new Error('Enter valid calendar dates for planting and harvest.')
  if (input.plantingDate > input.expectedHarvestStartDate || input.expectedHarvestStartDate > input.expectedHarvestEndDate) throw new Error('Dates must follow planting, harvest start, then harvest end.')
  if (!Number.isFinite(input.estimatedProductionKg) || input.estimatedProductionKg < 0) throw new Error('Estimated production must be a non-negative quantity in kg.')
  if (!ACTIVE_CYCLE_STATUSES.includes(input.status)) return
  const incomingStart = input.plantingDate
  const incomingEnd = input.expectedHarvestEndDate
  const conflict = data.cropCycles.find((cycle) => {
    if (cycle.id === editingCycleId || cycle.plotId !== input.plotId || !ACTIVE_CYCLE_STATUSES.includes(cycle.status)) return false
    return incomingStart <= cycle.expectedHarvestEndDate && cycle.plantingDate <= incomingEnd
  })
  if (conflict) throw new Error(`This crop cycle overlaps ${conflict.id} on the same plot. Finish or cancel that cycle before adding an overlapping active cycle.`)
}

export function createCropCycle(data: FarmersData, input: CropCycleInput): { data: FarmersData; cropCycle: CropCycle } {
  validateCropCycle(data, input)
  const cropCycle: CropCycle = { ...input, id: nextId('CYCLE-DEMO', data.cropCycles.map((item) => item.id)), createdAt: timestamp(), updatedAt: timestamp() }
  return { data: { ...data, cropCycles: [cropCycle, ...data.cropCycles] }, cropCycle }
}

export function updateCropCycle(data: FarmersData, cycleId: string, input: CropCycleInput): FarmersData {
  if (!data.cropCycles.some((cycle) => cycle.id === cycleId)) throw new Error('Crop cycle not found.')
  validateCropCycle(data, input, cycleId)
  return { ...data, cropCycles: data.cropCycles.map((cycle) => cycle.id === cycleId ? { ...cycle, ...input, updatedAt: timestamp() } : cycle) }
}

function latestRecord(records: ParticipationRecord[]) {
  return records.reduce<ParticipationRecord | undefined>((latest, record) => !latest || record.recordedAt >= latest.recordedAt ? record : latest, undefined)
}

export function getFarmerParticipation(data: FarmersData, farmerId: string) {
  const farmer = data.farmers.find((item) => item.id === farmerId)
  return { consent: farmer?.consent ?? null, history: data.participationRecords.filter((item) => item.farmerId === farmerId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)) }
}

export function getFarmersOptedOutOfAnyProgramme(data: FarmersData): Farmer[] {
  const optedOut = new Set<string>()
  const scopes = new Map<string, ParticipationRecord[]>()
  for (const record of data.participationRecords) {
    const key = `${record.farmerId}|${record.scope}|${record.scopeId ?? 'global'}`
    scopes.set(key, [...(scopes.get(key) ?? []), record])
  }
  for (const records of scopes.values()) {
    const current = latestRecord(records)
    if (current?.status === 'opted-out') optedOut.add(current.farmerId)
  }
  return data.farmers.filter((farmer) => optedOut.has(farmer.id))
}

export function getEligibleFarmers(data: FarmersData, options: { programmeId?: string; buyerOrderId?: string } = {}): Farmer[] {
  return data.farmers.filter((farmer) => {
    if (farmer.membershipStatus !== 'Active' || !farmer.consent.consented || farmer.consent.status !== 'opted-in') return false
    const records = data.participationRecords.filter((record) => record.farmerId === farmer.id)
    const globalRecord = latestRecord(records.filter((record) => record.scope === 'supply-programme' && record.scopeId === null))
    if (globalRecord && globalRecord.status !== 'opted-in') return false
    const programmeRecord = options.programmeId ? latestRecord(records.filter((record) => record.scope === 'supply-programme' && record.scopeId === options.programmeId)) : undefined
    const buyerOrderRecord = options.buyerOrderId ? latestRecord(records.filter((record) => record.scope === 'buyer-order' && record.scopeId === options.buyerOrderId)) : undefined
    return (!programmeRecord || programmeRecord.status === 'opted-in') && (!buyerOrderRecord || buyerOrderRecord.status === 'opted-in')
  })
}

export function getPlotsForFarmer(data: FarmersData, farmerId: string): Plot[] {
  return data.plots.filter((plot) => plot.farmerId === farmerId)
}

export function getCropCyclesForPlot(data: FarmersData, plotId: string): CropCycle[] {
  return data.cropCycles.filter((cycle) => cycle.plotId === plotId).sort((a, b) => b.plantingDate.localeCompare(a.plantingDate))
}

export function getActiveCropCycles(data: FarmersData, farmerId?: string): CropCycle[] {
  const farmerPlotIds = farmerId ? new Set(getPlotsForFarmer(data, farmerId).map((plot) => plot.id)) : null
  return data.cropCycles.filter((cycle) => ACTIVE_CYCLE_STATUSES.includes(cycle.status) && (!farmerPlotIds || farmerPlotIds.has(cycle.plotId)))
}

export function getCropCyclesInHarvestWindow(data: FarmersData, startDate: string, endDate: string): CropCycle[] {
  if (!startDate || !endDate || startDate > endDate) throw new Error('Provide a valid harvest date range.')
  return data.cropCycles.filter((cycle) => ACTIVE_CYCLE_STATUSES.includes(cycle.status) && cycle.expectedHarvestStartDate <= endDate && cycle.expectedHarvestEndDate >= startDate)
}

export function getEstimatedProduction(data: FarmersData, filters: { farmerId?: string; plotId?: string; crop?: string } = {}) {
  const plotById = new Map(data.plots.map((plot) => [plot.id, plot]))
  return data.cropCycles.filter((cycle) => {
    const plot = plotById.get(cycle.plotId)
    return Boolean(plot) && (!filters.farmerId || plot?.farmerId === filters.farmerId) && (!filters.plotId || cycle.plotId === filters.plotId) && (!filters.crop || cycle.crop.toLocaleLowerCase() === filters.crop.toLocaleLowerCase())
  }).map((cycle) => ({ cycleId: cycle.id, plotId: cycle.plotId, farmerId: plotById.get(cycle.plotId)!.farmerId, crop: cycle.crop, estimatedProductionKg: cycle.estimatedProductionKg, status: cycle.status }))
}

export function isActiveCropCycle(status: CropCycleStatus) {
  return ACTIVE_CYCLE_STATUSES.includes(status)
}
