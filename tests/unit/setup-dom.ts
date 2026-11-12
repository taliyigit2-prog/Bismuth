import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

afterEach(() => cleanup())

// CI machines run many test files at once: a screen that appears in 50 ms here can take over a second there.
// `findBy…`/`waitFor` wait up to 15 s before failing (a passing test does not wait longer).
configure({ asyncUtilTimeout: 15_000 })

// jsdom lacks these browser APIs used by Radix and the layout switch.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList
}
// jsdom has scrollTo but only logs "Not implemented" on every call (thousands of lines per run on the phone layouts).
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true, configurable: true })
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
}
