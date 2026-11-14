// What the privacy notice says about this hotel (Faz 20 P20e; K-58): read from the settings (one entry, G-60).
import { useSettings } from '@/lib/api/hooks'

/** What the notice says about this hotel. */
export interface PrivacyFacts {
  /** The hotel's name, with its city when there is one. */
  hotel: string
  /** Where requests go: address and phone, else the e-mail; '' = a blank line to fill in by hand. */
  contact: string
  /** Alarms also go to Telegram (a transfer abroad), and with a picture or not. */
  telegram: boolean
  telegramPhoto: boolean
  /** Days a guest's face is kept after check-out (0 = deleted at check-out). */
  faceRetentionDays: number
  /** Days an alarm picture is kept. */
  alertRetentionDays: number
}

/**
 * The facts from the settings, with `override` on top (the setup wizard's draft). `null` while the settings load.
 */
export function usePrivacyFacts(override?: Partial<PrivacyFacts>): PrivacyFacts | null {
  const settings = useSettings()
  const v = settings.data
  if (!v) return null
  const city = v['hotel.city']
  const contact = v['camera.privacyContact'] || v['hotel.email']
  return {
    hotel: city ? `${v['hotel.name']}, ${city}` : v['hotel.name'],
    contact,
    telegram: v['camera.telegram.enabled'] && v['network.enabled'],
    telegramPhoto: v['camera.telegram.photo'],
    faceRetentionDays: v['camera.faceRetentionDays'],
    alertRetentionDays: v['camera.alertRetentionDays'],
    ...override
  }
}
