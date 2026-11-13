import { describe, expect, it } from 'vitest'
import tr from '@/i18n/tr.json'
import en from '@/i18n/en.json'
import ru from '@/i18n/ru.json'
import { moveCursor } from '@/features/calendar/grid-model'
import {
  comboCaps,
  globalShortcutFor,
  isTypingTarget,
  letterOf,
  matchesCombo,
  shortcutById,
  shortcutHint,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type KeyLike
} from './registry'

const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  code: undefined,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra
})

const SOURCE = import.meta.glob<string>(
  ['../../features/calendar/calendar-grid.tsx', '../../components/ui/sidebar.tsx'],
  { query: '?raw', import: 'default', eager: true }
)

const lookup = (dict: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict)

describe('kısayol listesi (tek kaynak)', () => {
  it('her satırın metni üç dilde var; gruplar sırayla dolu', () => {
    for (const s of SHORTCUTS)
      for (const dict of [tr, en, ru]) expect(typeof lookup(dict, s.labelKey), s.labelKey).toBe('string')
    for (const g of SHORTCUT_GROUPS) {
      expect(SHORTCUTS.some((s) => s.group === g)).toBe(true)
      for (const dict of [tr, en, ru]) expect(typeof lookup(dict, `shortcuts.group.${g}`)).toBe('string')
    }
  })

  it('aynı tuş iki genel işe bağlı değil', () => {
    const seen = new Map<string, string>()
    for (const s of SHORTCUTS.filter((d) => d.group === 'global'))
      for (const combo of s.keys) {
        expect(seen.get(combo), `${combo}: ${s.id}`).toBeUndefined()
        seen.set(combo, s.id)
      }
  })

  it('yeni rezervasyon, ara, bugüne git, ödeme gir ve liste genel kısayoldur (G-19)', () => {
    const actions = SHORTCUTS.flatMap((s) => (s.action ? [s.action] : []))
    expect(actions).toEqual(
      expect.arrayContaining(['newReservation', 'search', 'goToday', 'addPayment', 'shortcutList'])
    )
    expect(globalShortcutFor(key('?', { shiftKey: true }))?.action).toBe('shortcutList')
    expect(globalShortcutFor(key('F1'))?.action).toBe('shortcutList')
    expect(globalShortcutFor(key('n'))?.action).toBe('newReservation')
    expect(globalShortcutFor(key('p'))?.action).toBe('addPayment')
    expect(globalShortcutFor(key('t'))?.action).toBe('goToday')
    expect(globalShortcutFor(key('/'))?.action).toBe('search')
    expect(globalShortcutFor(key('k', { ctrlKey: true }))?.action).toBe('search')
    expect(globalShortcutFor(key('l', { metaKey: true }))?.action).toBe('lock')
  })

  it('tam ekran ve yakınlaştırma pencerenin kendi tuşları olarak listelenir (Ö-23)', () => {
    expect(shortcutById('fullscreen')?.keys).toEqual(['F11', 'mod+shift+f'])
    expect(shortcutById('zoom')?.keys).toEqual(['mod+plus', 'mod+-'])
    expect(shortcutById('zoom-reset')?.keys).toEqual(['mod+0'])
    // Pencere yanıtladığı için sayfa dinleyicisi bunları ikinci kez çalıştırmaz.
    for (const id of ['fullscreen', 'zoom', 'zoom-reset']) expect(shortcutById(id)?.action).toBeUndefined()
    expect(comboCaps('mod+plus', false)).toEqual(['Ctrl', '+'])
    expect(comboCaps('mod+shift+f', true)).toEqual(['⌘', '⇧', 'F'])
  })

  it('takvim satırları ızgaranın gerçekten kullandığı tuşlar', () => {
    const cursor = { row: 2, col: 10 }
    for (const id of ['calendar-move', 'calendar-week'])
      for (const k of shortcutById(id)?.keys ?? []) expect(moveCursor(cursor, k, 5, 30), k).not.toBeNull()
    const grid = SOURCE['../../features/calendar/calendar-grid.tsx'] ?? ''
    for (const id of ['calendar-today', 'calendar-open', 'calendar-new']) expect(grid).toContain(`'${id}'`)
  })

  it('kenar menü kısayolu kenar menünün dinlediği tuş', () => {
    const sidebar = SOURCE['../../components/ui/sidebar.tsx'] ?? ''
    const letter = /SIDEBAR_KEYBOARD_SHORTCUT = "([a-z])"/.exec(sidebar)?.[1]
    expect(shortcutById('sidebar')?.keys).toEqual([`mod+${letter}`])
  })
})

describe('tuş eşleme', () => {
  it('tek harf Ctrl/⌘/Alt ile değil, Büyük harf kilidiyle de çalışır', () => {
    expect(matchesCombo(key('n'), 'n')).toBe(true)
    expect(matchesCombo(key('N', { shiftKey: true }), 'n')).toBe(true)
    expect(matchesCombo(key('n', { ctrlKey: true }), 'n')).toBe(false)
    expect(matchesCombo(key('n', { altKey: true }), 'n')).toBe(false)
  })

  it('Rusça klavyede aynı fiziksel tuş aynı kısayoldur', () => {
    expect(letterOf(key('т', { code: 'KeyN' }))).toBe('n')
    expect(matchesCombo(key('т', { code: 'KeyN' }), 'n')).toBe(true)
    expect(matchesCombo(key('л', { code: 'KeyK', ctrlKey: true }), 'mod+k')).toBe(true)
    // A Turkish "ı" is a letter of its own on its own key: it is not "i".
    expect(letterOf(key('ı', { code: 'KeyI' }))).toBe('i')
    expect(letterOf(key('1', { code: 'Digit1' }))).toBeNull()
  })

  it('Ctrl ve ⌘ ikisi de "mod"; Shift eklenince kilit kısayolu değildir', () => {
    expect(matchesCombo(key('k', { ctrlKey: true }), 'mod+k')).toBe(true)
    expect(matchesCombo(key('k', { metaKey: true }), 'mod+k')).toBe(true)
    expect(matchesCombo(key('k'), 'mod+k')).toBe(false)
    expect(matchesCombo(key('L', { ctrlKey: true, shiftKey: true }), 'mod+l')).toBe(false)
  })

  it('"?" ve "/" Shift ile yazılsa da tanınır; F1 tek başına', () => {
    expect(matchesCombo(key('?', { shiftKey: true }), '?')).toBe(true)
    expect(matchesCombo(key('/', { shiftKey: true }), '/')).toBe(true)
    expect(matchesCombo(key('?', { ctrlKey: true }), '?')).toBe(false)
    expect(matchesCombo(key('F1'), 'F1')).toBe(true)
    expect(matchesCombo(key('Tab', { shiftKey: true }), 'shift+Tab')).toBe(true)
    expect(matchesCombo(key('Tab', { shiftKey: true }), 'Tab')).toBe(false)
  })

  it('yazı alanı: metin, arama, sayı ve çok satırlı alan; onay kutusu ve düğme değil', () => {
    const el = (html: string): Element => {
      const box = document.createElement('div')
      box.innerHTML = html
      return box.firstElementChild as Element
    }
    expect(isTypingTarget(el('<input>'))).toBe(true)
    expect(isTypingTarget(el('<input type="search">'))).toBe(true)
    expect(isTypingTarget(el('<input type="number">'))).toBe(true)
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true)
    expect(isTypingTarget(el('<select></select>'))).toBe(true)
    expect(isTypingTarget(el('<div role="combobox"></div>'))).toBe(true)
    const editable = el('<div contenteditable="true"></div>') as HTMLElement
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(isTypingTarget(editable)).toBe(true)
    expect(isTypingTarget(el('<input type="checkbox">'))).toBe(false)
    expect(isTypingTarget(el('<button>x</button>'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })

  it("tuş adları: Mac'te ⌘, diğerlerinde Ctrl; oklar simgeyle", () => {
    expect(comboCaps('mod+k', false)).toEqual(['Ctrl', 'K'])
    expect(comboCaps('mod+k', true)).toEqual(['⌘', 'K'])
    expect(comboCaps('ArrowLeft', false)).toEqual(['←'])
    expect(comboCaps('Escape', false)).toEqual(['Esc'])
    expect(shortcutHint('lock', false)).toBe('Ctrl L')
    expect(shortcutHint('lock', true)).toBe('⌘L')
    expect(shortcutHint('search', false)).toBe('Ctrl K')
  })
})
