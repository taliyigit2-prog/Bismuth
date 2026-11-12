// Handlers of procedures/contacts.ts (Faz 12): contract procedure → service call.
import type { contactsProcedures } from '@shared/contract/procedures/contacts'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'
import { photoHandlers } from './photos'

const ok = { ok: true } as const

export const contactsHandlers = (services: Services): HandlersFor<keyof typeof contactsProcedures> => {
  const photos = photoHandlers(services)
  return {
    'contacts.list': (ctx, input) => services.contacts.list(ctx, input),
    'contacts.favorites': (ctx) => services.contacts.favorites(ctx),
    'contacts.create': (ctx, input) => services.contacts.create(ctx, input),
    'contacts.update': (ctx, { id, patch }) => services.contacts.update(ctx, id, patch),
    'contacts.setActive': (ctx, { id, active }) =>
      active ? services.contacts.reactivate(ctx, id) : services.contacts.deactivate(ctx, id),
    'contacts.import': (ctx, { contacts }) => services.contacts.importMany(ctx, contacts),

    'lostItems.list': (ctx, input) => services.lostItems.listView(ctx, input),
    'lostItems.create': (ctx, input) => ({ id: services.lostItems.create(ctx, input).id }),
    'lostItems.update': (ctx, { id, patch }) => {
      services.lostItems.update(ctx, id, patch)
      return ok
    },
    'lostItems.markReturned': (ctx, { id, input }) => {
      services.lostItems.markReturned(ctx, id, input)
      return ok
    },
    'lostItems.markDisposed': (ctx, { id, reason }) => {
      services.lostItems.markDisposed(ctx, id, reason)
      return ok
    },
    'lostItems.restore': (ctx, { id, reason }) => {
      services.lostItems.restore(ctx, id, reason)
      return ok
    },
    'lostItems.addPhoto': (ctx, input) => photos.add(ctx, 'lost_item', input),
    'lostItems.photos': (ctx, { id }) => photos.list(ctx, 'lost_item', id),
    'lostItems.readPhoto': (ctx, { id }) => photos.read(ctx, ['lost_item'], id)
  }
}
