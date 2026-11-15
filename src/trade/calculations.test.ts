import { describe, expect, it } from 'vitest'
import { adjustmentBreakdown, allocateMembers, decimalToInteger, lineAmount, validateReceipt } from './calculations'

describe('trade quantity and money inputs', () => {
  it('preserves fixed precision and refuses ambiguous values', () => {
    expect(decimalToInteger('1.005', 3)).toBe(1005)
    expect(decimalToInteger('42.50', 2)).toBe(4250)
    for (const value of ['NaN', 'Infinity', '-1', '1e3', '1.0001', '']) {
      expect(() => decimalToInteger(value, 3)).toThrow()
    }
    expect(() => decimalToInteger('9007199254740992', 3)).toThrow()
  })
  it('rounds a positive half-paise up using integer arithmetic', () => {
    expect(lineAmount(1, 500)).toBe(1)
    expect(lineAmount(1005, 4250)).toBe(4271)
  })
  it('allocates all paise by contribution and stable member ID', () => {
    expect(allocateMembers(101, [{ member_id: 'b', weight_g: 1 }, { member_id: 'a', weight_g: 1 }]))
      .toEqual([{ member_id: 'b', amount_paise: 50 }, { member_id: 'a', amount_paise: 51 }])
    expect(() => allocateMembers(20, [{ member_id: 'a', weight_g: 0 }])).toThrow()
    expect(() => allocateMembers(20, [{ member_id: 'a', weight_g: 1 }, { member_id: 'a', weight_g: 2 }])).toThrow()
    expect(allocateMembers(1, [{ member_id: '\u{10000}', weight_g: 1 }, { member_id: '\uE000', weight_g: 1 }]))
      .toEqual([{ member_id: '\u{10000}', amount_paise: 0 }, { member_id: '\uE000', amount_paise: 1 }])
  })
  it('requires receipt partitions and adverse-grade reasons to reconcile', () => {
    expect(validateReceipt(1000, 800, 100, 100, 'Cosmetic downgrade; bruised rejects')).toBe('')
    expect(validateReceipt(1000, 800, 0, 100, '')).toContain('equal')
    expect(validateReceipt(1000, 800, 100, 100, '')).toContain('reason')
    expect(validateReceipt(1000, -1, 1, 1000, 'Reason')).toContain('negative')
  })
  it('keeps bilateral seller credits distinct from deductions in a signed ledger', () => {
    expect(adjustmentBreakdown({ adjustments_paise: -1000 })).toEqual({ deductions_paise: 0, credits_paise: 1000 })
    expect(adjustmentBreakdown({ adjustments_paise: 750 })).toEqual({ deductions_paise: 750, credits_paise: 0 })
    expect(adjustmentBreakdown({ adjustments_paise: -250, deductions_paise: 750, credits_paise: 1000 })).toEqual({ deductions_paise: 750, credits_paise: 1000 })
  })
})
