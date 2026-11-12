import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsMobile } from './use-mobile'

const media = (match: (query: string) => boolean): void => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: match(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

afterEach(() => vi.restoreAllMocks())

describe('telefon düzeni anahtarı', () => {
  it('yazdırırken sayfa dar olsa da ekrandaki düzen korunur (yazdırma düzeni yeniden kurulmaz)', () => {
    media(() => false)
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
    // Printing: the page box is narrower than 768 px, the media is print, not screen.
    media((q) => q === 'print' || q.includes('max-width'))
    expect(renderHook(() => useIsMobile()).result.current).toBe(false)
    // Back on screen at phone width: the phone layout.
    media((q) => q === 'screen' || q.includes('max-width'))
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
  })
})
