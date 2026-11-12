// Copy to clipboard (G-191 fatura bilgisi, turizm tablosu): the icon turns into a tick for a moment. Copies through
// `lib/copy-text` (works without the Clipboard API too; says "Kopyalanamadı…" when nothing could be copied).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopyText } from '@/lib/copy-text'

export function CopyButton({
  text,
  label,
  variant = 'outline',
  size = 'sm',
  onCopied
}: {
  text: string | (() => string)
  label?: string
  variant?: 'outline' | 'ghost' | 'secondary'
  size?: 'sm' | 'icon-sm'
  /** After the text is on the clipboard (e.g. a company rises in the list). */
  onCopied?: () => void
}) {
  const { t } = useTranslation()
  const copyText = useCopyText()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = async (): Promise<void> => {
    if (!(await copyText(typeof text === 'function' ? text() : text))) return
    setCopied(true)
    onCopied?.()
  }
  const Icon = copied ? CheckIcon : CopyIcon
  const shown = label ?? t('common.copy')
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => void copy()}
      aria-label={size === 'icon-sm' ? shown : undefined}
      data-copied={copied || undefined}
    >
      <Icon aria-hidden className={copied ? 'text-success' : undefined} />
      {size === 'icon-sm' ? null : <span>{copied ? t('common.copied') : shown}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? t('common.copied') : ''}
      </span>
    </Button>
  )
}
