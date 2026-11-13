# 09 — Ajan sistemi: mevcut durum, yeni sistem, gerekçe

> Hazırlayan: Fable (2026-11-12). Değerlendirme kaynağı: `.claude/` tamamı (11 ajan, 12 beceri, 11 kanca, 4 kural),
> `tools/ajan/ajan.mjs`, `node .claude/hooks/test-hooks.mjs` (önce 73/73, şimdi 89/89). Yeni sistem `8346aec` commit'inde.

## 1. Mevcut sistemin değerlendirmesi (2026-11-12 sabahı)

Güçlü yanlar: kancalar yazma kurallarının çoğunu gerçekten zorluyor (migrasyon, korumalı dosya, kimlik verisi, push
dalı, bağımlılık, ağ sınırı, i18n literal, commit kapısı, stop kapısı); ajan tanımları görev odaklı; `parallel-build`
worktree + cherry-pick birleştirme düzeni çalışmış (Faz 5–16 bu düzenle bitmiş).

| # | Boşluk / tutarsızlık | Kanıt | Çözüm (bu dalda) |
|---|---|---|---|
| 1 | `YURUTME.md` hiçbir beceri ya da kanca tarafından okunmuyordu; sıkıştırma sonrası devam yalnız belgeye güveniyordu | `session-context.mjs` yalnız DURUM.md; `phase-runner` YURUTME'yi anmıyor | `session-context` açık paketleri enjekte ediyor; `/orkestra` tek kaynak olarak YURUTME; `phase-runner` 9–10. maddeler |
| 2 | Model tablosu üç yerde ve çelişkili (`parallel-build`: feature-builder opus; dosya: sonnet; researcher sonnet/haiku…) | `parallel-build` §2, `token-economy`, ajan ön bilgileri | Tek kaynak = ajan dosyası ön bilgisi; beceriler tabloya atıf yapar |
| 3 | Hiçbir ajan rapor dosyası yolu, bitiş ölçütü ve maliyet kuralı yazmıyordu; `token-economy` REPORT.md istiyordu | 11 ajan dosyası | Her ajana "Çıktı, sınırlar, maliyet" bölümü (`.tmp/<ad>/REPORT.md`, ≤15 satır dönüş) |
| 4 | Otonom yürütme becerisi yok; durma koşulları yalnız "G-xx çelişkisi"; bütçe takibi yok | `phase-runner` madde 8 | `/orkestra` (dalga seç → dağıt → birleştir → kontrol → kaydet; 6 durma koşulu; harcama günlüğü) |
| 5 | `gh workflow run` / `git tag v*` engeli yok (dakika kotası riski) | kanca listesi | `workflow-guard.mjs` (8 test) |
| 6 | Kamera verisi, yüz görüntüsü, `.env` içeriği, ağırlık dosyaları için engel yok; `kbs-data-guard` yalnız tablo + kimlik no | kanca listesi | `camera-data-guard.mjs` (5 test) + settings `deny` (`guest_photos`, `alerts`, `*.npy`) |
| 7 | Commit kapısı her commit'te tam `npm test` (2 çekirdekte ~21 dk, 570 sn sınırını aşıyor → belge commit'i bile kilitleniyor; zaman aşımında yetim vitest) | bu oturumda gözlendi | Belge/ayar-yalnız commit'lerde typecheck/lint/test atlanır (kod yolu kalıbı), kanca değiştiyse kanca öz-testi koşar (3 test) |
| 8 | Eksik roller: migrasyon yazan uzman, takvim/rezervasyon uzmanı, kamera/Python uzmanı, paketleyici; ekran/tam ekran denetçisi, KVKK denetçisi | ajan listesi | 6 yeni ajan |
| 9 | `ui-screen` üç json'u elle düzenletiyordu (feature-builder ve CLAUDE.md ile çelişki) | SKILL.md madde 5 | `i18n-spec` + `npm run i18n:add` |
| 10 | `ajan.mjs` `--devam` ile harcamayı sıfırlıyordu | `let spent = 0` | `son-oturum.json`'da kümülatif `spent` |
| 11 | `protect-files.mjs` `HOTEL_CRM_ALLOW_PROTECTED` kaçış değişkeni (eski proje adı) | kanca | Kaldırılmadı (test bağımlılığı); P19d'de temizlenecek, belgelendi |
| 12 | `stop-gate` yalnız `src/`/`tests/` izliyor (drizzle, scripts, package.json değil) | kanca | P19d |
| 13 | `bug-hunter`/`flow-tester` Write aracı metinle sınırlı (`.tmp/`) | ajan dosyaları | Kabul edilen risk; Opus görev metninde yolu verir |

## 2. Model ve çaba ataması (karar: Fable)

Fiyatlar (1M token, girdi/çıktı): Fable $10/$50 · Opus $4/$20 · Sonnet $2/$10 · Haiku $0,10/$0,50.
İlke: muhakeme ve bağlam birleştirme gerektiren tek yerde Opus (karar denetimi ve orkestra şefi); kod yazımı ve test
sonnet (Faz 5–16'da sonnet/medium ile 30+ paket bitmiş); tarama/metin haiku; Fable hiç.

| Ajan | Model | Çaba | Gerekçe | Tahmini iş başına maliyet* |
|---|---|---|---|---|
| Orkestra şefi (ana oturum) | opus | — | Dalga planlama, birleştirme kararları, sahip soruları | $8–15 / dalga |
| `feature-builder` | sonnet | medium | Kanıtlanmış (Faz 5–16); ekran + servis + test | $3–6 / paket |
| `calendar-specialist` | sonnet | high | Durum makinesi ve yuva kuralları hassas; yüksek çaba hata maliyetinden ucuz | $5–9 / paket |
| `db-migration-builder` | sonnet | high | Geri alınamaz veri taşıma | $3–6 / paket |
| `camera-integrator` | sonnet | high | İki dil, güvenlik sınırı, lisans | $6–12 / paket |
| `packager` | sonnet | medium | Yapılandırma + belge | $2–4 / paket |
| `feature-builder-lite` | haiku | medium | Mekanik işler | $0,3–0,8 / paket |
| `researcher` | haiku (hukuk: sonnet) | medium | Kaynak toplama; hukuk/lisans için sonnet'in daha güvenilir okuduğu görüldü | $0,2–1 |
| `bug-hunter` | sonnet | high | Yeniden üretilebilir bulgu kalitesi | $3–5 / modül |
| `flow-tester` | sonnet | high | Playwright betiği + gözlem; opus gereksiz | $4–7 / modül |
| `security-reviewer` | sonnet | high | Liste tabanlı denetim | $2–4 |
| `db-reviewer` | sonnet | high (eski: opus/medium) | Liste tabanlı; opus farkı görülmedi | $1–3 |
| `ui-reviewer` | sonnet | medium (eski: opus) | Görüntü okuma + kural listesi | $1–3 |
| `screen-auditor` | sonnet | medium | Ölçüm betiği + görüntü | $3–6 |
| `privacy-auditor` | sonnet | medium | Envanter + kural listesi | $1–3 |
| `decision-auditor` | opus | medium | Belgeler arası çelişki bulma: en çok muhakeme isteyen denetim | $3–6 |
| `turkish-ui-copy` | haiku | medium | Metin karşılaştırma | $0,3–0,8 |
| `requirements-tracer` | haiku | medium | grep + tablo | $0,3–0,8 |
| `/qa` | haiku | low | Komut koşup özetleme | $0,1–0,3 |

\* Bu oturumdaki ölçümlere dayalı kaba tahmin (sonnet alt ajanlar 50–140k token ≈ $0,5–1,5; kod yazan ajanlarda
3–5 kat). Toplam plan tahmini `08-gelistirme-plani.md` §6'da.

## 3. Yeni/değişen parçalar

### 3.1 Ajanlar (17)
Yeni: `calendar-specialist`, `db-migration-builder`, `camera-integrator`, `packager` (yapan); `screen-auditor`,
`privacy-auditor` (kontrol). Hepsinde: görev tanımı, girdi, çıktı ve rapor yolu, dokunabileceği/dokunamayacağı yerler,
bitiş ölçütü, maliyet kuralları. Mevcut 11 ajana aynı bölüm eklendi ve model/çaba güncellendi.

### 3.2 Beceriler
`/orkestra` yeni (§4). `phase-runner` (YURUTME okuma, durma koşulları, ilerleme kaydı), `parallel-build` (ajan eşleme
tablosu, 2 ajan sınırı), `token-economy` (model tablosu tek kaynağa atıf), `ui-screen` (i18n spec) güncellendi.
`/qa`, `/owner-review`, `/add-migration`, `/release`, `/requirement-change`, `/code-graph`, `/electron-security`,
`/tr-copy-guide` değişmedi.

### 3.3 Kancalar (13; 89 test)
Yeni: `workflow-guard` (gh workflow/run/release yazma komutları, `gh api` POST/dispatches, `git tag v*`),
`camera-data-guard` (kamera klasörleri, görüntü dosyaları izinli yollar dışında, ağırlık/vektör uzantıları, `.env`,
Telegram token ve şifreli RTSP metni). Değişen: `pre-commit-gate` (belge/ayar-yalnız commit'te araç zinciri atlanır;
kanca değiştiyse öz-test), `session-context` (YURUTME açık paketleri). `settings.json`: yeni `if` eşleşmeleri ve
`deny` yolları. Hepsi 10–20 sn sınırında (commit kapısı 600 sn); yanlış alarm denemeleri: heredoc/echo içindeki
`gh`/`git` metni engellenmez (test), `.env.example` ve `docs/` altındaki görüntüler serbest (test).

### 3.4 Kurallar ve CLAUDE.md
`.claude/rules/camera.md` yeni. `CLAUDE.md`: yasak 14 (kamera/biyometrik veri), 15 (Actions tetiklenmez); ajan ve beceri
listesi; "Opus için nereden başlarım"; analiz klasörü işaretçisi.

### 3.5 Başlatıcı (`tools/ajan/ajan.mjs`)
Harcama `son-oturum.json`'a yazılır ve `--devam` ile devralınır (bütçe iş başına, süreç başına değil).

## 4. `/orkestra` akışı (özet)

```
YURUTME.md oku → sıradaki dalga → ortak altyapı (ana oturum, commit) → paketleri ajanlara dağıt (≤2 kodlayan, worktree)
→ raporları oku → cherry-pick + i18n:add → npm run check (bir kez) + hedefli e2e → kontrol ajanları (paralel)
→ Yüksek bulgular aynı dalgada fix paketi → commit + push → faz dosyası Sonuç, YURUTME ✅ + günlük + harcama, DURUM
→ durma koşulu yoksa sonraki dalga
```
Durma koşulları: sahip kararı gereken soru · aynı pakette 2 başarısız deneme · kanca engeli gerektiren iş · bütçe eşiği
(kalan < sıradaki dalga tahmini ya da harcama > %80) · G-xx çelişkisi · gerçek cihaz/hesap gerektiren adım (dalga
sonunda). Durunca `YURUTME.md` günlüğü + `❓ SORULARIM`.

## 5. Doğrulama

- `node .claude/hooks/test-hooks.mjs`: 89/89.
- `npm run typecheck` ✓, `npm run lint` ✓, `npm test` 2427/2427 (bu oturum, `02-hata-raporu.md` §1).
- Kancaların gerçek oturumda çalıştığı bu oturumda gözlendi: `camera-data-guard` ilk commit denemesinde belgede örnek
  RTSP adresini yakaladı (düzeltildi); `pre-commit-gate` belge commit'inde araç zincirini atladı; `format-file`,
  `no-network-guard`, `protect-files` Write/Edit'lerde çalıştı.
- **Doğrulandı (2026-11-12, 2. oturum):** `bypassPermissions` ile çalışan Agent SDK oturumunda `permissions.deny`
  `Read(./**/*.npy)` kuralı, `.tmp/deny-test.npy` dosyasının Read aracıyla okunmasını engelledi ("directory denied by
  permission settings"); deny kuralları bu modda da uygulanıyor. Kancalar da bu modda çalıştı (gözlendi).

## 6. Açık işler (plan P19d "ajan sistemi bakımı")
`protect-files` kaçış değişkenini kaldır; `stop-gate` izleme kapsamına `drizzle/`, `scripts/`, `package.json`;
`deps-guard` yarn eşleşmesi; `prototypes/` istisnaları prototipler silinince kaldır; `owner-review` becerisinde
scratchpad yerine kalıcı yol.
