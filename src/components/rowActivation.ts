import type { KeyboardEvent } from 'react'

/**
 * Props that make a clickable table row reachable and operable from the keyboard.
 * Enter or Space on the focused row activates it; keys pressed inside nested
 * controls (links, buttons, inputs) are left to those controls.
 */
export function rowActivation(onActivate: () => void) {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate() }
    },
  }
}
