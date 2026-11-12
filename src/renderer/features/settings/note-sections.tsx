// Short sections whose screens live elsewhere: Döviz (rates are on the Döviz screen, Faz 11) and Hakkında (the About
// screen). Yedek has its own section (backup-section.tsx, Faz 14).
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function Note({
  title,
  body,
  badge,
  children
}: {
  title: string
  body: string
  badge?: ReactNode
  children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="max-md:sr-only">{title}</CardTitle>
          {badge}
        </div>
        <CardDescription className="max-w-prose text-pretty">{body}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  )
}

function OpenButton({ to, label }: { to: '/currency' | '/about'; label: string }) {
  return (
    <Button asChild variant="outline" className="max-md:w-full">
      <Link to={to}>
        {label}
        <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
      </Link>
    </Button>
  )
}

export function CurrencyNote() {
  const { t } = useTranslation()
  return (
    <Note title={t('settings.tab.currency')} body={t('settings.currencyNote.body')}>
      <OpenButton to="/currency" label={t('settings.currencyNote.open')} />
    </Note>
  )
}

export function AboutNote() {
  const { t } = useTranslation()
  return (
    <Note title={t('settings.tab.about')} body={t('settings.aboutNote.body')}>
      <OpenButton to="/about" label={t('settings.aboutNote.open')} />
    </Note>
  )
}
