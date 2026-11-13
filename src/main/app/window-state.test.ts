import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fitToScreens,
  loadWindowState,
  resolveWindowState,
  trackWindowState,
  type TrackedWindow
} from './window-state'

const main = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
const second = { workArea: { x: 1920, y: 0, width: 1280, height: 984 } }
const stored = (o: object): string => JSON.stringify(o)

describe('pencere durumu: hatırlama', () => {
  it('boyut, taşıma, büyütme ve tam ekran durumu olduğu gibi geri gelir', () => {
    const state = resolveWindowState(
      stored({ bounds: { x: 100, y: 80, width: 1200, height: 800 }, maximized: true, fullScreen: true }),
      [main],
      main
    )
    expect(state).toEqual({
      bounds: { x: 100, y: 80, width: 1200, height: 800 },
      maximized: true,
      fullScreen: true,
      hasPosition: true
    })
  })

  it('eski dosyada tam ekran alanı yoksa tam ekran değildir', () => {
    const state = resolveWindowState(
      stored({ bounds: { x: 0, y: 0, width: 1200, height: 800 }, maximized: false }),
      [main],
      main
    )
    expect(state.fullScreen).toBe(false)
  })

  it('bozuk dosyada "true" ya da "false" metni büyütme/tam ekran sayılmaz', () => {
    const state = resolveWindowState(
      stored({
        bounds: { x: 0, y: 0, width: 1200, height: 800 },
        maximized: 'false',
        fullScreen: 'true'
      }),
      [main],
      main
    )
    expect(state.maximized).toBe(false)
    expect(state.fullScreen).toBe(false)
  })

  it('dosya yok, bozuk ya da çok küçükse sistem yer seçer', () => {
    for (const raw of [
      null,
      'not json',
      stored({}),
      stored({ bounds: { x: 0, y: 0, width: 100, height: 100 } })
    ])
      expect(resolveWindowState(raw, [main], main)).toMatchObject({ hasPosition: false, fullScreen: false })
  })

  it('dosyadan okur', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ws-'))
    try {
      const file = join(dir, 'window-state.json')
      expect(loadWindowState(file, [main], main).hasPosition).toBe(false)
      writeFileSync(file, stored({ bounds: { x: 10, y: 10, width: 1000, height: 700 }, maximized: false }))
      expect(loadWindowState(file, [main], main).bounds.width).toBe(1000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('pencere durumu: ekran dışı konum düzeltme', () => {
  it('pencere ikinci monitörde kaldıysa orada açılır', () => {
    const b = { x: 2000, y: 50, width: 1000, height: 700 }
    expect(fitToScreens(b, [main, second], main)).toEqual(b)
  })

  it('o monitör çıkarılmışsa birincil ekranın ortasına yerleşir', () => {
    const b = { x: 2000, y: 50, width: 1000, height: 700 }
    expect(fitToScreens(b, [main], main)).toEqual({ x: 460, y: 170, width: 1000, height: 700 })
  })

  it('iki ekrana taşan pencere çok yer kapladığı ekrana toplanır', () => {
    const b = { x: 1500, y: 100, width: 1000, height: 700 }
    expect(fitToScreens(b, [main, second], main)).toEqual({ x: 1920, y: 100, width: 1000, height: 700 })
  })

  it('ekrandan büyük pencere ekrana sığdırılır', () => {
    const small = { workArea: { x: 0, y: 0, width: 1280, height: 720 } }
    const fit = fitToScreens({ x: 0, y: 0, width: 1920, height: 1000 }, [small], small)
    expect(fit).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
  })
})

describe('pencere durumu: gecikmeli kayıt', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    vi.useFakeTimers()
    dir = mkdtempSync(join(tmpdir(), 'ws-'))
    file = join(dir, 'window-state.json')
  })
  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  function fakeWindow() {
    const handlers = new Map<string, () => void>()
    const win = {
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      full: false,
      on: (e: string, fn: () => void) => handlers.set(e, fn),
      isDestroyed: () => false,
      getNormalBounds() {
        return this.bounds
      },
      isMaximized: () => false,
      isFullScreen() {
        return this.full
      }
    }
    return { win, fire: (e: string) => handlers.get(e)?.() }
  }
  const read = () => JSON.parse(readFileSync(file, 'utf8')) as { bounds: { x: number }; fullScreen: boolean }

  it('sürükleme boyunca yazmaz, durduktan sonra bir kez yazar', () => {
    const { win, fire } = fakeWindow()
    trackWindowState(win as unknown as TrackedWindow, file, 500)
    for (let i = 1; i <= 20; i++) {
      win.bounds = { ...win.bounds, x: i * 10 }
      fire('move')
      vi.advanceTimersByTime(100)
    }
    expect(() => readFileSync(file)).toThrow()
    vi.advanceTimersByTime(500)
    expect(read().bounds.x).toBe(200)
  })

  it('tam ekrana geçiş kaydedilir; kapanışta bekleyen kayıt hemen yazılır', () => {
    const { win, fire } = fakeWindow()
    trackWindowState(win as unknown as TrackedWindow, file, 500)
    win.full = true
    fire('enter-full-screen')
    vi.advanceTimersByTime(500)
    expect(read().fullScreen).toBe(true)
    win.full = false
    fire('leave-full-screen')
    fire('close')
    expect(read().fullScreen).toBe(false)
  })
})
