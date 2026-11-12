# Faz 0 · Prototip (Spike) Sonuçları

> Tarih: 2026-10-01. Kod: `prototypes/` (ürün kodu değildir; Faz 1 ürünü `src/` altında sıfırdan kurulur).
> Bu konteynerin dış internet erişimi vekil tarafından engelli olduğu için işletim sistemi paketleme ve canlı API
> kontrolleri **GitHub Actions** çalıştırıcılarında yapıldı (`.github/workflows/faz0-*.yml`).

## 1. Masaüstü kabuğu ve paketleme — A0.1 (K-01, K-12) ✅

**Ne yapıldı:** `prototypes/shell` — sertleştirilmiş `BrowserWindow` (contextIsolation, sandbox, nodeIntegration kapalı,
spellcheck kapalı, CSP), better-sqlite3 13 ile 10.000 satır yazma + WAL + `VACUUM INTO` yedek + `integrity_check`,
Tailwind v4'ün ihtiyaç duyduğu CSS özelliklerinin yoklaması, Türkçe/Kiril karakter testi, `--smoke` modu.
electron-builder 26.15.3 ile Windows NSIS (kullanıcı başına, klasör seçilebilir, TR/EN/RU kurulum dili) ve
macOS DMG (arm64, ad‑hoc imza `identity: "-"`).

**Sonuç (GitHub Actions run 36936900593, 4/4 iş başarılı):**

| İşletim sistemi | Electron | Chromium | Node | Paketleme | Duman testi | SQLite 10k satır | Açılış* | CSS (oklch, color-mix, @property, :has, container, nesting, @layer) |
|---|---|---|---|---|---|---|---|---|
| Windows Server 2025 (10.0.26100) | 37.10.3 | 138 | 22.21 | ✅ NSIS | ✅ | 42 ms | 734 ms | ✅ hepsi |
| macOS 26 (Apple Silicon) | 37.10.3 | 138 | 22.21 | ✅ DMG ad‑hoc | ✅ | ✅ | ✅ | ✅ hepsi |
| Windows | 44.5.1 | 152 | 24.x | ✅ | ✅ | ✅ | ✅ | ✅ hepsi |
| macOS | 44.5.1 | 152 | 24.x | ✅ | ✅ | ✅ | ✅ | ✅ hepsi |
| Linux (yerel, xvfb) | 37.10.3 | 138 | 22.21 | – | ✅ | 31 ms | 1016 ms | ✅ hepsi |

\* Ana süreç başlangıcından renderer'ın veri istemesine kadar.

- Kurulum dosyaları: **Windows ≈ 92 MB** (`Bismuth Proto-Setup-0.0.1-electron37.10.3-x64.exe`), **macOS ≈ 118 MB** (`.dmg`, arm64). Ürün kodu eklenince birkaç MB artar.
- better-sqlite3 13.0.3 npm paketi 8 platform için **hazır ikili** taşıyor (`gypfile:false`) → `npmRebuild:false` + `asarUnpack` yeterli; yeniden derleme yok. Node ≥22 istiyor → Electron 37 (Node 22.21) ve 44 (Node 24) ikisi de uygun.
- İndirme (14 gün saklanır): Actions → faz0-shell → run 36936900593 → Artifacts (`bismuth-proto-Windows-electron37.10.3`, `bismuth-proto-macOS-electron37.10.3`). **Sahibin kendi cihazlarında denemesi bekleniyor (S-80).**
- Not: `actions/checkout@v4` vb. Node 20 uyarısı veriyor → ürün CI'ında güncel ana sürümler kullanılacak.
- Not: paketlenmiş uygulamada `userData` klasör adı `package.json` → `name` alanından geliyor; ürün `productName: "Bismuth"` ve `name: "bismuth"` ile ayarlanmalı.

**Karar önerisi K-12:** Her iki sürüm hattı iki işletim sisteminde çalışıyor. Electron **37.x** macOS 11+'ı da kapsadığı için
("bütün sürümler" isteği) varsayılan; 37 hattı resmi destek dışı (güvenlik yaması almıyor) ama uygulama yalnızca kendi
içeriğini gösteriyor ve sunucu modu Node tarafında. Ürün dondurulacağı için hangi hat seçilirse seçilsin bir gün destek
dışı kalacak. Yeni macOS/Windows'ta sorun çıkarsa 44.x'e geçiş tek satır (doğrulandı).

## 2. Takvim ızgarası (tape chart) — A0.3 (K-03) ✅

**Ne yapıldı:** `prototypes/tape-chart` — React 19 + @tanstack/react-virtual 3.14.13, 19 oda × **3.653 gün (10 yıl)**,
deterministik **17.900 sentetik konaklama** (gece gece ödenmiş/ödenmemiş, aynı gün giriş‑çıkış yarım hücre, satılmaz
blok), sabit sol iki sütun (oda no, tip) ve yapışkan tarih satırı (Türkçe gün adı, cumartesi vurgusu, bugün çerçevesi),
geçmiş günler gri. Yalnızca görünen sütunlar ve o aralığa düşen konaklamalar DOM'da (oda başına ikili arama).

**Ölçüm (headless Chromium, yazılım çizimi — gerçek dizüstünden daha kötümser):**

| Ekran | İlk çizim | Kaydırma (600 kare, 40 px/kare) | p95 kare | 9 yıl ileri atlama | DOM öğe sayısı |
|---|---|---|---|---|---|
| 1366×768 | **142 ms** | **59,8 fps** | 16,8 ms | **44 ms** | ~920–990 |
| 1920×1080 | 66 ms | 59,9 fps | 16,7 ms | 44 ms | ~1.080–1.150 |

Hedefler (`03-mimari.md` §10: < 300 ms ilk çizim, 60 fps) karşılandı. Ekran görüntüsü: `img/faz0-tape-chart-1366.png`.

**Karar K-03 kesin:** hazır zaman çizelgesi kütüphanesi yok; **özel bileşen + TanStack Virtual (yatay)**. Faz 5'te
bu prototipin yaklaşımı (ikili arama, mutlak konumlu çubuklar, gece segmentleri) temel alınır; veri pencereleri
SQLite'tan ay ay okunur.

## 3. KBS → Turizm Bakanlığı istatistiği — A0.8 (K-24, K-29) ✅

**Ne yapıldı:** `prototypes/kbs-stats` — exceljs 4.4.0 ile `.xlsx` okuma; sütunlar **başlık adıyla** bulunur (sıra/boş
hücre değişse de çalışır); kimlik sütunları (TC, belge, ad, soyad, plaka) **hiç okunmaz**; i18n-iso-countries 7.14.0 ile
İngilizce ülke adı → ISO → Türkçe ad; kurallar: giriş ayı, aynı gün = 1, doluluk = geceleme ÷ (yatak × gün).

**Gerçek dosya (sahibin Eylül 2026 KBS dosyası, depoya alınmadı) — 143 ms:**

| Ülke | Toplam Giriş | Toplam Geceleme |
|---|---|---|
| Türkiye | 525 | 665 |
| Almanya | 23 | 88 |
| Özbekistan | 20 | 20 |
| Kuzey Kıbrıs Türk Cumhuriyeti | 10 | 24 |
| Azerbaycan | 5 | 5 |
| Rusya | 3 | 6 |
| … (toplam 23 ülke) | | |
| **TOPLAM** | **607** | **840** |

**Gerçek veriden çıkan önemli bulgular:**
1. **Hâlâ otelde olanlar ("Aktif", 5 kişi) için KBS çıkış tarihini boş bırakmıyor, `1900-01-01` yazıyor.** Ayrıştırıcı bunu "çıkış yok" olarak tanır. Bu 5 kişi ay sonuna kadar sayılırsa geceleme **840**; her biri 1 gece sayılırsa **838** (ilk elle sayımım 838'di). → **Sahibe soru S-81.**
2. Aynı gün giriş‑çıkış: 248 kayıt (tüm kayıtların %41'i) → "aynı gün = 1 gece" kuralı sonucu ciddi etkiliyor.
3. Uyruk yazımları: "GERMANY (Deutschland)", "SWITZERLAND (Confederation of Helvetia)" → parantez atılarak ISO eşlemesi; "KUZEY KIBRIS TURK CUMHURİYETİ" ISO dışı (tohum eşleme); **"SERBIA AND MONTENEGRO" tarihi kayıt** → kullanıcıya sorulur (ürün: `country_map` bir kez öğrenir).
4. Doluluk: 28 yatakla Eylül = %100 çıkıyor (840 ÷ 840). Panel örneğinden 28 yatak çıkarımı (%0,24) tutarlı ama Eylül'ün %100 olması yatak sayısının **daha yüksek** olabileceğini düşündürüyor → **S-78 (yatak sayısı) kritik.**

**Testler:** 8/8 (sentetik, seyrek hücreli örnek dosyayla: giriş ayı kuralı, ay aşan konaklama, aynı gün, 1900 tarihi, parantezli adlar, KKTC, tarihi kayıt, kullanıcı eşlemesi, panel %0,24, kopyalama metni).

## 4. Bayram üretimi — A0.4 (K-04) ✅

**Ne yapıldı:** `prototypes/holidays` — `date-holidays` 3.37.0 (ISC; veri CC‑BY‑3.0) Türkiye kurallarını Türk hukukuna
göre normalleştirir: Ramazan = arife (13:00'dan, yarım gün) + 3 gün; Kurban = arife + 4 gün; 28 Ekim yarım gün.

| Doğrulama | Sonuç |
|---|---|
| 2026 Ramazan Bayramı | arife 19 Mart ½ + 20–22 Mart ✅ (Diyanet ile aynı) |
| 2026 Kurban Bayramı | arife 26 Mayıs ½ + 27–30 Mayıs ✅ |
| 15 Temmuz ve diğer sabit günler | her yıl ✅ |
| 2033 (iki Ramazan Bayramı) | ✅ 2 Ocak ve 23 Aralık |
| 2026–2036 üretim süresi | 191 satır, 68 ms |
| Diğer ülkeler (DE, RU) | ✅ |

**Bulgu:** kütüphanenin Hicri tablosu **2076'da bitiyor** → 2077+ için yerleşik `Intl` takvimi (`islamic-umalqura`,
bağımlılıksız) yedeği eklendi; **2026–2200 arası her yıl üretiliyor** (test). İki yöntem bazı yıllarda **±1 gün** farklı
(51 yılın 30'unda) → dini bayram satırları "tahmini" işaretlenir; yıllık çevrimiçi doğrulama (Google TR tatil takvimi,
canlı doğrulama raporu) ve kullanıcı düzeltmesi bunları kesinleştirir. Paket boyutu: `date-holidays` 12 MB (tüm
ülkeler) → ürün yalnızca gerekli ülke verisini paketleyecek şekilde ayarlanmalı (Faz 1/9).

**Karar K-04 kesin:** kural tabanlı sınırsız üretim (`date-holidays` + `Intl` yedeği) + "tahmini" etiketi + yıllık çevrimiçi doğrulama + kullanıcı düzeltmesi kalıcı.

## 5. Canlı API doğrulaması — A0.5 (K-06, K-13)

→ `canli-dogrulama.md` (GitHub Actions sonuçları).
