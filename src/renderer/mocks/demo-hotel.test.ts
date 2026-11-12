import { describe, expect, it } from 'vitest'
import { addDays, localDate } from '@shared/date'
import { createDemoHotel } from './demo-hotel'

const day = localDate('2026-10-04')
const hotel = createDemoHotel(day)

describe('örnek otel (Faz 3 sahte servis)', () => {
  it('19 oda, 38 yatak; aynı gün aynı oteli üretir', () => {
    expect(hotel.rooms).toHaveLength(19)
    expect(hotel.rooms.reduce((s, r) => s + r.beds, 0)).toBe(38)
    expect(JSON.stringify(createDemoHotel(day))).toBe(JSON.stringify(hotel))
  })

  it('bir odada aynı gece iki konaklama yok; bloklu günlere rezervasyon yazılmaz', () => {
    const taken = new Set<string>()
    for (const stay of hotel.reservations.flatMap((r) => r.stays)) {
      for (const n of stay.nights) {
        const key = `${stay.roomId}|${n.date}|${stay.dayUse ? 'day' : 'night'}`
        expect(taken.has(key), key).toBe(false)
        taken.add(key)
        for (const b of hotel.blocks)
          if (b.roomId === stay.roomId) expect(n.date >= b.dateFrom && n.date < b.dateTo, key).toBe(false)
      }
    }
  })

  it('gece durumları ödeme dağılımıyla tutarlı: dağıtılan toplam alınan parayı ve borcu aşmaz', () => {
    for (const r of hotel.reservations) {
      const allocated = r.stays.flatMap((s) => s.nights).reduce((s, n) => s + n.allocatedMinor, 0)
      expect(allocated).toBeLessThanOrEqual(Math.max(0, r.creditedMinor))
      expect(allocated).toBeLessThanOrEqual(r.chargesMinor)
      expect(r.balanceMinor).toBe(r.chargesMinor - r.creditedMinor)
    }
  })

  it('bugün otelde kalan, bugün gelecek ve gelecek tarihli rezervasyonlar ile park edilenler var', () => {
    const stays = hotel.reservations.flatMap((r) => r.stays)
    expect(stays.filter((s) => s.status === 'in_house').length).toBeGreaterThan(5)
    expect(stays.filter((s) => s.checkIn === day && s.status === 'planned').length).toBeGreaterThan(0)
    expect(stays.filter((s) => s.checkIn > addDays(day, 7)).length).toBeGreaterThan(10)
    expect(hotel.reservations.filter((r) => r.status === 'parked')).toHaveLength(2)
  })
})
