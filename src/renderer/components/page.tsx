// Page frame: title, description, actions, and the "Örnek veri" mark on Faz 3 mock-ups so nobody mistakes
// invented records for the hotel's own. Most pages are capped for reading; wide pages (calendar) use the width.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FlaskConicalIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { PageHeader } from './page-header'

export function DemoBadge() {
  const { t } = useTranslation()
  // Not focusable: a sheet or dialog that contains it would focus it first and pop the tooltip. Screen readers get
  // the explanation as text; the tooltip is for the mouse.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-muted-foreground gap-1" data-testid="demo-badge">
          <FlaskConicalIcon aria-hidden />
          {t('common.demoData')}
          <span className="sr-only">{t('common.demoDataHint')}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent aria-hidden>{t('common.demoDataHint')}</TooltipContent>
    </Tooltip>
  )
}

export function Page({
  title,
  description,
  actions,
  demo = false,
  wide = false,
  children,
  className
}: {
  title: string
  description?: string
  actions?: ReactNode
  demo?: boolean
  wide?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto grid w-full min-w-0 gap-6', wide ? 'max-w-none' : 'max-w-6xl', className)}>
      <PageHeader
        title={title}
        description={description}
        badge={demo ? <DemoBadge /> : undefined}
        actions={actions}
      />
      {children}
    </div>
  )
}
