import { describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import { intentOf, stayActions } from './stay-actions'
import { splitGuestName } from './split-guest-name'

const today = localDate('2026-10-05')
const full = { edit: true, pay: true }
const stay = (over: object) => ({
  reservationStatus: 'confirmed' as const,
  stayStatus: 'planned' as const,
  checkIn: localDate('2026-10-05'),
  ...over
})

describe('sağ tık menüsü: hangi işlem hangi durumda açık', () => {
  it('bugün gelecek onaylı rezervasyonda giriş, gelmedi, park ve vazgeçme açık; çıkış kapalı', () => {
    const a = stayActions(stay({}), today, full)
    expect(a).toMatchObject({
      checkIn: true,
      checkOut: false,
      noShow: true,
      park: true,
      giveUp: true,
      pay: true
    })
  })

  it('ileri tarihli rezervasyonda giriş ve gelmedi kapalı, park açık', () => {
    const a = stayActions(stay({ checkIn: localDate('2026-10-09') }), today, full)
    expect(a).toMatchObject({ checkIn: false, noShow: false, park: true })
  })

  it('odadaki misafirde çıkış ve vazgeçme açık, park ve gelmedi kapalı', () => {
    const a = stayActions(stay({ reservationStatus: 'checked_in', stayStatus: 'in_house' }), today, full)
    expect(a).toMatchObject({ checkOut: true, giveUp: true, park: false, noShow: false, checkIn: false })
  })

  it('çıkış yapmış konaklamada yalnız misafir kartı ve not açık', () => {
    const a = stayActions(stay({ reservationStatus: 'checked_out', stayStatus: 'done' }), today, full)
    expect(
      Object.entries(a)
        .filter(([, on]) => on)
        .map(([k]) => k)
        .sort()
    ).toEqual(['guest', 'note'])
  })

  it('yalnız görüntüleme yetkisinde işlem yok, misafir kartı açık; ödeme yetkisi ayrıdır', () => {
    const a = stayActions(stay({}), today, { edit: false, pay: false })
    expect(
      Object.entries(a)
        .filter(([, on]) => on)
        .map(([k]) => k)
    ).toEqual(['guest'])
    expect(stayActions(stay({}), today, { edit: false, pay: true }).pay).toBe(true)
  })

  it('vazgeçme: odadaki misafir için oda adımı, gelecek konaklama için rezervasyon iptali açılır', () => {
    expect(intentOf('giveUp', { id: 's1', stayStatus: 'in_house' })).toEqual({ kind: 'giveUp', stayId: 's1' })
    expect(intentOf('giveUp', { id: 's1', stayStatus: 'planned' })).toEqual({ kind: 'cancel' })
    expect(intentOf('move', { id: 's1', stayStatus: 'planned' })).toEqual({ kind: 'stays' })
  })
})

describe('hızlı rezervasyon: misafir adı bölme', () => {
  it('son sözcük soyadı olur, gerisi ad', () => {
    expect(splitGuestName('Ayşe Nur Yılmaz')).toEqual({ firstName: 'Ayşe Nur', lastName: 'Yılmaz' })
    expect(splitGuestName('  Deniz  ')).toEqual({ firstName: 'Deniz', lastName: '' })
  })
})
