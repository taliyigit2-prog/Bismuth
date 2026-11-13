// Ayarlar → Kamera → "Yeniden tara" (Faz 20 P20g, K-59): the setup wizard's camera flow in a dialog — read the computer,
// search the network again, try a new address and save it. Only the hotel computer's own window may open it.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RadarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { CameraFlow } from '../setup/camera-flow'

export function CameraRescan() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="max-md:w-full"
          data-testid="camera-rescan"
        >
          <RadarIcon aria-hidden />
          {t('settings.camera.rescan.button')}
        </Button>
      </div>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings.camera.rescan.title')}
        description={t('settings.camera.rescan.description')}
        className="sm:max-w-3xl"
        focusFirstOnPhone={false}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="camera-rescan-close"
          >
            {t('common.close')}
          </Button>
        }
      >
        {open ? <CameraFlow /> : null}
      </ResponsiveDialog>
    </>
  )
}
