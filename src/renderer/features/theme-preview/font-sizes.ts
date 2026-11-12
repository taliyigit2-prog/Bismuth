// Text sizes a person can pick (faz-15 madde 5, "büyük yazı modu"): Ayarlar → Görünüm and Tema önizleme.
import type { SettingsValues } from '@shared/contract'

export const FONT_SIZES = [
  { value: 'normal', key: 'settings.fontSizeNormal' },
  { value: 'large', key: 'settings.fontSizeLarge' },
  { value: 'larger', key: 'settings.fontSizeLarger' }
] as const

export const isFontSize = (v: string): v is SettingsValues['ui.fontSize'] =>
  FONT_SIZES.some((o) => o.value === v)
