# shadcn/ui Ekosistemi Araştırması — Hotel-CRM (Lale, 19 oda, 10 yıllık takvim)

**Tarih:** 2026-10-01 · **Hedef:** Tamamen çevrimdışı masaüstü uygulaması (Windows `setup.exe`, macOS `.app`), React 19 + TypeScript + Tailwind v4 + shadcn/ui, Electron **veya** Tauri 2, arayüz Türkçe.

**Kaynak notu:** `ui.shadcn.com`, `tweakcn.com`, `tanstack.com`, `v2.tauri.app`, `tailwindcss.com`, `planby.app`, `schedule-x.dev`, `daypilot.org` bu oturumda ağ vekili tarafından engellendi. Bütün shadcn bilgileri doğrudan **GitHub deposundan** (`shadcn-ui/ui`, `apps/v4/content/docs/**` MDX dosyaları ve `apps/v4/registry/**` kaynakları, raw.githubusercontent.com), sürüm/tarih/lisans bilgileri **npm registry**'den (`npm view`), geri kalanı web aramasından alındı. Her maddede kaynak belirtildi; doğrulanamayan maddeler "(doğrula)" ile işaretlendi.

---

## 0. Yönetici özeti

| Konu | Karar / Bulgu |
|---|---|
| shadcn CLI | `shadcn@4.21.1` (2026-10-01). CLI v4 Mart 2026'da çıktı (4.0.0 = 2026-03-06). Node ≥ 20.18.1. |
| Primitive tabanı | **Temmuz 2026'dan beri varsayılan Base UI** (`@base-ui/react` 1.8.0). Radix (`radix-ui` 1.6.7) tam destekli, `npx shadcn init -b radix`. React Aria üçüncü taban (Temmuz 2026). |
| Tailwind / React | Tailwind **v4.3.3**, React **19.3.0** destekli (Şubat 2025'ten beri). Stil adı `new-york` (tek stil) + 8 görsel "preset" (vega, nova, maia, lyra, mira, luma, rhea, sera). |
| Bileşen sayısı | 65 belge sayfası (Radix) / 64 (Base UI). 2025–2026'da eklenenler: Spinner, Kbd, Button Group, Input Group, Field, Item, Empty, Native Select, Direction, Combobox (Base UI'da yerli), Toast (Base UI), chat bileşenleri (Message, MessageScroller, Bubble, Attachment, Marker), Questionnaire. |
| Tape chart | Hazır kütüphane önermiyoruz. **Özel ızgara**: `@tanstack/react-virtual` 3.14.13 (sütun sanallaştırma) + mutlak konumlu rezervasyon blokları. Ücretsiz hazır çözümlerin hiçbiri 19 oda × 3650 gün + özel hücre kuralları (gece gece renk, bölünmüş hücre) için uygun değil; ücretli olanlar (FullCalendar Premium 480 $/geliştirici, Schedule‑X Premium 479 €/yıl, Planby PRO 400 $/geliştirici) gereksiz. |
| Grafikler | shadcn Chart (Recharts **3.10.1**, MIT). 77 hazır örnek. KPI'lar için yeterli; ısı haritası için Recharts yok → CSS ızgara. |
| Çalışma anında tema | shadcn CSS değişkenleri (`--primary`, `--chart-1`… OKLCH) `document.documentElement` üzerinde `style.setProperty` veya enjekte `<style>` ile değiştirilir. tweakcn (Apache‑2.0) preset JSON biçimi + `apply-theme.ts` kodu vendorlanabilir. Hazır "uygulama içi tema editörü" npm paketi üretim kalitesinde yok → küçük bir "Tema Ayarları" sayfası yazılır. |
| Electron vs Tauri | Tailwind v4 **Chrome 111+ / Safari 16.4+ / Firefox 128+** ister. Electron 44 (Chromium 146): **macOS 13+**, Windows 10+ (yalnız x64/arm64). Tauri 2 macOS'ta sistem WebKit kullanır → fiilen **macOS 13.3+** (Big Sur 11.7.10'da Tailwind v4 bozuk: tauri#14219). Windows'ta WebView2 **çevrimdışı yükleyici** gömülmeli (+~127 MB). Rendering tutarlılığı için **Electron** tavsiye; boyut öncelikliyse Tauri 2 + `minimumSystemVersion: "13.0"`. |
| Kritik sabitleme | `react-day-picker` **9.14.0'a sabitle** (v10 shadcn Calendar'ı kırıyor, shadcn#10914 açık). `@tanstack/react-table` v9 (shadcn belgeleri v9 `useTable` API'sine geçti; çoğu eğitim hâlâ v8). |

---

## 1. shadcn CLI, Tailwind v4, React 19, Vite kurulumu

### 1.1 Sürümler ve zaman çizelgesi

| Paket | Sürüm | Tarih | Lisans | Not |
|---|---|---|---|---|
| `shadcn` (CLI) | 4.21.1 | 2026-10-01 | MIT | `engines.node >= 20.18.1`; 4.0.0 → 2026-03-06; 3.0.0 → 2025-08-27 |
| `cn` | 0.2.4 | 2026-09-02 | MIT | `twMerge(clsx())` yerine (Eylül 2026) |
| `tailwindcss` | 4.3.3 | 2026-07-16 | MIT | 4.0.0 → 2025-01-21 |
| `react` / `react-dom` | 19.3.0 | 2026-09-09 | MIT | |
| `vite` | 8.3.2 | 2026-10-01 | MIT | 8.0.0 → 2026-03-12 |
| `@base-ui/react` | 1.8.0 | 2026-09-04 | MIT | 1.0.0 → 2025-12-11 (eski ad `@base-ui-components/react` rc'de kaldı) |
| `radix-ui` (birleşik paket) | 1.6.7 | 2026-07-31 | MIT | Şubat 2026'dan beri tek paket; `npx shadcn migrate radix` |
| `react-aria-components` | 1.21.1 | 2026-10-01 | Apache-2.0 | üçüncü taban, bu proje için gereksiz |
| `lucide-react` | 1.49.0 | 2026-09-29 | ISC | varsayılan ikon seti |
| `class-variance-authority` | 0.7.1 | 2024-11-26 | Apache-2.0 | |
| `tailwind-merge` | 3.7.0 | 2026-09-13 | MIT | `cn` paketi ile artık gerekmez |
| `tw-animate-css` | 1.4.0 | 2026-02-28 | MIT | |

**shadcn changelog (depodaki dosya adlarıyla, 2025–2026):**
2025-02 Tailwind v4 + React 19 · 2025-02 registry şeması · 2025-04 cross-framework / MCP / shadcn 2.5 · 2025-05 yeni site · 2025-06 Calendar (react-day-picker 9 + 30+ takvim bloğu) · 2025-06 radix-ui · 2025-07 yerel dosya desteği / universal registry · 2025-08 CLI 3 + MCP · 2025-09 registry index · **2025-10 yeni bileşenler** (Spinner, Kbd, Button Group, Input Group, Field, Item, Empty) · 2025-10 registry directory · **2025-12 shadcn/create** (5 preset: Vega, Nova, Maia, Lyra, Mira; Vite şablonu) · **2026-01 Base UI** belgeleri · 2026-01 inline side styles · 2026-01 RTL (Direction bileşeni) · 2026-02 bloklar Radix+Base UI · 2026-02 birleşik `radix-ui` · **2026-03 CLI v4** (presets, `--dry-run/--diff/--view`, `--template`, `--base`, `shadcn info/docs`, `registry:base`, `registry:font`, shadcn/skills) · 2026-03 Luma stili · 2026-04 component composition / partial preset apply / **pointer cursor** / preset komutları / Sera stili / `shadcn apply` · 2026-05 package imports & target aliases / registry include / Rhea stili / `shadcn eject` · **2026-06 chat bileşenleri** / GitHub registries · **2026-07 Base UI varsayılan** / dynamic search / `@shadcn/helpers` / React Aria / **Toast** (Base UI) / typeset · 2026-08 helpers HITL / private GitHub registries / **Questionnaire** · **2026-09 `cn` paketi**.

Kaynak: `apps/v4/content/docs/changelog/*.mdx` dosya listesi ve içerikleri.

### 1.2 Base UI mi Radix mi?

- **Temmuz 2026:** "Base UI is now the default… Radix is not being deprecated." Yeni projelerde `npx shadcn init` Base UI seçer; Radix için `-b radix`. Her yeni bileşen iki taban için de çıkıyor. Base UI 1.6.0 anonsunda "6M+ haftalık indirme", topluluk tercihi 2:1 Base UI.
- Base UI'nin bu proje için somut artıları: **yerli Combobox** (Radix'te Popover+Command birleşimi), **Toast** (Radix tarafı Sonner kullanır), aylık sürüm temposu, aktif tam zamanlı ekip. Radix'in artısı: topluluk örnekleri/şablonların (ör. shadcn-admin) çoğu hâlâ Radix.
- **Öneri:** Base UI (varsayılan). Bağımlılıklar sabitleneceği için (G-07) API değişikliği riski yok. Radix'e özgü bilinen hatalar (Dialog+DropdownMenu `pointer-events:none` kilitlenmesi, radix#1241/#3317) Base UI'de farklı mimariyle ele alınıyor; yine de 8. bölümdeki testler yapılmalı.

### 1.3 Vite kurulumu (Next.js değil)

Resmî belge `apps/v4/content/docs/installation/vite.mdx` üç yol veriyor:

1. **shadcn/create** (görsel): taban (Base UI/Radix), stil preset'i, baz renk, ikon seti, font, radius seçilir → tek komut üretir (`--preset <kod>`).
2. **CLI şablon:** `npx shadcn@latest init -t vite` (yeni proje; `--monorepo` opsiyonu).
3. **Mevcut Vite projesi (manuel):**
   ```bash
   npm create vite@latest hotel-crm -- --template react-ts
   npm install tailwindcss @tailwindcss/vite
   ```
   `src/index.css` → yalnızca `@import "tailwindcss";`
   `tsconfig.json` **ve** `tsconfig.app.json`:
   ```json
   { "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }
   ```
   `vite.config.ts`:
   ```ts
   import path from "path"
   import tailwindcss from "@tailwindcss/vite"
   import react from "@vitejs/plugin-react"
   import { defineConfig } from "vite"
   export default defineConfig({
     plugins: [react(), tailwindcss()],
     resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
   })
   ```
   Sonra `npx shadcn@latest init` (sorular: taban, baz renk, CSS değişkenleri) ve `npx shadcn@latest add button sidebar ...`.

CLI v4 komutları (`(root)/cli.mdx`): `init/create` (`--template`, `--base`, `--preset`, `--defaults`, `--css-variables`, `--monorepo`, `--rtl`), `add` (`--all`, `--path`, `--dry-run`, `--diff`, `--view`, `--overwrite`), `apply` (`--preset`, `--only`), `preset` (`decode/resolve/info/url/open`), `view`, `search/list`, `build`, `docs` (`--base`, `--json`), `info`, `migrate` (`cn`, `icons`, `base-color`, `radix`, `rtl`), `eject`.

**Çevrimdışı ürün için önemli:** v4 projeleri ortak Tailwind yardımcılarını (`data-open:` varyantları, animasyonlar) `shadcn/tailwind.css` **npm bağımlılığından** import eder. `npx shadcn@latest eject` bunu `index.css` içine inline eder ve `shadcn` paketini bağımlılıktan çıkarır → derleme tamamen yerel, bağımlılık yüzeyi küçük. Projede eject önerilir.

### 1.4 `components.json`

Alanlar (`(root)/components-json.mdx`): `$schema`, `style` (yalnız `"new-york"`, sonradan değişmez), `rsc` (Vite'ta `false`), `tsx` (`true`), `tailwind.config` (Tailwind v4'te **boş**), `tailwind.css` (`src/index.css`), `tailwind.baseColor` (`neutral | stone | zinc | mauve | olive | mist | taupe` — eski `gray/slate` yerine yeni liste; `registry/base-colors.ts` doğruluyor), `tailwind.cssVariables` (`true` önerilir; sonradan değişmez), `tailwind.prefix`, `aliases.{components,ui,lib,hooks,utils}`, `iconLibrary`, `registries` (ad alanlı kayıt defterleri, `${ENV}` genişletmeli başlıklar), taban seçimi (Base UI/Radix) de burada tutulur.

### 1.5 Tema: CSS değişkenleri (verbatim, `(root)/theming.mdx`)

Tüm bileşenler semantik token'ları kullanır. `:root` (açık) ve `.dark` (koyu) aynı adları farklı değerlerle tanımlar; `@theme inline` bunları Tailwind yardımcılarına (`bg-primary`, `text-muted-foreground`) bağlar.

```css
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);            --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);                  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);               --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);           --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);          --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);              --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);             --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);  --input: oklch(0.922 0 0);  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);           --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);   --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);     --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);    --sidebar-ring: oklch(0.708 0 0);
}
.dark {
  --background: oklch(0.145 0 0);        --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);              --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);           --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);           --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);         --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);             --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);            --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);  --input: oklch(1 0 0 / 15%);  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376); --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);   --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);           --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376); --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);    --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);  --sidebar-ring: oklch(0.556 0 0);
}
@theme inline {
  --color-background: var(--background);  --color-foreground: var(--foreground);
  /* …card, popover, primary, secondary, muted, accent, destructive, border, input, ring,
     chart-1..5, sidebar-* için aynı kalıp… */
  --radius-sm: calc(var(--radius) * 0.6);  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);              --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8); --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

**Yeni token ekleme (resmî kalıp — otel durum renkleri için birebir kullanılacak):**
```css
:root { --warning: oklch(0.84 0.16 84); --warning-foreground: oklch(0.28 0.07 46); }
.dark { --warning: oklch(0.41 0.11 46); --warning-foreground: oklch(0.99 0.02 95); }
@theme inline { --color-warning: var(--warning); --color-warning-foreground: var(--warning-foreground); }
```
→ `bg-warning text-warning-foreground` yardımcıları oluşur. CSS değişkenleri kapatmak için `init --no-css-variables` (bizim için **hayır**; çalışma anı teması değişkenlere dayanır).

### 1.6 Vite'ta karanlık mod (`dark-mode/vite.mdx`, verbatim özet)

CSS'e `@custom-variant dark (&:is(.dark *));` (Tailwind v4) eklenir; `ThemeProvider` `localStorage` anahtarı (`vite-ui-theme`) okur, `document.documentElement` üzerinde `light|dark` sınıfını yönetir, `system` için `matchMedia("(prefers-color-scheme: dark)")` kullanır:

```tsx
type Theme = "dark" | "light" | "system"
export function ThemeProvider({ children, defaultTheme = "system", storageKey = "vite-ui-theme" }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme) || defaultTheme)
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      root.classList.add(systemTheme); return
    }
    root.classList.add(theme)
  }, [theme])
  /* …context + useTheme() … */
}
```
`ModeToggle` = DropdownMenu (Light/Dark/System) + lucide `Sun/Moon`. Masaüstünde `localStorage` yerine ayar tablosundan okunup aynı mekanizma kullanılabilir; Electron'da ayrıca `nativeTheme.themeSource` ile pencere çerçevesi senkronlanır.

---

## 2. Bileşen listesi (Ekim 2026) ve projeye etkisi

Kaynak: `apps/v4/content/docs/components/{radix,base}/*.mdx` (65 / 64 dosya). "★" = bu proje için önemli.

| Bileşen | Ne yapar | Not |
|---|---|---|
| Accordion | Açılır/kapanır bölümler | |
| Alert | Bilgi/uyarı kutusu | |
| Alert Dialog | Onay gerektiren modal | ★ silme/park etme onayları |
| Aspect Ratio | Oran koruyucu kutu | |
| Attachment | Dosya/görsel kartı (chat, 2026-06) | |
| Avatar | Profil resmi | |
| Badge ★ | Küçük etiket/rozet | durum rozetleri, "kısmi görünüm" |
| Breadcrumb | Yol göstergesi | |
| Bubble | Mesaj balonu (chat, 2026-06) | |
| Button ★ | Düğme (variant/size) | 2026-04'ten beri `cursor: pointer` |
| Button Group ★ (2025-10) | Bitişik düğme grubu, split button | araç çubukları |
| Calendar ★ | react-day-picker tabanlı takvim | **v9 API**; `captionLayout="dropdown"`, `mode="range"`, `timeZone`, `locale` (tr), `--cell-size` |
| Card ★ | Kart | KPI kutuları |
| Carousel | Embla tabanlı kaydırıcı | gereksiz |
| Chart ★ | Recharts sarmalayıcı (Container/Tooltip/Legend/Style) | bkz. §7 |
| Checkbox | | |
| Collapsible | | |
| Combobox ★ | Arama+seçim | **Base UI'da yerli primitive** (tekli, çoklu chip, gruplu, clear, RTL); Radix'te Popover+Command |
| Command ★ | cmdk tabanlı komut paleti | global arama (Ctrl+K) |
| Context Menu | Sağ tık menüsü | ★ takvim hücresi menüsü |
| Data Table ★ | TanStack Table deseni (belge) | **v9** `useTable`, `tableFeatures()`, `createColumnHelper` |
| Date Picker ★ | Popover+Calendar bileşimi | örnekler: range, DOB, input, time, doğal dil (chrono-node), RTL |
| Dialog ★ | Modal | |
| Direction (2026-01) | RTL/LTR sağlayıcı | gereksiz (TR LTR) |
| Drawer | vaul tabanlı alt çekmece | mobil; masaüstünde Sheet |
| Dropdown Menu ★ | | |
| Empty ★ (2025-10) | Boş durum (başlık/açıklama/medya) | "henüz rezervasyon yok" |
| Field ★ (2025-10) | Form alanı sarmalayıcı (Label/Description/Error, yatay/dikey) | RHF/TanStack Form bağımsız |
| Hover Card | | takvim bloğu önizlemesi |
| Input ★ | | |
| Input Group ★ (2025-10) | Input'a ikon/düğme/ek | ₺/€ para birimi eki |
| Input OTP | | gereksiz |
| Item ★ (2025-10) | Esnek liste öğesi | listeler, bugün ekranı kartları |
| Kbd ★ (2025-10) | Klavye tuşu gösterimi (`KbdGroup`) | kısayol ipuçları |
| Label | | |
| Marker | Durum/sistem satırı (chat) | |
| Menubar | Uygulama menü çubuğu | masaüstü hissi |
| Message / Message Scroller | Chat satırı / kaydırma kabı | gereksiz |
| Native Select | Yerli `<select>` | hafif formlar |
| Navigation Menu | | |
| Pagination | | |
| Popover ★ | | |
| Progress | | |
| Questionnaire (2026-08) | Çok adımlı soru akışı | kurulum sihirbazı için değerlendirilebilir |
| Radio Group | | |
| Resizable ★ | react-resizable-panels (**v4**) | takvim / park paneli bölme |
| Scroll Area ★ | Özel kaydırma çubuğu | Windows'ta tutarlı görünüm |
| Select ★ | | |
| Separator | | |
| Sheet ★ | Kenardan açılan panel | rezervasyon paneli (Faz 5) |
| Sidebar ★ | Tam gezinme çubuğu | `SidebarProvider`, `variant: sidebar/floating/inset`, `collapsible: offcanvas/icon/none`, Ctrl/Cmd+B, `--sidebar-width`, `sidebar-*` token'ları, `useSidebar()` |
| Skeleton | | |
| Slider | | |
| Sonner (yalnız Radix belgelerinde) ★ | Toast (sonner 2.0.8) | Radix tabanı |
| Spinner ★ (2025-10) | Yükleniyor göstergesi | |
| Switch | | |
| Table ★ | Düz tablo | |
| Tabs ★ | | |
| Textarea | | |
| Toast (Base UI, 2026-07) ★ | Base UI Toast: eylem, durum, promise, yığın, kaydırarak kapatma | Base UI tabanı |
| Toggle / Toggle Group | | |
| Tooltip ★ | | |
| Typography | Metin stilleri | ayrıca `typeset` (2026-07): tek CSS ile `.typeset` kapsayıcı tipografisi |

Diğer paketler: `cmdk` 1.1.1 (2025-03; stabil, yavaş geliştirme), `sonner` 2.0.8, `vaul` 1.1.2 (2024-12; stabil), `react-resizable-panels` 4.14.1, `embla-carousel-react` 8.6.0, `input-otp` 1.5.0, `date-fns` 4.4.0.

---

## 3. Bloklar

`apps/v4/registry/new-york-v4/blocks/` içeriği: **dashboard-01**, **login-01…05**, **signup-01…05**, **sidebar-01…16** (+ `_registry.ts`). Haziran 2025 changelog'u ayrıca **"30+ calendar blocks"** (calendar-01… ; aralık, dropdown, preset'li, zaman seçici, rezervasyon "booked" örnekleri) duyurdu; bunlar sitede `/blocks/calendar` altında, CLI'dan `npx shadcn@latest add calendar-NN` ile kurulur (doğrula: numara aralığı siteden alınamadı).

- **Şubat 2026:** "Every block… is now available in both Radix and Base UI variants." CLI projenin tabanını otomatik algılar: `npx shadcn@latest add sidebar-07`.
- **Vite uyumu:** Bloklar `registry:block` tipindedir; bileşen dosyaları `@/components/...` altına, sayfa dosyaları (`registry:page`) Next.js yolu (`app/dashboard/page.tsx`) hedefler. Vite'ta `--path` ile hedef verilir ve sayfa dosyasındaki Next'e özgü importlar (`next/link`, `next/image`) varsa yerel `<a>`/router bileşeniyle değiştirilir (dashboard-01 ve sidebar blokları çoğunlukla saf bileşen kullanır).
- Bu proje için faydalı: **sidebar-07** (ikon daraltmalı), **sidebar-13/16** (diyalog içinde/inset varyantları), **dashboard-01** (KPI kart + interaktif alan grafiği + data table şablonu), login-0x (yerel kullanıcı girişi ekranı).
- Grafik örnekleri (`registry/new-york-v4/charts/`, 77 dosya): area 10, bar 10, line 10, pie 12, radar 15, radial 7, tooltip 14 — `npx shadcn@latest add chart-bar-stacked` gibi tek tek kurulur.

---

## 4. Kullanıcı tarafından ayarlanabilir tema (çalışma anı)

### 4.1 Mekanizma

shadcn bileşenleri değerleri **CSS özel özelliklerinden** okur; Tailwind yardımcıları `var(--primary)` üzerinden çözülür. Bu yüzden derleme gerekmeden şu iki yolla değiştirilebilir:

1. **Satır içi stil (en basit):** `document.documentElement.style.setProperty("--primary", "oklch(0.55 0.2 250)")`. Satır içi stil hem `:root` hem `.dark` kuralını ezer → açık/koyu için ayrı değerler tutulup **mod değiştiğinde yeniden uygulanır**. tweakcn'in `apply-theme.ts` dosyası tam bu yolu izler (`applyThemeToElement(root)` → `.dark` sınıfı, ortak özellikler (radius, font, letter-spacing), moda göre renkler `setProperty`, gölge değişkenleri).
2. **Enjekte `<style id="user-theme">`:** ayarlardan `:root{…}` ve `.dark{…}` metni üretilip eklenir; kaynak sırası sayesinde varsayılanı ezer, mod geçişi otomatik çalışır. shadcn Chart'ın `ChartStyle` bileşeni de aynı tekniği kullanır (`THEMES = { light: "", dark: ".dark" }` ile `<style>` üretir). **Öneri: bu yol** (tek yerden, hem açık hem koyu, yeniden uygulama gerekmez).

Renk formatı: değişken içine **hex de yazılabilir** (`--primary: #1e40af`); `bg-primary/50` gibi opaklık yardımcıları `color-mix()` kullandığından Chromium 111+/Safari 16.4+'ta her formatla çalışır. Renk seçici hex döndürür; isteğe bağlı olarak OKLCH'ye çevirmek için tweakcn'in `color-converter.ts`'i (culori tabanlı) vendorlanabilir. Kontrast kontrolü için `contrast-checker.ts`.

### 4.2 Otel durum renkleri (G-33, Faz 5 "renk ayarları ekranı")

- `--status-paid`, `--status-partial`, `--status-unpaid`, `--status-deposit`, `--status-blocked`, `--status-dayuse`, `--status-parked` gibi **yeni token'lar** §1.5 kalıbıyla tanımlanır (`@theme inline` ile `bg-status-paid` yardımcıları).
- Varsayılanlar `index.css`'te; kullanıcı değerleri `settings` tablosundan okunup `<style id="user-theme">` ile ezilir; "varsayılana dön" = style elemanını boşalt.
- Takvim hücresi `style={{ background: "var(--status-paid)" }}` veya `bg-(--status-paid)` (Tailwind v4 keyfi değişken sözdizimi).
- Grafikler: `ChartConfig` içinde `color: "var(--status-paid)"` → aynı renkler raporlarda otomatik.

### 4.3 Araçlar / kütüphaneler

| Araç | Lisans | Durum | Değerlendirme |
|---|---|---|---|
| **tweakcn** (jnsahaj/tweakcn) | Apache-2.0 | 10.4k ★, 765 commit, aktif (2026) | Web uygulaması (Next.js), npm paketi yok. Değerli olan **kod**: `types/theme.ts` (`ThemeStyleProps`: background…sidebar-ring, font-sans/serif/mono, radius, shadow-*, letter-spacing, spacing; `ThemeStyles = {light, dark}`; `ThemePreset`), `utils/theme-presets.ts` (50+ preset: amber-minimal, bold-tech, caffeine, catppuccin, claude…), `utils/apply-theme.ts`, `utils/theme-style-generator.ts` (CSS export, v3/v4, oklch/hsl/hex), `utils/color-converter.ts`, `utils/contrast-checker.ts`. **Vendorlanıp** (Apache lisans metni ve atıfla) uygulama içi preset listesi + uygulayıcı olarak kullanılabilir. Temalar ayrıca shadcn registry öğesi olarak `npx shadcn@latest add <tema>` ile derleme zamanında kurulabilir (BankkRoll/tweakcn-theme-picker 42+ temayı tek komutla ekler). |
| shadcn-theme-editor (programming-with-ia) | MIT | 199 ★, npm `shadcn-theme-editor` | Uygulama içinde `<ShadcnThemeEditor />` render edilen gerçek bir çalışma anı editörü; HSL odaklı, Tailwind v4 için `@source` gerekir, "geliştirmede yükle" niyetli. Küçük proje; üretimde kullanmak yerine fikir kaynağı. |
| themux (llanesluis/themux) | MIT | 129 ★ | Web aracı; OKLCH/HSL/RGB/HEX çıktı, Tailwind v4. Kod referansı. |
| ui.jln.dev (jln13x) | MIT | 1.3k ★ | 10.000+ tema galerisi (web). |
| ShouryaBatra/shadcn-color-theme-switcher | — | küçük | `[data-theme="x"]` ile çoklu tema deseni (derleme zamanı). |
| shadcn `registry:theme` / `cssVars` | MIT | resmî | `registry-item.json` → `cssVars: { theme, light, dark }`. Derleme zamanı preset'leri için (ör. otelin kurumsal teması `npx shadcn add ./themes/lale.json`). Çalışma anı için değil. |
| shadcn `apply` / presets | MIT | resmî (2026-04) | `npx shadcn@latest apply --preset <kod>` mevcut projeye renk/font/ikon preset'i uygular (geliştirici aracı). |

**Sonuç:** Hazır, üretim kalitesinde "uygulama içi tema editörü" paketi yok; ihtiyaç zaten dar (vurgu rengi + durum renkleri + açık/koyu + radius). **Kendi "Tema Ayarları" sayfası** yazılır: preset kartları (tweakcn JSON'undan seçilmiş ~8 preset), vurgu rengi seçici, durum renkleri seçici, önizleme, varsayılana dön. Renk seçici: yerli `<input type="color">` (Electron/Tauri'de çalışır, sıfır bağımlılık) veya `react-colorful` (MIT, ~3 KB, 2022'den beri stabil).

---

## 5. shadcn'i genişleten topluluk kütüphaneleri (Vite uyumlu)

### 5.1 Genel

| Proje | Lisans | Durum (Ekim 2026) | Kullanım |
|---|---|---|---|
| **satnaing/shadcn-admin** | MIT | 15.5k ★, v2.2.1: Vite 8.0.8, Tailwind 4.2.2, TanStack Router 1.168, **TanStack Table 8.21.3**, Recharts 3.8.1, react-day-picker **9.14.0**, zod 4.3.6, RHF 7.72, @hookform/resolvers 5.2.2, zustand 5, Radix bireysel paketler, lucide 1.8 | En iyi **referans şablon** (Vite + sidebar + Ctrl+K arama + tema + RTL + data table + grafik). Bağımlılık olarak değil, düzen/kalıp kaynağı olarak. Çalışma anı renk seçici **yok** (yalnız açık/koyu). |
| sadmann7/shadcn-table (**tablecn**) | MIT | 6.3k ★ | Gelişmiş filtre (Notion/Airtable/Linear tarzı), sunucu taraflı sayfalama, satır eylem çubuğu, sanallaştırmalı sonsuz kaydırma. **Next.js + nuqs** bağımlı → Vite'a doğrudan kurulmaz; filtre bileşenleri kopyalanarak uyarlanır. |
| Origin UI → **coss ui** (cosscom/coss) | apps/origin ve apps/ui **MIT**, geri kalanı **AGPLv3** | Ekim 2025'te Cal.com satın aldı; Base UI tabanlı yeniden yazılıyor; eski Origin UI bileşenleri "sınırlı destek" | Takvim/tarih/zaman çizelgesi örnekleri için fikir; **lisans dizinine dikkat** (yalnız MIT dizinlerinden kopyala). |
| magicuidesign/magicui | MIT | 22.4k ★ | Pazarlama animasyonları; iş uygulaması için gereksiz. |
| Aceternity | — | — | Gereksiz (landing efektleri). |
| johnpolacek/date-range-picker-for-shadcn | MIT | — | Preset'li (Bugün, Son 7/30 gün, Bu ay…), karşılaştırma modlu aralık seçici; rapor tarih aralığı için uygun kalıp. |
| huybuidac/shadcn-datetime-picker | MIT | — | react-day-picker v9 + date-fns; tarih/saat/aralık, shadcn CLI ile kurulur. |
| BankkRoll/tweakcn-theme-picker | — | — | 42+ tweakcn temasını ve bir seçiciyi tek komutla ekler (derleme zamanı). |

### 5.2 Tape chart / zaman çizelgesi adayları (odalar = satır, günler = sütun, 19 × 3650)

| Kütüphane | Sürüm · tarih | Lisans | Bakım | Uygunluk |
|---|---|---|---|---|
| **planby** | 2.1.0 · 2026-08-23 | **Özel lisans** (ücretsiz çekirdek + PRO) | aktif (1.7k ★) | Sanal görünümlü, hızlı; ama **24 saat ötesi çoklu gün / hafta / ay modları, sürükle-bırak, boyutlandırma PRO** (400 $/geliştirici, tek seferlik). Çekirdek sürüm 10 yıllık tape chart için yetersiz. |
| **react-calendar-timeline** | 0.30.0-beta.19 · 2026-07-24 (stable 0.28.0) | MIT | 2.2k ★, beta'da React 18/19 | Gruplar=satır, öğeler, zoom, drag/resize, özel renderer. Sanallaştırma yok ("3× geniş kanvas"); görünür pencereyi çizer → 19 satırda pratikte çalışır ama yalnız beta'da React 19, API eski (moment→dayjs geçişi), gece gece renk/bölünmüş hücre gibi kurallar için çok özelleştirme gerekir. |
| react-big-schedule | 5.5.1 · 2026-05-16 | MIT | 194 ★, aktif | **Ant Design + dayjs + react-dnd** bağımlı (ağır, shadcn ile iki tasarım sistemi). Gün/hafta/ay/yıl görünümleri, kaynak satırları. "Büyük veri için optimizasyon yol haritasında". |
| @schedule-x/calendar | 4.9.1 · 2026-09-29 | MIT (çekirdek) | 2.6k ★ | Kaynak zamanlayıcı ("resource scheduler") **premium**: 479 €/yıl veya 999 € ömür boyu, **proje başına**. Çekirdek yalnız gün/hafta/ay takvimi. |
| @fullcalendar/resource-timeline | 6.1.21 (core 7.1.0) | **Premium**: ticari 480 $/geliştirici; alternatif GPLv3 veya CC-BY-NC-ND | aktif | Kapalı kaynak ticari ürün için ticari lisans şart. Gereksiz maliyet. |
| dhtmlx-scheduler | 7.2.15 · 2026-08-17 | GPL-2.0 (standart) / ticari PRO | aktif | Timeline görünümü PRO'da; GPL kapalı ürünle uyumsuz. **Atla.** |
| Bryntum Scheduler | — | ticari (800–1000 $/dev) | — | **Atla.** |
| @syncfusion/ej2-react-schedule | 35.1.37 · 2026-09-29 | ticari; **Community License** (<1 M$ gelir, ≤5 geliştirici, ≤10 çalışan, <3 M$ dış yatırım) | aktif | Timeline görünümü var; ama kendi tema sistemi, çok ağır paket, lisans koşulu ürünü satın alan otele değil **geliştiriciye** bağlı. Atla. |
| @mui/x-scheduler | 9.0.0-beta.12 · 2026-09-17 | MIT (community) | beta | Community'de takvim görünümleri + kaynaklar + DnD; **yatay "Event Timeline" Premium**. MUI tasarım sistemi. Atla. |
| @daypilot/daypilot-lite-react | 5.10.1 · 2026-08-25 | **Apache-2.0** | aktif | Lite sürümde **Scheduler** (kaynak satırları + yatay zaman çizelgesi, drag/resize, özel zaman ölçeği, progressive rendering, yerelleştirme) var — açık kaynaklı en yakın hazır çözüm. Riskler: kendi CSS/tema sistemi (shadcn token'larıyla eşlemek gerekir), DOM tabanlı; 3650 gün tek seferde değil **aylık pencere** ile beslenmeli (doğrula: Lite'ta sonsuz kaydırma yok). |
| @bitnoi.se/react-scheduler | 0.3.1 · 2024-08-23 | MIT | **bakımsız** (2 yıl) | Canvas tabanlı, hızlı; Firefox'ta yavaş; API dar. Atla. |
| @svar-ui/react-gantt | 2.7.3 · 2026-09-09 | MIT (GitHub GPLv3 notu var — doğrula) | 212 ★ | Hiyerarşik Gantt (bağımlılıklar, özet görevler); sanallaştırmalı, React 19. "Kaynak × gün" matrisi için uygun değil. |
| @jaeungkim/gantt-chart | 1.5.1 · 2026-09-09 | MIT | 19 ★ | Satır + zaman hücresi sanallaştırması, gün…yıl ölçekleri, klavye, CSS değişkenli tema, <40 KB. Küçük topluluk; Gantt odaklı. |
| vis-timeline | 8.5.4 · 2026-08-12 | Apache-2.0 / MIT | topluluk | Vanilla JS, gruplar=satır; sarmalayıcı gerekir; stil uyarlaması zor. |

**Değerlendirme ve öneri:** Gereksinimler (G-30…G-45: gece gece ayrı renk, aynı gün iki misafir için bölünmüş hücre, sabit sol iki sütun, özel gün rozetleri, tıklanınca Sheet, klavye gezinme, rol kuralları, kullanıcı renkleri) hazır zamanlayıcıların "etkinlik çubuğu" modeline tam oturmuyor; her biri CSS/DOM'u ezerek uyarlanır ve shadcn tasarım sistemiyle ikilik yaratır. 19 satır ekrana sığdığı için **yalnızca sütun (gün) sanallaştırması** gerekir — bu basit bir problem:

- `@tanstack/react-virtual` ile `useVirtualizer({ horizontal: true, count: 3650, estimateSize: () => CELL_W, overscan: 10 })`; satırlar düz `map`.
- Rezervasyonlar, görünür gün penceresine kesişenler filtrelenip `left = (startIdx - firstVisible) * CELL_W`, `width = nights * CELL_W` ile **mutlak konumlu blok** olarak çizilir; her gece ayrı `<span>` ile renklendirilir (gece gece ödeme).
- Veri: SQLite'tan görünür aralık ± 2 ay sorgulanır (`start < windowEnd AND end > windowStart`), bellekte `Map<roomId, Reservation[]>`.
- Sürükleme: `pointer events` (yeterli) veya `@atlaskit/pragmatic-drag-and-drop` 4.0.0 (Apache-2.0, çerçeve bağımsız, hafif) / `@dnd-kit/core` 6.3.1 (MIT, 2024'ten beri stabil; yeni nesil `@dnd-kit/react` 0.5.0 henüz 0.x).
- Sticky üst satır ve sol sütunlar `position: sticky`; "bugün" sütunu `scrollToIndex`.
- Beklenen DOM: ~19 × 45 görünür hücre ≈ 900 hücre + bloklar → 60 fps hedefi (Faz 5 kabul ölçütü) rahatlıkla.

Eğer "hazır" istenirse ikinci seçenek **DayPilot Lite (Apache-2.0)** Scheduler'ın aylık pencereyle beslenmesi; ama tema/DOM uyarlama maliyeti özel ızgaradan az olmayacaktır.

---

## 6. Sanallaştırma kütüphaneleri (2D ızgara)

| Paket | Sürüm · tarih | Lisans | React peer | 2D (satır+sütun) | Notlar |
|---|---|---|---|---|---|
| **@tanstack/react-virtual** | 3.14.13 · 2026-09-14 (`virtual-core` 3.17.11) | MIT | 16.8–19 | **Evet**: iki `useVirtualizer` (biri `horizontal: true`), hücreler `translate3d(x,y)` ile mutlak konumlu | Headless, en esnek; dinamik ölçüm (`measureElement`), `scrollToIndex`, kayan kutu sahipliği sizde. Haftalık indirme ~17 M (PkgPulse, 2026). **Tape chart için öneri.** |
| react-window | 2.3.3 · 2026-09-22 (v2 → 2025-08-28) | MIT | **18–19** | **Evet** (`Grid`): `rowComponent/cellComponent`, `cellProps`, `useGridRef`; **hücre boyutları önceden bilinmeli** (fonksiyonla değişken, ama dinamik ölçüm yok) | Sabit hücreli tape chart için yeterli ve en küçük (~4.4 KB gz). API v1'den tamamen farklı (eski eğitimler geçersiz). |
| react-virtuoso | 4.18.16 · 2026-09-29 | MIT | ≥16 | **Hayır** (VirtuosoGrid akış ızgarası; TableVirtuoso yalnız satır) | Data table'lar (sticky başlık, gruplar, sonsuz kaydırma) için en zengin; tape chart için uygun değil. |

**Karar:** Tape chart = `@tanstack/react-virtual` (yalnız yatay; gerekirse dikey eklenir). Büyük misafir/defter listeleri = TanStack Table + `@tanstack/react-virtual` satır sanallaştırması (shadcn data-table ile aynı headless felsefe), alternatif `react-virtuoso` `TableVirtuoso`.

---

## 7. Grafikler

- **Recharts 3.10.1** (MIT; 3.0.0 → 2025-06-23; 3.10.1 → 2026-07-25; `main` 3.11.0-canary). Peer: React 16.8–19. Bağımlılıklar: `@reduxjs/toolkit`, `redux`, `immer`, `victory-vendor` (d3 ölçekleri), `decimal.js-light`, `eventemitter3`, `clsx`; **lodash yok**. 3.x: dahili state kaldırıldı, `accessibilityLayer` varsayılan açık, klavye ok gezinmesi, Tooltip/Legend portal, `YAxis width="auto"`, 3.9 animasyon sistemi, 3.10 `Legend position/offset`, `XAxis height="auto"`.
- **shadcn Chart** `recharts` v3 kullanır (`chart.mdx`: "now uses Recharts v3"; CSS değişkenine `var(--chart-1)` olarak, `hsl(var(--chart-1))` değil). `ChartContainer` + `ChartConfig` (`label`, `icon`, `color` veya `theme: {light, dark}`) → `--color-<key>` değişkenleri; `ChartTooltipContent` (`hideLabel`, `hideIndicator`, `labelKey`, `nameKey`, `indicator: dot|line|dashed`), `ChartLegendContent`.
- **KPI uygunluğu (Faz 10):**
  - Doluluk % (ay bazında): `chart-bar-default` / `chart-area-interactive`; tek değer için `chart-radial-text` (halka içinde %).
  - Ödeme yöntemine göre gelir: `chart-pie-donut-text` veya `chart-bar-stacked` (ay × yöntem).
  - Aylık karşılaştırma (bu yıl / geçen yıl): `chart-bar-multiple` (gruplu) + `chart-line-multiple` (kümülatif).
  - Haftanın günü × ay doluluk **ısı haritası**: Recharts'ta yerli heatmap **yok** → CSS grid + `color-mix()`/OKLCH ölçeği (dataviz becerisindeki sıralı palet) ile elle çizilir.
  - KPI kutuları: `Card` + `Item` + küçük `Badge` (değişim oku); sparkline için `LineChart` (eksenleri gizli).
- Türkçe biçim: `Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })` tooltip `formatter`'ında; tarih ekseni `date-fns/locale/tr`.
- Yazdırma/PDF: Recharts SVG olduğu için `@media print` ile sorunsuz; `ResponsiveContainer` yerine yazdırma için sabit boyut ver.
- Alternatif gerekmiyor (ECharts/Chart.js ek ağırlık). Grafik sayısı/karmaşıklığı artarsa `visx` düşünülebilir.

---

## 8. Electron / Tauri içinde shadcn: tuzaklar ve kurallar

### 8.1 Tarayıcı motoru sınırı (en kritik madde, G-04 ile çelişir)
- **Tailwind v4** modern CSS'e dayanır: `@property`, `color-mix()`, OKLCH, `@layer`, kayıt'lı özel özellikler → **Chrome 111+, Safari 16.4+, Firefox 128+** (Tailwind uyumluluk sayfası; tailwindcss#15356/#15284: eski Safari için transpile yok, `@layer` desteklenmeyince tüm stil kaybolur).
- **Electron 44.5.1** (Chromium ~146): **macOS 13 Ventura+**, **Windows 10+** (yalnız x64/arm64; 32-bit yok). Node ≥ 22.12. macOS 12 desteği gerekirse daha eski Electron satırına sabitlenir (Chromium'un macOS 12'yi bıraktığı sürüm öncesi; doğrula: electronjs.org/docs/latest/tutorial/support). Avantaj: motor **her makinede aynı**.
- **Tauri 2.12.1**: macOS'ta WKWebView = işletim sisteminin WebKit'i. Safari 16.4 ↔ **macOS 13.3**; tauri#14219 (2025-09-26, açık): macOS 11.7.10'da Tailwind 4.1.13 stilleri hiç uygulanmıyor. `tauri.conf.json` → `bundle.macOS.minimumSystemVersion` varsayılanı **10.13** yanıltıcı; **"13.0"** yapılmalı. Windows'ta WebView2 (Chromium, evergreen) — Windows 10/11'de hazır ama **çevrimdışı kurulum için** `webviewInstallMode`: `offlineInstaller` (+~127 MB) veya `fixedRuntime` (+~180 MB); varsayılan `downloadBootstrapper` internet ister (G-01 ile çelişir).
- **Sonuç:** Her iki yolda da pratik taban **macOS 13+ / Windows 10+**. Ürün sahibi daha eski Mac kullanıyorsa ya Electron sürümü geri sabitlenir ya da Tailwind v4 yerine v3 (shadcn `legacy` belgeleri) gerekir — planda açık karar maddesi olmalı.

### 8.2 Portal / popover / diyalog davranışları
- Radix ve Base UI içerikleri `document.body`'ye portal eder; Electron'da sorun yok. Tauri+macOS'ta shadcn#7433 (2025-05, "not planned" kapatıldı): dropdown içeriği görünmüyor; geçici çözüm içerik etrafına sarmalayıcı `div` / `forwardRef`. Tauri seçilirse ilk sprintte DropdownMenu/Select/Popover/Tooltip/Dialog/Sheet/Combobox için **duman testi** macOS 13/14/15 + Windows 10/11'de yapılmalı.
- Radix: Dialog'u DropdownMenu öğesinden açınca `body { pointer-events: none }` takılı kalır (radix#1241, #3317; shadcn tartışma #6908) → dropdown'a `modal={false}` veya önce menüyü kapatıp sonra diyalog aç. Dialog içindeki Select listesi kaydırılmıyor (shadcn#7973) — `SelectContent` için `position="popper"` ve `max-h` kontrolü.
- Scroll lock (`react-remove-scroll`): modal açılınca `body` `overflow:hidden` + sağ `padding`; Windows'ta kaydırma çubuğu overlay olmadığı için düzen zıplar → `html { scrollbar-gutter: stable }` ve ana düzeni `h-screen` + iç `ScrollArea` ile kurmak (gövde kaydırmasız masaüstü düzeni) sorunu kökten çözer.
- Çoklu pencere/ikinci ekran (ör. "misafire göster" modu) yoksa `window.open` konusu yok.

### 8.3 Çevrimdışı paketleme
- **Font:** Google Fonts `<link>` yok. `@fontsource-variable/inter` 5.3.0 (OFL-1.1) → `@import "@fontsource-variable/inter";` + `--font-sans: "Inter Variable", system-ui`. Inter Latin‑Extended alt kümesi Türkçe (İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü) içerir. shadcn'in `registry:font` tipi Next dışı projelerde zaten fontsource'a düşer. Alternatif: Geist (`@fontsource-variable/geist`).
- **İkon:** `lucide-react` tree-shake ile paketlenir; ağ yok.
- **CSP:** Radix/Base UI (`style` özniteliği), Recharts (inline `style`) ve shadcn `ChartStyle` (`<style>` enjekte) nedeniyle `style-src 'self' 'unsafe-inline'`; `script-src 'self'`; `connect-src` yalnız izin verilen döviz/hava alanları (Faz 11). `img-src 'self' data: blob:`.
- **Electron:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, preload ile IPC; `vite.config` `base: "./"` (file:// yüklemede mutlak `/assets` yolları beyaz ekran verir) veya özel `app://` protokolü; `electron-vite` 5.0.0 (MIT) + `electron-builder` 26.15.3 (NSIS `setup.exe`, macOS `.dmg`/`.app`) veya `@electron-forge/cli` 8.0.1. shadcn'in kendi `shadcn/shadcn-electron-app` deposu (160 ★) **eski** (Tailwind v3, `tailwindcss-animate`) — yalnız fikir.
- **Tauri:** `@tauri-apps/cli` 2.12.1 (Apache-2.0/MIT); NSIS `setup.exe` + WebView2 offline installer; macOS `.app`/`.dmg`; `data-tauri-drag-region` özel başlık çubuğu (tauri#11605 odaksız pencerede sürükleme hatası).
- `shadcn add/init` yalnız geliştirme zamanında ağ ister; derleme ve çalışma tamamen yerel. `shadcn/tailwind.css` npm bağımlılığı `eject` ile inline edilir (G-07: bağımlılık yüzeyi küçülür).

### 8.4 Sürüm tuzakları
- **react-day-picker:** 10.0.2 (2026-09-30; v10 → 2026-05-08, paket adı `@daypicker/react` de var) shadcn Calendar'ı **kırar** (shadcn#10914, 2026-06-10 açık: `classNames.table` tipi yok; `fromDate/toDate/initialFocus` kaldırıldı). shadcn `apps/v4` hâlâ `react-day-picker ^9.7.0`; shadcn-admin 9.14.0. → **`react-day-picker@9.14.0` sabitle**, `locale={tr}` (`react-day-picker/locale`).
- **TanStack Table:** shadcn belgeleri **v9** (`useTable`, `tableFeatures()`, `createColumnHelper`; 9.0.0 → 2026-08-04, güncel 9.2.4). Topluluk örnekleri (shadcn-admin, tablecn) v8 (`useReactTable`). Yeni projede v9'u seç; v8 örneklerini birebir kopyalama.
- **zod:** shadcn `apps/v4` hâlâ `zod ^3.25`; güncel 4.6.5; `@hookform/resolvers` 5.9.1 zod 4'ü destekler. Projede zod 4 kullan.
- **cn:** Eylül 2026'dan beri bileşenler `import { cn } from "cn"`; `lib/utils.ts` = `export { cn } from "cn"`.
- **Form:** shadcn `forms/` belgeleri `react-hook-form.mdx`, `tanstack-form.mdx`, `formisch.mdx`; `Field` bileşeni ikisiyle de çalışır. RHF 7.89.0 (MIT) + zod 4 + `@hookform/resolvers` 5.9.1 — en yaygın yol.
- **Klavye:** Sidebar Ctrl/Cmd+B, Command Ctrl+K; Electron menü hızlandırıcılarıyla çakışmasın (Ctrl+B'yi menüde kullanma).

---

## 9. Önerilen paket listesi (Ekim 2026, hepsi npm'de doğrulandı)

| Katman | Paket | Sürüm | Lisans |
|---|---|---|---|
| Çatı | `react`, `react-dom` | 19.3.0 | MIT |
| Derleme | `vite` | 8.3.2 | MIT |
| | `@vitejs/plugin-react` | (vite 8 uyumlu güncel) | MIT |
| CSS | `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | MIT |
| | `tw-animate-css` | 1.4.0 | MIT |
| | `cn` | 0.2.4 | MIT |
| | `class-variance-authority` | 0.7.1 | Apache-2.0 |
| shadcn | `shadcn` (devDependency, CLI) | 4.21.1 | MIT |
| Primitive | `@base-ui/react` (**veya** `radix-ui` 1.6.7) | 1.8.0 | MIT |
| İkon | `lucide-react` | 1.49.0 | ISC |
| Font | `@fontsource-variable/inter` | 5.3.0 | OFL-1.1 |
| Takvim | `react-day-picker` (**sabit**) | 9.14.0 | MIT |
| Tarih | `date-fns` | 4.4.0 | MIT |
| Tablo | `@tanstack/react-table` | 9.2.4 | MIT |
| Sanallaştırma | `@tanstack/react-virtual` | 3.14.13 | MIT |
| Grafik | `recharts` | 3.10.1 | MIT |
| Form | `react-hook-form` / `@hookform/resolvers` / `zod` | 7.89.0 / 5.9.1 / 4.6.5 | MIT |
| Komut paleti | `cmdk` | 1.1.1 | MIT |
| Toast | Base UI Toast (dahil) **veya** `sonner` | 2.0.8 | MIT |
| Paneller | `react-resizable-panels` | 4.14.1 | MIT |
| Drawer (ops.) | `vaul` | 1.1.2 | MIT |
| Sürükleme (ops.) | `@atlaskit/pragmatic-drag-and-drop` **veya** `@dnd-kit/core` | 4.0.0 / 6.3.1 | Apache-2.0 / MIT |
| Yönlendirme | `@tanstack/react-router` | 1.170.41 | MIT |
| i18n | `i18next` / `react-i18next` | 26.4.2 / 17.0.15 | MIT |
| Masaüstü (A) | `electron` / `electron-vite` / `electron-builder` | 44.5.1 / 5.0.0 / 26.15.3 | MIT |
| Masaüstü (B) | `@tauri-apps/cli` / `@tauri-apps/api` | 2.12.1 / 2.12.1 | Apache-2.0 OR MIT |
| Tema preset'leri | tweakcn `theme-presets.ts` + `apply-theme.ts` (vendor) | main (2026) | Apache-2.0 (atıf) |

**Kullanılmayacaklar:** FullCalendar Premium, Schedule‑X Premium, Planby, DHTMLX, Bryntum, Syncfusion, MUI X, react-big-schedule, react-calendar-timeline, Magic UI, Aceternity, `react-window` (ihtiyaç yok), `react-day-picker` 10, `next-themes` (Next'e özgü; Vite ThemeProvider yeterli).

---

## 10. Kaynaklar

shadcn (GitHub `shadcn-ui/ui`, `main`, 2026-10-01): `packages/shadcn/package.json`; `apps/v4/package.json`; `apps/v4/content/docs/installation/vite.mdx`; `(root)/theming.mdx`, `(root)/components-json.mdx`, `(root)/cli.mdx`; `dark-mode/vite.mdx`; `components/{radix,base}/*.mdx` (calendar, chart, combobox, data-table, date-picker, sidebar); `registry/namespace.mdx`, `registry/registry-item-json.mdx`; `changelog/*.mdx` (2025-02-tailwind-v4, 2025-06-calendar, 2025-10-new-components, 2025-12-shadcn-create, 2026-01-base-ui, 2026-02-blocks, 2026-02-radix-ui, 2026-03-cli-v4, 2026-04-shadcn-apply, 2026-05-shadcn-eject, 2026-06-chat-components, 2026-07-base-ui-default, 2026-07-helpers, 2026-07-toast, 2026-07-typeset, 2026-09-cn); `apps/v4/registry/{styles,base-colors.ts,new-york-v4/{blocks,charts,ui/calendar.tsx,ui/chart.tsx}}`; issues #7433, #10914; discussions #6908.
npm registry (`npm view`, 2026-10-01): tüm sürüm/tarih/lisans değerleri.
tweakcn: `jnsahaj/tweakcn` README, `types/theme.ts`, `utils/{apply-theme,theme-style-generator}.ts`.
Diğer depolar: satnaing/shadcn-admin (`package.json` v2.2.1), sadmann7/shadcn-table, cosscom/coss (eski origin-space/originui), magicuidesign/magicui, karolkozer/planby, namespace-ee/react-calendar-timeline, react-scheduler/react-big-schedule, schedule-x/schedule-x, svar-widgets/react-gantt, jaeungkim/gantt-chart, Bitnoise/react-scheduler, DayPilotCode/daypilot-react-scheduler-open-source, bvaughn/react-window README, recharts/recharts (`package.json`, v3.0.0 notları), programming-with-ia/shadcn-theme-editor, llanesluis/themux, jln13x/ui.jln.dev, tauri-apps/tauri#14219, radix-ui/primitives#1241/#3317.
Web araması: Tailwind v4 tarayıcı desteği (tailwindlabs/tailwindcss#15356, #15284), Electron 44 platform desteği, Tauri WebView2 kurulum modları, FullCalendar/Schedule‑X/Planby/Syncfusion/MUI X lisans ve fiyatları, Origin UI → coss.com (Ekim 2025).
