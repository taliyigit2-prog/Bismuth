import type { ReactNode } from 'react'

/** Screens before the app shell: setup wizard, sign-in, lock (no menu, nothing to navigate to yet). */
export function BareLayout({ children }: { children: ReactNode }) {
  return (
    // The tinted background is on <body> (globals.css, `data-bare-layout`) so the scrollbar gutter matches it.
    <div
      data-bare-layout
      className="flex min-h-dvh flex-col ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-10"
    >
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col">{children}</main>
    </div>
  )
}
