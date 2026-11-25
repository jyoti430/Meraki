import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { rowActivation } from './rowActivation'

const key = (k: string, own = true) => {
  const row = {} as EventTarget
  return { key: k, target: own ? row : ({} as EventTarget), currentTarget: row, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>
}

describe('keyboard-operable table rows', () => {
  it('is focusable and activates on Enter and Space', () => {
    const activate = vi.fn()
    const props = rowActivation(activate)
    expect(props.tabIndex).toBe(0)
    props.onKeyDown(key('Enter')); props.onKeyDown(key(' '))
    expect(activate).toHaveBeenCalledTimes(2)
  })
  it('ignores other keys and keys pressed inside nested controls', () => {
    const activate = vi.fn()
    const props = rowActivation(activate)
    props.onKeyDown(key('a')); props.onKeyDown(key('Enter', false))
    expect(activate).not.toHaveBeenCalled()
  })
})
