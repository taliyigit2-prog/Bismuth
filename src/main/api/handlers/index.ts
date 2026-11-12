// Handlers of the module procedures (one file per module, see @shared/contract/procedures).
import type { Services } from '../../services'
import { reservationsHandlers } from './reservations'
import { guestsHandlers } from './guests'
import { ledgerHandlers } from './ledger'
import { staffHandlers } from './staff'
import { housekeepingHandlers } from './housekeeping'
import { operationsHandlers } from './operations'
import { todayHandlers } from './today'
import { reportsHandlers } from './reports'
import { tourismHandlers } from './tourism'
import { externalHandlers } from './external'
import { contactsHandlers } from './contacts'
import { supplyHandlers } from './supply'
import { backupHandlers } from './backup'
import { remoteHandlers } from './remote'
import { bookingHandlers } from './booking'
import { systemHandlers } from './system'
import { roomsHandlers } from './rooms'
import { usersHandlers } from './users'

export const moduleHandlers = (services: Services) => ({
  ...reservationsHandlers(services),
  ...guestsHandlers(services),
  ...ledgerHandlers(services),
  ...staffHandlers(services),
  ...housekeepingHandlers(services),
  ...operationsHandlers(services),
  ...todayHandlers(services),
  ...reportsHandlers(services),
  ...tourismHandlers(services),
  ...externalHandlers(services),
  ...contactsHandlers(services),
  ...supplyHandlers(services),
  ...backupHandlers(services),
  ...remoteHandlers(services),
  ...bookingHandlers(services),
  ...systemHandlers(services),
  ...roomsHandlers(services),
  ...usersHandlers(services)
})
