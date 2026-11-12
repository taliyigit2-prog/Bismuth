// What the signed-in user may see (G-20…G-23): `useCan()` reads the session's permission matrix from `auth.state`.
// The owner's "Bu rolün gözüyle bak" (Ayarlar → Roller) previews a role instead: its matrix from `roles.list`
// (a system role falls back to its default matrix). Hiding is only comfort: the services refuse what a role may
// not do (G-23). Without a session (unit tests of a single screen) everything is allowed, as before Faz 4.
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey,
  type PermissionLevel,
  type SystemRoleCode
} from '@shared/permissions'
import type { RoleViewDto } from '@shared/contract'
import { useApiQuery } from './api/hooks'
import { useReadOnlyCopy } from './transport/connection'

/** The previewed role: a role id from `roles.list`, or a system role code. null = the user's own rights. */
let current: string | null = null
const listeners = new Set<() => void>()

const isSystemCode = (value: string): value is SystemRoleCode =>
  (SYSTEM_ROLE_CODES as readonly string[]).includes(value)

/** Starts (role id or system role code) or ends (null, or 'owner') the role preview. */
export function setViewAs(role: string | null): void {
  const next = role === 'owner' ? null : role
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

/** The previewed role id or code; null when the user sees their own rights. */
export function useViewAs(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => null
  )
}

export type Levels = Readonly<Record<PermissionKey, PermissionLevel>>

/** The previewed role from `roles.list` (by id, or by code for a system role code); null while unknown. */
export function findPreviewRole(
  roles: readonly RoleViewDto[] | undefined,
  viewAs: string
): RoleViewDto | null {
  return roles?.find((r) => r.id === viewAs) ?? roles?.find((r) => r.code === viewAs) ?? null
}

/** The previewed role's row in `roles.list` (fetched only while a preview is on). */
export function usePreviewRole() {
  const viewAs = useViewAs()
  const roles = useApiQuery('roles.list', {}, { enabled: viewAs !== null, staleTime: 30_000 })
  return { viewAs, role: viewAs ? findPreviewRole(roles.data, viewAs) : null }
}

/** Matrix in effect: the previewed role's, else the session's; undefined = no session (everything allowed). */
function useLevels(): Levels | undefined {
  const { viewAs, role } = usePreviewRole()
  const session = useApiQuery('auth.state', {}, { staleTime: Infinity }).data?.session
  return useMemo(() => {
    if (viewAs !== null) {
      if (role) return role.permissions
      if (isSystemCode(viewAs)) return defaultPermissions(viewAs)
      // A role the list does not know (yet): show nothing rather than too much.
      return {} as Levels
    }
    return session?.permissions
  }, [viewAs, role, session])
}

/**
 * `can(key, level)` of the signed-in user, or of the role being previewed. While a read-only copy answers (P13b:
 * the owner's copy, or a replaced main computer) no edit right holds: every screen's write buttons close at once,
 * and the strip under the top bar says why.
 */
export function useCan(): (key: PermissionKey, level?: Exclude<PermissionLevel, 'none'>) => boolean {
  const levels = useLevels()
  const readOnly = useReadOnlyCopy()
  return useCallback(
    (key, level = 'view') =>
      readOnly && level === 'edit' ? false : levels ? levelAllows(levels[key] ?? 'none', level) : true,
    [levels, readOnly]
  )
}
