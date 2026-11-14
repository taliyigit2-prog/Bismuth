# 12 — 21st.dev tasarım seçimi (sahip yönergesi B.3, K-60)

> Hazırlayan: Fable (2026-11-13). Sahip: "Ücretli üyeliğim var, kullanalım… 'Apps' sekmesi geldi… en uygun olana karar
> versin, direkt alsın." Seçimi Fable yaptı; **uygulama Opus'ta** (ilgili paket kartları `08-gelistirme-plani.md` §9).
> Tarama: 21st MCP `search` (14 sorgu, ~120 sonuç), bileşen sayfalarından lisans alanı, `community/apps` dizini.

## 1. Bağlantı durumu (doğrulandı 2026-11-13)

| Adım | Durum |
|---|---|
| Codespaces secret `API_KEY_21ST` | Tanımlı (`echo ${API_KEY_21ST:+var}` → `var`) |
| `.mcp.json` | `type: http`, `https://21st.dev/api/mcp`, başlık `x-api-key: ${API_KEY_21ST}` (resmî README ile aynı) |
| `.claude/settings.json` | `"enabledMcpjsonServers": ["21st"]` eklendi — başlatıcı (Agent SDK) proje sunucusunu onay sormadan açar |
| Bağlantı denemesi | `get_usage` → `tier: "paid"`, `aiGenerationEnabled: false`, kredi 0 (1 Aralık'ta yenilenir). Yani **arama ve kod alma sınırsız**, barındırılan "AI üretimi" kapalı; bileşen kodu alınır, uyarlamayı ajan yapar |
| `search`, `get_component` | Çalıştı (örnek: `get_component(28289)` tam kod + demo + registry bağımlılıkları döndü) |

**Sahip için anahtar adımları (zaten yapıldı; yeni Codespace'te tekrar gerekirse):** GitHub → profil fotoğrafı → Settings →
Codespaces → Secrets → *New secret*: ad `API_KEY_21ST`, değer 21st.dev → Settings → API Keys'ten kopyalanan anahtar,
"Repository access" → Bismuth. Çalışan Codespace'i durdurup başlatın (secret yalnız yeniden başlatınca ortam değişkeni
olur). Anahtar depoya **girmez**; `.mcp.json` yalnız `${API_KEY_21ST}` başvurusu taşır.

## 2. "Apps" sekmesi ne?

`21st.dev/community/apps` bir **açık kaynak uygulama dizini** (138 giriş: Immich, Dub, Twenty CRM, Atomic CRM, Plane, Kan,
Excalidraw…). Bileşen kodu değil; her uygulama kendi deposuna ve kendi lisansına bağlı (ör. Atomic CRM MIT; Twenty ve
Plane AGPL-3.0). Satın alma yok; "Copy command" uygulamanın kendi kurulum komutudur. **Bismuth için anlamı:** ekran
kalıplarına bakılacak referans; kod kopyalanmaz (AGPL olanlardan hiç; MIT olanlardan bile şu an gerek yok). Otel
yönetimine özgü bir uygulama dizinde yok. Referans olarak işe yarayanlar: **Atomic CRM** (kişi/firma kartı, etkinlik
geçmişi → Misafirler/Firmalar düzeni), **Kan** (pano → kat hizmetleri fikri), **Plane** (görev listesi/filtre → Görevler).

## 3. Seçim ölçütleri

1. Lisans alanı **MIT** (sayfada "License: mit"); "no-license" olanlar **alınmaz**.
2. Taban: shadcn/Radix + Tailwind; **Base UI / HeroUI / framer-motion** zorunlu bağımlılık ise alınmaz ya da yalnız kalıp.
3. Yeni npm bağımlılığı yok ya da tek, sabitlenmiş ve `docs/plan/bagimliliklar.md`'ye yazılmış (yasak 4).
4. Paket içi kaynak: CDN/font/görsel URL yok; `"use client"` ve `console.log` temizlenir.
5. Metin `t('...')`, renk CSS değişkeni (`--chart-*`, `--status-*`), mantıksal CSS (`start/end`), 44 px dokunma hedefi,
   klavye erişimi; düşük güçlü PC'de animasyon yalnız `prefers-reduced-motion`'a saygılı CSS geçişi.
6. Mevcut ekranın gerçek bir sorununu çözmeli (05/02 raporları); süs için alınmaz.

## 4. Seçilenler (kod alınır ve uyarlanır)

Hepsi **Layro System** (`@uvain`, MIT, "light and dark", erişilebilirlik odaklı) — tek yazar, tutarlı dil.

| # | Bileşen (id) | Lisans / bağımlılık | Nereye | Paket | Uyarlama |
|---|---|---|---|---|---|
| A1 | **Charts & KPI Cards** — `uvain/revenue-charts-kpi` (33507) | MIT; `recharts` + `lucide-react` (ikisi de projede var) | Raporlar üst şeridi (gelir/doluluk/ADR KPI kartları, "yukarı iyi mi" işareti), Bugün ekranı özet kartları, **Portföy** (iki otel) | P18b (raporlar + bugün), P21c (portföy) | `--chart-1…5` değişkenleri mevcut `chart.tsx` ile; para `Intl.NumberFormat` + `ui.showMinor`; gizli veri tablosu (ekran okuyucu) **korunur**; metinler `reports.kpi.*` |
| A2 | **Data Table** — `uvain/data-table-bulk-actions` (33506) | MIT; `@tanstack/react-table` (yeni), Radix checkbox/dropdown/label/slot | Misafirler, Defter, Firmalar, Personel listeleri: sıralama (`aria-sort`), arama, satır seçimi + **toplu işlem çubuğu**, sütun menüsü, "aramayı temizle" boş durumu | P18b (liste kalıbı), P17c (toplu seçim çubuğu takvimde aynı dil) | **Karar:** `@tanstack/react-table` eklenmez; kalıp mevcut `components/ui/table` + `useMemo` sıralama üzerine taşınır (kod ~%60 aynı). Opus iki yerde tekrar görürse bağımlılığı sabitleyerek ekleyebilir (`bagimliliklar.md`) |
| A3 | **Command Menu** — `uvain/command-menu-palette` (33510) | MIT; `cmdk` (projede var) | Ctrl+K hızlı arama: gruplu sonuçlar (misafir / oda / işlem / sayfa), satır ipuçları, kısayol rozetleri, `⌘K/Ctrl K` kaydeden hook | P17c (hızlı takvim işlemleri: "Giriş yap", "Ödeme al" komut olarak) | Mevcut `command.tsx` + `shortcuts/registry.ts` ile birleşir; komut listesi yetkiye göre süzülür (`ctx`) |
| A4 | **Notification Panel** — `uvain/notification-panel` (27135) | MIT; `lucide-react` + `framer-motion` | Bildirim merkezi: güne göre gruplama, türe göre süzme, **"görüldü" ile "halledildi" ayrımı** (kamera alarmı için tam ihtiyaç) | P20b (alarm listesi) + mevcut bildirimler | `framer-motion` **eklenmez**: giriş/çıkış animasyonu CSS `transition` + `data-state`; Esc kapatma, odak tuzağı Radix `Popover` ile |
| A5 | **Combobox (multi, create)** — `uvain/combobox-multi-create` (34820) | MIT; `cmdk` | Rezervasyonda misafir seçici (yazarken yeni misafir oluştur → mükerrer kart sorununu çözer, 04 §3), grup rezervasyonunda çoklu oda seçimi, kanal/firma seçici | P17b (grup oda seçimi), P21e (mükerrer kart) | Çoklu seçim rozetleri 44 px; "oluştur" satırı `t('guests.createInline')` |
| A6 | **Gantt Chart** — `klyv-ui/gantt-chart` (38523) | MIT; bağımlılık yok | **Yalnız kalıp**: bugün işareti, gün/hafta/ay yakınlaştırma, şerit gruplama. Takvim ızgarası sanallaştırılmış kendi kodumuz kalır | P17c (bugün şeridi), P18b #3 (gün sütunu genişliği/zoom) | Kod alınmaz; `get_component` ile okunup yaklaşım taşınır |

Alınan her kod için `THIRD_PARTY_NOTICES.md`'ye satır: "<bileşen> — © <yazar> (21st.dev/@uvain), MIT" (`npm run notices`
elle bölüm; 21st şartları §3.1 yazar kredisi ister).

## 5. Bakılıp **alınmayanlar** (gerekçe)

| Bileşen | Neden |
|---|---|
| `abui/timeline` (28289) Gantt tarzı saatli zaman çizelgesi | **"License: no-license"**; ayrıca `@dnd-kit/core` + `tunnel-rat` yeni bağımlılık, `console.log` bırakılmış. Saatlik konaklama çubukları (P17d) için fikir (sürükle hayaleti, fare saat göstergesi) kendi kodumuzda yazılır |
| `felipemenezes098/settings-2` Ayarlar kenar menüsü | "no-license" |
| `wensity/sidebar` | `@base-ui/react` + `framer-motion` + Tabler ikonları: taban uyuşmuyor; mevcut shadcn `sidebar.tsx` yeter (P18b #5 daraltılabilir gruplar kendi kodla) |
| `ruixen.ui/*`, `uiable/*`, `cnippet-dev/*` (Base UI), `hero_ui/*` | framer-motion / Base UI / HeroUI tabanı |
| `kedhareswer/open-slot-booking`, `cnippet-dev/v-calendar-15` ve diğer "booking calendar"lar | Randevu/tarih seçici; otel ızgarası değil. Telefon tarih seçici taşması (H-04) için mevcut `react-day-picker` düzeltmesi yeter |
| `uvain/kanban-board` (26936) | MIT ama kat hizmetleri panosu bugün istenmedi; **isteğe bağlı** (P21e sonrası, sahip isterse "Oda durumu panosu") |
| `shadcnstore/app-1`, `uniquesonu/dashboard-overview` | Lisans alanı kontrol edilmedi / genel SaaS şablonu; Bismuth'un 30 ekranı zaten var |
| Temalar (`type: theme`) | Arama boş döndü; mevcut tema (`docs/gelistirici/tasarim.md`) korunur |

## 6. Opus için alım ve uyarlama adımları (her bileşen için)

1. `mcp__21st__get_component(id)` → `componentCode`, `demoCode`, `registryDependencies`, `npmDependencies`. (Alternatif:
   `npx shadcn@latest add "https://21st.dev/r/<yazar>/<slug>?api_key=$API_KEY_21ST"` — yalnız geliştirme aracı; dosyalar
   `components/ui/` altına iner; `deps-guard` yeni bağımlılıkta uyarır.)
2. Lisans ve bağımlılık kontrolü (§3); `npmDependencies`'ten projede olmayan varsa **kalıp** moduna geç ya da sabitleyip
   `bagimliliklar.md` + `THIRD_PARTY_NOTICES` güncelle.
3. Dönüşüm: `"use client"` ve `console.*` sil; metinler `npm run i18n:add -- <spec.json>` ile üç dile; renkler CSS
   değişkeni; `left/right` → `start/end`; `framer-motion` → CSS; ikonlar `lucide-react`; inline style yalnız konum/boyut.
4. Hedef ekrana yerleştir, vitest + (akışsa) e2e; `ui-reviewer` + `turkish-ui-copy` + `screen-auditor` (1280×720 ve 390×844).
5. Commit mesajında kaynak: `feat(reports): KPI cards (adapted from 21st.dev uvain/revenue-charts-kpi, MIT)`.

## 7. Plan bağlantısı

`08-gelistirme-plani.md` §9 tablosu; paket kartlarına "21st: A1…A6" notu. Görsel yenileme ayrı bir faz değildir: Faz 17
(A3, A5, A6) ve Faz 18 (A1, A2) paketlerinin içinde yapılır; A4 Faz 20'de; A1 ikinci kez Faz 21 portföyde.
