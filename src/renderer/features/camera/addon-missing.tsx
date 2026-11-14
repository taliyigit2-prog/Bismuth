// "Camera add-on not installed" (P20ffix): an installed Bismuth without `<userData>/camera-addon` cannot run the camera
// part. Setup wizard, Ayarlar → Kamera and its "Yeniden tara" show this one notice (the Kamera screen has its own state).
import { useTranslation } from 'react-i18next'
import { PackageOpenIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function CameraAddonMissing() {
  const { t } = useTranslation()
  return (
    <Alert role="status" data-testid="camera-addon-missing">
      <PackageOpenIcon aria-hidden />
      <AlertTitle>{t('camera.state.noAddon')}</AlertTitle>
      <AlertDescription>{t('camera.stateHelp.noAddon')}</AlertDescription>
    </Alert>
  )
}
