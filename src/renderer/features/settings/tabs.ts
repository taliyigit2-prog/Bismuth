// Settings sections (faz-04 madde 4): the open section lives in the URL (`#/settings?tab=rooms`) so a link, the
// command menu or a screenshot can open one directly. Older links keep working: `appearance` opens "Genel" (the
// two were merged) and `roles` opens "Kullanıcılar ve roller".
import type { PermissionKey, PermissionLevel } from '@shared/permissions'

export const SETTINGS_SECTIONS = [
  'general',
  'hotel',
  'rooms',
  'lists',
  'shifts',
  'tasks',
  'staff',
  'calendar',
  'tags',
  'currency',
  'remote',
  'backup',
  'users',
  'guide',
  'about'
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

/** Section names of earlier versions (Faz 3 links, screenshots) → the section that holds them now. */
const ALIASES = { appearance: 'general', roles: 'users' } as const satisfies Record<string, SettingsSection>

/** Every value `?tab=` accepts. */
export const SETTINGS_TABS = [...SETTINGS_SECTIONS, ...(Object.keys(ALIASES) as (keyof typeof ALIASES)[])]
export type SettingsTab = SettingsSection | keyof typeof ALIASES

export const isSettingsTab = (value: unknown): value is SettingsTab =>
  typeof value === 'string' && (SETTINGS_TABS as readonly string[]).includes(value)

export const sectionOf = (tab: SettingsTab | undefined): SettingsSection =>
  tab === undefined
    ? 'general'
    : tab in ALIASES
      ? ALIASES[tab as keyof typeof ALIASES]
      : (tab as SettingsSection)

/**
 * What a section needs to be seen (src/shared/permissions.ts): any one of these keys. "Genel" holds everyone's
 * display choices (language, theme…) and "Hakkında" the version: both are open to every signed-in user.
 */
const SECTION_NEEDS: Record<SettingsSection, readonly PermissionKey[]> = {
  general: [],
  hotel: ['settings'],
  rooms: ['settings.rooms'],
  lists: ['settings.lists'],
  shifts: ['settings'],
  tasks: ['tasks'],
  staff: ['staff.policy'],
  calendar: ['settings'],
  tags: ['settings.colors'],
  currency: ['currency'],
  remote: ['remote.settings', 'devices'],
  // Backups, and the export/import doors (`reports.export`: the manager exports without seeing backups).
  backup: ['settings.backup', 'reports.export'],
  users: ['settings.users', 'settings.roles'],
  // The guide is everyone's (G-18): "Ayarlar → Kılavuz" opens for every signed-in user.
  guide: [],
  about: []
}

/**
 * The key whose `edit` level lets a section change things (view only = the same controls, disabled, under a
 * "Yalnız görüntüleme" line). Sections with two keys (users and roles, remote access) say it per card.
 */
export const SECTION_EDIT: Partial<Record<SettingsSection, PermissionKey>> = {
  hotel: 'settings',
  rooms: 'settings.rooms',
  lists: 'settings.lists',
  shifts: 'settings',
  tasks: 'tasks',
  staff: 'staff.policy',
  calendar: 'settings',
  tags: 'settings.colors'
}

export type Can = (key: PermissionKey, level?: Exclude<PermissionLevel, 'none'>) => boolean

export const canOpenTab = (tab: SettingsTab, can: Can): boolean => {
  const needs = SECTION_NEEDS[sectionOf(tab)]
  return needs.length === 0 || needs.some((key) => can(key))
}
