// Photos of a record (K-25): a lost item, a purchase receipt, a laundry slip. Picked before saving (PhotoPicker),
// sent after the record exists (useUploadPhotos), shown later as thumbnails (PhotoGallery). Big phone photos are
// shrunk here first: the one IPC channel carries at most 8 MB and the backups stay small. Files are stored by
// the attachments service under userData/attachments (never in the database).
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileIcon, ImageIcon, ImagePlusIcon, XIcon } from 'lucide-react'
import { PHOTO_MAX_BASE64 } from '@shared/contract/procedures/contacts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  checkAttachments,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  type AttachmentProblem
} from '@/components/attachment-picker'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import type { Transport } from '@/lib/transport'

export type PhotoTarget =
  | { kind: 'lostItem'; id: string }
  | { kind: 'expense'; id: string }
  | { kind: 'laundry_delivery'; id: string }

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
/** Longest side of a stored photo: a slip or a lost item stays readable, a phone photo drops to ~0,5 MB. */
const MAX_SIDE = 1600
const LIMITS = { maxMb: MAX_ATTACHMENT_BYTES / (1024 * 1024), max: MAX_ATTACHMENTS }

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** A JPEG no larger than MAX_SIDE; anything that cannot be redrawn (PDF, a test DOM) goes as it is. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= 1024 * 1024) return file
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    return file
  }
}

export async function photoPayload(
  file: File
): Promise<{ fileName: string; mime: string; dataBase64: string }> {
  const blob = await shrink(file)
  const dataBase64 = toBase64(new Uint8Array(await blob.arrayBuffer()))
  return { fileName: file.name, mime: blob.type || file.type, dataBase64 }
}

async function sendOne(transport: Transport, target: PhotoTarget, file: File): Promise<void> {
  const payload = await photoPayload(file)
  if (payload.dataBase64.length > PHOTO_MAX_BASE64) throw new Error('too big')
  if (target.kind === 'lostItem') await transport.call('lostItems.addPhoto', { id: target.id, ...payload })
  else await transport.call('supply.addPhoto', { entity: target.kind, id: target.id, ...payload })
}

const listKey = (target: PhotoTarget) =>
  target.kind === 'lostItem' ? (['lostItems.photos'] as const) : (['supply.photos'] as const)

/**
 * Sends picked files to a saved record. The record is already written, so a file that fails is reported and the
 * rest still go (the photo can be added again from the record).
 */
export function useUploadPhotos(): (target: PhotoTarget, files: readonly File[]) => Promise<void> {
  const transport = useTransport()
  const client = useQueryClient()
  const { t } = useTranslation()
  return async (target, files) => {
    if (!files.length) return
    let failed = 0
    for (const file of files) {
      try {
        await sendOne(transport, target, file)
      } catch {
        failed++
      }
    }
    await client.invalidateQueries({ queryKey: listKey(target) })
    if (failed) toast.error(t('photos.failed', { count: failed }))
  }
}

/** Files chosen in a form before the record is saved (JPEG, PNG, WebP or PDF). */
export function PhotoPicker({
  label,
  files,
  onChange
}: {
  label: string
  files: File[]
  onChange: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<AttachmentProblem | null>(null)
  const add = (list: FileList | null): void => {
    if (!list) return
    const picked = [...list]
    const result = checkAttachments(files.length, picked)
    onChange([...files, ...result.accepted.map((i) => picked[i]!)])
    setProblem(result.problem)
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <ImagePlusIcon aria-hidden />
          {t('photos.choose')}
        </Button>
        <span className="text-muted-foreground text-xs">{t('photos.hint')}</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          aria-labelledby={`${id}-label`}
          className="sr-only"
          data-testid="photo-input"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {problem ? (
        <p role="alert" className="text-destructive text-xs">
          {t(`attachments.problem.${problem}`, LIMITS)}
        </p>
      ) : null}
      {files.length ? (
        <ul className="grid gap-1.5">
          {files.map((file, i) => {
            const Icon = file.type.startsWith('image/') ? ImageIcon : FileIcon
            return (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t('attachments.size', { size: f.number(file.size / (1024 * 1024), 1) })}
                </span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('attachments.remove', { name: file.name })}
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                >
                  <XIcon />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function usePhotoList(target: PhotoTarget) {
  const lost = useApiQuery('lostItems.photos', { id: target.id }, { enabled: target.kind === 'lostItem' })
  const other = useApiQuery(
    'supply.photos',
    { entity: target.kind === 'lostItem' ? 'expense' : target.kind, id: target.id },
    { enabled: target.kind !== 'lostItem' }
  )
  return target.kind === 'lostItem' ? lost : other
}

function usePhotoData(target: PhotoTarget, id: string) {
  const lost = useApiQuery(
    'lostItems.readPhoto',
    { id },
    { enabled: target.kind === 'lostItem', staleTime: Infinity }
  )
  const other = useApiQuery(
    'supply.readPhoto',
    { id },
    { enabled: target.kind !== 'lostItem', staleTime: Infinity }
  )
  return target.kind === 'lostItem' ? lost : other
}

function Thumb({
  target,
  id,
  mime,
  index
}: {
  target: PhotoTarget
  id: string
  mime: string
  index: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isImage = mime.startsWith('image/')
  const data = usePhotoData(target, id)
  const src = data.data ? `data:${data.data.mime};base64,${data.data.dataBase64}` : null
  const label = t('photos.open', { n: index + 1 })
  if (!isImage)
    return (
      <span className="bg-muted text-muted-foreground grid size-20 place-items-center rounded-md border text-xs">
        <FileIcon className="size-5" aria-hidden />
        {t('photos.pdf')}
      </span>
    )
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className="focus-visible:ring-ring size-20 overflow-hidden rounded-md border outline-none focus-visible:ring-[3px]"
      >
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <Skeleton className="size-full" />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="sr-only">{t('photos.title')}</DialogDescription>
          </DialogHeader>
          {src ? <img src={src} alt="" className="max-h-[75dvh] w-full rounded-md object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The record's photos as thumbnails (a click opens one large); with `canAdd`, more can be added here. */
export function PhotoGallery({ target, canAdd }: { target: PhotoTarget; canAdd: boolean }) {
  const { t } = useTranslation()
  const list = usePhotoList(target)
  const upload = useUploadPhotos()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const photos = list.data ?? []
  const add = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return
    const picked = [...files]
    const result = checkAttachments(photos.length, picked)
    if (result.problem) toast.error(t(`attachments.problem.${result.problem}`, LIMITS))
    setBusy(true)
    await upload(
      target,
      result.accepted.map((i) => picked[i]!)
    )
    setBusy(false)
  }
  return (
    <div className="grid gap-2" data-testid="photo-gallery">
      {list.isPending ? (
        <Skeleton className="size-20" />
      ) : photos.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('photos.title')}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <Thumb target={target} id={p.id} mime={p.mime} index={i} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('photos.none')}</p>
      )}
      {canAdd ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlusIcon aria-hidden />
            {t('photos.add')}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED.join(',')}
            aria-label={t('photos.add')}
            className="sr-only"
            onChange={(e) => {
              void add(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
