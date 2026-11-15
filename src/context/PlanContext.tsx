import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useBuyerOrders } from './BuyerOrdersContext'
import { useFarmers } from './FarmersContext'
import { assignmentSignature, exclusionKey, runPlan, scenarioPresets } from '../planning/engine'
import type { ConstraintKind, FarmerResponse, PlanResult, Scenario } from '../planning/engine'
import type { Channel, Language } from '../planning/messages'
import type { FarmersData } from '../services/FarmersService'
import type { Plot } from '../types'
import { fmtKg } from '../planning/format'

export interface MessageEntry { id: string; farmerId: string; direction: 'out' | 'in'; channel: Channel; language: Language; text: string; at: string }
export interface PlanChange { id: string; at: string; title: string; details: string[] }

interface PlanState {
  scenario: Scenario
  responses: Record<string, FarmerResponse>
  exclusions: string[]
  messages: MessageEntry[]
  changes: PlanChange[]
}

export type ReplyInput = { status: 'confirmed' | 'declined' } | { status: 'constraint'; kind: ConstraintKind; note: string; availableAcres?: number }

interface PlanContextValue extends PlanState {
  result: PlanResult
  setScenario: (scenario: Scenario) => void
  toggleExclusion: (plotId: string, crop: string) => void
  sendInstructions: (farmerIds: { farmerId: string; text: string; channel: Channel; language: Language }[]) => void
  recordReply: (farmerId: string, reply: ReplyInput, replyText: string, channel: Channel, language: Language) => PlanChange | null
  dismissChange: (id: string) => void
}

const STORAGE_KEY = 'meraki-plan-v1'
const PlanContext = createContext<PlanContextValue | null>(null)
const initialState = (): PlanState => ({ scenario: scenarioPresets[1].scenario, responses: {}, exclusions: [], messages: [], changes: [] })

function loadState(): PlanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...initialState(), ...(JSON.parse(raw) as Partial<PlanState>) }
  } catch { /* fall back to a fresh plan */ }
  return initialState()
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const now = () => new Date().toISOString()

/** Human-readable diff between two plan results. */
export function describeDiff(before: PlanResult, after: PlanResult): string[] {
  const details: string[] = []
  for (const next of after.plans) {
    const prev = before.plans.find((p) => p.crop.id === next.crop.id)
    if (!prev) continue
    const prevFarmers = new Set(prev.allocations.map((a) => a.farmerName))
    const nextFarmers = new Set(next.allocations.map((a) => a.farmerName))
    const added = [...nextFarmers].filter((f) => !prevFarmers.has(f))
    const removed = [...prevFarmers].filter((f) => !nextFarmers.has(f))
    const deltaKg = next.expectedKg - prev.expectedKg
    if (Math.abs(deltaKg) < 1 && !added.length && !removed.length && Math.abs(next.plannedAcres - prev.plannedAcres) < 0.01) continue
    const parts: string[] = []
    if (Math.abs(deltaKg) >= 1) parts.push(`expected supply ${deltaKg > 0 ? '+' : '−'}${fmtKg(Math.abs(deltaKg))} (now ${fmtKg(next.expectedKg)} of ${fmtKg(next.targetKg)} target)`)
    if (removed.length) parts.push(`removed ${removed.join(', ')}`)
    if (added.length) parts.push(`added ${added.join(', ')}`)
    if (!parts.length) parts.push('land reassigned between farmers')
    details.push(`${next.crop.name}: ${parts.join('; ')}`)
  }
  return details.length ? details : ['No change to crop totals.']
}

function degradeWater(plot: Plot): Plot['waterAvailability'] {
  return plot.waterAvailability === 'Available' ? 'Limited' : plot.waterAvailability === 'Limited' ? 'None' : plot.waterAvailability === 'Unknown' ? 'Limited' : 'None'
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { orders } = useBuyerOrders()
  const { data, editPlot } = useFarmers()
  const [state, setState] = useState<PlanState>(loadState)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* in-memory only */ }
  }, [state])

  const compute = useCallback((s: PlanState, d: FarmersData) => runPlan({ orders, data: d, scenario: s.scenario, responses: s.responses, exclusions: s.exclusions }), [orders])
  const result = useMemo(() => compute(state, data), [compute, state, data])

  const logChange = useCallback((title: string, before: PlanResult, after: PlanResult): PlanChange => ({ id: uid(), at: now(), title, details: describeDiff(before, after) }), [])

  const setScenario = useCallback((scenario: Scenario) => setState((s) => ({ ...s, scenario })), [])

  const toggleExclusion = useCallback((plotId: string, crop: string) => {
    const key = exclusionKey(plotId, crop)
    const plot = data.plots.find((p) => p.id === plotId)
    const farmer = data.farmers.find((f) => f.id === plot?.farmerId)
    const removing = !state.exclusions.includes(key)
    const next: PlanState = { ...state, exclusions: removing ? [...state.exclusions, key] : state.exclusions.filter((k) => k !== key) }
    const change = logChange(`${removing ? 'Removed' : 'Restored'} ${farmer?.name ?? ''} – ${plot?.name ?? plotId} for ${crop.toLowerCase()}`, result, compute(next, data))
    setState({ ...next, changes: [change, ...state.changes].slice(0, 30) })
  }, [state, data, result, compute, logChange])

  const sendInstructions = useCallback((items: { farmerId: string; text: string; channel: Channel; language: Language }[]) => {
    setState((s) => {
      const responses = { ...s.responses }
      const messages = [...s.messages]
      for (const item of items) {
        const signature = assignmentSignature(result.allocations.filter((a) => a.farmerId === item.farmerId))
        responses[item.farmerId] = { farmerId: item.farmerId, status: 'sent', sentSignature: signature, sentAt: now(), updatedAt: now() }
        messages.push({ id: uid(), farmerId: item.farmerId, direction: 'out', channel: item.channel, language: item.language, text: item.text, at: now() })
      }
      return { ...s, responses, messages }
    })
  }, [result])

  const recordReply = useCallback((farmerId: string, reply: ReplyInput, text: string, channel: Channel, language: Language) => {
    const farmer = data.farmers.find((f) => f.id === farmerId)
    const prev = state.responses[farmerId]
    const response: FarmerResponse = reply.status === 'constraint'
      ? { farmerId, status: 'constraint', sentSignature: prev?.sentSignature, sentAt: prev?.sentAt, constraint: { kind: reply.kind, note: reply.note, availableAcres: reply.availableAcres }, updatedAt: now() }
      : { farmerId, status: reply.status, sentSignature: prev?.sentSignature, sentAt: prev?.sentAt, updatedAt: now() }
    const next: PlanState = { ...state, responses: { ...state.responses, [farmerId]: response }, messages: [...state.messages, { id: uid(), farmerId, direction: 'in', channel, language, text, at: now() }] }

    // A reported water problem updates the farm record itself, so every crop recommendation sees it.
    let nextData = data
    if (reply.status === 'constraint' && reply.kind === 'water') {
      const affected = new Set(result.allocations.filter((a) => a.farmerId === farmerId).map((a) => a.plotId))
      nextData = { ...data, plots: data.plots.map((p) => affected.has(p.id) ? { ...p, waterAvailability: degradeWater(p), notes: `${p.notes ? `${p.notes} ` : ''}Farmer reported a water problem by ${channel} (${new Date().toLocaleDateString('en-IN')}).`.trim() } : p) }
      for (const plot of nextData.plots.filter((p) => affected.has(p.id))) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...input } = plot
        editPlot(plot.id, input)
      }
    }
    if (reply.status === 'confirmed') {
      setState({ ...next })
      return null
    }
    const label = reply.status !== 'constraint' ? 'declined this season' : reply.kind === 'land' ? `has only ${reply.availableAcres ?? 0} acres available` : reply.kind === 'water' ? 'reported a water problem' : reply.kind === 'timing' ? 'cannot sow in time' : 'reported a problem'
    const change = logChange(`${farmer?.name ?? farmerId} ${label}`, result, compute(next, nextData))
    setState({ ...next, changes: [change, ...state.changes].slice(0, 30) })
    return change
  }, [state, data, result, compute, logChange, editPlot])

  const dismissChange = useCallback((id: string) => setState((s) => ({ ...s, changes: s.changes.filter((c) => c.id !== id) })), [])

  const value = useMemo<PlanContextValue>(() => ({ ...state, result, setScenario, toggleExclusion, sendInstructions, recordReply, dismissChange }), [state, result, setScenario, toggleExclusion, sendInstructions, recordReply, dismissChange])
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>
}

export function usePlan() {
  const context = useContext(PlanContext)
  if (!context) throw new Error('usePlan must be used inside PlanProvider')
  return context
}

export function resetDemoData() {
  for (const key of ['meraki-plan-v1', 'meraki-buyer-orders-v1', 'meraki-farmers-v1', 'meraki-supply-plans-v1']) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
  window.location.assign('/')
}
