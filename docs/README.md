# Bismuth belgeleri — hangi belge kimin için?

Belgeler okuyucuya göre dört klasördedir. Aradığınızı bilmiyorsanız tablodaki ilk satırdan başlayın.

| Kimseniz | Klasör | İlk okunacak |
|---|---|---|
| **Otel çalışanı / otel sahibi** (programı kuran, kullanan) | [`otel/`](otel/) | [`otel/kurulum-rehberi-basit.md`](otel/kurulum-rehberi-basit.md) |
| **Sahip** (planı, kararları, ekran onaylarını izleyen) | [`plan/`](plan/) | [`plan/fazlar/DURUM.md`](plan/fazlar/DURUM.md) |
| **Geliştirici** (kodu derleyen, değiştiren) | [`gelistirici/`](gelistirici/) | [`gelistirici/README.md`](gelistirici/README.md) |
| **Yapay zekâ ajanı** (Antigravity/Gemini, Claude) | kök `AGENTS.md` + `CLAUDE.md` | [`../AGENTS.md`](../AGENTS.md), sonra [`../CLAUDE.md`](../CLAUDE.md) |

## `otel/` — programı kullananlar için

Teknik bilgi gerekmez. Programın içindeki **Ayarlar → Kılavuz** ile aynı içeriktir.

| Belge | Ne anlatır |
|---|---|
| [`kurulum-rehberi-basit.md`](otel/kurulum-rehberi-basit.md) | Tek sayfa: indir, kur, ilk açılış |
| [`kurulum.md`](otel/kurulum.md) | Ayrıntılı kurulum, Windows/Mac uyarıları, kamera eki, kaldırma |
| [`kullanim-kilavuzu.md`](otel/kullanim-kilavuzu.md) | Bütün ekranlar, adım adım (programdaki kılavuzdan üretilir; elle düzenlenmez) |
| [`yedek-ve-tasima.md`](otel/yedek-ve-tasima.md) | Yedek nereye alınır, yeni bilgisayara nasıl taşınır |
| [`uzaktan-erisim.md`](otel/uzaktan-erisim.md) | Evden ve telefondan bağlanma (NetBird) |
| [`surum-notlari/`](surum-notlari/) | Her sürümde ne değişti |

## `plan/` — ne yapılacak, neden

| Belge | Ne anlatır |
|---|---|
| [`plan/README.md`](plan/README.md) | Planın haritası |
| [`plan/01-gereksinimler.md`](plan/01-gereksinimler.md) | Gereksinimler (G-xx); yalnız sahip isteğiyle değişir |
| [`plan/03-mimari.md`](plan/03-mimari.md) | Mimari ve veri modeli |
| [`plan/05-sorular.md`](plan/05-sorular.md) · [`plan/06-kararlar.md`](plan/06-kararlar.md) | Sahibe sorulanlar (S-xx) ve kararlar (K-xx, "Sahip cevapları") |
| [`plan/akislar.md`](plan/akislar.md) | Otelin günlük iş akışı |
| [`plan/fazlar/`](plan/fazlar/) | Her fazın kapsamı ve "Sonuç"u; `DURUM.md` özet, `YURUTME.md` dalgalar ve günlük |
| [`plan/taslak-onay/`](plan/taslak-onay/) | Sahibin ekran onay kayıtları |
| [`plan/04-arastirma/`](plan/04-arastirma/) | Faz 0 araştırmaları (kaynaklı) |
| [`plan/bagimliliklar.md`](plan/bagimliliklar.md) | Her bağımlılığın gerekçesi ve sabit sürümü |

## `analiz/` — 2026-11 analizi ve geliştirme planı

Numaralı raporlar (`00-ozet.md` özet, `08-gelistirme-plani.md` plan). [`analiz/ekler/`](analiz/ekler/) kontrol ajanlarının
ham raporları ve ekran görüntüleridir; tarihsel kayıttır.

## `gelistirici/` — kodla çalışanlar için

| Belge | Ne anlatır |
|---|---|
| [`gelistirici/README.md`](gelistirici/README.md) | Derleme, test, paketleme, kod haritası, bilinen tuzaklar |
| [`gelistirici/tasarim.md`](gelistirici/tasarim.md) | Arayüz dili: renk, yazı, bileşen ve telefon kuralları |
| [`gelistirici/sozluk.md`](gelistirici/sozluk.md) | Terim sözlüğü (TR · EN · RU) |

## Depo kökü

| Yer | Ne var |
|---|---|
| `src/main` · `src/preload` · `src/renderer` · `src/shared` | Uygulama kodu (ana süreç, köprü, arayüz, ortak kurallar) |
| `drizzle/` | Veritabanı migrasyonları (eklenir, değiştirilmez) |
| `tests/` | Birim (`unit`) ve uçtan uca (`e2e`) testler |
| `scripts/` | `npm run …` betikleri (kılavuz, ekran görüntüsü, i18n, simge, lisanslar) |
| `otel-kamera/` | Kamera yan süreci (Python) |
| `shell-tauri/` | Faz 22 Tauri denemesi (karar: Electron kalır) |
| `build/` · `resources/` · `electron-builder.yml` | Paketleme ayarı ve simgeler |
| `.claude/` | Ajan tanımları, beceriler, kurallar ve kancalar (Claude Code) |
| `.githooks/` | Git kancaları: aynı korumalar her araç için (`git config core.hooksPath .githooks`) |
| `tools/ajan/` | Ajanları terminalden başlatan araç |
