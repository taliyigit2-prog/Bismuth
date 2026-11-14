import { describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import type { GridStayView } from './grid-model'
import { nextSelection, pickedStays, uniqueReservations } from './selection'

const stay = (id: string, roomId: string, checkIn: string, reservationId = `r-${id}`): GridStayView =>
  ({ id, roomId, reservationId, checkIn: localDate(checkIn), checkOut: localDate(checkIn) }) as GridStayView

const stays = [
  stay('a', 'r101', '2026-10-01'),
  stay('b', 'r101', '2026-10-05'),
  stay('c', 'r101', '2026-10-09'),
  stay('d', 'r102', '2026-10-05')
]

describe('takvimde çoklu seçim', () => {
  it('Ctrl ile tıklanan çubuk seçime eklenir, yeniden tıklanınca çıkar', () => {
    const one = nextSelection(new Set(), stays, null, stays[0]!, 'toggle')
    expect([...one]).toEqual(['a'])
    const two = nextSelection(one, stays, stays[0]!, stays[3]!, 'toggle')
    expect([...two].sort()).toEqual(['a', 'd'])
    expect([...nextSelection(two, stays, stays[3]!, stays[3]!, 'toggle')]).toEqual(['a'])
  })

  it('Shift ile aynı odadaki iki çubuk arasındaki tüm konaklamalar seçilir', () => {
    const range = nextSelection(new Set(['a']), stays, stays[0]!, stays[2]!, 'range')
    expect([...range].sort()).toEqual(['a', 'b', 'c'])
  })

  it('Shift ile başka odadaki çubuk yalnız kendisini ekler', () => {
    const range = nextSelection(new Set(['a']), stays, stays[0]!, stays[3]!, 'range')
    expect([...range].sort()).toEqual(['a', 'd'])
  })

  it('seçilen konaklamalar ve tekil rezervasyonlar ayrılır', () => {
    const same = [...stays, stay('e', 'r103', '2026-10-05', 'r-a')]
    const picked = pickedStays(new Set(['a', 'e', 'x']), same)
    expect(picked.map((s) => s.id)).toEqual(['a', 'e'])
    expect(uniqueReservations(picked)).toEqual(['r-a'])
  })
})
