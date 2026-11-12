// The message under a form field (tasarim.md §6 "Form": etiket üstte, açıklama/hata altta). Nothing when empty.
export function FieldError({ message, id }: { message?: string | false | null; id?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive text-xs" data-slot="field-error">
      {message}
    </p>
  )
}
