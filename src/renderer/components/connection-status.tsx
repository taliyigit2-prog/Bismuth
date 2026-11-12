// The link to the hotel's main computer on a phone, a browser or a computer in client mode (faz-13 madde 3; tasarim
// §8 "istemci modunda bağlantı rozeti"): a badge in the top bar and, while the link is down or the versions differ,
// a strip under it that says what happened and what to do. While down it asks the main computer every few seconds
// and, once it answers, every screen reloads its data. The hotel's own computer (IPC, its own data) shows nothing.
// P13b: when the answers come from a read-only copy (status 203) the badge says "Yedek kopya · 14:32" on the
// owner's computer (the main computer is away) or "Salt okunur" on a computer another one took over from, and the
// strip says why nothing can be changed; every write button is closed meanwhile (useCan).
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ArchiveIcon, LockIcon, RefreshCwIcon, WifiIcon, WifiOffIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { connection, useConnection } from '@/lib/transport'

/** Retry interval while the main computer cannot be reached. */
const RETRY_MS = 5_000

/** True where the data lives on another computer: a browser, or this computer in client mode. */
export function useRemoteLink(): boolean {
  const transport = useTransport()
  const settings = useSettings()
  return transport.kind === 'http' || settings.data?.['app.mode'] === 'client'
}

/** This window is the owner's client computer (its read-only copy answers while the main computer is away). */
function useClientComputer(): boolean {
  const transport = useTransport()
  const settings = useSettings()
  return transport.kind === 'ipc' && settings.data?.['app.mode'] === 'client'
}

/** "14:32" today, "3 Eki 14:32" on another day. */
function useWhen(): (iso: string | null | undefined) => string | null {
  const f = useFormat()
  return (iso) => {
    if (!iso) return null
    const day = localDateOf(new Date(iso))
    const time = f.time(iso)
    return day === localDateOf(new Date()) ? time : `${f.dayMonth(day)} ${time}`
  }
}

/** The copy's state on the owner's computer, asked only while the copy answers. */
function useCopyStatus(enabled: boolean) {
  return useApiQuery('remote.replicaStatus', {}, { enabled, refetchInterval: 15_000 })
}

/** The main computer answers with another identity than the one this computer kept (K-45): asked only while not online. */
function useIdentityChanged(): boolean {
  const client = useClientComputer()
  const { status } = useConnection()
  const enabled = client && status !== 'online'
  const link = useApiQuery('remote.clientStatus', {}, { enabled, refetchInterval: 10_000 })
  return enabled && link.data?.state === 'identityChanged'
}

function IdentityBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="destructive" className="gap-1" data-testid="connection-badge" data-status="identity">
      <LockIcon aria-hidden />
      <span className="max-sm:sr-only">{t('connection.identityBadge')}</span>
    </Badge>
  )
}

function IdentityBanner() {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      data-testid="connection-banner"
      data-status="identity"
      className="bg-destructive/10 text-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    >
      <LockIcon className="text-destructive size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t('connection.identityBody')}</span>
      <Button
        size="sm"
        variant="outline"
        data-testid="identity-details"
        onClick={() => {
          window.location.hash = '#/settings?tab=remote'
        }}
      >
        {t('connection.identityAction')}
      </Button>
    </div>
  )
}

function ReadOnlyBadge() {
  const { t } = useTranslation()
  const client = useClientComputer()
  const when = useWhen()
  const copy = useCopyStatus(client)
  const time = when(copy.data?.asOf)
  const label = client
    ? time
      ? t('connection.copyBadge', { time })
      : t('connection.copyBadgeNoTime')
    : t('connection.replacedBadge')
  const Icon = client ? ArchiveIcon : LockIcon
  return (
    <Badge variant="secondary" className="gap-1" data-testid="connection-badge" data-status="readonly">
      <Icon aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </Badge>
  )
}

export function ConnectionBadge() {
  const { t } = useTranslation()
  const remote = useRemoteLink()
  const { status } = useConnection()
  const identityChanged = useIdentityChanged()
  if (identityChanged) return <IdentityBadge />
  if (status === 'readonly') return <ReadOnlyBadge />
  if (!remote) return null
  const Icon = status === 'online' ? WifiIcon : WifiOffIcon
  const label =
    status === 'online'
      ? t('topbar.connected')
      : status === 'offline'
        ? t('connection.offline')
        : t('connection.outdated')
  return (
    <Badge
      variant={status === 'online' ? 'outline' : 'destructive'}
      className="gap-1"
      data-testid="connection-badge"
      data-status={status}
    >
      <Icon className={status === 'online' ? 'text-success' : undefined} aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </Badge>
  )
}

/** The strip while a read-only copy answers: why nothing can be changed, and what to do. */
function ReadOnlyBanner() {
  const { t } = useTranslation()
  const f = useFormat()
  const client = useClientComputer()
  const when = useWhen()
  const transport = useTransport()
  const queryClient = useQueryClient()
  const copy = useCopyStatus(client)
  const epoch = useApiQuery('remote.epochState', {}, { enabled: !client, refetchInterval: 60_000 })
  const replaced = epoch.data?.replaced ?? null
  const state = copy.data?.state
  const time = when(copy.data?.asOf)
  const body = client
    ? state === 'needsUpdate'
      ? t('connection.copyNeedsUpdate')
      : state === 'hostOlder'
        ? t('connection.copyHostOlder')
        : time
          ? t('connection.copyBody', { time })
          : t('connection.copyBodyNoTime')
    : replaced
      ? t('connection.replacedBody', { by: replaced.by, date: f.date(localDateOf(new Date(replaced.at))) })
      : t('connection.replacedBodyShort')
  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-status="readonly"
      className="bg-muted text-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    >
      {client ? (
        <ArchiveIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      ) : (
        <LockIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1" data-testid="read-only-reason">
        {body}
      </span>
      {client && state === 'needsUpdate' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void transport.call('remote.openInBrowser', {}).catch(() => undefined)}
        >
          {t('connection.openInBrowser')}
        </Button>
      ) : client ? (
        <Button
          size="sm"
          variant="outline"
          data-testid="connection-retry"
          onClick={() => {
            void transport
              .call('remote.replicaSync', {})
              .catch(() => undefined)
              .finally(() => void queryClient.invalidateQueries())
          }}
        >
          {t('connection.retry')}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          data-testid="replaced-details"
          onClick={() => {
            window.location.hash = '#/settings?tab=remote'
          }}
        >
          {t('connection.replacedAction')}
        </Button>
      )}
    </div>
  )
}

export function ConnectionBanner() {
  const { t } = useTranslation()
  const f = useFormat()
  const remote = useRemoteLink()
  const { status, lastOkAt } = useConnection()
  const transport = useTransport()
  const queryClient = useQueryClient()
  const previous = useRef(status)
  const identityChanged = useIdentityChanged()

  // Back online after a gap (or from the read-only copy back to the main computer): everything may be stale.
  useEffect(() => {
    if ((previous.current === 'offline' || previous.current === 'readonly') && status === 'online')
      void queryClient.invalidateQueries()
    previous.current = status
  }, [status, queryClient])

  // While down, ask the main computer every few seconds (a public, data-free question).
  useEffect(() => {
    if (!remote || status !== 'offline') return
    const timer = setInterval(() => {
      transport.call('remote.hello', {}).catch(() => undefined)
    }, RETRY_MS)
    return () => clearInterval(timer)
  }, [remote, status, transport])

  // While the copy answers, a light question every few seconds notices the main computer coming back.
  useEffect(() => {
    if (status !== 'readonly' || transport.kind !== 'ipc') return
    const timer = setInterval(() => {
      transport.call('auth.ping', {}).catch(() => undefined)
    }, RETRY_MS)
    return () => clearInterval(timer)
  }, [status, transport])

  if (identityChanged) return <IdentityBanner />
  if (status === 'readonly') return <ReadOnlyBanner />
  if (!remote || status === 'online') return null
  const offline = status === 'offline'
  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-status={status}
      className="bg-destructive/10 text-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    >
      {offline ? (
        <WifiOffIcon className="text-destructive size-4 shrink-0" aria-hidden />
      ) : (
        <RefreshCwIcon className="text-destructive size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        {offline ? t('connection.offlineBody') : t('connection.outdatedBody')}
        {offline && lastOkAt ? (
          <span className="text-muted-foreground">
            {' '}
            {t('connection.lastContact', { time: f.time(new Date(lastOkAt).toISOString()) })}
          </span>
        ) : null}
      </span>
      {offline ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            transport
              .call('remote.hello', {})
              .then(() => connection.ok())
              .catch(() => undefined)
          }}
          data-testid="connection-retry"
        >
          {t('connection.retry')}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          {t('connection.reload')}
        </Button>
      )}
    </div>
  )
}
