// Faz 9: room status board, room issues with photos.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/housekeeping.ts.
import * as z from 'zod'
import { byId, proc, type Procedure } from '../proc'
import { hkNoteSchema, hkStatusSchema, i18nTextSchema, idSchema, localDateSchema } from '../rooms'
import {
  ATTACHMENT_MIME_TYPES,
  ROOM_ISSUE_SEVERITIES,
  ROOM_ISSUE_STATUSES,
  attachmentEntitySchema,
  roomIssueInputSchema,
  roomIssueListSchema,
  roomIssuePlanSchema,
  roomIssueResolveSchema,
  roomIssueUpdateSchema
} from '../supply'

const severity = z.enum(ROOM_ISSUE_SEVERITIES)

export const roomBlockViewSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  dateFrom: localDateSchema,
  dateTo: localDateSchema,
  kind: z.enum(['oos', 'ooo']),
  reason: z.string(),
  note: z.string().nullable(),
  roomIssueId: idSchema.nullable(),
  taskId: idSchema.nullable(),
  source: z.enum(['hk_status']).nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type RoomBlockView = z.infer<typeof roomBlockViewSchema>

export const boardRoomSchema = z.object({
  id: idSchema,
  number: z.string(),
  floor: z.string().nullable(),
  typeName: z.string(),
  typeNameI18n: i18nTextSchema.nullable(),
  beds: z.number().int(),
  hk: hkStatusSchema,
  hkNote: z.string().nullable(),
  hkAt: z.string().nullable(),
  hkByName: z.string().nullable(),
  /** Null when the room is empty or the caller may not see guests. */
  guest: z.string().nullable(),
  occupied: z.boolean(),
  arriving: z.boolean(),
  departing: z.boolean(),
  /** Null when the caller may not see issues. */
  openIssues: z.number().int().nullable(),
  block: z
    .object({
      id: idSchema,
      kind: z.enum(['oos', 'ooo']),
      reason: z.string(),
      dateFrom: localDateSchema,
      dateTo: localDateSchema,
      active: z.boolean(),
      fromStatus: z.boolean(),
      roomIssueId: idSchema.nullable()
    })
    .nullable()
})
export type BoardRoomView = z.infer<typeof boardRoomSchema>

export const boardSchema = z.object({
  today: localDateSchema,
  showGuests: z.boolean(),
  showIssues: z.boolean(),
  rooms: z.array(boardRoomSchema)
})
export type BoardView = z.infer<typeof boardSchema>

export const roomOpenIssuesSchema = z.object({
  roomId: idSchema,
  roomNumber: z.string(),
  count: z.number().int(),
  severity,
  oldestReportedAt: z.string(),
  blocksRoom: z.boolean(),
  issues: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      severity,
      status: z.enum(['open', 'planned']),
      reportedAt: z.string(),
      blocksRoom: z.boolean()
    })
  )
})
export type RoomOpenIssuesView = z.infer<typeof roomOpenIssuesSchema>

export const roomIssueViewSchema = z.object({
  id: idSchema,
  roomId: idSchema.nullable(),
  roomNumber: z.string().nullable(),
  area: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  severity,
  status: z.enum(ROOM_ISSUE_STATUSES),
  reportedBy: z.string().nullable(),
  reportedByName: z.string().nullable(),
  reportedAt: z.string(),
  assignedTo: z.string().nullable(),
  plannedDate: localDateSchema.nullable(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  /** Solved and reopened events, oldest first (from the audit log): note = solution note or reopen reason. */
  history: z.array(
    z.object({
      kind: z.enum(['resolved', 'reopened']),
      at: z.string(),
      byName: z.string().nullable(),
      note: z.string().nullable()
    })
  ),
  blocksRoom: z.boolean(),
  photos: z.number().int(),
  block: roomBlockViewSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type RoomIssueView = z.infer<typeof roomIssueViewSchema>

export const attachmentViewSchema = z.object({
  id: idSchema,
  entity: attachmentEntitySchema,
  entityId: idSchema,
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable()
})
export type AttachmentView = z.infer<typeof attachmentViewSchema>

/** One upload: the bytes as base64 (the IPC envelope is JSON, ≤ 8 MB; photos are shrunk before sending). */
export const attachmentUploadSchema = z
  .object({
    entity: attachmentEntitySchema,
    entityId: idSchema,
    fileName: z.string().trim().min(1).max(255),
    mime: z.enum(ATTACHMENT_MIME_TYPES),
    dataBase64: z
      .string()
      .min(1)
      .max(8 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  })
  .strict()
export type AttachmentUpload = z.input<typeof attachmentUploadSchema>

export const housekeepingProcedures = {
  // Room status board (G-90, S-96).
  'housekeeping.board': proc(z.object({}).strict(), boardSchema),
  'housekeeping.setStatus': proc(
    z.object({ roomId: idSchema, status: hkStatusSchema, note: hkNoteSchema }).strict(),
    boardRoomSchema.pick({ id: true, hk: true, hkNote: true, hkAt: true }).extend({
      /** The calendar block a closing state opened (null when it ended, or the room is sold tonight). */
      block: roomBlockViewSchema.nullable()
    })
  ),
  'housekeeping.setNote': proc(
    z.object({ roomId: idSchema, note: hkNoteSchema }).strict(),
    boardRoomSchema.pick({ id: true, hk: true, hkNote: true, hkAt: true })
  ),
  /** Open + planned issues per room (calendar row icon P5a, reservation panel warning P5b, room tiles). */
  'housekeeping.openIssuesByRoom': proc(z.object({}).strict(), z.array(roomOpenIssuesSchema)),

  // Room issues (G-180).
  'housekeeping.issues': proc(roomIssueListSchema.strict(), z.array(roomIssueViewSchema)),
  'housekeeping.issue': proc(byId, roomIssueViewSchema),
  'housekeeping.reportIssue': proc(roomIssueInputSchema, roomIssueViewSchema),
  'housekeeping.updateIssue': proc(
    z.object({ id: idSchema, patch: roomIssueUpdateSchema }).strict(),
    roomIssueViewSchema
  ),
  'housekeeping.planIssue': proc(roomIssuePlanSchema.extend({ id: idSchema }).strict(), roomIssueViewSchema),
  'housekeeping.resolveIssue': proc(
    roomIssueResolveSchema.extend({ id: idSchema }).strict(),
    roomIssueViewSchema
  ),
  'housekeeping.reopenIssue': proc(
    z.object({ id: idSchema, reason: z.string().trim().min(1).max(500) }).strict(),
    roomIssueViewSchema
  ),

  // Files of records (K-25): photos of issues for now; other records use the same procedures.
  'attachments.list': proc(
    z.object({ entity: attachmentEntitySchema, entityId: idSchema }).strict(),
    z.array(attachmentViewSchema)
  ),
  'attachments.add': proc(attachmentUploadSchema, attachmentViewSchema),
  'attachments.read': proc(byId, z.object({ id: idSchema, mime: z.string(), dataBase64: z.string() })),
  'attachments.deleteFile': proc(byId, attachmentViewSchema)
} as const satisfies Record<string, Procedure>
