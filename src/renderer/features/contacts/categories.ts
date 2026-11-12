// Phone-book categories (G-160): the seeded ones (labels are contacts.category.* keys) and the hotel's own labels
// ("Sucu", "Klima servisi"), which a contact carries as `customCategory`. A filter value is the seeded code or
// "custom:<label>".
import type { ComponentType } from 'react'
import type { TFunction } from 'i18next'
import {
  CarTaxiFrontIcon,
  DropletsIcon,
  ShirtIcon,
  SirenIcon,
  TagIcon,
  TruckIcon,
  UserRoundIcon,
  ZapIcon
} from 'lucide-react'
import { CONTACT_CATEGORY_CODES, type ContactCategory } from '@shared/contract/supply'
import type { ContactView } from '@shared/contract/procedures/contacts'
import { normalizeName } from '@shared/domain/normalize'

export type SeededCategory = (typeof CONTACT_CATEGORY_CODES)[number]
export const CATEGORIES: readonly SeededCategory[] = CONTACT_CATEGORY_CODES

export const CATEGORY_ICONS: Record<ContactCategory, ComponentType<{ className?: string }>> = {
  supplier: TruckIcon,
  laundry: ShirtIcon,
  plumber: DropletsIcon,
  electrician: ZapIcon,
  taxi: CarTaxiFrontIcon,
  emergency: SirenIcon,
  other: UserRoundIcon,
  custom: TagIcon
}

/** What the contact's category reads as: the translated seeded name or the hotel's own label. */
export const categoryLabel = (t: TFunction, c: Pick<ContactView, 'category' | 'customCategory'>): string =>
  c.category === 'custom' ? (c.customCategory ?? '') : t(`contacts.category.${c.category}`)

/** Filter value of a contact's category. */
export const filterKeyOf = (c: Pick<ContactView, 'category' | 'customCategory'>): string =>
  c.category === 'custom' ? `custom:${c.customCategory ?? ''}` : c.category

/**
 * Search over the name, the category (in the screen's language), the note and the numbers (digits, without the
 * trunk 0): "sucu" finds "Sucu Mehmet" and anyone filed under the hotel's own "Sucu" category.
 */
export function matchesContact(t: TFunction, c: ContactView, query: string): boolean {
  const needle = normalizeName(query)
  if (!needle) return true
  const texts = [c.name, categoryLabel(t, c), c.note ?? '', c.address ?? '', ...c.phones.map((p) => p.label)]
  if (texts.some((s) => normalizeName(s).includes(needle))) return true
  const digits = query.replace(/\D/g, '').replace(/^0+/, '')
  return digits.length >= 3 && c.phones.some((p) => p.number.replace(/\D/g, '').includes(digits))
}

/** "tel:+905320000000" for a stored number (spaces and dashes dropped). */
export const telOf = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`
