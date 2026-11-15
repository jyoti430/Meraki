import evidenceJson from './agriculturalBaselines.json'

export interface DataProvenance {
  datasetId: string
  publisher: string
  title: string
  sourceUrl: string
  sourceUrls?: string[]
  accessedOn: string
  publicationYear?: number
  table?: string
  printedPage?: number
  ecocropCode?: number
  sourceReference?: string
  licenseAndReuse?: string
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
    latestYieldYear?: string | null
    freshness?: string
    farmLevelPrediction: boolean
  }
}

export interface RegionalYieldSourceSeries {
  cropId: string
  datasetId: string
  geography: { country: string; state: string; administrativeLevel: string }
  sampleCount: number
  observedYears: string[]
  estimateStatuses: string[]
  summaryKgPerHectare: {
    minimum: number | null
    median: number | null
    maximum: number | null
    mean: number | null
    coefficientOfVariationPct: number | null
  }
  observations: {
    year: string
    estimateStatus: string
    yieldKgPerHectare: number
    source: DataProvenance
  }[]
  interpretation: string
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
  source: DataProvenance & { ecocropCode: number }
}

export interface RegionalHorticultureObservation {
  cropId: string
  cropName: string
  year: string
  geography: { country: string; state: string; administrativeLevel: string }
  season: string | null
  reported: {
    area: { value: number | null; unit: string | null }
    production: { value: number | null; unit: string | null }
  }
  areaHectares: number | null
  areaAcres: number | null
  productionTonnes: number | null
  productionKg: number | null
  yieldKgPerHectare: number | null
  yieldKind: 'derived_statistical_estimate' | null
  recordKind: 'source_reported_official_statistic'
  estimateStatus: string
  source: DataProvenance
}

export interface NationalProductionObservation {
  cropId: string
  cropName: string
  year: string
  geography: { country: string; administrativeLevel: string }
  reported: {
    area: { value: number | null; unit: string | null }
    production: { value: number | null; unit: string | null }
  }
  areaHectares: number | null
  productionTonnes: number | null
  yieldKgPerHectare: number | null
  yieldKind: 'derived_statistical_estimate' | null
  recordKind: 'source_reported_official_statistic'
  estimateStatus: string
  source: DataProvenance
}

export interface HistoricalMarketObservation {
  marketId: string
  sourceMarketCode: string | null
  marketName: string
  state: string
  district: string | null
  cropId: string
  cropName: string
  sourceCommodityLabel: string | null
  date: string
  variety: string | null
  grade: string | null
  sourcePricesInrPerUnit: { minimum: number | null; maximum: number | null; modal: number | null }
  sourcePriceUnit: string | null
  priceInrPerKg: { minimum: number | null; maximum: number | null; modal: number | null }
  priceSpreadInrPerKg: number | null
  arrivals: { sourceValue: number | null; sourceUnit: string | null; tonnes: number | null }
  recordKind: 'historical_market_observation'
  source: DataProvenance
}

export interface MarketIndicator {
  datasetId: string
  marketId: string
  marketName: string
  district: string | null
  cropId: string
  variety: string | null
  grade: string | null
  observationCount: number
  priceObservationCount: number
  earliestDate: string
  latestDate: string
  temporalWindowDays: number
  reportingDateCount: number
  minimumModalPriceInrPerKg: number | null
  medianModalPriceInrPerKg: number | null
  maximumModalPriceInrPerKg: number | null
  priceCoefficientOfVariationPct: number | null
  observedMonthSummariesInrPerKg: {
    month: number
    median: number
    sampleCount: number
    sampledDates: string[]
    scope: 'observed_days_only_not_full_month'
  }[]
  arrivalObservationCount: number
  meanDailyArrivalsTonnes: number | null
  minimumDailyArrivalsTonnes: number | null
  maximumDailyArrivalsTonnes: number | null
  arrivalChangePctBetweenFirstAndLastObservedDay: number | null
  arrivalSignalStatus: string
  interpretation: string
  recordKind: 'derived_historical_market_indicator'
  sourceDatasetId: string
}

export interface WeatherDailyObservation {
  date: string
  locationId: string
  locationName: string
  district: string
  state: string
  geographicLevel: 'project_selected_city_reference_point'
  coordinates: { latitude: number; longitude: number }
  temperatureMaxC: number | null
  temperatureMinC: number | null
  precipitationMmPerDay: number | null
  recordKind: 'gridded_historical_meteorological_estimate'
  dataProductSources: string[]
  timeStandard: string
  datasetId: string
}

export interface SeasonalWeatherIndicator {
  locationId: string
  locationName: string
  district: string
  year: string
  seasonId: string
  periodStart: string
  periodEnd: string
  expectedDays: number
  rainfallObservedDays: number
  rainfallMissingDays: number
  rainfallComplete: boolean
  totalPrecipitationMm: number | null
  observedPrecipitationSumMm: number | null
  meanDailyMaximumTemperatureC: number | null
  highestDailyMaximumTemperatureC: number | null
  heatThresholdC: number
  daysAtOrAboveHeatThreshold: number
  temperatureMaximumObservedDays: number
  meanDailyMinimumTemperatureC: number | null
  dryDayThresholdMm: number
  longestObservedDrySpellDays: number
  drySpellCoverageComplete: boolean
  recordKind: 'derived_historical_season_indicator'
  datasetId: string
  interpretation: string
}

export type FarmConditionSource =
  | 'soil_health_card'
  | 'lab_test'
  | 'field_test_kit'
  | 'soil_sensor'
  | 'farmer_report'
  | 'fpo_record'

export type FarmConditionMeasurement<T> =
  | {
      status: 'measured'
      value: T
      measuredAt: string
      source: FarmConditionSource
      sourceReference?: string
    }
  | { status: 'unknown'; reason: string }

export interface FarmConditionProfile {
  soilType: FarmConditionMeasurement<string>
  soilPh: FarmConditionMeasurement<number>
  irrigationAvailability: FarmConditionMeasurement<'reliable' | 'seasonal' | 'limited' | 'none'>
  irrigationReliability: FarmConditionMeasurement<'reliable' | 'seasonal' | 'intermittent'>
  irrigationType: FarmConditionMeasurement<string>
  soilMoisturePercent: FarmConditionMeasurement<number>
}

export type FarmConditionsEvidence =
  | { status: 'provided'; recordKind: 'farm_measurement_or_farmer_report'; value: FarmConditionProfile }
  | { status: 'unavailable'; reason: string }
  | { status: 'invalid'; errors: string[] }

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
  regionalYieldSeriesBySource: RegionalYieldSourceSeries[]
  cropSuitabilityReferences: CropSuitabilityReference[]
  regionalHorticultureObservations: RegionalHorticultureObservation[]
  nationalProductionContext: NationalProductionObservation[]
  weather: {
    status: 'available' | 'unavailable'
    source: DataProvenance & { documentationUrl: string; timeStandard: string; sources: string[]; limitations: string[] }
    dailyObservations: WeatherDailyObservation[]
    seasonalIndicators: SeasonalWeatherIndicator[]
    forecast: { status: 'unavailable'; reason: string }
  }
  historicalMarket: {
    status: 'available' | 'unavailable'
    reason: string | null
    coverageByCrop: { cropId: string; status: string; observationCount: number; marketCount: number; earliestDate: string | null; latestDate: string | null; reason: string | null }[]
    snapshot: Record<string, unknown> | null
    observations: HistoricalMarketObservation[]
    indicators: MarketIndicator[]
  }
}

const artifact = evidenceJson as unknown as BaselineArtifact

export interface AgriculturalPlanningEvidence {
  cropId: string
  region: BaselineArtifact['region']
  regionalYield: Evidence<RegionalYieldBaseline & {
    observations: BaselineArtifact['observations']
    recentSourceSeries: RegionalYieldSourceSeries[]
  }>
  regionalHorticulture: Evidence<RegionalHorticultureObservation[]>
  nationalProductionContext: Evidence<NationalProductionObservation[]>
  cropSuitability: CropSuitabilityEvidence
  historicalWeather: Evidence<{
    observations: WeatherDailyObservation[]
    seasonalIndicators: SeasonalWeatherIndicator[]
    scopeNote: string
  }>
  weatherForecast: { status: 'unavailable'; reason: string }
  historicalMarket: Evidence<{
    observations: HistoricalMarketObservation[]
    indicators: MarketIndicator[]
    coverage: { cropId: string; status: string; observationCount: number; marketCount: number; earliestDate: string | null; latestDate: string | null; reason: string | null }
    snapshot: Record<string, unknown> | null
  }>
  farmConditions: FarmConditionsEvidence
  buyerDemand: {
    status: 'synthetic_demo_only'
    note: string
  }
}

const provenanceForSource = (source: DataProvenance): DataProvenance[] => [source]

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

const suitabilityProvenance = (reference: CropSuitabilityReference): DataProvenance[] => [
  {
    datasetId: reference.source.datasetId,
    publisher: reference.source.publisher,
    title: reference.source.title,
    sourceUrl: reference.source.sourceUrl,
    accessedOn: reference.source.accessedOn,
    ecocropCode: reference.source.ecocropCode,
  },
]

const uniqueSources = (records: { source: DataProvenance }[]): DataProvenance[] => {
  const byDataset = new Map<string, DataProvenance>()
  records.forEach((record) => byDataset.set(record.source.datasetId, record.source))
  return [...byDataset.values()]
}

const isIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)

const conditionSources: FarmConditionSource[] = [
  'soil_health_card',
  'lab_test',
  'field_test_kit',
  'soil_sensor',
  'farmer_report',
  'fpo_record',
]

export function validateFarmConditionProfile(input: unknown): { valid: true; value: FarmConditionProfile } | { valid: false; errors: string[] } {
  if (!input || typeof input !== 'object') return { valid: false, errors: ['Farm conditions must be an object.'] }
  const profile = input as Partial<Record<keyof FarmConditionProfile, unknown>>
  const errors: string[] = []
  const fields = [
    'soilType',
    'soilPh',
    'irrigationAvailability',
    'irrigationReliability',
    'irrigationType',
    'soilMoisturePercent',
  ] as const

  const validateMeasurement = (field: typeof fields[number]) => {
    const measurement = profile[field] as Record<string, unknown> | undefined
    if (!measurement || typeof measurement !== 'object') {
      errors.push(`${field} must be marked measured or unknown.`)
      return
    }
    if (measurement.status === 'unknown') {
      if (typeof measurement.reason !== 'string' || !measurement.reason.trim()) {
        errors.push(`${field} unknown status requires a reason.`)
      }
      return
    }
    if (measurement.status !== 'measured') {
      errors.push(`${field} status must be measured or unknown.`)
      return
    }
    if (typeof measurement.measuredAt !== 'string' || !isIsoDate(measurement.measuredAt)) {
      errors.push(`${field} measured value requires an ISO measurement date.`)
    }
    if (!conditionSources.includes(measurement.source as FarmConditionSource)) {
      errors.push(`${field} measured value requires a known provenance source.`)
    }
    if (field === 'soilType' && (typeof measurement.value !== 'string' || !measurement.value.trim())) {
      errors.push('soilType measured value must be a non-empty soil type.')
    }
    if (field === 'soilPh' && (typeof measurement.value !== 'number' || !Number.isFinite(measurement.value) || measurement.value < 0 || measurement.value > 14)) {
      errors.push('soilPh must be between 0 and 14 pH units.')
    }
    if (field === 'soilMoisturePercent' && (typeof measurement.value !== 'number' || !Number.isFinite(measurement.value) || measurement.value < 0 || measurement.value > 100)) {
      errors.push('soilMoisturePercent must be between 0 and 100 percent.')
    }
    if (field === 'irrigationAvailability' && !['reliable', 'seasonal', 'limited', 'none'].includes(String(measurement.value))) {
      errors.push('irrigationAvailability has an unsupported value.')
    }
    if (field === 'irrigationReliability' && !['reliable', 'seasonal', 'intermittent'].includes(String(measurement.value))) {
      errors.push('irrigationReliability has an unsupported value.')
    }
    if (field === 'irrigationType' && (typeof measurement.value !== 'string' || !measurement.value.trim())) {
      errors.push('irrigationType measured value must be a non-empty type.')
    }
  }

  fields.forEach(validateMeasurement)
  return errors.length
    ? { valid: false, errors }
    : { valid: true, value: input as FarmConditionProfile }
}

export const supportedRegionalCropIds = artifact.baselines
  .filter((baseline) => baseline.status === 'available')
  .map((baseline) => baseline.cropId)

export function getAgriculturalPlanningEvidence(
  cropId: string,
  farmConditions?: FarmConditionProfile,
): AgriculturalPlanningEvidence {
  const baseline = artifact.baselines.find((item) => item.cropId === cropId)
  const observations = artifact.observations.filter((item) => item.cropId === cropId)
  const recentSourceSeries = artifact.regionalYieldSeriesBySource.filter((item) => item.cropId === cropId)
  const stateStatistics = artifact.regionalHorticultureObservations.filter((item) => item.cropId === cropId)
  const nationalStatistics = artifact.nationalProductionContext.filter((item) => item.cropId === cropId)
  const suitability = artifact.cropSuitabilityReferences.find((item) => item.cropId === cropId)
  const marketObservations = artifact.historicalMarket.observations.filter((item) => item.cropId === cropId)
  const marketIndicators = artifact.historicalMarket.indicators.filter((item) => item.cropId === cropId)
  const marketCoverage = artifact.historicalMarket.coverageByCrop.find((item) => item.cropId === cropId)
  const farmValidation = farmConditions ? validateFarmConditionProfile(farmConditions) : undefined

  return {
    cropId,
    region: artifact.region,
    regionalYield: baseline?.status === 'available'
      ? {
          status: 'available',
          value: { ...baseline, observations, recentSourceSeries },
          provenance: yieldProvenance(cropId),
        }
      : {
          status: 'unavailable',
          reason: 'No supported regional yield baseline is loaded for this crop.',
        },
    regionalHorticulture: stateStatistics.length
      ? { status: 'available', value: stateStatistics, provenance: uniqueSources(stateStatistics) }
      : {
          status: 'unavailable',
          reason: 'No crop-specific recent Maharashtra area or production observation is loaded for this crop.',
        },
    nationalProductionContext: nationalStatistics.length
      ? { status: 'available', value: nationalStatistics, provenance: uniqueSources(nationalStatistics) }
      : { status: 'unavailable', reason: 'No national production context is loaded for this crop.' },
    cropSuitability: suitability
      ? {
          status: 'reference_only',
          value: suitability,
          provenance: suitabilityProvenance(suitability),
          note: 'Global species-level screening data; not a Maharashtra, variety, or farm recommendation.',
        }
      : { status: 'unavailable', reason: 'No crop-requirement reference is loaded for this crop.' },
    historicalWeather: artifact.weather.status === 'available'
      ? {
          status: 'available',
          value: {
            observations: artifact.weather.dailyObservations,
            seasonalIndicators: artifact.weather.seasonalIndicators,
            scopeNote: 'Gridded historical estimates for selected city reference points; not farm or district observations and not a crop-specific risk score.',
          },
          provenance: provenanceForSource(artifact.weather.source),
        }
      : { status: 'unavailable', reason: 'No historical weather observations are loaded.' },
    weatherForecast: artifact.weather.forecast,
    historicalMarket: marketObservations.length
      ? {
          status: 'available',
          value: {
            observations: marketObservations,
            indicators: marketIndicators,
            coverage: marketCoverage ?? {
              cropId,
              status: 'unavailable',
              observationCount: 0,
              marketCount: 0,
              earliestDate: null,
              latestDate: null,
              reason: 'No market coverage metadata is loaded for this crop.',
            },
            snapshot: artifact.historicalMarket.snapshot,
          },
          provenance: uniqueSources(marketObservations),
        }
      : {
          status: 'unavailable',
          reason: marketCoverage?.reason ?? artifact.historicalMarket.reason ?? 'No market observations are loaded for this crop.',
        },
    farmConditions: farmValidation
      ? farmValidation.valid
        ? { status: 'provided', recordKind: 'farm_measurement_or_farmer_report', value: farmValidation.value }
        : { status: 'invalid', errors: farmValidation.errors }
      : { status: 'unavailable', reason: 'No actual farm soil or water measurements have been imported.' },
    buyerDemand: {
      status: 'synthetic_demo_only',
      note: 'Buyer orders remain demo inputs in the existing frontend data layer; market history is not confirmed procurement demand.',
    },
  }
}
