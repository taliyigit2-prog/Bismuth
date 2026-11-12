// Longest texts the booking forms take (QA3c1 #10), read from the contract's schemas so a field stops at the limit
// the service checks and a long paste never reaches the server as a refusal the field does not show.
import { fieldLimits } from '@shared/contract/limits'
import { bookingNoteTextSchema, reservationUpdateSchema } from '@shared/contract/booking'
import { occupantInputSchema } from '@shared/contract/reservations'
import { blacklistInputSchema, blacklistRemoveReasonSchema, guestInputSchema } from '@shared/contract/guests'

export const CHANNEL_REF_MAX = fieldLimits(reservationUpdateSchema.shape.channelRef).maxLength
export const RESERVATION_NOTE_MAX = fieldLimits(reservationUpdateSchema.shape.notes).maxLength
export const NOTE_LOG_MAX = fieldLimits(bookingNoteTextSchema).maxLength
export const OCCUPANT_NAME_MAX = fieldLimits(occupantInputSchema.shape.fullName).maxLength
export const OCCUPANT_NOTE_MAX = fieldLimits(occupantInputSchema.shape.descriptorNote).maxLength
export const GUEST_NAME_MAX = fieldLimits(guestInputSchema.shape.firstName).maxLength
export const BLACKLIST_NAME_MAX = fieldLimits(blacklistInputSchema.shape.name).maxLength
export const BLACKLIST_REASON_MAX = fieldLimits(blacklistInputSchema.shape.reasonText).maxLength
export const BLACKLIST_REMOVE_MAX = fieldLimits(blacklistRemoveReasonSchema).maxLength
