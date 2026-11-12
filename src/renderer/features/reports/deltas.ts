// Change against the previous period for KPI cards (reports, month-end): money in percent, ratios in points.
import { useTranslation } from 'react-i18next'
import { basisPoints } from '@shared/domain/reports'
import type { KpiDelta } from '@/components/kpi-card'
import { useFormat } from '@/hooks/use-format'

export function useDeltas() {
  const { t } = useTranslation()
  const f = useFormat()
  const direction = (d: number): KpiDelta['direction'] => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat')
  return {
    /** Relative change of an amount; `upIsGood` = revenue/profit (true) or expenses (false). */
    percent(cur: number, prev: number, upIsGood: boolean): KpiDelta | undefined {
      if (!prev) return undefined
      const diff = cur - prev
      const bp = Math.sign(diff) * basisPoints(Math.abs(diff), Math.abs(prev))
      return {
        label: t('reports.delta.percent', { value: `${bp > 0 ? '+' : ''}${f.percent(bp, 1)}` }),
        direction: direction(bp),
        good: upIsGood ? bp >= 0 : bp <= 0
      }
    },
    /** Change of a ratio in percentage points (occupancy 73,7 % → 76,2 % = +2,5 points). */
    points(curBp: number, prevBp: number): KpiDelta {
      const diff = curBp - prevBp
      return {
        label: t('reports.delta.points', { value: `${diff > 0 ? '+' : ''}${f.number(diff / 100, 1)}` }),
        direction: direction(diff),
        good: diff >= 0
      }
    }
  }
}
