// The reservation panel's guest summary shows the guest's tags (G-50, K-46 (2)): read only, a switched-off tag
// faded with "(kapalı)"; no tags, no tag row (and no list read).
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { ListItem, ProcedureName } from '@shared/contract'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { GuestSummaryCard } from './guest-summary-card'

const tag = (id: string, name: string, active = true): ListItem => ({
  id,
  code: `custom_${id}`,
  name,
  nameI18n: null,
  active,
  sort: 1,
  seeded: false
})

function transport(tagIds: string[]) {
  const t = fakeTransport()
  const call = t.call.bind(t)
  t.call = (async (name: ProcedureName, input: unknown) => {
    if (name === 'booking.guestSummary') {
      t.calls.push({ name, input })
      return {
        guestId: 'g-1',
        firstName: 'Ayşe',
        lastName: 'Örnek',
        vip: false,
        standingNote: null,
        lastStayDate: null,
        lastNightly: null,
        averageNightly: {},
        totalSpent: {},
        totalNights: 0,
        stayCount: 0,
        tagIds,
        recent: []
      }
    }
    if (name === 'lists.list') {
      t.calls.push({ name, input })
      return [tag('t-1', 'Düzenli'), tag('t-2', 'Eski kampanya', false), tag('t-3', 'Firma misafiri')]
    }
    return call(name as never, input as never)
  }) as typeof t.call
  return t
}

describe('rezervasyon panelinde misafir etiketleri', () => {
  it('misafirin etiketleri yalnız görüntü olarak çıkar; kapalı etiket "(kapalı)" yazar', async () => {
    await renderWithProviders(<GuestSummaryCard guestId="g-1" />, { transport: transport(['t-1', 't-2']) })
    const tags = await screen.findByTestId('guest-summary-tags')
    expect(
      within(tags)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Düzenli', 'Eski kampanya (kapalı)'])
    expect(within(tags).queryByRole('button')).toBeNull()
  })

  it('etiketi olmayan misafirde etiket satırı yoktur ve liste okunmaz', async () => {
    const t = transport([])
    await renderWithProviders(<GuestSummaryCard guestId="g-1" />, { transport: t })
    expect(await screen.findByTestId('guest-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('guest-summary-tags')).toBeNull()
    expect(t.calls.some((c) => c.name === 'lists.list')).toBe(false)
  })
})
