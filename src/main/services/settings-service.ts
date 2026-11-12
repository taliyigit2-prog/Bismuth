import { eq } from 'drizzle-orm'
import {
  PUBLIC_SETTING_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  isDesktopOnlySettingKey,
  isPersonalSettingKey,
  isViewStateKey,
  settingPermission,
  settingsPatchSchema,
  settingsShape,
  type SettingsKey,
  type SettingsPatch,
  type SettingsValues
} from '@shared/contract'
import { setHotelTimeZone } from '@shared/date'
import type { BismuthDb } from '../db/client'
import { expenseSections, expenses, folios, payments, settings, userPreferences } from '../db/schema'
import { ctxKind, type Ctx } from './context'
import { AppError, permissionDenied } from './errors'
import { writeAudit } from './audit'
import { conflict, hasAnyAccess, invalid, newId, parseInput, writeRefusal } from './kit'

/** Any folio (reservation or sale), payment or expense: amounts exist in the current base currency. */
const hasMoneyRows = (db: Pick<BismuthDb, 'select'>): boolean =>
  [folios, payments, expenses].some((t) => db.select({ id: t.id }).from(t).limit(1).get() !== undefined)

/** Settings only their own service writes (with its history and audit rows): `fx.setHotelRate`. */
const SERVICE_ONLY_KEYS: ReadonlySet<string> = new Set<SettingsKey>(['fx.hotelRates'])

export interface SettingsService {
  /** The hotel's settings with the caller's own display choices over them (K-37). */
  get(ctx: Ctx): SettingsValues
  /**
   * `notify: false` inside a larger transaction (setup): the caller calls `announce` once that commits, so the
   * main process never applies a value that is then rolled back.
   */
  set(ctx: Ctx, patch: SettingsPatch, opts?: { notify?: boolean }): SettingsValues
  /** Tells the listeners about keys written with `notify: false`. */
  announce(changed: SettingsKey[]): void
  /**
   * Called after a successful write (main process applies native theme, menu language…). `by` is the caller (its
   * transport and person): `values` carry that person's own display choices, which belong to their screen only.
   * Null for `announce` (the hotel's values, written by the setup wizard on this computer).
   */
  onChange(listener: SettingsListener): () => void
}

export type SettingsListener = (values: SettingsValues, changed: SettingsKey[], by: Ctx | null) => void

export function createSettingsService(
  db: BismuthDb,
  clock: () => Date = () => new Date(),
  /** N-8: the process-wide write gate of a replaced main computer (the same one `inTransaction` checks). */
  writeGate?: () => 'replaced' | null
): SettingsService {
  const listeners = new Set<SettingsListener>()

  /** A stored value, or undefined when it no longer validates (older version, manual edit): the default applies. */
  const parseValue = (key: SettingsKey, valueJson: string): unknown => {
    try {
      const parsed = settingsShape[key].safeParse(JSON.parse(valueJson))
      return parsed.success ? parsed.data : undefined
    } catch {
      return undefined
    }
  }
  const isKey = (key: string): key is SettingsKey => (SETTINGS_KEYS as string[]).includes(key)

  /** The hotel's values: also the default of every personal choice (sign-in screen, accounts that never chose). */
  function readAll(): SettingsValues {
    const values: Record<string, unknown> = { ...SETTINGS_DEFAULTS }
    for (const row of db.select().from(settings).all()) {
      if (!isKey(row.key)) continue
      const value = parseValue(row.key, row.valueJson)
      if (value !== undefined) values[row.key] = value
    }
    return values as SettingsValues
  }

  /** The hotel's values with this person's own display choices over them. */
  function readFor(userId: string | null): SettingsValues {
    const values = readAll() as Record<string, unknown>
    if (!userId) return values as SettingsValues
    for (const row of db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).all()) {
      if (!isKey(row.key) || !isPersonalSettingKey(row.key)) continue
      const value = parseValue(row.key, row.valueJson)
      if (value !== undefined) values[row.key] = value
    }
    return values as SettingsValues
  }
  /** A signed-in person (also on the lock screen) has own choices; the wizard and the program write the hotel's. */
  const ownerOf = (ctx: Ctx): string | null => {
    const kind = ctxKind(ctx)
    return kind === 'user' || kind === 'locked' ? ctx.userId : null
  }

  return {
    // Any signed-in user (and the setup wizard) reads every setting: none holds a secret. A window nobody has
    // signed in to, or a locked one, gets only what the sign-in screen draws with; the rest are defaults.
    get(ctx) {
      const values = readFor(ownerOf(ctx))
      const kind = ctxKind(ctx)
      if (kind !== 'anonymous' && kind !== 'locked') return values
      const visible = { ...SETTINGS_DEFAULTS } as Record<SettingsKey, unknown>
      for (const key of PUBLIC_SETTING_KEYS) visible[key] = values[key]
      return visible as SettingsValues
    },

    set(ctx, input, opts = {}) {
      const keys = Object.keys(input) as SettingsKey[]
      // A read-only copy or a replaced main computer changes nothing, not even a person's own display choice (O-4) —
      // the program's own jobs (systemCtx) on a replaced computer included (N-8: the services' one write gate).
      const refusal = writeRefusal(writeGate ? { writeGate } : {}, ctx)
      if (refusal) throw refusal
      for (const key of keys) {
        // Written only by its own service (P14fix #11): the hotel rate keeps its history row in `fx_rates`.
        if (SERVICE_ONLY_KEYS.has(key)) throw conflict('errors.settingServiceOnly', { key })
        // Personal display keys (language, theme…) are anyone's own, but only for someone who may use the program.
        const allowed = isPersonalSettingKey(key)
          ? hasAnyAccess(ctx)
          : ctx.can(settingPermission(key), 'edit')
        if (!allowed) throw permissionDenied()
        // How this computer works and where its copies go: the hotel's own window only (K-45 (3), O-6).
        if (isDesktopOnlySettingKey(key) && ctx.transport !== 'ipc')
          throw new AppError('PERMISSION_DENIED', 'errors.remoteLocalOnly')
      }
      const patch = parseInput(settingsPatchSchema, input)
      const now = clock()
      const userId = ownerOf(ctx)
      db.transaction((tx) => {
        const before = readFor(userId)
        const base = patch['hotel.baseCurrency']
        // Stored amounts carry their base-currency value (K-15): the base cannot move under them.
        if (base !== undefined && base !== before['hotel.baseCurrency'] && hasMoneyRows(tx))
          throw conflict('errors.baseCurrencyLocked', { current: before['hotel.baseCurrency'] })
        // Rules between keys (Faz 4 bug hunt #11, #12): the base currency stays accepted; staff money goes to a
        // section that exists and is in use.
        const nextBase = base ?? before['hotel.baseCurrency']
        const nextCurrencies = patch['hotel.currencies'] ?? before['hotel.currencies']
        if (
          (base !== undefined || patch['hotel.currencies'] !== undefined) &&
          !nextCurrencies.includes(nextBase)
        )
          throw invalid('errors.baseCurrencyNotAccepted', { base: nextBase })
        const section = patch['staff.expenseSection']
        if (
          section !== undefined &&
          !tx
            .select({ active: expenseSections.active })
            .from(expenseSections)
            .where(eq(expenseSections.code, section))
            .get()?.active
        )
          throw invalid('errors.expenseSectionInvalid', { section })
        for (const key of keys) {
          const value = patch[key as keyof SettingsPatch]
          const valueJson = JSON.stringify(value)
          if (userId && isPersonalSettingKey(key)) {
            // The person's own choice; the hotel's value (everyone else's default) stays.
            const iso = now.toISOString()
            tx.insert(userPreferences)
              .values({ id: newId(now), userId, key, valueJson, createdAt: iso, updatedAt: iso })
              .onConflictDoUpdate({
                target: [userPreferences.userId, userPreferences.key],
                set: { valueJson, updatedAt: iso }
              })
              .run()
            if (isViewStateKey(key)) continue
            writeAudit(
              tx,
              ctx,
              {
                entity: 'user_preference',
                entityId: `${userId}:${key}`,
                action: 'update',
                before: before[key],
                after: value
              },
              now
            )
            continue
          }
          tx.insert(settings)
            .values({ key, valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId })
            .onConflictDoUpdate({
              target: settings.key,
              set: { valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId }
            })
            .run()
          writeAudit(
            tx,
            ctx,
            { entity: 'settings', entityId: key, action: 'update', before: before[key], after: value },
            now
          )
        }
      })
      if (patch['hotel.timezone'] !== undefined) setHotelTimeZone(patch['hotel.timezone'])
      const values = readFor(userId)
      if (opts.notify !== false) for (const l of listeners) l(values, keys, ctx)
      return values
    },

    announce(changed) {
      if (changed.length === 0) return
      const values = readAll()
      for (const l of listeners) l(values, changed, null)
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export const settingsRowFor = (db: BismuthDb, key: SettingsKey) =>
  db.select().from(settings).where(eq(settings.key, key)).get()

/** One setting value (default when missing or invalid) for services that depend on hotel rules (G-09). */
export function readSetting<K extends SettingsKey>(db: Pick<BismuthDb, 'select'>, key: K): SettingsValues[K] {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return SETTINGS_DEFAULTS[key]
  const parsed = settingsShape[key].safeParse(JSON.parse(row.valueJson))
  return (parsed.success ? parsed.data : SETTINGS_DEFAULTS[key]) as SettingsValues[K]
}
