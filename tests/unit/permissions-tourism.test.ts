// Tourism statistics (faz-10 madde 9–10, G-23): every operation of the module is refused exactly when the role's
// default `tourism_stats` level is below what it needs; the router path (IPC envelope, base64 file) gives the same
// answer as the service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roomTypes } from '../../src/main/db/schema'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { SEPTEMBER_EXPECTED, kbsWorkbookBuffer, septemberRows } from '../factories/kbs'

const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}

let handle: DatabaseHandle
let services: ReturnType<typeof createServices>
let api: ReturnType<typeof createApiApp>
let importId = ''
let rowId = ''
let file: Buffer

beforeAll(async () => {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  services = createServices(handle, runtime, { clock: depsOf(handle, clock).clock })
  api = createApiApp({ handlers: createHandlers(services) })
  const owner = roleCtx('owner')
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  services.rooms.createRoom(owner, { number: '101', roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
  file = await kbsWorkbookBuffer(septemberRows())
  const t = await services.tourism.importKbs(owner, {
    fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx',
    bytes: new Uint8Array(file)
  })
  importId = t.import.id
  rowId = t.inHouse[0]!.rowId!
})
afterAll(() => handle.close())

interface Probe {
  name: string
  level: 'view' | 'edit'
  run: (ctx: Ctx) => unknown
}

const probes: Probe[] = [
  { name: 'içe alınan dosyalar', level: 'view', run: (c) => services.tourism.listImports(c) },
  { name: 'bakanlık tablosu', level: 'view', run: (c) => services.tourism.table(c, importId) },
  {
    name: 'program karşılaştırması',
    level: 'view',
    run: (c) => services.tourism.compareWithProgram(c, importId)
  },
  { name: 'ülke listesi', level: 'view', run: (c) => services.tourism.countries(c) },
  { name: 'dışa aktar', level: 'view', run: (c) => services.tourism.exportTable(c, importId, 'csv') },
  {
    name: 'KBS içe al',
    level: 'edit',
    run: (c) => services.tourism.importKbs(c, { fileName: 'x.xlsx', bytes: new Uint8Array([1]) })
  },
  {
    name: 'uyruk onayı',
    level: 'edit',
    run: (c) =>
      services.tourism.confirmCountry(c, { rawValue: 'TÜRKYİE', iso2: 'TR', ministryNameTr: 'Türkiye' })
  },
  {
    name: 'ülke adı',
    level: 'edit',
    run: (c) => services.tourism.renameCountry(c, { iso2: 'DE', name: null })
  },
  {
    name: 'otelde kalan düzeltmesi',
    level: 'edit',
    run: (c) => services.tourism.setStayUntil(c, { importId, rowId, until: null })
  },
  {
    name: 'uyruğu boş satırı ülkeye ata',
    level: 'edit',
    run: (c) => services.tourism.assignRow(c, { importId, rowId, iso2: 'TR' })
  },
  { name: 'bildirildi', level: 'edit', run: (c) => services.tourism.markReported(c, importId, false) }
]

const refusal = async (run: () => unknown): Promise<boolean> => {
  try {
    await run()
    return false
  } catch (error) {
    return error instanceof AppError && error.code === 'PERMISSION_DENIED'
  }
}

describe('turizm istatistiği yetkisi (tourism_stats)', () => {
  for (const role of SYSTEM_ROLE_CODES) {
    const level = defaultPermissions(role).tourism_stats
    for (const p of probes) {
      const allowed = levelAllows(level, p.level)
      it(`${role}: ${p.name} → ${allowed ? 'izinli' : 'PermissionDenied'}`, async () => {
        expect(await refusal(() => p.run(roleCtx(role)))).toBe(!allowed)
      })
    }
  }
})

describe('turizm istatistiği yönlendirici üzerinden', () => {
  const call = (name: string, body: unknown, ctx: Ctx) =>
    handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })

  it('dosya base64 olarak gelir; ay dosya adından okunur; tablo sözleşmeye uyar', async () => {
    const res = await call(
      'tourism.import',
      { fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx', dataBase64: file.toString('base64') },
      roleCtx('accountant')
    )
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { period: string; totals: { arrivals: number; nights: number } }
    expect(body.period).toBe('2026-09')
    expect(body.totals).toEqual({ arrivals: SEPTEMBER_EXPECTED.arrivals, nights: SEPTEMBER_EXPECTED.nights })
  })

  it('yetkisiz rol 403 alır; KBS olmayan dosya anlaşılır hata ile reddedilir', async () => {
    const denied = await call('tourism.listImports', {}, roleCtx('housekeeping'))
    expect(denied.status).toBe(403)
    const bad = await call(
      'tourism.import',
      { fileName: 'x.xlsx', dataBase64: Buffer.from('merhaba').toString('base64') },
      roleCtx('owner')
    )
    expect(bad.status).toBe(400)
    expect(JSON.parse(bad.body).error).toMatchObject({ messageKey: 'errors.kbsFormat' })
  })
})
