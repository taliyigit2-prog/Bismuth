// "Genel": everyone's own choices — the language and the first screen (G-08, K-37: kept for the person, the hotel's
// value is the default). The theme, amounts and density are the card below (appearance-section.tsx); the hotel's
// own data moved to "Otel". The screen lock after idle minutes is the hotel's (security.idleLockMinutes): shown to
// everyone, changed only with the settings permission (the service checks it too, G-23).
import { useTranslation } from 'react-i18next'
import { LockIcon } from 'lucide-react'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { APP_LOCALES, isAppLocale } from '@shared/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCan } from '@/lib/view-as'
import { ViewOnlyNote } from './view-only'

interface Props {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}

/** Idle minutes before the window locks; 0 = never. */
const IDLE_LOCK_CHOICES = [0, 5, 10, 15, 30, 60] as const

export function GeneralSection({ values, onSave }: Props) {
  const { t } = useTranslation()
  return (
    <Card>
      {/* On the phone the section picker right above already says "Genel"; the note stays. */}
      <CardHeader>
        <CardTitle className="max-md:sr-only">{t('settings.sectionGeneral')}</CardTitle>
        <CardDescription data-testid="personal-note">{t('settings.personalNote')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="language">{t('settings.language')}</Label>
          <Select
            value={values['ui.language']}
            onValueChange={(v) => {
              if (isAppLocale(v)) onSave({ 'ui.language': v })
            }}
          >
            <SelectTrigger id="language" data-testid="language-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_LOCALES.map((lng) => (
                <SelectItem key={lng} value={lng} data-testid={`language-${lng}`}>
                  {t(`language.${lng}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CardDescription>{t('settings.languageHelp')}</CardDescription>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="start-screen">{t('settings.startScreen')}</Label>
          <Select
            value={values['ui.startScreen']}
            onValueChange={(v) => {
              if (v === 'calendar' || v === 'today') onSave({ 'ui.startScreen': v })
            }}
          >
            <SelectTrigger id="start-screen" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="calendar">{t('nav.calendar')}</SelectItem>
              <SelectItem value="today">{t('nav.today')}</SelectItem>
            </SelectContent>
          </Select>
          <CardDescription>{t('settings.startScreenHelp')}</CardDescription>
        </div>
      </CardContent>
    </Card>
  )
}

/** "Ekran kilidi": the hotel's idle lock, for every window of the hotel. */
export function IdleLockCard({ values, onSave }: Props) {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const current = values['security.idleLockMinutes']
  // A value set elsewhere (another version, the database) stays choosable rather than showing an empty field.
  const choices = [...new Set<number>([...IDLE_LOCK_CHOICES, current])].sort((a, b) => a - b)
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CardTitle className="flex items-center gap-2">
            <LockIcon className="text-muted-foreground size-4" aria-hidden />
            {t('settings.idleLock.title')}
          </CardTitle>
          {canEdit ? null : <ViewOnlyNote help={t('settings.idleLock.viewOnly')} />}
        </div>
        <CardDescription>{t('settings.idleLock.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid content-start gap-2 md:max-w-[calc(50%-0.75rem)]">
          <Label htmlFor="idle-lock">{t('settings.idleLock.label')}</Label>
          <Select
            value={String(current)}
            disabled={!canEdit}
            onValueChange={(v) => {
              const minutes = Number(v)
              if (Number.isInteger(minutes)) onSave({ 'security.idleLockMinutes': minutes }, true)
            }}
          >
            <SelectTrigger id="idle-lock" className="w-full" data-testid="idle-lock">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((m) => (
                <SelectItem key={m} value={String(m)} data-testid={`idle-lock-${m}`}>
                  {m === 0 ? t('settings.idleLock.never') : t('settings.idleLock.minutes', { count: m })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
