// Faz 6 rights through the router (G-23): guests, companies and the blacklist — every system role × every
// procedure, 403 exactly when the role's default is too low (Resepsiyon adds to the blacklist but cannot remove;
// sees and edits billing details; Muhasebe reads). Also: the guest card's history and the reservation panel's
// summary give the same numbers (§6.12), a blacklisted phone warns a new card, and an "engelle" entry needs
// Sahip/Müdür to save a reservation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { paymentMethods, roomTypes, salesChannels } from '../../src/main/db/schema'
import { roleCtx } from '../factories/ctx'
import { faz12Api, type Probe } from './faz12-api'

let env: Awaited<ReturnType<typeof faz12Api>>
const owner = roleCtx('owner')
const ids = {
  guest: '',
  company: '',
  entry: '',
  room1: '',
  room2: '',
  channel: '',
  cash: '',
  card: '',
  tag: ''
}

beforeAll(async () => {
  env = await faz12Api()
  const { services, handle } = env
  const type = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  ids.room1 = services.rooms.createRoom(owner, {
    number: '101',
    roomTypeId: type.id,
    beds: 2,
    validFrom: '2026-01-01'
  }).id
  ids.room2 = services.rooms.createRoom(owner, {
    number: '102',
    roomTypeId: type.id,
    beds: 2,
    validFrom: '2026-01-01'
  }).id
  ids.channel = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  ids.cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  ids.card = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'card')).get()!.id
  ids.company = services.companies.create(owner, { title: 'Örnek Turizm Ltd. Şti.' }).id
  ids.guest = services.guests.create(owner, {
    firstName: 'Ayşe',
    lastName: 'Kaya',
    companyId: ids.company
  }).id
  ids.tag = services.lists.create(owner, { kind: 'guestTags', name: 'Düzenli' }).id
  ids.entry = services.blacklist.add(owner, {
    name: 'Kötü Niyet',
    severity: 'warn',
    reasonCode: 'other',
    reasonText: 'Ödemeden ayrıldı'
  }).id
})
afterAll(() => env.close())

const view = (permission: 'guests' | 'companies' | 'blacklist') => [{ permission, level: 'view' as const }]
const edit = (permission: 'guests' | 'companies' | 'blacklist' | 'guests.merge' | 'blacklist.remove') => [
  { permission, level: 'edit' as const }
]

async function call<T = Record<string, unknown>>(name: string, body: unknown, ctx = owner) {
  const res = await env.call(name, body, ctx)
  return { status: res.status, body: JSON.parse(res.body) as T & { error?: Record<string, unknown> } }
}

describe('misafir, firma ve kara liste yetkileri', () => {
  it('her rol × her yordam: yalnız yetkisi yetmeyen rol 403 alır', async () => {
    let n = 0
    const freshGuest = () => env.services.guests.create(owner, { firstName: `Geçici ${++n}` }).id
    const probes: Probe[] = [
      { name: 'guests.list', body: () => ({ q: 'ayşe' }), needs: view('guests') },
      { name: 'guests.card', body: () => ({ id: ids.guest }), needs: view('guests') },
      { name: 'guests.history', body: () => ({ guestId: ids.guest }), needs: view('guests') },
      { name: 'guests.duplicates', body: () => ({ name: 'Ayşe Kaya' }), needs: view('guests') },
      { name: 'guests.create', body: () => ({ firstName: `Yeni ${++n}` }), needs: edit('guests') },
      {
        name: 'guests.update',
        body: () => ({ id: ids.guest, patch: { notes: 'not' } }),
        needs: edit('guests')
      },
      {
        name: 'guests.setStandingNote',
        body: () => ({ id: ids.guest, note: { standingNote: 'Yüksek kat', standingNoteLevel: 'info' } }),
        needs: edit('guests')
      },
      {
        name: 'guests.merge',
        body: () => ({ keepId: freshGuest(), mergeId: freshGuest() }),
        needs: edit('guests.merge')
      },
      // G-50: giving a tag = editing the guest; the tag list itself = the lists setting.
      {
        name: 'guests.setTags',
        body: () => ({ id: freshGuest(), tagIds: [ids.tag] }),
        needs: edit('guests')
      },
      {
        name: 'lists.create',
        body: () => ({ kind: 'guestTags', name: `Etiket ${++n}` }),
        needs: [{ permission: 'settings.lists', level: 'edit' as const }]
      },
      {
        name: 'lists.update',
        body: () => ({ kind: 'guestTags', id: ids.tag, patch: { sort: ++n } }),
        needs: [{ permission: 'settings.lists', level: 'edit' as const }]
      },
      { name: 'companies.list', body: () => ({}), needs: view('companies') },
      { name: 'companies.get', body: () => ({ id: ids.company }), needs: view('companies') },
      { name: 'companies.create', body: () => ({ title: `Firma ${++n}` }), needs: edit('companies') },
      {
        name: 'companies.update',
        body: () => ({ id: ids.company, patch: { favorite: true } }),
        needs: edit('companies')
      },
      { name: 'companies.markUsed', body: () => ({ id: ids.company }), needs: edit('companies') },
      { name: 'blacklist.list', body: () => ({ status: 'all' }), needs: view('blacklist') },
      {
        name: 'blacklist.add',
        body: () => ({ name: `Kişi ${++n}`, severity: 'warn', reasonCode: 'other', reasonText: 'x' }),
        needs: edit('blacklist')
      },
      {
        name: 'blacklist.remove',
        body: () => ({
          id: env.services.blacklist.add(owner, {
            name: `Kaldırılacak ${++n}`,
            severity: 'warn',
            reasonCode: 'other',
            reasonText: 'x'
          }).id,
          reason: 'Borcunu ödedi'
        }),
        needs: edit('blacklist.remove')
      },
      // Whoever reads guests is warned (a guest form), even without the blacklist screen.
      { name: 'blacklist.check', body: () => ({ name: 'Kötü Niyet' }), needs: view('guests') }
    ]
    expect(await env.matrix(probes)).toEqual([])
  })

  it('kara listedeki telefonla yeni misafir açılınca uyarı verir; neden yalnız kara listeyi görene', async () => {
    await call('blacklist.add', {
      name: 'Telefon Kişi',
      phone: '0532 777 66 55',
      severity: 'warn',
      reasonCode: 'unpaid',
      reasonText: 'Hesabı ödemedi'
    })
    const warned = await call<unknown[]>(
      'blacklist.check',
      { name: 'Bambaşka Ad', phone: '+90 532 777 66 55' },
      roleCtx('reception')
    )
    expect(warned.body).toMatchObject([
      { name: 'Telefon Kişi', reasons: ['phone'], reasonText: 'Hesabı ödemedi' }
    ])
    const accountant = await call<unknown[]>(
      'blacklist.check',
      { name: 'Bambaşka Ad', phone: '05327776655' },
      roleCtx('accountant')
    )
    expect(accountant.body).toMatchObject([{ reasons: ['phone'], reasonText: null }])
  })

  it('3 konaklamalı geçmiş: gecelik fiyatlar, ödenenler, son fiyat; panelin özet kartıyla aynı rakamlar', async () => {
    const { services } = env
    const guestId = services.guests.create(owner, { firstName: 'Ivan', lastName: 'Petrov' }).id
    const book = (roomId: string, checkIn: string, checkOut: string, prices: number[]) =>
      services.reservations.create(owner, {
        guest: { id: guestId },
        channelId: ids.channel,
        stays: [
          {
            roomId,
            checkIn,
            checkOut,
            prices: prices.map((priceMinor, i) => ({
              date: new Date(Date.parse(`${checkIn}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
              priceMinor
            }))
          }
        ]
      }).reservation.id
    const pay = (reservationId: string, amountMinor: number, methodId = ids.cash, kind = 'payment') =>
      services.payments.create(owner, {
        reservationId,
        date: '2026-09-01',
        kind: kind as 'payment',
        methodId,
        amountMinor,
        currency: 'TRY'
      })
    const r1 = book(ids.room1, '2026-03-10', '2026-03-12', [200_000, 200_000])
    pay(r1, 400_000)
    const r2 = book(ids.room2, '2026-06-01', '2026-06-04', [250_000, 250_000, 300_000])
    pay(r2, 500_000, ids.card)
    const r3 = book(ids.room1, '2026-08-20', '2026-08-21', [320_000])
    pay(r3, 100_000, ids.cash, 'deposit')

    const history = await call<{
      stays: {
        reservationId: string
        nights: { priceMinor: number }[]
        paidMinor: number
        balanceMinor: number
      }[]
      lastStayDate: string
      lastNightly: unknown
      averageNightly: Record<string, number>
      totalSpent: Record<string, number>
      totalNights: number
    }>('guests.history', { guestId }, roleCtx('reception'))
    expect(history.status).toBe(200)
    const h = history.body
    expect(
      h.stays.map((s) => [s.reservationId, s.nights.map((n) => n.priceMinor), s.paidMinor, s.balanceMinor])
    ).toEqual([
      [r3, [320_000], 100_000, 220_000],
      [r2, [250_000, 250_000, 300_000], 500_000, 300_000],
      [r1, [200_000, 200_000], 400_000, 0]
    ])
    expect(h).toMatchObject({
      lastStayDate: '2026-08-20',
      lastNightly: { amountMinor: 320_000, currency: 'TRY' },
      // (2 × 2.000 + 2 × 2.500 + 3.000 + 3.200) / 6 = 2.533,33
      averageNightly: { TRY: 253_333 },
      totalSpent: { TRY: 1_000_000 },
      totalNights: 6
    })

    const summary = await call<Record<string, unknown>>(
      'booking.guestSummary',
      { guestId },
      roleCtx('reception')
    )
    expect(summary.status).toBe(200)
    expect(summary.body).toMatchObject({
      lastStayDate: h.lastStayDate,
      lastNightly: h.lastNightly,
      averageNightly: h.averageNightly,
      totalSpent: h.totalSpent,
      totalNights: h.totalNights,
      stayCount: 3
    })
  })

  it('"engelle" kaydındaki kişiye rezervasyonu Resepsiyon onaylasa da yazamaz; Müdür yazar', async () => {
    await call(
      'blacklist.add',
      { name: 'Engel Kişi', severity: 'block', reasonCode: 'damage', reasonText: 'Hasar' },
      roleCtx('reception')
    )
    const body = {
      guest: { firstName: 'Engel', lastName: 'Kişi' },
      channelId: ids.channel,
      stays: [
        { roomId: ids.room2, checkIn: '2026-11-10', checkOut: '2026-11-11', nightlyPriceMinor: 100_000 }
      ],
      blacklistConfirmed: true
    }
    const refused = await call('booking.create', body, roleCtx('reception'))
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ messageKey: 'errors.blacklistBlocked' })
    expect((await call('booking.create', body, roleCtx('manager'))).status).toBe(200)
  })
})
