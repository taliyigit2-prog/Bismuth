// Ayarlar → Uzaktan erişim on the owner's computer in client mode (faz-13 madde 3, 4, 5): the read-only copy of
// every record (how fresh it is, from where, whose view it shows), the Drive box it also reads (the folder and the
// Bismuth key typed in once from the owner's paper), and "Bu bilgisayarı ana bilgisayar yap" for the day the hotel's
// computer is gone. These are this computer's own procedures (src/main/server/client-app.ts): they work while the
// main computer is away too.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  ArchiveIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  ServerIcon
} from 'lucide-react'
import type { ReplicaStatus } from '@shared/contract/remote'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/field-error'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport/types'
import { PasswordInput } from '../auth/password-input'
import { errorText } from './use-admin'

const STATUS_KEY = ['remote.replicaStatus', {}] as const

function useWhen(): (iso: string | null | undefined) => string | null {
  const f = useFormat()
  return (iso) => {
    if (!iso) return null
    const day = localDateOf(new Date(iso))
    return day === localDateOf(new Date()) ? f.time(iso) : `${f.dayMonth(day)} ${f.time(iso)}`
  }
}

/** A client procedure that answers with the copy's new state: the card shows it at once. */
function useCopyAction() {
  const transport = useTransport()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  async function run<T>(fn: () => Promise<T>, after?: (value: T) => void): Promise<T | null> {
    setPending(true)
    try {
      const value = await fn()
      if (value && typeof value === 'object' && 'state' in value) queryClient.setQueryData(STATUS_KEY, value)
      after?.(value)
      return value
    } catch (error) {
      toast.error(errorText(t, error))
      return null
    } finally {
      setPending(false)
    }
  }
  return { transport, pending, run }
}

export function ReplicaCard() {
  const { t } = useTranslation()
  const status = useApiQuery('remote.replicaStatus', {}, { refetchInterval: 10_000 })
  const action = useCopyAction()
  return (
    <Card className="lg:col-span-2" data-testid="replica-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArchiveIcon className="text-muted-foreground size-4" aria-hidden />
          {t('settings.remote.copy.title')}
        </CardTitle>
        <CardDescription className="max-w-prose">{t('settings.remote.copy.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryView query={status}>
          {(s) => (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="grid content-start gap-3">
                <CopyState status={s} />
                <Button
                  variant="outline"
                  className="justify-self-start max-md:w-full"
                  disabled={action.pending || s.state === 'off'}
                  onClick={() => void action.run(() => action.transport.call('remote.replicaSync', {}))}
                  data-testid="replica-sync"
                >
                  <RefreshCwIcon aria-hidden />
                  {t('settings.remote.copy.syncNow')}
                </Button>
              </div>
              <BoxSettings status={s} />
              <Takeover status={s} />
            </div>
          )}
        </QueryView>
      </CardContent>
    </Card>
  )
}

function CopyState({ status }: { status: ReplicaStatus }) {
  const { t } = useTranslation()
  const when = useWhen()
  const time = when(status.asOf) ?? '—'
  const line =
    status.state === 'off'
      ? t('settings.remote.copy.state.off')
      : status.state === 'waiting'
        ? t('settings.remote.copy.state.waiting')
        : status.state === 'live'
          ? t('settings.remote.copy.state.live', { time })
          : status.state === 'relay'
            ? t('settings.remote.copy.state.relay', { time })
            : status.state === 'behind'
              ? t('settings.remote.copy.state.behind', { time })
              : status.state === 'needsUpdate'
                ? t('settings.remote.copy.state.needsUpdate')
                : t('settings.remote.copy.state.hostOlder')
  const good = status.state === 'live' || status.state === 'relay'
  return (
    <div className="grid gap-1 text-sm">
      <p
        className={good ? 'font-medium' : 'text-destructive font-medium'}
        data-testid="replica-state"
        data-state={status.state}
      >
        {line}
      </p>
      {status.userName ? (
        <p className="text-muted-foreground">
          {t('settings.remote.copy.forUser', { name: status.userName })}
        </p>
      ) : null}
      {status.serving ? (
        <p className="text-muted-foreground" data-testid="replica-serving">
          {t('settings.remote.copy.serving')}
        </p>
      ) : null}
    </div>
  )
}

function BoxSettings({ status }: { status: ReplicaStatus }) {
  const { t } = useTranslation()
  const when = useWhen()
  const action = useCopyAction()
  const [entering, setEntering] = useState(false)
  const box = status.box
  const problem =
    box.problem === 'noFolder'
      ? t('settings.remote.copy.box.noFolder')
      : box.problem === 'noKey'
        ? t('settings.remote.copy.box.noKey')
        : box.problem === 'wrongKey'
          ? t('settings.remote.copy.box.wrongKey')
          : box.problem === 'damaged'
            ? t('settings.remote.copy.box.damaged')
            : box.problem === 'empty'
              ? t('settings.remote.copy.box.empty')
              : null
  return (
    <div className="grid content-start gap-3 text-sm" data-testid="replica-box">
      <p className="font-medium">{t('settings.remote.copy.box.title')}</p>
      <p className="text-muted-foreground">{t('settings.remote.copy.box.help')}</p>
      {box.folder ? (
        <code dir="ltr" className="break-all" data-testid="replica-folder">
          {box.folder}
        </code>
      ) : null}
      {problem ? (
        <p className="text-destructive flex items-start gap-2" data-testid="replica-box-problem">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : box.lastReadAt ? (
        <p className="text-muted-foreground">
          {t('settings.remote.copy.box.lastRead', { time: when(box.lastReadAt) ?? '' })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="max-md:w-full"
          disabled={action.pending}
          onClick={() => void action.run(() => action.transport.call('remote.replicaPickFolder', {}))}
          data-testid="replica-pick-folder"
        >
          <FolderOpenIcon aria-hidden />
          {t('settings.remote.copy.box.pick')}
        </Button>
        {box.chosen ? (
          <Button
            variant="ghost"
            className="max-md:w-full"
            disabled={action.pending}
            onClick={() =>
              void action.run(() => action.transport.call('remote.replicaSetFolder', { folder: null }))
            }
          >
            {t('settings.remote.copy.box.auto')}
          </Button>
        ) : null}
      </div>
      <p className="flex items-start gap-2" data-testid="replica-key-state">
        <KeyRoundIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        {!status.key.available
          ? t('settings.remote.copy.key.unavailable')
          : status.key.exists
            ? t('settings.remote.copy.key.saved')
            : t('settings.remote.copy.key.missing')}
      </p>
      {status.key.available ? (
        <Button
          variant="outline"
          className="justify-self-start max-md:w-full"
          onClick={() => setEntering(true)}
          data-testid="replica-key-enter"
        >
          {status.key.exists ? t('settings.remote.copy.key.change') : t('backup.keyEnter')}
        </Button>
      ) : null}
      <KeyDialog open={entering} onOpenChange={setEntering} />
    </div>
  )
}

/** The key from the owner's paper (or the text a phone camera read from its QR code). */
/** The longest Bismuth key text the main computer accepts (the key and its separators). */
const KEY_MAX = 200

function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const transport = useTransport()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [askReplace, setAskReplace] = useState(false)
  const tooLong = text.trim().length > KEY_MAX
  const valid = text.replace(/[\s-]/g, '').length >= 20 && !tooLong
  const save = async (replace: boolean): Promise<void> => {
    try {
      const value = await transport.call('remote.replicaSetKey', { text, ...(replace ? { replace } : {}) })
      queryClient.setQueryData(STATUS_KEY, value)
      toast.success(t('backup.keySaved'))
      setText('')
      setAskReplace(false)
      onOpenChange(false)
    } catch (error) {
      if (error instanceof ApiError && error.messageKey === 'errors.backupKeyExists') setAskReplace(true)
      else toast.error(errorText(t, error))
    }
  }
  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('backup.keyEnter')}
        description={t('settings.remote.copy.key.enterHelp')}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save(false)} disabled={!valid} data-testid="replica-key-save">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) void save(false)
          }}
        >
          <Label htmlFor="replica-key-text">{t('backup.keyInput')}</Label>
          <Input
            id="replica-key-text"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono max-md:text-base"
            aria-invalid={tooLong ? true : undefined}
            data-testid="replica-key-input"
          />
          <FieldError message={tooLong && t('form.tooLong', { max: KEY_MAX })} />
          <p className="text-muted-foreground text-xs">{t('settings.remote.copy.key.qrHint')}</p>
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
            <AlertDialogAction onClick={() => void save(true)} data-testid="replica-key-replace">
              {t('backup.keyReplaceConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const MIN_PASSWORD = 8

/** "Otel bilgisayarı bozuldu mu? Bu bilgisayarı ana bilgisayar yap". */
function Takeover({ status }: { status: ReplicaStatus }) {
  const { t } = useTranslation()
  const when = useWhen()
  const transport = useTransport()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  // K-45 (4): the Bismuth key from the paper again, so only the hotel's owner can make this the main computer.
  const [keyText, setKeyText] = useState('')
  const [force, setForce] = useState(false)
  const [tried, setTried] = useState(false)
  const [pending, setPending] = useState(false)
  const { possible, reason } = status.takeover
  const reachable = reason === 'hostReachable'
  const short = password.length < MIN_PASSWORD
  const mismatch = password !== again
  const keyTooLong = keyText.trim().length > KEY_MAX
  const keyMissing = keyText.trim().length < 20 || keyTooLong
  const blocked = short || mismatch || keyMissing || (reachable && !force)
  const why =
    reason === 'noCopy'
      ? t('settings.remote.takeover.noCopy')
      : reason === 'noKey'
        ? t('settings.remote.takeover.noKey')
        : reason === 'noFolder'
          ? t('settings.remote.takeover.noFolder')
          : null
  const submit = async (): Promise<void> => {
    setTried(true)
    if (blocked) return
    setPending(true)
    try {
      await transport.call('remote.takeOver', {
        password,
        keyText: keyText.trim(),
        ...(force ? { force } : {})
      })
      toast.success(t('settings.remote.takeover.done'))
      setOpen(false)
    } catch (error) {
      toast.error(errorText(t, error))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="grid content-start gap-3 rounded-lg border p-4 md:col-span-2" data-testid="takeover">
      <p className="flex items-center gap-2 font-medium">
        <ServerIcon className="text-muted-foreground size-4" aria-hidden />
        {t('settings.remote.takeover.title')}
      </p>
      <p className="text-muted-foreground max-w-prose text-sm">{t('settings.remote.takeover.help')}</p>
      {why ? <p className="text-sm">{why}</p> : null}
      <Button
        variant="destructive"
        className="justify-self-start max-md:w-full"
        disabled={!possible}
        onClick={() => {
          setTried(false)
          setOpen(true)
        }}
        data-testid="takeover-open"
      >
        {t('settings.remote.takeover.open')}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings.remote.takeover.dialogTitle')}
        description={t('settings.remote.takeover.dialogHelp')}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void submit()}
              data-testid="takeover-confirm"
            >
              {t('settings.remote.takeover.confirm')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <ol className="grid list-decimal gap-1.5 ps-5 text-sm">
            <li>{t('settings.remote.takeover.step1', { time: when(status.asOf) ?? '—' })}</li>
            <li>{t('settings.remote.takeover.step2')}</li>
            <li>{t('settings.remote.takeover.step3')}</li>
            <li>{t('settings.remote.takeover.step4')}</li>
          </ol>
          {reachable ? (
            <div className="bg-destructive/10 grid gap-2 rounded-lg p-3 text-sm">
              <p className="flex items-start gap-2">
                <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                {t('settings.remote.takeover.reachable')}
              </p>
              <Label className="flex items-center gap-2 font-normal max-md:min-h-11">
                <Checkbox
                  checked={force}
                  onCheckedChange={(v) => setForce(v === true)}
                  data-testid="takeover-force"
                />
                {t('settings.remote.takeover.force')}
              </Label>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="takeover-password">{t('settings.remote.takeover.password')}</Label>
            <PasswordInput
              id="takeover-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={tried && short ? true : undefined}
              data-testid="takeover-password"
            />
            <p className={tried && short ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              {t('settings.remote.takeover.passwordRule')}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="takeover-again">{t('settings.remote.takeover.again')}</Label>
            <PasswordInput
              id="takeover-again"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              aria-invalid={tried && mismatch ? true : undefined}
              data-testid="takeover-again"
            />
            {tried && mismatch ? (
              <p className="text-destructive text-xs">{t('settings.remote.takeover.mismatch')}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="takeover-key">{t('settings.remote.takeover.key')}</Label>
            <Input
              id="takeover-key"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              aria-invalid={tried && keyMissing ? true : undefined}
              className="font-mono max-md:text-base"
              data-testid="takeover-key"
            />
            <p className={tried && keyMissing ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
              {t('settings.remote.takeover.keyHelp')}
            </p>
            <FieldError message={keyTooLong && t('form.tooLong', { max: KEY_MAX })} />
          </div>
          <button type="submit" hidden />
        </form>
      </ResponsiveDialog>
    </div>
  )
}
