import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { settings } from '../db/schema'
import { baseCurrencyOf, createCurrencyService } from './currency-service'
import { createSettingsService } from './settings-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  return {
    clock,
    fx: createCurrencyService(depsOf(handle, clock)),
    settings: createSettingsService(handle.db, clock)
  }
}

describe('kur servisi (K-15, S-32)', () => {
  it('ana para birimi ayardan okunur; bozuk değer TL’ye düşer', async () => {
    const { fx, settings: s } = await setup()
    expect(fx.baseCurrency(reception)).toBe('TRY')
    s.set(owner, { 'hotel.baseCurrency': 'EUR' })
    expect(fx.baseCurrency(reception)).toBe('EUR')
    handle.db
      .update(settings)
      .set({ valueJson: '"euro"' })
      .where(eq(settings.key, 'hotel.baseCurrency'))
      .run()
    expect(baseCurrencyOf(handle.db)).toBe('TRY')
  })

  it('otel kuru elle düzeltmeden önce gelir; önizleme o anın kuruyla çevirir; geçmiş tarih aralığıyla süzülür', async () => {
    const { fx, clock } = await setup()
    expect(fx.preview(reception, 10_000, 'EUR')).toBeNull() // no rate yet: entry is still allowed
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    clock.advance(60 * 24)
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 51_000_000, source: 'manual' })
    fx.recordRate(owner, { base: 'USD', quote: 'TRY', midRateMicro: 40_000_000, source: 'manual' })
    // The owner's fixed hotel rate wins over a later one-off correction (Faz 11: the fx.mode setting picks).
    expect(fx.preview(reception, 10_000, 'EUR')).toMatchObject({ amountBaseMinor: 500_000, source: 'hotel' })
    expect(fx.preview(reception, 10_000, 'USD')).toMatchObject({ amountBaseMinor: 400_000, source: 'manual' })
    expect(fx.preview(reception, 510_000, 'TRY')).toMatchObject({ amountBaseMinor: 510_000 })
    expect(
      fx.history(reception, 'EUR', 'TRY', '2026-10-01T00:00:00.000Z', '2026-10-01T23:59:59.999Z')
    ).toHaveLength(1)
    expect(
      fx.history(reception, 'EUR', 'TRY', '2026-09-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z')
    ).toHaveLength(2)
  })

  it('sonradan gelen çok sayıda kur, önceliği yüksek eski otel kurunu gözden düşürmez', async () => {
    const { fx, clock } = await setup()
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    for (let i = 0; i < 60; i++) {
      clock.advance(1)
      fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 51_000_000 + i, source: 'manual' })
    }
    expect(fx.preview(reception, 10_000, 'EUR')).toMatchObject({ amountBaseMinor: 500_000, source: 'hotel' })
  })

  it('kur girmek döviz düzenleme yetkisi ister; para görmeyen rol kur da göremez', async () => {
    const { fx } = await setup()
    expect(() =>
      fx.recordRate(reception, { base: 'EUR', quote: 'TRY', midRateMicro: 1, source: 'hotel' })
    ).toThrow(/PERMISSION_DENIED/)
    const housekeeping = roleCtx('housekeeping')
    expect(() => fx.baseCurrency(housekeeping)).toThrow(/PERMISSION_DENIED/)
    expect(() => fx.preview(housekeeping, 1, 'EUR')).toThrow(/PERMISSION_DENIED/)
    expect(() => fx.history(housekeeping, 'EUR', 'TRY', '2026-01-01', '2027-01-01')).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() =>
      fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 0, source: 'hotel' })
    ).toThrow(/errors.validation/)
  })
})
