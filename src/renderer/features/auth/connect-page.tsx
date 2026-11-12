// Client mode's first screen (faz-13 "Faz 4'ten notlar", madde 3): find the hotel's main computer — the ones that
// announce themselves on the local network, or an address typed by hand (Ayarlar → Uzaktan erişim on the main
// computer shows it; phones scan its QR there instead) — check it answers as a compatible Bismuth, then sign in
// there. When it cannot be reached or runs another version the screen says what to do; "set up here alone" brings
// the data back to this computer. The main process keeps the address and the session (yasak 13: no local data).
// K-45 (1): when another computer than the one met before answers (its identity changed), nothing is sent there;
// the screen shows both identities and connects only when the person accepts the new one (after a takeover).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ExternalLinkIcon,
  Loader2Icon,
  MonitorIcon,
  PlugIcon,
  RefreshCwIcon,
  ServerIcon,
  ShieldAlertIcon,
  WifiOffIcon
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport'
import { useSessionEvents } from '@/lib/session/session'
import { AuthFrame } from './auth-frame'
import { olderSide } from './connect-rules'
import { Field, FormAlert } from './fields'
import { failureKey, type AuthMessageKey } from './rules'

/** While the main computer is away the screen asks again on its own. */
const RETRY_MS = 5_000

export function ConnectPage() {
  const { t } = useTranslation()
  const events = useSessionEvents()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [address, setAddress] = useState('')
  /** The address last tried: "connect anyway" after an identity warning goes to the same one. */
  const [tried, setTried] = useState<string | null>(null)
  const status = useApiQuery(
    'remote.clientStatus',
    {},
    { refetchInterval: (q) => (q.state.data?.state === 'unreachable' ? RETRY_MS : false) }
  )
  const found = useApiQuery('remote.discover', {}, { staleTime: Infinity })
  /** Connected: the main computer decides the rest (sign-in screen, its language and look). */
  const proceed = async (): Promise<void> => {
    await queryClient.invalidateQueries()
    await events.refresh()
  }
  const connect = useApiMutation('remote.connect', {
    onSuccess: async (next) => {
      queryClient.setQueryData(['remote.clientStatus', {}], next)
      if (next.state === 'connected') await proceed()
    }
  })
  const forget = useApiMutation('remote.forgetHost', {
    onSuccess: (next) => queryClient.setQueryData(['remote.clientStatus', {}], next)
  })
  const openInBrowser = useApiMutation('remote.openInBrowser')
  const accept = useApiMutation('remote.acceptHostIdentity', {
    onSuccess: async (next) => {
      queryClient.setQueryData(['remote.clientStatus', {}], next)
      if (next.state === 'connected') await proceed()
    }
  })
  /** `acceptIdentity`: the fingerprint shown to the person (N-7: only that key is accepted). */
  const tryConnect = (url: string, acceptIdentity?: string): void => {
    setTried(url)
    connect.mutate(acceptIdentity ? { url, acceptIdentity } : { url })
  }
  // Back to the wizard (when the program does not start again by itself: client mode chosen in this run).
  const leave = useApiMutation('remote.leaveClient', {
    onSuccess: async () => {
      await proceed()
      await navigate({ to: '/setup' })
    }
  })

  const current = status.data
  const reachedAgain = current?.state === 'connected' && current.hostUrl !== null
  // The address answered with another identity than the one this computer knows (K-45 (1)).
  const changed =
    connect.error instanceof ApiError && connect.error.messageKey === 'errors.hostIdentityChanged'
      ? (connect.error.details as { known?: string | null; offered?: string | null } | undefined)
      : null
  const failure = connect.isError && !changed ? failureKey(connect.error) : null
  const leaveFailure = leave.isError ? failureKey(leave.error) : null
  const busy = connect.isPending

  return (
    <AuthFrame>
      <Card data-testid="connect">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {t('connect.title')}
          </CardTitle>
          <CardDescription>{t('connect.description')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {current?.state === 'unreachable' && current.hostUrl ? (
            <Alert variant="destructive" data-testid="connect-unreachable">
              <WifiOffIcon aria-hidden />
              <AlertTitle>{t('connect.unreachableTitle')}</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>{t('connect.unreachableBody', { url: current.hostUrl })}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void status.refetch()}>
                    <RefreshCwIcon aria-hidden />
                    {t('connection.retry')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => forget.mutate({})}>
                    {t('connect.otherAddress')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          {current?.state === 'incompatible' && current.hostUrl ? (
            <Alert variant="destructive" data-testid="connect-incompatible">
              <ServerIcon aria-hidden />
              <AlertTitle>{t('connect.versionTitle')}</AlertTitle>
              <AlertDescription className="grid gap-2">
                <p>
                  {olderSide(current) === 'mine'
                    ? t('connect.versionUpdateHere', {
                        mine: current.mine.version,
                        host: current.host?.version ?? '?'
                      })
                    : t('connect.versionUpdateHost', {
                        mine: current.mine.version,
                        host: current.host?.version ?? '?'
                      })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openInBrowser.mutate({})}
                    data-testid="connect-open-browser"
                  >
                    <ExternalLinkIcon aria-hidden />
                    {t('connect.openInBrowser')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => forget.mutate({})}>
                    {t('connect.otherAddress')}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          {current?.state === 'identityChanged' && current.hostUrl ? (
            <IdentityAlert
              known={current.identity.known}
              offered={current.identity.offered}
              pending={accept.isPending}
              onAccept={() => {
                // N-7: the fingerprint shown here; a key that answered since is not accepted unseen.
                const offered = current.identity.offered
                if (offered) accept.mutate({ fingerprint: offered })
              }}
              onOther={() => forget.mutate({})}
            />
          ) : null}
          {changed && tried ? (
            <IdentityAlert
              known={changed.known ?? null}
              offered={changed.offered ?? null}
              pending={busy}
              onAccept={() => (changed.offered ? tryConnect(tried, changed.offered) : undefined)}
              onOther={() => connect.reset()}
            />
          ) : null}
          {reachedAgain ? (
            <Button onClick={() => void proceed()} data-testid="connect-continue">
              <PlugIcon aria-hidden />
              {t('connect.continue', { url: current.hostUrl })}
            </Button>
          ) : null}

          <section className="grid gap-2" aria-labelledby="connect-found">
            <div className="flex items-center justify-between gap-2">
              <h2 id="connect-found" className="text-sm font-medium">
                {t('connect.foundTitle')}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                disabled={found.isFetching}
                onClick={() => void found.refetch()}
                data-testid="connect-search"
              >
                <RefreshCwIcon aria-hidden />
                {t('connect.searchAgain')}
              </Button>
            </div>
            {found.isFetching ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                {t('connect.searching')}
              </p>
            ) : found.data?.length ? (
              <ul className="grid gap-2" data-testid="connect-found-list">
                {found.data.map((host) => (
                  <li key={host.url}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => tryConnect(host.url)}
                      className="hover:bg-accent focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 rounded-lg border p-3 text-start outline-none focus-visible:ring-[3px] disabled:opacity-60"
                      data-testid="connect-found-host"
                    >
                      <ServerIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-medium" title={host.hotelName ?? host.name}>
                          {host.hotelName ?? host.name}
                        </span>
                        <code dir="ltr" className="text-muted-foreground truncate text-start text-xs">
                          {host.url}
                        </code>
                      </span>
                      <PlugIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm" data-testid="connect-none-found">
                {t('connect.noneFound')}
              </p>
            )}
          </section>

          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (address.trim() && !busy) tryConnect(address.trim())
            }}
          >
            <Field id="connect-address" label={t('connect.address')} help={t('connect.addressHelp')}>
              {(aria) => (
                <Input
                  {...aria}
                  dir="ltr"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  placeholder={t('connect.addressPlaceholder')}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  data-testid="connect-address"
                />
              )}
            </Field>
            {failure ? (
              <FormAlert testId="connect-error">
                <p>{t(failure as AuthMessageKey)}</p>
              </FormAlert>
            ) : null}
            <Button type="submit" disabled={!address.trim() || busy} data-testid="connect-submit">
              {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <PlugIcon aria-hidden />}
              {t('connect.submit')}
            </Button>
          </form>

          <Separator />
          <div className="grid gap-3">
            <div className="grid gap-1">
              <h2 className="text-sm font-medium">{t('connect.standaloneTitle')}</h2>
              <p className="text-muted-foreground text-sm">{t('connect.standaloneBody')}</p>
            </div>
            {leaveFailure ? (
              <FormAlert>
                <p>{t(leaveFailure as AuthMessageKey)}</p>
              </FormAlert>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={leave.isPending}
              onClick={() => leave.mutate({})}
              data-testid="connect-standalone"
            >
              <MonitorIcon aria-hidden />
              {t('connect.standalone')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}

/**
 * Another computer answers at the hotel's address (K-45 (1)): both identities, and the person decides. A takeover
 * ("Bu bilgisayarı ana bilgisayar yap") changes it on purpose; otherwise it may be someone else's computer.
 */
function IdentityAlert({
  known,
  offered,
  pending,
  onAccept,
  onOther
}: {
  known: string | null
  offered: string | null
  pending: boolean
  onAccept: () => void
  onOther: () => void
}) {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive" data-testid="connect-identity-changed">
      <ShieldAlertIcon aria-hidden />
      <AlertTitle>{t('settings.remote.identity.changedTitle')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{t('settings.remote.identity.changedBody')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt>{t('settings.remote.identity.known')}</dt>
          <dd>
            <code dir="ltr">{known ?? '—'}</code>
          </dd>
          <dt>{t('settings.remote.identity.offered')}</dt>
          <dd>
            <code dir="ltr">{offered ?? '—'}</code>
          </dd>
        </dl>
        <p>{t('settings.remote.identity.acceptBody')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onAccept}
            data-testid="connect-accept-identity"
          >
            {t('settings.remote.identity.accept')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onOther}>
            {t('connect.otherAddress')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
