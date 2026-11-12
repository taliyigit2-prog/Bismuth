// Lost items, status tags and the phone book: the smaller daily-operation services.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { paymentMethods, roomTypes, salesChannels, statusTags } from '../db/schema'
import { createContactsService } from './contacts-service'
import { createLostItemsService } from './lost-items-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createStatusTagsService } from './status-tags-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  return { clock, deps: depsOf(handle, clock) }
}

describe('kayıp eşya (G-55)', () => {
  it('bulunan eşya emanette başlar; iade edilir, yanlışlık geri alınır; silinmez', async () => {
    const { deps } = await setup()
    const lost = createLostItemsService(deps)
    const item = lost.create(reception, {
      description: 'Siyah şarj aleti',
      locationText: 'Lobi koltuğu',
      storageLocation: 'Resepsiyon çekmecesi'
    })
    expect(item).toMatchObject({ status: 'stored', foundAt: '2026-10-01T12:00' })
    lost.create(reception, { description: 'Mavi şemsiye', foundAt: '2026-09-20' })
    expect(lost.list(reception, { search: 'SARJ' }).map((x) => x.id)).toEqual([item.id])
    expect(lost.list(reception, { from: '2026-09-01', to: '2026-09-30' }).map((x) => x.description)).toEqual([
      'Mavi şemsiye'
    ])
    const back = lost.markReturned(reception, item.id, { returnedTo: 'Oda 501 misafiri' })
    expect(back).toMatchObject({
      status: 'returned',
      returnedTo: 'Oda 501 misafiri',
      returnedAt: '2026-10-01T12:00'
    })
    expect(() => lost.markDisposed(reception, item.id, 'bağış')).toThrow(/errors.lostItemNotStored/)
    expect(() => lost.restore(reception, item.id, '')).toThrow(/errors.reasonRequired/)
    expect(lost.restore(reception, item.id, 'yanlış kişiye işaretlendi')).toMatchObject({
      status: 'stored',
      returnedTo: null
    })
    expect(lost.list(owner, { status: ['stored'] })).toHaveLength(2)
    expect(lost.update(reception, item.id, { storageLocation: 'Kasa' }).storageLocation).toBe('Kasa')
  })

  it('temizlik görevlisi kayıp eşyayı görür ama yazamaz; yetkisiz rol göremez', async () => {
    const { deps } = await setup()
    const lost = createLostItemsService(deps)
    expect(lost.list(housekeeping)).toEqual([])
    expect(() => lost.create(roleCtx('employee'), { description: 'x' })).toThrow(/PERMISSION_DENIED/)
    expect(() => lost.list(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
    expect(() => lost.create(reception, { description: 'x', roomId: 'yok' })).toThrow(/NOT_FOUND/)
  })
})

describe('durum etiketleri (§6.14, G-32, G-33)', () => {
  async function tagged() {
    const ctx = await setup()
    const { deps } = ctx
    const tags = createStatusTagsService(deps)
    const roomsSvc = createRoomsService(deps)
    const res = createReservationsService(deps)
    const pay = createPaymentsService(deps)
    const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
    const room = roomsSvc.createRoom(owner, {
      number: '501',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    const r = res.create(owner, {
      guest: { firstName: 'Örnek' },
      channelId,
      stays: [{ roomId: room.id, checkIn: '2026-10-01', checkOut: '2026-10-04', nightlyPriceMinor: 200_000 }]
    })
    const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
    pay.create(owner, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 300_000,
      currency: 'TRY'
    })
    const auto = (code: string) => handle.db.select().from(statusTags).where(eq(statusTags.code, code)).get()!
    return { ...ctx, tags, r, auto }
  }

  it('özel etiket öncelikliyse dolguyu alır, otomatik durum kenara geçer; değilse kenarlık olur', async () => {
    const { tags, r } = await tagged()
    const vip = tags.createCustom(owner, { name: 'VIP', color: '#7c3aed', priorityOverAuto: true })
    const late = tags.createCustom(owner, { name: 'Geç gelecek', color: '#0ea5e9' })
    expect(tags.nightStyles(reception, r.reservation.id).map((n) => n.style.fill)).toEqual([
      { kind: 'auto', code: 'paid' },
      { kind: 'auto', code: 'partial' },
      { kind: 'auto', code: 'unpaid' }
    ])
    tags.setReservationTags(reception, { reservationId: r.reservation.id, tagIds: [late.id] })
    expect(tags.nightStyles(reception, r.reservation.id)[0]?.style).toMatchObject({
      fill: { kind: 'auto', code: 'paid' },
      border: { kind: 'custom', tagId: late.id }
    })
    tags.setReservationTags(reception, { reservationId: r.reservation.id, tagIds: [late.id, vip.id] })
    expect(tags.nightStyles(reception, r.reservation.id)[1]?.style).toMatchObject({
      auto: 'partial',
      fill: { kind: 'custom', tagId: vip.id },
      border: { kind: 'auto', code: 'partial' }
    })
    expect(tags.reservationTags(reception, r.reservation.id).map((t) => t.name)).toEqual([
      'VIP',
      'Geç gelecek'
    ])
  })

  it('"kısmen" kapatılınca kısmen ödenen gece ödenmedi görünür ve kapora simgesi kalır', async () => {
    const { tags, r, auto } = await tagged()
    tags.update(owner, auto('partial').id, { enabled: false })
    expect(tags.nightStyles(reception, r.reservation.id)[1]?.style).toMatchObject({
      auto: 'unpaid',
      fill: { kind: 'auto', code: 'unpaid' },
      depositIcon: true
    })
  })

  it('renk ayarı yetkisi olmayan etiket değiştiremez; otomatik etikete öncelik verilemez; otomatik etiket rezervasyona takılmaz', async () => {
    const { tags, r, auto } = await tagged()
    expect(() => tags.update(reception, auto('paid').id, { color: '#000000' })).toThrow(/PERMISSION_DENIED/)
    expect(() => tags.update(owner, auto('paid').id, { priorityOverAuto: true })).toThrow(/errors.validation/)
    expect(() =>
      tags.setReservationTags(reception, { reservationId: r.reservation.id, tagIds: [auto('paid').id] })
    ).toThrow(/errors.validation/)
    expect(() => tags.list(housekeeping)).toThrow(/PERMISSION_DENIED/)
    const renamed = tags.update(owner, auto('paid').id, { name: 'Tamam', color: '#16a34a' })
    expect(renamed).toMatchObject({ name: 'Tamam', nameI18n: null, displayName: null, color: '#16a34a' })
    expect(tags.list(reception).find((t) => t.code === 'unpaid')?.displayName?.tr).toBe('Ödenmedi')
  })

  it('yeniden adlandırılan otomatik durum ad boş (null) kaydedilince programın çevirili adına döner; özel etiket adsız kalamaz', async () => {
    const { tags, auto } = await tagged()
    tags.update(owner, auto('paid').id, { name: 'Tamam' })
    const back = tags.update(owner, auto('paid').id, { name: null })
    expect(back).toMatchObject({ name: null, displayName: { tr: 'Ödendi', en: 'Paid', ru: 'Оплачено' } })
    const own = tags.createCustom(owner, { name: 'Grup', color: '#0ea5e9' })
    expect(() => tags.update(owner, own.id, { name: null })).toThrow(/errors.validation/)
  })

  it('hiç kullanılmamış özel etiket silinir; rezervasyonda duran etiket silinmez, otomatik durum hiç silinmez', async () => {
    const { tags, r, auto } = await tagged()
    const typo = tags.createCustom(owner, { name: 'Grp', color: '#0ea5e9' })
    const group = tags.createCustom(owner, { name: 'Grup', color: '#7c3aed' })
    tags.setReservationTags(reception, { reservationId: r.reservation.id, tagIds: [group.id] })
    expect(() => tags.removeCustom(reception, typo.id)).toThrow(/PERMISSION_DENIED/)
    expect(tags.removeCustom(owner, typo.id)).toEqual({ ok: true })
    expect(tags.list(owner).some((t) => t.id === typo.id)).toBe(false)
    expect(() => tags.removeCustom(owner, group.id)).toThrow(/errors.tagInUse/)
    expect(() => tags.removeCustom(owner, auto('paid').id)).toThrow(/errors.validation/)
  })
})

describe('rehber (G-160)', () => {
  it('favoriler önce, Türkçe sıra; ad ya da telefonun bir kısmıyla bulunur; kapatılan kişi listeden düşer', async () => {
    const { deps } = await setup()
    const book = createContactsService(deps)
    const taxi = book.create(reception, {
      name: 'Çağlar Taksi',
      category: 'taxi',
      phones: [{ label: 'cep', number: '0532 111 22 33' }]
    })
    const laundry = book.create(reception, {
      name: 'Işık Çamaşırhane',
      category: 'laundry',
      phones: [{ label: 'iş', number: '+90 216 444 55 66' }],
      favorite: true
    })
    book.create(owner, { name: 'Ahmet Usta', category: 'custom', customCategory: 'Boyacı' })
    expect(book.list(reception).map((c) => c.name)).toEqual([
      'Işık Çamaşırhane',
      'Ahmet Usta',
      'Çağlar Taksi'
    ])
    expect(book.list(reception, { q: '0532 111' }).map((c) => c.id)).toEqual([taxi.id])
    expect(book.list(reception, { q: 'camasir' }).map((c) => c.id)).toEqual([laundry.id])
    expect(book.list(reception, { category: 'taxi' }).map((c) => c.id)).toEqual([taxi.id])
    book.deactivate(reception, taxi.id)
    expect(book.list(reception).map((c) => c.id)).not.toContain(taxi.id)
    expect(book.list(reception, { includeInactive: true }).map((c) => c.id)).toContain(taxi.id)
    expect(book.reactivate(owner, taxi.id).active).toBe(true)
    expect(() => book.update(reception, taxi.id, { category: 'custom' })).toThrow(/errors.validation/)
    expect(book.update(reception, taxi.id, { name: 'Çağlar Taksi Durağı' }).nameNormalized).toBe(
      'caglar taksi duragi'
    )
    expect(() => book.create(roleCtx('accountant'), { name: 'x', category: 'other' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(book.list(roleCtx('accountant'))).toHaveLength(3)
    expect(() => book.list(roleCtx('employee'))).toThrow(/PERMISSION_DENIED/)
  })
})
