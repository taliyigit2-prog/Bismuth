// "Misafir kartını aç" from another screen (the reservation panel's history card, faz-05 madde 7b): the guest to open
// is left here and the Misafirler screen opens its card when it mounts (no address change, no route parameter).
let requested: string | null = null

/** Asks the Misafirler screen to open this guest's card. */
export function requestGuestCard(guestId: string): void {
  requested = guestId
}

/** The guest card asked for (read when the screen mounts). */
export const guestCardRequest = (): string | null => requested

/** Forgets the request once the screen has opened it (coming back later shows the list). */
export function clearGuestCardRequest(): void {
  requested = null
}
