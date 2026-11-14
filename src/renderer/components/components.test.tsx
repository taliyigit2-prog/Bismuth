import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { checkAttachments, MAX_ATTACHMENT_BYTES } from './attachment-picker'
import { addMonths, monthGrid, MonthCalendar } from './date-input'
import { FloorPlan } from './floor-plan'
import { matchGuests } from './guest-combobox'
import { sparkPoints } from './kpi-card'
import { Legend } from './legend'
import { ErrorState } from './states'
import { ApiError } from '@/lib/transport/types'
import { isAmount, moneyToText, readMoneyText, textToMoney } from './money-input'
import { kbsState, OccupantList } from './occupant-list'
import { formatPhone, parsePhone } from './phone-field'
import { spanOf } from './tape-chart/layout'
import { TapeChart, type TapeStay } from './tape-chart/tape-chart'

const d = localDate

describe('bileşen kuralları (saf)', () => {
  it('para alanı Türkçe yazımı kuruşa çevirir; kuruş yoksa ondalık göstermez', () => {
    expect(textToMoney('2.800', 'TRY', 'tr')).toBe(280_000)
    expect(textToMoney('2.800,50', 'TRY', 'tr')).toBe(280_050)
    expect(textToMoney('2,800.50', 'TRY', 'en')).toBe(280_050)
    expect(textToMoney('1250.5', 'TRY', 'tr')).toBe(125_050)
    expect(textToMoney('1.250,50', 'TRY', 'tr')).toBe(125_050)
    expect(textToMoney('1,250.50', 'TRY', 'tr')).toBeNaN()
    expect(textToMoney('1250.5', 'TRY', 'en')).toBe(125_050)
    expect(textToMoney('', 'TRY', 'tr')).toBeNull()
    expect(textToMoney('iki bin', 'TRY', 'tr')).toBeNaN()
    expect(moneyToText(280_000, 'TRY', 'tr')).toBe('2.800')
    expect(moneyToText(280_050, 'TRY', 'tr')).toBe('2.800,50')
    expect(moneyToText(-5_000, 'TRY', 'tr')).toBe('-50')
  })

  it('para alanı harf, eksi ve sınırın üstünü tutar saymaz; boş metin boş tutardır (QA2a)', () => {
    expect(readMoneyText('abc', 'TRY', 'tr')).toEqual({ minor: null, problem: 'invalid' })
    expect(readMoneyText('-100', 'TRY', 'tr')).toEqual({ minor: null, problem: 'negative' })
    expect(readMoneyText('-100', 'TRY', 'tr', true)).toEqual({ minor: -10_000, problem: null })
    expect(readMoneyText('99.999.999.999', 'TRY', 'tr')).toEqual({ minor: null, problem: 'tooLarge' })
    expect(readMoneyText('99999999999999999', 'TRY', 'tr')).toEqual({ minor: null, problem: 'tooLarge' })
    expect(readMoneyText('1.000.000.000', 'TRY', 'tr')).toEqual({ minor: 100_000_000_000, problem: null })
    expect(readMoneyText('  ', 'TRY', 'tr')).toEqual({ minor: null, problem: null })
    expect(isAmount({ amountMinor: 0, currency: 'TRY' })).toBe(true)
    expect(isAmount({ amountMinor: null, currency: 'TRY' })).toBe(false)
    expect(isAmount({ amountMinor: Number.NaN, currency: 'TRY' })).toBe(false)
    expect(isAmount({ amountMinor: -1, currency: 'TRY' })).toBe(false)
  })

  it('telefon ülke koduyla ayrılır, Türkiye numarası 3-3-2-2 yazılır', () => {
    expect(parsePhone('+90 532 000 11 22')).toEqual({ code: '90', number: '5320001122' })
    expect(parsePhone('0532 000 11 22')).toEqual({ code: '90', number: '5320001122' })
    expect(parsePhone('+7 900 123 4567')).toEqual({ code: '7', number: '9001234567' })
    expect(formatPhone({ code: '90', number: '5320001122' })).toBe('+90 532 000 11 22')
    // A country code the list does not have survives a save and a read (E.164).
    expect(formatPhone(parsePhone('+86 138 0013 8000'))).toBe('+8613800138000')
    expect(parsePhone('+8613800138000')).toEqual({ code: '', number: '8613800138000' })
  })

  it('ay ekleme günü taşırmaz; ay görünümü pazartesiden başlar, 42 gün', () => {
    expect(addMonths(d('2026-01-31'), 1)).toBe('2026-02-28')
    expect(addMonths(d('2026-01-15'), -1)).toBe('2025-12-15')
    const grid = monthGrid(d('2026-10-04'))
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-09-28') // Monday
  })

  it('misafir araması Türkçe harfleri ve telefon rakamlarını eşler', () => {
    const guests = [
      { id: '1', name: 'Şule Çelik', phone: '+90 532 111 22 33', nationality: 'TR', stays: 2, vip: false },
      { id: '2', name: 'Anna Smirnova', phone: null, nationality: 'RU', stays: 0, vip: false }
    ]
    expect(matchGuests(guests, 'sule celik').map((g) => g.id)).toEqual(['1'])
    expect(matchGuests(guests, '111 22').map((g) => g.id)).toEqual(['1'])
    expect(matchGuests(guests, 'anna').map((g) => g.id)).toEqual(['2'])
  })

  it('KBS durumu: girişi yoksa eksik, ayrılıp çıkışı yoksa çıkış eksik', () => {
    const base = { id: 'o', fullName: 'X', isPrimary: true, descriptorNote: null }
    expect(kbsState({ ...base, leftAt: null, kbsReportedAt: null, kbsCheckoutAt: null })).toBe('missingIn')
    expect(kbsState({ ...base, leftAt: 'x', kbsReportedAt: 'x', kbsCheckoutAt: null })).toBe('missingOut')
    expect(kbsState({ ...base, leftAt: 'x', kbsReportedAt: 'x', kbsCheckoutAt: 'x' })).toBe('done')
  })

  it('ek dosya: türü yanlış ya da 15 MB üstü atlanır, kayıt başına 20 dosya', () => {
    const ok = { name: 'a.jpg', size: 1000, type: 'image/jpeg' }
    expect(checkAttachments(0, [ok, { name: 'a.exe', size: 1, type: 'application/x-msdownload' }])).toEqual({
      accepted: [0],
      problem: 'type'
    })
    expect(checkAttachments(0, [{ ...ok, size: MAX_ATTACHMENT_BYTES + 1 }]).problem).toBe('size')
    expect(checkAttachments(19, [ok, ok])).toEqual({ accepted: [0], problem: 'count' })
  })

  it('şerit takvim: pencere dışındaki konaklama çizilmez, taşan uç kesik gösterilir', () => {
    expect(spanOf(d('2026-10-01'), 10, d('2026-09-28'), d('2026-10-03'))).toEqual({
      start: 0,
      span: 2,
      cutStart: true,
      cutEnd: false
    })
    expect(spanOf(d('2026-10-01'), 10, d('2026-10-09'), d('2026-10-14'))).toMatchObject({
      start: 8,
      span: 2,
      cutEnd: true
    })
    expect(spanOf(d('2026-10-01'), 10, d('2026-09-20'), d('2026-10-01'))).toBeNull()
    expect(sparkPoints([1, 2, 3]).split(' ')).toHaveLength(3)
  })
})

describe('bileşenler (ekran)', () => {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: d(`2026-10-0${i + 1}`),
    highlighted: i === 2,
    special: i === 4 ? { kind: 'holiday' as const, name: 'Bayram' } : null
  }))
  const stay: TapeStay = {
    id: 's1',
    reservationId: 'r1',
    roomId: 'room-101',
    checkIn: d('2026-10-02'),
    checkOut: d('2026-10-05'),
    dayUse: false,
    guest: 'A. Yılmaz',
    price: '2.800 ₺',
    nights: [
      { date: d('2026-10-02'), fill: { kind: 'auto', code: 'paid' } },
      { date: d('2026-10-03'), fill: { kind: 'auto', code: 'unpaid' } },
      { date: d('2026-10-04'), fill: { kind: 'auto', code: 'unpaid' } }
    ],
    border: null,
    depositIcon: false,
    icons: ['kbs'],
    inHouse: true
  }

  it('şerit takvimde konaklama çubuğu adı ve fiyatıyla çizilir; tıklayınca açılır', async () => {
    const onOpenStay = vi.fn()
    await renderWithProviders(
      <TapeChart
        rooms={[{ id: 'room-101', number: '101', typeLabel: 'Double', beds: 2, hk: 'clean' }]}
        days={days}
        today={d('2026-10-03')}
        stays={[stay]}
        blocks={[
          {
            id: 'b',
            roomId: 'room-101',
            dateFrom: d('2026-10-06'),
            dateTo: d('2026-10-08'),
            kind: 'ooo',
            reason: 'Boya'
          }
        ]}
        pastEmptyOn
        onOpenStay={onOpenStay}
        onOpenCell={() => undefined}
        legend={[{ id: 'paid', subject: { kind: 'auto', code: 'paid' }, label: 'Ödendi' }]}
      />
    )
    const bar = await screen.findByTestId('stay-s1')
    expect(bar).toHaveTextContent('A. Yılmaz')
    expect(bar).toHaveTextContent('2.800 ₺')
    // The status is in words too, not only the colour.
    expect(bar).toHaveAccessibleName('A. Yılmaz, oda 101, 2 Eki – 5 Eki; Ödendi')
    expect(screen.getByRole('img', { name: 'Kullanım dışı: Boya' })).toBeInTheDocument()
    expect(screen.getByTestId('tape-today')).toHaveTextContent('3')
    await userEvent.setup().click(bar)
    expect(onOpenStay).toHaveBeenCalledWith(stay)
  })

  it('yetki reddi "yetkiniz yok" der ve yeniden deneme önermez; başka hata yeniden denetir', async () => {
    const denied = new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
    const { unmount } = await renderWithProviders(<ErrorState error={denied} onRetry={() => undefined} />)
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).not.toBeInTheDocument()
    unmount()
    await renderWithProviders(<ErrorState error={new Error('x')} onRetry={() => undefined} />)
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('kişi listesi KBS eksiğini gösterir ve işaretleme düğmesi verir', async () => {
    const onMark = vi.fn()
    await renderWithProviders(
      <OccupantList
        occupants={[
          {
            id: 'o1',
            fullName: 'Kerem Aydın',
            isPrimary: false,
            descriptorNote: 'kızıl saçlı',
            leftAt: null,
            kbsReportedAt: null,
            kbsCheckoutAt: null
          }
        ]}
        onMarkKbs={onMark}
      />
    )
    expect(await screen.findByText('KBS girişi eksik')).toBeInTheDocument()
    expect(screen.getByText('kızıl saçlı')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: "KBS'ye bildirildi olarak işaretle" }))
    expect(onMark).toHaveBeenCalledWith('o1', 'in')
  })

  it('lejant ve kat planı etiketleri dil dosyasından gelir', async () => {
    await renderWithProviders(
      <>
        <Legend items={[{ id: 'paid', subject: { kind: 'auto', code: 'paid' }, label: 'Ödendi' }]} />
        <FloorPlan
          rooms={[
            {
              id: 'r',
              number: '204',
              floor: 2,
              typeLabel: 'Triple',
              beds: 3,
              hk: 'dirty',
              guest: null,
              arriving: true,
              departing: false,
              issues: 1
            }
          ]}
        />
      </>
    )
    expect(await screen.findByRole('region', { name: 'Lejant' })).toHaveTextContent('Ödendi')
    expect(screen.getByTestId('plan-room-204')).toHaveTextContent('Kirli')
    expect(screen.getByLabelText('1 açık arıza')).toBeInTheDocument()
  })

  it('ay takviminde tarih seçilir; ok tuşlarıyla gün değişir', async () => {
    const onPick = vi.fn()
    await renderWithProviders(<MonthCalendar value={d('2026-10-04')} onPick={onPick} />)
    const user = userEvent.setup()
    const selected = await screen.findByRole('gridcell', { selected: true })
    selected.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-day', '2026-10-05'))
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('2026-10-05')
  })
})
