// The camera privacy notice (Faz 20 P20e; K-58, KVKK m.10): the text the hotel shows its guests and puts up at the
// entrance. No written consent flow (the owner's lawyer found the notice enough); the notice names the data controller,
// what is kept, why, on what basis, where it goes (Telegram only when it is on), how long, and the rights of KVKK m.11.
// Everything that can be known is read from the settings (one entry, G-60): the hotel, its contact, the keep times and
// whether Telegram is on. Three languages; the language of the text is chosen apart from the program's own, because the
// guest at the desk may read another one. Printed on one A4 sheet, light whatever the theme.
//
// Reusable: `<PrivacyNotice />` is the text, `<PrivacyNoticeDialog />` the view-and-print window and
// `<PrivacyNoticeButton />` the entry button. The setup wizard passes `facts` for values not saved yet.
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { FileTextIcon, PrinterIcon } from 'lucide-react'
import { isAppLocale, type AppLocale } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { usePrivacyFacts, type PrivacyFacts } from './privacy-facts'
import { usePrint } from '../reports/use-report-export'
import '../reports/print.css'

export type { PrivacyFacts }

/** The hand-fill line when no contact is known. */
const BLANK_CONTACT = '................................................'

const LANGUAGES: readonly { code: AppLocale; label: string }[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' }
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/** The notice text in `lang` (the program's language when omitted). */
export function PrivacyNotice({
  facts,
  lang,
  compact = false
}: {
  facts: PrivacyFacts
  lang?: AppLocale
  /** Smaller type: the one-page print. */
  compact?: boolean
}) {
  const { i18n } = useTranslation()
  const fallback: AppLocale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const t = i18n.getFixedT(lang ?? fallback)
  const contact = facts.contact || BLANK_CONTACT
  return (
    <article
      lang={lang ?? fallback}
      className={compact ? 'grid gap-2 text-[9.5pt] leading-snug' : 'grid gap-3 text-sm'}
      data-testid="privacy-notice"
    >
      <p
        className={
          compact
            ? 'border-foreground rounded-md border-2 p-2 text-center text-[14pt] font-bold'
            : 'rounded-md border-2 p-3 text-center text-lg font-bold'
        }
        data-testid="privacy-sign"
      >
        {t('camera.notice.sign')}
      </p>
      <h2 className={compact ? 'text-[12pt] font-semibold' : 'text-base font-semibold'}>
        {t('camera.notice.title')}
      </h2>
      <Section title={t('camera.notice.controller.title')}>
        <p>{t('camera.notice.controller.body', { hotel: facts.hotel, contact })}</p>
      </Section>
      <Section title={t('camera.notice.data.title')}>
        <p>{t('camera.notice.data.body')}</p>
      </Section>
      <Section title={t('camera.notice.purpose.title')}>
        <p>{t('camera.notice.purpose.body')}</p>
      </Section>
      <Section title={t('camera.notice.basis.title')}>
        <p>{t('camera.notice.basis.body')}</p>
      </Section>
      <Section title={t('camera.notice.transfer.title')}>
        <p>{t('camera.notice.transfer.local')}</p>
        {facts.telegram ? (
          <p data-testid="privacy-telegram">
            {t('camera.notice.transfer.telegram')}
            {facts.telegramPhoto ? ` ${t('camera.notice.transfer.telegramPhoto')}` : ''}
          </p>
        ) : null}
      </Section>
      <Section title={t('camera.notice.retention.title')}>
        <p>
          {facts.faceRetentionDays === 0
            ? t('camera.notice.retention.faceNow')
            : t('camera.notice.retention.faceDays', { count: facts.faceRetentionDays })}{' '}
          {t('camera.notice.retention.alerts', { count: facts.alertRetentionDays })}{' '}
          {t('camera.notice.retention.final')}
        </p>
      </Section>
      <Section title={t('camera.notice.staff.title')}>
        <p>{t('camera.notice.staff.body')}</p>
      </Section>
      <Section title={t('camera.notice.rights.title')}>
        <p>{t('camera.notice.rights.body', { contact })}</p>
      </Section>
    </article>
  )
}

/** The one A4 sheet, mounted only while printing (print.css leaves the program window out). */
function PrintSheet({ facts, lang }: { facts: PrivacyFacts; lang: AppLocale }) {
  return createPortal(
    <div className="print-root bg-background text-foreground" data-testid="privacy-print">
      <div className="p-2">
        <PrivacyNotice facts={facts} lang={lang} compact />
      </div>
    </div>,
    document.body
  )
}

/** View the notice, pick its language and print it. */
export function PrivacyNoticeDialog({
  open,
  onOpenChange,
  facts: override
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facts?: Partial<PrivacyFacts>
}) {
  const { t, i18n } = useTranslation()
  const facts = usePrivacyFacts(override)
  const [lang, setLang] = useState<AppLocale>(isAppLocale(i18n.language) ? i18n.language : 'tr')
  const print = usePrint()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('camera.notice.entry')}
      description={t('camera.notice.help')}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button
            onClick={print.start}
            disabled={!facts || print.printing}
            data-testid="privacy-print-button"
          >
            <PrinterIcon aria-hidden />
            {t('camera.notice.print')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <div className="grid gap-1.5">
          <Label id="privacy-lang-label">{t('camera.notice.language')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={lang}
            onValueChange={(v) => (isAppLocale(v) ? setLang(v) : null)}
            aria-labelledby="privacy-lang-label"
            className="justify-start max-md:w-full"
          >
            {LANGUAGES.map((l) => (
              <ToggleGroupItem
                key={l.code}
                value={l.code}
                className="max-md:flex-1"
                data-testid={`privacy-lang-${l.code}`}
              >
                {l.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {facts ? <PrivacyNotice facts={facts} lang={lang} /> : <Skeleton className="h-64 w-full" />}
      </div>
      {print.printing && facts ? <PrintSheet facts={facts} lang={lang} /> : null}
    </ResponsiveDialog>
  )
}

/** The entry: a button that opens the notice. */
export function PrivacyNoticeButton({
  facts,
  variant = 'outline'
}: {
  facts?: Partial<PrivacyFacts>
  variant?: 'outline' | 'ghost' | 'default'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} data-testid="privacy-notice-open">
        <FileTextIcon aria-hidden />
        {t('camera.notice.entry')}
      </Button>
      {open ? <PrivacyNoticeDialog open onOpenChange={setOpen} facts={facts} /> : null}
    </>
  )
}
