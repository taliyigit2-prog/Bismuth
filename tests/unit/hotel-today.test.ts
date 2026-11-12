// QA4: the app has one "today", the hotel's day (hotel.timezone). Reservations/ledger and the exchange rate read it
// the same way, so the screens never disagree about the date (flow-d D5).
import { afterEach, describe, expect, it } from 'vitest'
import { setHotelTimeZone } from '../../src/shared/date'
import { makeHarness, setUp } from '../factories/desk'

afterEach(() => setHotelTimeZone(null))

describe('otelin tek "bugün"ü', () => {
  it('Kiritimati oteli: 10 Ekim 12:00 UTC rezervasyon formunda 11 Ekim olur (döviz günüyle aynı)', async () => {
    const h = await makeHarness()
    h.clock.set('2026-10-10T12:00:00Z')
    await setUp(h)
    expect((await h.call('settings.set', { 'hotel.timezone': 'Pacific/Kiritimati' })).status).toBe(200)
    expect((await h.call<{ today: string }>('booking.options')).body.today).toBe('2026-10-11')
  })

  it('saat dilimi makineninkiyle aynıysa (İstanbul) gün değişmez; dilim değişince gün hemen izler', async () => {
    const h = await makeHarness()
    h.clock.set('2026-10-10T12:00:00Z')
    await setUp(h)
    expect((await h.call('settings.set', { 'hotel.timezone': 'Europe/Istanbul' })).status).toBe(200)
    expect((await h.call<{ today: string }>('booking.options')).body.today).toBe('2026-10-10')
    expect((await h.call('settings.set', { 'hotel.timezone': 'America/Los_Angeles' })).status).toBe(200)
    h.clock.set('2026-10-10T05:00:00Z')
    expect((await h.call<{ today: string }>('booking.options')).body.today).toBe('2026-10-09')
  })
})
