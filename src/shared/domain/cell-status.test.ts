import { describe, expect, it } from 'vitest'
import { STATUS_KEYS, type StatusKey } from '../contract/settings'
import { autoStatus, cellStyle, resolveAuto, standingNoteAlert, type CellInput } from './cell-status'

const all = new Set<StatusKey>(STATUS_KEYS)
const without = (...k: StatusKey[]) => new Set(STATUS_KEYS.filter((x) => !k.includes(x)))
const cell = (c: Partial<CellInput>): CellInput => ({
  pay: null,
  dayUse: false,
  blocked: false,
  past: false,
  ...c
})

describe('otomatik hücre durumu (§6.3)', () => {
  it('boş, geçmişte boş, satılmaz, ödeme durumları ve day-use', () => {
    expect(autoStatus(cell({}))).toBe('empty')
    expect(autoStatus(cell({ past: true }))).toBe('pastEmpty')
    expect(autoStatus(cell({ blocked: true, past: true }))).toBe('blocked')
    expect(autoStatus(cell({ pay: 'partial' }))).toBe('partial')
    expect(autoStatus(cell({ pay: 'paid', dayUse: true }))).toBe('dayuse')
  })

  it('kapatılan otomatik etiket için geri dönüş: kısmen → ödenmedi + kapora simgesi', () => {
    expect(resolveAuto(cell({ pay: 'partial' }), without('partial'))).toEqual({
      code: 'unpaid',
      depositIcon: true
    })
    expect(resolveAuto(cell({ pay: 'paid', dayUse: true }), without('dayuse'))).toEqual({
      code: 'paid',
      depositIcon: false
    })
    expect(resolveAuto(cell({ past: true }), without('pastEmpty')).code).toBe('empty')
    expect(resolveAuto(cell({ pay: 'paid' }), without('paid')).code).toBeNull()
  })
})

describe('özel etiket + otomatik durum (§6.14, kabul ölçütü)', () => {
  const sorunlu = { id: 'sorunlu', enabled: true, priorityOverAuto: true }
  const grup = { id: 'grup', enabled: true, priorityOverAuto: false }

  it('öncelikli özel etiket dolguyu alır, otomatik durum kenarlıkta görünür', () => {
    expect(cellStyle(cell({ pay: 'paid' }), all, [sorunlu])).toEqual({
      auto: 'paid',
      fill: { kind: 'custom', tagId: 'sorunlu' },
      border: { kind: 'auto', code: 'paid' },
      depositIcon: false
    })
  })
  it('öncelikli olmayan etiket kenarlıkta; kapalı etiket ve boş hücre etiket göstermez', () => {
    expect(cellStyle(cell({ pay: 'unpaid' }), all, [grup])).toMatchObject({
      fill: { kind: 'auto', code: 'unpaid' },
      border: { kind: 'custom', tagId: 'grup' }
    })
    expect(cellStyle(cell({ pay: 'unpaid' }), all, [{ ...sorunlu, enabled: false }]).border).toBeNull()
    expect(cellStyle(cell({}), all, [sorunlu]).fill).toEqual({ kind: 'auto', code: 'empty' })
  })
  it('otomatik etiket kapalıyken özel etiketle birlikte geri dönüş kuralı çalışır', () => {
    expect(cellStyle(cell({ pay: 'partial' }), without('partial'), [grup])).toEqual({
      auto: 'unpaid',
      fill: { kind: 'auto', code: 'unpaid' },
      border: { kind: 'custom', tagId: 'grup' },
      depositIcon: true
    })
  })
})

describe('sürekli istek uyarısı (G-192)', () => {
  it('"önemli" seviye kaydetmeden önce onay ister; boş not uyarı vermez', () => {
    expect(standingNoteAlert({ standingNote: ' yüksek kat ister ', standingNoteLevel: 'warn' })).toEqual({
      text: 'yüksek kat ister',
      level: 'warn',
      requiresConfirm: true
    })
    expect(standingNoteAlert({ standingNote: 'ekstra yastık' })?.requiresConfirm).toBe(false)
    expect(standingNoteAlert({ standingNote: '  ' })).toBeNull()
  })
})
