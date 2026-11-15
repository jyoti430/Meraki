// Indicative crop reference values used by the planning engine.
// These are simplified, synthetic agronomic assumptions for the Meraki prototype.
// Replace with local agronomy guidance (KVK / state agriculture department) before real use.

export type WaterNeed = 'Low' | 'Medium' | 'High'

export interface CropProfile {
  id: string
  name: string
  defaultVariety: string
  emoji: string
  /** Days from sowing / transplanting to first harvest. */
  daysToFirstHarvest: number
  /** Typical length of the picking / harvest period. */
  harvestSpanDays: number
  /** Indicative yield range in kg per acre: [conservative, expected, good season]. */
  yieldPerAcre: [number, number, number]
  waterNeed: WaterNeed
  suitableSoils: string[]
  phRange: [number, number]
  /** Indicative seed requirement in kg per acre (nursery seed for transplanted crops). */
  seedKgPerAcre: number
  perennial?: boolean
  note: string
}

export const crops: CropProfile[] = [
  { id: 'okra', name: 'Okra', defaultVariety: 'Arka Anamika', emoji: '🌿', daysToFirstHarvest: 50, harvestSpanDays: 45, yieldPerAcre: [3200, 4200, 5200], waterNeed: 'Medium', suitableSoils: ['Loamy', 'Sandy loam', 'Black soil', 'Red soil'], phRange: [6.0, 6.8], seedKgPerAcre: 4, note: 'Short cycle, frequent picking. Works well with drip on limited water.' },
  { id: 'green-chilli', name: 'Green chilli', defaultVariety: 'G-4', emoji: '🌶️', daysToFirstHarvest: 75, harvestSpanDays: 60, yieldPerAcre: [2400, 3200, 4000], waterNeed: 'Medium', suitableSoils: ['Loamy', 'Black soil', 'Red soil', 'Sandy loam'], phRange: [6.0, 7.0], seedKgPerAcre: 0.1, note: 'Transplanted from nursery; avoid waterlogged plots.' },
  { id: 'drumstick', name: 'Drumstick', defaultVariety: 'PKM-1', emoji: '🌱', daysToFirstHarvest: 180, harvestSpanDays: 60, yieldPerAcre: [2500, 3500, 4500], waterNeed: 'Low', suitableSoils: ['Sandy loam', 'Red soil', 'Loamy', 'Black soil'], phRange: [6.2, 7.5], seedKgPerAcre: 0.25, note: 'Annual moringa type; tolerant of limited water once established.' },
  { id: 'baby-corn', name: 'Baby corn', defaultVariety: 'G-5 Shweta', emoji: '🌽', daysToFirstHarvest: 55, harvestSpanDays: 15, yieldPerAcre: [600, 800, 1000], waterNeed: 'High', suitableSoils: ['Loamy', 'Sandy loam', 'Black soil'], phRange: [5.8, 7.0], seedKgPerAcre: 9, note: 'Dehusked yield. Needs assured irrigation through cob formation.' },
  { id: 'bitter-gourd', name: 'Bitter gourd', defaultVariety: 'Pusa Do Mausami', emoji: '🥒', daysToFirstHarvest: 60, harvestSpanDays: 50, yieldPerAcre: [3000, 4000, 5000], waterNeed: 'Medium', suitableSoils: ['Loamy', 'Sandy loam', 'Red soil'], phRange: [6.0, 7.0], seedKgPerAcre: 2, note: 'Needs trellis / pandal; labour for staking.' },
  { id: 'tomato', name: 'Tomato', defaultVariety: 'Arka Rakshak', emoji: '🍅', daysToFirstHarvest: 75, harvestSpanDays: 50, yieldPerAcre: [8000, 11000, 14000], waterNeed: 'Medium', suitableSoils: ['Loamy', 'Red soil', 'Sandy loam', 'Black soil'], phRange: [6.0, 7.0], seedKgPerAcre: 0.06, note: 'High yield but prices swing sharply when many farmers plant together.' },
  { id: 'onion', name: 'Onion', defaultVariety: 'N-2-4-1', emoji: '🧅', daysToFirstHarvest: 120, harvestSpanDays: 20, yieldPerAcre: [6000, 8000, 10000], waterNeed: 'Medium', suitableSoils: ['Loamy', 'Black soil', 'Sandy loam'], phRange: [6.0, 7.5], seedKgPerAcre: 3.5, note: 'Rabi onion stores well, but regional supply is often high.' },
  { id: 'mango', name: 'Mango', defaultVariety: 'Alphonso', emoji: '🥭', daysToFirstHarvest: 0, harvestSpanDays: 30, yieldPerAcre: [1500, 2500, 3500], waterNeed: 'Medium', suitableSoils: ['Black soil', 'Loamy', 'Sandy loam', 'Red soil'], phRange: [5.5, 7.5], seedKgPerAcre: 0, perennial: true, note: 'Perennial orchard crop. Supply comes from existing trees, not new planting.' },
]

export const soilTypes = ['Black soil', 'Loamy', 'Sandy loam', 'Red soil', 'Clay', 'Laterite']

export const findCrop = (name: string) => crops.find((crop) => crop.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
