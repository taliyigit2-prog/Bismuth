// The price change badge ("zam") of the supply screen: the last purchase's unit price against the one before it.
import { useTranslation } from 'react-i18next'
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'

export interface ChangeLike {
  diffMinor: number
  basisPoints: number | null
  isIncrease: boolean
  currency: string
}

/** `withAmount` adds the difference in money ("+%8,3 zam · +₺5"). */
export function ChangeBadge({
  change,
  className,
  withAmount = false
}: {
  change: ChangeLike | null
  className?: string
  withAmount?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  if (!change)
    return <span className={cn('text-muted-foreground text-xs', className)}>{t('supply.firstPurchase')}</span>
  if (change.diffMinor === 0)
    return (
      <span className={cn('text-muted-foreground inline-flex items-center gap-0.5 text-xs', className)}>
        <MinusIcon className="size-3.5" aria-hidden />
        {t('supply.noChange')}
      </span>
    )
  const pct = change.basisPoints === null ? '' : f.percent(Math.abs(change.basisPoints))
  const amount = f.money(Math.abs(change.diffMinor), change.currency)
  return change.isIncrease ? (
    <Badge variant="destructive" className={cn('tabular-nums', className)} data-testid="price-rise">
      <ArrowUpRightIcon aria-hidden />
      {withAmount ? t('supply.riseWithAmount', { pct, amount }) : t('supply.rise', { pct })}
    </Badge>
  ) : (
    <Badge variant="outline" className={cn('border-success text-success tabular-nums', className)}>
      <ArrowDownRightIcon aria-hidden />
      {withAmount ? t('supply.dropWithAmount', { pct, amount }) : t('supply.drop', { pct })}
    </Badge>
  )
}
