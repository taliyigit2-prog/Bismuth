// faz-02 kabul ölçütü "Yetkisiz çağrı PermissionDenied döner; UI'siz test ile kanıtlanır" and "her rol × yasak
// işlem": for every system role and every probed service operation, the call is refused exactly when the role's
// default level (src/shared/permissions.ts) is below what the operation needs. Allowed calls may still fail for
// other reasons (validation, not found) — only PERMISSION_DENIED matters here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey,
  type SystemRoleCode
} from '../../src/shared/permissions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  expenseSections,
  paymentMethods,
  roomTypes,
  salesChannels,
  statusTags
} from '../../src/main/db/schema'
import type { Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { createServices } from '../../src/main/services'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

interface Probe {
  name: string
  permission: PermissionKey
  level: 'view' | 'edit'
  /** May return a promise (KBS import, backup). */
  run: (ctx: Ctx) => unknown
}

let handle: DatabaseHandle
const probes: Probe[] = []

/**
 * Keys without an operation of their own yet: reports (Faz 10). `ledger.locked` answers a closed-day write with CONFLICT errors.dayClosed rather than
 * PERMISSION_DENIED (ledger-service.test.ts covers it).
 */
const EXPECTED_UNPROBED: PermissionKey[] = [
  'ledger.locked',
  // Faz 20: no service call needs it yet ("Kameradan yüz al" arrives with P20c; camera rights: permissions-camera.test.ts).
  'camera.enroll',
  'reports.operations',
  'reports.staff',
  'reports.export'
]

beforeAll(async () => {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const dir = join(tmpdir(), 'bismuth-matrix-unused')
  const svc = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: dir, electron: null, chrome: null },
    { clock: deps.clock }
  )
  const { rooms, reservations: res, payments: pay, occupants: occ, currency: fx } = svc
  const owner = roleCtx('owner')
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const room = rooms.createRoom(owner, {
    number: '101',
    roomTypeId: typeId,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const methodId = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const r = res.create(owner, {
    guest: { firstName: 'Deneme' },
    channelId,
    stays: [{ roomId: room.id, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }]
  })
  const stayId = r.stays[0]!.id
  res.checkIn(owner, stayId)
  const occupantId = occ.list(owner, stayId)[0]!.id
  const payment = pay.create(owner, {
    reservationId: r.reservation.id,
    date: '2026-10-01',
    methodId,
    amountMinor: 1,
    currency: 'TRY'
  })
  let n = 0
  const nextNumber = () => `9${String(++n).padStart(2, '0')}`
  const spareRole = svc.users.createRole(owner, { name: 'Yedek rol' })
  const unusedRole = svc.users.createRole(owner, { name: 'Kullanılmayan rol' })

  probes.push(
    {
      name: 'oda ekle',
      permission: 'settings.rooms',
      level: 'edit',
      run: (c) =>
        rooms.createRoom(c, { number: nextNumber(), roomTypeId: typeId, beds: 1, validFrom: '2026-01-01' })
    },
    {
      name: 'odaları toplu ekle',
      permission: 'settings.rooms',
      level: 'edit',
      run: (c) =>
        rooms.createMany(c, [{ number: nextNumber(), roomTypeId: typeId, beds: 1, validFrom: '2026-01-01' }])
    },
    {
      name: 'oda tipi ekle',
      permission: 'settings.rooms',
      level: 'edit',
      run: (c) => rooms.createRoomType(c, { name: 'X' })
    },
    {
      name: 'oda durumu',
      permission: 'rooms.status',
      level: 'edit',
      run: (c) => rooms.setHousekeepingStatus(c, room.id, 'clean')
    },
    {
      name: 'oda bloğu',
      permission: 'rooms.block',
      level: 'edit',
      run: (c) =>
        rooms.createBlock(c, {
          roomId: room.id,
          dateFrom: '2027-01-01',
          dateTo: '2027-01-02',
          kind: 'oos',
          reason: 'x'
        })
    },
    {
      name: 'rezervasyon görüntüle',
      permission: 'calendar',
      level: 'view',
      run: (c) => res.get(c, r.reservation.id)
    },
    {
      name: 'rezervasyon yaz',
      permission: 'calendar',
      level: 'edit',
      run: (c) =>
        res.create(c, {
          guest: { firstName: 'Y' },
          channelId,
          stays: [{ roomId: room.id, checkIn: '2027-02-01', checkOut: '2027-02-02', nightlyPriceMinor: 1 }]
        })
    },
    {
      name: 'rezervasyon notu',
      permission: 'calendar',
      level: 'edit',
      run: (c) => res.addNote(c, r.reservation.id, 'not')
    },
    {
      name: 'girişi geri al',
      permission: 'booking.undoCheckIn',
      level: 'edit',
      run: (c) => res.undoCheckIn(c, r.stays[0]!.id, { reason: 'vazgeçti' })
    },
    {
      name: 'ödeme gir',
      permission: 'payments',
      level: 'edit',
      run: (c) =>
        pay.create(c, {
          reservationId: r.reservation.id,
          date: '2026-10-01',
          methodId,
          amountMinor: 1,
          currency: 'TRY'
        })
    },
    {
      name: 'iade',
      permission: 'payments.refund',
      level: 'edit',
      run: (c) =>
        pay.create(c, {
          reservationId: r.reservation.id,
          date: '2026-10-01',
          kind: 'refund',
          methodId,
          amountMinor: 1,
          currency: 'TRY'
        })
    },
    {
      name: 'ödeme iptali',
      permission: 'payments.void',
      level: 'edit',
      run: (c) => pay.void(c, 'missing-id', 'neden')
    },
    {
      name: 'ödeme düzelt',
      permission: 'payments',
      level: 'edit',
      run: (c) => pay.update(c, payment.id, { note: 'x' })
    },
    {
      name: 'kasa teslimi (x)',
      permission: 'payments.handover',
      level: 'edit',
      run: (c) => pay.handover(c, { paymentIds: ['missing-id'] })
    },
    {
      name: 'ek hizmet satışı',
      permission: 'extras',
      level: 'edit',
      run: (c) =>
        pay.sellExtra(c, { extraServiceId: 'missing', date: '2026-10-01', unitMinor: 1, currency: 'TRY' })
    },
    { name: 'otelde kalanlar', permission: 'in_house', level: 'view', run: (c) => occ.inHouse(c) },
    {
      name: 'KBS işareti',
      permission: 'in_house',
      level: 'edit',
      run: (c) => occ.markKbsReported(c, occupantId)
    },
    {
      name: 'kişi ekle',
      permission: 'in_house',
      level: 'edit',
      run: (c) => occ.add(c, stayId, { fullName: 'Z' })
    },
    {
      name: 'otel kuru',
      permission: 'currency',
      level: 'edit',
      run: (c) => fx.recordRate(c, { base: 'EUR', quote: 'TRY', midRateMicro: 1, source: 'hotel' })
    },
    {
      name: 'kur geçmişi',
      permission: 'currency',
      level: 'view',
      run: (c) => fx.history(c, 'EUR', 'TRY', '2026-01-01', '2027-01-01')
    }
  )

  const guest = svc.guests.create(owner, { firstName: 'Kayıtlı', lastName: 'Misafir' })
  const other = svc.guests.create(owner, { firstName: 'İkinci', lastName: 'Kayıt' })
  const banned = svc.blacklist.add(owner, {
    name: 'Örnek Kişi',
    severity: 'warn',
    reasonCode: 'damage',
    reasonText: 'x'
  })
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  const ownerSection = handle.db
    .select()
    .from(expenseSections)
    .where(eq(expenseSections.code, 'owner'))
    .get()!.id
  const employee = svc.staff.createEmployee(owner, {
    firstName: 'Deneme',
    lastName: 'Personel',
    startDate: '2026-01-01',
    salary: { monthlyMinor: 1_000_000, currency: 'TRY' }
  })
  const paidTag = handle.db.select().from(statusTags).where(eq(statusTags.code, 'paid')).get()!.id
  let day = 0
  const nextDay = () => `2026-11-${String(++day).padStart(2, '0')}`

  probes.push(
    { name: 'misafir kartı', permission: 'guests', level: 'view', run: (c) => svc.guests.get(c, guest.id) },
    {
      name: 'misafir ekle',
      permission: 'guests',
      level: 'edit',
      run: (c) => svc.guests.create(c, { firstName: 'Yeni' })
    },
    {
      name: 'misafir birleştir',
      permission: 'guests.merge',
      level: 'edit',
      run: (c) => svc.guests.merge(c, guest.id, other.id)
    },
    { name: 'firmalar', permission: 'companies', level: 'view', run: (c) => svc.companies.list(c) },
    {
      name: 'firma ekle',
      permission: 'companies',
      level: 'edit',
      run: (c) => svc.companies.create(c, { title: 'Örnek Ltd' })
    },
    { name: 'kara liste', permission: 'blacklist', level: 'view', run: (c) => svc.blacklist.list(c) },
    {
      name: 'kara listeye ekle',
      permission: 'blacklist',
      level: 'edit',
      run: (c) =>
        svc.blacklist.add(c, { name: 'Başka Kişi', severity: 'warn', reasonCode: 'unpaid', reasonText: 'x' })
    },
    {
      name: 'kara listeden çıkar',
      permission: 'blacklist.remove',
      level: 'edit',
      run: (c) => svc.blacklist.remove(c, banned.id, 'yanlış kayıt')
    },
    {
      name: 'takvim notu',
      permission: 'calendar.notes',
      level: 'edit',
      run: (c) => svc.calendar.addNote(c, { title: 'Not', target: { mode: 'single', date: nextDay() } })
    },
    { name: 'görevler', permission: 'tasks', level: 'view', run: (c) => svc.tasks.listTasks(c) },
    {
      name: 'görev ekle',
      permission: 'tasks',
      level: 'edit',
      run: (c) => svc.tasks.createTask(c, { title: 'İş' })
    },
    {
      name: 'kendi tekrarlı görevini ekle',
      permission: 'tasks',
      level: 'edit',
      run: (c) =>
        svc.tasks.createTemplate(c, { title: 'Çiçekleri sula', recurrence: { kind: 'daily', time: '09:00' } })
    },
    {
      name: 'devir özeti',
      permission: 'shift_notes',
      level: 'view',
      run: (c) => svc.shifts.handoverSummary(c)
    },
    {
      name: 'devir yaz',
      permission: 'shift_notes',
      level: 'edit',
      run: (c) => svc.shifts.saveHandover(c, { text: 'devir' })
    },
    {
      name: 'vardiya tanımı',
      permission: 'settings',
      level: 'edit',
      run: (c) => svc.shifts.createShift(c, { name: 'Ara', startTime: '12:00', endTime: '16:00' })
    },
    {
      name: 'gün defteri',
      permission: 'ledger',
      level: 'view',
      run: (c) => svc.ledger.getDay(c, '2026-10-01')
    },
    {
      name: 'gün notu',
      permission: 'ledger',
      level: 'edit',
      run: (c) => svc.ledger.setDayNote(c, '2026-10-01', 'not')
    },
    { name: 'kasa paneli', permission: 'cash', level: 'view', run: (c) => svc.ledger.cashPanel(c) },
    {
      name: 'gün kapat',
      permission: 'business_day.close',
      level: 'edit',
      run: (c) => svc.ledger.closeDay(c, '2026-10-01')
    },
    {
      name: 'ay özeti',
      permission: 'reports.finance',
      level: 'view',
      run: (c) => svc.ledger.monthSummary(c, 2026, 10)
    },
    {
      name: 'giderler',
      permission: 'expenses',
      level: 'view',
      run: (c) => svc.expenses.listExpenses(c, { from: '2026-10-01', to: '2026-10-31' })
    },
    {
      name: 'gider yaz',
      permission: 'expenses',
      level: 'edit',
      run: (c) =>
        svc.expenses.createExpense(c, {
          date: '2026-10-01',
          sectionId: general,
          amountMinor: 1,
          currency: 'TRY',
          description: 'Çay'
        })
    },
    { name: 'personel', permission: 'staff', level: 'view', run: (c) => svc.staff.listEmployees(c) },
    {
      name: 'personel ekle',
      permission: 'staff',
      level: 'edit',
      run: (c) => svc.staff.createEmployee(c, { firstName: 'A', lastName: 'B', startDate: '2026-01-01' })
    },
    {
      name: 'maaş tablosu',
      permission: 'staff.salary',
      level: 'view',
      run: (c) => svc.staff.salaryPeriod(c, { employeeId: employee.id, year: 2026, month: 10 })
    },
    {
      name: 'avans',
      permission: 'staff.salary',
      level: 'edit',
      run: (c) =>
        svc.staff.addTransaction(c, {
          employeeId: employee.id,
          date: '2026-10-01',
          kind: 'bonus',
          amountMinor: 1
        })
    },
    {
      name: 'izin',
      permission: 'staff.leave',
      level: 'edit',
      run: (c) => svc.staff.addLeave(c, { employeeId: employee.id, date: nextDay(), kind: 'rest_day' })
    },
    {
      name: 'ücret kuralı',
      permission: 'staff.policy',
      level: 'edit',
      run: (c) => svc.staff.setPolicy(c, { values: { leaveDaysPerMonth: 4 } })
    },
    {
      name: 'başkasının mesaisi',
      permission: 'staff.overtime',
      level: 'edit',
      run: (c) =>
        svc.staff.recordWork(c, {
          employeeId: employee.id,
          date: nextDay(),
          startTime: '09:00',
          endTime: '17:00'
        })
    },
    { name: 'kayıp eşya', permission: 'lost_items', level: 'view', run: (c) => svc.lostItems.list(c) },
    {
      name: 'kayıp eşya ekle',
      permission: 'lost_items',
      level: 'edit',
      run: (c) => svc.lostItems.create(c, { description: 'Şemsiye' })
    },
    {
      name: 'uzaktan oturum süresi',
      permission: 'remote.settings',
      level: 'edit',
      run: (c) => svc.settings.set(c, { 'host.sessionHours': 12 })
    },
    {
      name: 'durum rengi',
      permission: 'settings.colors',
      level: 'edit',
      run: (c) => svc.statusTags.update(c, paidTag, { color: '#ef4444' })
    },
    { name: 'rehber', permission: 'contacts', level: 'view', run: (c) => svc.contacts.list(c) },
    {
      name: 'rehbere ekle',
      permission: 'contacts',
      level: 'edit',
      run: (c) => svc.contacts.create(c, { name: 'Taksi', category: 'taxi' })
    },
    { name: 'ürünler', permission: 'supplies', level: 'view', run: (c) => svc.supply.listProducts(c) },
    {
      name: 'ürün kategorisi',
      permission: 'supplies',
      level: 'edit',
      run: (c) => svc.supply.createCategory(c, 'Kahvaltı')
    },
    {
      name: 'çamaşır türleri',
      permission: 'laundry',
      level: 'view',
      run: (c) => svc.laundry.listItemTypes(c)
    },
    {
      name: 'çamaşır türü ekle',
      permission: 'laundry',
      level: 'edit',
      run: (c) => svc.laundry.createItemType(c, 'Örtü')
    },
    { name: 'arızalar', permission: 'room_issues', level: 'view', run: (c) => svc.roomIssues.list(c) },
    {
      name: 'arıza bildir',
      permission: 'room_issues',
      level: 'edit',
      run: (c) => svc.roomIssues.create(c, { roomId: room.id, title: 'Ampul' })
    },
    {
      name: 'arıza fotoğrafları',
      permission: 'room_issues',
      level: 'view',
      run: (c) => svc.attachments.list(c, 'room_issue', 'x')
    },
    { name: 'kullanıcılar', permission: 'settings.users', level: 'view', run: (c) => svc.users.listUsers(c) },
    { name: 'roller', permission: 'settings.roles', level: 'view', run: (c) => svc.users.listRoles(c) },
    {
      name: 'rol ekle',
      permission: 'settings.roles',
      level: 'edit',
      run: (c) => svc.users.createRole(c, { name: `Rol ${++n}` })
    },
    {
      name: 'rol değiştir',
      permission: 'settings.roles',
      level: 'edit',
      run: (c) => svc.users.updateRole(c, spareRole.id, { name: `Yedek rol ${++n}` })
    },
    {
      name: 'rol sil',
      permission: 'settings.roles',
      level: 'edit',
      run: (c) => svc.users.deleteRole(c, unusedRole.id)
    },
    {
      name: 'liste satırı ekle',
      permission: 'settings.lists',
      level: 'edit',
      run: (c) => svc.lists.create(c, { kind: 'productCategories', name: `Kategori ${++n}` })
    },
    {
      name: 'liste satırı değiştir',
      permission: 'settings.lists',
      level: 'edit',
      run: (c) => svc.lists.update(c, { kind: 'salesChannels', id: channelId, patch: { sort: ++n } })
    },
    { name: 'denetim kaydı', permission: 'audit_log', level: 'view', run: (c) => svc.audit.list(c) },
    { name: 'yedekler', permission: 'settings.backup', level: 'view', run: (c) => svc.backup.list(c) },
    { name: 'cihazlar', permission: 'devices', level: 'view', run: (c) => svc.auth.listDevices(c) },
    {
      name: 'turizm istatistiği',
      permission: 'tourism_stats',
      level: 'view',
      run: (c) => svc.tourism.listImports(c)
    },
    {
      name: 'KBS içe aktar',
      permission: 'tourism_stats',
      level: 'edit',
      run: (c) =>
        svc.tourism.importKbs(c, { fileName: 'x.xlsx', period: '2026-09', bytes: new Uint8Array([1]) })
    },
    { name: 'oda listesi (Bugün)', permission: 'today', level: 'view', run: (c) => rooms.listRooms(c) },
    {
      name: 'kimlikli kara liste kaydı',
      permission: 'guests.identity',
      level: 'edit',
      run: (c) =>
        svc.blacklist.add(c, {
          name: 'Belgeli Kişi',
          idDocNumber: 'U1234567',
          severity: 'warn',
          reasonCode: 'damage',
          reasonText: 'x'
        })
    },
    {
      name: 'yönetici gideri',
      permission: 'expenses.owner',
      level: 'edit',
      run: (c) =>
        svc.expenses.createExpense(c, {
          date: '2026-10-01',
          sectionId: ownerSection,
          amountMinor: 1,
          currency: 'TRY',
          description: 'Kira'
        })
    },
    {
      name: 'kendi personel kartı',
      permission: 'staff.own_hours',
      level: 'view',
      run: (c) => svc.staff.myEmployee(c)
    },
    { name: 'kamera durumu', permission: 'camera', level: 'view', run: (c) => svc.camera.status(c) },
    { name: 'kamera yeniden başlat', permission: 'camera', level: 'edit', run: (c) => svc.camera.restart(c) },
    {
      name: 'otel ayarı',
      permission: 'settings',
      level: 'edit',
      run: (c) => svc.settings.set(c, { 'hotel.name': 'Pandora' })
    }
  )
})

afterAll(() => handle?.close())

const outcome = async (probe: Probe, ctx: Ctx): Promise<'denied' | 'allowed'> => {
  try {
    await probe.run(ctx)
    return 'allowed'
  } catch (error) {
    return error instanceof AppError && error.code === 'PERMISSION_DENIED' ? 'denied' : 'allowed'
  }
}

describe('her rol × her işlem: yetki servis katmanında (G-23)', () => {
  it.each(SYSTEM_ROLE_CODES.map((r) => [r]))(
    '%s rolü yalnız varsayılan yetkisinin izin verdiği işlemleri yapar',
    async (role) => {
      const ctx = roleCtx(role as SystemRoleCode)
      const levels = defaultPermissions(role as SystemRoleCode)
      const mismatches: { name: string; expected: string; got: string }[] = []
      for (const p of probes) {
        const expected = levelAllows(levels[p.permission], p.level) ? 'allowed' : 'denied'
        const got = await outcome(p, ctx)
        if (expected !== got) mismatches.push({ name: p.name, expected, got })
      }
      expect(mismatches).toEqual([])
    }
  )

  it('hiç yetkisi olmayan kullanıcı hiçbir işlemi yapamaz', async () => {
    const nobody: Ctx = { userId: 'nobody', deviceId: 'd', transport: 'http', can: () => false }
    const allowed: string[] = []
    for (const p of probes) if ((await outcome(p, nobody)) !== 'denied') allowed.push(p.name)
    expect(allowed).toEqual([])
  })

  it('her izin anahtarı en az bir işlemle sınanır (katalogda sahipsiz anahtar kalmaz)', () => {
    const probed = new Set(probes.map((p) => p.permission))
    const untested = PERMISSION_KEYS.filter((k) => !probed.has(k))
    expect(untested).toEqual(EXPECTED_UNPROBED)
  })
})
