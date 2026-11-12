// Ayarlar → Kılavuz (G-18, S-52): the guide is always one click away here, the first-run tour can be started
// again, and whoever may change the hotel's settings decides whether new accounts see the tour by themselves.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRightIcon, CompassIcon } from 'lucide-react'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCan } from '@/lib/view-as'
import { SwitchRow } from '@/features/settings/room-dialogs'
import { startTour } from './tour-store'

export function GuideSettingsCard({
  values,
  onSave
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  return (
    <Card data-testid="guide-settings">
      <CardHeader>
        <CardTitle className="max-md:sr-only">{t('guide.settings.title')}</CardTitle>
        <CardDescription className="max-w-prose text-pretty">{t('guide.settings.body')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-wrap gap-2">
          <Button asChild className="max-md:w-full">
            <Link to="/guide" data-testid="guide-settings-open">
              {t('guide.settings.open')}
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={startTour}
            className="max-md:w-full"
            data-testid="guide-settings-tour"
          >
            <CompassIcon aria-hidden />
            {t('guide.tour.restart')}
          </Button>
        </div>
        <SwitchRow
          id="guide-tour-new-users"
          label={t('guide.settings.newUsers')}
          help={t('guide.settings.newUsersHelp')}
          checked={values['guide.tourForNewUsers']}
          disabled={!can('settings', 'edit')}
          onChange={(value) => onSave({ 'guide.tourForNewUsers': value }, true)}
        />
      </CardContent>
    </Card>
  )
}
