// Handlers of procedures/supply.ts (Faz 12): contract procedure → service call.
import type { supplyProcedures } from '@shared/contract/procedures/supply'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'
import { photoHandlers } from './photos'

export const supplyHandlers = (services: Services): HandlersFor<keyof typeof supplyProcedures> => {
  const photos = photoHandlers(services)
  return {
    'supply.categories': (ctx, input) => services.supply.listCategories(ctx, input),
    'supply.createCategory': (ctx, { name }) => services.supply.createCategory(ctx, name),
    'supply.overview': (ctx, input) => services.supply.overview(ctx, input),
    'supply.products': (ctx, input) => services.supply.listProducts(ctx, input),
    'supply.createProduct': (ctx, input) => services.supply.createProduct(ctx, input),
    'supply.updateProduct': (ctx, { id, patch }) => services.supply.updateProduct(ctx, id, patch),
    'supply.priceHistory': (ctx, { productId, since }) =>
      services.supply.productHistory(ctx, productId, since),
    'supply.monthSummary': (ctx, { year, month }) => services.supply.monthSummary(ctx, year, month),
    'supply.purchases': (ctx, input) => services.supply.purchases(ctx, input),
    'supply.recordPurchase': (ctx, input) => services.supply.recordPurchase(ctx, input),
    'supply.voidPurchase': (ctx, { id, reason }) => services.supply.voidPurchase(ctx, id, reason),
    'supply.sections': (ctx) => services.expenses.listSections(ctx),
    'supply.addPhoto': (ctx, { entity, ...input }) => photos.add(ctx, entity, input),
    'supply.photos': (ctx, { entity, id }) => photos.list(ctx, entity, id),
    'supply.readPhoto': (ctx, { id }) => photos.read(ctx, ['expense', 'laundry_delivery'], id),

    'laundry.prices': (ctx, { contactId }) => services.laundry.listPrices(ctx, contactId),
    'laundry.setPrice': (ctx, input) => services.laundry.setPrice(ctx, input),
    'laundry.deliveries': (ctx, input) => services.laundry.listDeliveries(ctx, input),
    'laundry.recordDelivery': (ctx, input) => services.laundry.recordDelivery(ctx, input),
    'laundry.voidDelivery': (ctx, { id, reason }) => {
      services.laundry.voidDelivery(ctx, id, reason)
      return { ok: true } as const
    },
    'laundry.outstanding': (ctx, { contactId, until }) => services.laundry.outstanding(ctx, contactId, until),
    'laundry.month': (ctx, { contactId, year, month }) => services.laundry.month(ctx, contactId, year, month),
    'laundry.settle': (ctx, input) => services.laundry.settle(ctx, input),
    'laundry.reopenMonth': (ctx, input) => services.laundry.reopenMonth(ctx, input),
    'laundry.trend': (ctx, { contactId, until, months }) =>
      services.laundry.trend(ctx, contactId, until, months)
  }
}
