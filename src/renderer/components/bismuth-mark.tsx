// Bismuth logo mark: a stepped "hopper" crystal, the shape bismuth grows in. Colours are theme tokens.
export function BismuthMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 8h16v16H8z" className="stroke-primary-foreground" fill="none" strokeWidth="2" />
      <path
        d="M12 12h8v8h-8z"
        className="stroke-primary-foreground"
        fill="none"
        strokeWidth="2"
        opacity="0.8"
      />
      <path d="M15 15h2v2h-2z" className="fill-primary-foreground" />
    </svg>
  )
}
