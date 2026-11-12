// One way to put text on the clipboard for every copy button (G-191 fatura bilgisi, rehber numarası, kurtarma
// kodları, turizm tablosu). The Clipboard API exists only in a secure page (the Electron window, https, localhost):
// a phone or browser reaching the main computer over plain HTTP has no `navigator.clipboard`, so the old
// `document.execCommand('copy')` on a hidden text box is tried next. When both fail the caller tells the person
// to select and copy the text by hand — never an unhandled error.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

function copyWithTextArea(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  // Off-screen and out of the layout; a class would need the stylesheet, which a detached box may not get.
  area.className = 'sr-only'
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.appendChild(area)
  try {
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    active?.focus()
  }
}

/** true when the text is on the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Refused (no permission, page not focused): try the text box below.
    }
  }
  return copyWithTextArea(text)
}

/** `copyText` that shows "Kopyalanamadı…" itself when nothing could be copied; resolves to whether it copied. */
export function useCopyText(): (text: string) => Promise<boolean> {
  const { t } = useTranslation()
  return useCallback(
    async (text) => {
      const ok = await copyText(text)
      if (!ok) toast.error(t('common.copyFailed'))
      return ok
    },
    [t]
  )
}
