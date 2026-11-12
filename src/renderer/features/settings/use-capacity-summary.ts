// What a room is from a capacity change's day, in words (Ayarlar → Odalar; K-27).
import { useTranslation } from 'react-i18next'
import type { CapacityChangeView } from '@shared/contract'

/** "2 yatak · satışta" / "kullanımda değil": what the room is from a change's day. */
export function useCapacitySummary(): (
  c: Pick<CapacityChangeView, 'active' | 'sellable' | 'beds'>
) => string {
  const { t } = useTranslation()
  return (c) =>
    !c.active
      ? t('settings.rooms.capacity.closed')
      : t(c.sellable ? 'settings.rooms.capacity.open' : 'settings.rooms.capacity.notForSale', {
          count: c.beds
        })
}
