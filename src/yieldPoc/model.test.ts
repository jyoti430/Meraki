import { expect, it } from 'vitest'
import { artifact, defaultInput, defaultSupply, predictSynthetic, projectSynthetic } from './model'

it('matches fitted Python weights and keeps synthetic predictions out of production', () => {
  for (const row of artifact.parity_cases) expect(predictSynthetic(row.input).yieldKgHa).toBeCloseTo(row.prediction, 5)
  expect(predictSynthetic(defaultInput).productionAllowed).toBe(false)
  expect(artifact.synthetic).toBe(true)
})
it('rejects missing, nonfinite and out-of-envelope inputs', () => {
  for (const value of [NaN, Infinity, 0, 14]) expect(() => predictSynthetic({ ...defaultInput, soil_ph: value })).toThrow()
  expect(() => predictSynthetic({ ...defaultInput, historical_rain_mm: undefined as unknown as number })).toThrow()
})
it('explains the learned output as intercept plus feature contributions', () => {
  const result = predictSynthetic(defaultInput)
  expect(result.rawYield).toBeCloseTo(result.intercept + result.contributions.reduce((sum, row) => sum + row.value, 0), 8)
})
it('conserves gross harvest and applies each supply adjustment once', () => {
  const rows = projectSynthetic(10000, { ...defaultSupply, areaHa: 2, capacityKgWeek: 1e6 })
  expect(rows.reduce((sum, row) => sum + row.grossKg, 0)).toBeCloseTo(20000, 8)
  expect(rows.reduce((sum, row) => sum + row.supplyKg, 0)).toBeCloseTo(20000 * 0.8 * 0.75 * 0.95, 8)
})
it('withholds supply without consent and enforces each week capacity', () => {
  expect(projectSynthetic(10000, { ...defaultSupply, consent: false }).every(row => row.supplyKg === 0)).toBe(true)
  for (const capacity of [0, 10]) expect(projectSynthetic(10000, { ...defaultSupply, capacityKgWeek: capacity }).every(row => row.supplyKg <= capacity)).toBe(true)
})
it('rejects invalid scenario assumptions and supports zero harvest', () => {
  for (const patch of [{ areaHa: 0 }, { areaHa: Infinity }, { gradePct: 101 }, { committedPct: -1 }, { retentionPct: NaN }, { capacityKgWeek: -1 }]) expect(() => projectSynthetic(10000, { ...defaultSupply, ...patch })).toThrow()
  expect(projectSynthetic(0, defaultSupply).every(row => row.supplyKg === 0)).toBe(true)
})
