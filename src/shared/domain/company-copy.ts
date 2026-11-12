// Company billing details for the clipboard (G-191): Bismuth never issues the invoice (G-06); the owner pastes
// these lines into a separate invoice program. The label words come from the UI language files (i18n
// `companies.copy.*`, yasak 8): the main process returns the fields, the screen adds the labels.
import type { CopyFormat } from '../contract/guests'

export const COPY_FIELD_KEYS = ['title', 'address', 'tax', 'phone', 'email', 'iban', 'contact'] as const
export type CopyFieldKey = (typeof COPY_FIELD_KEYS)[number]

export interface CopyField {
  key: CopyFieldKey
  value: string
}

interface CompanyLike {
  title: string
  address: string | null
  city: string | null
  taxOffice: string | null
  taxNumber: string | null
  phone: string | null
  email: string | null
  iban: string | null
  contactPerson: string | null
}

/** "TR120006…" → "TR12 0006 …" (groups of four, as printed on bank documents). */
export const formatIban = (iban: string): string => iban.replace(/(.{4})/g, '$1 ').trim()

/** The filled fields in print order; empty ones are left out. */
export function companyCopyFields(company: CompanyLike): CopyField[] {
  const address = [company.address, company.city].filter(Boolean).join(', ')
  const tax = [company.taxOffice, company.taxNumber].filter(Boolean).join(' / ')
  const fields: [CopyFieldKey, string | null][] = [
    ['title', company.title],
    ['address', address || null],
    ['tax', tax || null],
    ['phone', company.phone],
    ['email', company.email],
    ['iban', company.iban ? formatIban(company.iban) : null],
    ['contact', company.contactPerson]
  ]
  return fields.filter((f): f is [CopyFieldKey, string] => !!f[1]).map(([key, value]) => ({ key, value }))
}

/** "Label: value" per field: one per line (multi) or joined on one line (single). */
export function formatCopyText(
  fields: readonly CopyField[],
  labels: Readonly<Record<CopyFieldKey, string>>,
  format: CopyFormat = 'multi'
): string {
  return fields.map((f) => `${labels[f.key]}: ${f.value}`).join(format === 'single' ? ' · ' : '\n')
}
