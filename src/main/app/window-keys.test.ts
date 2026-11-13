import { describe, expect, it } from 'vitest'
import { MIN_ZOOM, MAX_ZOOM, nextZoom, snapZoom, ZOOM_STEPS } from '@shared/window-zoom'
import { minWindowWidth, windowKeyAction, type KeyInput } from './window-keys'

const press = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  type: 'keyDown',
  key,
  code: '',
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...extra
})

describe('pencere tuşları', () => {
  it('F11 ve Ctrl/⌘+Shift+F tam ekrandır', () => {
    expect(windowKeyAction(press('F11'))).toBe('fullscreen')
    expect(windowKeyAction(press('F', { control: true, shift: true, code: 'KeyF' }))).toBe('fullscreen')
    expect(windowKeyAction(press('f', { meta: true, shift: true, code: 'KeyF' }))).toBe('fullscreen')
    // Rusça klavyede aynı fiziksel tuş
    expect(windowKeyAction(press('А', { control: true, shift: true, code: 'KeyF' }))).toBe('fullscreen')
  })

  it('Ctrl+F (arama) ve Ctrl+Shift+başka tuş tam ekran değildir', () => {
    expect(windowKeyAction(press('f', { control: true, code: 'KeyF' }))).toBeNull()
    expect(windowKeyAction(press('K', { control: true, shift: true, code: 'KeyK' }))).toBeNull()
  })

  it('Ctrl +, -, 0 yakınlaştırma; tuş bırakma ve Alt ile olanlar değil', () => {
    expect(windowKeyAction(press('=', { control: true }))).toEqual({ zoom: 'in' })
    expect(windowKeyAction(press('+', { control: true, shift: true }))).toEqual({ zoom: 'in' })
    expect(windowKeyAction(press('-', { meta: true }))).toEqual({ zoom: 'out' })
    expect(windowKeyAction(press('0', { control: true }))).toEqual({ zoom: 'reset' })
    expect(windowKeyAction(press('-', { control: true, alt: true }))).toBeNull()
    expect(windowKeyAction({ ...press('F11'), type: 'keyUp' })).toBeNull()
    expect(windowKeyAction(press('-'))).toBeNull()
  })
})

describe('yakınlaştırma adımları', () => {
  it('adım adım büyür ve küçülür, uçlarda durur, 0 varsayılana döner', () => {
    expect(nextZoom(100, 'in')).toBe(110)
    expect(nextZoom(100, 'out')).toBe(90)
    expect(nextZoom(MAX_ZOOM, 'in')).toBe(MAX_ZOOM)
    expect(nextZoom(MIN_ZOOM, 'out')).toBe(MIN_ZOOM)
    expect(nextZoom(150, 'reset')).toBe(100)
  })

  it('listede olmayan değer en yakın adıma oturur', () => {
    expect(snapZoom(118)).toBe(125)
    expect(snapZoom(Number.NaN)).toBe(100)
    expect(ZOOM_STEPS).toContain(snapZoom(300))
  })
})

describe('en küçük pencere genişliği', () => {
  it('960, ama ekranın çalışma alanından geniş olmaz (1280 px, Windows %150 = 853)', () => {
    expect(minWindowWidth(1920, 100)).toBe(960)
    expect(minWindowWidth(853, 100)).toBe(853)
  })

  it('yakınlaştırılmış sayfa telefon düzenine düşmeyecek kadar geniş kalır', () => {
    expect(minWindowWidth(1920, 150)).toBe(1152)
  })
})
