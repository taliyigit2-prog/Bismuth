// A small finished setup for e2e tests and screenshots (plain JS: scripts/ui-shot.mjs imports it too). Invented
// names only. `draftFrom(options)` turns `setup.options` into a `setup.finish` draft: two seeded room types, six
// rooms on two floors, the first payment methods and channels, the seeded shifts, one receptionist with an account
// (must change the password at first sign-in) and the owner with a password and a PIN.

export const OWNER = {
  username: 'sahip',
  displayName: 'Otel Sahibi',
  password: 'cok-gizli-sifre',
  pin: '2468'
}

export const RECEPTION = {
  username: 'deniz',
  displayName: 'Deniz Arslan',
  password: 'gecici-sifre-1'
}

/** @param {any} options `setup.options` output */
export function draftFrom(options) {
  const occupancy = options.roomTypes.filter((t) => t.group === 'occupancy')
  const [double, twin] = occupancy
  const reception = options.roles.find((r) => r.code === 'reception')
  const rooms = [1, 2].flatMap((floor) =>
    [1, 2, 3].map((n) => ({
      number: `${floor}0${n}`,
      floor: String(floor),
      beds: 2,
      sellable: true,
      roomType: { id: (n % 2 ? double : twin).id }
    }))
  )
  return {
    language: 'tr',
    theme: 'light',
    hotel: {
      name: 'Örnek Otel',
      country: 'TR',
      city: 'İstanbul',
      timezone: 'Europe/Istanbul',
      checkinTime: '14:00',
      checkoutTime: '12:00'
    },
    money: { baseCurrency: 'TRY', currencies: ['TRY', 'EUR', 'USD'] },
    roomTypes: {
      selected: [
        { id: double.id, basePriceMinor: 280_000, weekendPriceMinor: 320_000 },
        { id: twin.id, basePriceMinor: 270_000 }
      ],
      custom: []
    },
    rooms,
    lists: {
      paymentMethods: options.paymentMethods.slice(0, 3).map((m) => m.id),
      salesChannels: options.salesChannels.slice(0, 2).map((c) => c.id),
      extraServices: [],
      customPaymentMethods: [],
      customSalesChannels: [],
      customExtraServices: []
    },
    staff: { policy: { leaveDaysPerMonth: 4 }, advanceFromDrawer: true },
    shifts: options.shifts.map((s) => ({
      id: s.id,
      name: s.name ?? 'Vardiya',
      startTime: s.startTime,
      endTime: s.endTime
    })),
    tasks: { suggestions: [], legalReminders: true },
    employees: [
      {
        firstName: 'Deniz',
        lastName: 'Arslan',
        position: 'Resepsiyon',
        startDate: '2026-10-01',
        account: { username: RECEPTION.username, password: RECEPTION.password, roleId: reception.id }
      }
    ],
    calendar: { highlightWeekdays: [6, 0], dayClosing: false },
    owner: { ...OWNER }
  }
}
