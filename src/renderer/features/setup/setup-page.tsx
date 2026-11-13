// First-run setup wizard (G-10, faz-04 madde 1): language and theme, how this computer works, the hotel, money,
// room types and prices, rooms and beds, lists, staff rules and shifts, employees, calendar and the owner account.
// Every answer is a setting the hotel changes later (G-09). "İleri" checks the step and saves the progress
// (without passwords) so a closed wizard resumes; "Kurulumu bitir" writes everything in one go, signs the owner
// in and shows the recovery codes once. Layout as the owner approved it in Faz 3: step list on the left on the
// desktop, "Adım N / M" and a bar on the phone, Geri / İleri at the bottom of a fixed-height card. The list ticks a
// step only once it was opened and its answers pass the step's check; a new step's title takes the focus.
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from 'lucide-react'
import { toast } from 'sonner'
import type { ProcedureOutput, SettingsValues } from '@shared/contract'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { BismuthMark } from '@/components/bismuth-mark'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/api/hooks'
import { useSessionEvents } from '@/lib/session/session'
import { ApiError } from '@/lib/transport'
import { cn } from '@/lib/utils'
import {
  defaultDraft,
  firstInvalidStep,
  locateServerError,
  pruneDraft,
  restoreDraft,
  savedDraft,
  toSetupDraft,
  validateStep,
  type FieldErrors,
  type ServerErrorKey,
  type SetupOptions,
  type WizardDraft
} from './draft'
import { RecoveryCodes } from './recovery-codes'
import { CalendarStep } from './step-calendar'
import { CurrenciesStep } from './step-currencies'
import { EmployeesStep } from './step-employees'
import { HotelStep } from './step-hotel'
import { HourlyStep } from './step-hourly'
import { LanguageStep } from './step-language'
import { ModeStep } from './step-mode'
import { MoneyStep } from './step-money'
import { OwnerStep } from './step-owner'
import type { StepProps } from './step-props'
import { RoomTypesStep } from './step-room-types'
import { RoomsStep } from './step-rooms'
import { StaffStep } from './step-staff'
import { SummaryStep } from './step-summary'
import { STEPS, isRequiredStep, type Step } from './steps'
import { useSetupOptions, useSetupState, useSetupWrites } from './use-setup'

type Finished = ProcedureOutput<'setup.finish'>

const BODIES: Record<Step, (props: StepProps) => ReactNode> = {
  language: LanguageStep,
  mode: ModeStep,
  hotel: HotelStep,
  currencies: CurrenciesStep,
  roomTypes: RoomTypesStep,
  rooms: RoomsStep,
  hourly: HourlyStep,
  money: MoneyStep,
  staff: StaffStep,
  employees: EmployeesStep,
  calendar: CalendarStep,
  owner: OwnerStep,
  summary: SummaryStep
}

type SetupState = ProcedureOutput<'setup.state'>
/** A refusal of the last write: shown above the step; `field` also marks the field it is about. */
type Notice = { messageKey: string; field: string | null }

const SERVER_FIELD_KEYS: readonly string[] = [
  'errors.roomNumberTaken',
  'errors.usernameTaken',
  'errors.cashMethodRequired'
] satisfies readonly ServerErrorKey[]
const isServerFieldKey = (key: string): key is ServerErrorKey => SERVER_FIELD_KEYS.includes(key)

/** A step number 1…12 (`?step=N`, saved progress) as an index; anything else is not a step. */
const stepIndex = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : undefined

function initialDraft(options: SetupOptions, settings: SettingsValues, state: SetupState): WizardDraft {
  const defaults = defaultDraft(options, settings, state.mode)
  const draft = state.progress ? pruneDraft(restoreDraft(state.progress.draft, defaults), options) : defaults
  // Language and theme are live settings already; the saved copy may be older.
  return { ...draft, language: settings['ui.language'], theme: settings['ui.theme'] }
}

function Wizard({
  state,
  options,
  settings,
  startAt,
  onFinished
}: {
  state: SetupState
  options: SetupOptions
  settings: SettingsValues
  startAt: number | undefined
  onFinished: (result: Finished) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const writes = useSetupWrites()
  const events = useSessionEvents()
  const [draft, setDraft] = useState(() => initialDraft(options, settings, state))
  // A window already switched to client mode cannot write settings: it reopens at the mode step to switch back.
  const [index, setIndex] = useState(
    () =>
      stepIndex(startAt) ??
      (state.mode === 'client' ? STEPS.indexOf('mode') : stepIndex(state.progress?.step)) ??
      0
  )
  const [tried, setTried] = useState<ReadonlySet<Step>>(() => new Set())
  // Steps the person has opened (a resumed wizard has seen every step before the one it reopens at).
  const [visited, setVisited] = useState<ReadonlySet<Step>>(() => new Set(STEPS.slice(0, index + 1)))
  const headingRef = useRef<HTMLDivElement>(null)
  const [headingFocus, setHeadingFocus] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const savedMode = useRef(state.mode)
  const step = STEPS[index]!
  const last = index === STEPS.length - 1
  const busy = writes.setMode.isPending || writes.finish.isPending

  const live: FieldErrors = tried.has(step) ? validateStep(step, draft, options) : {}
  const errors: FieldErrors =
    notice?.field && isServerFieldKey(notice.messageKey)
      ? { ...live, [notice.field]: { key: notice.messageKey } }
      : live

  // The first wrong field gets the focus after a refused "İleri" or "Kurulumu bitir".
  useEffect(() => {
    if (focus) document.getElementById(focus.id)?.focus()
  }, [focus])
  const focusOn = (id: string | undefined): void => {
    if (id) setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))
  }
  // After Geri / İleri / a step in the list: the new step's title, so a screen reader says where it is.
  useEffect(() => {
    if (headingFocus > 0) headingRef.current?.focus({ preventScroll: true })
  }, [headingFocus])

  const errorText = (error: unknown): string => {
    const key = (error instanceof ApiError ? error.messageKey : 'errors.internal') as 'errors.internal'
    return t(key, { defaultValue: t('errors.internal') })
  }

  /** Shows another step and keeps the place and the answers for a restart. */
  const move = (target: number): void => {
    setNotice(null)
    setIndex(target)
    setVisited((v) => new Set(v).add(STEPS[target]!))
    setHeadingFocus((n) => n + 1)
    writes.save.mutate(
      { step: target + 1, draft: savedDraft(draft) },
      { onError: (error) => toast.error(errorText(error)) }
    )
    if (isMobile) window.scrollTo({ top: 0 })
  }

  const refuse = (at: Step, problems: FieldErrors): void => {
    setTried((s) => new Set(s).add(at))
    focusOn(Object.keys(problems)[0])
  }

  const next = async (): Promise<void> => {
    setNotice(null)
    const problems = validateStep(step, draft, options)
    if (Object.keys(problems).length > 0) return refuse(step, problems)
    if (step === 'mode') {
      try {
        await writes.setMode.mutateAsync(draft.mode)
        savedMode.current = draft.mode
        // The gate learns the new mode (client → the connection screen is the window's place).
        void events.refresh()
      } catch (error) {
        setNotice({
          messageKey: error instanceof ApiError ? error.messageKey : 'errors.internal',
          field: null
        })
        return
      }
      // A client sets up nothing here: the connection screen takes over (Faz 13).
      if (draft.mode === 'client') return void navigate({ href: '/connect' })
    }
    move(index + 1)
  }

  const finish = async (): Promise<void> => {
    setNotice(null)
    const invalid = firstInvalidStep(draft, options)
    if (invalid) {
      setIndex(STEPS.indexOf(invalid.step))
      setVisited((v) => new Set(v).add(invalid.step))
      setNotice({ messageKey: 'setup.finishFailed', field: null })
      return refuse(invalid.step, invalid.errors)
    }
    if (draft.mode === 'client') return setIndex(STEPS.indexOf('mode'))
    try {
      if (draft.mode !== savedMode.current) {
        await writes.setMode.mutateAsync(draft.mode)
        savedMode.current = draft.mode
      }
      const result = await writes.finish.mutateAsync(toSetupDraft(draft, options))
      onFinished(result)
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      const place = apiError ? locateServerError(apiError, draft) : null
      if (place) {
        setIndex(STEPS.indexOf(place.step))
        setVisited((v) => new Set(v).add(place.step))
      }
      setNotice({ messageKey: apiError?.messageKey ?? 'errors.internal', field: place?.field ?? null })
      focusOn(place?.field ?? undefined)
    }
  }

  // Enter anywhere in the step = İleri. A money field keeps its text until it loses focus, so the field is
  // blurred first and the step goes on with the answers as they are after that (latest closure via the ref).
  const submitRef = useRef<() => void>(() => undefined)
  useLayoutEffect(() => {
    submitRef.current = () => void (last ? finish() : next())
  })
  const submit = (): void => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.tagName === 'INPUT') {
      active.blur()
      setTimeout(() => submitRef.current(), 0)
    } else submitRef.current()
  }

  const Body = BODIES[step]
  const props: StepProps = {
    draft,
    update: (change) => setDraft((d) => change(d)),
    options,
    errors,
    goTo: (target) => move(STEPS.indexOf(target))
  }
  const optional = !isRequiredStep(step) && !last
  const nextLabel = step === 'mode' && draft.mode === 'client' ? t('setup.mode.connect') : t('setup.next')
  // Phone: Geri / İleri stick to the bottom of the screen. A field that takes the focus under that bar (Tab, the
  // phone's "next field" key) is scrolled up above it; the page's own scroll padding may already have done so.
  const footerRef = useRef<HTMLDivElement>(null)
  const keepAboveFooter = (e: FocusEvent<HTMLElement>): void => {
    const field = e.target
    requestAnimationFrame(() => {
      const footer = footerRef.current
      if (!footer) return
      const overlap = field.getBoundingClientRect().bottom - footer.getBoundingClientRect().top
      if (overlap > 0) window.scrollBy({ top: overlap + 16 })
    })
  }
  /** Ticked in the list: opened before, not the current one, and its answers pass the check. */
  const complete = (s: Step): boolean =>
    s !== step && visited.has(s) && Object.keys(validateStep(s, draft, options)).length === 0

  return (
    <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      {isMobile ? (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs font-medium" data-testid="setup-step-of">
            {t('setup.stepOf', { step: index + 1, total: STEPS.length })}
          </p>
          <Progress value={((index + 1) / STEPS.length) * 100} aria-label={t('setup.progress')} />
        </div>
      ) : (
        <nav className="grid gap-1" aria-label={t('setup.progress')}>
          {/* Keyboard: straight to the step instead of through the twelve step buttons. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sr-only justify-self-start focus-visible:not-sr-only"
            onClick={() => headingRef.current?.focus()}
            data-testid="setup-skip-to-step"
          >
            {t('setup.skipToStep')}
          </Button>
          <ol className="grid gap-1">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => move(i)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-9 w-full items-center gap-3 rounded-md px-2 text-start text-sm outline-none focus-visible:ring-[3px]',
                    i === index ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60'
                  )}
                  data-testid={`setup-goto-${s}`}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums',
                      complete(s) && 'bg-primary text-primary-foreground border-primary',
                      i === index && 'border-primary text-foreground'
                    )}
                    data-complete={complete(s) || undefined}
                  >
                    {complete(s) ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  {t(`setup.step.${s}.title`)}
                  {complete(s) ? <span className="sr-only">, {t('setup.stepComplete')}</span> : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) submit()
        }}
        className="min-w-0"
      >
        {/* Desktop: the card keeps one height on every step (long steps scroll inside), so Geri / İleri never
            jump. Phone: the page scrolls and Geri / İleri stay at the bottom of the screen. */}
        <Card className="max-md:pb-0" data-step={step}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle
                ref={headingRef}
                role="heading"
                aria-level={2}
                tabIndex={-1}
                className="focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-[3px]"
                data-testid="setup-step-title"
              >
                {t(`setup.step.${step}.title`)}
              </CardTitle>
              {optional ? <Badge variant="secondary">{t('setup.optional')}</Badge> : null}
            </div>
            <CardDescription>{t(`setup.step.${step}.body`)}</CardDescription>
          </CardHeader>
          <CardContent
            key={step}
            className="relative grid content-start gap-4 md:h-[max(22rem,calc(100dvh-23rem))] md:overflow-y-auto md:py-1"
            data-testid="setup-step-body"
            onFocus={isMobile ? keepAboveFooter : undefined}
          >
            {notice ? (
              <Alert variant="destructive" data-testid="setup-notice">
                <AlertTriangleIcon aria-hidden />
                <AlertDescription className="text-destructive">
                  {t(notice.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })}
                </AlertDescription>
              </Alert>
            ) : null}
            <Body {...props} />
          </CardContent>
          <CardFooter
            ref={footerRef}
            className="max-md:bg-card justify-between gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:rounded-b-xl max-md:border-t max-md:pt-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            data-testid="setup-footer"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => move(index - 1)}
              disabled={index === 0 || busy}
              data-testid="setup-back"
            >
              <ChevronLeftIcon className="rtl:rotate-180" aria-hidden />
              {t('setup.back')}
            </Button>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-md:gap-1">
              {optional ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="max-md:h-11 max-md:px-3"
                  onClick={() => move(index + 1)}
                  disabled={busy}
                  data-testid="setup-skip"
                >
                  {t('setup.skip')}
                </Button>
              ) : null}
              {last ? (
                <Button type="submit" disabled={busy} data-testid="setup-finish">
                  {writes.finish.isPending ? t('setup.finishing') : t('setup.finish')}
                </Button>
              ) : (
                <Button type="submit" disabled={busy} data-testid="setup-next">
                  {nextLabel}
                  <ChevronRightIcon className="rtl:rotate-180" aria-hidden />
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

/** While the wizard's choices load: the step list and a card, shaped like the wizard. */
function WizardSkeleton() {
  return (
    <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]" data-testid="setup-loading">
      <div className="grid gap-3 max-md:hidden" aria-hidden>
        {STEPS.map((s) => (
          <Skeleton key={s} className="h-6 w-40" />
        ))}
      </div>
      {/* Phone: "Adım N / M" and the bar. */}
      <div className="grid gap-2 md:hidden" aria-hidden data-testid="setup-loading-progress">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
      <LoadingState cards={1} />
    </div>
  )
}

export function SetupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const { step: startAt } = useSearch({ strict: false }) as { step?: number }
  const state = useSetupState()
  const settings = useSettings()
  const options = useSetupOptions(state.data?.done === false)
  const events = useSessionEvents()
  const [finished, setFinished] = useState<Finished | null>(null)

  /**
   * After the codes: `setup.finish` signed this window in as the owner. Told to the gate only now — earlier, it
   * would leave the wizard while the codes are still on screen.
   */
  const enterApp = (me: Finished['me']): void => {
    client.removeQueries({ queryKey: ['setup.options'] })
    void client.invalidateQueries({ queryKey: ['setup.state'] })
    void events.signedIn(me)
    toast.success(t('setup.done'))
    void navigate({ to: '/' })
  }

  let body: ReactNode
  if (finished)
    body = <RecoveryCodes codes={finished.recoveryCodes} onContinue={() => enterApp(finished.me)} />
  else if (state.isError || options.isError || settings.isError)
    body = (
      <ErrorState
        error={state.error ?? options.error ?? settings.error}
        onRetry={() => {
          void state.refetch()
          void options.refetch()
          void settings.refetch()
        }}
      />
    )
  else if (state.data?.done)
    body = (
      <EmptyState
        icon={CheckCircle2Icon}
        title={t('setup.alreadyDone.title')}
        body={t('setup.alreadyDone.body')}
        action={<Button onClick={() => void navigate({ to: '/' })}>{t('setup.alreadyDone.action')}</Button>}
      />
    )
  else if (!state.data || !options.data || !settings.data) body = <WizardSkeleton />
  else
    body = (
      <Wizard
        state={state.data}
        options={options.data}
        settings={settings.data}
        startAt={startAt}
        onFinished={setFinished}
      />
    )

  return (
    <div className="grid flex-1 content-start gap-6" data-testid="setup-wizard">
      {/* Phone: the mark and a smaller title share one line, the subtitle runs full width under them. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <BismuthMark className="size-8 shrink-0 md:size-9" />
        <div className="contents md:grid md:min-w-0 md:flex-1">
          <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight md:text-2xl">
            {t('setup.title')}
          </h1>
          <p className="text-muted-foreground basis-full text-sm">{t('setup.subtitle')}</p>
        </div>
      </header>
      {body}
    </div>
  )
}
