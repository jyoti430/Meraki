import baselineJson from './agriculturalBaselines.json'

export interface DataProvenance {
  datasetId: string
  publisher: string
  title: string
  sourceUrl: string
  accessedOn: string
  publicationYear?: number
  table?: string
  printedPage?: number
  ecocropCode?: number
}

export interface RegionalYieldBaseline {
  cropId: string
  cropName: string
  status: string
  sampleCount: number
  observedYears: string[]
  missingYears: string[]
  annualYieldKgPerAcre: { year: string; value: number }[]
  summary: {
    minimumKgPerAcre: number | null
    medianKgPerAcre: number | null
    maximumKgPerAcre: number | null
    meanKgPerAcre: number | null
    coefficientOfVariationPct: number | null
    minimumKgPerHectare: number | null
    medianKgPerHectare: number | null
    maximumKgPerHectare: number | null
    yearToYearChangesPct: { fromYear: string; toYear: string; percent: number | null }[]
  }
  planningScenarios: {
    conservativeKgPerAcre: number | null
    expectedKgPerAcre: number | null
    highestHistoricalKgPerAcre: number | null
  }
  scenarioMethod: string
  dataQuality: {
    historyLength: string
    estimateStatus: string
    season: string
    geographicLevel: string
    farmLevelPrediction: boolean
  }
}

export interface CropSuitabilityReference {
  cropId: string
  cropName: string
  scientificName: string
  scientificSynonyms: string[] | null
  scope: 'global_species_reference'
  environment: {
    temperatureC: { optimal: [number, number] | null; absolute: [number, number] | null }
    annualRainfallMm: { optimal: [number, number] | null; absolute: [number, number] | null }
    soilPh: { optimal: [number, number] | null; absolute: [number, number] | null }
    soilTexture: { optimal: string[] | null; absolute: string[] | null }
    soilDrainage: string | null
    soilDepth: string | null
    cropCycleDays: [number, number] | null
    irrigationRequirement: number | null
    plantingSeasons: string[] | null
  }
  missingFields: string[]
  limitations: string[]
  source: {
    datasetId: string
    publisher: string
    title: string
    sourceUrl: string
    accessedOn: string
    ecocropCode: number
  }
}

export interface HistoricalMarketSeries {
  marketId: string
  marketName: string
  cropId: string
  date: string
  priceInrPerKg: number
  arrivalsTonnes?: number
}

export interface OptionalFarmConditions {
  soil?: { ph?: number | null; type?: string | null }
  water?: { availability?: string | null; irrigationType?: string | null }
  weather?: { temperatureC?: number | null; rainfallMm?: number | null }
}

export type Evidence<T> =
  | { status: 'available'; value: T; provenance: DataProvenance[] }
  | { status: 'unavailable'; reason: string }

export type CropSuitabilityEvidence =
  | {
      status: 'reference_only'
      value: CropSuitabilityReference
      provenance: DataProvenance[]
      note: string
    }
  | { status: 'unavailable'; reason: string }

interface BaselineArtifact {
  schemaVersion: number
  datasetId: string
  region: { country: string; state: string; administrativeLevel: string }
  source: {
    publisher: string
    title: string
    sourceUrl: string
    accessedOn: string
    publicationYear: number
    crops: { cropId: string; table: string; printedPage: number }[]
  }
  observations: {
    cropId: string
    year: string
    yieldKgPerAcre: number | null
    source: { table: string; printedPage: number }
  }[]
  baselines: RegionalYieldBaseline[]
  cropSuitabilityReferences: CropSuitabilityReference[]
}

const artifact = baselineJson as unknown as BaselineArtifact

export interface AgriculturalPlanningEvidence {
  cropId: string
  region: BaselineArtifact['region']
  regionalYield: Evidence<RegionalYieldBaseline & { observations: BaselineArtifact['observations'] }>
  cropSuitability: CropSuitabilityEvidence
  historicalMarket: Evidence<HistoricalMarketSeries[]>
  optionalFarmConditions:
    | { status: 'provided'; value: OptionalFarmConditions }
    | { status: 'not_provided' }
  buyerDemand: {
    status: 'synthetic_demo_only'
    note: string
  }
}

const yieldProvenance = (cropId: string): DataProvenance[] => {
  const sourceCrop = artifact.source.crops.find((item) => item.cropId === cropId)
  return [
    {
      datasetId: artifact.datasetId,
      publisher: artifact.source.publisher,
      title: artifact.source.title,
      sourceUrl: artifact.source.sourceUrl,
      accessedOn: artifact.source.accessedOn,
      publicationYear: artifact.source.publicationYear,
      ...(sourceCrop ? { table: sourceCrop.table, printedPage: sourceCrop.printedPage } : {}),
    },
  ]
}

const suitabilityProvenance = (
  reference: CropSuitabilityReference,
): DataProvenance[] => [
  {
    datasetId: reference.source.datasetId,
    publisher: reference.source.publisher,
    title: reference.source.title,
    sourceUrl: reference.source.sourceUrl,
    accessedOn: reference.source.accessedOn,
    ecocropCode: reference.source.ecocropCode,
  },
]

export const supportedRegionalCropIds = artifact.baselines
  .filter((baseline) => baseline.status === 'available')
  .map((baseline) => baseline.cropId)

export function getAgriculturalPlanningEvidence(
  cropId: string,
  farmConditions?: OptionalFarmConditions,
): AgriculturalPlanningEvidence {
  const baseline = artifact.baselines.find((item) => item.cropId === cropId)
  const observations = artifact.observations.filter((item) => item.cropId === cropId)
  const suitability = artifact.cropSuitabilityReferences.find((item) => item.cropId === cropId)

  return {
    cropId,
    region: artifact.region,
    regionalYield: baseline?.status === 'available'
      ? {
          status: 'available',
          value: { ...baseline, observations },
          provenance: yieldProvenance(cropId),
        }
      : {
          status: 'unavailable',
          reason: 'No supported regional yield baseline is loaded for this crop.',
        },
    cropSuitability: suitability
      ? {
          status: 'reference_only',
          value: suitability,
          provenance: suitabilityProvenance(suitability),
          note: 'Global species-level screening data; not a Maharashtra, variety, or farm recommendation.',
        }
      : {
          status: 'unavailable',
          reason: 'No crop-requirement reference is loaded for this crop.',
        },
    historicalMarket: {
      status: 'unavailable',
      reason: 'No verified historical market-price dataset has been integrated yet.',
    },
    optionalFarmConditions: farmConditions
      ? { status: 'provided', value: farmConditions }
      : { status: 'not_provided' },
    buyerDemand: {
      status: 'synthetic_demo_only',
      note: 'Buyer orders remain demo inputs in the existing frontend data layer.',
    },
  }
}
