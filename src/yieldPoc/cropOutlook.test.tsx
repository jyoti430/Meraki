import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import YieldPoc from '../pages/YieldPoc'
import { buildCropOutlook } from './cropOutlook'

it('returns seven repeatable crop options with positive reference yields', () => {
  const rows = buildCropOutlook(1)
  expect(rows).toHaveLength(7)
  expect(new Set(rows.map(row => row.crop)).size).toBe(7)
  expect(rows.every(row => row.yieldKgHa > 0 && row.harvestKg === row.yieldKgHa)).toBe(true)
  expect(buildCropOutlook(1)).toEqual(rows)
})

it('scales harvest to fractional plot areas without changing reference yield', () => {
  const small = buildCropOutlook(0.25)
  const large = buildCropOutlook(2.5)
  small.forEach((row, index) => {
    expect(large[index].crop).toBe(row.crop)
    expect(large[index].yieldKgHa).toBe(row.yieldKgHa)
    expect(large[index].harvestKg).toBeCloseTo(row.harvestKg * 10)
  })
})

it('does not allow callers to mutate future results', () => {
  buildCropOutlook(1)[0].harvestKg = 0
  expect(buildCropOutlook(1)[0].harvestKg).toBeGreaterThan(0)
})

it('rejects missing/zero, negative, nonfinite and oversized plot areas', () => {
  for (const area of [0, -1, NaN, Infinity, 100.01]) expect(() => buildCropOutlook(area)).toThrow(/plot area/)
  expect(buildCropOutlook(100)).toHaveLength(7)
})

it('waits for Run synthesis before showing yield results', () => {
  const html = renderToStaticMarkup(<YieldPoc />)
  expect(html).toContain('Run synthesis')
  expect(html).not.toContain('Crop yield results')
  expect(html).not.toContain('Dummy prediction')
  expect(html).not.toContain('demo')
})
