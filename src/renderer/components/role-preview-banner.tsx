// Shown while the owner previews the menu as another role (Ayarlar → Roller → "Bu rolün gözüyle bak"); one click
// returns to the user's own view.
import { useTranslation } from 'react-i18next'
import { EyeIcon } from 'lucide-react'
import { SYSTEM_ROLE_CODES } from '@shared/permissions'
import { isAppLocale } from '@shared/format'
import { Button } from '@/components/ui/button'
import { localizedName } from '@/lib/session/role-name'
import { setViewAs, usePreviewRole } from '@/lib/view-as'

export function RolePreviewBanner() {
  const { t, i18n } = useTranslation()
  const { viewAs, role } = usePreviewRole()
  if (viewAs === null) return null
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const code = SYSTEM_ROLE_CODES.find((c) => c === viewAs)
  const name = role ? localizedName(role.name, role.displayName, locale) : code ? t(`roles.${code}`) : ''
  return (
    <div
      role="status"
      data-testid="role-preview"
      className="bg-accent text-accent-foreground flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    >
      <EyeIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t('rolePreview.banner', { role: name })}</span>
      <Button size="sm" variant="outline" onClick={() => setViewAs(null)}>
        {t('rolePreview.exit')}
      </Button>
    </div>
  )
}
