// Idempotent base data (faz-02 madde 4): runs at every start after migrations and only inserts rows whose
// code is missing, so hotel changes (renames, colours, deactivations, permission levels) are never undone and
// rows added in a later version reach existing databases.
import { and, eq, isNull, sql } from 'drizzle-orm'
import { PERMISSION_KEYS, SYSTEM_ROLE_CODES, defaultPermissions } from '@shared/permissions'
import { ulid } from '@shared/ids'
import { taskSuggestedIn } from '@shared/domain/task-country'
import { COUNTRY_SEED_ROWS } from '../../services/tourism/country-map'
import type { BismuthDb } from '../client'
import {
  countryMap,
  expenseSections,
  extraServices,
  laundryItemTypes,
  paymentMethods,
  payPolicies,
  productCategories,
  rolePermissions,
  roles,
  roomTypes,
  salesChannels,
  shiftDefinitions,
  statusTags,
  taskTemplates
} from '../schema'
import {
  CHANNEL_SEED,
  EXPENSE_SECTION_SEED,
  EXTRA_SERVICE_SEED,
  LAUNDRY_ITEM_SEED,
  PAYMENT_METHOD_SEED,
  PAY_POLICY_SEED,
  PRODUCT_CATEGORY_SEED,
  ROLE_SEED,
  ROOM_TYPE_SEED,
  SHIFT_SEED,
  STATUS_TAG_SEED
} from './lists'
import { readSetting } from '../../services/settings-service'
import { upgradeTaskTemplates } from './task-upgrades'
import { TASK_TEMPLATE_SEED } from './tasks'

export interface SeedReport {
  inserted: Record<string, number>
}

const codesOf = (db: BismuthDb, table: string): Set<string> =>
  new Set(
    db
      .all<{ code: string | null }>(sql.raw(`select code from ${table} where code is not null`))
      .map((r) => r.code as string)
  )

// Runs at start-up, before any caller and outside the services' write gate on purpose: it only adds rows that are
// missing (same on every computer of the same version), and a replaced computer still needs its roles to answer.
export function seedBaseData(db: BismuthDb, now: Date = new Date()): SeedReport {
  const ts = now.toISOString()
  const stamp = { createdAt: ts, updatedAt: ts }
  const inserted: Record<string, number> = {}
  const count = (name: string, n: number): void => {
    if (n) inserted[name] = (inserted[name] ?? 0) + n
  }

  db.transaction((tx) => {
    const t = tx as unknown as BismuthDb

    // Roles + default permission rows (missing keys only: new screens get defaults, owner choices stay).
    const roleCodes = codesOf(t, 'roles')
    for (const r of ROLE_SEED) {
      if (roleCodes.has(r.code)) continue
      tx.insert(roles)
        .values({
          id: ulid(now.getTime()),
          code: r.code,
          name: r.name.tr ?? r.code,
          nameI18n: r.name,
          description: r.description.tr ?? null,
          isSystem: true,
          tasksOwnOnly: r.tasksOwnOnly ?? false,
          ...stamp
        })
        .run()
      count('roles', 1)
    }
    const roleRows = tx.select({ id: roles.id, code: roles.code }).from(roles).all()
    for (const role of roleRows) {
      if (!role.code || !(SYSTEM_ROLE_CODES as readonly string[]).includes(role.code)) continue
      const defaults = defaultPermissions(role.code as (typeof SYSTEM_ROLE_CODES)[number])
      for (const key of PERMISSION_KEYS) {
        const res = tx
          .insert(rolePermissions)
          .values({ roleId: role.id, permission: key, level: defaults[key] })
          .onConflictDoNothing()
          .run()
        count('role_permissions', res.changes)
      }
    }

    const roomTypeCodes = codesOf(t, 'room_types')
    ROOM_TYPE_SEED.forEach((r, i) => {
      if (roomTypeCodes.has(r.code)) return
      tx.insert(roomTypes)
        .values({
          id: ulid(now.getTime()),
          code: r.code,
          name: r.name.tr,
          nameI18n: r.name,
          group: r.group,
          isCustom: false,
          maxAdults: r.maxAdults ?? null,
          sort: i,
          ...stamp
        })
        .run()
      count('room_types', 1)
    })

    const methodCodes = codesOf(t, 'payment_methods')
    PAYMENT_METHOD_SEED.forEach((m, i) => {
      if (methodCodes.has(m.code)) return
      tx.insert(paymentMethods)
        .values({
          id: ulid(now.getTime()),
          code: m.code,
          name: m.name.tr,
          nameI18n: m.name,
          group: m.group,
          isCash: m.isCash,
          sort: i,
          ...stamp
        })
        .run()
      count('payment_methods', 1)
    })

    const channelCodes = codesOf(t, 'sales_channels')
    CHANNEL_SEED.forEach((c, i) => {
      if (channelCodes.has(c.code)) return
      tx.insert(salesChannels)
        .values({
          id: ulid(now.getTime()),
          code: c.code,
          name: c.name.tr ?? c.code,
          nameI18n: c.name,
          kind: c.kind,
          defaultCollectedBy: c.collectedBy,
          // The wizard's starting ticks come from here: only the owner's Excel channels (+ e-mail) start on.
          active: c.defaultOn,
          sort: i,
          ...stamp
        })
        .run()
      count('sales_channels', 1)
    })

    const extraCodes = codesOf(t, 'extra_services')
    EXTRA_SERVICE_SEED.forEach((e, i) => {
      if (extraCodes.has(e.code)) return
      tx.insert(extraServices)
        .values({
          id: ulid(now.getTime()),
          code: e.code,
          name: e.name.tr,
          nameI18n: e.name,
          unit: e.unit,
          sort: i,
          ...stamp
        })
        .run()
      count('extra_services', 1)
    })

    const sectionCodes = codesOf(t, 'expense_sections')
    EXPENSE_SECTION_SEED.forEach((s, i) => {
      if (sectionCodes.has(s.code)) return
      tx.insert(expenseSections)
        .values({
          id: ulid(now.getTime()),
          code: s.code,
          nameI18n: s.name,
          visibilityPermission: s.visibilityPermission,
          sort: i,
          ...stamp
        })
        .run()
      count('expense_sections', 1)
    })

    // The hotel's pay rules (B29): a key without any hotel row gets its seeded value; a row the owner wrote (even
    // "inherit") is never touched.
    const policyKeys = new Set(
      tx
        .select({ key: payPolicies.key })
        .from(payPolicies)
        .where(and(eq(payPolicies.scope, 'hotel'), isNull(payPolicies.employeeId)))
        .all()
        .map((r) => r.key)
    )
    for (const [key, value] of Object.entries(PAY_POLICY_SEED)) {
      if (policyKeys.has(key)) continue
      tx.insert(payPolicies)
        .values({
          id: ulid(now.getTime()),
          scope: 'hotel',
          employeeId: null,
          key,
          valueJson: JSON.stringify(value),
          updatedBy: null,
          ...stamp
        })
        .run()
      count('pay_policies', 1)
    }

    const tagCodes = codesOf(t, 'status_tags')
    STATUS_TAG_SEED.forEach((s, i) => {
      if (tagCodes.has(s.code)) return
      tx.insert(statusTags)
        .values({ id: ulid(now.getTime()), code: s.code, kind: 'auto', nameI18n: s.name, sort: i, ...stamp })
        .run()
      count('status_tags', 1)
    })

    const shiftCodes = codesOf(t, 'shift_definitions')
    SHIFT_SEED.forEach((s, i) => {
      if (shiftCodes.has(s.code)) return
      tx.insert(shiftDefinitions)
        .values({
          id: ulid(now.getTime()),
          code: s.code,
          nameI18n: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          sort: i,
          ...stamp
        })
        .run()
      count('shift_definitions', 1)
    })

    const laundryCodes = codesOf(t, 'laundry_item_types')
    LAUNDRY_ITEM_SEED.forEach((l, i) => {
      if (laundryCodes.has(l.code)) return
      tx.insert(laundryItemTypes)
        .values({ id: ulid(now.getTime()), code: l.code, nameI18n: l.name, sort: i, ...stamp })
        .run()
      count('laundry_item_types', 1)
    })

    const categoryCodes = codesOf(t, 'product_categories')
    PRODUCT_CATEGORY_SEED.forEach((c, i) => {
      if (categoryCodes.has(c.code)) return
      tx.insert(productCategories)
        .values({ id: ulid(now.getTime()), code: c.code, nameI18n: c.name, sort: i, ...stamp })
        .run()
      count('product_categories', 1)
    })

    const templateCodes = codesOf(t, 'task_templates')
    const roleIdOf = new Map(
      tx
        .select({ id: roles.id, code: roles.code })
        .from(roles)
        .where(isNull(roles.archivedAt))
        .all()
        .flatMap((r) => (r.code ? [[r.code, r.id] as const] : []))
    )
    const everyN = readSetting(t, 'tasks.everyNStays')
    // Country-bound reminders (Turkish legal ones, K-46 (7)) start on only in their country.
    const country = readSetting(t, 'hotel.country')
    for (const tpl of TASK_TEMPLATE_SEED) {
      if (templateCodes.has(tpl.code)) continue
      const recurrence =
        tpl.recurrence.kind === 'everyNStays' ? { ...tpl.recurrence, n: everyN } : tpl.recurrence
      tx.insert(taskTemplates)
        .values({
          id: ulid(now.getTime()),
          code: tpl.code,
          titleI18n: tpl.title,
          kind: tpl.kind,
          recurrence,
          firstDueAt: tpl.firstDueAt ?? null,
          remindMinutesBefore: tpl.remindMinutesBefore ?? null,
          assigneeRoleId: tpl.assigneeRoleCode ? (roleIdOf.get(tpl.assigneeRoleCode) ?? null) : null,
          suggested: tpl.suggested,
          active: tpl.active && taskSuggestedIn(tpl.code, country),
          ...stamp
        })
        .run()
      count('task_templates', 1)
    }
    count('task_templates_upgraded', upgradeTaskTemplates(tx as unknown as BismuthDb, roleIdOf, now))

    for (const c of COUNTRY_SEED_ROWS) {
      const res = tx
        .insert(countryMap)
        .values({
          keyNormalized: c.keyNormalized,
          rawExample: c.rawExample,
          iso2: c.iso2,
          ministryNameTr: c.ministryNameTr,
          source: 'seed',
          ...stamp
        })
        .onConflictDoNothing()
        .run()
      count('country_map', res.changes)
    }
  })
  return { inserted }
}
