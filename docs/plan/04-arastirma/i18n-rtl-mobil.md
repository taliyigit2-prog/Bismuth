# Bismuth — i18n (tr/en/ru/ar), RTL and phone/tablet web UI research

Date: 2026-10-01. Scope: inputs for the planning docs (G-08 four languages + RTL, G-130 RTL, G-132 desktop+mobile tests,
G-142/G-143 private-network phone UI). Stack assumed from `docs/plan/03-mimari.md` and `04-arastirma/masaustu-yigin.md`:
Electron 44 + electron-vite 5 + React 19 + Tailwind v4 + shadcn/ui (Radix) + i18next; Hono in the main process for "host mode".

Method notes: npm versions were read from `registry.npmjs.org/<pkg>/latest` today. The egress proxy blocked
ui.shadcn.com, tailwindcss.com, i18next.com, electronjs.org, electron.build, tailscale.com, playwright.dev, MDN, fonts.google.com,
unpkg/jsdelivr; those facts were taken from the projects' GitHub source/docs repos (raw.githubusercontent.com) or from search
snippets and are marked **(doc, verify)** where only a snippet was available.

---

## 0. Package shortlist (verified on npm 2026-10-01)

| Package | Version | License | Role | Note |
|---|---|---|---|---|
| `i18next` | 26.4.2 | MIT | core | v24+ requires `Intl.PluralRules` (fine in Chromium/Node). v26 removed legacy `interpolation.format` fn and `simplifyPluralSuffix`; TS 5 peer |
| `react-i18next` | 17.0.15 | MIT | React bindings | peers: react ≥16.8, i18next ≥26.2, TS ^5/6/7 |
| `i18next-resources-to-backend` | 1.2.3 | MIT | lazy-load bundled JSON via `import()` | offline, no HTTP backend |
| `i18next-cli` | 1.74.4 | MIT | extract / status / sync / lint / types | **replaces `i18next-parser` (9.4.0, deprecated Sept 2025)** |
| `eslint-plugin-i18next` | 6.1.5 | ISC | `no-literal-string` rule | enforces G-08 in code review + hook |
| `i18next-icu` | 2.4.4 | MIT | ICU MessageFormat | **not recommended** (see A1.2) |
| `@radix-ui/react-direction` | 1.1.4 | MIT | `DirectionProvider` | shadcn `direction` component wraps it |
| `tailwindcss` | 4.3.3 | MIT | logical utilities + `rtl:` variant | |
| `lucide-react` | 1.49.0 | ISC | icons | mirror rule in A2.4 |
| `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 | Latin/Turkish/Cyrillic UI font | subsets: latin, latin-ext, cyrillic, cyrillic-ext, greek, vietnamese (no Arabic) |
| `@fontsource-variable/noto-sans-arabic` | 5.3.0 | OFL-1.1 | Arabic UI font | subsets: arabic, latin, latin-ext; axes wght 100–900, wdth 62.5–100 |
| `@fontsource/ibm-plex-sans-arabic` | 5.3.0 | OFL-1.1 | alternative Arabic font (static weights; no variable pkg) | subsets: arabic, latin, latin-ext, cyrillic-ext |
| `@fontsource-variable/vazirmatn` | 5.3.0 | OFL-1.1 | alternative (Persian-leaning) | arabic, latin, latin-ext; wght 100–900 |
| `@fontsource-variable/cairo` | 5.3.0 | OFL-1.1 | alternative (display-ish) | arabic, latin, latin-ext; wght 200–1000, slnt |
| `@fontsource-variable/noto-sans` | 5.3.0 | OFL-1.1 | alt Latin/Cyrillic partner for Noto Sans Arabic | no Arabic subset |
| `react-day-picker` | 10.0.2 | MIT | shadcn Calendar | `dir="rtl"` + `locale` props |
| `date-fns` | 4.4.0 | MIT (doc, verify) | locales `tr`, `ru`, `ar`, `arEG`, `arSA`, `enGB` | only for day-picker; app dates stay `YYYY-MM-DD` strings |
| `vaul` | 1.1.2 | MIT | Drawer (shadcn radix) | **repo marked "unmaintained"** (README notice) – see B1.3 |
| `@base-ui/react` | 1.8.0 | MIT | Base UI (has its own Drawer) | only if the project ever moves off Radix |
| `vaul-base` | 1.0.0 | MIT | vaul fork on Base UI | needs `@base-ui/react` |
| `vite-plugin-pwa` | 1.3.0 | MIT | manifest + Workbox SW | peers vite ^3–^8, workbox-build/window ^7.4.1 |
| `workbox-window` | 7.4.1 | MIT | SW registration helper | pulled in by the plugin |
| `hono` / `@hono/node-server` | 4.13.12 / 2.1.3 | MIT | host-mode HTTP(S) server | node-server needs Node ≥20 |
| `@playwright/test` | 1.63.0 | Apache-2.0 | Electron + browser + device emulation | Node ≥20 |
| `electron-builder` | 26.15.3 | MIT | NSIS multi-language installer | `messages.yml` already has `ar`, `ru`, `tr_TR` |
| `electron` | 44.5.1 | MIT | | |

---

## PART A — Four languages incl. Arabic RTL

### A1. i18next + react-i18next for tr / en / ru / ar

#### A1.1 File layout: namespaces per feature, `tr` is the source of truth

```
src/renderer/i18n/
  index.ts                 # init, language switch, <html lang/dir> sync, Intl helpers
  locales/
    tr/common.json         # buttons, generic labels, errors, empty/loading states
    tr/nav.json            # sidebar, bottom nav, menu (also used by main-process menu via shared copy)
    tr/today.json
    tr/reservations.json
    tr/calendar.json
    tr/guests.json
    tr/cashbox.json        # kasa
    tr/reports.json
    tr/settings.json
    tr/validation.json     # zod messages (shared with main through src/shared? see note)
    en/…  ru/…  ar/…       # same file set, generated + reviewed
```

- CLAUDE.md today names a single `src/renderer/i18n/tr.json`. Either keep one file per language with top-level namespace
  objects (`{ "common": {…}, "today": {…} }` — i18next can load that as one resource with `ns` keys) or split per
  namespace as above. Splitting is better for `i18next-cli extract --namespace`, for lazy loading per route, and for PR
  review diffs. **Decision needed (K-xx): single `tr.json` vs `tr/<ns>.json`; CLAUDE.md rule 8 would be updated accordingly.**
- Keys: nested, feature-first, `camelCase`, no sentence keys (`"checkIn.title"` not `"Giriş yap"`), so Turkish is not
  embedded in identifiers and the key survives copy edits.
- `defaultNS: 'common'`, `fallbackNS: 'common'`, `ns` loaded per route via `useTranslation('reservations')`.
- Lazy loading, fully offline: Vite bundles every JSON; load on demand with `import.meta.glob` + `i18next-resources-to-backend`:

```ts
// src/renderer/i18n/index.ts
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

const modules = import.meta.glob('./locales/*/*.json'); // { './locales/tr/common.json': () => import(...) }

export const SUPPORTED = ['tr', 'en', 'ru', 'ar'] as const;
export const RTL_LANGS = new Set(['ar']);

await i18next
  .use(resourcesToBackend((lng: string, ns: string) => modules[`./locales/${lng}/${ns}.json`]()))
  .use(initReactI18next)
  .init({
    lng: initialLanguage,                     // from settings (desktop) or host /api/config (phone)
    supportedLngs: [...SUPPORTED],
    fallbackLng: { ar: ['en', 'tr'], ru: ['en', 'tr'], en: ['tr'], default: ['tr'] },
    ns: ['common', 'nav'], defaultNS: 'common', fallbackNS: 'common',
    load: 'languageOnly',                     // 'tr' not 'tr-TR'
    interpolation: { escapeValue: false },    // React escapes
    returnNull: false,
    debug: import.meta.env.DEV,
    saveMissing: import.meta.env.DEV,         // logs to console only (no telemetry)
  });

i18next.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL_LANGS.has(lng) ? 'rtl' : 'ltr';
});
```

- Each lazy chunk is a few KB; preload `common`+`nav` for the current language and prefetch the rest on idle.
- The phone build is the same bundle served by Hono; language comes from the host's settings (`GET /api/config`) and
  can be overridden per device (localStorage) — do **not** add `i18next-browser-languagedetector`; the owner picks the language.

#### A1.2 Plurals: Russian (one/few/many/other) and Arabic (zero/one/two/few/many/other)

i18next ≥21 uses CLDR category suffixes resolved with `Intl.PluralRules(lng).select(count)` (JSON v4). From CLDR `plurals.xml`
(unicode-org/cldr, verified):

| Lang | Categories (cardinal) | Rule / examples |
|---|---|---|
| tr | one, other | one: n = 1 |
| en | one, other | one: i = 1 and v = 0 |
| ru | one, few, many, other | one: i%10=1 and i%100≠11 (1, 21, 31, 101); few: i%10=2..4 and i%100≠12..14 (2–4, 22–24); many: i%10=0 or 5..9 or i%100=11..14 (0, 5–20, 100); other: decimals |
| ar | zero, one, two, few, many, other | zero: 0; one: 1; two: 2; few: n%100=3..10 (3–10, 103–110); many: n%100=11..99 (11–99, 111); other: 100–102, 200–202, 1000… |

Example "N gece":

```jsonc
// tr/reservations.json
{ "nights_one": "{{count}} gece", "nights_other": "{{count}} gece" }
// en
{ "nights_one": "{{count}} night", "nights_other": "{{count}} nights" }
// ru
{ "nights_one": "{{count}} ночь", "nights_few": "{{count}} ночи", "nights_many": "{{count}} ночей", "nights_other": "{{count}} ночи" }
// ar  (all six are required; _zero also overrides "0" in every language if present)
{ "nights_zero": "لا ليالي", "nights_one": "ليلة واحدة", "nights_two": "ليلتان", "nights_few": "{{count}} ليالٍ", "nights_many": "{{count}} ليلة", "nights_other": "{{count}} ليلة" }
```

- Usage: `t('nights', { count })`. Ordinals: `t('floor', { count, ordinal: true })` → `_ordinal_one` etc.
- `i18next-cli extract` generates the right suffix set per language from CLDR (en/tr `_one/_other`, ru 4 forms, ar 6).
- **ICU (`i18next-icu`) not recommended**: the suffix format covers plural/context/interpolation needs, is what `i18next-cli`
  and `types` understand, is simpler for an AI translation step (one string per key), and avoids shipping
  `intl-messageformat` + its parser. Use ICU only if translators demand inline `{count, plural, …}`.
- Context variants: `t('guest', { context: 'female' })` → `guest_female` (Russian needs gender for some strings).
- Pseudo-localization for layout testing (Russian ≈ +15–30 %, Arabic ≈ +20–25 % wider than Turkish): a 10-line
  i18next post-processor that pads strings with `~` and flips to RTL under a dev flag; no package needed.

#### A1.3 Interpolation and `Intl` formatting

- Text interpolation stays in JSON (`{{guestName}}`); i18next built-in formatters (`{{val, number}}`, `{{val, datetime}}`,
  `{{val, relativetime}}`, `{{val, list}}`) use `Intl` under the hood and get the current language automatically.
- **Money never goes through `{{val, currency}}`** — that formatter takes a float. Per G-131, `shared/money.ts` is the only
  place that divides `amount_minor`; expose `formatMoney(amountMinor, currency, locale, opts)` and pass the finished string
  into `t()` (`t('paid', { amount: formatMoney(…) })`).

```ts
// shared/money.ts (the only float/divide site)
export function formatMoney(amountMinor: number, currency: string, locale: string, opts?: { display?: 'narrowSymbol'|'code' }) {
  const digits = minorUnitDigits(currency); // 2 for TRY/USD/EUR/RUB/SAR/EGP, 0 for JPY…
  return new Intl.NumberFormat(moneyLocale(locale), {
    style: 'currency', currency, currencyDisplay: opts?.display ?? 'narrowSymbol',
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}
// moneyLocale('ar') === 'ar-EG-u-nu-latn-ca-gregory'
```

- Locale tags to use (app language → BCP-47 for `Intl`):

| UI lang | Intl locale | Why |
|---|---|---|
| tr | `tr-TR` | `1.234,50 ₺` (symbol after, `narrowSymbol` → ₺) |
| en | `en-GB` | day-first dates `01/10/2026`, 24 h clock; owner audience is Europe/Turkey not US |
| ru | `ru-RU` | `1 234,50 ₽` (NBSP thousands) |
| ar | `ar-EG-u-nu-latn-ca-gregory` (or `ar-SA-u-nu-latn-ca-gregory`) | **Traps:** plain `ar-SA` defaults to the **Umm al-Qura Hijri calendar** (`islamic-umalqura`) and both `ar-EG`/`ar-SA` default to Eastern Arabic digits `٠١٢٣`. The `-u-nu-latn` / `numberingSystem: 'latn'` and `-u-ca-gregory` / `calendar: 'gregory'` extensions fix both (`numberingSystem` option takes precedence over the tag). |

- **Digits in the Arabic UI: default to Latin (`latn`) digits for money, room numbers, dates and phone numbers**, with a
  hotel setting `arabicDigits: 'latn' | 'arab'` (G-09). Reasons: Latin digits are understood everywhere in the Arab world
  and increasingly preferred in Saudi/Egyptian digital products (search snippets, no hard data); financial tables stay
  aligned because the digits are then drawn by the Latin font (Inter has `tnum`); copy/paste into other software works.
  When `arab` is chosen only the display changes (`Intl` does the mapping); input parsing must accept both digit sets.
- Mixed-direction safety: wrap amounts, phone numbers, codes and guest names in `<bdi>` (or `unicode-bidi: isolate`), and
  put `dir="auto"` on free-text fields (notes, names) so Latin names inside Arabic text and vice versa do not reorder.
- Dates: the domain stores `YYYY-MM-DD`; format for display with `new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })`
  applied to a `new Date(y, m-1, d)` local date (no TZ math). Weekday/month names for the calendar from
  `Intl.DateTimeFormat(locale, { weekday: 'short' })`. First day of week: Monday for tr/ru/en-GB; Arabic regions vary
  (Sat/Sun) → make it a hotel setting (default Monday); `new Intl.Locale(locale).getWeekInfo()` can seed it in Chromium (doc, verify).
- Sorting: one collator per language `new Intl.Collator(lng, { sensitivity: 'base', numeric: true })` (tr handles ı/i/İ,
  ru Cyrillic, ar Arabic) kept in a `useCollator()` hook; `toLocaleUpperCase(lng)` for headings (Turkish dotted İ) —
  CSS `text-transform: uppercase` also respects `<html lang="tr">` in Chromium.
- Relative time (`"3 gün önce"`): `Intl.RelativeTimeFormat`; lists: `Intl.ListFormat`; percentages: `style: 'percent'`.

#### A1.4 Fallback chain

`fallbackLng: { ar: ['en','tr'], ru: ['en','tr'], en: ['tr'], default: ['tr'] }` (object form is documented: per-language
arrays + `default`). Arabic and Russian readers are more likely to understand an untranslated English string than a
Turkish one, and the Turkish source always exists so nothing ever renders as a bare key. Also set `fallbackNS: 'common'`.
Turn on `i18next-cli status` in CI so missing keys are visible rather than silently falling back.

#### A1.5 Translation workflow for an AI-driven project

1. Code is written with `t('ns:key')` only; `eslint-plugin-i18next` `no-literal-string` (`mode: 'jsx-text-only'`,
   `ignoreAttribute: ['className','data-testid','href','type','variant','size']`) + the existing `i18n-literal-warn` hook.
2. `npx i18next-cli extract` keeps **`tr/*.json` (primaryLanguage: 'tr')** in sync with the code: adds keys with the
   `defaultValue` written in the `t()` call (Turkish), removes unused keys (`removeUnusedKeys: true`), sorts, and creates
   the plural suffix sets for every locale in `locales: ['tr','en','ru','ar']`.
3. `npx i18next-cli status` → list of untranslated keys per language (exits non-zero → CI gate).
4. AI pass: a repo skill `/translate-locales` reads the `tr` diff (keys missing or changed since the last commit), sends
   batches with a **glossary** (`docs/plan/sozluk.md`: rezervasyon=reservation/бронирование/حجز, konaklama, gece, kasa,
   cari, kapora, no-show, …), **context** (namespace + screen name + `{{placeholders}}` + max length), and writes
   `en|ru|ar/*.json`. Keep placeholders and ICU-free; never translate keys. Tooling options if a CLI is preferred:
   `i18n-ai-translate` (OSS, Claude/Ollama backends, diff-aware) (doc, verify); hosted services (locize, lingo.dev) are
   dev-time only but contradict the "no accounts" spirit — not needed.
5. Review: `i18next-cli lint` (interpolation mismatch, hardcoded strings) + `npm run typecheck` with
   `i18next-cli types` output (`CustomTypeOptions` → typed keys, autocompletion) + a native-speaker review checklist per
   release (see A4). Keep a `_meta.reviewed` marker per file or a `translation-status.md` table.
6. Length/overflow: pseudo-locale run + Playwright screenshots in ru and ar (B3).

#### A1.6 Typed keys

```ts
// src/renderer/i18n/i18next.d.ts (generated by `i18next-cli types`, or hand-written)
import type common from './locales/tr/common.json';
declare module 'i18next' {
  interface CustomTypeOptions { defaultNS: 'common'; resources: { common: typeof common; /* … */ }; }
}
```

### A2. RTL

#### A2.1 Tailwind v4 mechanics

- `rtl:` / `ltr:` variants compile to `&:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)` (verified in
  `packages/tailwindcss/src/variants.ts`), so a single `dir` on `<html>` reaches portaled content under `<body>`.
- Prefer **logical utilities** everywhere, keep `rtl:` only for things that must mirror (icons, gradients, shadows,
  `translate-x` on Switch/Progress): `ms-*/me-*`, `ps-*/pe-*`, `start-*/end-*`, `text-start/text-end`, `rounded-s-*/rounded-e-*`,
  `border-s/border-e`, `scroll-ps-*`, `inset-inline-*`, `float-start`. `space-x-*` needs `rtl:space-x-reverse` (or use `gap-*`).
- Enforce with a lint hook: in `src/renderer/**` flag `\b(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-` unless the
  file is in the LTR-locked tape-chart module or the class is prefixed `rtl:`/`ltr:`.
- Animations: `tw-animate-css` logical slide utilities (`slide-in-from-start`) need `dir` on the animated element itself;
  shadcn's RTL guide says to **pass `dir="rtl"` explicitly to portal contents** (PopoverContent, TooltipContent, Sheet,
  Dropdown/Select content) when direction is dynamic (doc, verify).

#### A2.2 Direction wiring (shadcn + Radix)

- shadcn January 2026 "RTL Support": `components.json` → `"rtl": true`; new projects `npx shadcn@latest init --rtl`; existing
  code `npx shadcn@latest migrate rtl [path]` rewrites `left-*→start-*`, `ml/pr→ms/pe`, `text-left→text-start`,
  `slide-in-from-left→…-start`, and adds `rtl:rotate-180` to known directional icons. **Calendar, Pagination and Sidebar
  are not migrated by the CLI and need manual review.**
- `npx shadcn@latest add direction` installs `components/ui/direction.tsx` (wraps `@radix-ui/react-direction`
  `DirectionProvider`) and a `useDirection()` hook. Wrap the app root, drive `dir` from `i18n.language`, and also set
  `document.documentElement.dir` (CSS reads the attribute, Radix reads the context: keyboard navigation order, which side
  menus/popovers open, Slider/Tabs/Toolbar/NavigationMenu arrow keys).

```tsx
<DirectionProvider dir={isRtl ? 'rtl' : 'ltr'}>
  <App />
</DirectionProvider>
```

- The project already copies shadcn components into `components/ui` (not a dependency); run the migration once on the
  copied set and commit, then every new `add` is generated in logical form because `rtl: true` is set.

#### A2.3 Components that need attention (known RTL issues)

| Component | Problem | Fix |
|---|---|---|
| Sheet / Drawer | `side="left"|"right"` is physical; the mobile nav/filters sheet must come from the **start** edge | `side={dir === 'rtl' ? 'right' : 'left'}` helper or logical `side="start"` once the copied Sheet supports it; animations need `dir` on content |
| Sidebar | `variant="inset"` margin applied on the wrong side in RTL (shadcn-ui/ui #7280); `side` prop physical; collapse chevrons; mobile Sheet edge | manual review per shadcn guide; set `side` from direction; `rtl:-scale-x-100` on the panel toggle icon |
| DropdownMenu / ContextMenu / Menubar | SubTrigger chevron and sub-menu opening side; `align="start"` is logical **only** when DirectionProvider is present | keep provider; `rtl:rotate-180`/`-scale-x-100` on chevrons; check `sideOffset` |
| Select / Combobox / Popover | check-mark/indicator absolute `left-2` positions, `pl-8` content padding | logical classes (migration handles) |
| Calendar (react-day-picker 10) | month grid, nav arrows, week start | `<Calendar dir="rtl" locale={ar} weekStartsOn={setting}>`; prev/next icons mirrored; RDP supports `dir` natively |
| Slider | direction of value increase | Radix Slider reads DirectionProvider; verify `inverted` not used |
| Switch | thumb `translate-x-4` is physical | `rtl:data-[state=checked]:-translate-x-4` or `translate-x-[calc(…)]` with logical var |
| Progress | Radix uses `translateX(-X%)` on the indicator | `rtl:` mirror or set `transform-origin`/`scale-x` |
| Breadcrumb / Pagination | separators and prev/next arrows | mirror icons; Pagination flagged for manual review |
| Table / DataTable | numeric columns must stay `text-end`, text columns `text-start`; sticky first column uses `left-0` | logical classes; `start-0` for sticky |
| Toast / Sonner | `position="top-right"` physical | pick position from direction |
| Carousel (embla) | `direction: 'rtl'` option exists | pass from `useDirection()` |
| InputOTP | slot order | should follow `dir` (digits LTR is also acceptable) |
| Charts (recharts) | axes/legends; time axis | keep charts LTR (`dir="ltr"` container), translate labels only |
| Tape chart (custom) | see A2.6 | locked LTR |
| Scrollbars / overflow | `overflow-x` scroll start position is the right edge in RTL; horizontal `scrollLeft` is negative in Chromium | use `scrollInlineStart`-style helpers; test virtualized lists |
| Native inputs | `<input type="number">`, phone, IBAN, dates must be `dir="ltr"` with `text-start`; placeholder alignment | add `dir="ltr"` on those inputs only |
| Base UI note | the Base UI variant of shadcn has an RTL dropdown scrollbar-flash bug (#9233) | not relevant while on Radix |

#### A2.4 Icons

- Mirror only directional-meaning icons: Chevron/Arrow Left/Right, ChevronsLeft/Right, `ArrowLeftFromLine`, `Undo/Redo`,
  `Reply/Forward`, `LogIn/LogOut`, `PanelLeft/Right`, `ListStart/End`, `IndentIncrease/Decrease`, `TextAlignLeft/Right` (use
  start/end semantics), `Send` (debatable), back buttons.
- Use `rtl:-scale-x-100` (mirrors asymmetric glyphs correctly); `rtl:rotate-180` is what the shadcn CLI inserts and is
  equivalent only for symmetric chevrons/arrows. Never mirror: Check, X, Plus/Minus, Search, Clock, Calendar, Phone,
  media play (convention), logos, numbers, question/info marks.
- Implement once: `<Icon icon={ChevronRight} mirror />` wrapper or a `MIRRORED` set checked in a `DirectionalIcon` component,
  so screens never hand-write the class.

#### A2.5 Fonts (OFL, bundled offline via `@fontsource*`)

Subset coverage verified from `google/fonts` `METADATA.pb`:

| Font | Latin/Turkish | Cyrillic | Arabic | Package |
|---|---|---|---|---|
| Inter (variable) | yes (+latin-ext) | yes (+ext) | no | `@fontsource-variable/inter` 5.3.0 |
| Noto Sans (variable) | yes | yes | no | `@fontsource-variable/noto-sans` 5.3.0 |
| Noto Sans Arabic (variable, wght+wdth) | basic Latin only | no | yes | `@fontsource-variable/noto-sans-arabic` 5.3.0 |
| IBM Plex Sans Arabic (static 100–700) | yes | cyrillic-ext only | yes | `@fontsource/ibm-plex-sans-arabic` 5.3.0 |
| Vazirmatn (variable) | yes | no | yes (Persian-leaning forms) | `@fontsource-variable/vazirmatn` 5.3.0 |
| Cairo (variable) | yes | no | yes (geometric, display) | `@fontsource-variable/cairo` 5.3.0 |

Recommendation: **Inter Variable (Latin/Turkish/Cyrillic) + Noto Sans Arabic Variable (Arabic)**.
- Both OFL-1.1, both in the plan already (Inter is in `masaustu-yigin.md`), both neutral UI faces, both have tabular
  figures; because the app uses Latin digits in Arabic by default, numbers in Arabic screens are drawn by Inter → identical
  column alignment in every language. Alternative with one design voice: IBM Plex Sans + IBM Plex Sans Arabic (static
  weights only; ~7 files per weight).
- CSS (Tailwind v4 theme tokens):

```css
@import '@fontsource-variable/inter';
@import '@fontsource-variable/noto-sans-arabic';
@theme { --font-sans: 'Inter Variable', 'Noto Sans Arabic Variable', system-ui, sans-serif; }
:root[lang='ar'] { --font-sans: 'Noto Sans Arabic Variable', 'Inter Variable', system-ui, sans-serif; --leading-ui: 1.75; }
html { font-feature-settings: 'tnum' 1; }  /* or only on money cells */
```

- Arabic typography rules: line-height 1.7–1.85 for body/labels (Latin 1.5), avoid `tracking-*` (letter-spacing breaks
  Arabic joins), avoid all-caps transforms, bump base size by 1 px for Arabic if 14 px looks small, no italics.
- Size budget: Inter variable woff2 latin+latin-ext+cyrillic ≈ 300 KB; Noto Sans Arabic variable arabic subset ≈ 150 KB
  (approximate, verify after install). `@fontsource` CSS already declares `unicode-range` per subset so only needed
  files load.

#### A2.6 Tape chart (rooms × dates) direction — recommendation: keep LTR

- Time axes are conventionally left→right even in RTL products (Gantt/timeline guidance: charts that encode time are not
  mirrored; Syncfusion/ApexGantt expose RTL mirroring as an opt-in, not default) (doc, verify). Hotel staff in Arab
  markets are used to LTR tape charts in Opera/Mews-style PMSs (no vendor doc found; treat as working assumption and
  confirm with an Arabic-speaking user).
- Implementation: the grid container gets `dir="ltr"` and physical classes (lint exception), the surrounding chrome
  (toolbar, filters, legend, room-name column header) follows the UI direction. Inside cells, guest names use `<bdi>` so
  Arabic names render correctly. Keyboard: ←/→ move in time, not in reading direction.
- Date pickers / month calendars **do** follow RTL (Arabic calendars read right-to-left; react-day-picker handles it).
- Optional later setting `tapeChart.direction: 'ltr' | 'rtl'` (G-09) if users ask; default `ltr`.

#### A2.7 Numbers/currency in the Arabic UI (summary)

Latin digits by default (setting for Eastern Arabic), Gregorian calendar forced, `narrowSymbol` or `code` for currency,
`<bdi>` isolation, inputs `dir="ltr"` for numeric/phone/IBAN, percent via `Intl`. Money strings only from `shared/money.ts`.

### A3. Electron specifics

- Locale APIs (after `ready`): `app.getLocale()` (Chromium UI locale, honours `--lang`), `app.getSystemLocale()` (OS
  formatting locale), `app.getPreferredSystemLanguages()` (ordered list), `app.getLocaleCountryCode()`. Use them only for the
  **first-run default** of the language setting; afterwards the setting wins.
- Chromium UI locale: `app.commandLine.appendSwitch('lang', 'ar')` **before** `ready` (bug that ignored it was fixed in
  Electron 11, PR #26185). It affects Chromium-native strings (spellcheck context menu, `<input type=date>` pickers, PDF
  viewer, `navigator.language`). Read the saved language from SQLite before `ready` (better-sqlite3 works pre-ready) and
  apply it; changing language in settings then needs a relaunch for those native bits only — the React UI switches live.
  Show "tam geçiş için yeniden başlatın" note.
- Application menu: build with `Menu.buildFromTemplate` using a **main-process i18next instance** loading the same
  `nav`/`menu` JSON (share the files via `src/shared/i18n/` or import from renderer locales at build time). Role items
  (`undo`, `copy`, `quit`, `about`, macOS app menu) render English unless `label` is given → provide labels for every
  role (tiny helper; `electron-menu-i18next` on GitHub does exactly this, doc, verify). Rebuild and `Menu.setApplicationMenu`
  on `languageChanged`.
- Dialogs: `dialog.showMessageBox({ title, message, detail, buttons: [t('ok'), t('cancel')], defaultId, cancelId, noLink: true })` —
  all strings are ours; `noLink: true` keeps Windows from turning buttons into command links. OS file dialogs
  (open/save/print) are localized by the OS, not by us. Notifications and tray tooltips: translated strings.
- Spellcheck: on Windows/Linux Electron uses Hunspell and **downloads dictionaries from a Google CDN by default**
  (`session.setSpellCheckerDictionaryDownloadURL` can point to a self-hosted http(s) URL; `file://` is not supported;
  there is an open feature request for local dictionaries). macOS uses the native checker (no download, language
  auto-detected, cannot be set). Chromium's Hunspell set includes `ru-RU` and `tr-TR` but Arabic coverage is doubtful
  (doc, verify). Given G-01/G-07: **set `webPreferences.spellcheck: false` on Windows/Linux** (optionally keep native on
  macOS). If spellcheck is ever wanted, serve bundled `.bdic` files from the local Hono server (case-insensitive paths,
  trailing slash) under `src/main/network/`.
- Windows installer (electron-builder 26.15.3, NSIS): 

```yaml
nsis:
  oneClick: false
  perMachine: false
  unicode: true                       # default; multiLanguageInstaller defaults to unicode
  multiLanguageInstaller: true
  displayLanguageSelector: true       # or false → NSIS picks the Windows UI language
  installerLanguages: [tr_TR, en_US, ru_RU, ar_SA]
  license: build/license_tr.txt       # + license_en.txt, license_ru.txt, license_ar.txt (lang postfix convention)
```

  electron-builder's own installer strings (`templates/nsis/messages.yml`) already contain `ar`, `ru`, `tr_TR` (verified);
  NSIS ships `Arabic.nlf`, `Russian.nlf`, `Turkish.nlf`. Language codes are `xx_YY` (LCIDs: tr 1055, en-US 1033, ru 1049,
  ar-SA 1025) (doc, verify the exact map in `app-builder-lib/src/targets/nsis/nsisLang.ts`). NSIS supports RTL layout per
  language file, but a forum note says `Arabic.nlf` may be flagged LTR — installer mirroring is cosmetic; accept.
  Product name/shortcut names are single-language (use "Bismuth"). macOS `.dmg` has no language concept.

### A4. Effort estimate and "dil ve yön" QA pass

Estimate (for a shadcn app of ~35–45 screens, built RTL-aware from the start with `rtl: true` and the lint hook):

| Item | Effort |
|---|---|
| i18n plumbing (init, lazy JSON, typed keys, CLI config, ESLint, Intl helpers in `shared/`) | 1–2 days |
| Direction wiring + shadcn `migrate rtl` + manual review of Calendar/Pagination/Sidebar/Sheet/Switch/Progress/Toast | 2–3 days |
| Custom screens (tape chart LTR island, kasa panel, reports/charts, printing) | 2–4 days |
| Fonts/typography tokens, icon wrapper | 1 day |
| Electron bits (menu, dialogs, `--lang`, NSIS languages) | 1 day |
| Translation of ~1,500–2,500 keys (AI draft + review) | 1–2 days per language + reviewer time |
| QA pass per release (4 languages × desktop + mobile) | 0.5–1 day per release |

Rule of thumb: **+10–15 % on UI work when logical classes are enforced from day one; +25–35 % if RTL is retrofitted**
after screens exist (industry write-ups put "mirroring everything" at ~60 % of the RTL work; the rest is bidi text,
icons, typography and QA). Four languages add roughly another 10 % for overflow fixes (Russian is the longest).

"Dil ve yön" QA checklist (run per release in tr, en, ru, ar on desktop 1366×768 and phone 390×844):

1. `<html lang dir>` correct; `DirectionProvider` dir matches; language persists after restart; phone follows host setting.
2. No raw keys or Turkish text in en/ru/ar (`i18next-cli status` = 0 missing; grep for `_one` fallbacks in ar).
3. Plurals: 0, 1, 2, 3, 5, 11, 21, 100, 101 nights/guests/rooms in ru and ar read correctly.
4. Money: `1.234,50 ₺` / `1,234.50 ₺` / `1 234,50 ₽` / Arabic with Latin digits; negative and zero amounts; multi-currency
   tables aligned (`tnum`); amounts in Arabic sentences not reordered (`<bdi>`).
5. Dates: Gregorian in ar; day-first in en-GB; weekday/month names; week starts per setting; `YYYY-MM-DD` never shown raw.
6. Sorting: guest list in tr (ı/i), ru, ar; search is diacritic-insensitive.
7. Layout: sidebar/bottom nav at the start edge; sheets open from the start edge; dropdown/select/popover align and
   open toward the correct side; sub-menus open inward; tooltips; toasts position.
8. Icons: every directional icon mirrored, none of the non-directional ones.
9. Forms: numeric/phone/IBAN/date inputs LTR; placeholder alignment; error messages translated; validation (zod) messages.
10. Tables: numeric columns end-aligned, text start-aligned, sticky first column on the start side, horizontal scroll
    starts at the correct edge.
11. Tape chart stays LTR; room names/guest names render correctly; keyboard navigation.
12. Calendar/date picker in RTL: nav arrows, grid order, range selection.
13. Overflow: longest Russian strings (buttons, tabs, table headers) do not clip; Arabic line-height no clipping of diacritics.
14. Fonts: no fallback (system) glyphs in Arabic or Cyrillic (check tofu/mismatched weights); print/PDF uses bundled fonts.
15. Electron: app menu, dialogs, notifications translated; `--lang` applied after restart; installer language list.
16. Screenshots archived per language for the release notes; native-speaker sign-off for ru and ar.

---

## PART B — Phone/tablet web UI from the same React code

### B1. Responsive strategy for a desktop-first shadcn app

Principles: one renderer bundle; same routes and data hooks; two **shells** chosen at runtime; mobile = view + light edits (G-143).

- Breakpoints: shadcn `useIsMobile()` = `max-width: 767px` (`MOBILE_BREAKPOINT = 768`, verified). Add `(pointer: coarse)`
  for touch sizing and treat 768–1023 as "tablet" (desktop shell with `Sidebar collapsible="icon"`).
- Route-level layouts: `/_desktop` shell (Sidebar + topbar + resizable panels) and `/_mobile` shell (top app bar +
  content + **bottom nav** with 4–5 items: Bugün, Takvim, Misafirler, Kasa, Diğer). Pick the shell in the root layout from
  `useIsMobile()`; screens render inside either. Screens that are desktop-only (settings deep pages, tape chart, printing)
  show a "masaüstünde kullanın" empty state on mobile.
- Mobile dialogs: a `ResponsiveDialog` wrapper → `Dialog` on desktop, **`Sheet side="bottom"`** on mobile (Radix Dialog,
  already in the project, no new dependency). vaul (shadcn Drawer) is functional but its repo is marked unmaintained;
  shadcn's Base UI variant moved its Drawer to `@base-ui/react` 1.8 Drawer. Decision: do not add vaul; if swipe-to-dismiss
  bottom sheets become a requirement, revisit (`vaul` 1.1.2 pinned, or `vaul-base` if the project adopts Base UI).
- Navigation drawer: shadcn Sidebar already renders as a Sheet below 768 px (`useSidebar().isMobile/openMobile`), but a
  bottom nav is the better phone pattern; keep the Sheet for the "Diğer" overflow.
- Tables → card lists below `md`; DataTable column priority (`hidden md:table-cell`); detail opens in a bottom sheet.
- Touch targets: WCAG 2.2 SC 2.5.8 (AA) = 24×24 CSS px minimum; Apple HIG 44 pt; Material 48 dp → use **44 px** on mobile
  (`min-h-11`, `h-11` inputs/buttons, 8 px gaps). Inputs `text-base` (16 px) to stop iOS zoom; `inputMode="decimal"` for
  amounts, `inputMode="tel"`; `100dvh`; `viewport-fit=cover` + `env(safe-area-inset-bottom)` under the bottom nav;
  `touch-action: manipulation`; no hover-only affordances; sticky action bar for forms.
- Date entry on mobile: native `<input type="date">` (OS picker, localized by the phone) instead of the popover Calendar.
- shadcn blocks (dashboard-01, sidebar-07…) are desktop-first; reuse their cards/KPI tiles, not their layouts.

Screen map (desktop → phone):

| Screen | Phone representation |
|---|---|
| Bugün (Today) | stacked cards: gelişler, çıkışlar, konaklayanlar, boş odalar, kasa özeti; tap → sheet with check-in/payment/note |
| Rezervasyon takvimi | **day list** (today / next 7 days, swipe), per day: arrivals/departures/in-house counts + rows; optional tablet-only 7-day mini grid (B4) |
| Misafir arama | search field + result list; guest card in sheet; call/WhatsApp links |
| Ödeme girişi | full-screen form: amount (decimal keypad), currency, method, note; confirmation sheet |
| Raporlar | KPI tiles + 2–3 small charts; date range chips |
| Oda durumu panosu | grid of room chips (status colour from `--status-*`), tap → status change (if allowed) |
| Bakım hatırlatıcıları | list with due badges; mark done |
| Döviz çevirici | simple two-field form |

### B2. PWA over the private network

Install/behaviour matrix:

| Transport | Chrome/Android | iOS Safari | Service worker |
|---|---|---|---|
| **Tailscale HTTPS** (`https://<pc>.<tailnet>.ts.net`) | installable PWA (manifest + icons + `display: standalone`; Chrome dropped the SW requirement for install in 2024, doc, verify) | Share → "Add to Home Screen"; iOS 16.4+ opens as web app when `display` is `standalone`; iOS 26 opens any added site as a web app | works (secure context) |
| plain LAN HTTP (`http://192.168.x.y:4242` or `bismuth.local`) | not installable (insecure); "Add to Home screen" = bookmark shortcut | A2HS works, no SW | **no** (insecure context) |
| self-signed cert on LAN | certificate warnings on every phone; not recommended | same | works after trust dance |

- Tailscale: enable HTTPS + MagicDNS in the admin console; either run `tailscale serve https / http://localhost:4242`
  (auto-provisioned Let's Encrypt cert, Windows needs an admin terminal; macOS App-Store client has limits for file
  serving, port proxy is fine, doc, verify) or `tailscale cert <pc>.<tailnet>.ts.net` → `.crt/.key` files that the app's
  Hono server loads (`serve({ fetch, createServer: https.createServer, serverOptions: { key, cert } })`, verified in Hono
  docs). Certs are 90-day Let's Encrypt; `tailscale cert` must be re-run (the app can shell out to it on start under
  `src/main/network/`, timeout 5 s, silent failure). Hostnames appear in public CT logs (fine).
- Design: the phone UI always needs the host online for data; the SW only caches the **app shell** so the icon opens
  instantly and shows "Sunucu çevrimdışı" instead of a browser error. No background sync, no push (not needed; iOS push
  would require an installed PWA anyway).
- `vite-plugin-pwa` 1.3.0 config sketch (renderer `vite.config` / electron-vite renderer section):

```ts
VitePWA({
  disable: process.env.BISMUTH_TARGET === 'electron',   // no SW inside Electron (file://)
  strategies: 'generateSW', registerType: 'prompt', injectRegister: 'auto',
  includeAssets: ['icons/*.png', 'fonts/*.woff2'],
  manifest: { id: '/', name: 'Bismuth', short_name: 'Bismuth', lang: 'tr', dir: 'auto', display: 'standalone',
              start_url: './', scope: './', theme_color: '#0f172a', background_color: '#ffffff',
              icons: [{ src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
                      { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
  workbox: {
    globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],   // shell + locale JSON
    navigateFallback: 'index.html',
    runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
  },
})
```

  Financial data must never be served stale → `/api/*` is `NetworkOnly` (not NetworkFirst). Add `apple-touch-icon` 180 px,
  `<meta name="mobile-web-app-capable">` (the `apple-` prefixed one is deprecated but harmless), `theme-color` per scheme.
- Auth for host mode is out of scope here; note that cookies/tokens over Tailscale HTTPS are straightforward, over LAN
  HTTP they are plaintext (owner-accepted risk or Tailscale-only policy).

### B3. Build config and Playwright for Electron + browser from one bundle

- **Base path**: electron-vite/Forge set renderer `base: './'` because production loads from `file://`; `'/'` breaks the
  packaged window. A relative base served by Hono at `/` works for the root document but breaks **deep links**
  (`/rezervasyon/42` → `./assets/x.js` resolves under `/rezervasyon/`). Options: (1) **hash routing** (`/#/today`) on
  both targets — one build, deep links and PWA `start_url: './'` just work (recommended); (2) build the renderer twice with
  different `base` (doubles CI time); (3) Hono rewrite that serves `index.html` for every non-asset path **and** maps
  `/*/assets/*` → `/assets/*` (fragile).
- **Transport flag**: runtime detection — `window.api` (preload bridge) present → IPC transport; else `hono/client` `hc`
  against `location.origin`. Put it in `src/renderer/lib/transport.ts`, same zod contract on both sides. Use a build-time
  `define` (`__TARGET__ = 'electron' | 'web'`) only for dead-code elimination (SW registration, Electron-only screens).
- Hono static serving (`@hono/node-server/serve-static`): `app.use('/*', serveStatic({ root: rendererDir }))` then
  `app.get('*', serveStatic({ path: path.join(rendererDir, 'index.html') }))` as SPA fallback; `root` resolves relative to
  `process.cwd()` → pass an absolute path from `app.getAppPath()`/`process.resourcesPath`. `Cache-Control: no-cache` for
  `index.html`, long max-age for hashed assets.
- Playwright 1.63 config (one `tests/e2e` folder, page-fixture abstraction):

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  projects: [
    { name: 'electron', testMatch: /.*\.electron\.spec\.ts/ },                 // custom fixture: _electron.launch({ args: ['out/main/index.js'] }), firstWindow()
    { name: 'web-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4242' } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4242' } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:4242' } },
    { name: 'web-ar-rtl', use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4242?lang=ar', locale: 'ar-EG' } },
  ],
  webServer: { command: 'node out/main/host-only.js --db=tmp/e2e.sqlite --seed', url: 'http://localhost:4242/health', reuseExistingServer: !process.env.CI },
});
```

  - Electron: `_electron.launch` + `electronApp.firstWindow()`; `electronApp.evaluate(({ app }) => …)` for main-process
    checks (Electron's automated-testing tutorial, verified); runs under xvfb on Linux CI (K-11).
  - Device descriptors set viewport, UA, `deviceScaleFactor`, `isMobile`, `hasTouch`; Firefox has no `isMobile`, so mobile
    projects are Chromium + WebKit only. `locale`/`timezoneId`/`colorScheme` are emulated per project.
  - Visual regression: `expect(page).toHaveScreenshot()` for Today/Calendar/Payment in tr+ar × desktop+phone (8 shots);
    tolerate fonts by bundling them (deterministic).
  - A "host-only" entry (`host-only.ts`) that boots services + Hono without a BrowserWindow makes web tests independent of
    Electron and lets CI run them on Linux without xvfb.

### B4. Tape chart on mobile — use a different representation

Recommendation: never render the rooms × 10-years grid on a phone. Provide:

1. **Gün listesi** (default): today / tomorrow / next 7 days, swipeable; each day shows counts (gelen, çıkan, konaklayan,
   boş) and rows grouped by status; tap → bottom sheet with actions (check-in/out, ödeme ekle, not). This is how Cloudbeds'
   app works (dashboard with today's and tomorrow's arrivals/departures/in-house, quick search, occupancy meter, room
   status/housekeeping view, reservation detail edit, notifications; no tape chart) and Mews Operations ("day at a glance",
   housekeeping status, tasks, messaging) (search snippets; vendor help pages blocked, doc, verify).
2. **Oda durumu panosu**: grid of room chips coloured by `--status-*`; filter by floor/type; this doubles as housekeeping view.
3. **Oda zaman çizelgesi**: pick a room → vertical list of stays (past/current/next) — the "column" of the tape chart.
4. **Tablet-only 7-day mini grid** (≥768 px, landscape): sticky room column at the start edge, 44 px rows, horizontal
   scroll, read-only; still `dir="ltr"`.
5. Little Hotelier's app keeps a drag-and-drop calendar (2-week/1-month views) because its market is <20 rooms; for
   Bismuth's room count and "view + light edit" scope, lists are safer on a 390 px screen (no accidental drags). Keep
   drag/drop desktop-only.

Interaction details: pull-to-refresh is risky in a PWA (browser gesture) → explicit refresh button + auto refresh on
visibility change; optimistic UI off (always confirm from host); conflicts surface as toast + reload.

---

## Open questions for `05-sorular.md`

- S: Arabic digits default (Latin recommended) — confirm with the owner/Arabic-speaking staff.
- S: Tape chart LTR in Arabic — confirm.
- S: `tr.json` single file vs per-namespace files (changes CLAUDE.md rule 8 wording).
- S: Spellcheck off on Windows (offline rule) — acceptable?
- S: Installer language selector shown, or follow Windows language silently?
- S: Phone access only via Tailscale HTTPS (real PWA) or also plain LAN HTTP (shortcut only)?

## Sources

- npm registry pages for every package in §0 (fetched 2026-10-01).
- i18next docs repo (`i18next/i18next-gitbook`): `principles/fallback.md`, `translation-function/plurals.md`; `i18next/i18next` CHANGELOG (v23–v26).
- `i18next/i18next-cli` README (commands, config, plural generation, types); `edvardchen/eslint-plugin-i18next` README.
- CLDR `common/supplemental/plurals.xml` (unicode-org/cldr) for ar/ru/tr/en rules.
- shadcn/ui repo: `apps/v4/content/docs/changelog/2026-01-rtl.mdx`, `docs/rtl/index.mdx`, `docs/components/radix/direction.mdx`, `docs/components/base/drawer.mdx`, `registry/new-york-v4/hooks/use-mobile.ts`; issues #7280, #9233, #530, PR #1638; discussion #8982 "Vaul is unmaintained".
- Tailwind source `packages/tailwindcss/src/variants.ts` (rtl/ltr selectors); Tailwind PR #10166 (logical utilities).
- Radix `direction-provider.mdx` (radix-ui/website); `emilkowalski/vaul` README notice.
- Electron docs repo: `docs/api/app.md`, `docs/tutorial/spellchecker.md`, `docs/api/command-line-switches.md`, `docs/api/dialog.md`, `docs/tutorial/automated-testing.md`; issue #17995 / PR #26185 (`--lang`); issues #22381, #27403, #44668 (dictionary download URL).
- electron-builder: `templates/nsis/messages.yml` (ar/ru/tr_TR present); NSIS docs/issues #2486, #2649, #7444 (installerLanguages, license postfix) (doc, verify).
- google/fonts `METADATA.pb` for inter, notosans, notosansarabic, ibmplexsansarabic, vazirmatn, cairo.
- Playwright `docs/src/emulation.md`; Vite `docs/config/shared-options.md`, `docs/guide/build.md`; Hono `docs/getting-started/nodejs.md`; vite-plugin-pwa `src/types.ts` + guide.
- Search snippets (doc, verify): Tailscale HTTPS/serve docs, Cloudbeds App Overview, Mews Operations app, Little Hotelier app, iOS PWA behaviour (iOS 16.4 / iOS 26), WCAG 2.5.8 / HIG / Material target sizes, Arabic typography line-height guidance, `ar-SA` Umm al-Qura default calendar, Arabic digit preferences, NSIS language files/RTL note.
