import { describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import { canDragStay, dropTarget, sameMove } from './drag'
import type { GridStayView } from './grid-model'

const stay = (over: Partial<GridStayView> = {}): GridStayView =>
  ({
    id: 's1',
    reservationId: 'r1',
    code: 'R-1',
    roomId: 'room-102',
    checkIn: localDate('2026-10-10'),
    checkOut: localDate('2026-10-13'),
    dayUse: false,
    reservationStatus: 'confirmed',
    stayStatus: 'planned',
    guestName: 'Ayla Demir',
    currency: 'TRY',
    nights: [],
    tagIds: [],
    vip: false,
    kbsMissing: false,
    standingNote: null,
    hasNotes: false,
    children: 0,
    ...over
  }) as GridStayView

const rooms = [{ id: 'room-101' }, { id: 'room-102' }, { id: 'room-103' }]
const base = { row: 1, dayPx: 56, rowPx: 40, rooms, today: localDate('2026-10-04') }

describe('takvimde sürükle-bırak (faz-15 madde 12)', () => {
  it('küçük kıpırtı tıklama sayılır; aşağı sürükleyince alttaki oda, aynı geceler', () => {
    expect(dropTarget({ ...base, stay: stay(), dx: 3, dy: 2 })).toBeNull()
    expect(dropTarget({ ...base, stay: stay(), dx: 4, dy: 38 })).toMatchObject({
      kind: 'room',
      fromRoomId: 'room-102',
      toRoomId: 'room-103',
      row: 2
    })
    // Past the last room: the last room.
    expect(dropTarget({ ...base, stay: stay(), dx: 0, dy: 400 })).toMatchObject({ toRoomId: 'room-103' })
  })

  it('yana sürükleyince aynı odada gün kayar, gece sayısı aynı kalır; geçmişe taşınmaz', () => {
    expect(dropTarget({ ...base, stay: stay(), dx: 112, dy: 6 })).toMatchObject({
      kind: 'dates',
      days: 2,
      checkIn: '2026-10-12',
      checkOut: '2026-10-15'
    })
    expect(dropTarget({ ...base, stay: stay(), dx: -56 * 7, dy: 0 })).toBeNull()
  })

  it('tek eksen: daha çok hareket edilen yön kazanır (oda ve tarih birlikte değişmez)', () => {
    expect(dropTarget({ ...base, stay: stay(), dx: 120, dy: 50 })?.kind).toBe('dates')
    expect(dropTarget({ ...base, stay: stay(), dx: 60, dy: 90 })?.kind).toBe('room')
  })

  it('içerideki misafir yalnız odaya taşınır; çıkmış konaklama taşınmaz', () => {
    const inHouse = stay({ stayStatus: 'in_house' })
    expect(canDragStay(inHouse, base.today)).toEqual({ room: true, dates: false })
    expect(dropTarget({ ...base, stay: inHouse, dx: 112, dy: 0 })).toBeNull()
    expect(dropTarget({ ...base, stay: inHouse, dx: 0, dy: -40 })).toMatchObject({ toRoomId: 'room-101' })
    expect(canDragStay(stay({ stayStatus: 'done' }), base.today)).toEqual({ room: false, dates: false })
  })

  it('çıkış günü sabahı (ya da çıkışı geçmiş) içerideki misafir sürüklenmez: taşınacak gece kalmadı (QA2c #8)', () => {
    const today = localDate('2026-10-13')
    const departing = stay({ stayStatus: 'in_house' })
    expect(canDragStay(departing, today)).toEqual({ room: false, dates: false })
    expect(canDragStay(departing, localDate('2026-10-14'))).toEqual({ room: false, dates: false })
    expect(dropTarget({ ...base, today, stay: departing, dx: 0, dy: -40 })).toBeNull()
    // The last night (12 Oct) can still move on the 12th.
    expect(canDragStay(departing, localDate('2026-10-12')).room).toBe(true)
    // A day use in the house moves on its own day.
    const dayUse = stay({ stayStatus: 'in_house', dayUse: true, checkOut: localDate('2026-10-10') })
    expect(canDragStay(dayUse, localDate('2026-10-10')).room).toBe(true)
    expect(canDragStay(dayUse, localDate('2026-10-11')).room).toBe(false)
  })

  it('aynı hedef yeniden çizim istemez', () => {
    const a = dropTarget({ ...base, stay: stay(), dx: 0, dy: 40 })
    const b = dropTarget({ ...base, stay: stay(), dx: 5, dy: 44 })
    expect(sameMove(a, b)).toBe(true)
    expect(sameMove(a, null)).toBe(false)
  })
})
