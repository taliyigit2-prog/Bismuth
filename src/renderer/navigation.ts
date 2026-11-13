// Every screen of the menu (faz-03 madde 3–4): grouped for the desktop sidebar, flagged for the phone (G-143,
// S-66). Each item names the permission that shows it (none: every signed-in user); hiding is not protection —
// the services check (G-23).
import {
  ArrowLeftRightIcon,
  BookOpenIcon,
  BedDoubleIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarHeartIcon,
  CctvIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  CoinsIcon,
  ContactRoundIcon,
  GlobeIcon,
  IdCardIcon,
  InfoIcon,
  LayoutGridIcon,
  ListChecksIcon,
  PackageSearchIcon,
  PaletteIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShirtIcon,
  ShoppingCartIcon,
  SunIcon,
  UserXIcon,
  UsersIcon,
  WalletIcon,
  WrenchIcon,
  type LucideIcon
} from 'lucide-react'
import type { PermissionKey } from '@shared/permissions'

export type NavPath =
  | '/calendar'
  | '/today'
  | '/calendar-notes'
  | '/in-house'
  | '/tasks'
  | '/shift'
  | '/rooms'
  | '/guests'
  | '/blacklist'
  | '/companies'
  | '/lost-items'
  | '/ledger'
  | '/month-end'
  | '/currency'
  | '/issues'
  | '/maintenance'
  | '/supply'
  | '/laundry'
  | '/camera'
  | '/contacts'
  | '/staff'
  | '/reports'
  | '/tourism'
  | '/settings'
  | '/audit'
  | '/theme-preview'
  | '/guide'
  | '/about'

export type NavLabelKey =
  | 'nav.about'
  | 'nav.audit'
  | 'nav.blacklist'
  | 'nav.calendar'
  | 'nav.camera'
  | 'nav.companies'
  | 'nav.calendarNotes'
  | 'nav.contacts'
  | 'nav.currency'
  | 'nav.guests'
  | 'nav.inHouse'
  | 'nav.issues'
  | 'nav.laundry'
  | 'nav.guide'
  | 'nav.ledger'
  | 'nav.lostItems'
  | 'nav.maintenance'
  | 'nav.monthEnd'
  | 'nav.reports'
  | 'nav.rooms'
  | 'nav.settings'
  | 'nav.shift'
  | 'nav.staff'
  | 'nav.supply'
  | 'nav.tasks'
  | 'nav.themePreview'
  | 'nav.today'
  | 'nav.tourism'

export type NavGroup = 'daily' | 'guests' | 'money' | 'operations' | 'staff' | 'reports' | 'system'

export interface NavItem {
  to: NavPath
  labelKey: NavLabelKey
  icon: LucideIcon
  group: NavGroup
  /**
   * The permission that shows the item; null = every signed-in user (Ayarlar: "Genel" and "Hakkında" are open to
   * all and each other section checks its own key, settings/tabs.ts; the About screen).
   */
  permission: PermissionKey | null
  /** Shown on the phone (G-143): 'bar' = bottom bar, 'more' = the "Daha fazla" sheet. */
  mobile: 'bar' | 'more' | null
  /** Leads the "Daha fazla" sheet, lowest first (faz-12 madde 6: phone book, then issues, at the top). */
  moreRank?: number
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDaysIcon,
    group: 'daily',
    permission: 'calendar',
    mobile: 'bar'
  },
  { to: '/today', labelKey: 'nav.today', icon: SunIcon, group: 'daily', permission: 'today', mobile: 'bar' },
  {
    to: '/calendar-notes',
    labelKey: 'nav.calendarNotes',
    icon: CalendarHeartIcon,
    group: 'daily',
    permission: 'calendar.notes',
    mobile: null
  },
  {
    to: '/in-house',
    labelKey: 'nav.inHouse',
    icon: BedDoubleIcon,
    group: 'daily',
    permission: 'in_house',
    mobile: 'more'
  },
  {
    to: '/tasks',
    labelKey: 'nav.tasks',
    icon: ListChecksIcon,
    group: 'daily',
    permission: 'tasks',
    mobile: 'more'
  },
  {
    to: '/shift',
    labelKey: 'nav.shift',
    icon: ArrowLeftRightIcon,
    group: 'daily',
    permission: 'shift_notes',
    mobile: 'more'
  },
  {
    to: '/rooms',
    labelKey: 'nav.rooms',
    icon: LayoutGridIcon,
    group: 'daily',
    permission: 'rooms.status',
    mobile: 'more'
  },
  {
    to: '/guests',
    labelKey: 'nav.guests',
    icon: UsersIcon,
    group: 'guests',
    permission: 'guests',
    mobile: 'bar'
  },
  {
    to: '/blacklist',
    labelKey: 'nav.blacklist',
    icon: UserXIcon,
    group: 'guests',
    permission: 'blacklist',
    mobile: null
  },
  {
    to: '/companies',
    labelKey: 'nav.companies',
    icon: Building2Icon,
    group: 'guests',
    permission: 'companies',
    mobile: null
  },
  {
    to: '/lost-items',
    labelKey: 'nav.lostItems',
    icon: PackageSearchIcon,
    group: 'guests',
    permission: 'lost_items',
    mobile: null
  },
  {
    to: '/ledger',
    labelKey: 'nav.ledger',
    icon: WalletIcon,
    group: 'money',
    permission: 'ledger',
    mobile: 'bar'
  },
  {
    to: '/month-end',
    labelKey: 'nav.monthEnd',
    icon: ClipboardCheckIcon,
    group: 'money',
    permission: 'reports.finance',
    mobile: 'more'
  },
  {
    to: '/currency',
    labelKey: 'nav.currency',
    icon: CoinsIcon,
    group: 'money',
    permission: 'currency',
    mobile: 'more'
  },
  {
    to: '/issues',
    labelKey: 'nav.issues',
    icon: WrenchIcon,
    group: 'operations',
    permission: 'room_issues',
    mobile: 'more',
    moreRank: 2
  },
  {
    to: '/maintenance',
    labelKey: 'nav.maintenance',
    icon: CalendarClockIcon,
    group: 'operations',
    permission: 'tasks',
    mobile: 'more'
  },
  {
    to: '/supply',
    labelKey: 'nav.supply',
    icon: ShoppingCartIcon,
    group: 'operations',
    permission: 'supplies',
    mobile: 'more'
  },
  {
    to: '/laundry',
    labelKey: 'nav.laundry',
    icon: ShirtIcon,
    group: 'operations',
    permission: 'laundry',
    mobile: 'more'
  },
  {
    to: '/camera',
    labelKey: 'nav.camera',
    icon: CctvIcon,
    group: 'operations',
    permission: 'camera',
    mobile: 'more'
  },
  {
    to: '/contacts',
    labelKey: 'nav.contacts',
    icon: ContactRoundIcon,
    group: 'operations',
    permission: 'contacts',
    mobile: 'more',
    moreRank: 1
  },
  {
    to: '/staff',
    labelKey: 'nav.staff',
    icon: IdCardIcon,
    group: 'staff',
    permission: 'staff',
    mobile: null
  },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    icon: ChartColumnIcon,
    group: 'reports',
    permission: 'reports.operations',
    mobile: 'more'
  },
  {
    to: '/tourism',
    labelKey: 'nav.tourism',
    icon: GlobeIcon,
    group: 'reports',
    permission: 'tourism_stats',
    mobile: null
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    icon: SettingsIcon,
    group: 'system',
    permission: null,
    mobile: 'more'
  },
  {
    to: '/audit',
    labelKey: 'nav.audit',
    icon: ScrollTextIcon,
    group: 'system',
    permission: 'audit_log',
    mobile: 'more'
  },
  {
    to: '/theme-preview',
    labelKey: 'nav.themePreview',
    icon: PaletteIcon,
    group: 'system',
    permission: 'settings.colors',
    mobile: null
  },
  {
    to: '/guide',
    labelKey: 'nav.guide',
    icon: BookOpenIcon,
    group: 'system',
    permission: null,
    mobile: 'more'
  },
  {
    to: '/about',
    labelKey: 'nav.about',
    icon: InfoIcon,
    group: 'system',
    permission: null,
    mobile: 'more'
  }
]

export const NAV_GROUPS: readonly NavGroup[] = [
  'daily',
  'guests',
  'money',
  'operations',
  'staff',
  'reports',
  'system'
]

/** Whether a role may see an item (view level of its permission; an item without one is open to everyone). */
export const navAllows = (item: NavItem, can: (key: PermissionKey) => boolean): boolean =>
  item.permission === null || can(item.permission)

/** The items a role may see. */
export function visibleNav(can: (key: PermissionKey) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => navAllows(item, can))
}
