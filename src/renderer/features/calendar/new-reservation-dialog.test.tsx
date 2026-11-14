import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { setViewAs } from '@/lib/view-as'
import { renderWithProviders } from '@/test/render'
import { bookingTransport, defaultBookingState, type BookingState } from './booking-fake'
import { NewReservationDialog } from './new-reservation-dialog'

const SATURDAY = localDate('2026-10-03')
const FRIDAY = localDate('2026-10-02')

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => setViewAs(null))

async function open(state: Partial<BookingState> = {}, date = FRIDAY, roomId: string | null = 'room-101') {
  const transport = bookingTransport({ state })
  const onCreated = vi.fn()
  const onOpenChange = vi.fn()
  await renderWithProviders(
    <NewReservationDialog seed={{ roomId, date }} onOpenChange={onOpenChange} onCreated={onCreated} />,
    { transport }
  )
  await screen.findByTestId('room-multi-picker')
  return { transport, onCreated, onOpenChange, user: userEvent.setup() }
}

async function typeGuest(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole('combobox', { name: 'Misafir' }))
  await user.type(await screen.findByPlaceholderText('Ad ya da telefon…'), text)
}

describe('yeni rezervasyon', () => {
  it('cumartesi gecesi oda tipinin hafta sonu fiyatı önerilir; para birimi avroya geçince öneri ve tutar kalkar', async () => {
    const { user } = await open({}, SATURDAY)
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('₺3.200')
    expect(screen.getByTestId('new-total')).toHaveTextContent('1 gece, toplam ₺3.200')
    await user.click(screen.getByRole('combobox', { name: 'Para birimi' }))
    await user.click(await screen.findByRole('option', { name: 'EUR' }))
    expect(screen.getByLabelText('Gecelik fiyat (tüm geceler)')).toHaveValue('')
    expect(screen.getByText('Bu oda tipinin önerilen fiyatı yok; fiyatı yazın.')).toBeInTheDocument()
    expect(screen.queryByTestId('new-total')).not.toBeInTheDocument()
  })

  it('yeni misafir hızlı formuyla kaydedilir; geceler kendi öneri fiyatıyla (hafta sonu gecesi, bayram) gider', async () => {
    const { user, transport, onCreated } = await open({
      days: [
        {
          id: 'd1',
          date: localDate('2026-10-04'),
          occurrenceDate: localDate('2026-10-04'),
          kind: 'holiday',
          title: 'Örnek bayram',
          titleI18n: null,
          source: 'generated',
          estimated: false
        }
      ]
    })
    await typeGuest(user, 'Elif Deniz Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Deniz Kaya'))
    const form = screen.getByTestId('new-guest-form')
    expect(within(form).getByTestId('new-guest-first')).toHaveValue('Elif Deniz')
    expect(within(form).getByTestId('new-guest-last')).toHaveValue('Kaya')
    // Friday → Monday: Friday and Saturday nights take the weekend price (K-44), Sunday is the holiday.
    await user.click(screen.getByRole('button', { name: /^Çıkış/ }))
    await user.click(await screen.findByRole('gridcell', { name: /^5 Ekim 2026/ }))
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('res-1'))
    const [input] = transport.callsTo('booking.create') as {
      guest: unknown
      stays: { prices: { date: string; priceMinor: number }[] }[]
      blacklistConfirmed?: boolean
    }[]
    expect(input?.guest).toEqual({ firstName: 'Elif Deniz', lastName: 'Kaya', phone: null, email: null })
    expect(input?.stays[0]?.prices).toEqual([
      { date: '2026-10-02', priceMinor: 320_000 },
      { date: '2026-10-03', priceMinor: 320_000 },
      { date: '2026-10-04', priceMinor: 320_000 }
    ])
    expect(input?.blacklistConfirmed).toBeUndefined()
  })

  it('yeni misafir olarak yazılan ad kayıtlı bir kartla eşleşirse o kart önerilir ve seçilince kullanılır (mükerrer kart)', async () => {
    const { user, transport, onCreated } = await open({
      guests: [{ id: 'g-elif', firstName: 'Elif', lastName: 'Kaya', phone: '+90 555 000 11 22' } as never]
    })
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    const similar = await screen.findByTestId('similar-guests')
    expect(similar).toHaveTextContent('Elif Kaya')
    await user.click(within(similar).getByTestId('use-guest-g-elif'))
    expect(screen.queryByTestId('new-guest-form')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Çıkış/ }))
    await user.click(await screen.findByRole('gridcell', { name: /^5 Ekim 2026/ }))
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const [input] = transport.callsTo('booking.create') as { guest: unknown }[]
    expect(input?.guest).toEqual({ id: 'g-elif' })
  })

  it('giriş ve çıkış aynı gün seçilince saat aralığı istenir; saatsiz kayıt gitmez, saatlerle gider (S-103)', async () => {
    const { user, transport, onCreated } = await open()
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    await user.click(screen.getByRole('button', { name: /^Çıkış/ }))
    await user.click(await screen.findByRole('gridcell', { name: /^2 Ekim 2026/ }))
    expect(await screen.findByTestId('new-reservation-start')).toBeInTheDocument()
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByText('Bitiş saati başlangıçtan sonra olmalı.')).toBeInTheDocument()
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    await user.type(screen.getByTestId('new-reservation-start'), '1000')
    await user.type(screen.getByTestId('new-reservation-end'), '1300')
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const [input] = transport.callsTo('booking.create') as {
      stays: { checkIn: string; checkOut: string; startTime?: string; endTime?: string }[]
    }[]
    expect(input?.stays[0]).toMatchObject({
      checkIn: '2026-10-02',
      checkOut: '2026-10-02',
      startTime: '10:00',
      endTime: '13:00'
    })
    // The room list is asked for rooms free in those hours, not for the whole day.
    expect(transport.callsTo('booking.availability').at(-1)).toMatchObject({
      startTime: '10:00',
      endTime: '13:00'
    })
  })

  it('gecelik fiyata "abc" ya da "-500" yazılınca alan hata gösterir, öneri fiyatına dönülüp kaydedilmez (QA3c1 #9)', async () => {
    const { user, transport, onCreated } = await open()
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    const price = screen.getByLabelText('Gecelik fiyat (tüm geceler)')
    for (const bad of ['abc', '-500', '12a']) {
      await user.clear(price)
      await user.type(price, bad)
      await user.click(screen.getByTestId('new-reservation-save'))
      expect(await screen.findByTestId('money-error')).toBeInTheDocument()
      expect(price).toHaveValue(bad)
    }
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    expect(onCreated).not.toHaveBeenCalled()
    await user.clear(price)
    await user.type(price, '1250.5')
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const [input] = transport.callsTo('booking.create') as { stays: { prices: { priceMinor: number }[] }[] }[]
    expect(input?.stays[0]?.prices.map((p) => p.priceMinor)).toEqual([125_050])
  })

  it('300 harflik ad alanın altında hata verir, kayıt gitmez; kara liste ve kopya sorguları 160 karakterde kalır (H-07)', async () => {
    const { user, transport, onCreated } = await open()
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    const first = screen.getByTestId('new-guest-first')
    // A long paste cannot get past the field's own limit; the field says so.
    await user.clear(first)
    await user.click(first)
    await user.paste('A'.repeat(300))
    expect((first as HTMLInputElement).value).toHaveLength(80)
    expect(await screen.findByText('En çok 80 karakter yazabilirsiniz.')).toBeInTheDocument()
    await waitFor(() => {
      const calls = transport.callsTo('booking.checkBlacklist') as { name: string }[]
      expect(calls.every((c) => c.name.length <= 160)).toBe(true)
    })
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('aramaya yapıştırılan 300 harflik ad "Yeni misafir" olunca alan altı hata verir, sorgu 400 almaz (H-07)', async () => {
    const { user, transport } = await open()
    await user.click(screen.getByRole('combobox', { name: 'Misafir' }))
    const box = await screen.findByPlaceholderText('Ad ya da telefon…')
    await user.click(box)
    await user.paste('Bora '.repeat(60).trim())
    await user.click(await screen.findByText(/^Yeni misafir: Bora/))
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findAllByText('En çok 80 karakter yazabilirsiniz.')).not.toHaveLength(0)
    const calls = transport.callsTo('booking.checkBlacklist') as { name: string }[]
    expect(calls.every((c) => c.name.length <= 160)).toBe(true)
    expect(transport.callsTo('booking.create')).toHaveLength(0)
  })

  it('telefon yerine "telefon" yazılınca alan altı hata çıkar, kayıt gitmez (H-05/H-21)', async () => {
    const { user, transport } = await open()
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    await user.type(screen.getByTestId('new-guest-phone'), 'telefon')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByText(/Telefonu rakamlarla yazın/)).toBeInTheDocument()
    expect(transport.callsTo('booking.create')).toHaveLength(0)
  })

  it('gecelik fiyat 0 ise bir kez sorulur; "Yine de kaydet" kaydeder, "Vazgeç" kaydetmez (H-08)', async () => {
    const { user, transport, onCreated } = await open()
    await typeGuest(user, 'Elif Kaya')
    await user.click(await screen.findByText('Yeni misafir: Elif Kaya'))
    const price = screen.getByLabelText('Gecelik fiyat (tüm geceler)')
    await user.clear(price)
    await user.type(price, '0')
    await user.click(screen.getByTestId('new-reservation-save'))
    const dialog = await screen.findByRole('alertdialog', { name: 'Fiyat 0 olarak kaydedilsin mi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    await user.click(screen.getByTestId('new-reservation-save'))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yine de kaydet' })
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const [input] = transport.callsTo('booking.create') as { stays: { prices: { priceMinor: number }[] }[] }[]
    expect(input?.stays[0]?.prices.map((p) => p.priceMinor)).toEqual([0])
  })

  it('kara listedeki ad kırmızı uyarı verir; işaretlenmeden kaydedilmez, işaretlenince onayla kaydedilir', async () => {
    const { user, transport, onCreated } = await open({
      blacklist: [{ id: 'bl-1', name: 'Sorunlu Kişi', severity: 'block', reasonText: 'Odaya zarar verdi' }]
    })
    await typeGuest(user, 'sorunlu kisi')
    await user.click(await screen.findByText('Yeni misafir: sorunlu kisi'))
    const warning = await screen.findByTestId('blacklist-warning')
    expect(warning).toHaveTextContent('Bu kişi kara listede')
    expect(warning).toHaveTextContent('Odaya zarar verdi')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByTestId('new-reservation-error')).toHaveTextContent(
      'Kara liste uyarısını okuyup onaylayın.'
    )
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    await user.click(within(warning).getByTestId('blacklist-confirm'))
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(transport.callsTo('booking.create')[0]).toMatchObject({ blacklistConfirmed: true })
  })

  it('geçmiş bir günde başlayan kayıtta uyarı çıkar (engel değil); gelecek günde çıkmaz (QA3c1 #17)', async () => {
    await open({}, localDate('2020-01-10'))
    expect(await screen.findByTestId('past-check-in')).toHaveTextContent('Giriş tarihi geçmişte')
    expect(screen.getByTestId('new-reservation-save')).toBeEnabled()
  })

  it('gelecekteki girişte geçmiş uyarısı yoktur', async () => {
    await open({}, localDate('2099-01-10'))
    expect(screen.queryByTestId('past-check-in')).not.toBeInTheDocument()
  })

  it('"Engelle" kaydında Resepsiyona "yine de kaydet" kutusu sunulmaz, yalnız nedeni söylenir (QA3c1 #11)', async () => {
    setViewAs('reception')
    const { user, transport } = await open({
      blacklist: [{ id: 'bl-1', name: 'Sorunlu Kişi', severity: 'block', reasonText: 'Odaya zarar verdi' }]
    })
    await typeGuest(user, 'sorunlu kisi')
    await user.click(await screen.findByText('Yeni misafir: sorunlu kisi'))
    const warning = await screen.findByTestId('blacklist-warning')
    expect(warning).toHaveTextContent('Engelle')
    expect(within(warning).queryByTestId('blacklist-confirm')).not.toBeInTheDocument()
    expect(within(warning).getByTestId('blacklist-blocked')).toHaveTextContent('yalnız Sahip ya da Müdür')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByTestId('new-reservation-error')).toHaveTextContent('yalnız Sahip ya da Müdür')
    expect(transport.callsTo('booking.create')).toHaveLength(0)
  })

  it('kayıtlı misafir seçilince geçmiş kartı son ödediği fiyatı, önemli sürekli notu ve onay kutusunu gösterir', async () => {
    const { user, transport } = await open({
      guests: [
        {
          id: 'g-1',
          firstName: 'Mert',
          lastName: 'Aydın',
          phone: '0532 111 22 33',
          stays: 3,
          summary: {
            standingNote: { text: 'Yüksek kat ister', level: 'warn', requiresConfirm: true },
            lastNightly: { amountMinor: 250_000, currency: 'TRY' },
            lastStayDate: localDate('2026-08-10'),
            stayCount: 3,
            totalNights: 7,
            totalSpent: { TRY: 1_750_000 }
          }
        }
      ]
    })
    await typeGuest(user, 'mert')
    await user.click(await screen.findByText('Mert Aydın'))
    expect(await screen.findByTestId('standing-note')).toHaveTextContent('Yüksek kat ister')
    expect(await screen.findByTestId('last-nightly')).toHaveTextContent('₺2.500')
    expect(screen.getByTestId('last-paid')).toHaveTextContent('Misafirin son ödediği: ₺2.500')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByTestId('new-reservation-error')).toHaveTextContent('önemli notunu')
    await user.click(screen.getByRole('checkbox', { name: 'Bu notu okudum' }))
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(transport.callsTo('booking.create')).toHaveLength(1))
    expect(transport.callsTo('booking.create')[0]).toMatchObject({ guest: { id: 'g-1' } })
  })

  it('seçilen tarihlerde dolu oda işaretlenemez; açık arızalı oda seçilince uyarı verir', async () => {
    const base = defaultBookingState()
    base.options.rooms[0]!.openIssues = [
      {
        id: 'i1',
        roomId: 'room-101',
        title: 'Klima su damlatıyor',
        severity: 'medium',
        status: 'open',
        blocksRoom: false
      }
    ]
    const { user } = await open(
      { options: base.options, taken: { occupied: ['room-102'], blocked: [] } },
      FRIDAY,
      null
    )
    await user.click(screen.getByTestId('room-multi-picker'))
    await waitFor(() => expect(screen.getByTestId('room-option-102')).toHaveTextContent('dolu'))
    expect(within(screen.getByTestId('room-option-102')).getByRole('checkbox')).toBeDisabled()
    await user.click(within(screen.getByTestId('room-option-101')).getByRole('checkbox'))
    expect(await screen.findByTestId('room-issue-warning')).toHaveTextContent('Oda 101: açık arıza var')
    expect(screen.getByTestId('room-issue-warning')).toHaveTextContent('Klima su damlatıyor')
  })
})
