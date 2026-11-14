/** "Ayşe Yılmaz" → first "Ayşe", last "Yılmaz"; one word is a first name. */
export function splitGuestName(text: string): { firstName: string; lastName: string } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1]! }
}
