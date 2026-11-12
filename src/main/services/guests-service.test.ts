import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { roleCtx, depsOf, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  blacklist,
  folios,
  guests,
  paymentMethods,
  payments,
  reservationRooms,
  reservations,
  roomNights,
  rooms,
  roomTypes,
  salesChannels,
  stayOccupants
} from '../db/schema'
import { formatCopyText } from '@shared/domain/company-copy'
import en from '../../renderer/i18n/en.json'
import ru from '../../renderer/i18n/ru.json'
import tr from '../../renderer/i18n/tr.json'
import { ctxFromPermissions, type Ctx } from './context'
import { createBlacklistService, createCompaniesService, createGuestsService } from './guests-service'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
const housekeeping = roleCtx('housekeeping')
/** A custom role: may edit guests but not identity fields, may add to the blacklist. */
const noIdentity = ctxFromPermissions('user-custom', 'test-device', 'ipc', {
  guests: 'edit',
  blacklist: 'edit',
  companies: 'view'
})

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock()
  const deps = depsOf(handle, clock)
  return {
    guestsSvc: createGuestsService(deps),
    companiesSvc: createCompaniesService(deps),
    blacklistSvc: createBlacklistService(deps),
    clock
  }
}

const T = '2026-01-01T00:00:00.000Z'
const ts = { createdAt: T, updatedAt: T }
let seq = 0
const nextId = (prefix: string): string => `${prefix}-${++seq}`

function addRoom(number: string): string {
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const id = nextId('room')
  handle.db
    .insert(rooms)
    .values({ id, number, roomTypeId: standard.id, beds: 2, ...ts })
    .run()
  return id
}

interface StayInput {
  guestId: string
  roomId: string
  checkIn: string
  checkOut: string
  prices: number[]
  status?: (typeof reservations.$inferInsert)['status']
  channel?: string
  credits?: { method: string; kind?: 'payment' | 'deposit' | 'refund'; amount: number; voided?: boolean }[]
}

/** A minimal reservation chain: reservation → room → nights → folio → payments. */
function addStay(s: StayInput): string {
  const channel = handle.db
    .select()
    .from(salesChannels)
    .where(eq(salesChannels.code, s.channel ?? 'direct'))
    .get()!
  const reservationId = nextId('res')
  handle.db
    .insert(reservations)
    .values({
      id: reservationId,
      code: reservationId,
      primaryGuestId: s.guestId,
      channelId: channel.id,
      status: s.status ?? 'checked_out',
      kind: 'overnight',
      ...ts
    })
    .run()
  const rrId = nextId('rr')
  handle.db
    .insert(reservationRooms)
    .values({ id: rrId, reservationId, roomId: s.roomId, checkIn: s.checkIn, checkOut: s.checkOut, ...ts })
    .run()
  s.prices.forEach((price, i) => {
    const date = new Date(Date.parse(`${s.checkIn}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
    handle.db
      .insert(roomNights)
      .values({
        id: nextId('night'),
        reservationRoomId: rrId,
        roomId: s.roomId,
        date,
        slot: 'night',
        priceMinor: price,
        currency: 'TRY',
        ...ts
      })
      .run()
  })
  const folioId = nextId('folio')
  handle.db
    .insert(folios)
    .values({ id: folioId, kind: 'reservation', reservationId, currency: 'TRY', ...ts })
    .run()
  for (const c of s.credits ?? []) {
    const method = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, c.method)).get()!
    handle.db
      .insert(payments)
      .values({
        id: nextId('pay'),
        folioId,
        date: s.checkIn,
        kind: c.kind ?? 'payment',
        methodId: method.id,
        amountMinor: c.amount,
        currency: 'TRY',
        amountFolioMinor: c.amount,
        voidedAt: c.voided ? T : null,
        ...ts
      })
      .run()
  }
  return rrId
}

describe('misafir kaydı, arama ve tekrar kayıt (G-50, G-51)', () => {
  it('ad, telefon ve kimlik normalize yazılır; "GADİR GADİROV" ile "Gadir Gadirov" ve başka biçimdeki aynı telefon tekrar kayıt olarak bulunur', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(reception, {
      firstName: 'GADİR',
      lastName: 'GADİROV',
      phone: '0532 123 45 67',
      idDocType: 'passport',
      idDocNumber: 'u 998-877'
    })
    expect(g).toMatchObject({
      nameNormalized: 'gadir gadirov',
      phoneNormalized: '905321234567',
      idDocNumber: 'U998877',
      vip: false,
      standingNoteLevel: 'info',
      createdBy: 'user-reception'
    })

    const both = guestsSvc.findDuplicates(reception, { name: 'Gadir Gadirov', phone: '+90 532 123 4567' })
    expect(both).toHaveLength(1)
    expect(both[0]).toMatchObject({ guest: { id: g.id }, reasons: ['name', 'phone'] })
    expect(
      guestsSvc.findDuplicates(reception, { name: 'Başka Biri', phone: '5321234567' })[0]?.reasons
    ).toEqual(['phone'])
    expect(guestsSvc.findDuplicates(reception, { name: 'x', idDocNumber: 'U-998877' })[0]?.reasons).toEqual([
      'id'
    ])
    expect(guestsSvc.findDuplicates(reception, { name: 'gadir gadirov', excludeId: g.id })).toEqual([])
    expect(guestsSvc.findDuplicates(reception, { name: '' })).toEqual([])
  })

  it('arama Türkçe harf ve büyük/küçük harf farkını yok sayar; telefonla ve (yetkiliyse) kimlik no ile bulur', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(owner, {
      firstName: 'Çağla',
      lastName: 'Şimşek',
      phone: '0532 123 45 67',
      idDocType: 'tc',
      idDocNumber: 'U998877'
    })
    guestsSvc.create(owner, { firstName: 'Ali', lastName: 'Veli' })
    for (const q of ['cagla', 'ÇAĞLA ŞİMŞEK', 'simsek cag', '0532 123', '532-12'])
      expect(guestsSvc.search(reception, q).map((x) => x.id)).toEqual([g.id])
    expect(guestsSvc.search(reception, 'U998877').map((x) => x.id)).toEqual([g.id])
    // The accountant has no identity view: the document number is not a search key for them.
    expect(guestsSvc.search(accountant, 'U998877')).toEqual([])
    expect(guestsSvc.search(reception, 'zzz')).toEqual([])
    expect(() => guestsSvc.search(housekeeping, 'cagla')).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.search(reception, '  ')).toThrow(/VALIDATION/)
  })

  it('telefon sonu "0001" ya da "00 01" yazılınca bulunur; 500 harflik arama kesilir, hata vermez', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(owner, { firstName: 'Ece', lastName: 'Aksu', phone: '0532 000 00 01' })
    for (const q of ['0001', '00 01', '000 00 01'])
      expect(guestsSvc.search(reception, q).map((x) => x.id)).toEqual([g.id])
    expect(() => guestsSvc.search(reception, 'a'.repeat(500))).not.toThrow()
  })

  it('kimlik alanları "guests.identity" yetkisi olmayan role (muhasebeci) maskeli döner', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(owner, {
      firstName: 'Ivan',
      lastName: 'Petrov',
      idDocType: 'passport',
      idDocNumber: 'U998877'
    })
    expect(guestsSvc.get(owner, g.id)).toMatchObject({ idDocNumber: 'U998877', identityMasked: false })
    expect(guestsSvc.get(accountant, g.id)).toMatchObject({ idDocNumber: 'U9••877', identityMasked: true })
    expect(guestsSvc.search(accountant, 'petrov')[0]?.idDocNumber).toBe('U9••877')
    expect(guestsSvc.findDuplicates(accountant, { name: 'Ivan Petrov' })[0]?.guest.idDocNumber).toBe(
      'U9••877'
    )
    expect(guestsSvc.get(owner, guestsSvc.create(owner, { firstName: 'Yok' }).id).identityMasked).toBe(false)
  })

  it('kimlik alanı yalnız "guests.identity" düzenleme yetkisiyle yazılır; belge numarası türsüz yazılamaz', async () => {
    const { guestsSvc } = await setup()
    expect(() =>
      guestsSvc.create(noIdentity, {
        firstName: 'A',
        lastName: 'B',
        idDocType: 'tc',
        idDocNumber: '12345678901'
      })
    ).toThrow(/PERMISSION_DENIED/)
    const g = guestsSvc.create(noIdentity, { firstName: 'A', lastName: 'B', phone: '0555 000 00 00' })
    expect(() => guestsSvc.update(noIdentity, g.id, { idDocNumber: '1' })).toThrow(/PERMISSION_DENIED/)
    expect(guestsSvc.update(noIdentity, g.id, { lastName: 'Bey', phone: '' })).toMatchObject({
      nameNormalized: 'a bey',
      phone: null,
      phoneNormalized: null
    })
    expect(() => guestsSvc.update(owner, g.id, { idDocNumber: '1234' })).toThrow(/VALIDATION/)
    expect(() => guestsSvc.create(owner, { firstName: 'C', idDocNumber: '1234' })).toThrow(/VALIDATION/)
    expect(guestsSvc.update(owner, g.id, { idDocType: 'tc', idDocNumber: '123 456' }).idDocNumber).toBe(
      '123456'
    )
    expect(() => guestsSvc.create(owner, { firstName: 'C', companyId: 'missing' })).toThrow(/NOT_FOUND/)
    const audits = handle.db.select().from(auditLog).all()
    expect(audits.map((a) => `${a.entity}:${a.action}`)).toEqual([
      'guest:create',
      'guest:update',
      'guest:update'
    ])
  })

  it('misafir yazan her metot yetkisiz rolde PERMISSION_DENIED verir', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(owner, { firstName: 'X', lastName: 'Y' })
    const other = guestsSvc.create(owner, { firstName: 'X', lastName: 'Z' })
    expect(() => guestsSvc.create(accountant, { firstName: 'Q' })).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.update(accountant, g.id, { firstName: 'Q' })).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.setStandingNote(accountant, g.id, { standingNote: 'x' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => guestsSvc.setVip(housekeeping, g.id, true)).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.merge(reception, g.id, other.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.get(housekeeping, g.id)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('sürekli istek ve VIP (G-192, S-18)', () => {
  it('"önemli" seviyesindeki sürekli istek onay ister; VIP elle işaretlenir', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(reception, { firstName: 'Emma', lastName: 'Stone' })
    expect(guestsSvc.standingNoteAlert(reception, g.id)).toBeNull()
    guestsSvc.setStandingNote(reception, g.id, {
      standingNote: ' Yüksek kat ister ',
      standingNoteLevel: 'warn'
    })
    expect(guestsSvc.standingNoteAlert(reception, g.id)).toEqual({
      text: 'Yüksek kat ister',
      level: 'warn',
      requiresConfirm: true
    })
    expect(guestsSvc.setVip(reception, g.id, true).vip).toBe(true)
    expect(guestsSvc.setStandingNote(reception, g.id, { standingNote: '' }).standingNote).toBeNull()
    expect(guestsSvc.standingNoteAlert(reception, g.id)).toBeNull()
  })
})

describe('misafir birleştirme (G-51)', () => {
  it('birleştirme rezervasyon, odadaki kişi ve kara liste bağlantılarını taşır; birleştirilen satır silinmez, merged_into_id alır', async () => {
    const { guestsSvc, blacklistSvc } = await setup()
    const keep = guestsSvc.create(reception, {
      firstName: 'Gadir',
      lastName: 'Gadirov',
      phone: '0532 123 45 67'
    })
    const dup = guestsSvc.create(reception, {
      firstName: 'GADİR',
      lastName: 'GADİROV',
      email: 'gadir@example.com',
      standingNote: 'Ekstra yastık',
      notes: 'Excel aktarımı'
    })
    const roomId = addRoom('101')
    const rrId = addStay({
      guestId: dup.id,
      roomId,
      checkIn: '2026-05-01',
      checkOut: '2026-05-03',
      prices: [100_000, 100_000]
    })
    handle.db
      .insert(stayOccupants)
      .values({ id: 'occ-1', reservationRoomId: rrId, guestId: dup.id, fullName: 'GADİR GADİROV', ...ts })
      .run()
    blacklistSvc.add(reception, {
      guestId: dup.id,
      severity: 'warn',
      reasonCode: 'late',
      reasonText: 'Geç ödedi'
    })
    const third = guestsSvc.create(reception, { firstName: 'Gadir', lastName: 'G.' })
    handle.db.update(guests).set({ mergedIntoId: dup.id }).where(eq(guests.id, third.id)).run()

    const result = guestsSvc.merge(manager, keep.id, dup.id)
    expect(result.moved).toEqual({ reservations: 1, occupants: 1, blacklist: 1, mergedGuests: 1, tags: 0 })
    expect(result.guest).toMatchObject({
      id: keep.id,
      phone: '0532 123 45 67',
      email: 'gadir@example.com',
      standingNote: 'Ekstra yastık',
      notes: 'Excel aktarımı'
    })
    expect(handle.db.select().from(reservations).get()?.primaryGuestId).toBe(keep.id)
    expect(handle.db.select().from(stayOccupants).get()?.guestId).toBe(keep.id)
    expect(handle.db.select().from(blacklist).get()?.guestId).toBe(keep.id)
    const mergedRow = handle.db.select().from(guests).where(eq(guests.id, dup.id)).get()
    expect(mergedRow?.mergedIntoId).toBe(keep.id)
    expect(handle.db.select().from(guests).where(eq(guests.id, third.id)).get()?.mergedIntoId).toBe(keep.id)
    expect(handle.db.select().from(guests).all()).toHaveLength(3)

    expect(guestsSvc.search(reception, 'gadir').map((g) => g.id)).toEqual([keep.id])
    expect(guestsSvc.findDuplicates(reception, { name: 'Gadir Gadirov' }).map((d) => d.guest.id)).toEqual([
      keep.id
    ])
    // The merged card's history is the kept card's.
    expect(guestsSvc.guestHistory(reception, dup.id)).toMatchObject({ guestId: keep.id, totalNights: 2 })

    expect(() => guestsSvc.update(reception, dup.id, { notes: 'x' })).toThrow(/guestMerged/)
    expect(() => guestsSvc.merge(manager, keep.id, dup.id)).toThrow(/guestMerged/)
    expect(() => guestsSvc.merge(manager, keep.id, keep.id)).toThrow(/mergeSameGuest/)
    const merges = handle.db.select().from(auditLog).where(eq(auditLog.action, 'merge')).all()
    expect(merges.map((a) => a.entityId).sort()).toEqual([keep.id, dup.id].sort())
  })
})

describe('misafir fiyat ve ödeme geçmişi (G-190, §6.12)', () => {
  it('iki konaklamada son gecelik fiyat ve ortalama doğru; iade düşülür, iptal edilen ödeme ve rezervasyon sayılmaz', async () => {
    const { guestsSvc } = await setup()
    const g = guestsSvc.create(reception, { firstName: 'Ivan', lastName: 'Petrov' })
    const r101 = addRoom('101')
    const r102 = addRoom('102')
    addStay({
      guestId: g.id,
      roomId: r101,
      checkIn: '2026-03-10',
      checkOut: '2026-03-12',
      prices: [200_000, 200_000],
      channel: 'booking',
      credits: [{ method: 'cash', amount: 400_000 }]
    })
    addStay({
      guestId: g.id,
      roomId: r102,
      checkIn: '2026-08-01',
      checkOut: '2026-08-04',
      prices: [250_000, 250_000, 300_000],
      credits: [
        { method: 'card', amount: 600_000 },
        { method: 'cash', amount: 250_000 },
        { method: 'cash', kind: 'refund', amount: 50_000 },
        { method: 'bank', amount: 100_000, voided: true }
      ]
    })
    addStay({
      guestId: g.id,
      roomId: r101,
      checkIn: '2026-09-01',
      checkOut: '2026-09-02',
      prices: [],
      status: 'cancelled'
    })

    const h = guestsSvc.guestHistory(reception, g.id)
    expect(h.lastStayDate).toBe('2026-08-01')
    expect(h.lastNightly).toEqual({ amountMinor: 300_000, currency: 'TRY' })
    // (2 × 2.000 + 2 × 2.500 + 3.000) / 5 = 2.400
    expect(h.averageNightly).toEqual({ TRY: 240_000 })
    expect(h.totalNights).toBe(5)
    expect(h.totalSpent).toEqual({ TRY: 1_200_000 })
    // The guest list reads a lighter aggregate (Faz 16 büyük veri) but counts by the same rule as the card.
    expect(guestsSvc.list(reception, { q: 'Petrov' }).rows[0]).toMatchObject({
      id: g.id,
      stays: 2,
      lastStayDate: '2026-08-01',
      totalSpent: { TRY: 1_200_000 }
    })
    expect(guestsSvc.list(reception).rows.find((r) => r.id === g.id)).toMatchObject({
      stays: 2,
      lastStayDate: '2026-08-01',
      totalSpent: { TRY: 1_200_000 }
    })
    expect(h.stays.map((s) => [s.checkIn, s.roomNumber, s.status])).toEqual([
      ['2026-09-01', '101', 'cancelled'],
      ['2026-08-01', '102', 'checked_out'],
      ['2026-03-10', '101', 'checked_out']
    ])
    expect(h.stays[1]).toMatchObject({
      paidMinor: 800_000,
      methods: ['card', 'cash'],
      channel: 'direct',
      checkOut: '2026-08-04'
    })
    expect(h.stays[2]).toMatchObject({ paidMinor: 400_000, methods: ['cash'], channel: 'booking' })
    expect(h.standingNote).toBeNull()

    const empty = guestsSvc.create(reception, { firstName: 'Yeni' })
    expect(guestsSvc.guestHistory(reception, empty.id)).toMatchObject({
      stays: [],
      lastNightly: null,
      totalNights: 0
    })
    expect(() => guestsSvc.guestHistory(housekeeping, g.id)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('firma / fatura bilgileri (G-191)', () => {
  const company = {
    title: 'Örnek Turizm Ltd. Şti.',
    address: 'Atatürk Cd. No: 1',
    city: 'İstanbul',
    taxOffice: 'Kadıköy',
    taxNumber: '1234567890',
    phone: '0216 000 00 00',
    email: 'muhasebe@ornek.example',
    iban: 'tr83 0006 2000 0000 0012 3456 78',
    contactPerson: 'Ayşe Yılmaz'
  }

  it('kopya metni dil dosyasındaki etiketlerle üç dilde çok satırlı üretilir; boş alan atlanır, IBAN dörtlü gruplanır', async () => {
    const { companiesSvc } = await setup()
    const labels = { tr: tr.companies.copy, en: en.companies.copy, ru: ru.companies.copy }
    const copyText = (ctx: Ctx, id: string, locale: keyof typeof labels, format?: 'multi' | 'single') =>
      formatCopyText(companiesSvc.copyFields(ctx, id), labels[locale], format)
    const c = companiesSvc.create(reception, company)
    expect(c.iban).toBe('TR830006200000000012345678')
    expect(copyText(accountant, c.id, 'tr')).toBe(
      [
        'Unvan: Örnek Turizm Ltd. Şti.',
        'Adres: Atatürk Cd. No: 1, İstanbul',
        'Vergi dairesi / No: Kadıköy / 1234567890',
        'Telefon: 0216 000 00 00',
        'E-posta: muhasebe@ornek.example',
        'IBAN: TR83 0006 2000 0000 0012 3456 78',
        'Yetkili: Ayşe Yılmaz'
      ].join('\n')
    )
    expect(copyText(reception, c.id, 'en').split('\n')[0]).toBe('Company: Örnek Turizm Ltd. Şti.')
    expect(copyText(reception, c.id, 'ru')).toContain('Налоговая инспекция / ИНН: Kadıköy / 1234567890')
    const bare = companiesSvc.create(reception, { title: 'Yalın A.Ş.', taxNumber: '4242424242' })
    expect(copyText(reception, bare.id, 'tr')).toBe('Unvan: Yalın A.Ş.\nVergi dairesi / No: 4242424242')
    expect(copyText(reception, bare.id, 'en', 'single')).toBe(
      'Company: Yalın A.Ş. · Tax office / No: 4242424242'
    )
    expect(() => companiesSvc.create(reception, { title: 'X', iban: 'TR12' })).toThrow(/VALIDATION/)
    // QA3c1 #15: check digits of the IBAN and the length of the tax number count.
    expect(() =>
      companiesSvc.create(reception, { title: 'X', iban: 'TR12 0006 2000 0000 0012 3456 78' })
    ).toThrow(/VALIDATION/)
    for (const taxNumber of ['12', '123456789', '12345678901'])
      expect(() => companiesSvc.create(reception, { title: 'X', taxNumber })).toThrow(/VALIDATION/)
    expect(
      companiesSvc.create(reception, { title: 'Boşluklu Ltd.', taxNumber: '123 456 78 90' }).taxNumber
    ).toBe('1234567890')
    expect(() => companiesSvc.copyFields(reception, 'yok')).toThrow(/NOT_FOUND/)
    expect(() => companiesSvc.copyFields(housekeeping, bare.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('favori firmalar üstte, sonra son kullanılan; muhasebeci görür ama yazamaz', async () => {
    const { companiesSvc, clock } = await setup()
    const zeta = companiesSvc.create(reception, { title: 'Zeta Ltd.' })
    const alfa = companiesSvc.create(reception, { title: 'Alfa Ltd.' })
    const beta = companiesSvc.create(reception, { title: 'Beta Ltd.' })
    companiesSvc.setFavorite(reception, zeta.id, true)
    clock.advance(5)
    expect(companiesSvc.markUsed(reception, beta.id).lastUsedAt).toBe('2026-10-01T09:05:00.000Z')
    expect(companiesSvc.list(accountant).map((c) => c.title)).toEqual(['Zeta Ltd.', 'Beta Ltd.', 'Alfa Ltd.'])
    expect(companiesSvc.list(accountant, { q: 'ALFA' }).map((c) => c.id)).toEqual([alfa.id])
    expect(companiesSvc.update(reception, alfa.id, { title: 'Alfa Turizm', email: '' })).toMatchObject({
      nameNormalized: 'alfa turizm',
      email: null
    })
    expect(companiesSvc.get(accountant, alfa.id).title).toBe('Alfa Turizm')
    expect(() => companiesSvc.create(accountant, { title: 'Q' })).toThrow(/PERMISSION_DENIED/)
    expect(() => companiesSvc.update(accountant, alfa.id, { title: 'Q' })).toThrow(/PERMISSION_DENIED/)
    expect(() => companiesSvc.setFavorite(accountant, alfa.id, true)).toThrow(/PERMISSION_DENIED/)
    expect(() => companiesSvc.markUsed(accountant, alfa.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => companiesSvc.list(housekeeping)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('kara liste (G-52, §6.9)', () => {
  it('kara listedeki telefonla yeni misafir uyarı verir; resepsiyon ekler ama kaldıramaz; kaldırma silmez, durum değiştirir', async () => {
    const { blacklistSvc } = await setup()
    const e = blacklistSvc.add(reception, {
      name: 'Kötü Misafir',
      phone: '0555 111 22 33',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Odaya zarar verdi',
      incidentDate: '2026-09-20'
    })
    expect(e).toMatchObject({
      nameNormalized: 'kotu misafir',
      phoneNormalized: '905551112233',
      approvedBy: null
    })
    expect(blacklistSvc.check(reception, { name: 'Başka Ad', phone: '+90 555 111 2233' })).toMatchObject([
      { entry: { id: e.id, severity: 'block' }, reasons: ['phone'] }
    ])
    expect(blacklistSvc.check(reception, { name: 'KÖTÜ MİSAFİR' })[0]?.reasons).toEqual(['name'])
    expect(blacklistSvc.check(reception, { name: 'İyi Misafir', phone: '0555 999 99 99' })).toEqual([])

    expect(() => blacklistSvc.remove(reception, e.id, 'hata')).toThrow(/PERMISSION_DENIED/)
    expect(() =>
      blacklistSvc.add(accountant, { name: 'X', severity: 'warn', reasonCode: 'x', reasonText: 'x' })
    ).toThrow(/PERMISSION_DENIED/)
    expect(() => blacklistSvc.check(housekeeping, { name: 'Kötü Misafir' })).toThrow(/PERMISSION_DENIED/)
    expect(() => blacklistSvc.remove(manager, e.id, ' ')).toThrow(/VALIDATION/)
    const removed = blacklistSvc.remove(manager, e.id, 'yanlış kayıt')
    expect(removed).toMatchObject({
      status: 'removed',
      removedBy: 'user-manager',
      removedReason: 'yanlış kayıt'
    })
    expect(handle.db.select().from(blacklist).all()).toHaveLength(1)
    expect(blacklistSvc.check(reception, { name: 'Kötü Misafir' })).toEqual([])
    expect(() => blacklistSvc.remove(manager, e.id, 'tekrar')).toThrow(/blacklistAlreadyRemoved/)
    expect(blacklistSvc.list(reception)).toEqual([])
    expect(blacklistSvc.list(reception, { status: 'all' })).toHaveLength(1)
  })

  it('misafir kartından eklenen kayıt kimlik ve telefonu kopyalar; kimlik numarası kimlik yetkisi olmayana maskelenir', async () => {
    const { guestsSvc, blacklistSvc } = await setup()
    const g = guestsSvc.create(owner, {
      firstName: 'Ivan',
      lastName: 'Petrov',
      phone: '0532 000 11 22',
      idDocType: 'passport',
      idDocNumber: 'U998877'
    })
    const e = blacklistSvc.add(manager, {
      guestId: g.id,
      severity: 'warn',
      reasonCode: 'unpaid',
      reasonText: 'Ödemedi'
    })
    expect(e).toMatchObject({
      guestId: g.id,
      name: 'Ivan Petrov',
      idDocNumber: 'U998877',
      phoneNormalized: '905320001122',
      approvedBy: 'user-manager'
    })
    expect(blacklistSvc.check(reception, { name: 'Başka', idDocNumber: 'u-998877' })[0]?.reasons).toEqual([
      'id'
    ])
    const masked = blacklistSvc.list(noIdentity)[0]
    expect(masked).toMatchObject({ idDocNumber: 'U9••877', identityMasked: true })
    // Typing a document number by hand needs identity edit.
    expect(() =>
      blacklistSvc.add(noIdentity, {
        name: 'Y',
        idDocNumber: 'X1',
        severity: 'warn',
        reasonCode: 'x',
        reasonText: 'x'
      })
    ).toThrow(/PERMISSION_DENIED/)
    expect(() => blacklistSvc.add(reception, { severity: 'warn', reasonCode: 'x', reasonText: 'x' })).toThrow(
      /VALIDATION/
    )
    expect(() =>
      blacklistSvc.add(reception, { name: '...', severity: 'warn', reasonCode: 'x', reasonText: 'x' })
    ).toThrow(/VALIDATION/)
  })
})

describe('Faz 6: yazım farkı, liste, birleştirme, kart, firma geçmişi', () => {
  it('"gadir garibov" ile "GADİR GADİROV" aynı misafiri bulur; birleştirme sonrası geçmiş tek kartta', async () => {
    const { guestsSvc } = await setup()
    const a = guestsSvc.create(reception, {
      firstName: 'GADİR',
      lastName: 'GADİROV',
      phone: '0532 111 22 33'
    })
    const b = guestsSvc.create(reception, { firstName: 'Gadir', lastName: 'Garibov' })
    guestsSvc.create(reception, { firstName: 'Ivan', lastName: 'Petrov' })
    const room = addRoom('201')
    addStay({
      guestId: a.id,
      roomId: room,
      checkIn: '2026-05-01',
      checkOut: '2026-05-03',
      prices: [200_000, 200_000]
    })
    addStay({ guestId: b.id, roomId: room, checkIn: '2026-07-10', checkOut: '2026-07-11', prices: [250_000] })

    // Search (autocomplete and list) finds both ways; the exact spelling ranks first.
    expect(guestsSvc.search(reception, 'gadir garibov').map((g) => g.id)).toEqual([b.id, a.id])
    expect(guestsSvc.search(reception, 'GADİR GADİROV').map((g) => g.id)).toEqual([a.id, b.id])
    expect(guestsSvc.list(reception, { q: 'gadir garibov' }).rows.map((r) => r.id)).toEqual([b.id, a.id])
    // A new card typed with the slip is flagged as a possible duplicate.
    expect(guestsSvc.findDuplicates(reception, { name: 'Gadir Garibov', excludeId: b.id })).toMatchObject([
      { guest: { id: a.id }, reasons: ['name'] }
    ])
    expect(guestsSvc.card(reception, b.id).duplicates.map((d) => d.guest.id)).toEqual([a.id])

    guestsSvc.merge(manager, a.id, b.id)
    const h = guestsSvc.guestHistory(reception, b.id)
    expect(h.guestId).toBe(a.id)
    expect(h.stays.map((s) => s.checkIn)).toEqual(['2026-07-10', '2026-05-01'])
    expect(h.lastNightly).toEqual({ amountMinor: 250_000, currency: 'TRY' })
    expect(guestsSvc.card(reception, b.id)).toMatchObject({ guest: { id: a.id }, mergedFrom: b.id })
    const list = guestsSvc.list(reception, { q: 'gadir' })
    expect(list.rows.map((r) => [r.id, r.stays])).toEqual([[a.id, 2]])
  })

  it('liste: filtreler sayılarıyla, sıralama, sayfa; kara listedeki ve çift kayıt işaretli; ödeme yetkisi yoksa tutar gizli', async () => {
    const { guestsSvc, companiesSvc, blacklistSvc } = await setup()
    const firm = companiesSvc.create(reception, { title: 'Deniz Lojistik A.Ş.' })
    const vip = guestsSvc.create(reception, {
      firstName: 'Ayşe',
      lastName: 'Kaya',
      vip: true,
      companyId: firm.id
    })
    const noted = guestsSvc.create(reception, {
      firstName: 'Mehmet',
      lastName: 'Demir',
      standingNote: 'Yüksek kat ister',
      standingNoteLevel: 'warn'
    })
    const bad = guestsSvc.create(reception, { firstName: 'Kötü', lastName: 'Niyet', phone: '0533 000 00 01' })
    const dup1 = guestsSvc.create(reception, { firstName: 'Ali', lastName: 'Can', phone: '0555 000 00 01' })
    const dup2 = guestsSvc.create(reception, { firstName: 'Ali', lastName: 'Can' })
    blacklistSvc.add(reception, {
      name: 'Başka Ad',
      phone: '+90 533 000 00 01',
      severity: 'warn',
      reasonCode: 'other',
      reasonText: 'x'
    })
    const room = addRoom('301')
    addStay({
      guestId: vip.id,
      roomId: room,
      checkIn: '2026-03-01',
      checkOut: '2026-03-02',
      prices: [100_000],
      credits: [{ method: 'cash', amount: 100_000 }]
    })
    addStay({
      guestId: vip.id,
      roomId: room,
      checkIn: '2026-06-01',
      checkOut: '2026-06-02',
      prices: [150_000],
      credits: [{ method: 'cash', amount: 150_000 }]
    })
    addStay({
      guestId: noted.id,
      roomId: room,
      checkIn: '2026-12-01',
      checkOut: '2026-12-02',
      prices: [90_000],
      status: 'confirmed'
    })

    const all = guestsSvc.list(reception)
    expect(all.total).toBe(5)
    expect(all.counts).toEqual({
      all: 5,
      returning: 1,
      vip: 1,
      note: 1,
      company: 1,
      blacklist: 1,
      duplicate: 2
    })
    // Latest stay first; then guests not stayed yet, the soonest arrival first; then by name.
    expect(all.rows.map((r) => r.id).slice(0, 2)).toEqual([vip.id, noted.id])
    expect(all.rows.find((r) => r.id === vip.id)).toMatchObject({
      stays: 2,
      lastStayDate: '2026-06-01',
      totalSpent: { TRY: 250_000 },
      companyTitle: 'Deniz Lojistik A.Ş.'
    })
    expect(all.rows.find((r) => r.id === noted.id)).toMatchObject({
      lastStayDate: null,
      nextStayDate: '2026-12-01'
    })
    expect(all.rows.find((r) => r.id === bad.id)?.blacklisted).toBe(true)
    expect(all.rows.find((r) => r.id === dup1.id)?.duplicateOf).toMatchObject({
      id: dup2.id,
      reasons: ['name']
    })
    expect(guestsSvc.list(reception, { filter: 'blacklist' }).rows.map((r) => r.id)).toEqual([bad.id])
    expect(guestsSvc.list(reception, { q: 'lojistik' }).rows.map((r) => r.id)).toEqual([vip.id])
    expect(guestsSvc.list(reception, { q: '0533 000' }).rows.map((r) => r.id)).toEqual([bad.id])
    expect(
      guestsSvc.list(reception, { sort: 'name', limit: 2, offset: 1 }).rows.map((r) => r.firstName)
    ).toEqual(['Ali', 'Ayşe'])
    const noMoney = ctxFromPermissions('u-nm', 'd', 'ipc', { guests: 'view' })
    expect(guestsSvc.list(noMoney).moneyHidden).toBe(true)
    expect(guestsSvc.list(noMoney).rows.find((r) => r.id === vip.id)?.totalSpent).toEqual({})
    const hidden = guestsSvc.guestHistory(noMoney, vip.id)
    expect(hidden).toMatchObject({ moneyHidden: true, totalSpent: {}, lastNightly: { amountMinor: 150_000 } })
    expect(hidden.stays.every((s) => s.paidMinor === 0 && s.methods.length === 0)).toBe(true)
    expect(() => guestsSvc.list(housekeeping)).toThrow(/PERMISSION_DENIED/)
    expect(() => guestsSvc.card(housekeeping, vip.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('misafir kartı firmayı (yetkiliyse), kara liste eşleşmesini ve kalan bakiyeyi verir', async () => {
    const { guestsSvc, companiesSvc, blacklistSvc } = await setup()
    const firm = companiesSvc.create(reception, { title: 'Örnek Ltd.' })
    const g = guestsSvc.create(reception, { firstName: 'Kötü', lastName: 'Niyet', companyId: firm.id })
    blacklistSvc.add(reception, {
      name: 'kotu niyet',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Odaya zarar verdi'
    })
    const room = addRoom('401')
    addStay({
      guestId: g.id,
      roomId: room,
      checkIn: '2026-04-01',
      checkOut: '2026-04-03',
      prices: [100_000, 100_000],
      credits: [{ method: 'cash', amount: 50_000 }]
    })
    const card = guestsSvc.card(reception, g.id)
    expect(card.company?.title).toBe('Örnek Ltd.')
    expect(card.blacklist).toMatchObject([
      { name: 'kotu niyet', severity: 'block', reasons: ['name'], reasonText: 'Odaya zarar verdi' }
    ])
    const noCompanies = ctxFromPermissions('u-nc', 'd', 'ipc', { guests: 'view' })
    expect(guestsSvc.card(noCompanies, g.id)).toMatchObject({
      company: null,
      blacklist: [{ reasonText: null }]
    })
    // No charge rows in this hand-made stay: the balance is what the folio holds (credit only → negative).
    expect(guestsSvc.guestHistory(reception, g.id).stays[0]).toMatchObject({
      paidMinor: 50_000,
      balanceMinor: -50_000
    })
  })

  it('firma: bağlı misafirler ve konaklamaları (kurumsal geçmiş); arama unvan ya da vergi no', async () => {
    const { guestsSvc, companiesSvc } = await setup()
    const firm = companiesSvc.create(reception, { title: 'Deniz Lojistik A.Ş.', taxNumber: '9876543210' })
    companiesSvc.create(reception, { title: 'Başka Firma' })
    const a = guestsSvc.create(reception, { firstName: 'Ayşe', lastName: 'Kaya', companyId: firm.id })
    const b = guestsSvc.create(reception, { firstName: 'Can', lastName: 'Öz', companyId: firm.id })
    const room = addRoom('501')
    addStay({
      guestId: a.id,
      roomId: room,
      checkIn: '2026-02-01',
      checkOut: '2026-02-03',
      prices: [120_000, 120_000],
      credits: [{ method: 'bank', amount: 240_000 }]
    })
    addStay({
      guestId: b.id,
      roomId: room,
      checkIn: '2026-03-05',
      checkOut: '2026-03-06',
      prices: [130_000],
      credits: [{ method: 'cash', amount: 130_000 }]
    })
    expect(companiesSvc.list(reception, { q: '98765' }).map((c) => c.id)).toEqual([firm.id])
    expect(companiesSvc.listView(reception).find((c) => c.id === firm.id)?.guestCount).toBe(2)
    const d = companiesSvc.detail(accountant, firm.id)
    expect(d.guests.map((g) => g.firstName)).toEqual(['Ayşe', 'Can'])
    expect(d.stays.map((s) => [s.guestName, s.checkIn, s.paidMinor])).toEqual([
      ['Can Öz', '2026-03-05', 130_000],
      ['Ayşe Kaya', '2026-02-01', 240_000]
    ])
    expect(d).toMatchObject({ stayCount: 2, totalNights: 3, totalSpent: { TRY: 370_000 } })
    expect(() => companiesSvc.detail(housekeeping, firm.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('kara liste listesi "engelle"yi önce verir, ekleyeni kaydeder; telefonla uyarı misafir yazana da çıkar', async () => {
    const { blacklistSvc } = await setup()
    blacklistSvc.add(reception, {
      name: 'Uyarı Kişi',
      severity: 'warn',
      reasonCode: 'other',
      reasonText: 'x'
    })
    const block = blacklistSvc.add(reception, {
      name: 'Engel Kişi',
      phone: '0532 999 88 77',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Hasar'
    })
    const rows = blacklistSvc.listView(reception, { status: 'all' })
    expect(rows.map((r) => r.name)).toEqual(['Engel Kişi', 'Uyarı Kişi'])
    expect(rows[0]).toMatchObject({ addedBy: 'user-reception', approvedByName: null })
    // A guest writer without blacklist rights is still warned, without the reason.
    const writer = ctxFromPermissions('u-w', 'd', 'ipc', { guests: 'edit' })
    expect(blacklistSvc.warn(writer, { name: 'Yeni Misafir', phone: '+90 532 999 88 77' })).toMatchObject([
      { entryId: block.id, reasons: ['phone'], reasonText: null }
    ])
    expect(() => blacklistSvc.warn(housekeeping, { name: 'x' })).toThrow(/PERMISSION_DENIED/)
  })
})
