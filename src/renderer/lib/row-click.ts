// Clickable table rows (QA2a): React passes a click inside a portal — the row's "⋯" menu, a dialog opened from
// it — up through the row in the component tree although it happened elsewhere on the screen. Such a click must
// not also open the row's own form ("İptal et" opened "Düzenle" too), so a row answers only clicks on itself.
import type { MouseEvent } from 'react'

export function rowClick<T extends Element>(handler: () => void): (e: MouseEvent<T>) => void {
  return (e) => {
    if (e.target instanceof Node && e.currentTarget.contains(e.target)) handler()
  }
}
