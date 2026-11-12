// "Bağlı cihazlar" (G-144): every device that has signed in — this window's computer, other computers and phones
// in server mode — with the people signed in on it. "Oturumu kapat" signs one person out on it; "Cihazı çıkar"
// signs everyone out and marks the device removed (a lost phone). Needs `devices`; the service checks it again
// (G-23). The window's own sign-in is marked "Bu oturum".
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LaptopIcon, MonitorIcon, MonitorSmartphoneIcon, SmartphoneIcon, UserRoundIcon } from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import { useMe } from '@/lib/session/session'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useAdminMutation } from './use-admin'
import { currentSessionId } from './current-session'
import { ViewOnlyNote } from './view-only'

type Device = ProcedureOutput<'auth.devices'>[number]
type Confirm = { kind: 'device'; device: Device } | { kind: 'session'; id: string; name: string } | null

const ICON: Record<Device['kind'], typeof LaptopIcon> = {
  desktop: MonitorIcon,
  browser: LaptopIcon,
  mobile: SmartphoneIcon
}

/** The operating system as people say it; anything else (a browser's own text) as it came. */
const PLATFORMS = { win32: 'windows', darwin: 'mac', linux: 'linux' } as const
const isKnownPlatform = (v: string): v is keyof typeof PLATFORMS => v in PLATFORMS

export function DevicesCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canEdit = can('devices', 'edit')
  const query = useApiQuery('auth.devices', {})
  const me = useMe()
  const transport = useTransport().kind
  const [confirm, setConfirm] = useState<Confirm>(null)
  const revokeDevice = useAdminMutation('auth.revokeDevice', {
    invalidate: ['auth.devices'],
    success: t('settings.remote.deviceRevoked')
  })
  const revokeSession = useAdminMutation('auth.revokeSession', {
    invalidate: ['auth.devices'],
    success: t('settings.remote.sessionEnded')
  })
  const when = (iso: string): string => `${f.dayMonth(localDateOf(new Date(iso)))} ${f.time(iso)}`

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CardTitle>{t('settings.remote.devicesTitle')}</CardTitle>
          {canEdit ? null : <ViewOnlyNote />}
        </div>
        <CardDescription>{t('settings.remote.devicesHelp')}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryView
          query={query}
          isEmpty={(list) => list.length === 0}
          empty={{
            icon: MonitorSmartphoneIcon,
            title: t('settings.remote.devicesEmptyTitle'),
            body: t('settings.remote.devicesEmptyBody')
          }}
        >
          {(list) => {
            const mine = currentSessionId(list, me?.user.id, transport)
            return (
              <ul className="grid gap-2" data-testid="device-list">
                {list.map((d) => {
                  const Icon = ICON[d.kind]
                  const revoked = d.revokedAt !== null
                  const meta = [
                    d.platform && isKnownPlatform(d.platform)
                      ? t(`settings.remote.platform.${PLATFORMS[d.platform]}`)
                      : d.platform,
                    t('settings.remote.lastSeen', { when: when(d.lastSeenAt) }),
                    d.lastIp
                  ].filter((part): part is string => Boolean(part))
                  return (
                    <li
                      key={d.id}
                      className={cn('grid gap-2 rounded-lg border p-3', revoked && 'text-muted-foreground')}
                      data-testid={`device-${d.id}`}
                    >
                      {/* The text keeps at least 10rem: the button drops under it (full width on the phone). */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                        <span className="grid min-w-40 flex-1 basis-40 gap-0.5">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="min-w-0 text-sm font-medium break-words" title={d.name}>
                              {d.name}
                            </span>
                            {d.trusted ? (
                              <Badge variant="secondary">{t('settings.remote.trusted')}</Badge>
                            ) : null}
                            {revoked ? <Badge variant="outline">{t('settings.remote.revoked')}</Badge> : null}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {meta.map((part, i) => (
                              <span key={i}>
                                {i ? ' · ' : null}
                                <bdi className="whitespace-nowrap">{part}</bdi>
                              </span>
                            ))}
                          </span>
                        </span>
                        {!revoked ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="max-md:w-full"
                            disabled={!canEdit}
                            aria-label={t('settings.remote.revokeDeviceFor', { name: d.name })}
                            onClick={() => setConfirm({ kind: 'device', device: d })}
                          >
                            {t('settings.remote.revokeDevice')}
                          </Button>
                        ) : null}
                      </div>
                      {d.sessions.length ? (
                        <ul
                          className="ms-8 grid gap-1 border-s ps-3 max-md:ms-2"
                          aria-label={t('settings.remote.sessions')}
                        >
                          {d.sessions.map((s) => (
                            <li
                              key={s.id}
                              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                              data-testid={`session-${s.id}`}
                            >
                              <UserRoundIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1 basis-40">
                                <span className="font-medium">{s.userName}</span>{' '}
                                {s.id === mine ? (
                                  <Badge variant="secondary" className="me-1" data-testid="this-session">
                                    {t('settings.remote.thisSession')}
                                  </Badge>
                                ) : null}
                                <span className="text-muted-foreground text-xs">
                                  {t('settings.remote.lastSeen', { when: when(s.lastSeenAt) })}
                                </span>
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="max-md:w-full"
                                disabled={!canEdit}
                                aria-label={t('settings.remote.signOutDevice', { name: s.userName })}
                                onClick={() => setConfirm({ kind: 'session', id: s.id, name: s.userName })}
                              >
                                {t('settings.remote.signOut')}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : !revoked ? (
                        <p className="text-muted-foreground ms-8 text-xs max-md:ms-0">
                          {t('settings.remote.noSessions')}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )
          }}
        </QueryView>
      </CardContent>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => (open ? null : setConfirm(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'device'
                ? t('settings.remote.revokeDeviceTitle', { name: confirm.device.name })
                : t('settings.remote.signOutTitle', { name: confirm?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'device'
                ? t('settings.remote.revokeDeviceBody')
                : t('settings.remote.signOutBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.kind === 'device') revokeDevice.mutate({ id: confirm.device.id })
                else if (confirm?.kind === 'session') revokeSession.mutate({ id: confirm.id })
              }}
              data-testid="confirm-revoke"
            >
              {confirm?.kind === 'device' ? t('settings.remote.revokeDevice') : t('settings.remote.signOut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
