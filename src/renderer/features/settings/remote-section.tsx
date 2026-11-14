// "Uzaktan erişim" (faz-13 madde 1; G-140…G-146, K-19, K-31): how this computer works with others — alone, as the
// hotel's main computer (other computers and phones connect) or using another one — the port, the addresses to
// open (local network and the private network, found on the network cards: NetBird wt0 / Tailscale / 100.x) with a
// QR code for phones, the private-network setup in short (the full guide: docs/uzaktan-erisim.md), "always on"
// (start with the computer, G-146), the remote session length and the signed-in devices (devices-card.tsx).
// K-45 (1): the hotel's Wi-Fi is served only when switched on here (with a warning: guests' Wi-Fi must be separate);
// this computer's identity is shown so the owner can compare it with what a client computer shows.
// Bismuth runs no server of ours and joins no cloud account (G-07). Reading needs `remote.settings` view, changing
// edit; switching the server only from the hotel's own window (the service refuses it from a phone).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FingerprintIcon,
  PowerIcon,
  QrCodeIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  WifiIcon,
  WifiOffIcon
} from 'lucide-react'
import { DEFAULT_HOST_PORT, SESSION_HOUR_CHOICES, type HostStatus } from '@shared/contract/remote'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CopyButton } from '@/components/copy-button'
import { QrCode } from '@/components/qr-code'
import { QueryView } from '@/components/query-view'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useSessionEvents } from '@/lib/session/session'
import { useCan } from '@/lib/view-as'
import { SIGN_IN_LIMITS } from '../auth/limits'
import { DevicesCard } from './devices-card'
import { RelayCard, ReplacedCard } from './relay-card'
import { ReplicaCard } from './replica-card'
import { SwitchRow } from './room-dialogs'
import { useAdminMutation } from './use-admin'
import { ViewOnlyNote } from './view-only'

const MODES = ['single', 'server', 'client'] as const
type Mode = (typeof MODES)[number]
const STEPS = ['install', 'join', 'phone', 'open'] as const
const ALWAYS_ON = ['sleep', 'power', 'updates', 'netbird'] as const

const modeOf = (mode: HostStatus['mode']): Mode =>
  mode === 'host' ? 'server' : mode === 'client' ? 'client' : 'single'

export function RemoteSection() {
  const can = useCan()
  // In client mode this window shows the main computer's settings: this computer's own card instead of its server.
  const settings = useSettings()
  const transport = useTransport()
  const client = settings.data?.['app.mode'] === 'client' && transport.kind === 'ipc'
  return (
    // Cards keep their own height: a short card next to a long one does not grow an empty bottom.
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {client ? (
        <>
          <ClientCard />
          <ReplicaCard />
        </>
      ) : can('remote.settings') ? (
        <>
          <ReplacedCard />
          <HostCards />
          <RelayCard />
        </>
      ) : null}
      {can('devices') ? <DevicesCard className="lg:col-span-2" /> : null}
    </div>
  )
}

function HostCards() {
  const { t } = useTranslation()
  const can = useCan()
  // A phone or browser sees the settings but cannot switch the server under itself (the service says so too).
  const local = useTransport().kind === 'ipc'
  const canEdit = can('remote.settings', 'edit') && local
  // A private network that connects later (NetBird's service) shows up without reopening the screen.
  const status = useApiQuery('remote.hostStatus', {}, { refetchInterval: 15_000 })
  const settings = useSettings()
  const update = useUpdateSettings()
  const [confirmClient, setConfirmClient] = useState(false)
  const setMode = useAdminMutation('remote.setMode', { invalidate: ['remote.hostStatus', 'settings.get'] })
  const setOpenAtLogin = useAdminMutation('remote.setOpenAtLogin', { invalidate: ['remote.hostStatus'] })
  const becomeClient = useAdminMutation('remote.becomeClient')

  return (
    <>
      <Card className="lg:col-span-2" data-testid="remote-mode-card">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>{t('settings.remote.modeTitle')}</CardTitle>
            {canEdit ? null : <ViewOnlyNote help={local ? undefined : t('settings.remote.onlyOnHost')} />}
          </div>
          <CardDescription>{t('settings.remote.modeHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryView query={status}>
            {(s) => (
              <div className="grid gap-6 md:grid-cols-2">
                <RadioGroup
                  value={modeOf(s.mode)}
                  disabled={!canEdit || setMode.isPending}
                  onValueChange={(v) => {
                    if (v === 'client') setConfirmClient(true)
                    else if (v === 'server' || v === 'single')
                      setMode.mutate({ mode: v === 'server' ? 'host' : 'standalone' })
                  }}
                  className="content-start gap-3"
                  aria-label={t('settings.remote.modeTitle')}
                >
                  {MODES.map((m) => (
                    <Label
                      key={m}
                      htmlFor={`mode-${m}`}
                      className="has-[[data-state=checked]]:border-primary items-start rounded-lg border p-3 font-normal"
                    >
                      <RadioGroupItem
                        id={`mode-${m}`}
                        value={m}
                        className="mt-0.5"
                        data-testid={`remote-mode-${m}`}
                      />
                      <span className="grid gap-1">
                        <span className="font-medium">{t(`settings.remote.mode.${m}`)}</span>
                        <span className="text-muted-foreground text-xs">
                          {t(`settings.remote.modeDesc.${m}`)}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                {s.mode === 'host' ? (
                  <ServerState status={s} canEdit={canEdit} />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {s.mode === 'client'
                      ? t('settings.remote.modeNote.client')
                      : t('settings.remote.modeNote.single')}
                  </p>
                )}
              </div>
            )}
          </QueryView>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.remote.setupTitle')}</CardTitle>
          <CardDescription>{t('settings.remote.setupHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
                  {i + 1}
                </span>
                <span className="grid gap-0.5 text-sm">
                  <span className="font-medium">{t(`settings.remote.step.${step}.title`)}</span>
                  <span className="text-muted-foreground">{t(`settings.remote.step.${step}.body`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-4 text-xs">{t('settings.remote.guideNote')}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card data-testid="remote-always-on">
          <CardHeader>
            <CardTitle>{t('settings.remote.alwaysOnTitle')}</CardTitle>
            <CardDescription>{t('settings.remote.alwaysOnHelp')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {status.data && status.data.openAtLogin !== null ? (
              <SwitchRow
                id="remote-open-at-login"
                label={t('settings.remote.openAtLogin')}
                help={t('settings.remote.openAtLoginHelp')}
                checked={status.data.openAtLogin}
                disabled={!canEdit || setOpenAtLogin.isPending}
                onChange={(enabled) => setOpenAtLogin.mutate({ enabled })}
              />
            ) : null}
            <ul className="grid gap-2 text-sm">
              {ALWAYS_ON.map((tip) => (
                <li key={tip} className="flex gap-2">
                  <PowerIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{t(`settings.remote.alwaysOn.${tip}`)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.remote.securityTitle')}</CardTitle>
            <CardDescription>{t('settings.remote.securityHelp')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="session-timeout">{t('settings.remote.timeout')}</Label>
              <Select
                value={String(settings.data?.['host.sessionHours'] ?? 12)}
                disabled={!canEdit || update.isPending}
                onValueChange={(v) => update.mutate({ 'host.sessionHours': Number(v) })}
              >
                <SelectTrigger id="session-timeout" className="w-full" data-testid="session-hours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_HOUR_CHOICES.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h % 24 === 0
                        ? t('settings.remote.days', { count: h / 24 })
                        : t('settings.remote.hours', { count: h })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
              <ShieldCheckIcon className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
              {t('settings.remote.lockout', SIGN_IN_LIMITS)}
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmClient} onOpenChange={setConfirmClient}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remote.clientTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.remote.clientBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => becomeClient.mutate({})} data-testid="confirm-client">
              {t('settings.remote.clientConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const ADDRESS_LABEL = {
  lan: 'settings.remote.address.lan',
  netbird: 'settings.remote.address.netbird',
  tailscale: 'settings.remote.address.tailscale',
  private: 'settings.remote.address.private'
} as const

/** Server running (or why not), the addresses with a QR code each, and the port. */
function ServerState({ status, canEdit }: { status: HostStatus; canEdit: boolean }) {
  const { t } = useTranslation()
  const [qr, setQr] = useState<string | null>(null)
  const update = useUpdateSettings()
  const settings = useSettings()
  const queryClient = useQueryClient()
  const setMode = useAdminMutation('remote.setMode', { invalidate: ['remote.hostStatus'] })
  const setListenLan = useAdminMutation('remote.setListenLan', {
    invalidate: ['remote.hostStatus', 'settings.get']
  })
  const [confirmLan, setConfirmLan] = useState(false)
  const [port, setPort] = useState(String(status.port))
  const portNumber = Number(port)
  const portValid = /^\d+$/.test(port) && portNumber >= 1024 && portNumber <= 65535
  // "47694.5" is not a number of ports: say so instead of quietly dropping the dot.
  const portDecimal = /[.,]/.test(port)
  const hasPrivate = status.addresses.some((a) => a.kind !== 'lan')

  return (
    <div className="grid content-start gap-3" data-testid="server-state">
      {status.running ? (
        <p className="flex items-center gap-2 text-sm font-medium" data-testid="server-on">
          <WifiIcon className="text-success size-4" aria-hidden />
          {t('settings.remote.serverOn')}
        </p>
      ) : (
        <div className="grid gap-2" data-testid="server-off">
          <p className="text-destructive flex items-start gap-2 text-sm font-medium">
            <WifiOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {status.error === 'portInUse'
              ? t('settings.remote.portInUse', { port: status.port })
              : t('settings.remote.serverFailed')}
          </p>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              disabled={setMode.isPending}
              onClick={() => setMode.mutate({ mode: 'host' })}
            >
              {t('settings.remote.tryAgain')}
            </Button>
          ) : null}
        </div>
      )}
      <div className="grid gap-2 rounded-lg border p-3" data-testid="listen-lan">
        <SwitchRow
          id="remote-listen-lan"
          label={t('settings.remote.lan.label')}
          help={status.listenLan ? t('settings.remote.lan.onHelp') : t('settings.remote.lan.offHelp')}
          checked={status.listenLan}
          disabled={!canEdit || setListenLan.isPending}
          onChange={(enabled) => {
            // Switching it on warns first (K-45 (1)); switching it off needs no question.
            if (enabled) setConfirmLan(true)
            else setListenLan.mutate({ enabled: false })
          }}
        />
      </div>
      <div className="grid gap-2 rounded-lg border p-3" data-testid="light-mode">
        <SwitchRow
          id="remote-light-mode"
          label={t('settings.remote.lightMode.label')}
          help={t('settings.remote.lightMode.help')}
          checked={settings.data?.['app.lightMode'] ?? false}
          disabled={!canEdit || update.isPending}
          onChange={(enabled) => update.mutate({ 'app.lightMode': enabled })}
        />
      </div>
      {status.running && status.addresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('settings.remote.noAddress')}</p>
      ) : null}
      <ul className="grid gap-2" data-testid="host-addresses">
        {status.addresses.map((a) => (
          <li key={a.url} className="grid gap-2 rounded-lg border p-3">
            <span className="text-muted-foreground text-xs">{t(ADDRESS_LABEL[a.kind])}</span>
            <span className="flex flex-wrap items-center gap-2">
              <code dir="ltr" className="min-w-0 flex-1 text-sm break-all" data-testid="host-address">
                {a.url}
              </code>
              <CopyButton text={a.url} size="icon-sm" variant="ghost" />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('settings.remote.showQr', { url: a.url })}
                aria-pressed={qr === a.url}
                onClick={() => setQr(qr === a.url ? null : a.url)}
              >
                <QrCodeIcon aria-hidden />
              </Button>
            </span>
            {qr === a.url ? (
              <div className="grid justify-items-center gap-2 pt-1">
                <QrCode value={a.url} label={t('settings.remote.qrLabel', { url: a.url })} />
                <p className="text-muted-foreground text-center text-xs">{t('settings.remote.phoneHint')}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {status.running && !hasPrivate ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs" data-testid="no-private">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('settings.remote.noPrivate')}
        </p>
      ) : null}
      {status.unservedPrivate.length ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs" data-testid="unserved-private">
          <ShieldAlertIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t('settings.remote.unservedPrivate', {
              addresses: status.unservedPrivate.map((a) => a.address).join(', ')
            })}
          </span>
        </p>
      ) : null}
      {status.announced ? (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <CheckCircle2Icon className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
          {t('settings.remote.announced')}
        </p>
      ) : null}
      {status.identity ? (
        <div className="grid gap-0.5 text-xs" data-testid="host-identity">
          <span className="text-muted-foreground flex items-center gap-2">
            <FingerprintIcon className="size-4 shrink-0" aria-hidden />
            {t('settings.remote.identity.mine')}
          </span>
          <code dir="ltr" className="text-sm font-medium tracking-wide">
            {status.identity}
          </code>
          <span className="text-muted-foreground">{t('settings.remote.identity.mineHelp')}</span>
        </div>
      ) : null}
      <AlertDialog open={confirmLan} onOpenChange={setConfirmLan}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remote.lan.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.remote.lan.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setListenLan.mutate({ enabled: true })}
              data-testid="confirm-listen-lan"
            >
              {t('settings.remote.lan.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <form
        className="grid gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (portValid && portNumber !== status.port)
            update.mutate(
              { 'host.port': portNumber },
              // The server starts again on the new port: show where it listens now.
              { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['remote.hostStatus'] }) }
            )
        }}
      >
        <Label htmlFor="host-port">{t('settings.remote.port')}</Label>
        <div className="flex gap-2">
          <Input
            id="host-port"
            dir="ltr"
            inputMode="numeric"
            className="w-32"
            value={port}
            disabled={!canEdit}
            aria-invalid={portValid ? undefined : true}
            aria-describedby="host-port-help"
            onChange={(e) => setPort(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8))}
            data-testid="host-port"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!canEdit || !portValid || portNumber === status.port || update.isPending}
          >
            {t('common.save')}
          </Button>
        </div>
        <p
          id="host-port-help"
          className={portValid ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'}
        >
          {portValid
            ? t('settings.remote.portHelp', { port: DEFAULT_HOST_PORT })
            : portDecimal
              ? t('form.wholeNumber')
              : t('settings.remote.portInvalid')}
        </p>
      </form>
    </div>
  )
}

/** Client mode: which main computer this computer uses, the link's state, change it or leave client mode. */
function ClientCard() {
  const { t } = useTranslation()
  const status = useApiQuery('remote.clientStatus', {}, { refetchInterval: 10_000 })
  const events = useSessionEvents()
  const queryClient = useQueryClient()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const forget = useAdminMutation('remote.forgetHost', {
    // The connection screen takes over (the gate sees "not connected").
  })
  const leave = useAdminMutation('remote.leaveClient')
  const [confirmIdentity, setConfirmIdentity] = useState(false)
  const accept = useAdminMutation('remote.acceptHostIdentity', { invalidate: ['remote.clientStatus'] })
  const afterChange = async (): Promise<void> => {
    // Another hotel (or none) from now on: the earlier one's data leaves the cache (P21b).
    await events.hotelChanged()
    await queryClient.invalidateQueries()
  }
  return (
    <Card className="lg:col-span-2" data-testid="remote-client-card">
      <CardHeader>
        <CardTitle>{t('settings.remote.clientCard.title')}</CardTitle>
        <CardDescription>{t('settings.remote.clientCard.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryView query={status}>
          {(s) => (
            <div className="grid gap-4">
              <div className="grid gap-1 rounded-lg border p-3">
                <span className="text-muted-foreground text-xs">{t('settings.remote.clientCard.host')}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <code dir="ltr" className="min-w-0 flex-1 text-sm break-all">
                    {s.hostUrl ?? '—'}
                  </code>
                  <span
                    className={
                      s.state === 'connected'
                        ? 'text-success text-sm font-medium'
                        : 'text-destructive text-sm font-medium'
                    }
                    data-testid="client-link-state"
                  >
                    {t(`settings.remote.clientCard.state.${s.state}`)}
                  </span>
                </span>
                {s.host ? <span className="text-muted-foreground text-xs">{s.host.hotelName}</span> : null}
                {s.identity.known ? (
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <FingerprintIcon className="size-3.5 shrink-0" aria-hidden />
                    {t('settings.remote.identity.known')}
                    <code dir="ltr" data-testid="client-identity">
                      {s.identity.known}
                    </code>
                  </span>
                ) : null}
              </div>
              {s.state === 'identityChanged' ? (
                <div
                  role="alert"
                  className="border-destructive/50 grid gap-2 rounded-lg border p-3"
                  data-testid="identity-changed"
                >
                  <p className="text-destructive flex items-start gap-2 text-sm font-medium">
                    <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {t('settings.remote.identity.changedTitle')}
                  </p>
                  <p className="text-sm">{t('settings.remote.identity.changedBody')}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t('settings.remote.identity.known')}</dt>
                    <dd>
                      <code dir="ltr">{s.identity.known ?? '—'}</code>
                    </dd>
                    <dt className="text-muted-foreground">{t('settings.remote.identity.offered')}</dt>
                    <dd>
                      <code dir="ltr">{s.identity.offered ?? '—'}</code>
                    </dd>
                  </dl>
                  <Button
                    variant="outline"
                    className="justify-self-start max-md:w-full"
                    onClick={() => setConfirmIdentity(true)}
                    data-testid="accept-identity"
                  >
                    {t('settings.remote.identity.accept')}
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={forget.isPending}
                  onClick={() => forget.mutate({}, { onSuccess: () => void afterChange() })}
                >
                  {t('settings.remote.clientCard.change')}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmLeave(true)}>
                  {t('settings.remote.clientCard.leave')}
                </Button>
              </div>
            </div>
          )}
        </QueryView>
      </CardContent>
      <AlertDialog open={confirmIdentity} onOpenChange={setConfirmIdentity}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remote.identity.acceptTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.remote.identity.acceptBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // N-7: the fingerprint shown above; another key answering since is not accepted unseen.
                const offered = status.data?.identity.offered
                if (offered) accept.mutate({ fingerprint: offered }, { onSuccess: () => void afterChange() })
              }}
              data-testid="confirm-accept-identity"
            >
              {t('settings.remote.identity.accept')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remote.clientCard.leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.remote.clientCard.leaveBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => leave.mutate({}, { onSuccess: () => void afterChange() })}>
              {t('settings.remote.clientCard.leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
