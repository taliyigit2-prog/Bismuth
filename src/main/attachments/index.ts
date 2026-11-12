// Attachments under userData/attachments (photos of room issues, slips; K-25): the main process's image step
// (shrink to 1600 px on the long side and re-encode, which also drops the camera's location and other metadata)
// and the daily clean-up of photos of issues resolved longer ago than the hotel's retention days.
import { nativeImage } from 'electron'
import type { ProcessImage } from '../services/attachments-service'

/** Longest side of a stored photo (K-25). */
export const MAX_IMAGE_SIDE = 1600
const JPEG_QUALITY = 82

/**
 * JPEG and PNG are decoded, shrunk when larger than MAX_IMAGE_SIDE and written again in their own format (the
 * service names the file by the type it sniffed). Anything the decoder cannot read (WebP) is kept as it came.
 */
export const processImage: ProcessImage = (bytes, mime) => {
  if (mime !== 'image/jpeg' && mime !== 'image/png') return { bytes, width: null, height: null }
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) return { bytes, width: null, height: null }
  const size = image.getSize()
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(size.width, size.height))
  const out =
    scale < 1
      ? image.resize({
          width: Math.round(size.width * scale),
          height: Math.round(size.height * scale),
          quality: 'good'
        })
      : image
  const encoded = mime === 'image/png' ? out.toPNG() : out.toJPEG(JPEG_QUALITY)
  const final = out.getSize()
  return { bytes: new Uint8Array(encoded), width: final.width, height: final.height }
}

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Deletes the photos of issues resolved more than `attachments.resolvedIssueRetentionDays` ago, now and every six
 * hours while the program runs (the issue text stays). Errors are logged and never stop the program.
 */
export function startAttachmentRetention(
  purge: () => number,
  log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
): () => void {
  const run = (): void => {
    try {
      const removed = purge()
      if (removed) log.info('attachments: retention removed files', removed)
    } catch (error) {
      log.error('attachments: retention failed', error)
    }
  }
  run()
  const timer = setInterval(run, SIX_HOURS)
  timer.unref()
  return () => clearInterval(timer)
}
