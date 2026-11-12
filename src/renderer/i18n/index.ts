// i18next setup (K-17): tr.json is the source, en/ru carry the same keys; missing ru → en → tr.
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { AppLocale } from '@shared/format'
import tr from './tr.json'
import en from './en.json'
import ru from './ru.json'

export const resources = {
  tr: { translation: tr },
  en: { translation: en },
  ru: { translation: ru }
} as const

export async function initI18n(language: AppLocale): Promise<typeof i18next> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: { ru: ['en', 'tr'], en: ['tr'], default: ['tr'] },
    interpolation: { escapeValue: false },
    returnNull: false
  })
  document.documentElement.lang = language
  return i18next
}

export async function changeLanguage(language: AppLocale): Promise<void> {
  await i18next.changeLanguage(language)
  document.documentElement.lang = language
}
