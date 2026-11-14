import * as React from "react"
import { cn } from "@/lib/utils"
import { CharCounter } from "@/components/char-counter"

function Textarea({ className, counter = true, ...props }: React.ComponentProps<"textarea"> & { counter?: boolean }) {
  const length = counter && props.maxLength && typeof props.value === "string" ? props.value.length : null
  const field = (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/15 dark:aria-invalid:ring-destructive/40",
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

export { Textarea }
