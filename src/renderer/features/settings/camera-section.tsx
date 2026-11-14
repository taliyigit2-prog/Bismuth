// "Kamera" (Faz 20 P20b; K-49…K-53, K-57, G-09): switching the camera system on, the camera's address, the Telegram
// copy of an alarm and the thresholds and retention days. Everything the sidecar reads is a setting (nothing is in the
// code); the camera address and the Telegram token are secrets: they only go in (the screen says "kayıtlı", never what
// it is) and only the hotel computer's own window may change them. A saved change restarts the camera system.
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, SendIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { CameraSecretsInput } from '@shared/contract/camera'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTransport } from '@/lib/api/api-context'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { PrivacySettings } from '../camera/privacy-settings'
import { CameraAddonMissing } from '../camera/addon-missing'
import { CameraRescan } from './camera-rescan'
import { numberValid, parseNumber, type NumberRule } from './camera-numbers'
import { SwitchRow } from './room-dialogs'

interface Props {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}

type NumberKey =
  | 'camera.alarmCooldownSeconds'
  | 'camera.alertRetentionDays'
  | 'camera.faceRetentionDays'
  | 'camera.similarityThreshold'
  | 'camera.confirmSimilarity'
  | 'camera.minFaceScore'
  | 'camera.minFacePx'
  | 'camera.confirmationFrames'
  | 'camera.processEveryN'
  | 'camera.verifiedTtlSeconds'

type FieldName =
  | 'cooldown'
  | 'alertRetention'
  | 'faceRetention'
  | 'similarity'
  | 'confirmSimilarity'
  | 'minFaceScore'
  | 'minFacePx'
  | 'confirmationFrames'
  | 'processEveryN'
  | 'verifiedTtl'

interface NumberField extends NumberRule {
  key: NumberKey
  /** `settings.camera.field.<name>` and `…Help`. */
  name: FieldName
}

// The limits are the contract's (settings.ts); the service refuses anything outside them.
const BASIC: readonly NumberField[] = [
  { key: 'camera.alarmCooldownSeconds', name: 'cooldown', min: 5, max: 3600, integer: true },
  { key: 'camera.alertRetentionDays', name: 'alertRetention', min: 1, max: 365, integer: true },
  { key: 'camera.faceRetentionDays', name: 'faceRetention', min: 0, max: 365, integer: true }
]
const ADVANCED: readonly NumberField[] = [
  { key: 'camera.similarityThreshold', name: 'similarity', min: 0.1, max: 0.95, integer: false },
  { key: 'camera.confirmSimilarity', name: 'confirmSimilarity', min: 0.1, max: 0.95, integer: false },
  { key: 'camera.minFaceScore', name: 'minFaceScore', min: 0.1, max: 0.99, integer: false },
  { key: 'camera.minFacePx', name: 'minFacePx', min: 20, max: 400, integer: true },
  { key: 'camera.confirmationFrames', name: 'confirmationFrames', min: 1, max: 20, integer: true },
  { key: 'camera.processEveryN', name: 'processEveryN', min: 1, max: 30, integer: true },
  { key: 'camera.verifiedTtlSeconds', name: 'verifiedTtl', min: 5, max: 300, integer: true }
]

function NumberSetting({
  field,
  value,
  disabled,
  onSave
}: {
  field: NumberField
  value: number
  disabled: boolean
  onSave: (value: number) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(String(value))
  const valid = numberValid(text, field)
  const changed = parseNumber(text) !== value
  const id = `camera-${field.name}`
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (valid && changed) onSave(parseNumber(text))
  }
  return (
    <form className="grid gap-1.5" onSubmit={submit}>
      <Label htmlFor={id}>{t(`settings.camera.field.${field.name}`)}</Label>
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {t(`settings.camera.field.${field.name}Help`)}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <div className="grid gap-1 max-md:w-full">
          <Input
            id={id}
            inputMode={field.integer ? 'numeric' : 'decimal'}
            dir="ltr"
            autoComplete="off"
            value={text}
            disabled={disabled}
            aria-invalid={!valid}
            aria-describedby={`${id}-help`}
            onChange={(e) => setText(e.target.value)}
            className="w-40 tabular-nums max-md:w-full max-md:text-base"
            data-testid={id}
          />
          {valid ? null : (
            <p className="text-destructive text-xs" role="alert">
              {t('settings.camera.numberInvalid', { min: field.min, max: field.max })}
            </p>
          )}
        </div>
        {disabled ? null : (
          <Button type="submit" variant="outline" disabled={!valid || !changed} className="max-md:w-full">
            {t('common.save')}
          </Button>
        )}
      </div>
    </form>
  )
}

function TextSetting({
  id,
  label,
  help,
  value,
  disabled,
  maxLength,
  onSave
}: {
  id: string
  label: string
  help: string
  value: string
  disabled: boolean
  maxLength: number
  onSave: (value: string) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const changed = text.trim() !== value
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) onSave(text.trim())
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {help}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id={id}
          autoComplete="off"
          maxLength={maxLength}
          value={text}
          disabled={disabled}
          aria-describedby={`${id}-help`}
          onChange={(e) => setText(e.target.value)}
          className="max-w-sm max-md:max-w-none max-md:text-base"
          data-testid={id}
        />
        {disabled ? null : (
          <Button type="submit" variant="outline" disabled={!changed} className="max-md:w-full">
            {t('common.save')}
          </Button>
        )}
      </div>
    </form>
  )
}

/** A secret: write only. "Kayıtlı" says it is set; the value never comes back. */
function SecretField({
  id,
  label,
  help,
  placeholder,
  isSet,
  disabled,
  saving,
  onSave,
  password = true
}: {
  id: string
  label: string
  help: string
  placeholder: string
  isSet: boolean
  disabled: boolean
  saving: boolean
  onSave: (value: string | null) => void
  password?: boolean
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) {
          onSave(text.trim())
          setText('')
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Badge variant={isSet ? 'secondary' : 'outline'} data-testid={`${id}-state`}>
          {isSet ? t('settings.camera.secretSet') : t('settings.camera.secretMissing')}
        </Badge>
      </div>
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        {help}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id={id}
          type={password ? 'password' : 'text'}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-describedby={`${id}-help`}
          onChange={(e) => setText(e.target.value)}
          className="max-w-md max-md:max-w-none max-md:text-base"
          data-testid={id}
        />
        {disabled ? null : (
          <>
            <Button type="submit" variant="outline" disabled={!text.trim() || saving}>
              {t('common.save')}
            </Button>
            {isSet ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => onSave(null)}>
                {t('settings.camera.secretRemove')}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </form>
  )
}

export function CameraSection({ values, onSave }: Props) {
  const { t } = useTranslation()
  const can = useCan()
  const transport = useTransport()
  const canEdit = can('camera', 'edit')
  // The camera address and the Telegram token are changed only in the hotel computer's own window (the service
  // refuses a phone as well).
  const canSecrets = canEdit && transport.kind === 'ipc'
  const status = useApiQuery('camera.status', {}, { refetchInterval: 10_000 })
  const secrets = status.data?.secrets
  const networkOn = status.data?.telegram.networkEnabled ?? true
  const setSecrets = useApiMutation('camera.setSecrets', {
    invalidates: ['camera.status'],
    onSuccess: () => toast.success(t('settings.saved')),
    onError: (error) =>
      toast.error(t('settings.saveFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const testTelegram = useApiMutation('camera.testTelegram', {
    onSuccess: (out) => {
      if (out.ok) toast.success(t('settings.camera.telegramTest.ok'))
      else toast.error(t(`settings.camera.telegramTest.${out.reason ?? 'none'}`))
    },
    onError: (error) =>
      toast.error(t('settings.camera.telegramTest.failed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const saveSecret = (patch: CameraSecretsInput): void => setSecrets.mutate(patch)
  const number = (f: NumberField) => (
    <NumberSetting
      key={`${f.key}-${values[f.key]}`}
      field={f}
      value={values[f.key]}
      disabled={!canEdit}
      onSave={(value) => onSave({ [f.key]: value }, true)}
    />
  )

  return (
    <div className="grid gap-6" data-testid="camera-settings">
      {status.data?.addonInstalled === false ? <CameraAddonMissing /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.camera.systemTitle')}</CardTitle>
          <CardDescription>{t('settings.camera.systemHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <SwitchRow
            id="camera-enabled"
            label={t('settings.camera.enabled')}
            help={t('settings.camera.enabledHelp')}
            checked={values['camera.enabled']}
            disabled={!canEdit}
            onChange={(v) => onSave({ 'camera.enabled': v }, true)}
          />
          <TextSetting
            key={values['camera.location']}
            id="camera-location"
            label={t('settings.camera.location')}
            help={t('settings.camera.locationHelp')}
            value={values['camera.location']}
            disabled={!canEdit}
            maxLength={80}
            onSave={(v) => onSave({ 'camera.location': v }, true)}
          />
          <SecretField
            id="camera-source"
            label={t('settings.camera.source')}
            help={t('settings.camera.sourceHelp')}
            placeholder={t('settings.camera.sourcePlaceholder')}
            isSet={secrets?.source ?? false}
            disabled={!canSecrets}
            saving={setSecrets.isPending}
            onSave={(v) => saveSecret({ source: v })}
          />
          {canSecrets ? <CameraRescan /> : null}
          {canEdit && !canSecrets ? (
            <p className="text-muted-foreground text-xs">{t('settings.camera.secretsHostOnly')}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.camera.telegramTitle')}</CardTitle>
          <CardDescription>{t('settings.camera.telegramHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <SwitchRow
            id="camera-telegram-enabled"
            label={t('settings.camera.telegramEnabled')}
            help={t('settings.camera.telegramEnabledHelp')}
            checked={values['camera.telegram.enabled']}
            disabled={!canEdit}
            onChange={(v) => onSave({ 'camera.telegram.enabled': v }, true)}
          />
          {values['camera.telegram.enabled'] && !networkOn ? (
            <p className="text-muted-foreground text-sm" role="status" data-testid="camera-network-off">
              {t('settings.camera.networkOff')}
            </p>
          ) : null}
          <SwitchRow
            id="camera-telegram-photo"
            label={t('settings.camera.telegramPhoto')}
            help={t('settings.camera.telegramPhotoHelp')}
            checked={values['camera.telegram.photo']}
            disabled={!canEdit}
            onChange={(v) => onSave({ 'camera.telegram.photo': v }, true)}
          />
          <SecretField
            id="camera-telegram-token"
            label={t('settings.camera.telegramToken')}
            help={t('settings.camera.telegramTokenHelp')}
            placeholder={t('settings.camera.telegramTokenPlaceholder')}
            isSet={secrets?.telegramToken ?? false}
            disabled={!canSecrets}
            saving={setSecrets.isPending}
            onSave={(v) => saveSecret({ telegramToken: v })}
          />
          <SecretField
            id="camera-telegram-chats"
            label={t('settings.camera.telegramChats')}
            help={t('settings.camera.telegramChatsHelp')}
            placeholder={t('settings.camera.telegramChatsPlaceholder')}
            isSet={secrets?.telegramChats ?? false}
            disabled={!canSecrets}
            saving={setSecrets.isPending}
            password={false}
            onSave={(v) => saveSecret({ telegramChatIds: v })}
          />
          {canSecrets ? (
            <div>
              <Button
                variant="outline"
                disabled={testTelegram.isPending}
                onClick={() => testTelegram.mutate({})}
                data-testid="camera-telegram-test"
              >
                <SendIcon aria-hidden />
                {t('settings.camera.telegramTestButton')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.camera.alarmTitle')}</CardTitle>
          <CardDescription>{t('settings.camera.alarmHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">{BASIC.map(number)}</CardContent>
      </Card>

      <PrivacySettings values={values} onSave={onSave} />

      <Collapsible asChild>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto justify-between px-0 py-0 text-start whitespace-normal hover:bg-transparent [&[data-state=open]>svg]:rotate-180"
                data-testid="camera-advanced-toggle"
              >
                <span className="grid gap-1">
                  <CardTitle>{t('settings.camera.advancedTitle')}</CardTitle>
                  <CardDescription>{t('settings.camera.advancedHelp')}</CardDescription>
                </span>
                <ChevronDownIcon
                  className="transition-transform duration-200 motion-reduce:transition-none"
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="grid gap-5" data-testid="camera-advanced">
              {ADVANCED.map(number)}
              <TextSetting
                key={values['camera.zonePolygon']}
                id="camera-zone"
                label={t('settings.camera.zone')}
                help={t('settings.camera.zoneHelp')}
                value={values['camera.zonePolygon']}
                disabled={!canEdit}
                maxLength={300}
                onSave={(v) => onSave({ 'camera.zonePolygon': v }, true)}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
