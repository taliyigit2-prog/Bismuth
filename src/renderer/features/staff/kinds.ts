// Look of each schedule day kind: a theme-token tint and border, the kind's icon in its colour, and the text in
// the normal foreground — small coloured text on a tint of the same colour is too faint (the grid reads without
// colour too: every kind has its own icon and name).
import {
  BriefcaseIcon,
  CoffeeIcon,
  MoonStarIcon,
  ThermometerIcon,
  TreePalmIcon,
  WalletMinimalIcon,
  type LucideIcon
} from 'lucide-react'
import type { DayKind } from './derive'

export const KIND_STYLE: Record<DayKind, string> = {
  work: 'bg-success/15 text-foreground border-success/60',
  rest_day: 'bg-muted text-muted-foreground border-border',
  annual: 'bg-chart-1/15 text-foreground border-chart-1/60',
  sick: 'bg-destructive/10 text-foreground border-destructive/60',
  unpaid: 'bg-warning/15 text-foreground border-warning/60',
  holiday_worked: 'bg-info/15 text-foreground border-info/60'
}
/** The icon keeps the kind's colour (≥ 3:1 on its tint). */
export const KIND_ICON_TONE: Record<DayKind, string> = {
  work: 'text-success',
  rest_day: 'text-muted-foreground',
  annual: 'text-chart-1',
  sick: 'text-destructive',
  unpaid: 'text-warning',
  holiday_worked: 'text-info'
}
export const KIND_ICON: Record<DayKind, LucideIcon> = {
  work: BriefcaseIcon,
  rest_day: CoffeeIcon,
  annual: TreePalmIcon,
  sick: ThermometerIcon,
  unpaid: WalletMinimalIcon,
  holiday_worked: MoonStarIcon
}
