// Fixed planning references, independent of the experimental single-crop model.
// These values are not farm observations or a suitability ranking.
const cropReferences = [
  { crop: 'Okra', yieldKgHa: 10000 },
  { crop: 'Tomato', yieldKgHa: 24000 },
  { crop: 'Green chilli', yieldKgHa: 12000 },
  { crop: 'Baby corn', yieldKgHa: 8000 },
  { crop: 'Bitter gourd', yieldKgHa: 14000 },
  { crop: 'Drumstick', yieldKgHa: 18000 },
  { crop: 'Red onion', yieldKgHa: 22000 },
] as const

export function buildCropOutlook(areaHa: number) {
  if (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 100) {
    throw new Error('Enter a plot area greater than 0 and up to 100 hectares.')
  }
  return cropReferences.map(reference => ({ ...reference, harvestKg: reference.yieldKgHa * areaHa }))
}
