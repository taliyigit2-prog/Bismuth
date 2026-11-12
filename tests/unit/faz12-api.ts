// Shared set-up of the Faz 12 permission tests: the real services behind the one router (IPC path), a few
// records to point at, and a role × procedure check (a call is refused with 403 exactly when the role's default
// level is below what the procedure needs; allowed calls may still fail for other reasons).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import {
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey,
  type SystemRoleCode
} from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import type { DatabaseHandle } from '../../src/main/db/client'
import { expenseSections, laundryItemTypes, productCategories } from '../../src/main/db/schema'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

/** A 1×1 PNG: the smallest file the attachments service accepts as an image. */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export interface Need {
  permission: PermissionKey
  level: 'view' | 'edit'
}

export interface Probe {
  name: string
  body: () => unknown
  needs: Need[]
}

export async function faz12Api() {
  const handle: DatabaseHandle = await seededDatabase()
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-faz12-'))
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: dir, electron: null, chrome: null },
    { clock, attachmentsDir: join(dir, 'attachments') }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const owner = roleCtx('owner')
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  const categoryId = handle.db.select().from(productCategories).get()!.id
  const sheet = handle.db.select().from(laundryItemTypes).get()!.id
  const supplier = services.contacts.create(owner, { name: 'Munzur Su Bayii', category: 'supplier' })
  const laundry = services.contacts.create(owner, { name: 'Örnek Çamaşırhane', category: 'laundry' })
  const product = services.supply.createProduct(owner, { name: 'Munzur 0,5 L', categoryId, unit: 'piece' })
  const purchase = services.supply.recordPurchase(owner, {
    date: '2026-10-01',
    sectionId: general,
    amountMinor: 240_000,
    currency: 'TRY',
    description: 'Munzur Su Bayii',
    items: [{ productId: product.id, qtyMilli: 40_000, unitPriceMinor: 6_000 }]
  })
  const delivery = services.laundry.recordDelivery(owner, {
    date: '2026-10-01',
    direction: 'out',
    contactId: laundry.id,
    items: [{ itemTypeId: sheet, qty: 10 }]
  })
  const lost = services.lostItems.create(owner, { description: 'Siyah şemsiye' })

  const call = (path: string, body: unknown, ctx: Ctx) =>
    handleIpcRequest(api, ctx, { path: `/api/${path}`, body: JSON.stringify(body) })

  /** Every system role against every probe; returns the mismatches (empty = as expected). */
  async function matrix(probes: readonly Probe[]): Promise<string[]> {
    const wrong: string[] = []
    for (const role of SYSTEM_ROLE_CODES as readonly SystemRoleCode[]) {
      const granted = defaultPermissions(role)
      for (const p of probes) {
        const allowed = p.needs.every((n) => levelAllows(granted[n.permission], n.level))
        const res = await call(p.name, p.body(), roleCtx(role))
        const refused = res.status === 403
        if (refused === allowed) wrong.push(`${role} ${p.name}: ${res.status} ${res.body.slice(0, 120)}`)
      }
    }
    return wrong
  }

  return {
    handle,
    services,
    call,
    matrix,
    ids: { general, categoryId, sheet, supplier, laundry, product, purchase, delivery, lost },
    close: () => {
      handle.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
