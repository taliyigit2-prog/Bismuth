import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text'

const setClipboard = (value: unknown): void =>
  void Object.defineProperty(navigator, 'clipboard', { value, configurable: true })

const setExecCommand = (fn: ((cmd: string) => boolean) | undefined): void =>
  void Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true })

afterEach(() => {
  setClipboard(undefined)
  setExecCommand(undefined)
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('pano API varsa onunla kopyalar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('0532 111 22 33')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('0532 111 22 33')
  })

  it('pano API yokken (HTTP üzerinden telefon) gizli kutu + execCommand ile kopyalar, kutuyu kaldırır', async () => {
    setClipboard(undefined)
    let selected = ''
    const exec = vi.fn((cmd: string) => {
      const area = document.querySelector('textarea')
      selected = area?.value ?? ''
      return cmd === 'copy'
    })
    setExecCommand(exec)
    expect(await copyText('ABC Ltd.\nVergi no: 123')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
    expect(selected).toBe('ABC Ltd.\nVergi no: 123')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('pano API reddederse yedek yolu dener', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })
    setExecCommand(() => true)
    expect(await copyText('x')).toBe(true)
  })

  it('hiçbir yol yoksa hata atmadan false döner', async () => {
    setClipboard(undefined)
    setExecCommand(() => {
      throw new Error('not supported')
    })
    await expect(copyText('x')).resolves.toBe(false)
    setExecCommand(undefined)
    await expect(copyText('x')).resolves.toBe(false)
  })
})
