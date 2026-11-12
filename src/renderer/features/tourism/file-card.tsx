// Step 1: the month's KBS "EGM Konaklayan Listesi" (.xlsx) dropped or chosen, then what was read from it: rows,
// same-day stays, guests still in-house, the file's own period. Identity data is never read (privacy line).
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, FileSpreadsheetIcon, Loader2Icon, ShieldCheckIcon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { localDateOf } from '@shared/date'
import type { TourismImportView, TourismTableView } from '@shared/contract/tourism'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { fileProblem } from './derive'

export function StepBadge({ done }: { done: boolean }) {
  const { t } = useTranslation()
  // Small green text on grey is too faint: the word stays in the normal colour, the check mark is green.
  return done ? (
    <Badge variant="secondary" className="text-foreground gap-1">
      <CheckCircle2Icon className="text-success" aria-hidden />
      {t('tourism.step.done')}
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      {t('tourism.step.waiting')}
    </Badge>
  )
}

export function FileCard({
  current,
  table,
  monthLabel,
  editable,
  busy,
  onFile
}: {
  current: TourismImportView | undefined
  table: TourismTableView | undefined
  /** "Eylül 2026" inside a sentence. */
  monthLabel: string
  editable: boolean
  busy: boolean
  onFile: (file: File) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const take = (file: File | undefined): void => {
    if (!file) return
    const problem = fileProblem(file)
    if (problem) {
      toast.error(t(problem === 'wrongType' ? 'tourism.file.wrongType' : 'tourism.file.tooLarge'))
      return
    }
    onFile(file)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    if (editable && !busy) take(e.dataTransfer.files[0])
  }

  const facts = table
    ? [
        [t('tourism.preview.rows'), table.import.rowCount],
        [t('tourism.preview.sameDay'), table.issues.sameDay],
        [t('tourism.preview.inHouse'), table.inHouse.length]
      ]
    : []

  return (
    <SectionCard
      title={t('tourism.file.title')}
      icon={FileSpreadsheetIcon}
      action={<StepBadge done={!!current} />}
      testId="tourism-step-file"
    >
      <div className="grid gap-3">
        {current ? (
          <div className="bg-accent/60 grid gap-2 rounded-lg p-3" data-testid="tourism-file">
            <div className="flex items-start gap-3">
              <FileSpreadsheetIcon className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="min-w-0 text-sm">
                <p className="font-medium break-all">{current.fileName}</p>
                <p className="text-muted-foreground text-xs">
                  {t('tourism.preview.importedAt', {
                    date: f.date(localDateOf(new Date(current.importedAt)), 'medium'),
                    time: f.time(current.importedAt)
                  })}
                </p>
                {current.rangeFrom && current.rangeTo ? (
                  <p className="text-muted-foreground text-xs">
                    {t('tourism.preview.range', {
                      from: f.date(current.rangeFrom, 'short'),
                      to: f.date(current.rangeTo, 'short')
                    })}
                  </p>
                ) : null}
              </div>
            </div>
            {facts.length ? (
              <dl className="grid grid-cols-3 gap-2 text-sm" data-testid="tourism-preview">
                {facts.map(([label, value]) => (
                  <div key={label} className="bg-background/70 min-w-0 rounded-md px-2 py-1.5">
                    <dt className="text-muted-foreground text-xs break-words">{label}</dt>
                    <dd className="font-semibold tabular-nums">{f.number(Number(value))}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn(
            'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
            dragging && 'border-primary bg-accent'
          )}
          data-testid="kbs-drop"
          data-dragging={dragging || undefined}
          onDragOver={(e) => {
            if (!editable) return
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {busy ? (
            <Loader2Icon className="text-muted-foreground size-6 animate-spin" aria-hidden />
          ) : (
            <UploadIcon className="text-muted-foreground size-6" aria-hidden />
          )}
          <p className="text-sm font-medium" role={busy ? 'status' : undefined}>
            {busy ? t('tourism.file.reading') : current ? t('tourism.file.drop') : t('tourism.file.none')}
          </p>
          {!current && !busy ? (
            <p className="text-muted-foreground max-w-prose text-xs">
              {t('tourism.file.how', { month: monthLabel })}
            </p>
          ) : null}
          {editable ? (
            <>
              <input
                ref={input}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                data-testid="kbs-file"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  take(file)
                }}
              />
              <Button
                variant={current ? 'outline' : 'default'}
                disabled={busy}
                onClick={() => input.current?.click()}
                data-testid="kbs-pick"
              >
                <UploadIcon aria-hidden />
                {current ? t('tourism.file.again') : t('tourism.file.pick')}
              </Button>
            </>
          ) : null}
        </div>
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('tourism.file.privacy')}
        </p>
      </div>
    </SectionCard>
  )
}
