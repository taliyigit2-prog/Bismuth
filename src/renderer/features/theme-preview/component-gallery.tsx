// Design-system gallery (faz-03 madde 2 "Tema önizleme: tüm bileşenler, üç dilde örnek metin"; docs/tasarim.md):
// every building block of the screens in one place, so a theme or density change can be judged at a glance.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { BedDoubleIcon, InboxIcon, LockIcon, LogInIcon, WandSparklesIcon, WalletIcon } from 'lucide-react'
import { toast } from 'sonner'
import { STATUS_KEYS } from '@shared/contract'
import { addDays, today as todayDate, type LocalDate } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateInput } from '@/components/date-input'
import { GuestCombobox } from '@/components/guest-combobox'
import { KpiCard } from '@/components/kpi-card'
import { Legend } from '@/components/legend'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { PhoneField, parsePhone } from '@/components/phone-field'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { RoomPicker } from '@/components/room-picker'
import { EmptyState } from '@/components/states'
import { StatusTagBadge } from '@/components/status-tag-badge'
import { WeatherIcon } from '@/components/weather-icon'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDemo } from '@/mocks/demo-source'

const SAMPLES = ['tr', 'en', 'ru'] as const
const SCREENS = [
  { to: '/setup', icon: WandSparklesIcon, key: 'setup' },
  { to: '/login', icon: LogInIcon, key: 'login' },
  { to: '/lock', icon: LockIcon, key: 'lock' }
] as const
const WEATHER = ['clearsky_day', 'fair_day', 'cloudy', 'rain', 'heavyrain', 'snow'] as const
const GALLERY_CURRENCIES = ['TRY', 'EUR', 'USD'] as const
const ROWS = ['paid', 'partial', 'unpaid'] as const

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function ComponentGallery() {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const demo = useDemo(['hotel'], (h) => h)
  const today = todayDate()
  const [amount, setAmount] = useState<MoneyValue>({ amountMinor: 280_000, currency: 'TRY' })
  const [day, setDay] = useState<LocalDate>(today)
  const [phone, setPhone] = useState(parsePhone('+90 532 000 11 22'))
  const [room, setRoom] = useState<string | null>(null)
  const [guest, setGuest] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const hotel = demo.data

  return (
    <div className="grid gap-6" data-testid="component-gallery">
      <Section title={t('themePreview.gallery.forms')}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="g-input">{t('themePreview.gallery.text')}</Label>
            <Input id="g-input" placeholder={t('themePreview.gallery.placeholder')} />
          </div>
          <MoneyInput
            label={t('common.amount')}
            value={amount}
            onChange={setAmount}
            currencies={GALLERY_CURRENCIES}
          />
          <DateInput label={t('common.date')} value={day} onChange={setDay} />
          <PhoneField label={t('themePreview.gallery.phone')} value={phone} onChange={setPhone} />
          {hotel ? (
            <>
              <RoomPicker
                label={t('common.room')}
                rooms={hotel.rooms.map((r) => ({
                  id: r.id,
                  number: r.number,
                  floor: r.floor,
                  typeLabel: f.name(r.typeName),
                  beds: r.beds
                }))}
                value={room}
                onChange={setRoom}
              />
              <GuestCombobox
                label={t('themePreview.gallery.guest')}
                guests={hotel.guests.slice(0, 40).map((g) => ({
                  id: g.id,
                  name: `${g.firstName} ${g.lastName}`,
                  phone: g.phone,
                  nationality: g.nationality,
                  stays: 1,
                  vip: g.vip
                }))}
                value={guest}
                onChange={setGuest}
                onCreate={() => toast.info(t('common.demoSaved'))}
              />
            </>
          ) : null}
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="g-note">{t('common.note')}</Label>
            <Textarea id="g-note" rows={2} placeholder={t('themePreview.gallery.placeholder')} />
          </div>
          <div className="flex flex-wrap items-center gap-6 md:col-span-2">
            <Label className="min-h-6 font-normal max-md:min-h-11">
              <Checkbox defaultChecked />
              {t('themePreview.gallery.check')}
            </Label>
            <Label className="min-h-6 font-normal max-md:min-h-11">
              <Switch defaultChecked />
              {t('themePreview.gallery.switch')}
            </Label>
          </div>
        </div>
      </Section>

      <Section title={t('themePreview.gallery.feedback')}>
        <div className="grid gap-4 md:grid-cols-2">
          <Alert>
            <InboxIcon aria-hidden />
            <AlertTitle>{t('themePreview.gallery.infoTitle')}</AlertTitle>
            <AlertDescription>{t('themePreview.gallery.infoBody')}</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <InboxIcon aria-hidden />
            <AlertTitle>{t('themePreview.gallery.errorTitle')}</AlertTitle>
            <AlertDescription>{t('themePreview.gallery.errorBody')}</AlertDescription>
          </Alert>
          <div className="grid content-start gap-3">
            <Progress value={64} aria-label={t('themePreview.gallery.progress')} />
            <div className="grid gap-2" aria-hidden>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.success(t('themePreview.gallery.toastOk'))}
              >
                {t('themePreview.gallery.showToast')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.error(t('themePreview.gallery.toastError'))}
              >
                {t('themePreview.gallery.showError')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog(true)}>
                {t('themePreview.gallery.openDialog')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {t('themePreview.gallery.tooltip')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('themePreview.gallery.tooltipBody')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <EmptyState
            compact
            icon={InboxIcon}
            title={t('themePreview.gallery.emptyTitle')}
            body={t('themePreview.gallery.emptyBody')}
          />
        </div>
      </Section>

      <Section title={t('themePreview.gallery.data')}>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard
              label={t('themePreview.gallery.kpiOccupancy')}
              value={f.percent(7_370, 1)}
              delta={{
                label: t('themePreview.gallery.kpiDelta', { value: `+${f.percent(500, 0)}` }),
                direction: 'up',
                good: true
              }}
              series={[52, 58, 61, 57, 66, 70, 74]}
              icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
            />
            <KpiCard
              label={t('themePreview.gallery.kpiRevenue')}
              value={f.money(48_250_000)}
              delta={{
                label: t('themePreview.gallery.kpiDelta', { value: `+${f.percent(1_200, 0)}` }),
                direction: 'up',
                good: true
              }}
              series={[31, 35, 33, 40, 42, 45, 48]}
              icon={<WalletIcon className="size-3.5" aria-hidden />}
            />
            <KpiCard
              label={t('themePreview.gallery.kpiExpenses')}
              value={f.money(21_400_000)}
              delta={{
                label: t('themePreview.gallery.kpiDelta', { value: `+${f.percent(300, 0)}` }),
                direction: 'up',
                good: false
              }}
              series={[18, 19, 22, 20, 21, 23, 21]}
            />
          </div>
          {isMobile ? (
            <ul className="grid gap-2" data-testid="gallery-list">
              {ROWS.map((code, i) => (
                <li key={code} className="grid gap-1.5 rounded-lg border p-3 text-sm">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold tabular-nums">{101 + i}</span> ·{' '}
                      {t('themePreview.sampleGuest')}
                    </span>
                    <bdi className="shrink-0 tabular-nums">{f.money(280_000 * (i + 1))}</bdi>
                  </span>
                  <StatusTagBadge
                    subject={{ kind: 'auto', code }}
                    label={t(`status.${code}`)}
                    className="justify-self-start"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.room')}</TableHead>
                  <TableHead>{t('themePreview.gallery.guest')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-end">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((code, i) => (
                  <TableRow key={code}>
                    <TableCell className="font-semibold tabular-nums">{101 + i}</TableCell>
                    <TableCell>{t('themePreview.sampleGuest')}</TableCell>
                    <TableCell>
                      <StatusTagBadge subject={{ kind: 'auto', code }} label={t(`status.${code}`)} />
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <bdi>{f.money(280_000 * (i + 1))}</bdi>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Legend
            items={STATUS_KEYS.map((code) => ({
              id: code,
              subject: { kind: 'auto' as const, code },
              label: t(`status.${code}`)
            }))}
          />
          <ul className="flex flex-wrap gap-4" aria-label={t('today.weather')}>
            {WEATHER.map((symbol, i) => (
              <li key={symbol} className="grid justify-items-center gap-1 text-xs">
                <WeatherIcon symbol={symbol} className="size-9" />
                <span className="text-muted-foreground">{f.weekday(addDays(today, i))}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        title={t('themePreview.gallery.languages')}
        description={t('themePreview.gallery.languagesHelp')}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {SAMPLES.map((lng) => (
            <figure key={lng} className="grid gap-1 rounded-lg border p-3">
              <figcaption className="text-muted-foreground text-xs font-medium">
                {t(`language.${lng}`)}
              </figcaption>
              <p className="text-sm" lang={lng}>
                {t(`themePreview.gallery.sample.${lng}`)}
              </p>
            </figure>
          ))}
        </div>
      </Section>

      <Section title={t('themePreview.gallery.screens')} description={t('themePreview.gallery.screensHelp')}>
        <div className="flex flex-wrap gap-2">
          {SCREENS.map(({ to, icon: Icon, key }) => (
            <Button key={to} asChild variant="outline">
              <Link to={to}>
                <Icon aria-hidden />
                {t(`themePreview.gallery.screen.${key}`)}
              </Link>
            </Button>
          ))}
        </div>
      </Section>

      <ResponsiveDialog
        open={dialog}
        onOpenChange={setDialog}
        title={t('themePreview.gallery.dialogTitle')}
        description={t('themePreview.gallery.dialogBody')}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                setDialog(false)
                toast.info(t('common.demoSaved'))
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-1.5">
          <Label htmlFor="g-dialog-input">{t('themePreview.gallery.text')}</Label>
          <Input id="g-dialog-input" />
        </div>
      </ResponsiveDialog>
    </div>
  )
}
