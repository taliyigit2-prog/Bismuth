// Settings (faz-04 madde 4; G-08, G-11…G-17, G-20…G-25, G-33, G-48, G-82, G-140…G-146): fourteen sections — the
// display choices everyone has, the hotel, rooms and types, lists, shifts, task suggestions, pay rules, calendar,
// status tags, currency, remote access, backup, users and roles, about. A vertical section list beside the content
// on the desktop (fourteen do not fit as tabs at 1366 px), one picker on the phone; the open section is in the URL.
// A section the role may not see is left out of the list and, opened by address, says so; a section it may only
// see says "Yalnız görüntüleme" and shows its controls disabled (values still readable). The services refuse anyway
// (G-23).
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  BedDoubleIcon,
  BookOpenIcon,
  Building2Icon,
  CalendarDaysIcon,
  CctvIcon,
  ClockIcon,
  CoinsIcon,
  DatabaseBackupIcon,
  GlobeIcon,
  InfoIcon,
  ListChecksIcon,
  ListIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TagIcon,
  UsersRoundIcon,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import type { SettingsPatch } from '@shared/contract'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/page'
import { ErrorState, LoadingState, NoAccessState } from '@/components/states'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { AppearanceSection } from './appearance-section'
import { CalendarSection } from './calendar-section'
import { CameraSection } from './camera-section'
import { GeneralSection, IdleLockCard } from './general-section'
import { FeesCard } from './fees-card'
import { HotelSection } from './hotel-section'
import { ListsSection } from './lists-section'
import { AboutNote, CurrencyNote } from './note-sections'
import { BackupSection } from './backup-section'
import { RemoteSection } from './remote-section'
import { RolesSection } from './roles-section'
import { RoomsSection } from './rooms-section'
import { ShiftsSection } from './shifts-section'
import { StaffPolicySection } from './staff-policy-section'
import { StatusTagsSection } from './status-tags-section'
import { TaskSuggestionsSection } from './task-suggestions-section'
import { UsersSection } from './users-section'
import { GuideSettingsCard } from '@/features/guide/guide-settings-card'
import {
  canOpenTab,
  isSettingsTab,
  SECTION_EDIT,
  sectionOf,
  SETTINGS_SECTIONS,
  type SettingsSection,
  type SettingsTab
} from './tabs'
import { VIEW_ONLY_FIELDS, ViewOnlyNote } from './view-only'

const ICONS: Record<SettingsSection, LucideIcon> = {
  general: SlidersHorizontalIcon,
  hotel: Building2Icon,
  rooms: BedDoubleIcon,
  lists: ListIcon,
  shifts: ClockIcon,
  tasks: ListChecksIcon,
  staff: UsersRoundIcon,
  calendar: CalendarDaysIcon,
  tags: TagIcon,
  currency: CoinsIcon,
  camera: CctvIcon,
  remote: GlobeIcon,
  backup: DatabaseBackupIcon,
  users: ShieldCheckIcon,
  guide: BookOpenIcon,
  about: InfoIcon
}

/**
 * A section the role may not see says so instead of showing its controls; one it may only see says that on one
 * line above them.
 */
function Guarded({ section, children }: { section: SettingsSection; children: ReactNode }) {
  const can = useCan()
  if (!canOpenTab(section, can)) return <NoAccessState />
  const editKey = SECTION_EDIT[section]
  if (!editKey || can(editKey, 'edit')) return children
  return (
    <div className={cn('grid gap-4', VIEW_ONLY_FIELDS)} data-view-only>
      <ViewOnlyNote />
      {children}
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const can = useCan()
  const settings = useSettings()
  const update = useUpdateSettings()
  const search: { tab?: SettingsTab } = useSearch({ strict: false })
  const navigate = useNavigate()
  // H-09: only sections the role may open are listed; an address naming another one (or none we know) opens the
  // first one it may ("Genel" is open to everyone), so no refused section name ever shows up in the list.
  const sections = SETTINGS_SECTIONS.filter((key) => canOpenTab(key, can))
  const asked = sectionOf(search.tab)
  const section = sections.includes(asked) ? asked : (sections[0] ?? 'general')
  const open = (next: string): void => {
    if (isSettingsTab(next)) void navigate({ to: '.', search: { tab: next }, replace: true })
  }

  const save = (patch: SettingsPatch, announce = false, onDone?: () => void): void => {
    update.mutate(patch, {
      onSuccess: () => {
        if (announce) toast.success(t('settings.saved'))
        onDone?.()
      },
      onError: (error) =>
        toast.error(t('settings.saveFailed'), {
          description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
        })
    })
  }

  const body = (key: SettingsSection): ReactNode => {
    const values = settings.data
    if (!values) return null
    switch (key) {
      case 'general':
        return (
          <div className="grid gap-6">
            <GeneralSection values={values} onSave={save} />
            <AppearanceSection values={values} onSave={save} />
            <IdleLockCard values={values} onSave={save} />
          </div>
        )
      case 'hotel':
        return (
          <div className="grid gap-6">
            <HotelSection values={values} onSave={save} pending={update.isPending} />
            <FeesCard values={values} onSave={save} />
          </div>
        )
      case 'rooms':
        return <RoomsSection values={values} />
      case 'lists':
        return <ListsSection values={values} />
      case 'shifts':
        return <ShiftsSection />
      case 'tasks':
        return <TaskSuggestionsSection />
      case 'staff':
        return <StaffPolicySection values={values} onSave={save} />
      case 'calendar':
        return <CalendarSection values={values} onSave={save} />
      case 'tags':
        return <StatusTagsSection values={values} onSave={save} />
      case 'currency':
        return <CurrencyNote />
      case 'camera':
        return <CameraSection values={values} onSave={save} />
      case 'remote':
        return <RemoteSection />
      case 'backup':
        return <BackupSection values={values} onSave={save} />
      case 'users':
        return (
          <div className="grid gap-6">
            <UsersSection />
            <RolesSection />
          </div>
        )
      case 'guide':
        return <GuideSettingsCard values={values} onSave={save} />
      case 'about':
        return <AboutNote />
    }
  }

  return (
    <Page title={t('settings.title')} description={t('settings.description')}>
      {settings.isPending ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : null}
      {settings.data ? (
        <div className="flex items-start gap-6">
          {isMobile ? null : (
            // Links, not tabs: every section has its own address, and the sections hold tabs of their own.
            <nav
              aria-label={t('settings.sections')}
              className="sticky top-20 grid w-52 shrink-0 gap-0.5"
              data-testid="settings-tabs"
            >
              {sections.map((key) => {
                const Icon = ICONS[key]
                const current = key === section
                return (
                  <Button
                    key={key}
                    asChild
                    variant={current ? 'secondary' : 'ghost'}
                    className={cn(
                      'h-auto min-h-9 justify-start gap-2.5 px-3 py-1.5 text-start whitespace-normal',
                      current ? 'font-semibold' : 'text-muted-foreground font-normal'
                    )}
                  >
                    <Link
                      to="."
                      search={{ tab: key }}
                      replace
                      aria-current={current ? 'page' : undefined}
                      data-testid={`settings-tab-${key}`}
                    >
                      <Icon aria-hidden />
                      {t(`settings.tab.${key}`)}
                    </Link>
                  </Button>
                )
              })}
            </nav>
          )}
          <div className="grid w-full min-w-0 flex-1 gap-6" data-testid={`settings-section-${section}`}>
            {isMobile ? (
              <Select value={section} onValueChange={open}>
                <SelectTrigger
                  className="w-full"
                  aria-label={t('settings.sections')}
                  data-testid="settings-tabs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((key) => (
                    <SelectItem key={key} value={key} data-testid={`settings-tab-${key}`}>
                      {t(`settings.tab.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Guarded section={section}>{body(section)}</Guarded>
          </div>
        </div>
      ) : null}
    </Page>
  )
}
