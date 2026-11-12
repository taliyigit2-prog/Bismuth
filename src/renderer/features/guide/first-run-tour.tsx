// The first-run tour (G-18, S-52): a small card in the corner of the window — not a blocking window, so the person
// can open the screen it talks about and look while reading. Shown once per person (`ui.tourDone`), skippable at
// every step; the guide and Ayarlar → Kılavuz start it again. The hotel can switch the automatic tour off for new
// accounts (`guide.tourForNewUsers`).
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, ExternalLinkIcon, XIcon } from 'lucide-react'
import { isAppLocale } from '@shared/format'
import { Button } from '@/components/ui/button'
import { guideImage } from '@/guide/images'
import { useUpdateSettings } from '@/lib/api/hooks'
import { useMe } from '@/lib/session/session'
import { useCan } from '@/lib/view-as'
import { useTourAutoOpen } from './tour-auto'
import { closeTour, setTourStep, useTourState } from './tour-store'
import { tourStepsFor } from './tour-steps'

export function FirstRunTour() {
  const { t, i18n } = useTranslation()
  const lang = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const can = useCan()
  const tour = useTourState()
  const auto = useTourAutoOpen()
  const update = useUpdateSettings()
  const titleId = useId()
  const cardRef = useRef<HTMLElement>(null)
  const userId = useMe()?.user.id ?? null
  const steps = tourStepsFor((key) => can(key))
  const open = tour.requested || (auto && tour.dismissedBy !== userId)
  const index = Math.min(tour.step, steps.length - 1)
  const step = steps[index]

  // Opened by hand: the card takes the focus, so the keyboard user lands in it.
  const requested = tour.requested
  useEffect(() => {
    if (requested) cardRef.current?.focus()
  }, [requested])

  if (!open || !step) return null

  const finish = (): void => {
    closeTour(userId)
    update.mutate({ 'ui.tourDone': true })
  }
  const last = index === steps.length - 1
  const image = guideImage(lang, step.image)
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      finish()
    }
  }

  // In <body>: the top bar it is mounted from blurs its background, which would make it the frame of a fixed card.
  return createPortal(
    <section
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-testid="guide-tour"
      data-step={step.id}
      className="bg-popover text-popover-foreground focus-visible:ring-ring fixed end-4 bottom-4 z-40 grid w-[min(25rem,calc(100vw-2rem))] gap-3 rounded-xl border p-4 shadow-lg outline-none focus-visible:ring-[3px] max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs" data-testid="guide-tour-progress">
          {t('guide.tour.label')} · {t('guide.tour.progress', { step: index + 1, total: steps.length })}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="-me-2 -mt-2 size-8 max-md:size-11"
          onClick={finish}
          aria-label={t('guide.tour.close')}
          data-testid="guide-tour-close"
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <h2 id={titleId} className="text-base font-semibold text-balance">
        {t(`guide.tour.steps.${step.id}.title`)}
      </h2>
      {image ? (
        <img
          src={image}
          alt=""
          className="bg-muted aspect-video w-full rounded-md border object-cover object-top"
        />
      ) : null}
      <p className="text-sm leading-relaxed">{t(`guide.tour.steps.${step.id}.body`)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {step.path !== '/guide' ? (
          <Link
            to={step.path}
            className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline max-md:min-h-11"
            data-testid="guide-tour-screen"
          >
            <ExternalLinkIcon className="size-4" aria-hidden />
            {t('guide.tour.goTo')}
          </Link>
        ) : null}
        <Link
          to="/guide"
          search={
            step.guide
              ? { s: step.guide.section, ...(step.guide.anchor ? { a: step.guide.anchor } : {}) }
              : {}
          }
          className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline max-md:min-h-11"
          data-testid="guide-tour-read"
        >
          <BookOpenIcon className="size-4" aria-hidden />
          {step.guide ? t('guide.tour.readMore') : t('guide.tour.openGuide')}
        </Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        {last ? (
          <span />
        ) : (
          <Button variant="ghost" size="sm" onClick={finish} data-testid="guide-tour-skip">
            {t('guide.tour.skip')}
          </Button>
        )}
        <div className="flex gap-2">
          {index > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTourStep(index - 1)}
              data-testid="guide-tour-back"
            >
              <ArrowLeftIcon className="rtl:rotate-180" aria-hidden />
              {t('guide.tour.back')}
            </Button>
          ) : null}
          {last ? (
            <Button size="sm" onClick={finish} data-testid="guide-tour-done">
              {t('guide.tour.done')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setTourStep(index + 1)} data-testid="guide-tour-next">
              {t('guide.tour.next')}
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </section>,
    document.body
  )
}
