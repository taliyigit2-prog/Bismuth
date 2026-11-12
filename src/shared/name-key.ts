/**
 * Key two names are compared by to tell whether they are "the same name": case-insensitive with Turkish rules
 * (İ/i and I/ı are folded together, so "SAHIP" = "sahip" and "TEK KİŞİLİK" = "Tek kişilik"), NFC, single spaces.
 * Only used to refuse a duplicate; the name itself is stored as typed.
 */
export const nameKey = (value: string): string =>
  value.trim().normalize('NFC').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/\s+/g, ' ')
