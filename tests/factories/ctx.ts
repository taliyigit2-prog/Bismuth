// Test contexts and deps: a role's default permissions (src/shared/permissions.ts) and a movable clock.
import { defaultPermissions, type SystemRoleCode } from '@shared/permissions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import type { ServiceDeps } from '../../src/main/services/kit'

/** Context of a user whose role has the system defaults of `role` (owner = everything). */
export const roleCtx = (role: SystemRoleCode, userId = `user-${role}`, deviceId = 'test-device'): Ctx =>
  ctxFromPermissions(userId, deviceId, 'ipc', defaultPermissions(role))

/** A clock the test can move: `clock.set('2026-10-01T09:00:00Z')`, `clock.advance(minutes)`. */
export function testClock(start = '2026-10-01T09:00:00.000Z') {
  let now = new Date(start)
  const clock = () => new Date(now)
  clock.set = (iso: string) => {
    now = new Date(iso)
  }
  clock.advance = (minutes: number) => {
    now = new Date(now.getTime() + minutes * 60_000)
  }
  return clock
}

export const depsOf = (handle: DatabaseHandle, clock: () => Date = testClock()): ServiceDeps => ({
  db: handle.db,
  clock
})
