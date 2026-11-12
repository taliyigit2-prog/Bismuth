// Quantity text of a product line: "11,5 kg", "24 adet" (quantities are kept in thousandths of the unit).
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/hooks/use-format'
import { QTY_SCALE, type ProductUnit } from './derive'

/** "11,5 kg", "24 adet" from a quantity in thousandths. */
export function useQty(): (qtyMilli: number, unit: ProductUnit) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return (qtyMilli, unit) => {
    const whole = qtyMilli % QTY_SCALE === 0
    const digits = whole ? 0 : qtyMilli % 100 === 0 ? 1 : qtyMilli % 10 === 0 ? 2 : 3
    return t('supply.qtyUnit', {
      qty: f.number(qtyMilli / QTY_SCALE, digits),
      unit: t(`supply.unit.${unit}`)
    })
  }
}
