// Settings keys, their validation and defaults. One row per key in the `settings` table.
// Hotel-specific rules are settings, never code (CLAUDE.md yasak 10).
import * as z from 'zod'
import { APP_LOCALES } from '../format'
import { DEFAULT_FX_SOURCES, FX_PROVIDERS } from '../domain/external'
import { CALENDAR_MIN_START_YEAR } from '../domain/calendar-range'
import { MAX_ZOOM, MIN_ZOOM } from '../window-zoom'

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code')
/** Most currencies a hotel can accept at once (the setup draft and `hotel.currencies` share it). */
export const MAX_ACCEPTED_CURRENCIES = 20
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color #rrggbb')

/** A time zone the clock library knows ("Europe/Istanbul"); a made-up one ("Mars/Olympus") is refused. */
export function isTimeZone(zone: string): boolean {
  try {
    return Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone.length > 0
  } catch {
    return false
  }
}
/** IANA time zone of the hotel: every business day ("bugün") is counted in it (Faz 4 bug hunt #11). */
export const timeZoneSchema = z.string().trim().min(1).max(64).refine(isTimeZone, 'IANA time zone')

// Keys of the automatic reservation statuses (G-32, G-33).
export const STATUS_KEYS = ['paid', 'unpaid', 'partial', 'dayuse', 'pastEmpty', 'empty', 'blocked'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

export const statusColorsSchema = z.partialRecord(z.enum(STATUS_KEYS), hexColor)
export type StatusColors = z.infer<typeof statusColorsSchema>

export const THEME_MODES = ['light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

/**
 * Default status colours per theme — the same values as `--status-*` in src/renderer/styles/globals.css
 * (a test keeps them in sync). Light follows the owner's Excel (G-32); dark keeps every status
 * distinguishable on a dark background ("Boş" is the background itself, so "Satılmaz" cannot be black).
 */
export const STATUS_DEFAULT_COLORS: Record<ThemeMode, Record<StatusKey, string>> = {
  light: {
    paid: '#ef4444',
    unpaid: '#facc15',
    partial: '#fb923c',
    dayuse: '#22d3ee',
    pastEmpty: '#9ca3af',
    empty: '#ffffff',
    blocked: '#111827'
  },
  dark: {
    paid: '#ef4444',
    unpaid: '#facc15',
    partial: '#fb923c',
    dayuse: '#22d3ee',
    pastEmpty: '#3f3f46',
    empty: '#0d0d11',
    blocked: '#71717a'
  }
}

export const settingsShape = {
  'ui.language': z.enum(APP_LOCALES),
  'ui.theme': z.enum(['light', 'dark', 'system']),
  'ui.showMinor': z.boolean(),
  'ui.density': z.enum(['comfortable', 'compact']),
  'ui.startScreen': z.enum(['calendar', 'today']),
  /** Owner's status colours for the light theme; `ui.statusColorsDark` for the dark theme. */
  'ui.statusColors': statusColorsSchema,
  'ui.statusColorsDark': statusColorsSchema,
  /**
   * The hotel's accent colour (faz-15 madde 6: primary buttons, the selected item, today's line, focus rings), per
   * theme like the status colours; null = Bismuth's own. Text on it is derived (`readableOn`).
   */
  'ui.accentColor': hexColor.nullable(),
  'ui.accentColorDark': hexColor.nullable(),
  /** Larger text for everyone who wants it (faz-15 madde 5, "büyük yazı modu"): the whole interface scales. */
  'ui.fontSize': z.enum(['normal', 'large', 'larger']),
  /** Page zoom of this computer's window in percent (Ctrl +/-/0, Ayarlar → Görünüm); each person's own choice. */
  'ui.zoom': z.number().int().min(MIN_ZOOM).max(MAX_ZOOM),
  /** The person has seen (or skipped) the first-run tour (G-18); "Tanıtım turunu yeniden başlat" shows it again. */
  'ui.tourDone': z.boolean(),
  /** The desktop menu is folded to its icons (each person's own choice, kept across restarts; faz-15 madde 7). */
  'ui.sidebarCollapsed': z.boolean(),
  /** New accounts see the short first-run tour once (Ayarlar → Kılavuz); the hotel may switch it off. */
  'guide.tourForNewUsers': z.boolean(),
  'hotel.name': z.string().trim().min(1).max(80),
  /** ISO 3166-1 alpha-2: holidays and weather (G-10, G-16). */
  'hotel.country': z.string().regex(/^[A-Z]{2}$/, 'ISO 3166 code'),
  /** Weather location (Faz 11). */
  'hotel.city': z.string().trim().max(80),
  /**
   * The hotel's e-mail address (K-13): the weather service (MET Norway) asks who is calling, so it goes in that one
   * request's User-Agent and nowhere else; '' = the project's address instead.
   */
  'hotel.email': z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === '' || z.email().safeParse(v).success, 'email'),
  /** IANA time zone of the hotel ("Europe/Istanbul"). */
  'hotel.timezone': timeZoneSchema,
  /** standalone: this computer alone; host: the hotel's main computer others connect to; client: uses a host. */
  'app.mode': z.enum(['standalone', 'host', 'client']),
  /** Minutes without a key or mouse before the window locks (G-22); 0 = never. */
  'security.idleLockMinutes': z.number().int().min(0).max(240),
  /** Base currency of all totals and reports; rates are frozen to it (K-15). */
  'hotel.baseCurrency': currencyCode,
  /** Currencies offered in amount fields (Excel: TL, Euro, Dolar, Sterlin, Ruble). */
  'hotel.currencies': z.array(currencyCode).min(1).max(MAX_ACCEPTED_CURRENCIES),
  'hotel.checkinTime': clockTime,
  /** After this time an unchecked-out stay is "overdue" (Pandora 12:00; akislar.md). */
  'hotel.checkoutTime': clockTime,
  /** Highlighted weekdays in the calendar, 0 = Sunday (S-24: Saturday + Sunday). */
  'calendar.highlightWeekdays': z.array(z.number().int().min(0).max(6)).max(7),
  /**
   * First year the reservation grid goes back to (G-31, K-46): the grid starts at this year or the oldest stay's,
   * whichever is earlier; null = the oldest stay's. 2000 … this year.
   */
  'calendar.startYear': z
    .number()
    .int()
    .min(CALENDAR_MIN_START_YEAR)
    .refine((year) => year <= new Date().getFullYear(), { message: 'start year in the future' })
    .nullable(),
  /**
   * How a group reservation (G-194, S-106) keeps its money: one folio on the group leader ('single', default) or
   * one folio per room ('per_room'). A group's own `folio_mode` starts from this value.
   */
  'booking.groupFolioMode': z.enum(['single', 'per_room']),
  /** Nights (by the weekday they start, 0 = Sunday) that take the weekend price (K-44: Friday and Saturday). */
  'pricing.weekendNights': z.array(z.number().int().min(0).max(6)).max(7),
  /** KBS warnings for occupants (G-53). */
  'kbs.checksEnabled': z.boolean(),
  /** Default N for "every N stays" reminders (S-94). */
  'tasks.everyNStays': z.number().int().min(1).max(500),
  /** Day closing (G-72): off by default, many hotels switch it on. */
  'businessDay.closingEnabled': z.boolean(),
  /**
   * Minutes the desk wants between two hourly stays in one room for cleaning (K-48, S-103): selling inside the gap is
   * only warned about, never blocked. 0 = no gap.
   */
  'dayUse.turnoverMinutes': z.number().int().min(0).max(240),
  /** Photos of resolved issues are deleted after N days; the text stays (K-25). */
  'attachments.resolvedIssueRetentionDays': z.number().int().min(1).max(3650),
  /** Staff may take an advance from the reception drawer (G-69, S-38). */
  'staff.advanceFromDrawer': z.boolean(),
  /** Expense section (code) of salaries and advances (G-69); `owner` hides them from staff (G-67). */
  'staff.expenseSection': z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'section code'),
  /** How many days back an employee may write their own hours (today included, never a future day; QA2a, K-46). */
  'staff.ownHoursBackDays': z.number().int().min(0).max(366),
  // Optional online data (Faz 11; G-02, K-04, K-06, K-13). Off = not a single request leaves this computer.
  'network.enabled': z.boolean(),
  /** Minutes between market-rate refreshes (K-06: 30). */
  'fx.refreshMinutes': z.number().int().min(10).max(1440),
  /** Market-rate sources in the order they are tried; a keyed one is skipped while it has no key. */
  'fx.sources': z.array(z.enum(FX_PROVIDERS)).min(1).max(FX_PROVIDERS.length),
  /** The TCMB comparison line on the Döviz screen (K-06: comparison only, can be hidden). */
  'fx.showTcmb': z.boolean(),
  /** The hotel's own fixed rates: base-currency units for one unit × 1 000 000 ("1 € = 50 TL" → EUR 50 000 000). */
  'fx.hotelRates': z.partialRecord(currencyCode, z.number().int().positive().safe()),
  /** "Misafire bu kurdan söyle": hotel rates are used by the converter, the guest view and new records. */
  'fx.quoteHotelRate': z.boolean(),
  /** Rounding of the converter's answer (the stored records always keep minor units). */
  'fx.rounding': z.enum(['minor', 'unit', 'ten']),
  'weather.enabled': z.boolean(),
  /** Weather point typed by hand; null = the city of the hotel (bundled list), else İstanbul. */
  'weather.location': z
    .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .strict()
    .nullable(),
  /** Open-Meteo as the backup weather source (its free tier is not for commercial use: the owner decides). */
  'weather.openMeteo': z.boolean(),
  /** Yearly online check of the generated holidays (K-04). */
  'holidays.onlineCheck': z.boolean(),
  /** Daily automatic backup at the hotel's quiet hour (K-32: 04:00); one more when the program closes. */
  'backup.autoTime': clockTime,
  /** Days automatic backups are kept, here and in Drive; older ones go when a new one arrives (S-42: 30). */
  'backup.keepDays': z.number().int().min(1).max(365),
  /**
   * Drive folder of the encrypted copies; '' = found by itself (Drive'ım/Bismuth/yedekler, K-32). Chosen only with the
   * folder dialog of the hotel's own computer (K-45 (3)); a network share (`\\server\share`, `//server/share`) or a
   * device path (`\\?\…`) is never a Drive folder: the program would send the computer's sign-in to that server.
   */
  'backup.driveFolder': z
    .string()
    .trim()
    .max(500)
    .refine((v) => !/^[\\/]{2}/.test(v), 'network path'),
  /** Copies kept from before a program update changed the data (G-09; Faz 1 kept 10). */
  'backup.preMigrationKeep': z.number().int().min(1).max(100),
  // Server mode (Faz 13; G-140…G-144, K-19): the hotel's main computer serves phones and other computers.
  /** Port of the server (Faz 13: 7373); the address other devices open is http://<address>:<port>. */
  'host.port': z.number().int().min(1024).max(65535),
  /** Hours a phone or other computer stays signed in without being used (G-144). */
  'host.sessionHours': z.number().int().min(1).max(720),
  /**
   * Serve the hotel's local network (Wi-Fi, cable) too (K-45 (1)). Off: only this computer and the private network
   * (NetBird/Tailscale), which encrypts; plain HTTP on a Wi-Fi guests share would be readable by anyone on it.
   */
  'host.listenLan': z.boolean(),
  /**
   * Term of this main computer (Faz 13, K-19): written with every change; "Bu bilgisayarı ana bilgisayar yap" on
   * another computer starts the next one, and a computer with an older term writes nothing more.
   */
  'host.epoch': z.number().int().min(1),
  /** The encrypted box in Drive's Bismuth folder (kutu/) for the owner's read-only copy (K-32). */
  'relay.enabled': z.boolean(),
  /** Identity numbers stay out of the box (KVKK; the owner's copy still gets them live when allowed). */
  'relay.excludeIdentity': z.boolean(),
  /** Hourly PDF summary without personal data in Drive's Bismuth folder (G-145, S-62). */
  'summary.enabled': z.boolean()
} as const

export type SettingsKey = keyof typeof settingsShape
export const SETTINGS_KEYS = Object.keys(settingsShape) as SettingsKey[]

export const settingsValuesSchema = z.object(settingsShape)
export type SettingsValues = z.infer<typeof settingsValuesSchema>

/**
 * Keys no settings screen writes (O-6): the term changes only with a takeover (src/main/replica/takeover.ts) or a
 * restore (backup-service `noteRestored`).
 */
export const PROGRAM_SETTING_KEYS = ['host.epoch'] as const satisfies readonly SettingsKey[]

export const settingsPatchSchema = settingsValuesSchema
  .omit({ 'host.epoch': true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'empty patch' })
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const SETTINGS_DEFAULTS: SettingsValues = {
  'ui.language': 'tr',
  'ui.theme': 'system',
  'ui.showMinor': false,
  'ui.density': 'comfortable',
  'ui.startScreen': 'calendar',
  'ui.statusColors': {},
  'ui.statusColorsDark': {},
  'ui.accentColor': null,
  'ui.accentColorDark': null,
  'ui.fontSize': 'normal',
  'ui.zoom': 100,
  'ui.tourDone': false,
  'ui.sidebarCollapsed': false,
  'guide.tourForNewUsers': true,
  'hotel.name': 'Bismuth',
  'hotel.country': 'TR',
  'hotel.city': '',
  'hotel.email': '',
  'hotel.timezone': 'Europe/Istanbul',
  'app.mode': 'standalone',
  'security.idleLockMinutes': 15,
  'hotel.baseCurrency': 'TRY',
  'hotel.currencies': ['TRY', 'EUR', 'USD', 'GBP', 'RUB'],
  'hotel.checkinTime': '14:00',
  'hotel.checkoutTime': '12:00',
  'calendar.highlightWeekdays': [6, 0],
  'calendar.startYear': null,
  'booking.groupFolioMode': 'single',
  'pricing.weekendNights': [5, 6],
  'kbs.checksEnabled': true,
  'tasks.everyNStays': 10,
  'businessDay.closingEnabled': false,
  'dayUse.turnoverMinutes': 60,
  'attachments.resolvedIssueRetentionDays': 30,
  'staff.advanceFromDrawer': false,
  'staff.expenseSection': 'general',
  'staff.ownHoursBackDays': 7,
  'network.enabled': true,
  'fx.refreshMinutes': 30,
  'fx.sources': [...DEFAULT_FX_SOURCES],
  'fx.showTcmb': true,
  'fx.hotelRates': {},
  'fx.quoteHotelRate': true,
  'fx.rounding': 'minor',
  'weather.enabled': true,
  'weather.location': null,
  'weather.openMeteo': false,
  'holidays.onlineCheck': true,
  'backup.autoTime': '04:00',
  'backup.keepDays': 30,
  'backup.driveFolder': '',
  'backup.preMigrationKeep': 10,
  'host.port': 7373,
  'host.sessionHours': 12,
  'host.listenLan': false,
  'host.epoch': 1,
  'relay.enabled': true,
  'relay.excludeIdentity': true,
  'summary.enabled': true
}

/** The hotel's status and accent colours (G-33): shared by everyone, so they need the colour right, not just a session. */
const COLOUR_KEYS: readonly SettingsKey[] = [
  'ui.statusColors',
  'ui.statusColorsDark',
  'ui.accentColor',
  'ui.accentColorDark'
]

/** What a window without a signed-in user may read: how to draw the sign-in screen, nothing about the hotel's data. */
export const PUBLIC_SETTING_KEYS: readonly SettingsKey[] = [
  'ui.language',
  'ui.theme',
  'ui.showMinor',
  'ui.density',
  'ui.startScreen',
  'ui.statusColors',
  'ui.statusColorsDark',
  'ui.accentColor',
  'ui.accentColorDark',
  'ui.fontSize',
  'hotel.name',
  'app.mode',
  'security.idleLockMinutes'
]

/**
 * Keys only the hotel's own window may change (K-45 (3), O-6): how this computer works (mode, server, box) and where
 * the Drive copies go. A phone or another computer could otherwise switch the server off under itself, send the
 * copies elsewhere, or point the program at a network share.
 */
export const isDesktopOnlySettingKey = (key: SettingsKey): boolean =>
  key === 'app.mode' ||
  key.startsWith('host.') ||
  key.startsWith('relay.') ||
  key.startsWith('summary.') ||
  key === 'backup.driveFolder'

/**
 * Display preferences each person chooses for themselves (language, theme, density, amounts, start screen; K-37):
 * a signed-in user's choice is kept for that user, the hotel's value is everyone's default. Everything else is the
 * hotel's and needs the key's permission.
 */
export const isPersonalSettingKey = (key: SettingsKey): boolean =>
  key.startsWith('ui.') && !COLOUR_KEYS.includes(key)

/**
 * A person's own view state, flipped with a click (the folded menu, the seen tour): kept like any personal choice
 * but not written to the audit log, which would fill with clicks (Faz 4 bug hunt #15).
 */
export const isViewStateKey = (key: SettingsKey): boolean =>
  key === 'ui.sidebarCollapsed' || key === 'ui.tourDone'

/**
 * Permission needed to change a non-personal key (pay rules belong to owner + manager, K-38; the Döviz screen's
 * own choices — hotel rate, rounding, TCMB line — to whoever may edit currency; backup choices to settings.backup).
 * The expense section of staff money can send salaries into the owner's hidden section (G-67): it needs that
 * section's right (Faz 4 bug hunt #12).
 */
export const settingPermission = (
  key: SettingsKey
):
  | 'settings'
  | 'settings.colors'
  | 'staff.policy'
  | 'expenses.owner'
  | 'currency'
  | 'settings.backup'
  | 'remote.settings' =>
  key.startsWith('host.') || key.startsWith('relay.') || key.startsWith('summary.') || key === 'app.mode'
    ? 'remote.settings'
    : key === 'staff.expenseSection'
      ? 'expenses.owner'
      : key.startsWith('staff.')
        ? 'staff.policy'
        : key.startsWith('fx.')
          ? 'currency'
          : key.startsWith('backup.')
            ? 'settings.backup'
            : COLOUR_KEYS.includes(key)
              ? 'settings.colors'
              : 'settings'
