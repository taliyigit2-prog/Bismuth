// The "?" of the top bar (G-18): opens the part of the guide that explains the screen on display
// (guide/route-map.ts); on a screen the map does not know, the guide's home page. The first-run tour lives here as
// well, because the top bar is on every screen of the program (desktop and phone) and nowhere else.
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CircleHelpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { guideTargetFor } from '@/guide/route-map'
import { FirstRunTour } from './first-run-tour'

export function GuideButton() {
  const { t } = useTranslation()
  const location = useRouterState({ select: (s) => s.location })
  const onGuide = location.pathname === '/guide'
  const target = guideTargetFor(location.pathname, location.search as Record<string, unknown>)
  const search = target ? { s: target.section, ...(target.anchor ? { a: target.anchor } : {}) } : {}
  return (
    <>
      {onGuide ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="max-md:size-11" asChild>
              <Link to="/guide" search={search} aria-label={t('guide.help')} data-testid="guide-help">
                <CircleHelpIcon aria-hidden />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('guide.help')}</TooltipContent>
        </Tooltip>
      )}
      <FirstRunTour />
    </>
  )
}
