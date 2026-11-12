// "When" of a KBS mark or a departure on "Otelde kalanlar": the time today ("14:32"), the day and time on another
// day ("30 Eyl 14:32").
import { localDateOf } from '@shared/date'
import { useFormat } from '@/hooks/use-format'

export function useWhen(): (iso: string) => string {
  const f = useFormat()
  return (iso) => {
    const day = localDateOf(new Date(iso))
    return day === localDateOf(new Date()) ? f.time(iso) : `${f.dayMonth(day)} ${f.time(iso)}`
  }
}
