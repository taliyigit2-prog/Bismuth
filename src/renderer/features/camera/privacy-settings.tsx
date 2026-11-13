// Ayarlar → Kamera → "Gizlilik ve saklama" (Faz 20 P20e; K-52, K-58, S-107): the privacy notice and its contact line,
// the staff exclusion list and the destruction report. The keep times themselves are the "Alarm ve saklama" fields
// above (`camera.faceRetentionDays`, `camera.alertRetentionDays`); this card only points to them.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useCan } from '@/lib/view-as'
import { PrivacyNoticeButton } from './privacy-notice'
import { RetentionReport } from './retention-report'
import { StaffExclusion } from './staff-exclusion'

function ContactField({
  value,
  disabled,
  onSave
}: {
  value: string
  disabled: boolean
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
      <Label htmlFor="camera-privacy-contact">{t('camera.privacy.contact')}</Label>
      <p id="camera-privacy-contact-help" className="text-muted-foreground text-xs">
        {t('camera.privacy.contactHelp')}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id="camera-privacy-contact"
          autoComplete="off"
          maxLength={200}
          value={text}
          disabled={disabled}
          placeholder={t('camera.privacy.contactPlaceholder')}
          aria-describedby="camera-privacy-contact-help"
          onChange={(e) => setText(e.target.value)}
          className="max-w-md max-md:max-w-none max-md:text-base"
          data-testid="camera-privacy-contact"
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

export function PrivacySettings({
  values,
  onSave
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  return (
    <Card data-testid="camera-privacy">
      <CardHeader>
        <CardTitle>{t('camera.privacy.title')}</CardTitle>
        <CardDescription>{t('camera.privacy.help')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ContactField
          key={values['camera.privacyContact']}
          value={values['camera.privacyContact']}
          disabled={!can('camera', 'edit')}
          onSave={(v) => onSave({ 'camera.privacyContact': v }, true)}
        />
        <div>
          <PrivacyNoticeButton />
        </div>
        <p className="text-muted-foreground text-xs">{t('camera.privacy.retentionHint')}</p>
        <Separator />
        {can('camera.enroll', 'view') ? (
          <>
            <StaffExclusion />
            <Separator />
          </>
        ) : null}
        <RetentionReport />
      </CardContent>
    </Card>
  )
}
