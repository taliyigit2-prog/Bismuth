// Handlers of procedures/guests.ts (Faz 6): contract procedure → service call. Permissions are checked in the
// services (G-23); the guest card's history and the reservation panel's summary read the same
// `guests.guestHistory` (§6.12), so both show the same numbers.
import type { guestsProcedures } from '@shared/contract/procedures/guests'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const guestsHandlers = (services: Services): HandlersFor<keyof typeof guestsProcedures> => ({
  'guests.list': (ctx, input) => services.guests.list(ctx, input),
  'guests.card': (ctx, { id }) => services.guests.card(ctx, id),
  'guests.history': (ctx, { guestId }) => services.guests.guestHistory(ctx, guestId),
  'guests.create': (ctx, input) => services.guests.create(ctx, input),
  'guests.update': (ctx, { id, patch }) => services.guests.update(ctx, id, patch),
  'guests.setStandingNote': (ctx, { id, note }) => services.guests.setStandingNote(ctx, id, note),
  'guests.duplicates': (ctx, input) => services.guests.findDuplicates(ctx, input),
  'guests.merge': (ctx, { keepId, mergeId }) => services.guests.merge(ctx, keepId, mergeId),
  'guests.setTags': (ctx, input) => services.guests.setTags(ctx, input),

  'companies.list': (ctx, input) => services.companies.listView(ctx, input),
  'companies.get': (ctx, { id }) => services.companies.detail(ctx, id),
  'companies.create': (ctx, input) => services.companies.create(ctx, input),
  'companies.update': (ctx, { id, patch }) => services.companies.update(ctx, id, patch),
  'companies.markUsed': (ctx, { id }) => services.companies.markUsed(ctx, id),

  'blacklist.list': (ctx, input) => services.blacklist.listView(ctx, input),
  'blacklist.add': (ctx, input) => services.blacklist.add(ctx, input),
  'blacklist.remove': (ctx, { id, reason }) => services.blacklist.remove(ctx, id, reason),
  'blacklist.check': (ctx, input) => services.blacklist.warn(ctx, input)
})
