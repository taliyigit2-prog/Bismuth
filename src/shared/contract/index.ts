// The single contract (03-mimari.md §1.3, faz-01 madde 5): every procedure the UI may call, with zod
// input/output. The main process serves it through ONE Hono router for both transports — Electron IPC
// (no port) and HTTP (server mode, Faz 13). Authorisation is NOT here: it lives in the services (G-23).
import * as z from 'zod'
import { appInfoSchema, pingOutputSchema } from './app'
import { settingsPatchSchema, settingsValuesSchema } from './settings'
import {
  idSchema,
  localDateSchema,
  roomInputSchema,
  roomTypeInputSchema,
  roomTypeUpdateSchema,
  roomUpdateSchema
} from './rooms'
import {
  customStatusTagInputSchema,
  ownTaskSchema,
  shiftInputSchema,
  shiftUpdateSchema,
  statusTagUpdateSchema,
  statusTagViewSchema
} from './operations'
import { payPolicyPatchSchema } from './staff'
import {
  auditFilterSchema,
  changePasswordInputSchema,
  passwordSchema,
  roleInputSchema,
  roleUpdateSchema,
  setPinInputSchema,
  userInputSchema,
  userUpdateSchema
} from './users'
import {
  appModeSchema,
  auditPageSchema,
  authStateSchema,
  calendarDayViewSchema,
  deviceViewSchema,
  employeeSummarySchema,
  listCreateSchema,
  listItemSchema,
  listKindSchema,
  listUpdateSchema,
  meSchema,
  newRecoveryCodesRequestSchema,
  okSchema,
  payPolicyViewSchema,
  pinSignInRequestSchema,
  recoverRequestSchema,
  recoveryCodesSchema,
  roleViewSchema,
  roomTypeViewSchema,
  roomViewSchema,
  setupDraftSchema,
  setupFinishSchema,
  setupOptionsSchema,
  setupProgressSchema,
  setupStateSchema,
  shiftViewSchema,
  signInRequestSchema,
  signInUserSchema,
  taskTemplateViewSchema,
  unlockRequestSchema,
  userViewSchema
} from './admin'

import { byId, empty, includeInactive, proc, type Access, type Procedure } from './proc'
import { MODULE_PROCEDURES } from './procedures'

export { ACCESS, type Access } from './proc'

const core = {
  'app.getInfo': proc(empty, appInfoSchema),
  'auth.ping': proc(empty, pingOutputSchema),
  // Display settings are needed before sign-in (language, theme); without a session only those come back.
  'settings.get': proc(empty, settingsValuesSchema, ['public', 'setup', 'user', 'locked']),
  'settings.set': proc(settingsPatchSchema, settingsValuesSchema, ['setup', 'user']),

  // Sign-in, lock, sessions (G-22, G-144).
  'auth.state': proc(empty, authStateSchema, ['public', 'setup', 'user', 'locked']),
  'auth.signInUsers': proc(empty, z.array(signInUserSchema), ['public', 'user', 'locked']),
  'auth.signIn': proc(signInRequestSchema, meSchema, ['public', 'user', 'locked']),
  'auth.signInWithPin': proc(pinSignInRequestSchema, meSchema, ['public', 'user', 'locked']),
  'auth.recover': proc(recoverRequestSchema, okSchema, ['public']),
  'auth.signOut': proc(empty, okSchema, ['user', 'locked']),
  'auth.lock': proc(empty, okSchema, ['user', 'locked']),
  'auth.unlock': proc(unlockRequestSchema, meSchema, ['locked', 'user']),
  'auth.me': proc(empty, meSchema),
  'auth.changePassword': proc(changePasswordInputSchema, okSchema),
  'auth.setPin': proc(setPinInputSchema, okSchema),
  'auth.newRecoveryCodes': proc(newRecoveryCodesRequestSchema, recoveryCodesSchema),
  'auth.devices': proc(empty, z.array(deviceViewSchema)),
  'auth.revokeDevice': proc(byId, okSchema),
  'auth.revokeSession': proc(byId, okSchema),

  // Setup wizard (G-10): only while the hotel is not set up.
  'setup.state': proc(empty, setupStateSchema, ['public', 'setup', 'user', 'locked']),
  'setup.options': proc(empty, setupOptionsSchema, ['setup']),
  'setup.saveProgress': proc(setupProgressSchema, okSchema, ['setup']),
  'setup.setMode': proc(z.object({ mode: appModeSchema }).strict(), okSchema, ['setup']),
  'setup.finish': proc(setupDraftSchema, setupFinishSchema, ['setup']),

  // Users and roles (G-20…G-25).
  'users.list': proc(includeInactive, z.array(userViewSchema)),
  'users.create': proc(userInputSchema, userViewSchema),
  'users.update': proc(z.object({ id: idSchema, patch: userUpdateSchema }).strict(), userViewSchema),
  'users.setActive': proc(z.object({ id: idSchema, active: z.boolean() }).strict(), userViewSchema),
  'users.resetPassword': proc(z.object({ id: idSchema, password: passwordSchema }).strict(), userViewSchema),
  'roles.list': proc(empty, z.array(roleViewSchema)),
  'roles.create': proc(roleInputSchema, roleViewSchema),
  'roles.update': proc(z.object({ id: idSchema, patch: roleUpdateSchema }).strict(), roleViewSchema),
  'roles.delete': proc(byId, okSchema),

  // Rooms, room types and the hotel's lists (G-11…G-15, G-48).
  'rooms.listTypes': proc(includeInactive, z.array(roomTypeViewSchema)),
  'rooms.createType': proc(roomTypeInputSchema, roomTypeViewSchema),
  'rooms.updateType': proc(
    z.object({ id: idSchema, patch: roomTypeUpdateSchema }).strict(),
    roomTypeViewSchema
  ),
  'rooms.list': proc(includeInactive, z.array(roomViewSchema)),
  'rooms.create': proc(roomInputSchema, roomViewSchema),
  'rooms.createMany': proc(
    z.object({ rooms: z.array(roomInputSchema).min(1).max(500) }).strict(),
    z.array(roomViewSchema)
  ),
  'rooms.update': proc(z.object({ id: idSchema, patch: roomUpdateSchema }).strict(), roomViewSchema),
  'lists.list': proc(
    z.object({ kind: listKindSchema, includeInactive: z.boolean().optional() }).strict(),
    z.array(listItemSchema)
  ),
  'lists.create': proc(listCreateSchema, listItemSchema),
  'lists.update': proc(listUpdateSchema, listItemSchema),

  // Shifts, task suggestions, pay rules, employees (for account links), calendar days.
  'shifts.list': proc(includeInactive, z.array(shiftViewSchema)),
  'shifts.create': proc(shiftInputSchema, shiftViewSchema),
  'shifts.update': proc(z.object({ id: idSchema, patch: shiftUpdateSchema }).strict(), shiftViewSchema),
  'tasks.listTemplates': proc(includeInactive, z.array(taskTemplateViewSchema)),
  'tasks.createTemplate': proc(ownTaskSchema.strict(), taskTemplateViewSchema),
  'tasks.activateTemplate': proc(byId, taskTemplateViewSchema),
  'tasks.deactivateTemplate': proc(byId, taskTemplateViewSchema),
  'staff.getPolicy': proc(z.object({ employeeId: idSchema.nullish() }).strict(), payPolicyViewSchema),
  'staff.setPolicy': proc(payPolicyPatchSchema, payPolicyViewSchema),
  'staff.listEmployees': proc(includeInactive, z.array(employeeSummarySchema)),
  'calendar.days': proc(
    z.object({ from: localDateSchema, to: localDateSchema }).strict(),
    z.array(calendarDayViewSchema)
  ),

  // Audit log (G-24): read only.
  'audit.list': proc(auditFilterSchema, auditPageSchema),

  // Status tags (G-32, G-33, faz-03 madde 2): the colour screen edits them live.
  'statusTags.list': proc(empty, z.array(statusTagViewSchema)),
  'statusTags.update': proc(
    z.object({ id: idSchema, patch: statusTagUpdateSchema }).strict(),
    statusTagViewSchema
  ),
  'statusTags.createCustom': proc(customStatusTagInputSchema, statusTagViewSchema),
  'statusTags.removeCustom': proc(byId, okSchema)
} as const satisfies Record<string, Procedure>

/**
 * Every procedure: the core ones above plus one file per module (`procedures/<module>.ts`), so modules built in
 * parallel never edit the same lines. A name defined twice fails typecheck (the spread would hide it).
 */
export const contract = { ...core, ...MODULE_PROCEDURES } as const satisfies Record<string, Procedure>

export type Contract = typeof contract
export type ProcedureName = keyof Contract
export type ProcedureInput<K extends ProcedureName> = z.input<Contract[K]['input']>
export type ProcedureOutput<K extends ProcedureName> = z.output<Contract[K]['output']>

export const PROCEDURE_NAMES = Object.keys(contract) as ProcedureName[]
/** Who may call `name` (default: a signed-in, unlocked user). */
export const accessOf = (name: ProcedureName): readonly Access[] =>
  (contract[name] as { access?: readonly Access[] }).access ?? ['user']
export const isProcedureName = (name: string): name is ProcedureName => Object.hasOwn(contract, name)

/** URL path of a procedure on the shared router: POST /api/<name>. */
export const procedurePath = (name: ProcedureName): string => `/api/${name}`

export * from './errors'
export * from './settings'
export * from './app'
export * from './transport'
export * from './admin'
