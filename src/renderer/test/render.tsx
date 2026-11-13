// Test helper (not part of the app bundle): renders a component with the app's providers — settings over a fake
// transport, TanStack Query, i18n, tooltips, the demo data source and a memory router for pages with links.
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router'
import {
  SETTINGS_DEFAULTS,
  STATUS_KEYS,
  accessOf,
  type AppMode,
  type Me,
  type ProcedureName,
  type ProcedureOutput,
  type SettingsValues,
  type StatusKey
} from '@shared/contract'
import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  type PermissionKey,
  type PermissionLevel,
  type SystemRoleCode
} from '@shared/permissions'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initI18n } from '@/i18n'
import { ApiProvider } from '@/lib/api/api-context'
import { ApiError, type Transport } from '@/lib/transport'
import { DemoProvider, type DemoSource } from '@/mocks/demo-source'

type Tag = ProcedureOutput<'statusTags.list'>[number]
type Role = ProcedureOutput<'roles.list'>[number]

const autoTag = (code: StatusKey, sort: number): Tag => ({
  id: `tag-${code}`,
  code,
  kind: 'auto',
  name: null,
  nameI18n: null,
  color: null,
  description: null,
  enabled: true,
  sort,
  priorityOverAuto: false,
  displayName: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z'
})

const ROLE_NAMES: Record<SystemRoleCode, { tr: string; en: string; ru: string }> = {
  owner: { tr: 'Sahip', en: 'Owner', ru: 'Владелец' },
  manager: { tr: 'Müdür', en: 'Manager', ru: 'Управляющий' },
  reception: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' },
  accountant: { tr: 'Muhasebe', en: 'Accountant', ru: 'Бухгалтер' },
  housekeeping: { tr: 'Temizlik', en: 'Housekeeping', ru: 'Уборка' },
  employee: { tr: 'Çalışan', en: 'Employee', ru: 'Сотрудник' }
}

/** The system roles as `roles.list` returns them on a fresh hotel (default matrices, K-38). */
export const FAKE_ROLES: readonly Role[] = SYSTEM_ROLE_CODES.map((code, sort) => ({
  id: `role-${code}`,
  code,
  name: ROLE_NAMES[code].tr,
  displayName: ROLE_NAMES[code],
  description: null,
  isSystem: true,
  permissions: defaultPermissions(code),
  locked: code === 'owner',
  userCount: sort === 0 ? 1 : 0,
  tasksOwnOnly: false,
  remoteAllowed: true
}))

/** An account of the fake hotel (invented names). */
export interface FakeAccount {
  id: string
  username: string
  displayName: string
  roleCode: SystemRoleCode
  password: string
  pin?: string | null
  /** The password was set by someone else (auth.changePassword first). */
  mustChange?: boolean
  /** Levels the owner changed in the role editor on top of the role's defaults. */
  permissionOverrides?: Partial<Record<PermissionKey, PermissionLevel>>
}

export const FAKE_ACCOUNTS: readonly FakeAccount[] = [
  {
    id: 'u-owner',
    username: 'sahip',
    displayName: 'Otel Sahibi',
    roleCode: 'owner',
    password: 'cok-gizli-sifre',
    pin: '2468'
  },
  {
    id: 'u-deniz',
    username: 'deniz',
    displayName: 'Deniz Arslan',
    roleCode: 'reception',
    password: 'resepsiyon-sifre'
  }
]
/** The one recovery code the fake accepts. */
export const FAKE_RECOVERY_CODE = 'K7M2-Q9XD-PA4T-8HZC'
const MAX_FAILED = 5

const allNone = (): Record<PermissionKey, PermissionLevel> =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'none'])) as Record<PermissionKey, PermissionLevel>

export function fakeMe(account: FakeAccount, locked = false): Me {
  return {
    user: {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      roleId: `role-${account.roleCode}`,
      roleCode: account.roleCode,
      roleName: ROLE_NAMES[account.roleCode].tr,
      roleNameI18n: ROLE_NAMES[account.roleCode],
      hasPin: Boolean(account.pin),
      mustChange: Boolean(account.mustChange)
    },
    permissions: account.mustChange
      ? allNone()
      : { ...defaultPermissions(account.roleCode), ...account.permissionOverrides },
    locked
  }
}

export interface FakeTransportOptions {
  /** Status tag ids that refuse deletion like the service. */
  inUse?: readonly string[]
  setup?: 'needed' | 'done'
  mode?: AppMode
  /** Who is signed in to the window: an account id, or null for nobody. Default: the owner. */
  signedIn?: string | null
  locked?: boolean
  accounts?: readonly FakeAccount[]
}

export interface FakeAuth {
  setup: 'needed' | 'done'
  mode: AppMode
  userId: string | null
  locked: boolean
  accounts: FakeAccount[]
  /** Wrong passwords in a row per account (five lock it), wrong PINs per account (five pause PIN sign-in). */
  failures: Record<string, number>
  pinFailures: Record<string, number>
  /** Wrong tries on the lock screen (five sign the window out; the account is not locked by them). */
  unlockFailures: number
}

export type FakeTransport = Transport & {
  settings: SettingsValues
  tags: Tag[]
  auth: FakeAuth
  /** Every call in order (name and input), for assertions. */
  calls: { name: ProcedureName; input: unknown }[]
}

const invalidCredentials = (): ApiError => new ApiError('UNAUTHENTICATED', 401, 'errors.invalidCredentials')
/** The fake's account lock ends at a fixed time (the screen shows it as 09:15). */
export const FAKE_LOCKED_UNTIL = '2026-10-05T09:15:00'
const accountLocked = (): ApiError =>
  new ApiError('UNAUTHENTICATED', 401, 'errors.accountLocked', { until: FAKE_LOCKED_UNTIL })
const wrongPassword = (): ApiError => new ApiError('VALIDATION', 400, 'errors.wrongPassword')

/**
 * An in-memory stand-in for the main process: settings, status tags and the window's sign-in (Faz 4) behave like
 * the real services (the service tests cover the rules); anything else is a test error. By default the owner is
 * signed in, so screens see every right.
 */
export function fakeTransport(
  initial: SettingsValues = SETTINGS_DEFAULTS,
  opts: FakeTransportOptions = {}
): FakeTransport {
  const state = {
    settings: { ...initial },
    tags: STATUS_KEYS.map(autoTag),
    next: 1
  }
  const auth: FakeAuth = {
    setup: opts.setup ?? 'done',
    mode: opts.mode ?? 'standalone',
    userId: opts.signedIn === undefined ? 'u-owner' : opts.signedIn,
    locked: opts.locked ?? false,
    accounts: (opts.accounts ?? FAKE_ACCOUNTS).map((a) => ({ ...a })),
    failures: {},
    pinFailures: {},
    unlockFailures: 0
  }
  const calls: FakeTransport['calls'] = []
  const current = (): FakeAccount | null => auth.accounts.find((a) => a.id === auth.userId) ?? null
  /**
   * A password like the service: five wrong in a row lock the account; the fifth and every later try (the right
   * password too) say so with the end time.
   */
  const check = (account: FakeAccount | undefined, ok: boolean): FakeAccount => {
    const key = account?.id ?? 'unknown'
    const failures = auth.failures[key] ?? 0
    if (account && failures >= MAX_FAILED) throw accountLocked()
    if (account && ok) {
      auth.failures[key] = 0
      return account
    }
    if (account) auth.failures[key] = failures + 1
    if (account && failures + 1 >= MAX_FAILED) throw accountLocked()
    throw invalidCredentials()
  }
  /** A PIN like the service: wrong PINs never lock the account; after five, PIN sign-in pauses (the password works). */
  const checkPin = (account: FakeAccount | undefined, ok: boolean): FakeAccount => {
    const key = account?.id ?? 'unknown'
    if ((auth.pinFailures[key] ?? 0) >= MAX_FAILED)
      throw new ApiError('UNAUTHENTICATED', 401, 'errors.pinPaused')
    if (account && (auth.failures[key] ?? 0) >= MAX_FAILED) throw accountLocked()
    if (account && ok) return account
    auth.pinFailures[key] = (auth.pinFailures[key] ?? 0) + 1
    throw invalidCredentials()
  }
  const signIn = (account: FakeAccount): Me => {
    auth.userId = account.id
    auth.locked = false
    return fakeMe(account)
  }
  /** The router's access check (contract `access`): who may reach a procedure at all. */
  const refuse = (name: ProcedureName): void => {
    const access = accessOf(name)
    if (access.includes('public')) return
    if (auth.setup === 'needed') {
      if (!access.includes('setup')) throw new ApiError('CONFLICT', 409, 'errors.setupNeeded')
      return
    }
    if (!current()) throw new ApiError('UNAUTHENTICATED', 401, 'errors.unauthenticated')
    if (auth.locked && !access.includes('locked')) throw new ApiError('UNAUTHENTICATED', 401, 'errors.locked')
    if (!auth.locked && !access.includes('user')) throw new ApiError('CONFLICT', 409, 'errors.setupDone')
  }
  const requireUser = (): FakeAccount => {
    const account = current()
    if (!account) throw new ApiError('UNAUTHENTICATED', 401, 'errors.unauthenticated')
    return account
  }

  return {
    kind: 'ipc',
    get settings() {
      return state.settings
    },
    get tags() {
      return state.tags
    },
    auth,
    calls,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      refuse(name)
      if (name === 'settings.get') return state.settings as never
      if (name === 'settings.set') {
        state.settings = { ...state.settings, ...(input as Partial<SettingsValues>) }
        return state.settings as never
      }
      if (name === 'statusTags.list') return state.tags as never
      if (name === 'statusTags.update') {
        const { id, patch } = input as { id: string; patch: Partial<Tag> }
        state.tags = state.tags.map((t) => (t.id === id ? { ...t, ...patch } : t))
        return state.tags.find((t) => t.id === id) as never
      }
      if (name === 'statusTags.createCustom') {
        const data = input as Pick<Tag, 'name' | 'color' | 'description' | 'priorityOverAuto'>
        const tag: Tag = {
          ...autoTag('empty', 100 + state.next),
          ...data,
          id: `custom-${state.next++}`,
          code: `custom_${state.next}`,
          kind: 'custom'
        }
        state.tags = [...state.tags, tag]
        return tag as never
      }
      if (name === 'statusTags.removeCustom') {
        const { id } = input as { id: string }
        if (opts.inUse?.includes(id)) throw new ApiError('CONFLICT', 409, 'errors.tagInUse')
        state.tags = state.tags.filter((t) => t.id !== id)
        return { ok: true } as never
      }

      // ── sign-in (Faz 4) ──
      if (name === 'auth.state') {
        const account = auth.setup === 'done' ? current() : null
        return {
          setup: auth.setup,
          mode: auth.mode,
          session: account ? fakeMe(account, auth.locked) : null
        } as never
      }
      if (name === 'auth.signInUsers')
        return auth.accounts.map((a) => ({
          id: a.id,
          displayName: a.displayName,
          roleName: ROLE_NAMES[a.roleCode].tr,
          roleNameI18n: ROLE_NAMES[a.roleCode],
          hasPin: Boolean(a.pin)
        })) as never
      if (name === 'auth.signIn') {
        // A typed username, or the id of a card picked from the sign-in list.
        const { username, userId, secret } = input as { username?: string; userId?: string; secret: string }
        const account = auth.accounts.find((a) =>
          userId ? a.id === userId : a.username === username?.trim().toLocaleLowerCase('tr')
        )
        return signIn(check(account, account?.password === secret)) as never
      }
      if (name === 'auth.signInWithPin') {
        const { userId, pin } = input as { userId: string; pin: string }
        const account = auth.accounts.find((a) => a.id === userId)
        return signIn(checkPin(account, Boolean(account?.pin) && account?.pin === pin)) as never
      }
      if (name === 'auth.signOut') {
        auth.userId = null
        auth.locked = false
        return { ok: true } as never
      }
      if (name === 'auth.lock') {
        requireUser()
        auth.locked = true
        return { ok: true } as never
      }
      if (name === 'auth.unlock') {
        const account = requireUser()
        const { secret } = input as { secret: string }
        const ok = secret === account.password || (Boolean(account.pin) && secret === account.pin)
        if (!ok) {
          // Like the service: the fifth wrong try in a row signs the window out; the account stays unlocked.
          auth.unlockFailures += 1
          if (auth.unlockFailures < MAX_FAILED) throw invalidCredentials()
          auth.unlockFailures = 0
          auth.userId = null
          auth.locked = false
          throw new ApiError('UNAUTHENTICATED', 401, 'errors.unauthenticated')
        }
        auth.unlockFailures = 0
        auth.locked = false
        return fakeMe(account) as never
      }
      if (name === 'auth.changePassword') {
        const account = requireUser()
        const { currentPassword, newPassword } = input as { currentPassword: string; newPassword: string }
        if (currentPassword !== account.password) throw wrongPassword()
        if (newPassword === currentPassword) throw new ApiError('VALIDATION', 400, 'errors.samePassword')
        account.password = newPassword
        account.mustChange = false
        return { ok: true } as never
      }
      if (name === 'auth.setPin') {
        const account = requireUser()
        const { currentPassword, pin } = input as { currentPassword: string; pin: string }
        if (currentPassword !== account.password) throw wrongPassword()
        if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin))
          throw new ApiError('VALIDATION', 400, 'errors.validation')
        account.pin = pin
        return { ok: true } as never
      }
      if (name === 'auth.newRecoveryCodes') {
        const account = requireUser()
        if ((input as { currentPassword: string }).currentPassword !== account.password) throw wrongPassword()
        return {
          codes: Array.from({ length: 10 }, (_, i) => `ABCD-EFGH-JKMN-PQ${String(i).padStart(2, '0')}`)
        } as never
      }
      if (name === 'auth.recover') {
        const { username, code, newPassword } = input as {
          username: string
          code: string
          newPassword: string
        }
        const account = auth.accounts.find((a) => a.username === username.trim().toLocaleLowerCase('tr'))
        check(account, code.trim().toUpperCase() === FAKE_RECOVERY_CODE)
        account!.password = newPassword
        account!.pin = null
        return { ok: true } as never
      }
      if (name === 'setup.setMode') {
        auth.mode = (input as { mode: AppMode }).mode
        return { ok: true } as never
      }
      if (name === 'roles.list') return FAKE_ROLES as never
      throw new Error(`unexpected ${name}`)
    }
  } as FakeTransport
}

export async function renderWithProviders(
  ui: ReactElement,
  opts: { settings?: Partial<SettingsValues>; source?: DemoSource; transport?: Transport } = {}
) {
  const settings = { ...SETTINGS_DEFAULTS, ...opts.settings }
  await initI18n(settings['ui.language'])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['settings.get', {}], settings)
  const transport = opts.transport ?? fakeTransport(settings)
  const rootRoute = createRootRoute()
  const page = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => ui })
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] })
  })
  const inner = (
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  )
  const result = render(
    <ApiProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        {opts.source ? <DemoProvider source={opts.source}>{inner}</DemoProvider> : inner}
      </QueryClientProvider>
    </ApiProvider>
  )
  return { ...result, queryClient, transport }
}

/** A source that never answers successfully (error states). */
export const failingSource: DemoSource = { hotel: () => Promise.reject(new Error('demo failure')) }
