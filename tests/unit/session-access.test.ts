// Faz 4: who may call what (contract `access`), the desktop window's sign-in, lock and sign-out, and the setup
// wizard from a fresh database to a signed-in owner — over the real router and services (in-memory SQLite).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { SetupDraft } from '@shared/contract'
import { localDate } from '@shared/date'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices, ctxFromPermissions } from '../../src/main/services'
import { anonymousCtx, setupCtx, systemCtx } from '../../src/main/services/context'
import { ctxForUser } from '../../src/main/services/users-service'
import { auditLog } from '../../src/main/db/schema'
import { seedBaseData } from '../../src/main/db/seed/seed'
import { createDesktopSessions } from '../../src/main/session/desktop-sessions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

const runtime = {
  name: 'Bismuth',
  version: '0.1.0',
  packaged: false,
  dataDir: tempDataDir(),
  electron: null,
  chrome: null
}
const WINDOW = 7

let handle: DatabaseHandle
let services: ReturnType<typeof createServices>
let api: ReturnType<typeof createApiApp>
let desktop: ReturnType<typeof createDesktopSessions>
let savedDeviceId: string | null

beforeEach(async () => {
  handle = await seededDatabase()
  services = createServices(handle, runtime, { clock: () => new Date('2026-10-04T09:00:00Z') })
  api = createApiApp({ handlers: createHandlers(services) })
  savedDeviceId = null
  desktop = createDesktopSessions({
    setupDone: () => services.setup.isDone(),
    setupOpen: () => services.setup.isOpen(),
    resolve: (token) => services.auth.resolveSession(token),
    userCtx: (userId, deviceId) => ctxForUser(handle.db, userId, deviceId, 'ipc'),
    endSession: (token) => void services.auth.logout(token),
    loadDeviceId: () => savedDeviceId,
    saveDeviceId: (id) => (savedDeviceId = id),
    deviceName: () => 'Resepsiyon PC',
    platform: 'win32'
  })
})
afterEach(() => handle.close())

/** A call from the desktop window: its own ctx and sign-in binding, as the main process wires them. */
async function call<T = unknown>(name: string, body: unknown = {}): Promise<{ status: number; body: T }> {
  const res = await handleIpcRequest(
    api,
    desktop.ctxFor(WINDOW),
    { path: `/api/${name}`, body: JSON.stringify(body) },
    desktop.binding(WINDOW)
  )
  return { status: res.status, body: JSON.parse(res.body) as T }
}
const errorOf = (res: { body: unknown }) =>
  (res.body as { error: { code: string; messageKey: string } }).error

type Options = {
  roomTypes: { id: string; group: string; active: boolean }[]
  paymentMethods: { id: string; active: boolean; isCash?: boolean }[]
  salesChannels: { id: string; code: string | null; kind?: string; active: boolean }[]
  extraServices: { id: string; active: boolean }[]
  shifts: {
    id: string
    name: string | null
    displayName: Record<string, string> | null
    startTime: string
    endTime: string
  }[]
  taskTemplates: { id: string; suggested: boolean; kind: string }[]
  roles: { id: string; code: string | null }[]
}

/** The Lale-sized draft: 19 rooms on 5 floors (S-78), two seeded types and one of the hotel's own. */
function draftFrom(options: Options): SetupDraft {
  const [double, twin] = options.roomTypes.filter((t) => t.group === 'occupancy')
  const reception = options.roles.find((r) => r.code === 'reception')!
  const rooms = Array.from({ length: 19 }, (_, i) => {
    const floor = Math.floor(i / 4) + 1
    return {
      number: `${floor}0${(i % 4) + 1}`,
      floor: String(floor),
      beds: i === 18 ? 4 : 2,
      sellable: true,
      roomType: i === 18 ? { tempKey: 'aile' } : { id: (i % 2 ? twin : double)!.id }
    }
  })
  return {
    language: 'tr',
    theme: 'system',
    hotel: {
      name: 'Örnek Otel',
      country: 'TR',
      city: 'İstanbul',
      timezone: 'Europe/Istanbul',
      checkinTime: '14:00',
      checkoutTime: '12:00'
    },
    money: { baseCurrency: 'TRY', currencies: ['TRY', 'EUR', 'USD'] },
    roomTypes: {
      selected: [
        { id: double!.id, basePriceMinor: 280_000, weekendPriceMinor: 320_000 },
        { id: twin!.id, basePriceMinor: 270_000 }
      ],
      custom: [{ tempKey: 'aile', name: 'Bahçe odası', basePriceMinor: 400_000 }]
    },
    rooms,
    lists: {
      paymentMethods: options.paymentMethods.slice(0, 3).map((m) => m.id),
      salesChannels: options.salesChannels.slice(0, 2).map((c) => c.id),
      extraServices: [],
      customPaymentMethods: [],
      customSalesChannels: ['Kapıdan tavsiye'],
      customExtraServices: ['Bavul emaneti']
    },
    staff: { policy: { leaveDaysPerMonth: 4 }, advanceFromDrawer: true },
    shifts: options.shifts.map((s) => ({
      id: s.id,
      // As the wizard shows it: a seeded shift by its name in the UI language.
      name: s.displayName?.['tr'] ?? s.name ?? 'Vardiya',
      startTime: s.startTime,
      endTime: s.endTime
    })),
    tasks: {
      suggestions: options.taskTemplates
        .filter((t) => t.suggested)
        .slice(0, 2)
        .map((t) => t.id),
      legalReminders: true
    },
    employees: [
      {
        firstName: 'Deniz',
        lastName: 'Arslan',
        position: 'Resepsiyon',
        startDate: '2026-10-01',
        account: { username: 'deniz', password: 'gecici-sifre-1', roleId: reception.id }
      }
    ],
    calendar: { highlightWeekdays: [6, 0], dayClosing: false },
    owner: { username: 'sahip', displayName: 'Otel Sahibi', password: 'cok-gizli-sifre', pin: '2468' }
  }
}

async function setUp(): Promise<SetupDraft> {
  const options = await call<Options>('setup.options')
  expect(options.status).toBe(200)
  const draft = draftFrom(options.body)
  const finish = await call<{ recoveryCodes: string[]; me: { user: { username: string } } }>(
    'setup.finish',
    draft
  )
  expect(finish.status).toBe(200)
  return draft
}

describe('kurulum sihirbazı (G-10)', () => {
  it('hesap yokken pencere kurulumdadır: oturum gerektiren yordam "önce kurulum" der', async () => {
    const state = await call<{ setup: string; session: unknown }>('auth.state')
    expect(state.body).toMatchObject({ setup: 'needed', session: null })
    const rooms = await call('rooms.list')
    expect(rooms.status).toBe(409)
    expect(errorOf(rooms).messageKey).toBe('errors.setupNeeded')
  })

  it('ilerleme şifresiz kaydedilir ve geri okunur', async () => {
    const draft = {
      owner: { username: 'sahip', password: 'gizli-1234', pin: '1234', pinConfirm: '1234' },
      employees: [{ account: { password: 'x', passwordConfirm: 'x' } }],
      later: { deep: [{ secret: 'gizli-2' }] }
    }
    expect((await call('setup.saveProgress', { step: 3, draft })).status).toBe(200)
    const state = await call<{ progress: { step: number; draft: Record<string, unknown> } }>('setup.state')
    expect(state.body.progress.step).toBe(3)
    expect(JSON.stringify(state.body.progress.draft)).not.toMatch(/gizli|1234|"x"/)
    expect(state.body.progress.draft).toMatchObject({ owner: { username: 'sahip' } })
    // Only the wizard reads its answers back (the procedure is public).
    expect(services.setup.state(anonymousCtx('d', 'http')).progress).toBeNull()
  })

  it('yarıda hata veren kurulum hiçbir şey yazmaz; sihirbaz açık kalır ve yeniden bitirilir', async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const owner = options.roles.find((r) => r.code === 'owner')!
    const bad = {
      ...draft,
      employees: [{ ...draft.employees[0]!, account: { ...draft.employees[0]!.account!, roleId: owner.id } }]
    }
    const failed = await call('setup.finish', bad)
    expect(failed.status).toBe(409)
    expect(services.setup.isDone()).toBe(false)
    const sys = systemCtx()
    expect(services.rooms.listRooms(sys)).toHaveLength(0)
    expect(services.users.listUsers(sys)).toHaveLength(0)
    expect(services.settings.get(sys)['hotel.name']).not.toBe('Örnek Otel')
    expect(desktop.ctxFor(WINDOW).kind).toBe('setup')
    expect((await call('setup.finish', draft)).status).toBe(200)
    const closed = handle.db.select().from(auditLog).where(eq(auditLog.entity, 'setup')).all()
    expect(closed.map((r) => r.action)).toEqual(['done'])
  })

  it('kurulum seçenekleri her satış kanalını türüyle verir; yalnızca otelin Excel kanalları ve e-posta açık gelir', async () => {
    const { body: options } = await call<Options>('setup.options')
    const kinds = new Set(['direct', 'ota', 'agency', 'platform_service'])
    expect(options.salesChannels.length).toBeGreaterThan(30)
    expect(options.salesChannels.every((c) => kinds.has(c.kind ?? ''))).toBe(true)
    expect(options.salesChannels.filter((c) => c.active).map((c) => c.code)).toEqual([
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
  })

  it('sihirbazın başlangıç işaretleriyle bitirince listede yalnızca o kanallar açık kalır, diğerleri kapanır ama silinmez', async () => {
    const { body: options } = await call<Options>('setup.options')
    const draft = draftFrom(options)
    const ticked = options.salesChannels.filter((c) => c.active).map((c) => c.id)
    const res = await call('setup.finish', { ...draft, lists: { ...draft.lists, salesChannels: ticked } })
    expect(res.status).toBe(200)
    const ctx = desktop.ctxFor(WINDOW)
    const open = services.lists.list(ctx, 'salesChannels')
    expect(open.map((c) => c.code).filter((c) => c?.startsWith('custom_') === false)).toEqual([
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
    const all = services.lists.list(ctx, 'salesChannels', { includeInactive: true })
    expect(all.length).toBe(options.salesChannels.length + 1) // + the hotel's own "Kapıdan tavsiye"
    expect(all.find((c) => c.code === 'otelz')).toMatchObject({ active: false, kind: 'ota' })
  })

  it('otelin yazdığı oda tipi adı hazır bir tiple aynıysa (harf farkı yok sayılır) o tip açılır; ikinci kez eklenmez', async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const res = await call('setup.finish', {
      ...draft,
      roomTypes: {
        ...draft.roomTypes,
        custom: [{ tempKey: 'aile', name: 'AİLE ODASI', basePriceMinor: 400_000 }]
      }
    })
    expect(res.status).toBe(200)
    const ctx = desktop.ctxFor(WINDOW)
    const all = services.rooms.listRoomTypes(ctx, { includeInactive: true })
    expect(all.filter((t) => t.isCustom)).toEqual([])
    expect(services.rooms.listRoomTypes(ctx)).toHaveLength(3)
    expect(services.rooms.listRoomTypes(ctx).find((t) => t.name === 'Aile odası')).toMatchObject({
      basePriceMinor: 400_000,
      active: true
    })
  })

  it('nakit ödeme yöntemi seçilmeden kurulum bitmez', async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const nonCash = options.paymentMethods.filter((m) => !m.isCash).map((m) => m.id)
    const res = await call('setup.finish', { ...draft, lists: { ...draft.lists, paymentMethods: nonCash } })
    expect(res.status).toBe(409)
    expect(errorOf(res).messageKey).toBe('errors.cashMethodRequired')
    expect(services.setup.isDone()).toBe(false)
  })

  it('kurulum yalnız bu bilgisayardan yapılır, ağdan gelen istek reddedilir', async () => {
    const res = await api.fetch(new Request('http://bismuth.test/api/setup.options', { method: 'POST' }), {
      ctx: setupCtx('d', 'ipc')
    })
    expect(res.status).toBe(409)
  })

  it('bitirince 19 oda, seçilen tipler ve fiyatlar, listeler, personel ve sahip hesabı tek seferde yazılır; sahip oturum açmış olur', async () => {
    await setUp()
    const ctx = desktop.ctxFor(WINDOW)
    expect(ctx.kind ?? 'user').toBe('user')
    expect(services.rooms.listRooms(ctx)).toHaveLength(19)
    const types = services.rooms.listRoomTypes(ctx)
    expect(types).toHaveLength(3)
    expect(types.find((t) => t.name === 'Bahçe odası')).toMatchObject({
      isCustom: true,
      basePriceMinor: 400_000
    })
    expect(services.rooms.bedsOn(ctx, localDate('2026-10-04'))).toBe(18 * 2 + 4)
    const channels = services.lists.list(ctx, 'salesChannels')
    expect(channels).toHaveLength(3)
    expect(channels.map((c) => c.name)).toContain('Kapıdan tavsiye')
    expect(services.settings.get(ctx)).toMatchObject({
      'hotel.name': 'Örnek Otel',
      'hotel.city': 'İstanbul',
      'hotel.currencies': ['TRY', 'EUR', 'USD'],
      'staff.advanceFromDrawer': true
    })
    // Seeded shift names kept as shown stay translated.
    const shifts = services.shifts.listShifts(ctx)
    expect(shifts.length).toBeGreaterThan(0)
    expect(shifts.every((x) => x.name === null && !!x.displayName?.['ru'])).toBe(true)
    const users = services.users.listUsers(ctx)
    expect(users.map((u) => [u.username, u.mustChange])).toEqual([
      ['deniz', true],
      ['sahip', false]
    ])
    expect(services.staff.listEmployees(ctx)[0]).toMatchObject({ firstName: 'Deniz', userId: users[0]!.id })
    const state = await call<{ setup: string; session: { user: { username: string; roleCode: string } } }>(
      'auth.state'
    )
    expect(state.body).toMatchObject({
      setup: 'done',
      session: { user: { username: 'sahip', roleCode: 'owner' } }
    })
  })

  it('kendi görevler kurulumla etkin görev şablonu olur; her biri denetim kaydı bırakır', async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const custom = [
      { title: 'Lobideki çiçekleri sula', recurrence: { kind: 'daily' as const, time: '08:30' } },
      {
        title: 'Perdeleri yıkat',
        recurrence: { kind: 'interval' as const, unit: 'months' as const, every: 6, time: '10:00' }
      }
    ]
    expect((await call('setup.finish', { ...draft, tasks: { ...draft.tasks, custom } })).status).toBe(200)
    const ctx = desktop.ctxFor(WINDOW)
    const own = services.tasks.listTemplates(ctx).filter((t) => t.code === null)
    expect(own.map((t) => [t.title, t.kind, t.active, t.suggested, t.recurrence, t.firstDueAt])).toEqual([
      ['Lobideki çiçekleri sula', 'general', true, false, custom[0]!.recurrence, '2026-10-04T00:00'],
      ['Perdeleri yıkat', 'general', true, false, custom[1]!.recurrence, '2026-10-04T00:00']
    ])
    const audit = handle.db.select().from(auditLog).where(eq(auditLog.entity, 'task_template')).all()
    const created = audit.filter((r) => r.action === 'create').map((r) => r.entityId)
    expect(created.sort()).toEqual(own.map((t) => t.id).sort())
    // The picked suggestions are switched on as before (two in the draft).
    expect(
      services.tasks.listTemplates(ctx).filter((t) => t.code !== null && t.kind !== 'legal')
    ).toHaveLength(3)
  })

  it("Türkiye dışındaki otelde TR yasal hatırlatıcıları açılmaz; Türkiye'de açılır (K-46 (7))", async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const abroad = {
      ...draft,
      hotel: { ...draft.hotel, country: 'GE', city: 'Tiflis', timezone: 'Asia/Tbilisi' }
    }
    expect((await call('setup.finish', abroad)).status).toBe(200)
    const ctx = desktop.ctxFor(WINDOW)
    const legal = services.tasks
      .listTemplates(ctx, { includeInactive: true })
      .filter((t) => t.kind === 'legal')
    expect(legal.map((t) => [t.code, t.active])).toEqual([
      ['legal_tourism_stats', false],
      ['legal_kbs_checkout', false]
    ])
    // The picked everyday suggestions are not country-bound: they are switched on as usual.
    expect(
      services.tasks.listTemplates(ctx).filter((t) => t.code !== null && t.kind !== 'legal')
    ).toHaveLength(3)
  })

  it("Türkiye'deki otelde yasal hatırlatıcılar seçime göre açık kalır", async () => {
    await setUp()
    const ctx = desktop.ctxFor(WINDOW)
    const legal = services.tasks
      .listTemplates(ctx, { includeInactive: true })
      .filter((t) => t.kind === 'legal')
    expect(legal.every((t) => t.active)).toBe(true)
  })

  it('kendi görevler ara kayıtla saklanır ve geri okunur', async () => {
    const custom = [
      { key: 'k1', title: 'Lobideki çiçekleri sula', recurrence: { kind: 'daily', time: '08:30' } }
    ]
    const draft = { tasks: { suggestions: [], legalReminders: true, custom } }
    expect((await call('setup.saveProgress', { step: 8, draft })).status).toBe(200)
    const state = await call<{ progress: { step: number; draft: Record<string, unknown> } }>('setup.state')
    expect(state.body.progress).toEqual({ step: 8, draft })
  })

  it('kendi görevin adı 120 karakteri ya da sayısı 50yi geçerse kurulum reddedilir ve hiçbir şey yazılmaz', async () => {
    const options = (await call<Options>('setup.options')).body
    const draft = draftFrom(options)
    const task = (title: string) => ({ title, recurrence: { kind: 'daily' as const, time: '09:00' } })
    const long = await call('setup.finish', {
      ...draft,
      tasks: { ...draft.tasks, custom: [task('x'.repeat(121))] }
    })
    expect(long.status).toBe(400)
    expect(errorOf(long).messageKey).toBe('errors.validation')
    const many = Array.from({ length: 51 }, (_, i) => task(`Görev ${i + 1}`))
    expect((await call('setup.finish', { ...draft, tasks: { ...draft.tasks, custom: many } })).status).toBe(
      400
    )
    // A rule the own-task form never makes (single task, every N stays) is not taken either.
    const stays = { title: 'Derin temizlik', recurrence: { kind: 'everyNStays', n: 5 } }
    expect(
      (await call('setup.finish', { ...draft, tasks: { ...draft.tasks, custom: [stays] } })).status
    ).toBe(400)
    expect(services.setup.isDone()).toBe(false)
    expect(services.tasks.listTemplates(systemCtx()).filter((t) => t.code === null)).toEqual([])
  })

  it('kurulum bitince sihirbaz kapanır; ikinci kez bitirilemez', async () => {
    const draft = await setUp()
    const again = await call('setup.finish', draft)
    expect(again.status).toBe(409)
    expect(errorOf(again).messageKey).toBe('errors.setupDone')
  })

  it('"istemci" seçilince bu bilgisayarda otel kurulmaz', async () => {
    const options = await call<Options>('setup.options')
    expect((await call('setup.setMode', { mode: 'client' })).status).toBe(200)
    const finish = await call('setup.finish', draftFrom(options.body))
    expect(finish.status).toBe(409)
    expect(errorOf(finish).messageKey).toBe('errors.setupClientMode')
    expect((await call<{ mode: string }>('auth.state')).body.mode).toBe('client')
    // In client mode the wizard writes nothing else, but the person may go back and pick another mode.
    expect((await call('settings.set', { 'ui.language': 'en' })).status).toBe(403)
    expect((await call('setup.setMode', { mode: 'standalone' })).status).toBe(200)
    expect((await call('setup.finish', draftFrom(options.body))).status).toBe(200)
  })
})

describe('oturum, kilit ve çıkış (G-22)', () => {
  it('oturum yokken yalnız herkese açık yordamlar yanıt verir; ayarlardan yalnız ekran ayarları görünür', async () => {
    await setUp()
    expect((await call('auth.signOut')).status).toBe(200)
    expect((await call<{ session: unknown }>('auth.state')).body.session).toBeNull()
    const users = await call<{ displayName: string }[]>('auth.signInUsers')
    expect(users.body.map((u) => u.displayName)).toEqual(['Deniz Arslan', 'Otel Sahibi'])
    const rooms = await call('rooms.list')
    expect(rooms.status).toBe(401)
    const settings = await call<Record<string, unknown>>('settings.get')
    expect(settings.body['hotel.name']).toBe('Örnek Otel')
    expect(settings.body['hotel.city']).toBe('')
  })

  it('PIN ile giriş, kilit, yanlış PIN ve doğru PIN ile açma', async () => {
    await setUp()
    await call('auth.signOut')
    const owner = services.users.signInList('ipc').find((u) => u.displayName === 'Otel Sahibi')!
    const signIn = await call<{ user: { username: string }; locked: boolean }>('auth.signInWithPin', {
      userId: owner.id,
      pin: '2468'
    })
    expect(signIn.body).toMatchObject({ user: { username: 'sahip' }, locked: false })
    expect(savedDeviceId).toBeTruthy()

    expect((await call('auth.lock')).status).toBe(200)
    const locked = await call('rooms.list')
    expect(locked.status).toBe(401)
    expect(errorOf(locked).messageKey).toBe('errors.locked')
    const lockedState = await call<{ session: { locked: boolean; permissions: Record<string, string> } }>(
      'auth.state'
    )
    expect(lockedState.body.session.locked).toBe(true)
    // The lock screen learns nothing about what the account may do.
    expect(Object.values(lockedState.body.session.permissions).every((l) => l === 'none')).toBe(true)

    const wrong = await call('auth.unlock', { secret: '0000' })
    expect(wrong.status).toBe(401)
    const right = await call<{ locked: boolean }>('auth.unlock', { secret: '2468' })
    expect(right.body.locked).toBe(false)
    expect((await call('rooms.list')).status).toBe(200)
  })

  it('kilitli pencerede 5 yanlış deneme oturumu kapatır; hesap kilitlenmez, şifreyle yeniden girilir', async () => {
    await setUp()
    await call('auth.lock')
    for (let i = 0; i < 4; i++) {
      const wrong = await call('auth.unlock', { secret: `000${i}` })
      expect(errorOf(wrong).messageKey).toBe('errors.invalidCredentials')
    }
    const last = await call('auth.unlock', { secret: '0009' })
    expect(errorOf(last).messageKey).toBe('errors.unauthenticated')
    expect(desktop.ctxFor(WINDOW).kind).toBe('anonymous')
    expect((await call<{ session: unknown }>('auth.state')).body.session).toBeNull()
    expect((await call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })).status).toBe(200)
  })

  it('karttan seçilen hesap şifreyle girer', async () => {
    await setUp()
    await call('auth.signOut')
    const owner = services.users.signInList('ipc').find((u) => u.displayName === 'Otel Sahibi')!
    const res = await call<{ user: { username: string } }>('auth.signIn', {
      userId: owner.id,
      secret: 'cok-gizli-sifre'
    })
    expect(res.body.user.username).toBe('sahip')
  })

  it('bilgisayar kilitlenince ya da uyuyunca açık pencereler kilitlenir', async () => {
    await setUp()
    desktop.lockAll()
    expect(desktop.ctxFor(WINDOW).kind).toBe('locked')
  })

  it('aynı pencerede başka kullanıcı girince öncekinin oturumu kapanır', async () => {
    await setUp()
    const before = services.auth.listDevices(desktop.ctxFor(WINDOW))[0]!.sessions
    expect(before).toHaveLength(1)
    // The device list names the caller's own sign-in ("Bu oturum").
    expect(before[0]!.current).toBe(true)
    await call('auth.signOut')
    await call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
    await call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
    expect(services.auth.listDevices(desktop.ctxFor(WINDOW))).toHaveLength(1)
    expect(services.auth.listDevices(desktop.ctxFor(WINDOW))[0]!.sessions).toHaveLength(1)
  })

  it('şifresi başkasınca konan çalışan girer ama değiştirene kadar hiçbir ekranı açamaz', async () => {
    await setUp()
    await call('auth.signOut')
    const signIn = await call<{ user: { mustChange: boolean }; permissions: Record<string, string> }>(
      'auth.signIn',
      {
        username: 'deniz',
        secret: 'gecici-sifre-1'
      }
    )
    expect(signIn.body.user.mustChange).toBe(true)
    expect(Object.values(signIn.body.permissions).every((l) => l === 'none')).toBe(true)
    expect((await call('rooms.list')).status).toBe(403)
    // Not even their own display settings or the lists until the password is changed.
    expect((await call('settings.set', { 'ui.language': 'en' })).status).toBe(403)
    expect((await call('lists.list', { kind: 'paymentMethods' })).status).toBe(403)
    expect(
      (await call('auth.changePassword', { currentPassword: 'gecici-sifre-1', newPassword: 'yeni-sifre-99' }))
        .status
    ).toBe(200)
  })

  it('pencere kapanınca oturum biter', async () => {
    await setUp()
    desktop.closed(WINDOW)
    expect(desktop.ctxFor(WINDOW).kind).toBe('anonymous')
  })
})

describe('gizli bilgiler (G-144)', () => {
  it('veritabanının tam dökümünde hiçbir şifre, PIN, kurtarma kodu ya da oturum belirteci düz metin olarak yok', async () => {
    const options = (await call<Options>('setup.options')).body
    const finish = await call<{ recoveryCodes: string[] }>('setup.finish', draftFrom(options))
    const codes = finish.body.recoveryCodes
    await call('auth.signOut')
    const owner = services.users.signInList('ipc').find((u) => u.displayName === 'Otel Sahibi')!
    await call('auth.signInWithPin', { userId: owner.id, pin: '2468' })
    await call('auth.lock')
    await call('auth.unlock', { secret: '2468' })
    await call('auth.changePassword', {
      currentPassword: 'cok-gizli-sifre',
      newPassword: 'daha-gizli-sifre-2'
    })
    const token = services.auth.login({
      username: 'deniz',
      secret: 'gecici-sifre-1',
      device: { deviceName: 'Telefon', kind: 'mobile' }
    }).token

    const tables = handle.sqlite
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all() as { name: string }[]
    const dump = tables
      .map(({ name }) => JSON.stringify(handle.sqlite.prepare(`select * from "${name}"`).all()))
      .join('\n')
    for (const secret of ['cok-gizli-sifre', 'daha-gizli-sifre-2', 'gecici-sifre-1', token, ...codes])
      expect(dump).not.toContain(secret)
    for (const code of codes) expect(dump).not.toContain(code.replaceAll('-', ''))
    // A PIN is short: look for it as a stored value, not inside a hash.
    expect(dump).not.toMatch(/"2468"|:2468[,}]/)
    const hashes = handle.sqlite.prepare('select password_hash p, pin_hash n from users').all() as {
      p: string
      n: string | null
    }[]
    expect(
      hashes.every((h) => h.p.startsWith('scrypt$') && (h.n === null || h.n.startsWith('scrypt$')))
    ).toBe(true)
  })
})

describe('roller (G-20) ve uzaktan giriş', () => {
  it('kimsenin kullanmadığı rol silinir; kullanılan rol ve sahip rolü silinmez', async () => {
    await setUp()
    const roles = (await call<{ id: string; code: string | null }[]>('roles.list')).body
    const reception = roles.find((r) => r.code === 'reception')!
    const accountant = roles.find((r) => r.code === 'accountant')!
    const owner = roles.find((r) => r.code === 'owner')!
    expect(errorOf(await call('roles.delete', { id: reception.id })).messageKey).toBe('errors.roleInUse')
    expect(errorOf(await call('roles.delete', { id: owner.id })).messageKey).toBe('errors.ownerRoleLocked')
    expect((await call('roles.delete', { id: accountant.id })).status).toBe(200)
    expect((await call<unknown[]>('roles.list')).body).toHaveLength(roles.length - 1)
    // A removed seeded role is archived, so the start-up seed does not bring it back.
    seedBaseData(handle.db, new Date('2026-10-05T09:00:00Z'))
    expect((await call<{ id: string }[]>('roles.list')).body.map((r) => r.id)).not.toContain(accountant.id)
    // Nobody can be given a removed role.
    const create = await call('users.create', {
      username: 'yeni',
      displayName: 'Yeni Kişi',
      roleId: accountant.id,
      password: 'gecici-sifre-2'
    })
    expect(create.status).toBe(404)
  })

  it('açık görevi ya da etkin görev şablonu olan rol silinmez', async () => {
    await setUp()
    const roles = (await call<{ id: string; code: string | null }[]>('roles.list')).body
    const accountant = roles.find((r) => r.code === 'accountant')!
    services.tasks.createTask(desktop.ctxFor(WINDOW), {
      title: 'Faturaları dosyala',
      assigneeRoleId: accountant.id
    })
    const refused = await call('roles.delete', { id: accountant.id })
    expect(errorOf(refused).messageKey).toBe('errors.roleInUse')
    expect((refused.body as { error: { details: unknown } }).error.details).toEqual({ users: 0, tasks: 1 })
  })

  it('"uzaktan giriş yapamaz" rolün hesabı HTTP üzerinden giremez, bu bilgisayardan girer', async () => {
    await setUp()
    const reception = (await call<{ id: string; code: string | null }[]>('roles.list')).body.find(
      (r) => r.code === 'reception'
    )!
    expect((await call('roles.update', { id: reception.id, patch: { remoteAllowed: false } })).status).toBe(
      200
    )
    const device = { deviceName: 'Telefon', kind: 'mobile' as const }
    expect(() =>
      services.auth.login({ username: 'deniz', secret: 'gecici-sifre-1', device }, { remote: true })
    ).toThrow(/errors.invalidCredentials/)
    expect(services.auth.login({ username: 'deniz', secret: 'gecici-sifre-1', device }).userId).toBeTruthy()
    expect(services.users.signInList('http').map((u) => u.displayName)).toEqual(['Otel Sahibi'])
    // A session opened from outside before the change stops working as one.
    const deniz = services.users.listUsers(desktop.ctxFor(WINDOW)).find((u) => u.username === 'deniz')!
    expect(ctxForUser(handle.db, deniz.id, 'd', 'http')).toBeNull()
    expect(ctxForUser(handle.db, deniz.id, 'd', 'ipc')).not.toBeNull()
  })
})

describe('erişim türleri', () => {
  it('oturum açmış kullanıcı kurulum yordamlarına ulaşamaz', async () => {
    await setUp()
    const res = await call('setup.saveProgress', { step: 1, draft: {} })
    expect(res.status).toBe(409)
    expect(errorOf(res).messageKey).toBe('errors.setupDone')
    // The first owner is the wizard's alone: a signed-in owner adds owners through the users screen.
    expect(() =>
      services.users.createFirstOwner(desktop.ctxFor(WINDOW), {
        username: 'ikinci',
        displayName: 'İkinci Sahip',
        password: 'cok-gizli-sifre-2'
      })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('listeler herkesçe okunur, değiştirmek "Listeler" yetkisi ister', async () => {
    await setUp()
    const reception = ctxFromPermissions('u-r', 'd', 'ipc', { 'settings.lists': 'view' })
    expect(services.lists.list(reception, 'paymentMethods').length).toBeGreaterThan(0)
    expect(() => services.lists.create(reception, { kind: 'paymentMethods', name: 'Kripto' })).toThrow(
      /PERMISSION_DENIED/
    )
    // A caller with no right at all reads nothing.
    expect(() => services.lists.list(ctxFromPermissions('u-x', 'd', 'ipc', {}), 'paymentMethods')).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('sahibin gizli gider bölümü yalnız kendi yetkisiyle görünür ve değişir', async () => {
    await setUp()
    const owner = desktop.ctxFor(WINDOW)
    const staff = ctxFromPermissions('u-r', 'd', 'ipc', { expenses: 'edit', 'settings.lists': 'edit' })
    const all = services.lists.list(owner, 'expenseSections')
    const hidden = all.find((s) => s.visibilityPermission === 'expenses.owner')!
    expect(services.lists.list(staff, 'expenseSections').map((s) => s.id)).not.toContain(hidden.id)
    expect(() =>
      services.lists.update(staff, { kind: 'expenseSections', id: hidden.id, patch: { name: 'Görünür' } })
    ).toThrow(/NOT_FOUND/)
  })

  it('son açık nakit ödeme yöntemi kapatılamaz; değişmeyen yazma kayıt bırakmaz', async () => {
    await setUp()
    const ctx = desktop.ctxFor(WINDOW)
    const cash = services.lists.list(ctx, 'paymentMethods').filter((m) => m.isCash)
    for (const m of cash.slice(1))
      services.lists.update(ctx, { kind: 'paymentMethods', id: m.id, patch: { active: false } })
    expect(() =>
      services.lists.update(ctx, { kind: 'paymentMethods', id: cash[0]!.id, patch: { active: false } })
    ).toThrow(/errors.cashMethodRequired/)
    const rows = () =>
      handle.db.select().from(auditLog).where(eq(auditLog.entityId, cash[0]!.id)).all().length
    const before = rows()
    services.lists.update(ctx, { kind: 'paymentMethods', id: cash[0]!.id, patch: { active: true } })
    expect(rows()).toBe(before)
  })

  it('ek hizmete para birimsiz fiyat verilirse otelin ana para birimi yazılır', async () => {
    await setUp()
    const ctx = desktop.ctxFor(WINDOW)
    const item = services.lists.create(ctx, {
      kind: 'extraServices',
      name: 'Özel transfer paketi',
      defaultPriceMinor: 150_000
    })
    expect(item).toMatchObject({ defaultPriceMinor: 150_000, defaultCurrency: 'TRY' })
  })
})
