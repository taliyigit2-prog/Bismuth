import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  badge,
  actions
}: {
  title: string
  description?: string
  /** Beside the title on every screen size ("Örnek veri"), so it never competes with the actions for a row. */
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {/* Phone: the actions sit under the title, full width, the main button stretching (docs/tasarim.md §9). */}
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:[&>[data-slot=button]]:flex-1">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
