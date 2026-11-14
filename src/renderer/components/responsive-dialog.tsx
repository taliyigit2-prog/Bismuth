// One dialog API for both layouts (.claude/rules/ui.md): a centred Dialog on the desktop, a bottom Sheet on the
// phone (< 768 px). Forms inside it keep the same rules: Esc closes (Radix), Enter saves (`submitOnEnter`, below). On
// both, a tall form scrolls between the title and the buttons: the buttons stay in sight.
import type { KeyboardEvent, ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const NOT_FOR_ENTER = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'file',
  'image',
  'color',
  'range'
])

/**
 * Enter in a field of the dialog's form saves, as on a web page — also when the save button sits in the footer,
 * outside the scrolling body (`form="…"`), and whichever field has the cursor. A field that uses Enter itself (a
 * guest search picking a name, the laundry slip moving to the next count) calls preventDefault first and keeps it;
 * a text area takes Ctrl/⌘+Enter (Enter is a new line there). A save button that is disabled (loading, nothing to
 * save) stays disabled: Enter does nothing then.
 */
export function submitOnEnter(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Enter' || e.defaultPrevented || e.altKey || e.nativeEvent.isComposing) return
  const el = e.target as HTMLElement
  const mod = e.ctrlKey || e.metaKey
  let form: HTMLFormElement | null = null
  if (el instanceof HTMLInputElement) {
    if (NOT_FOR_ENTER.has(el.type) || el.getAttribute('role') === 'combobox') return
    form = el.form
  } else if (el instanceof HTMLTextAreaElement) {
    if (!mod) return
    form = el.form
  } else return
  if (!form) return
  const button = [...form.elements].find(
    (c): c is HTMLButtonElement | HTMLInputElement =>
      (c instanceof HTMLButtonElement || c instanceof HTMLInputElement) && c.type === 'submit'
  )
  // A form without a save button of its own (a one-field search) keeps the browser's own Enter.
  if (!button) return
  e.preventDefault()
  if (!button.disabled) form.requestSubmit(button)
}

export interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Buttons; on the phone they stack full width at the bottom. */
  footer?: ReactNode
  children: ReactNode
  /** Desktop width class (default `sm:max-w-lg`). */
  className?: string
  /**
   * False: on the phone the bottom sheet does not move the focus into its first field when it opens, so the keyboard
   * does not cover the choices below it (P17d: the cancel dialog's refund options). Desktop keeps the focus.
   */
  focusFirstOnPhone?: boolean
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
  focusFirstOnPhone = true
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile()
  if (isMobile)
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
          onOpenAutoFocus={focusFirstOnPhone ? undefined : (e) => e.preventDefault()}
        >
          {/* The end padding keeps a long title clear of the 44 px close button. */}
          <SheetHeader className="pe-14 text-start">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
            data-testid="dialog-body"
            onKeyDown={submitOnEnter}
          >
            {children}
          </div>
          {footer ? <SheetFooter className="border-t">{footer}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg', className)}>
        <DialogHeader className="shrink-0 p-6 pe-12 pb-4">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {/* px/py leave room for the focus rings of the fields at the edges of the scrolling box; the bottom
            padding also keeps the last field or error clear of the footer's line. */}
        <div
          className={cn('min-h-0 flex-1 overflow-y-auto px-6 pt-1', footer ? 'pb-3' : 'pb-6')}
          data-testid="dialog-body"
          onKeyDown={submitOnEnter}
        >
          {children}
        </div>
        {footer ? <DialogFooter className="shrink-0 border-t px-6 py-4">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
