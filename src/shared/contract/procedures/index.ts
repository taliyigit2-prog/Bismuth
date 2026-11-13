// One file per module, so modules built in parallel never edit the same lines of the contract.
import { reservationsProcedures } from './reservations'
import { guestsProcedures } from './guests'
import { ledgerProcedures } from './ledger'
import { staffProcedures } from './staff'
import { housekeepingProcedures } from './housekeeping'
import { operationsProcedures } from './operations'
import { todayProcedures } from './today'
import { reportsProcedures } from './reports'
import { tourismProcedures } from './tourism'
import { externalProcedures } from './external'
import { contactsProcedures } from './contacts'
import { supplyProcedures } from './supply'
import { backupProcedures } from './backup'
import { remoteProcedures } from './remote'
import { bookingProcedures } from './booking'
import { systemProcedures } from './system'
import { roomsProcedures } from './rooms'
import { usersProcedures } from './users'
import { cameraProcedures } from './camera'

export const MODULE_PROCEDURES = {
  ...reservationsProcedures,
  ...guestsProcedures,
  ...ledgerProcedures,
  ...staffProcedures,
  ...housekeepingProcedures,
  ...operationsProcedures,
  ...todayProcedures,
  ...reportsProcedures,
  ...tourismProcedures,
  ...externalProcedures,
  ...contactsProcedures,
  ...supplyProcedures,
  ...backupProcedures,
  ...remoteProcedures,
  ...bookingProcedures,
  ...systemProcedures,
  ...roomsProcedures,
  ...usersProcedures,
  ...cameraProcedures
} as const
