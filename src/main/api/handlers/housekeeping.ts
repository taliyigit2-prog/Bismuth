// Handlers of procedures/housekeeping.ts (Faz 9): contract procedure → service call.
import type { housekeepingProcedures } from '@shared/contract/procedures/housekeeping'
import type { Services } from '../../services'
import type { AttachmentRow } from '../../services/attachments-service'
import type { HandlersFor } from '../app'

const attachmentView = (row: AttachmentRow) => ({
  id: row.id,
  entity: row.entity,
  entityId: row.entityId,
  mime: row.mime,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt,
  deletedAt: row.deletedAt
})

export const housekeepingHandlers = (
  services: Services
): HandlersFor<keyof typeof housekeepingProcedures> => ({
  'housekeeping.board': (ctx) => services.housekeeping.board(ctx),
  'housekeeping.setStatus': (ctx, input) => {
    const room = services.rooms.setHousekeepingStatus(ctx, input.roomId, input.status, input.note)
    return { id: room.id, hk: room.hkStatus, hkNote: room.hkNote, hkAt: room.hkStatusAt, block: room.block }
  },
  'housekeeping.setNote': (ctx, input) => {
    const room = services.rooms.setHousekeepingNote(ctx, input.roomId, input.note ?? null)
    return { id: room.id, hk: room.hkStatus, hkNote: room.hkNote, hkAt: room.hkStatusAt }
  },
  'housekeeping.openIssuesByRoom': (ctx) => services.housekeeping.openIssuesByRoom(ctx),

  'housekeeping.issues': (ctx, input) => services.roomIssues.list(ctx, input),
  'housekeeping.issue': (ctx, input) => services.roomIssues.get(ctx, input.id),
  'housekeeping.reportIssue': (ctx, input) => services.roomIssues.create(ctx, input),
  'housekeeping.updateIssue': (ctx, input) => services.roomIssues.update(ctx, input.id, input.patch),
  'housekeeping.planIssue': (ctx, { id, ...plan }) => services.roomIssues.plan(ctx, id, plan),
  'housekeeping.resolveIssue': (ctx, { id, ...resolution }) =>
    services.roomIssues.resolve(ctx, id, resolution),
  'housekeeping.reopenIssue': (ctx, input) => services.roomIssues.reopen(ctx, input.id, input.reason),

  'attachments.list': (ctx, input) =>
    services.attachments.list(ctx, input.entity, input.entityId).map(attachmentView),
  'attachments.add': (ctx, input) =>
    attachmentView(
      services.attachments.add(ctx, {
        entity: input.entity,
        entityId: input.entityId,
        fileName: input.fileName,
        mime: input.mime,
        bytes: new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
      })
    ),
  'attachments.read': (ctx, input) => {
    const { row, bytes } = services.attachments.read(ctx, input.id)
    return { id: row.id, mime: row.mime, dataBase64: Buffer.from(bytes).toString('base64') }
  },
  'attachments.deleteFile': (ctx, input) => attachmentView(services.attachments.deleteFile(ctx, input.id))
})
