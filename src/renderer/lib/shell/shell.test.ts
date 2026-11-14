import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BismuthBridge } from '@shared/contract'
import { shell } from '.'

const bridge = (platform: string): BismuthBridge => ({ api: vi.fn(), ready: vi.fn(), platform })

afterEach(() => {
  delete window.bismuth
  vi.restoreAllMocks()
})

describe('shell in the program window (preload bridge present)', () => {
  it('reports the bridge platform and tells the main process the UI is up', () => {
    const b = bridge('darwin')
    window.bismuth = b
    expect(shell.kind).toBe('electron')
    expect(shell.platform).toBe('darwin')
    shell.ready()
    expect(b.ready).toHaveBeenCalledOnce()
  })

  it('prints with the window print dialog', () => {
    window.bismuth = bridge('win32')
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    shell.print()
    expect(print).toHaveBeenCalledOnce()
  })
})

describe('shell in a browser (no bridge)', () => {
  it('is a browser shell whose ready does nothing and whose platform follows the browser', () => {
    expect(shell.kind).toBe('browser')
    expect(shell.platform).toBe('')
    expect(() => shell.ready()).not.toThrow()
  })

  it('downloads a saved file through a temporary link holding the data', () => {
    const links: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      links.push(this)
    })
    shell.saveFile({ fileName: 'a.csv', mime: 'text/csv', base64: btoa('x,y') })
    expect(links).toHaveLength(1)
    expect(links[0]?.download).toBe('a.csv')
    expect(links[0]?.href).toBe(`data:text/csv;base64,${btoa('x,y')}`)
  })
})
