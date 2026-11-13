// Test helper for the setup wizard (not part of the app bundle): the wizard's procedures over the shared fake
// transport (settings behave like the service), a small seeded option list and a router with the screens the
// wizard leads to (/connect, /). Records every write so tests read what the main process would have received.
/* eslint-disable react-refresh/only-export-components -- a test helper, never hot-reloaded */
import { localDate } from '@shared/date'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router'
import {
  SETTINGS_DEFAULTS,
  type AppMode,
  type ProcedureInput,
  type ProcedureName,
  type SettingsValues,
  type SetupDraft
} from '@shared/contract'
import { PERMISSION_KEYS } from '@shared/permissions'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initI18n } from '@/i18n'
import { ApiProvider } from '@/lib/api/api-context'
import { ApiError, type Transport } from '@/lib/transport'
import { fakeTransport } from '@/test/render'
import type { SetupOptions } from './draft'
import { SetupPage } from './setup-page'
import { SETUP_STEP_COUNT } from './steps'

const tr = (tr: string, en: string, ru: string) => ({ tr, en, ru })
const noRights = Object.fromEntries(
  PERMISSION_KEYS.map((k) => [k, 'none'])
) as SetupOptions['roles'][number]['permissions']

const type = (
  id: string,
  code: string,
  group: SetupOptions['roomTypes'][number]['group'],
  name: ReturnType<typeof tr>,
  sort: number
): SetupOptions['roomTypes'][number] => ({
  id,
  code,
  name: name.tr,
  nameI18n: name,
  group,
  isCustom: false,
  maxAdults: null,
  basePriceMinor: null,
  weekendPriceMinor: null,
  baseCurrency: null,
  sort,
  active: true
})
const item = (id: string, code: string, name: ReturnType<typeof tr>, extra: object = {}) => ({
  id,
  code,
  name: name.tr,
  nameI18n: name,
  active: true,
  sort: 0,
  seeded: true,
  ...extra
})
const role = (id: string, code: string, name: ReturnType<typeof tr>) => ({
  id,
  code,
  name: name.tr,
  displayName: name,
  description: null,
  isSystem: true,
  permissions: noRights,
  locked: code === 'owner',
  userCount: 0,
  tasksOwnOnly: false,
  remoteAllowed: true
})
const template = (
  id: string,
  code: string,
  kind: 'general' | 'maintenance' | 'legal',
  title: ReturnType<typeof tr>
) => ({
  id,
  code,
  title: null,
  titleI18n: title,
  description: null,
  kind,
  recurrence: {},
  suggested: kind !== 'legal',
  active: kind === 'legal'
})

/** A slice of the real seed (src/main/db/seed/lists.ts): enough for every step. */
export const SETUP_OPTIONS: SetupOptions = {
  roomTypes: [
    type('rt-single', 'single', 'occupancy', tr('Tek kişilik', 'Single', 'Одноместный'), 0),
    type(
      'rt-double',
      'double',
      'occupancy',
      tr('Çift kişilik (Double)', 'Double', 'Двухместный (Double)'),
      1
    ),
    type('rt-twin', 'twin', 'occupancy', tr('İki yataklı (Twin)', 'Twin', 'Двухместный (Twin)'), 2),
    type('rt-standard', 'standard', 'tier', tr('Standart', 'Standard', 'Стандарт'), 3),
    type('rt-suite', 'suite', 'suite', tr('Süit', 'Suite', 'Сьют'), 4),
    type('rt-sea', 'sea_view', 'view', tr('Deniz manzaralı', 'Sea view', 'С видом на море'), 5)
  ],
  paymentMethods: [
    item('pm-cash', 'cash', tr('Nakit', 'Cash', 'Наличные'), { group: 'cash', isCash: true }),
    item('pm-card', 'card', tr('Kredi kartı', 'Card', 'Карта'), { group: 'card', isCash: false }),
    item('pm-bank', 'bank', tr('Havale / EFT (IBAN)', 'Bank transfer (IBAN)', 'Банковский перевод (IBAN)'), {
      group: 'bank',
      isCash: false
    })
  ],
  // One or two of each kind; like the real seed only the owner's channels start ticked (the rest are inactive rows).
  salesChannels: [
    item('ch-direct', 'direct', tr('Doğrudan', 'Direct', 'Напрямую'), { kind: 'direct' }),
    item('ch-email', 'email', tr('E-posta', 'Email', 'Эл. почта'), { kind: 'direct' }),
    item('ch-whatsapp', 'whatsapp', tr('WhatsApp', 'WhatsApp', 'WhatsApp'), {
      kind: 'direct',
      active: false
    }),
    item('ch-booking', 'booking', tr('Booking.com', 'Booking.com', 'Booking.com'), { kind: 'ota' }),
    item('ch-airbnb', 'airbnb', tr('Airbnb', 'Airbnb', 'Airbnb'), { kind: 'ota' }),
    item(
      'ch-hotels',
      'hotels_com',
      tr('Hotels.com (Expedia Group)', 'Hotels.com (Expedia Group)', 'Hotels.com (Expedia Group)'),
      { kind: 'ota', active: false }
    ),
    item('ch-otelz', 'otelz', tr('Otelz.com (Türkiye)', 'Otelz.com (Turkey)', 'Otelz.com (Турция)'), {
      kind: 'ota',
      active: false
    }),
    item('ch-hotelbeds', 'hotelbeds', tr('Hotelbeds', 'Hotelbeds', 'Hotelbeds'), {
      kind: 'agency',
      active: false
    }),
    item('ch-bounce', 'bounce', tr('Bounce (bavul emaneti)', 'Bounce (luggage)', 'Bounce (багаж)'), {
      kind: 'platform_service'
    }),
    item(
      'ch-radical',
      'radical_storage',
      tr('Radical Storage (bavul emaneti)', 'Radical Storage (luggage)', 'Radical Storage (багаж)'),
      { kind: 'platform_service', active: false }
    )
  ],
  extraServices: [
    item('ex-breakfast', 'breakfast', tr('Kahvaltı', 'Breakfast', 'Завтрак')),
    item('ex-luggage', 'luggage', tr('Bavul emaneti', 'Luggage storage', 'Хранение багажа'))
  ],
  shifts: [
    {
      id: 'sh-day',
      code: 'day',
      name: null,
      displayName: tr('Gündüz', 'Day', 'Дневная'),
      startTime: '09:00',
      endTime: '21:00',
      sort: 0,
      active: true
    },
    {
      id: 'sh-night',
      code: 'night',
      name: null,
      displayName: tr('Gece', 'Night', 'Ночная'),
      startTime: '21:00',
      endTime: '09:00',
      sort: 1,
      active: true
    }
  ],
  taskTemplates: [
    template(
      'tt-call',
      'call_late_checkouts',
      'general',
      tr('Çıkış yapmayan odaları ara', 'Call rooms', 'Позвонить в номера')
    ),
    template(
      'tt-elevator',
      'elevator_service',
      'maintenance',
      tr('Asansör bakımı', 'Lift service', 'Обслуживание лифта')
    ),
    template(
      'tt-kbs',
      'legal_kbs_checkout',
      'legal',
      tr(
        'KBS çıkış bildirimlerini kontrol et',
        'Check KBS check-out reports',
        'Проверить отметки выезда в KBS'
      )
    )
  ],
  roles: [
    role('role-owner', 'owner', tr('Sahip', 'Owner', 'Владелец')),
    role('role-manager', 'manager', tr('Müdür', 'Manager', 'Управляющий')),
    role('role-reception', 'reception', tr('Resepsiyon', 'Reception', 'Ресепшн'))
  ],
  payPolicy: {
    leaveDaysPerMonth: 4,
    unusedLeavePaid: true,
    dailyDivisor: 30,
    standardHoursPerDay: 8,
    overtimeMode: 'none',
    overtimeMultiplier: '1.5',
    holidayMultiplier: '2'
  },
  holidays: [
    {
      date: localDate('2026-10-28'),
      kind: 'half_holiday',
      titleI18n: tr('Cumhuriyet Bayramı arifesi', 'Republic Day eve', 'Канун Дня Республики'),
      estimated: false
    },
    {
      date: localDate('2026-10-29'),
      kind: 'holiday',
      titleI18n: tr('Cumhuriyet Bayramı', 'Republic Day', 'День Республики'),
      estimated: false
    }
  ]
}

export const RECOVERY_CODES = ['AB12-CD34', 'EF56-GH78', 'JK90-LM12', 'NP34-QR56', 'ST78-UV90', 'WX12-YZ34']

export interface SetupFake extends Transport {
  settings: SettingsValues
  saves: ProcedureInput<'setup.saveProgress'>[]
  modes: AppMode[]
  finished: SetupDraft[]
}

export const BISMUTH_KEY = '7KQ2M-ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2-34567-89ABC-DEFGH-JKLMN-PQRST'

/** The wizard's procedures; `finishError` makes `setup.finish` refuse like the service would. */
export function setupTransport(
  opts: {
    progress?: { step: number; draft: Record<string, unknown> } | null
    mode?: AppMode
    done?: boolean
    finishError?: ApiError
    /** `backup.recoveryText` refuses (no key store on this computer). */
    keyError?: ApiError
    settings?: Partial<SettingsValues>
  } = {}
): SetupFake {
  const base = fakeTransport({ ...SETTINGS_DEFAULTS, ...opts.settings })
  const saves: SetupFake['saves'] = []
  const modes: AppMode[] = []
  const finished: SetupDraft[] = []
  let mode: AppMode = opts.mode ?? 'standalone'
  return {
    kind: 'ipc',
    get settings() {
      return base.settings
    },
    saves,
    modes,
    finished,
    async call(name: ProcedureName, input: unknown) {
      if (name === 'setup.state')
        return { done: opts.done ?? false, mode, progress: opts.progress ?? null } as never
      if (name === 'setup.options') return SETUP_OPTIONS as never
      if (name === 'setup.saveProgress') {
        saves.push(structuredClone(input) as ProcedureInput<'setup.saveProgress'>)
        return { ok: true } as never
      }
      if (name === 'setup.setMode') {
        mode = (input as { mode: AppMode }).mode
        modes.push(mode)
        return { ok: true } as never
      }
      if (name === 'setup.finish') {
        finished.push(structuredClone(input) as SetupDraft)
        if (opts.finishError) throw opts.finishError
        return { recoveryCodes: RECOVERY_CODES } as never
      }
      if (name === 'backup.recoveryText') {
        if (opts.keyError) throw opts.keyError
        return { text: BISMUTH_KEY, createdAt: '2026-11-13T09:00:00.000Z' } as never
      }
      return base.call(name as never, input as never) as never
    }
  } as SetupFake
}

/** The wizard at `path` (e.g. "/setup?step=6"), with the screens it leads to as stubs. */
export async function renderSetup(
  opts: { transport?: SetupFake; path?: string; settings?: Partial<SettingsValues> } = {}
) {
  const settings = { ...SETTINGS_DEFAULTS, ...opts.settings }
  await initI18n(settings['ui.language'])
  const transport = opts.transport ?? setupTransport({ settings })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['settings.get', {}], settings)
  const rootRoute = createRootRoute()
  const stub = (testId: string) =>
    function Stub() {
      return <div data-testid={testId} />
    }
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: stub('home') }),
      createRoute({ getParentRoute: () => rootRoute, path: '/connect', component: stub('connect-screen') }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/setup',
        component: SetupPage,
        validateSearch: (search: Record<string, unknown>): { step?: number } => {
          const step = Number(search['step'])
          return Number.isInteger(step) && step >= 1 && step <= SETUP_STEP_COUNT ? { step } : {}
        }
      })
    ]),
    history: createMemoryHistory({ initialEntries: [opts.path ?? '/setup'] })
  })
  const result = render(
    <ApiProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
  return { ...result, transport, queryClient, router }
}

export { ApiError }
