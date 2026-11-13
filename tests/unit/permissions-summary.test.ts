// Faz 16 madde 1 "rol testleri" in one place (G-23): the six system roles against every screen of the menu and every
// module procedure.
// 1. Coverage: every procedure of `src/shared/contract/procedures/*.ts` is named in at least one role test
//    (`tests/unit/permission*.test.ts`); the test lists the ones that are not.
// 2. The procedures the module files tested only at the service level (by method, not by procedure name) go through
//    the one router here: a role is refused with 403 exactly when its default level is below what the call needs.
// 3. Menu ⇔ service: a screen is in a role's menu exactly when the screen's main read is not refused (no menu entry
//    that opens on "yetkiniz yok", no hidden screen whose data the role could still read).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MODULE_PROCEDURES } from '../../src/shared/contract/procedures'
import {
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey,
  type SystemRoleCode
} from '../../src/shared/permissions'
import { NAV_ITEMS, navAllows, type NavPath } from '../../src/renderer/navigation'
import { roleCtx } from '../factories/ctx'
import { faz12Api, type Need, type Probe } from './faz12-api'

let env: Awaited<ReturnType<typeof faz12Api>>
const ids = { doneTask: '', openTask: '', laundry: '' }

beforeAll(async () => {
  env = await faz12Api()
  const owner = roleCtx('owner')
  // The optional online data stays off: the probes of fx/weather/holiday refreshes must not leave the machine.
  env.services.settings.set(owner, { 'network.enabled': false })
  const done = env.services.tasks.createTask(owner, { title: 'Lobideki çiçekleri sula' })
  env.services.tasks.done(owner, done.id)
  ids.doneTask = done.id
  ids.openTask = env.services.tasks.createTask(owner, { title: 'Klimanın filtresini değiştir' }).id
  ids.laundry = env.ids.laundry.id
})
afterAll(() => env?.close())

const need = (permission: PermissionKey, level: Need['level']): Need => ({ permission, level })
/** Every signed-in user may call it (the service narrows what comes back, or there is nothing to protect). */
const anyone: Need[] = []

/** Module procedures the per-module files tested only through the service methods; here through the router. */
const ROUTER_PROBES: Probe[] = [
  // Calendar and reservation panel.
  { name: 'reservations.findStays', body: () => ({ query: 'De' }), needs: [need('calendar', 'view')] },
  {
    name: 'reservations.freeRooms',
    body: () => ({ checkIn: '2026-10-04', checkOut: '2026-10-05' }),
    needs: [need('calendar', 'view')]
  },
  { name: 'booking.searchGuests', body: () => ({ q: 'De' }), needs: [need('guests', 'view')] },
  {
    name: 'booking.changeRoom',
    body: () => ({ stayId: 'yok', change: { newRoomId: 'yok' } }),
    needs: [need('calendar', 'edit')]
  },
  {
    name: 'booking.checkOut',
    body: () => ({ stayId: 'yok', kbsCheckoutIds: [] }),
    needs: [need('calendar', 'edit')]
  },
  {
    name: 'booking.cancel',
    body: () => ({ id: 'yok', reason: 'vazgeçti' }),
    needs: [need('calendar', 'edit')]
  },
  {
    name: 'booking.unpark',
    body: () => ({
      id: 'yok',
      stays: [{ roomId: 'yok', checkIn: '2026-10-04', checkOut: '2026-10-05', nightlyPriceMinor: 100 }]
    }),
    needs: [need('calendar', 'edit')]
  },
  {
    name: 'booking.updateOccupant',
    body: () => ({ id: 'yok', patch: { fullName: 'Bora Yıldırım' } }),
    needs: [need('in_house', 'edit')]
  },
  // Staff: the card is "staff", money is "staff.salary", leave is "staff.leave".
  {
    name: 'staff.updateEmployee',
    body: () => ({ id: 'yok', patch: { position: 'Resepsiyon' } }),
    needs: [need('staff', 'edit')]
  },
  { name: 'staff.linkableUsers', body: () => ({}), needs: [need('staff', 'edit')] },
  { name: 'staff.salaryHistory', body: () => ({ employeeId: 'yok' }), needs: [need('staff.salary', 'view')] },
  {
    name: 'staff.addSalary',
    body: () => ({ employeeId: 'yok', validFrom: '2026-10-01', monthlyMinor: 4_000_000, currency: 'TRY' }),
    needs: [need('staff.salary', 'edit')]
  },
  {
    name: 'staff.addLeave',
    body: () => ({ employeeId: 'yok', date: '2026-10-02', kind: 'rest_day' }),
    needs: [need('staff.leave', 'edit')]
  },
  {
    name: 'staff.listTransactions',
    body: () => ({ employeeId: 'yok', year: 2026, month: 10 }),
    needs: [need('staff.salary', 'view')]
  },
  {
    name: 'staff.lockPeriod',
    body: () => ({ employeeId: 'yok', year: 2026, month: 9 }),
    needs: [need('staff.salary', 'edit')]
  },
  // Rooms, issues, tasks.
  {
    name: 'housekeeping.setNote',
    body: () => ({ roomId: 'yok', note: 'Perde yıkanacak' }),
    needs: [need('rooms.status', 'edit')]
  },
  {
    name: 'housekeeping.updateIssue',
    body: () => ({ id: 'yok', patch: { title: 'Musluk damlatıyor' } }),
    needs: [need('room_issues', 'edit')]
  },
  {
    name: 'housekeeping.reopenIssue',
    body: () => ({ id: 'yok', reason: 'yine damlatıyor' }),
    needs: [need('room_issues', 'edit')]
  },
  { name: 'tasks.undoDone', body: () => ({ id: ids.doneTask }), needs: [need('tasks', 'edit')] },
  { name: 'today.completeTask', body: () => ({ id: ids.openTask }), needs: [need('tasks', 'edit')] },
  {
    name: 'tasks.editTemplate',
    body: () => ({ id: 'yok', patch: { title: 'x' } }),
    needs: [need('tasks', 'edit')]
  },
  { name: 'tasks.completeTemplate', body: () => ({ id: 'yok' }), needs: [need('tasks', 'edit')] },
  // Tourism statistics (KBS file).
  { name: 'tourism.table', body: () => ({ importId: 'yok' }), needs: [need('tourism_stats', 'view')] },
  { name: 'tourism.compare', body: () => ({ importId: 'yok' }), needs: [need('tourism_stats', 'view')] },
  { name: 'tourism.countries', body: () => ({}), needs: [need('tourism_stats', 'view')] },
  {
    name: 'tourism.export',
    body: () => ({ importId: 'yok', format: 'csv' }),
    needs: [need('tourism_stats', 'view')]
  },
  {
    name: 'tourism.confirmCountry',
    body: () => ({ rawValue: 'ALMANYA', iso2: 'DE', ministryNameTr: 'Almanya' }),
    needs: [need('tourism_stats', 'edit')]
  },
  {
    name: 'tourism.renameCountry',
    body: () => ({ iso2: 'DE', name: null }),
    needs: [need('tourism_stats', 'edit')]
  },
  {
    name: 'tourism.setStayUntil',
    body: () => ({ importId: 'yok', rowId: 'yok', until: null }),
    needs: [need('tourism_stats', 'edit')]
  },
  {
    name: 'tourism.assignRow',
    body: () => ({ importId: 'yok', rowId: 'yok', iso2: 'DE' }),
    needs: [need('tourism_stats', 'edit')]
  },
  {
    name: 'tourism.markReported',
    body: () => ({ importId: 'yok', reported: true }),
    needs: [need('tourism_stats', 'edit')]
  },
  // Optional online data (Faz 11).
  { name: 'fx.overview', body: () => ({}), needs: [need('currency', 'view')] },
  { name: 'fx.sources', body: () => ({}), needs: [need('currency', 'view')] },
  { name: 'fx.refresh', body: () => ({}), needs: [need('currency', 'view')] },
  {
    name: 'fx.setHotelRate',
    body: () => ({ currency: 'EUR', rateMicro: null }),
    needs: [need('currency', 'edit')]
  },
  {
    name: 'fx.setApiKey',
    body: () => ({ provider: 'currencyapi', key: null }),
    needs: [need('settings', 'edit')]
  },
  { name: 'weather.get', body: () => ({}), needs: anyone },
  { name: 'weather.refresh', body: () => ({}), needs: anyone },
  { name: 'holidays.check', body: () => ({ year: 2026 }), needs: [need('calendar.notes', 'edit')] },
  { name: 'holidays.lastChecks', body: () => ({}), needs: [need('calendar.notes', 'view')] },
  // Backups, export, import (Faz 14). The recovery text is the owner's: backup + remote settings.
  { name: 'backup.status', body: () => ({}), needs: anyone },
  { name: 'backup.overview', body: () => ({}), needs: [need('settings.backup', 'view')] },
  {
    name: 'backup.verify',
    body: () => ({ source: 'local', id: 'yok.bmy' }),
    needs: [need('settings.backup', 'edit')]
  },
  {
    name: 'backup.restore',
    body: () => ({ source: 'local', id: 'yok.bmy' }),
    needs: [need('settings.backup', 'edit')]
  },
  { name: 'backup.cancelRestore', body: () => ({}), needs: [need('settings.backup', 'edit')] },
  { name: 'backup.restart', body: () => ({}), needs: [need('settings.backup', 'edit')] },
  { name: 'backup.openFolder', body: () => ({ which: 'backups' }), needs: [need('settings.backup', 'edit')] },
  {
    name: 'backup.recoveryText',
    body: () => ({}),
    needs: [need('settings.backup', 'edit'), need('remote.settings', 'edit')]
  },
  { name: 'dataExport.datasets', body: () => ({}), needs: [need('reports.export', 'view')] },
  {
    name: 'dataExport.run',
    body: () => ({ dataset: 'guests', format: 'csv', locale: 'tr' }),
    needs: [need('reports.export', 'view')]
  },
  {
    name: 'dataImport.preview',
    body: () => ({ template: 'ledgerRows', fileName: 'defter.csv', contentBase64: 'eA==' }),
    needs: [need('settings.backup', 'edit'), need('payments', 'edit'), need('expenses', 'edit')]
  },
  {
    name: 'dataImport.run',
    body: () => ({ template: 'ledgerRows', fileName: 'defter.csv', contentBase64: 'eA==' }),
    needs: [need('settings.backup', 'edit'), need('payments', 'edit'), need('expenses', 'edit')]
  },
  // Server mode (Faz 13): reading the remote settings needs view, changing them edit (owner only by default).
  { name: 'remote.hello', body: () => ({}), needs: anyone },
  { name: 'remote.clientStatus', body: () => ({}), needs: anyone },
  { name: 'remote.discover', body: () => ({}), needs: anyone },
  { name: 'remote.epochState', body: () => ({}), needs: anyone },
  // On a computer with its own data the client-only calls answer "not a client" to everyone.
  { name: 'remote.connect', body: () => ({ url: 'http://127.0.0.1:9' }), needs: anyone },
  { name: 'remote.hostStatus', body: () => ({}), needs: [need('remote.settings', 'view')] },
  { name: 'remote.relayStatus', body: () => ({}), needs: [need('remote.settings', 'view')] },
  { name: 'remote.conflicts', body: () => ({}), needs: [need('remote.settings', 'view')] },
  { name: 'remote.replicaGrant', body: () => ({}), needs: [need('remote.settings', 'view')] },
  {
    name: 'remote.setOpenAtLogin',
    body: () => ({ enabled: false }),
    needs: [need('remote.settings', 'edit')]
  },
  // Copy (Mac) and client-only calls: answered by the copy / client side; here "not a client" to everyone, no 403.
  ...(
    [
      'remote.forgetHost',
      'remote.leaveClient',
      'remote.openInBrowser',
      'remote.replicaStatus',
      'remote.replicaSync',
      'remote.replicaPickFolder'
    ] as const
  ).map((name): Probe => ({ name, body: () => ({}), needs: anyone })),
  {
    name: 'remote.replicaSetKey',
    body: () => ({ text: 'x'.repeat(55) }),
    needs: anyone
  },
  { name: 'remote.replicaSetFolder', body: () => ({ folder: null }), needs: anyone },
  { name: 'remote.takeOver', body: () => ({ password: 'cok-gizli-sifre' }), needs: anyone },
  {
    name: 'backup.run',
    body: () => ({ note: 'Faz 16 özet matris' }),
    needs: [need('settings.backup', 'edit')]
  }
]

/**
 * Module procedures this file does not call through the router, and the role test that covers each: they change the
 * computer itself (backup key, mode, a connection to another computer, a file through the Save or folder dialog),
 * which a shared router test cannot undo between roles, or their own file builds the import batches they need.
 */
const NOT_ROUTER_PROBED: Record<string, string> = {
  'backup.setRecoveryText': 'permissions-backup.test.ts: setRecoveryText(accountant) → PERMISSION_DENIED',
  'remote.setMode': 'permissions-remote.test.ts: setMode(reception, manager) → PERMISSION_DENIED',
  'remote.becomeClient': 'permissions-remote.test.ts: becomeClient(reception, manager) → PERMISSION_DENIED',
  'remote.relayRun': 'permissions-replica.test.ts: relayRun(manager, reception…) → PERMISSION_DENIED',
  'remote.saveConflicts':
    'permissions-replica.test.ts: saveConflicts(manager, reception…) → PERMISSION_DENIED',
  'remote.setListenLan':
    'permissions-remote.test.ts: setListenLan(other roles; owner over http) → PERMISSION_DENIED',
  'remote.acceptHostIdentity':
    'anyone by design (connection screen, before sign-in): client-app.ts answers it locally; the main computer → notClient',
  'backup.pickDriveFolder': 'permissions-backup.test.ts: pickDriveFolder(manager; owner over http) → denied',
  'backup.findDriveFolder': 'permissions-backup.test.ts: findDriveFolder(manager; owner over http) → denied',
  'dataImport.batches': 'permissions-data-import.test.ts: batches(manager) → PERMISSION_DENIED',
  'dataImport.voidBatch': 'permissions-data-import.test.ts: voidBatch(manager, viewer, backup-only) → denied',
  'dataImport.sample': 'permissions-data-import.test.ts: sample(manager) → PERMISSION_DENIED'
}

describe('özet rol matrisi (Faz 16)', () => {
  it('her modül yordamı en az bir rol testinde adıyla geçer; geçmeyenler listelenir', () => {
    const dir = __dirname
    const text = readdirSync(dir)
      .filter((f) => /^permission.*\.test\.ts$/.test(f))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
    const named = (name: string) =>
      text.includes(`'${name}'`) || text.includes(`"${name}"`) || NOT_ROUTER_PROBED[name] !== undefined
    const missing = Object.keys(MODULE_PROCEDURES).filter((name) => !named(name))
    expect(missing).toEqual([])
    // The procedures left to the service tests are real ones, and the router probes here do not repeat them.
    const probed = new Set(ROUTER_PROBES.map((p) => p.name))
    for (const name of Object.keys(NOT_ROUTER_PROBED)) {
      expect(Object.keys(MODULE_PROCEDURES)).toContain(name)
      expect(probed.has(name)).toBe(false)
    }
  })

  it('servis düzeyinde sınanmış yordamlar yönlendiriciden: her rol × yordam, yalnız yetkisi yetmeyen 403 alır', async () => {
    expect(await env.matrix(ROUTER_PROBES)).toEqual([])
  })
})

/** The main read of each screen (what the screen asks first); `null`: the screen reads nothing of its own. */
const SCREEN_READS: Record<NavPath, { name: string; body: unknown } | null> = {
  '/calendar': { name: 'reservations.grid', body: { from: '2026-10-01', to: '2026-10-15' } },
  '/today': { name: 'today.summary', body: {} },
  '/calendar-notes': { name: 'calendarNotes.list', body: { from: '2026-10-01', to: '2026-10-31' } },
  '/in-house': { name: 'inHouse.list', body: {} },
  '/tasks': { name: 'tasks.list', body: {} },
  '/shift': { name: 'shift.handovers', body: { from: '2026-10-01', to: '2026-10-31' } },
  '/rooms': { name: 'housekeeping.board', body: {} },
  '/guests': { name: 'guests.list', body: {} },
  '/blacklist': { name: 'blacklist.list', body: { status: 'active' } },
  '/companies': { name: 'companies.list', body: {} },
  '/lost-items': { name: 'lostItems.list', body: {} },
  '/ledger': { name: 'ledger.day', body: { date: '2026-10-04' } },
  '/month-end': { name: 'reports.monthEnd', body: { year: 2026, month: 10 } },
  '/currency': { name: 'fx.overview', body: {} },
  '/issues': { name: 'housekeeping.issues', body: {} },
  '/maintenance': { name: 'tasks.templates', body: {} },
  '/supply': { name: 'supply.overview', body: { year: 2026, month: 10 } },
  '/laundry': { name: 'laundry.month', body: { year: 2026, month: 10, contactId: '' } },
  '/contacts': { name: 'contacts.list', body: { includeInactive: false } },
  '/staff': { name: 'staff.employees', body: {} },
  '/reports': { name: 'reports.summary', body: { from: '2026-10-01', to: '2026-10-31' } },
  '/tourism': { name: 'tourism.listImports', body: {} },
  '/audit': { name: 'audit.list', body: {} },
  // Settings (each section checks its own key), the colour preview, the guide and About read nothing of their own.
  '/settings': null,
  '/theme-preview': null,
  '/guide': null,
  '/about': null
}

/**
 * Screens whose data other screens show too, so a role without the menu entry may still read it (by design): the
 * key a role needs instead.
 */
const SHARED_READS: Partial<Record<NavPath, PermissionKey>> = {
  // Holidays and special days are on Bugün (calendar-service.ts requireCalendarRead).
  '/calendar-notes': 'today'
}

describe('menü ⇔ servis: 6 sistem rolü × her ana ekran', () => {
  it('her menü ekranının ana okuması tanımlı', () => {
    expect(NAV_ITEMS.map((i) => i.to).sort()).toEqual(Object.keys(SCREEN_READS).sort())
  })

  it.each(SYSTEM_ROLE_CODES.map((r) => [r]))(
    '%s: ekran menüde görünür ⇔ ekranın verisi 403 değil',
    async (role) => {
      const granted = defaultPermissions(role as SystemRoleCode)
      const can = (key: PermissionKey) => levelAllows(granted[key], 'view')
      const wrong: string[] = []
      for (const item of NAV_ITEMS) {
        const read = SCREEN_READS[item.to]
        if (!read) continue
        const body = item.to === '/laundry' ? { ...(read.body as object), contactId: ids.laundry } : read.body
        const res = await env.call(read.name, body, roleCtx(role as SystemRoleCode))
        const inMenu = navAllows(item, can)
        const readable = res.status !== 403
        const shared = SHARED_READS[item.to]
        const sharedOk = !inMenu && readable && shared !== undefined && can(shared)
        if (inMenu !== readable && !sharedOk)
          wrong.push(`${item.to} menüde ${inMenu ? 'var' : 'yok'}, ${read.name} → ${res.status}`)
      }
      expect(wrong).toEqual([])
    }
  )
})
