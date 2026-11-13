import * as React from "react"
import { cn } from "@/lib/utils"
import { CharCounter } from "@/components/char-counter"

function Input({ className, type, counter = true, ...props }: React.ComponentProps<"input"> & { counter?: boolean }) {
  const length = counter && props.maxLength && typeof props.value === "string" ? props.value.length : null
  const field = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 max-md:h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/15",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
  return length === null ? (
    field
  ) : (
    <>
      {field}
      <CharCounter length={length} max={props.maxLength!} />
    </>
  )
}

export { Input }
