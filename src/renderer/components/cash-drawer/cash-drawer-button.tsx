// The drawer in the top bar (faz-07 madde 2: "sağ üst, her zaman görünür — yetkili rollerde"): what should be in
// the drawer in the base currency, one click opens the full panel. Roles without the drawer right see nothing; a
// refused or failed read hides the button rather than breaking the bar.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { CashDrawerPanel, DrawerIcon, useCashPanel } from './cash-drawer-panel'

export function CashDrawerButton() {
  const can = useCan()
  if (!can('cash', 'view')) return null
  return <DrawerButton />
}

function DrawerButton() {
  const { t } = useTranslation()
  const f = useFormat()
  const mobile = useIsMobile()
  const query = useCashPanel()
  const [open, setOpen] = useState(false)
  if (!query.data) return null
  const base = query.data.baseCurrency
  const amount = f.money(query.data.drawer[base] ?? 0, base)
  const others = Object.keys(query.data.drawer).filter((c) => c !== base && query.data.drawer[c]).length
  const waiting = query.data.uncollectedCount + query.data.unsettledExpenseCount
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 max-md:min-w-11"
        onClick={() => {
          setOpen(true)
          void query.refetch()
        }}
        aria-label={t('ledger.drawer.open', { amount })}
        data-testid="cash-drawer-button"
      >
        <DrawerIcon aria-hidden />
        <span className="hidden tabular-nums sm:inline">
          <bdi>{amount}</bdi>
          {others ? <span className="text-muted-foreground ms-1">+{others}</span> : null}
        </span>
        {waiting ? (
          <span className="bg-primary size-2 rounded-full sm:hidden" aria-hidden data-testid="drawer-dot" />
        ) : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={mobile ? 'bottom' : 'right'}
          className={cn(
            'gap-0 overflow-y-auto',
            mobile ? 'max-h-[92dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]' : 'w-full sm:max-w-xl'
          )}
          data-testid="cash-drawer-sheet"
        >
          <SheetHeader className="border-b pe-14 text-start">
            <SheetTitle>{t('ledger.panel.title')}</SheetTitle>
            <SheetDescription>{t('ledger.drawer.description')}</SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <CashDrawerPanel compact />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
