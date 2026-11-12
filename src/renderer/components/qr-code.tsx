// A QR code drawn as one SVG path (faz-13 madde 1: the address a phone opens with its camera). Encoding by `uqr`
// (MIT, no dependencies, bundled — nothing is fetched). Dark modules on a light square in both themes, with the
// quiet zone scanners need; the address itself is always written next to it (the code never stands alone).
import { useMemo } from 'react'
import { encode } from 'uqr'
import { cn } from '@/lib/utils'

/** Path of the dark modules: one `h1v1h-1z` square each, offset by the quiet zone. */
export function qrPath(text: string, quiet = 2): { size: number; d: string } {
  const { data, size } = encode(text, { ecc: 'M', border: 0 })
  const parts: string[] = []
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
    })
  )
  return { size: size + quiet * 2, d: parts.join('') }
}

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => qrPath(value), [value])
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn(
        'bg-background text-foreground dark:bg-foreground dark:text-background size-40 rounded-md',
        className
      )}
      data-testid="qr-code"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}
