// Photo upload for issues (K-25): a phone photo is several MB, so the screen shrinks it to 1600 px on the long side
// (JPEG) before sending — the call stays small over Wi-Fi and inside the 8 MB envelope; the main process shrinks
// again and drops the metadata. PDFs and anything the browser cannot draw go as they are.
import type { AttachmentMime } from '@shared/contract/supply'
import type { AttachmentUpload } from '@shared/contract/procedures/housekeeping'

export const MAX_PHOTO_SIDE = 1600
const JPEG_QUALITY = 0.82
const SHRINKABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** "data:…;base64,AAAA" → "AAAA". */
function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** The photo drawn at most MAX_PHOTO_SIDE wide/high as JPEG; null when this browser cannot (tests, old WebViews). */
async function shrink(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const g = canvas.getContext('2d')
    if (!g) return null
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  } catch {
    return null
  }
}

/** What `attachments.add` needs for one picked file of a record. */
export async function toUpload(
  file: File,
  entity: AttachmentUpload['entity'],
  entityId: string
): Promise<AttachmentUpload> {
  const small = SHRINKABLE.has(file.type) ? await shrink(file) : null
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return small
    ? { entity, entityId, fileName: `${base}.jpg`, mime: 'image/jpeg', dataBase64: await readBase64(small) }
    : {
        entity,
        entityId,
        fileName: file.name || 'file',
        mime: file.type as AttachmentMime,
        dataBase64: await readBase64(file)
      }
}
