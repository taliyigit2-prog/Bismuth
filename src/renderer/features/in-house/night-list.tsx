// The printed night list (G-54, akislar.md "Gece"): one A4 table of every room in the house — people with their
// descriptor notes, the KBS state (a missing mark in words, not only colour), the stay dates and the reservation
// note — for the night shift. It lives at the end of <body> and is shown only by the print style (night-list.css).
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { InHouseViewDto } from '@shared/contract/procedures/today'
import { useFormat } from '@/hooks/use-format'
import { useSettings } from '@/lib/api/hooks'
import { kbsOf } from './in-house-model'
import './night-list.css'

export function NightList({ view }: { view: InHouseViewDto }) {
  const { t } = useTranslation()
  const f = useFormat()
  const hotel = useSettings().data?.['hotel.name'] ?? ''
  const people = view.rooms.reduce((n, r) => n + r.people, 0)
  const now = new Date().toISOString()
  return createPortal(
    <section className="night-list hidden" data-testid="night-list" aria-hidden>
      <header className="mb-2 flex items-baseline justify-between gap-4">
        <h1 className="text-base font-semibold">{t('inHouse.nightList.title', { hotel })}</h1>
        <p>{t('inHouse.nightList.printedAt', { date: f.date(view.today), time: f.time(now) })}</p>
      </header>
      <p className="mb-2">{t('inHouse.nightList.total', { rooms: view.rooms.length, people })}</p>
      <table>
        <thead>
          <tr>
            <th className="w-[9%] text-start">{t('inHouse.nightList.room')}</th>
            <th className="w-[41%] text-start">{t('inHouse.nightList.people')}</th>
            <th className="w-[18%] text-start">{t('inHouse.nightList.kbs')}</th>
            <th className="w-[14%] text-start">{t('inHouse.nightList.stay')}</th>
            <th className="w-[18%] text-start">{t('inHouse.nightList.note')}</th>
          </tr>
        </thead>
        <tbody>
          {view.rooms.map((r) => (
            <tr key={r.stayId}>
              <td className="font-semibold tabular-nums">{r.roomNumber}</td>
              <td>
                {r.occupants.length ? (
                  r.occupants.map((o) => (
                    <div key={o.id}>
                      <span className="font-medium">{o.fullName}</span>
                      {o.descriptorNote ? <span> — {o.descriptorNote}</span> : null}
                    </div>
                  ))
                ) : (
                  <div className="font-semibold">{t('inHouse.nightList.nobody', { name: r.guestName })}</div>
                )}
              </td>
              <td>
                {r.occupants.length ? (
                  r.occupants.map((o) => (
                    <div
                      key={o.id}
                      className={kbsOf(o, view.kbsChecks) === 'missingIn' ? 'font-semibold' : undefined}
                    >
                      {kbsOf(o, view.kbsChecks) === 'ok'
                        ? t('inHouse.nightList.kbsOk')
                        : kbsOf(o, view.kbsChecks) === 'off'
                          ? '—'
                          : t('occupants.kbsMissingIn')}
                    </div>
                  ))
                ) : (
                  <div className="font-semibold">{t('occupants.kbsMissingIn')}</div>
                )}
              </td>
              <td className="tabular-nums">
                {f.dayMonth(r.checkIn)} – {f.dayMonth(r.checkOut)}
              </td>
              <td>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.checkoutPending.length ? (
        <p className="mt-2">
          {t('inHouse.nightList.pending', {
            names: view.checkoutPending.map((p) => `${p.roomNumber} ${p.fullName}`).join(', ')
          })}
        </p>
      ) : null}
    </section>,
    document.body
  )
}
