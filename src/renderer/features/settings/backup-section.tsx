// Ayarlar → Yedek (faz-14; G-120…G-123, K-05, K-32, S-42): how the backups stand (last, next, Drive), a backup now,
// the list of copies (here, encrypted in Drive, from before program updates) with check and restore, the data
// folder with "Klasörü aç", the Bismuth key on paper, the backup settings, and the doors to export and import.
// Restoring asks first, takes a safety backup, and happens when the program starts again.
// K-45 (3): showing, typing or changing the Bismuth key, restoring and choosing the Drive folder happen only in the
// hotel computer's own window (the services refuse them from a phone or another computer); the folder only with
// the system's folder dialog.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArchiveRestoreIcon,
  CloudIcon,
  DatabaseBackupIcon,
  DownloadIcon,
  FolderOpenIcon,
  HardDriveIcon,
  KeyRoundIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  UploadIcon
} from 'lucide-react'
import type { BackupItem, BackupOverview, BackupSource } from '@shared/contract/backup'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { localDateOf } from '@shared/date'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { FieldError } from '@/components/field-error'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { EmptyState } from '@/components/states'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { numberInLimits, useRangeText } from '@/lib/form-errors'
import { useCan } from '@/lib/view-as'
import { useRemoteLink } from '@/components/connection-status'
import { ExportDialog } from '../data-transfer/export-dialog'
import { ImportBatches } from '../data-transfer/import-batches'
import { ImportWizard } from '../data-transfer/import-wizard'
import { KeyQr } from './key-sheet'

type Props = {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}

const INVALIDATES = ['backup.overview', 'backup.status'] as const
const FOLDER = { data: 'data', backups: 'backups', drive: 'drive' } as const

function useErrorToast() {
  const { t } = useTranslation()
  return (title: string) => (error: { messageKey: string }) =>
    toast.error(title, {
      description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
    })
}

function useBytes() {
  const f = useFormat()
  const { t } = useTranslation()
  return (bytes: number): string =>
    bytes >= 1024 * 1024
      ? t('backup.size.mb', { value: f.number(bytes / (1024 * 1024), 1) })
      : t('backup.size.kb', { value: f.number(Math.max(1, Math.round(bytes / 1024))) })
}

function useWhen() {
  const f = useFormat()
  const { t } = useTranslation()
  return (iso: string | null): string => {
    if (!iso) return t('backup.never')
    const day = localDateOf(new Date(iso))
    return t('backup.when', { date: f.date(day, 'medium'), time: f.time(iso) })
  }
}

function PathLine({ label, path, children }: { label: string; path: string; children?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code dir="ltr" className="bg-muted min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs break-all">
          {path}
        </code>
        {children}
      </div>
    </div>
  )
}

function StatusCard({ data, canEdit }: { data: BackupOverview; canEdit: boolean }) {
  const { t } = useTranslation()
  // N-9: a planned restore is cancelled (or its failure seen) in the hotel computer's own window only.
  const remote = useRemoteLink()
  const when = useWhen()
  const onError = useErrorToast()
  const run = useApiMutation('backup.run', {
    invalidates: INVALIDATES,
    onSuccess: () => toast.success(t('backup.runDone')),
    onError: onError(t('backup.runFailed'))
  })
  const restart = useApiMutation('backup.restart', { onError: onError(t('backup.restartFailed')) })
  const cancel = useApiMutation('backup.cancelRestore', {
    invalidates: INVALIDATES,
    onSuccess: () => {
      // "Tamam" on a failed restore only puts the box away; no toast for that.
      if (data.pendingRestore) toast.success(t('backup.restoreCancelled'))
    }
  })
  const { status } = data
  // The failed restore has its own box above (with "Tamam").
  const warnings = status.warnings.filter((w) => w !== 'restoreFailed' || !data.restoreFailed)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackupIcon className="text-muted-foreground size-4" aria-hidden />
          {t('backup.statusTitle')}
        </CardTitle>
        <CardDescription className="max-w-prose">{t('backup.statusHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.pendingRestore ? (
          <Alert data-testid="restore-pending">
            <ArchiveRestoreIcon aria-hidden />
            <AlertTitle>{t('backup.pendingTitle')}</AlertTitle>
            <AlertDescription>
              <p>{t('backup.pendingBody', { name: data.pendingRestore.id })}</p>
              {canEdit && remote ? <p>{t('backup.restoreDesktopOnly')}</p> : null}
              {canEdit && !remote ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.canOpenFolders ? (
                    <Button size="sm" onClick={() => restart.mutate({})} disabled={restart.isPending}>
                      <RotateCcwIcon aria-hidden />
                      {t('backup.restartNow')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => cancel.mutate({})}
                    disabled={cancel.isPending}
                  >
                    {t('backup.cancelRestore')}
                  </Button>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {data.restoreFailed ? (
          <Alert variant="destructive" data-testid="restore-failed">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>{t('backup.failedTitle')}</AlertTitle>
            <AlertDescription>
              <p>
                {data.restoreFailed.id
                  ? t('backup.failedBody', {
                      name: data.restoreFailed.id,
                      reason: t(`backup.failedReason.${data.restoreFailed.reason}`)
                    })
                  : t('backup.failedUnknown', {
                      reason: t(`backup.failedReason.${data.restoreFailed.reason}`)
                    })}
              </p>
              {canEdit && remote ? <p>{t('backup.restoreDesktopOnly')}</p> : null}
              {canEdit && !remote ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => cancel.mutate({})}
                  disabled={cancel.isPending}
                  data-testid="restore-failed-ok"
                >
                  {t('backup.failedOk')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-3" data-testid="backup-status">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t('backup.last')}</dt>
            <dd className="font-medium">{when(status.lastBackupAt)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t('backup.next')}</dt>
            <dd className="font-medium">
              {status.running
                ? t('backup.running')
                : status.nextAutoAt
                  ? when(status.nextAutoAt)
                  : t('backup.nextSoon')}
            </dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground text-xs">{t('backup.drive')}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium">
              <Badge
                variant={status.drive.state === 'ok' ? 'secondary' : 'destructive'}
                data-testid="drive-state"
              >
                {t(`backup.driveState.${status.drive.state}`)}
              </Badge>
              {status.drive.lastAt ? (
                <span className="text-muted-foreground text-xs">{when(status.drive.lastAt)}</span>
              ) : null}
            </dd>
          </div>
        </dl>
        {warnings.length ? (
          <ul className="grid gap-1">
            {warnings.map((w) => (
              <li key={w} className="text-destructive flex items-start gap-2 text-sm">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {w === 'stale' && !status.lastBackupAt ? t('backup.warning.none') : t(`backup.warning.${w}`)}
              </li>
            ))}
          </ul>
        ) : null}
        {data.lastError ? (
          <p className="text-destructive text-sm">
            {t(data.lastError as 'errors.internal', { defaultValue: t('errors.internal') })}
          </p>
        ) : null}
        {canEdit ? (
          <div>
            <Button
              onClick={() => run.mutate({})}
              disabled={run.isPending || status.running}
              className="max-md:w-full"
              data-testid="backup-run"
            >
              <DatabaseBackupIcon aria-hidden />
              {run.isPending ? t('backup.running') : t('backup.runNow')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RestoreDialog({
  item,
  hasKey,
  onClose
}: {
  item: BackupItem | null
  /** This computer holds a Bismuth key (it may still differ from the one of an older Drive copy). */
  hasKey: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const when = useWhen()
  const onError = useErrorToast()
  const [text, setText] = useState('')
  const [askReplace, setAskReplace] = useState(false)
  const askKey = item?.source === 'drive'
  const needsKey = askKey && !hasKey
  const failed = onError(t('backup.restoreFailed'))
  const restore = useApiMutation('backup.restore', {
    invalidates: INVALIDATES,
    onSuccess: () => {
      toast.success(t('backup.restoreScheduled'))
      setText('')
      setAskReplace(false)
      onClose()
    },
    // The paper's key opens the copy but this computer keeps another one: ask before changing it (Faz 11/14 #7).
    onError: (error) => (error.messageKey === 'errors.backupKeyExists' ? setAskReplace(true) : failed(error))
  })
  const start = (replace: boolean): void => {
    if (item)
      restore.mutate({
        source: item.source,
        id: item.id,
        ...(askKey && text.trim() ? { recoveryText: text.trim() } : {}),
        ...(replace ? { replace } : {})
      })
  }
  return (
    <>
      <AlertDialog open={item !== null && !askReplace} onOpenChange={(open) => (open ? null : onClose())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backup.restoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {item ? t('backup.restoreBody', { when: when(item.createdAt) }) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {item && askKey ? (
            <div className="grid gap-1.5">
              <Label htmlFor="restore-key">{t('backup.keyInput')}</Label>
              <Input
                id="restore-key"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="font-mono max-md:text-base"
              />
              <p className="text-muted-foreground text-xs">
                {t(needsKey ? 'backup.keyInputHelp' : 'backup.keyInputOptional')}
              </p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending || (needsKey && text.trim().length < 20)}
              onClick={(e) => {
                e.preventDefault()
                start(false)
              }}
              data-testid="restore-confirm"
            >
              {restore.isPending ? t('backup.restoring') : t('backup.restoreAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={item !== null && askReplace}
        onOpenChange={(open) => {
          if (!open) setAskReplace(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('backup.keyReplaceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('backup.keyReplaceBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(e) => {
                e.preventDefault()
                start(true)
              }}
              data-testid="restore-key-replace"
            >
              {t('backup.keyReplaceConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const SOURCE_ICON: Record<BackupSource, typeof HardDriveIcon> = {
  local: HardDriveIcon,
  drive: CloudIcon,
  preMigration: ArchiveRestoreIcon
}

function ListCard({ data, canEdit }: { data: BackupOverview; canEdit: boolean }) {
  const { t } = useTranslation()
  // Restoring replaces all the hotel's data: the hotel computer's own window only (K-45 (3)).
  const canRestore = !useRemoteLink()
  const when = useWhen()
  const bytes = useBytes()
  const onError = useErrorToast()
  const [restoring, setRestoring] = useState<BackupItem | null>(null)
  const verify = useApiMutation('backup.verify', {
    invalidates: ['backup.overview'],
    onSuccess: (item) =>
      item.verified ? toast.success(t('backup.verifyOk')) : toast.error(t('backup.verifyBad')),
    onError: onError(t('backup.verifyFailed'))
  })
  const items = data.items.slice(0, 60)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backup.listTitle')}</CardTitle>
        <CardDescription className="max-w-prose">{t('backup.listHelp')}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={DatabaseBackupIcon}
            title={t('backup.emptyTitle')}
            body={t('backup.emptyBody')}
          />
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="backup-list">
            {items.map((item) => {
              const Icon = SOURCE_ICON[item.source]
              return (
                <li
                  key={`${item.source}:${item.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                  data-testid="backup-item"
                >
                  <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm font-medium">{when(item.createdAt)}</span>
                    <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                      <span>{t(`backup.kind.${item.kind}`)}</span>
                      <span>{t(`backup.source.${item.source}`)}</span>
                      <span className="tabular-nums">{bytes(item.sizeBytes)}</span>
                      {item.verified === false ? (
                        <span className="text-destructive">{t('backup.damaged')}</span>
                      ) : null}
                    </span>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2 max-md:w-full">
                      {item.source !== 'preMigration' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="max-md:flex-1"
                          onClick={() => verify.mutate({ source: item.source, id: item.id })}
                          disabled={verify.isPending}
                        >
                          <ShieldCheckIcon aria-hidden />
                          {t('backup.verify')}
                        </Button>
                      ) : null}
                      {canRestore ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="max-md:flex-1"
                          onClick={() => setRestoring(item)}
                          data-testid="backup-restore"
                        >
                          <ArchiveRestoreIcon aria-hidden />
                          {t('backup.restore')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        <RestoreDialog item={restoring} hasKey={data.key.exists} onClose={() => setRestoring(null)} />
      </CardContent>
    </Card>
  )
}

function FolderCard({ data }: { data: BackupOverview }) {
  const { t } = useTranslation()
  // N-9: over the network the folders' paths are not sent; the sizes are.
  const remote = useRemoteLink()
  const bytes = useBytes()
  const onError = useErrorToast()
  const open = useApiMutation('backup.openFolder', { onError: onError(t('backup.openFailed')) })
  const button = (which: 'data' | 'backups' | 'drive') =>
    data.canOpenFolders ? (
      <Button
        size="sm"
        variant="outline"
        onClick={() => open.mutate({ which })}
        data-testid={`open-${which}`}
      >
        <FolderOpenIcon aria-hidden />
        {t('backup.openFolder')}
      </Button>
    ) : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backup.folderTitle')}</CardTitle>
        <CardDescription className="max-w-prose">
          {t('backup.folderSizes', { db: bytes(data.dbBytes), files: bytes(data.attachmentsBytes) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {remote ? (
          <p className="text-muted-foreground text-sm" data-testid="folders-desktop-only">
            {t('backup.foldersDesktopOnly')}
          </p>
        ) : null}
        {data.dataDir ? (
          <PathLine label={t('backup.dataDir')} path={data.dataDir}>
            {button(FOLDER.data)}
          </PathLine>
        ) : null}
        {data.backupsDir ? (
          <PathLine label={t('backup.backupsDir')} path={data.backupsDir}>
            {button(FOLDER.backups)}
          </PathLine>
        ) : null}
        {remote ? null : data.driveDir ? (
          <PathLine label={t('backup.driveDir')} path={data.driveDir}>
            {button(FOLDER.drive)}
          </PathLine>
        ) : (
          <p className="text-muted-foreground text-sm">{t('backup.driveMissing')}</p>
        )}
      </CardContent>
    </Card>
  )
}

function KeyCard({ data }: { data: BackupOverview }) {
  const { t } = useTranslation()
  const when = useWhen()
  const onError = useErrorToast()
  const [shown, setShown] = useState<string | null>(null)
  const [entering, setEntering] = useState(false)
  const [askReplace, setAskReplace] = useState(false)
  const [text, setText] = useState('')
  // The key opens every copy: shown, typed or changed only in the hotel computer's own window (K-45 (3)).
  const remote = useRemoteLink()
  const show = useApiMutation('backup.recoveryText', {
    invalidates: ['backup.overview'],
    onSuccess: (r) => setShown(r.text),
    onError: onError(t('backup.keyFailed'))
  })
  const failed = onError(t('backup.keyFailed'))
  const set = useApiMutation('backup.setRecoveryText', {
    invalidates: INVALIDATES,
    onSuccess: () => {
      toast.success(t('backup.keySaved'))
      setEntering(false)
      setAskReplace(false)
      setText('')
    },
    // This computer made a key of its own before the paper was typed in: ask before changing it (P16d).
    onError: (error) => (error.messageKey === 'errors.backupKeyExists' ? setAskReplace(true) : failed(error))
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="text-muted-foreground size-4" aria-hidden />
          {t('backup.keyTitle')}
        </CardTitle>
        <CardDescription className="max-w-prose">{t('backup.keyHelp')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm">
          {!data.key.available
            ? t('backup.keyUnavailable')
            : data.key.exists
              ? t('backup.keyMade', { when: when(data.key.createdAt) })
              : t('backup.keyNotYet')}
        </p>
        {remote ? (
          <p className="text-muted-foreground text-sm" data-testid="key-desktop-only">
            {t('backup.keyDesktopOnly')}
          </p>
        ) : data.key.available ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => show.mutate({})}
              disabled={show.isPending}
              className="max-md:w-full"
            >
              <KeyRoundIcon aria-hidden />
              {t('backup.keyShow')}
            </Button>
            {/* Also when this computer made a key of its own: the paper's key replaces it after a question. */}
            <Button
              variant="outline"
              onClick={() => setEntering(true)}
              className="max-md:w-full"
              data-testid="key-enter"
            >
              {t('backup.keyEnter')}
            </Button>
          </div>
        ) : null}
        <ResponsiveDialog
          open={shown !== null}
          onOpenChange={(open) => (open ? null : setShown(null))}
          title={t('backup.keyTitle')}
          description={t('backup.keyPaper')}
          footer={<Button onClick={() => setShown(null)}>{t('common.close')}</Button>}
        >
          <div className="grid gap-3">
            <code
              dir="ltr"
              className="bg-muted rounded-lg p-3 text-center font-mono text-base leading-relaxed tracking-wider break-words"
              data-testid="recovery-text"
            >
              {shown}
            </code>
            {shown ? (
              <div>
                <CopyButton text={shown} label={t('common.copy')} />
              </div>
            ) : null}
            {shown ? <KeyQr text={shown} /> : null}
          </div>
        </ResponsiveDialog>
        <ResponsiveDialog
          open={entering}
          onOpenChange={setEntering}
          title={t('backup.keyEnter')}
          description={t('backup.keyEnterHelp')}
          footer={
            <>
              <Button variant="outline" onClick={() => setEntering(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => set.mutate({ text })}
                disabled={set.isPending || text.trim().length < 20}
              >
                {t('common.save')}
              </Button>
            </>
          }
        >
          <form
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim().length >= 20) set.mutate({ text })
            }}
          >
            <Label htmlFor="key-text">{t('backup.keyInput')}</Label>
            <Input
              id="key-text"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono max-md:text-base"
            />
          </form>
        </ResponsiveDialog>
        <AlertDialog open={askReplace} onOpenChange={setAskReplace}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('backup.keyReplaceTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('backup.keyReplaceBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => set.mutate({ text, replace: true })}
                data-testid="key-replace"
              >
                {t('backup.keyReplaceConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function SettingsCard({ values, onSave, canEdit }: Props & { canEdit: boolean }) {
  const { t } = useTranslation()
  const onError = useErrorToast()
  // The Drive folder: only the system's folder dialog of the hotel computer's own window (K-45 (3)).
  const local = !useRemoteLink()
  const pick = useApiMutation('backup.pickDriveFolder', {
    invalidates: [...INVALIDATES, 'settings.get'],
    onError: onError(t('backup.driveFolderFailed'))
  })
  const [draft, setDraft] = useState({
    time: values['backup.autoTime'],
    keep: String(values['backup.keepDays']),
    pre: String(values['backup.preMigrationKeep'])
  })
  const rangeText = useRangeText()
  const keepLimits = { min: 1, max: 365, integer: true }
  const preLimits = { min: 1, max: 100, integer: true }
  const keep = Number(draft.keep)
  const pre = Number(draft.pre)
  // What is wrong is said under the field (H-36); the button stays pressable and shows it on submit.
  const timeBad = !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)
  const keepBad = !numberInLimits(draft.keep, keepLimits)
  const preBad = !numberInLimits(draft.pre, preLimits)
  const valid = !timeBad && !keepBad && !preBad
  const [shown, setShown] = useState(false)
  const save = (): void => {
    if (!valid) {
      setShown(true)
      return
    }
    onSave(
      {
        'backup.autoTime': draft.time,
        'backup.keepDays': keep,
        'backup.preMigrationKeep': pre
      },
      true
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backup.settingsTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <div className="grid content-start gap-1.5">
            <Label htmlFor="backup-time">{t('backup.autoTime')}</Label>
            <TimeInput
              id="backup-time"
              value={draft.time}
              disabled={!canEdit}
              onChange={(v) => setDraft((d) => ({ ...d, time: v }))}
              aria-invalid={(shown && timeBad) || undefined}
              aria-describedby={shown && timeBad ? 'backup-time-error' : undefined}
              className="max-md:text-base"
            />
            <FieldError id="backup-time-error" message={shown && timeBad && t('backup.timeInvalid')} />
            <p className="text-muted-foreground text-xs">{t('backup.autoTimeHelp')}</p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="backup-keep">{t('backup.keepDays')}</Label>
            <Input
              id="backup-keep"
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={1}
              max={365}
              value={draft.keep}
              disabled={!canEdit}
              onChange={(e) => setDraft((d) => ({ ...d, keep: e.target.value }))}
              aria-invalid={(shown && keepBad) || undefined}
              aria-describedby={shown && keepBad ? 'backup-keep-error' : undefined}
              className="max-md:text-base"
            />
            <FieldError id="backup-keep-error" message={shown && keepBad && rangeText(keepLimits)} />
            <p className="text-muted-foreground text-xs">{t('backup.keepDaysHelp')}</p>
          </div>
          <div className="grid content-start gap-1.5 md:col-span-2">
            <span className="text-sm leading-none font-medium" id="backup-drive-label">
              {t('backup.driveFolder')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code
                dir="ltr"
                aria-labelledby="backup-drive-label"
                className="bg-muted min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs break-all"
                data-testid="backup-drive"
              >
                {values['backup.driveFolder'] || t('backup.driveFolderAuto')}
              </code>
              {canEdit && local ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pick.isPending}
                    onClick={() => pick.mutate({})}
                    data-testid="backup-drive-pick"
                  >
                    <FolderOpenIcon aria-hidden />
                    {t('backup.driveFolderPick')}
                  </Button>
                  {values['backup.driveFolder'] ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onSave({ 'backup.driveFolder': '' }, true)}
                      data-testid="backup-drive-auto"
                    >
                      {t('backup.driveFolderReset')}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {local ? t('backup.driveFolderHelp') : t('backup.driveFolderDesktopOnly')}
            </p>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="backup-pre">{t('backup.preMigrationKeep')}</Label>
            <Input
              id="backup-pre"
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={1}
              max={100}
              value={draft.pre}
              disabled={!canEdit}
              onChange={(e) => setDraft((d) => ({ ...d, pre: e.target.value }))}
              aria-invalid={(shown && preBad) || undefined}
              aria-describedby={shown && preBad ? 'backup-pre-error' : undefined}
              className="max-md:text-base"
            />
            <FieldError id="backup-pre-error" message={shown && preBad && rangeText(preLimits)} />
            <p className="text-muted-foreground text-xs">{t('backup.preMigrationKeepHelp')}</p>
          </div>
          {canEdit ? (
            <div className="flex items-end md:col-span-2">
              <Button type="submit" className="max-md:w-full">
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

function TransferCard({
  canExport,
  canImport,
  canSeeImports
}: {
  canExport: boolean
  canImport: boolean
  /** Earlier imports (P14fix #2): seen with the backup view right, cancelled with its edit right. */
  canSeeImports: boolean
}) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dataTransfer.title')}</CardTitle>
        <CardDescription className="max-w-prose">{t('dataTransfer.help')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          {canExport ? (
            <Button
              variant="outline"
              onClick={() => setExporting(true)}
              className="max-md:w-full"
              data-testid="open-export"
            >
              <DownloadIcon aria-hidden />
              {t('dataTransfer.export.open')}
            </Button>
          ) : null}
          {canImport ? (
            <Button
              variant="outline"
              onClick={() => setImporting(true)}
              className="max-md:w-full"
              data-testid="open-import"
            >
              <UploadIcon aria-hidden />
              {t('dataTransfer.import.open')}
            </Button>
          ) : null}
        </div>
        {canSeeImports ? <ImportBatches canCancel={canImport} /> : null}
        <ExportDialog open={exporting} onOpenChange={setExporting} />
        <ImportWizard open={importing} onOpenChange={setImporting} />
      </CardContent>
    </Card>
  )
}

export function BackupSection({ values, onSave }: Props) {
  const can = useCan()
  const canSee = can('settings.backup')
  const canEdit = can('settings.backup', 'edit')
  const canKey = canEdit && can('remote.settings', 'edit')
  const canExport = can('reports.export')
  const canImport = canEdit
  const overview = useApiQuery('backup.overview', {}, { enabled: canSee, refetchInterval: 30_000 })
  return (
    <div className="grid gap-6">
      {canSee ? (
        <QueryView query={overview}>
          {(data) => (
            <div className="grid gap-6">
              <StatusCard data={data} canEdit={canEdit} />
              <ListCard data={data} canEdit={canEdit} />
              <FolderCard data={data} />
              {canKey ? <KeyCard data={data} /> : null}
              <SettingsCard values={values} onSave={onSave} canEdit={canEdit} />
            </div>
          )}
        </QueryView>
      ) : null}
      {canExport || canImport ? (
        <TransferCard canExport={canExport} canImport={canImport} canSeeImports={canSee} />
      ) : null}
    </div>
  )
}
