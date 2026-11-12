// Photos of the Faz 12 records (lost items, purchase receipts, laundry slips) over the JSON contract: the bytes
// travel as base64 and are stored by the attachments service (userData/attachments, sha256; K-25).
import type { AttachmentEntity } from '@shared/contract/supply'
import type { Services } from '../../services'
import type { Ctx } from '../../services/context'
import { notFound } from '../../services/kit'

export interface PhotoUpload {
  id: string
  fileName: string
  mime: string
  dataBase64: string
}

export const photoHandlers = (services: Services) => ({
  add: (ctx: Ctx, entity: AttachmentEntity, input: PhotoUpload) =>
    services.attachments.add(ctx, {
      entity,
      entityId: input.id,
      fileName: input.fileName,
      mime: input.mime,
      bytes: new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
    }),
  list: (ctx: Ctx, entity: AttachmentEntity, id: string) =>
    services.attachments.list(ctx, entity, id).filter((a) => !a.deletedAt),
  /** Reads one file; only of the given record kinds (another module's files stay behind their own procedures). */
  read: (ctx: Ctx, entities: readonly AttachmentEntity[], id: string) => {
    const { row, bytes } = services.attachments.read(ctx, id)
    if (!entities.includes(row.entity)) throw notFound('attachment', id)
    return { id: row.id, mime: row.mime, dataBase64: Buffer.from(bytes).toString('base64') }
  }
})
