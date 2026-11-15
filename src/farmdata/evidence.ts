import type { CultivationEvent, EvidenceConfidence, EvidenceRef, EvidenceStatus, EvidenceSummary, SoilEvidence, WaterAssessment } from './types'
import { weatherEvidenceFrom } from './weather'
import type { WeatherRecord } from './types'

const statusRank: Record<EvidenceStatus, number> = { failed: 6, unknown: 5, stale: 4, estimated: 3, reported: 2, verified: 1 }
const confidenceRank: Record<EvidenceConfidence, number> = { none: 4, low: 3, medium: 2, high: 1 }

export function cultivationEvidence(event: Pick<CultivationEvent, 'id' | 'status' | 'kind' | 'occurredOn' | 'plannedFor' | 'recordedAt' | 'provenance'>): EvidenceRef {
  const synthetic = event.provenance.synthetic
  const status: EvidenceStatus = event.status === 'planned' ? 'estimated' : synthetic ? 'estimated' : event.provenance.kind === 'farmer-report' ? 'reported' : 'verified'
  return {
    id: `cultivation-evidence-${event.id}`,
    label: `${event.status === 'actual' ? 'Actual' : 'Planned'} ${event.kind.replace(/-/g, ' ')}`,
    status,
    confidence: status === 'verified' ? 'medium' : 'low',
    asOf: event.occurredOn ?? event.plannedFor ?? event.recordedAt.slice(0, 10),
    validUntil: null,
    provenance: event.provenance,
    caveats: [
      ...(event.status === 'planned' ? ['Planned activity; purchasing or intending an input is not verified application.'] : []),
      ...(event.provenance.synthetic ? ['Synthetic development record.'] : []),
      ...(event.kind === 'pesticide-applied' ? ['A spray record supports traceability only; it does not certify residue safety or export compliance.'] : []),
    ],
  }
}

export function aggregateEvidence(refs: (EvidenceRef | null | undefined)[]): EvidenceSummary {
  const present = refs.filter((r): r is EvidenceRef => Boolean(r))
  if (!present.length) return { status: 'unknown', confidence: 'none', refs: [], caveats: ['No supporting evidence is available at the decision date. Unknown is not zero.'] }
  const status = present.reduce<EvidenceStatus>((worst, r) => (statusRank[r.status] > statusRank[worst] ? r.status : worst), 'verified')
  const confidence = present.reduce<EvidenceConfidence>((worst, r) => (confidenceRank[r.confidence] > confidenceRank[worst] ? r.confidence : worst), 'high')
  const caveats = [...new Set(present.flatMap((r) => r.caveats))]
  return { status, confidence, refs: present, caveats }
}

export function buildScenarioEvidence(input: {
  soil: SoilEvidence
  weatherRecords: WeatherRecord[]
  water: WaterAssessment | null
  events: CultivationEvent[]
  decisionDate: string
}): EvidenceSummary {
  const soilRefs = input.soil.refs
  const weather = weatherEvidenceFrom(input.weatherRecords, input.decisionDate)
  const water = input.water?.evidence ?? null
  const cultivation = input.events.map(cultivationEvidence)
  return aggregateEvidence([...soilRefs, weather, water, ...cultivation])
}
