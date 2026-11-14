// The camera setup flow (Faz 20 P20g, K-59): read the computer and suggest a performance profile, look for cameras on
// the hotel's own network, fill in the camera's address (IP, user, password, channel; the Hikvision RTSP pattern is built
// from them), try the connection with one picture, save. The setup wizard's optional "Kamera" step and Ayarlar → Kamera →
// "Yeniden tara" show this same flow. The password only goes in: it is built into the address that `camera.setSecrets`
// seals (never a setting, never shown again). Needs `camera` edit and the hotel computer's own window.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, CheckCircle2Icon, LoaderCircleIcon, RadarIcon, VideoIcon } from 'lucide-react'
import type { CameraDevice, CameraProbe } from '@shared/contract/camera'
import {
  CAMERA_PROFILES,
  parseProfileTable,
  profileSettings,
  type CameraProfile
} from '@shared/domain/camera-profile'
import {
  DEFAULT_RTSP_PORT,
  MAX_CHANNELS,
  buildHikvisionRtsp,
  maskRtsp,
  parseIpv4
} from '@shared/domain/camera-source'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiMutation, useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport'
import { CameraAddonMissing } from '../camera/addon-missing'
import { SecretInput } from './fields'

const OS_NAMES: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

const portOf = (text: string): number | null => {
  if (!/^\d{1,5}$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= 65535 ? n : null
}
const channelsOf = (text: string): number | null => {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const n = Number(text)
  return n >= 1 && n <= MAX_CHANNELS ? n : null
}

const errorKey = (error: unknown): 'errors.internal' =>
  (error instanceof ApiError ? error.messageKey : 'errors.internal') as 'errors.internal'

function FieldBox({
  id,
  label,
  error,
  hint,
  children
}: {
  id: string
  label: string
  error?: string | undefined
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm" data-testid={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function CameraFlow({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const hardware = useApiQuery('camera.hardware', {}, { staleTime: Infinity, refetchOnWindowFocus: false })
  const discover = useApiMutation('camera.discover')
  const probe = useApiMutation('camera.probe')
  const cameraStatus = useApiQuery('camera.status', {}, { refetchInterval: 10_000 })
  const addonMissing = cameraStatus.data?.addonInstalled === false
  const setSecrets = useApiMutation('camera.setSecrets', { invalidates: ['camera.status'] })
  const update = useUpdateSettings()

  const [profileChoice, setProfileChoice] = useState<CameraProfile | null>(null)
  const [profileApplied, setProfileApplied] = useState(false)
  const [ip, setIp] = useState('')
  const [port, setPort] = useState(String(DEFAULT_RTSP_PORT))
  const [user, setUser] = useState('admin')
  const [password, setPassword] = useState('')
  const [channels, setChannels] = useState('1')
  const [channel, setChannel] = useState('1')
  const [tried, setTried] = useState(false)
  const [test, setTest] = useState<CameraProbe | 'failed' | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const table = parseProfileTable(settings.data?.['camera.profiles'] ?? '')
  const profile: CameraProfile = profileChoice ?? hardware.data?.recommended ?? 'standard'

  // What the form says; every wrong field gets its message once the person tried to go on.
  const portNumber = portOf(port)
  const channelCount = channelsOf(channels)
  const channelNumber = Math.min(channelCount ?? 1, Number(channel) || 1)
  const problems = {
    ip: parseIpv4(ip) ? undefined : t('setup.camera.form.ipInvalid'),
    port: portNumber ? undefined : t('setup.camera.form.portInvalid'),
    user: user.trim() ? undefined : t('setup.camera.form.userRequired'),
    channels: channelCount ? undefined : t('setup.camera.form.channelsInvalid')
  }
  const valid = !problems.ip && !problems.port && !problems.user && !problems.channels
  const source = valid
    ? buildHikvisionRtsp({
        host: ip.trim(),
        port: portNumber ?? DEFAULT_RTSP_PORT,
        user: user.trim(),
        password,
        channel: channelNumber
      })
    : null

  /** Any change of the address makes an earlier test or save stale. */
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v)
    setTest(null)
    setSaved(false)
    setSaveError(null)
  }

  const scan = (): void => discover.mutate({})

  const use = (device: CameraDevice): void => {
    edit(setIp)(device.ip)
    document.getElementById('setup-camera-user')?.focus()
  }

  const runTest = async (): Promise<void> => {
    setTried(true)
    if (!source) return
    setTest(null)
    try {
      setTest(await probe.mutateAsync({ source }))
    } catch {
      setTest('failed')
    }
  }

  const applyProfile = async (): Promise<void> => {
    try {
      await update.mutateAsync(profileSettings(profile, table))
      setProfileApplied(true)
    } catch (error) {
      setSaveError(errorKey(error))
    }
  }

  const save = async (): Promise<void> => {
    setTried(true)
    if (!source) return
    setSaving(true)
    setSaveError(null)
    try {
      await setSecrets.mutateAsync({ source })
      await update.mutateAsync({ ...profileSettings(profile, table), 'camera.enabled': true })
      setSaved(true)
      setProfileApplied(true)
      setPassword('')
      onSaved?.()
    } catch (error) {
      setSaveError(errorKey(error))
    } finally {
      setSaving(false)
    }
  }

  // Enter in a field tries the connection (the wizard's own "İleri" and a dialog's save never see it).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    if (!(e.target instanceof HTMLInputElement)) return
    e.preventDefault()
    void runTest()
  }

  const machine = hardware.data
  const found = discover.data?.devices ?? []
  const shown = (name: string): string | undefined =>
    tried ? problems[name as keyof typeof problems] : undefined

  return (
    <div className="grid gap-6" onKeyDown={onKeyDown} data-testid="setup-camera-flow">
      {addonMissing ? <CameraAddonMissing /> : null}
      {/* 1. This computer */}
      <section className="grid gap-3" aria-labelledby="setup-camera-computer-title">
        <h3 id="setup-camera-computer-title" className="text-sm font-semibold">
          {t('setup.camera.computer.title')}
        </h3>
        {hardware.isPending ? (
          <Skeleton className="h-5 w-full max-w-md" />
        ) : hardware.isError || !machine ? (
          <p className="text-muted-foreground text-sm" data-testid="setup-camera-computer-failed">
            {t('setup.camera.computer.failed')}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="setup-camera-computer">
            {t('setup.camera.computer.summary', {
              cpu: machine.cpuModel || t('setup.camera.computer.unknownCpu'),
              cores: machine.cores,
              ram: machine.ramGb,
              os: OS_NAMES[machine.platform] ?? machine.platform
            })}
          </p>
        )}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('setup.camera.computer.profile')}</legend>
          <RadioGroup
            value={profile}
            onValueChange={(v) => {
              setProfileChoice(v as CameraProfile)
              setProfileApplied(false)
            }}
            className="grid gap-2 md:grid-cols-3"
            data-testid="setup-camera-profile"
          >
            {CAMERA_PROFILES.map((p) => (
              <Label
                key={p}
                htmlFor={`setup-camera-profile-${p}`}
                className="has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
              >
                <RadioGroupItem id={`setup-camera-profile-${p}`} value={p} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {t(`setup.camera.profile.${p}`)}
                    {machine?.recommended === p ? (
                      <Badge variant="secondary" data-testid={`setup-camera-recommended-${p}`}>
                        {t('setup.camera.computer.recommended')}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">{t(`setup.camera.profile.${p}Help`)}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={update.isPending || profileApplied}
            onClick={() => void applyProfile()}
            className="max-md:w-full"
            data-testid="setup-camera-apply-profile"
          >
            {t('setup.camera.computer.apply')}
          </Button>
          {profileApplied ? (
            <span
              className="text-muted-foreground text-sm"
              role="status"
              data-testid="setup-camera-profile-applied"
            >
              {t('setup.camera.computer.applied')}
            </span>
          ) : null}
        </div>
      </section>

      {/* 2. Find the camera */}
      <section className="grid gap-3" aria-labelledby="setup-camera-find-title">
        <h3 id="setup-camera-find-title" className="text-sm font-semibold">
          {t('setup.camera.find.title')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('setup.camera.find.help')}</p>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={discover.isPending}
            onClick={scan}
            className="max-md:w-full"
            data-testid="setup-camera-scan"
          >
            {discover.isPending ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <RadarIcon aria-hidden />
            )}
            {discover.isPending
              ? t('setup.camera.find.scanning')
              : discover.data
                ? t('setup.camera.find.rescan')
                : t('setup.camera.find.scan')}
          </Button>
        </div>
        <div aria-live="polite" className="grid gap-2" data-testid="setup-camera-found">
          {discover.isError ? (
            <p className="text-destructive text-sm" role="alert">
              {t('setup.camera.find.failed')}
            </p>
          ) : discover.data?.problem === 'network' ? (
            <p className="text-muted-foreground text-sm">{t('setup.camera.find.noNetwork')}</p>
          ) : discover.data && found.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="setup-camera-none">
              {t('setup.camera.find.empty')}
            </p>
          ) : null}
          {found.length > 0 ? (
            <>
              <p className="text-sm font-medium">{t('setup.camera.find.found', { count: found.length })}</p>
              <ul className="grid gap-2">
                {found.map((d) => (
                  <li
                    key={d.ip}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                    data-testid={`setup-camera-device-${d.ip}`}
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <bdi dir="ltr" className="font-medium tabular-nums">
                          {d.ip}
                        </bdi>
                        {d.protocols.map((p) => (
                          <Badge key={p} variant="outline">
                            {t(`setup.camera.find.${p}`)}
                          </Badge>
                        ))}
                        {d.activated === false ? (
                          <Badge variant="destructive">{t('setup.camera.find.notActivated')}</Badge>
                        ) : null}
                      </span>
                      {d.model ? (
                        <span className="text-muted-foreground text-xs break-words" dir="ltr">
                          {d.model}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => use(d)}
                      className="max-md:w-full"
                      data-testid={`setup-camera-use-${d.ip}`}
                    >
                      {t('setup.camera.find.use')}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>

      {/* 3. The camera's address */}
      <section className="grid gap-3" aria-labelledby="setup-camera-form-title">
        <h3 id="setup-camera-form-title" className="text-sm font-semibold">
          {t('setup.camera.form.title')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('setup.camera.form.help')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBox
            id="setup-camera-ip"
            label={t('setup.camera.form.ip')}
            error={shown('ip')}
            hint={t('setup.camera.form.ipHint')}
          >
            <Input
              id="setup-camera-ip"
              dir="ltr"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={ip}
              maxLength={15}
              aria-invalid={shown('ip') ? true : undefined}
              onChange={(e) => edit(setIp)(e.target.value)}
              data-testid="setup-camera-ip"
            />
          </FieldBox>
          <FieldBox id="setup-camera-port" label={t('setup.camera.form.port')} error={shown('port')}>
            <Input
              id="setup-camera-port"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={port}
              maxLength={5}
              aria-invalid={shown('port') ? true : undefined}
              onChange={(e) => edit(setPort)(e.target.value.replace(/\D/g, ''))}
              data-testid="setup-camera-port"
            />
          </FieldBox>
          <FieldBox id="setup-camera-user" label={t('setup.camera.form.user')} error={shown('user')}>
            <Input
              id="setup-camera-user"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={user}
              maxLength={64}
              aria-invalid={shown('user') ? true : undefined}
              onChange={(e) => edit(setUser)(e.target.value)}
              data-testid="setup-camera-user"
            />
          </FieldBox>
          <FieldBox
            id="setup-camera-password"
            label={t('setup.camera.form.password')}
            hint={t('setup.camera.form.passwordHint')}
          >
            <SecretInput
              id="setup-camera-password"
              value={password}
              onChange={edit(setPassword)}
              autoComplete="off"
              maxLength={64}
              aria={{ 'aria-invalid': undefined, 'aria-describedby': 'setup-camera-password-hint' }}
            />
          </FieldBox>
          <FieldBox
            id="setup-camera-channels"
            label={t('setup.camera.form.channels')}
            error={shown('channels')}
            hint={t('setup.camera.form.channelsHint')}
          >
            <Input
              id="setup-camera-channels"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={channels}
              maxLength={2}
              aria-invalid={shown('channels') ? true : undefined}
              onChange={(e) => {
                edit(setChannels)(e.target.value.replace(/\D/g, ''))
                setChannel('1')
              }}
              data-testid="setup-camera-channels"
            />
          </FieldBox>
          {(channelCount ?? 1) > 1 ? (
            <FieldBox id="setup-camera-channel" label={t('setup.camera.form.channel')}>
              <Select value={String(channelNumber)} onValueChange={(v) => edit(setChannel)(v)}>
                <SelectTrigger
                  id="setup-camera-channel"
                  className="w-full"
                  data-testid="setup-camera-channel"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: channelCount ?? 1 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {t('setup.camera.form.channelN', { n: i + 1 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldBox>
          ) : null}
        </div>
        {source ? (
          <p className="text-muted-foreground text-xs break-all" data-testid="setup-camera-address">
            {t('setup.camera.form.address')}: <bdi dir="ltr">{maskRtsp(source)}</bdi>
          </p>
        ) : null}
      </section>

      {/* 4. Try it, then save */}
      <section className="grid gap-3" aria-labelledby="setup-camera-test-title">
        <h3 id="setup-camera-test-title" className="text-sm font-semibold">
          {t('setup.camera.test.title')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={probe.isPending}
            onClick={() => void runTest()}
            className="max-md:w-full"
            data-testid="setup-camera-test"
          >
            {probe.isPending ? (
              <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <VideoIcon aria-hidden />
            )}
            {probe.isPending ? t('setup.camera.test.running') : t('setup.camera.test.run')}
          </Button>
        </div>
        <div aria-live="polite" className="grid gap-3" data-testid="setup-camera-test-result">
          {test === 'failed' ? (
            <Alert variant="destructive">
              <AlertTriangleIcon aria-hidden />
              <AlertDescription className="text-destructive">
                {t('setup.camera.test.failed')}
              </AlertDescription>
            </Alert>
          ) : test && test.ok ? (
            <>
              <Alert data-testid="setup-camera-test-ok">
                <CheckCircle2Icon aria-hidden />
                <AlertDescription>
                  {t('setup.camera.test.ok', { width: test.width, height: test.height })}
                </AlertDescription>
              </Alert>
              {test.image ? (
                <img
                  src={test.image}
                  alt={t('setup.camera.test.preview')}
                  className="aspect-video w-full max-w-md rounded-lg border object-cover"
                  data-testid="setup-camera-preview"
                />
              ) : null}
            </>
          ) : test ? (
            <Alert variant="destructive" data-testid="setup-camera-test-error">
              <AlertTriangleIcon aria-hidden />
              <AlertDescription className="text-destructive">
                {t(`setup.camera.test.${test.reason ?? 'noFrame'}`)}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={saving || saved}
            onClick={() => void save()}
            className="max-md:w-full"
            data-testid="setup-camera-save"
          >
            {saving ? t('setup.camera.save.saving') : t('setup.camera.save.run')}
          </Button>
          {saved ? (
            <span className="text-sm" role="status" data-testid="setup-camera-saved">
              {t('setup.camera.save.done')}
            </span>
          ) : null}
        </div>
        {saveError ? (
          <Alert variant="destructive" data-testid="setup-camera-save-error">
            <AlertTriangleIcon aria-hidden />
            <AlertDescription className="text-destructive">
              {t(saveError, { defaultValue: t('setup.camera.save.failed') })}
            </AlertDescription>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-xs">{t('setup.camera.save.note')}</p>
      </section>
    </div>
  )
}
