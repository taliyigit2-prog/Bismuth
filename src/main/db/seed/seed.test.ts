import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { PERMISSION_KEYS } from '@shared/permissions'
import { memoryDatabase } from '../../../../tests/factories/db'
import {
  countryMap,
  rolePermissions,
  roles,
  salesChannels,
  settings,
  statusTags,
  taskTemplates
} from '../schema'
import { CHANNEL_SEED } from './lists'
import { recurrenceRuleSchema } from '@shared/domain/task-recurrence'
import { seedBaseData } from './seed'
import { TASK_TEMPLATE_SEED } from './tasks'

describe('tohum veriler (faz-02 madde 4)', () => {
  it('ilk açılışta rolleri, yetkileri, listeleri ve ülke eşlemesini yükler', async () => {
    const h = await memoryDatabase()
    const report = seedBaseData(h.db, new Date('2026-10-01T09:00:00Z'))
    expect(report.inserted.roles).toBe(6)
    expect(report.inserted.role_permissions).toBe(6 * PERMISSION_KEYS.length)
    expect(report.inserted.status_tags).toBe(7)
    expect(report.inserted.payment_methods).toBe(3)
    expect(report.inserted.country_map).toBeGreaterThan(10)
    const owner = h.db.select().from(roles).where(eq(roles.code, 'owner')).get()
    expect(owner?.nameI18n).toEqual({ tr: 'Sahip', en: 'Owner', ru: 'Владелец' })
    const handover = h.db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.permission, 'payments.handover'))
      .all()
    expect(handover.filter((r) => r.level === 'edit')).toHaveLength(2) // Sahip + Müdür (S-30)
    const tags = h.db.select().from(statusTags).all()
    expect(tags.every((t) => t.kind === 'auto' && t.enabled)).toBe(true)
    const legal = h.db.select().from(taskTemplates).where(eq(taskTemplates.kind, 'legal')).all()
    expect(legal.every((t) => t.active && !t.suggested)).toBe(true)
    expect(h.db.select().from(countryMap).where(eq(countryMap.keyNormalized, 'KKTC')).get()?.iso2).toBe('XC')
    h.close()
  })

  it('görev önerileri: kodlar tekil, her kural ortak şemadan geçer, adlar üç dilde; öneriler kapalı başlar', () => {
    const codes = TASK_TEMPLATE_SEED.map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const t of TASK_TEMPLATE_SEED) {
      expect(recurrenceRuleSchema.safeParse(t.recurrence).success, t.code).toBe(true)
      for (const lang of ['tr', 'en', 'ru'] as const)
        expect(t.title[lang]?.trim(), `${t.code} ${lang}`).toBeTruthy()
      // Only the legal reminders and the every-N-stays deep clean start on; every suggestion waits to be picked.
      if (t.suggested) expect(t.active, t.code).toBe(false)
      else expect(t.kind === 'legal' || t.code === 'deep_clean_every_n', t.code).toBe(true)
    }
    const suggestions = TASK_TEMPLATE_SEED.filter((t) => t.suggested)
    expect(suggestions.length).toBeGreaterThanOrEqual(30)
    // Legal content comes from the owner: still the two Turkish reminders (G-93).
    expect(TASK_TEMPLATE_SEED.filter((t) => t.kind === 'legal').map((t) => t.code)).toEqual([
      'legal_tourism_stats',
      'legal_kbs_checkout'
    ])
    // Suggestions repeat on the calendar or from the last completion, each at a time of day.
    expect(suggestions.every((t) => ['daily', 'weekly', 'interval'].includes(t.recurrence.kind))).toBe(true)
  })

  it("TR yasal hatırlatıcıları yalnız Türkiye'deki otelde açık tohumlanır (K-46 (7))", async () => {
    const h = await memoryDatabase()
    h.db.insert(settings).values({ key: 'hotel.country', valueJson: '"DE"', updatedAt: 'x' }).run()
    seedBaseData(h.db)
    const legal = h.db.select().from(taskTemplates).where(eq(taskTemplates.kind, 'legal')).all()
    expect(legal.map((t) => [t.code, t.active])).toEqual([
      ['legal_tourism_stats', false],
      ['legal_kbs_checkout', false]
    ])
    h.close()
  })

  it('var olan otelin görevleri ülke değişince kendiliğinden değişmez (yalnız öneri ve ilk tohum)', async () => {
    const h = await memoryDatabase()
    seedBaseData(h.db)
    h.db.insert(settings).values({ key: 'hotel.country', valueJson: '"DE"', updatedAt: 'x' }).run()
    expect(seedBaseData(h.db).inserted).toEqual({})
    const legal = h.db.select().from(taskTemplates).where(eq(taskTemplates.kind, 'legal')).all()
    expect(legal.every((t) => t.active)).toBe(true)
    h.close()
  })

  it('yeni eklenen öneriler eski veritabanına bir sonraki açılışta kapalı olarak gelir', async () => {
    const h = await memoryDatabase()
    seedBaseData(h.db)
    h.db.delete(taskTemplates).where(eq(taskTemplates.code, 'mattress_rotation')).run()
    expect(seedBaseData(h.db).inserted).toEqual({ task_templates: 1 })
    const row = h.db.select().from(taskTemplates).where(eq(taskTemplates.code, 'mattress_rotation')).get()
    expect(row).toMatchObject({ suggested: true, active: false, kind: 'maintenance' })
    h.close()
  })

  it('ikinci çalıştırmada hiçbir şey eklemez, otelin değişikliklerini bozmaz', async () => {
    const h = await memoryDatabase()
    seedBaseData(h.db)
    h.db
      .update(salesChannels)
      .set({ active: false, name: 'Ostrovok (kapalı)' })
      .where(eq(salesChannels.code, 'ostrovok'))
      .run()
    h.db.update(rolePermissions).set({ level: 'none' }).where(eq(rolePermissions.permission, 'cash')).run()
    expect(seedBaseData(h.db).inserted).toEqual({})
    const ch = h.db.select().from(salesChannels).where(eq(salesChannels.code, 'ostrovok')).get()
    expect(ch).toMatchObject({ active: false, name: 'Ostrovok (kapalı)' })
    const cash = h.db.select().from(rolePermissions).where(eq(rolePermissions.permission, 'cash')).all()
    expect(cash.every((r) => r.level === 'none')).toBe(true)
    h.close()
  })

  describe('satış kanalları (G-14: yalnızca etiket)', () => {
    const KINDS = ['direct', 'ota', 'agency', 'platform_service'] as const
    const name = (code: string) => CHANNEL_SEED.find((c) => c.code === code)!.name

    it('kodlar tekil ve snake_case; her tür var; adlar tr/en/ru dolu', () => {
      const codes = CHANNEL_SEED.map((c) => c.code)
      expect(new Set(codes).size).toBe(codes.length)
      expect(codes.every((c) => /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(c))).toBe(true)
      expect(CHANNEL_SEED.length).toBeGreaterThanOrEqual(30)
      expect(CHANNEL_SEED.length).toBeLessThanOrEqual(40)
      for (const kind of KINDS) expect(CHANNEL_SEED.some((c) => c.kind === kind)).toBe(true)
      for (const c of CHANNEL_SEED) {
        expect(c.name.tr?.trim(), c.code).toBeTruthy()
        expect(c.name.en?.trim(), c.code).toBeTruthy()
        expect(c.name.ru?.trim(), c.code).toBeTruthy()
      }
    })

    it('sahibin Excel kanalları ve eski kodlar yerinde; e-posta ve bavul emaneti siteleri eklendi', () => {
      const codes = CHANNEL_SEED.map((c) => c.code)
      for (const old of [
        'direct',
        'phone',
        'walk_in',
        'airbnb',
        'booking',
        'expedia',
        'ostrovok',
        'agoda',
        'trip',
        'hostelworld',
        'agency',
        'bounce'
      ])
        expect(codes, old).toContain(old)
      expect(name('email')).toEqual({ tr: 'E-posta', en: 'Email', ru: 'Эл. почта' })
      const luggage = CHANNEL_SEED.filter((c) => c.kind === 'platform_service').map((c) => c.code)
      expect(luggage).toEqual([
        'bounce',
        'radical_storage',
        'nannybag',
        'luggagehero',
        'stasher',
        'qeepl',
        'vertoe'
      ])
      expect(name('yandex_travel').ru).toBe('Яндекс Путешествия')
      expect(name('ostrovok').ru).toBe('Островок')
    })

    it('Otelz.com (Türk sitesi) ile Hotels.com (Expedia Group) her dilde karışmayacak kadar ayrı adlarla gelir', () => {
      const otelz = name('otelz')
      const hotels = name('hotels_com')
      for (const lang of ['tr', 'en', 'ru'] as const) {
        expect(otelz[lang], lang).not.toBe(hotels[lang])
        expect(otelz[lang], lang).toMatch(/^Otelz\.com \(/)
        expect(hotels[lang], lang).toMatch(/^Hotels\.com \(Expedia Group\)$/)
      }
      expect(otelz.tr).toContain('Türkiye')
      expect(otelz.ru).toContain('Турция')
      const kind = (code: string) => CHANNEL_SEED.find((c) => c.code === code)!.kind
      expect([kind('otelz'), kind('hotels_com')]).toEqual(['ota', 'ota'])
      // Not next to each other in the list either.
      const at = (code: string) => CHANNEL_SEED.findIndex((c) => c.code === code)
      expect(Math.abs(at('otelz') - at('hotels_com'))).toBeGreaterThan(3)
    })

    it('türler bir arada ve doğrudan, satış siteleri, acente, bavul emaneti sırasıyla dizilir', () => {
      const kinds = CHANNEL_SEED.map((c) => c.kind)
      const runs = kinds.filter((k, i) => k !== kinds[i - 1])
      expect(runs).toEqual([...KINDS])
    })

    it('bavul emaneti siteleri ve toptancılar parayı genelde kendileri tahsil eder; doğrudan kanallarda otel', () => {
      for (const c of CHANNEL_SEED.filter((x) => x.kind === 'platform_service'))
        expect(c.collectedBy, c.code).toBe('channel')
      for (const code of ['hotelbeds', 'webbeds', 'ratehawk', 'paximum'])
        expect(CHANNEL_SEED.find((c) => c.code === code)?.collectedBy, code).toBe('channel')
      for (const c of CHANNEL_SEED.filter((x) => x.kind === 'direct'))
        expect(c.collectedBy, c.code).toBe('hotel')
    })

    it('ilk açılışta yalnızca Excel kanalları ve e-posta açık, geri kalanı kapalı; ikinci çalıştırma yalnızca eksik kodu ekler', async () => {
      const h = await memoryDatabase()
      const first = seedBaseData(h.db, new Date('2026-10-01T09:00:00Z'))
      expect(first.inserted.sales_channels).toBe(CHANNEL_SEED.length)
      const rows = h.db.select().from(salesChannels).all()
      expect(rows.filter((r) => r.active).map((r) => r.code)).toEqual([
        'direct',
        'phone',
        'walk_in',
        'email',
        'airbnb',
        'booking',
        'expedia',
        'ostrovok',
        'bounce'
      ])
      expect(rows.find((r) => r.code === 'otelz')).toMatchObject({
        active: false,
        kind: 'ota',
        defaultCollectedBy: 'hotel'
      })
      expect(rows.find((r) => r.code === 'hotels_com')).toMatchObject({
        active: false,
        defaultCollectedBy: 'channel'
      })
      // Sort follows the list, so the wizard and Settings show the same order.
      expect([...rows].sort((a, b) => a.sort - b.sort).map((r) => r.code)).toEqual(
        CHANNEL_SEED.map((c) => c.code)
      )
      // An installation that only has the old codes gets just the new ones; the hotel's choices stay.
      h.db.delete(salesChannels).where(eq(salesChannels.code, 'whatsapp')).run()
      h.db.update(salesChannels).set({ active: true }).where(eq(salesChannels.code, 'agoda')).run()
      expect(seedBaseData(h.db).inserted).toEqual({ sales_channels: 1 })
      expect(h.db.select().from(salesChannels).where(eq(salesChannels.code, 'agoda')).get()?.active).toBe(
        true
      )
      h.close()
    })
  })
})
