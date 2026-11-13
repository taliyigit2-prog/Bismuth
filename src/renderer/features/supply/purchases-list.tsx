// The purchases of the last two months (S-74, K-35): each is one expense in the ledger with its product lines.
// A wrong slip is voided here with a reason (it stays in the ledger as voided and leaves the price history); the
// slip's photo can be looked at or added.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CameraIcon, ReceiptTextIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import type { ProductOverview, PurchaseView } from '@shared/contract/procedures/supply'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { PhotoGallery } from '@/components/record-photos'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '../settings/use-admin'
import { monthOfDay, monthStart, shiftMonth } from './derive'
import { useQty } from './use-qty'

function VoidDialog({ purchase, onClose }: { purchase: PurchaseView; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [reason, setReason] = useState('')
  const voidIt = useAdminMutation('supply.voidPurchase', {
    invalidate: ['supply.overview', 'supply.purchases', 'supply.monthSummary', 'supply.priceHistory'],
    success: t('supply.purchases.voided')
  })
  return (
    <AlertDialog open onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('supply.purchases.voidTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('supply.purchases.voidBody', {
              date: f.date(purchase.date),
              amount: f.money(purchase.amountMinor, purchase.currency)
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="void-reason">{t('supply.purchases.reason')}</Label>
          <Textarea id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || voidIt.isPending}
            onClick={(e) => {
              e.preventDefault()
              voidIt.mutate({ id: purchase.id, reason: reason.trim() }, { onSuccess: onClose })
            }}
          >
            {t('supply.purchases.void')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function PurchasesList({
  today,
  products,
  canEdit,
  isMobile = false
}: {
  today: LocalDate
  products: readonly ProductOverview[]
  canEdit: boolean
  isMobile?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const qty = useQty()
  const from = monthStart(shiftMonth(monthOfDay(today), -1))
  const query = useApiQuery('supply.purchases', { from, to: today, includeVoided: true })
  const [voiding, setVoiding] = useState<PurchaseView | null>(null)
  const [photos, setPhotos] = useState<PurchaseView | null>(null)
  if (query.isPending)
    return (
      <div className="grid gap-2" role="status" aria-busy>
        <span className="sr-only">{t('common.loading')}</span>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const list = query.data
  if (!list.length)
    return (
      <EmptyState
        icon={ReceiptTextIcon}
        title={t('supply.purchases.emptyTitle')}
        body={
          canEdit
            ? t('supply.purchases.emptyBody')
            : isMobile
              ? t('supply.purchases.emptyBodyPhone')
              : t('supply.purchases.emptyBodyViewOnly')
        }
      />
    )
  const productOf = (id: string) => products.find((p) => p.id === id)
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">
        {t('supply.purchases.range', { from: f.date(from), to: f.date(today) })}
      </p>
      <ul className="grid gap-2" data-testid="purchase-list">
        {list.map((p) => (
          <li
            key={p.id}
            className={cn('bg-card grid gap-2 rounded-xl border p-3', p.voidedAt && 'text-muted-foreground')}
            data-testid={`purchase-${p.id}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{p.vendorName ?? p.description}</p>
                <p className="text-muted-foreground text-xs">
                  {[f.date(p.date), p.paidFromDrawer ? t('supply.purchases.drawer') : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.voidedAt ? <Badge variant="outline">{t('supply.purchases.voidedBadge')}</Badge> : null}
                <span className={cn('font-semibold tabular-nums', p.voidedAt && 'line-through')}>
                  <bdi>{f.money(p.amountMinor, p.currency)}</bdi>
                </span>
              </div>
            </div>
            <ul className="text-muted-foreground grid gap-0.5 text-sm">
              {p.items.map((i) => {
                const product = productOf(i.productId)
                return (
                  <li key={i.id} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {product?.name ?? '—'}{' '}
                      <span className="tabular-nums">
                        {t('supply.purchases.lineQty', {
                          qty: product ? qty(i.qtyMilli, product.unit) : f.number(i.qtyMilli / 1000),
                          price: f.money(i.unitPriceMinor, p.currency)
                        })}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <bdi>{f.money(i.amountMinor, p.currency)}</bdi>
                    </span>
                  </li>
                )
              })}
            </ul>
            {p.voidReason ? (
              <p className="text-xs">{t('supply.purchases.voidReason', { reason: p.voidReason })}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPhotos(p)}>
                <CameraIcon aria-hidden />
                {t('supply.purchases.photos')}
              </Button>
              {canEdit && !p.voidedAt ? (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVoiding(p)}>
                  {t('supply.purchases.void')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {voiding ? <VoidDialog purchase={voiding} onClose={() => setVoiding(null)} /> : null}
      {photos ? (
        <ResponsiveDialog
          open
          onOpenChange={(o) => (o ? null : setPhotos(null))}
          title={t('supply.purchases.photosTitle')}
          description={`${photos.vendorName ?? photos.description} · ${f.date(photos.date)}`}
        >
          <PhotoGallery target={{ kind: 'expense', id: photos.id }} canAdd={canEdit && !photos.voidedAt} />
        </ResponsiveDialog>
      ) : null}
    </div>
  )
}
