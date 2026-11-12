// One issue (G-180): where, who reported it and when, the photos (from userData/attachments), its history, plan a
// day and who comes, resolve with a note (no cost field, S-76). Photos of a resolved issue are deleted after the
// hotel's retention days (K-25) or by hand; the text stays. Desktop: right sheet; phone: bottom sheet.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  BanIcon,
  CalendarCheckIcon,
  CheckCircle2Icon,
  FileIcon,
  ImageIcon,
  MegaphoneIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon
} from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import { isIssueStale, issueAgeDays } from '@shared/domain/housekeeping'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AttachmentPicker } from '@/components/attachment-picker'
import { DateInput } from '@/components/date-input'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { SeverityBadge, StatusBadge } from './issue-parts'
import { ISSUE_QUERIES, photoDeleteDay, useErrorText, usePlace, useWhen, type Issue } from './issue-utils'
import { useUploadIssuePhotos } from './use-issue-photos'

function PhotoThumb({ id, mime, n }: { id: string; mime: string; n: number }) {
  const { t } = useTranslation()
  const image = mime.startsWith('image/')
  const file = useApiQuery('attachments.read', { id }, { enabled: image, staleTime: Infinity })
  const label = t('issues.photoN', { n })
  if (!image)
    return (
      <span className="bg-muted text-muted-foreground grid aspect-square place-items-center rounded-lg border text-xs">
        <FileIcon className="size-6" aria-hidden />
        {label}
      </span>
    )
  if (!file.data) return <Skeleton className="aspect-square rounded-lg" aria-label={label} />
  return (
    <img
      src={`data:${file.data.mime};base64,${file.data.dataBase64}`}
      alt={label}
      className="aspect-square w-full rounded-lg border object-cover"
      data-testid="issue-photo"
    />
  )
}

function Photos({ issue }: { issue: Issue }) {
  const { t } = useTranslation()
  const files = useApiQuery('attachments.list', { entity: 'room_issue', entityId: issue.id })
  const kept = (files.data ?? []).filter((a) => !a.deletedAt)
  if (files.isPending && issue.photos)
    return <Skeleton className="h-24 w-full rounded-lg" aria-label={t('common.loading')} />
  if (!kept.length) return <p className="text-muted-foreground text-sm">{t('issues.sheet.noPhotos')}</p>
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t('issues.photos')}>
      {kept.map((a, i) => (
        <li key={a.id}>
          <PhotoThumb id={a.id} mime={a.mime} n={i + 1} />
        </li>
      ))}
    </ul>
  )
}

function History({ issue, today }: { issue: Issue; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const when = useWhen(today)
  const unknown = t('issues.sheet.someone')
  return (
    <ol className="grid gap-2 text-sm" aria-label={t('issues.sheet.history')}>
      <li className="flex items-start gap-2">
        <MegaphoneIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {t('issues.sheet.historyReported', {
            by: issue.reportedByName ?? unknown,
            when: when(issue.reportedAt)
          })}
        </span>
      </li>
      {issue.plannedDate ? (
        <li className="flex items-start gap-2">
          <CalendarCheckIcon className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {issue.assignedTo
              ? t('issues.sheet.historyPlannedWho', {
                  date: f.date(issue.plannedDate, 'full'),
                  who: issue.assignedTo
                })
              : t('issues.sheet.historyPlanned', { date: f.date(issue.plannedDate, 'full') })}
          </span>
        </li>
      ) : null}
      {/* Every solution and reopening (a reopened issue keeps the earlier solution and the reason). */}
      {issue.history.map((h) => (
        <li
          key={`${h.kind}-${h.at}`}
          className="flex items-start gap-2"
          data-testid={`issue-history-${h.kind}`}
        >
          {h.kind === 'resolved' ? (
            <CheckCircle2Icon className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <RotateCcwIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span className="grid gap-0.5">
            <span>
              {t(h.kind === 'resolved' ? 'issues.sheet.historyResolved' : 'issues.sheet.historyReopened', {
                by: h.byName ?? unknown,
                when: when(h.at)
              })}
            </span>
            {h.note ? <span className="text-muted-foreground break-words">{h.note}</span> : null}
          </span>
        </li>
      ))}
      {issue.resolvedAt && !issue.history.some((h) => h.kind === 'resolved') ? (
        <li className="flex items-start gap-2">
          <CheckCircle2Icon className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="grid gap-0.5">
            <span>
              {t('issues.sheet.historyResolved', {
                by: issue.resolvedByName ?? unknown,
                when: when(issue.resolvedAt)
              })}
            </span>
            {issue.resolutionNote ? (
              <span className="text-muted-foreground">{issue.resolutionNote}</span>
            ) : null}
          </span>
        </li>
      ) : null}
    </ol>
  )
}

export function IssueSheet({
  issue,
  today,
  onOpenChange
}: {
  issue: Issue | null
  today: LocalDate
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const settings = useSettings()
  const errorText = useErrorText()
  const upload = useUploadIssuePhotos()
  const retention = settings.data?.['attachments.resolvedIssueRetentionDays'] ?? 30
  const when = useWhen(today)
  const place = usePlace()
  const [planDay, setPlanDay] = useState<LocalDate>(addDays(today, 1))
  const [planWho, setPlanWho] = useState('')
  const [note, setNote] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [pickerKey, setPickerKey] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const plan = useApiMutation('housekeeping.planIssue', { invalidates: ISSUE_QUERIES })
  const resolve = useApiMutation('housekeeping.resolveIssue', { invalidates: ISSUE_QUERIES })
  const files = useApiQuery(
    'attachments.list',
    { entity: 'room_issue', entityId: issue?.id ?? '-' },
    { enabled: !!issue && issue.status === 'resolved' }
  )
  const deleteFile = useApiMutation('attachments.deleteFile', { invalidates: ISSUE_QUERIES })
  const edit = can('room_issues', 'edit')

  const change = (open: boolean): void => {
    if (!open) {
      setPlanWho('')
      setNote('')
      setNewFiles([])
      setPickerKey((k) => k + 1)
      setPlanDay(addDays(today, 1))
    }
    onOpenChange(open)
  }
  const failed = (error: unknown): void => void toast.error(errorText(error))

  const savePlan = (): void => {
    if (!issue) return
    plan.mutate(
      { id: issue.id, plannedDate: planDay, assignedTo: planWho.trim() || null },
      {
        onSuccess: () => toast.success(t('issues.sheet.plannedToast', { date: f.dayMonth(planDay) })),
        onError: failed
      }
    )
  }
  const saveResolve = (): void => {
    if (!issue) return
    resolve.mutate(
      { id: issue.id, resolutionNote: note.trim() || null },
      {
        onSuccess: (done) => {
          toast.success(t('issues.sheet.resolvedToast'))
          if (issue.block && !done.block) toast.info(t('issues.sheet.unblockedToast'))
          change(false)
        },
        onError: failed
      }
    )
  }
  const uploadNew = async (): Promise<void> => {
    if (!issue || !newFiles.length) return
    setUploading(true)
    const result = await upload(issue.id, newFiles)
    setUploading(false)
    setNewFiles([])
    setPickerKey((k) => k + 1)
    if (result.error) toast.error(errorText(result.error))
    else toast.success(t('issues.sheet.photosAdded', { count: result.added }))
  }
  const deleteAll = async (): Promise<void> => {
    const kept = (files.data ?? []).filter((a) => !a.deletedAt)
    try {
      for (const a of kept) await deleteFile.mutateAsync({ id: a.id })
      toast.success(t('issues.sheet.photosDeleted'))
    } catch (error) {
      failed(error)
    }
  }

  const stale = issue ? isIssueStale(issue, today) : false

  return (
    <Sheet open={!!issue} onOpenChange={change}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-lg'
        )}
        data-testid="issue-sheet"
      >
        {issue ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <SheetTitle className="pe-8 text-lg">{issue.title}</SheetTitle>
              <SheetDescription>
                {t('issues.sheet.reported', {
                  place: place(issue),
                  by: issue.reportedByName ?? t('issues.sheet.someone'),
                  when: when(issue.reportedAt)
                })}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={issue.severity} />
                <StatusBadge status={issue.status} />
                {stale ? (
                  <Badge variant="destructive">
                    {t('issues.age', { count: issueAgeDays(issue.reportedAt, today) })}
                  </Badge>
                ) : null}
              </div>
            </SheetHeader>

            <div className="grid gap-5 p-4">
              {issue.blocksRoom && issue.status !== 'resolved' ? (
                <Alert variant="destructive">
                  <BanIcon />
                  <AlertTitle>{t('issues.sheet.blockedTitle')}</AlertTitle>
                  <AlertDescription>
                    {issue.block
                      ? t('issues.sheet.blockedRange', {
                          from: f.dayMonth(issue.block.dateFrom),
                          to: f.dayMonth(issue.block.dateTo),
                          reason: issue.block.reason
                        })
                      : t('issues.sheet.blockedNone')}
                  </AlertDescription>
                </Alert>
              ) : null}

              <section className="grid gap-1.5" aria-labelledby="issue-detail">
                <h3 id="issue-detail" className="text-sm font-semibold">
                  {t('issues.new.detail')}
                </h3>
                <p
                  className={cn(
                    'text-sm break-words whitespace-pre-line',
                    !issue.description && 'text-muted-foreground'
                  )}
                >
                  {issue.description || t('issues.sheet.noDetail')}
                </p>
              </section>

              <section className="grid gap-2" aria-labelledby="issue-photos">
                <h3 id="issue-photos" className="flex items-center gap-2 text-sm font-semibold">
                  <ImageIcon className="text-muted-foreground size-4" aria-hidden />
                  {t('issues.photosCount', { count: issue.photos })}
                </h3>
                <Photos issue={issue} />
                {issue.status === 'resolved' && issue.resolvedAt && issue.photos ? (
                  <div className="bg-muted/50 grid gap-2 rounded-lg p-3">
                    <p className="text-sm">
                      {t('issues.sheet.photosDeleteOn', {
                        date: f.date(photoDeleteDay(issue.resolvedAt, retention), 'full'),
                        count: retention
                      })}
                    </p>
                    {edit ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => setConfirmDelete(true)}
                        disabled={deleteFile.isPending}
                      >
                        <Trash2Icon aria-hidden />
                        {t('issues.sheet.deletePhotosNow')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {issue.status !== 'resolved' && edit ? (
                  <div className="grid gap-2">
                    <AttachmentPicker
                      key={pickerKey}
                      label={t('issues.sheet.addPhotos')}
                      onFilesChange={setNewFiles}
                    />
                    {newFiles.length ? (
                      <Button
                        variant="outline"
                        className="justify-self-start"
                        onClick={() => void uploadNew()}
                        disabled={uploading}
                      >
                        <UploadIcon aria-hidden />
                        {t('issues.sheet.uploadPhotos', { count: newFiles.length })}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <Separator />
              <section className="grid gap-2" aria-labelledby="issue-history">
                <h3 id="issue-history" className="text-sm font-semibold">
                  {t('issues.sheet.history')}
                </h3>
                <History issue={issue} today={today} />
              </section>

              {issue.status !== 'resolved' && edit ? (
                <>
                  <Separator />
                  {/* A form: Enter in the "who" field saves the plan (.claude/rules/ui.md). */}
                  <form
                    className="grid gap-3"
                    aria-labelledby="issue-plan"
                    onSubmit={(e) => {
                      e.preventDefault()
                      savePlan()
                    }}
                  >
                    <h3 id="issue-plan" className="text-sm font-semibold">
                      {t('issues.sheet.planTitle')}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DateInput
                        label={t('issues.sheet.planDay')}
                        value={planDay}
                        onChange={setPlanDay}
                        min={today}
                      />
                      <div className="grid gap-1.5">
                        <Label htmlFor="issue-plan-who">{t('issues.sheet.planWho')}</Label>
                        <Input
                          id="issue-plan-who"
                          value={planWho}
                          maxLength={120}
                          onChange={(e) => setPlanWho(e.target.value)}
                          placeholder={t('issues.sheet.planWhoPlaceholder')}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="justify-self-start"
                      disabled={plan.isPending}
                    >
                      <CalendarCheckIcon aria-hidden />
                      {t('issues.sheet.plan')}
                    </Button>
                  </form>
                  <Separator />
                  <section className="grid gap-3" aria-labelledby="issue-resolve">
                    <h3 id="issue-resolve" className="text-sm font-semibold">
                      {t('issues.sheet.resolveTitle')}
                    </h3>
                    <div className="grid gap-1.5">
                      <Label htmlFor="issue-resolve-note">{t('issues.sheet.resolveNote')}</Label>
                      <Textarea
                        id="issue-resolve-note"
                        rows={2}
                        maxLength={2000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t('issues.sheet.resolveNotePlaceholder')}
                      />
                      <p className="text-muted-foreground text-xs">{t('issues.sheet.costHint')}</p>
                    </div>
                    <Button
                      className="justify-self-start"
                      onClick={saveResolve}
                      disabled={resolve.isPending}
                      data-testid="issue-resolve"
                    >
                      <CheckCircle2Icon aria-hidden />
                      {t('issues.sheet.resolve')}
                    </Button>
                  </section>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('issues.sheet.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('issues.sheet.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteAll()}>
              {t('issues.sheet.deletePhotosNow')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
