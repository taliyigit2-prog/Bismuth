// Attachments (K-25, arıza fotoğrafları, gider fişleri): JPEG/PNG/WebP/PDF up to 15 MB, at most 20 per record.
// Files are only listed here; the service stores them under userData/attachments with a sha256.
import { useId, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FileIcon, ImageIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const MAX_ATTACHMENTS = 20
const LIMITS = { maxMb: MAX_ATTACHMENT_BYTES / (1024 * 1024), max: MAX_ATTACHMENTS }
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export type AttachmentProblem = 'type' | 'size' | 'count'

/** Splits picked files into accepted ones and the first problem (a too-big or wrong-type file is skipped). */
export function checkAttachments(
  current: number,
  files: readonly { name: string; size: number; type: string }[]
): { accepted: number[]; problem: AttachmentProblem | null } {
  const accepted: number[] = []
  let problem: AttachmentProblem | null = null
  files.forEach((file, i) => {
    if (!ACCEPTED.includes(file.type)) problem ??= 'type'
    else if (file.size > MAX_ATTACHMENT_BYTES) problem ??= 'size'
    else if (current + accepted.length >= MAX_ATTACHMENTS) problem ??= 'count'
    else accepted.push(i)
  })
  return { accepted, problem }
}

export function AttachmentPicker({
  label,
  onFilesChange
}: {
  label: string
  /** The chosen files after every change (the screen uploads them when it saves). */
  onFilesChange?: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [problem, setProblem] = useState<AttachmentProblem | null>(null)
  const [over, setOver] = useState(false)
  const change = (next: File[]): void => {
    setFiles(next)
    onFilesChange?.(next)
  }
  const add = (list: FileList | null): void => {
    if (!list) return
    const picked = [...list]
    const result = checkAttachments(files.length, picked)
    change([...files, ...result.accepted.map((i) => picked[i]!)])
    setProblem(result.problem)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setOver(false)
    add(e.dataTransfer.files)
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium" id={`${id}-label`}>
        {label}
      </span>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center',
          over && 'border-primary bg-accent'
        )}
      >
        <PaperclipIcon className="text-muted-foreground size-5" aria-hidden />
        <p className="text-muted-foreground text-xs">{t('attachments.hint', LIMITS)}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          {t('attachments.choose')}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          aria-labelledby={`${id}-label`}
          className="sr-only"
          onChange={(e) => add(e.target.files)}
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
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
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
                  onClick={() => change(files.filter((_, j) => j !== i))}
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
