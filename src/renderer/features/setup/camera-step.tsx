// Step 11 — camera (Faz 20 P20g, K-59; optional): the computer's facts and a performance profile, a search of the local
// network, the camera's address and a one-picture test. A hotel without a camera skips it; Ayarlar → Kamera holds the
// same flow afterwards ("Yeniden tara"). Everything is saved by the flow's own button (the address with its password is a
// secret, never part of the wizard's saved answers); "İleri" without saving adds no camera.
// The privacy notice (K-58, P20e) is offered here too: the hotel prints it before the cameras start.
import { PrivacyNoticeButton } from '@/features/camera/privacy-notice'
import { CameraFlow } from './camera-flow'

export function CameraStep() {
  return (
    <div className="flex flex-col gap-4">
      <CameraFlow />
      <div>
        <PrivacyNoticeButton />
      </div>
    </div>
  )
}
