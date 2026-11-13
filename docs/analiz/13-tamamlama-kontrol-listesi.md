# 13 — Fable tamamlama kontrol listesi (`tools/ajan/talimatlar/fable-talimati.md` §2–§8 ve `docs/fable-tamamlama.md` (silinmiş; git geçmişinde))

> Fable, 2. oturum (2026-11-12 → 2026-11-13). Her madde: yapıldı mı, kanıt nerede. "Bekliyor" satırları oturum sonunda güncellenir.

## A. Ana talimat §2–§8

| § | Madde | Durum | Kanıt |
|---|---|---|---|
| 2 | Bağlam okuma, testler, baz notlar | ✅ | `bcf83bf docs(analysis): baseline notes`; `02-hata-raporu.md` §1 |
| 3 | Resepsiyonun 4 maddesi: kök neden, repro, tasarım | ✅ | `03-resepsiyon-geri-bildirimi.md`; `ekler/resepsiyon-repro.test.ts.txt`; 2. oturumda iptal → ızgara gerçek Electron'da doğrulandı (§4 "Doğrulandı") |
| 4 | Raporlar 00–09 (tablo) | ✅ | `docs/analiz/00…09`; ek olarak 10 (çoklu otel), 11 (Rust), 12 (21st.dev), 13 (bu dosya) |
| 4.1 | Ekran ve tam ekran: 7 çözünürlük, ölçek, tema, dil, pencere, her düğme | ✅ | `05-…md` §1–§4 (111 görüntü, metrics.jsonl); akış testi kapsamı §5 (2. oturumda tüm route'lar, bkz. B) |
| 4.2 | Kurulum ve dağıtım, depo düzeni, basit rehber, `.env.example` | ✅ | `07-…md`; `docs/kurulum-rehberi-basit.md`; `otel-kamera` örnek env dosyası depoda; Windows paketi Linux'ta **üretildi** (07 §2) |
| 4.3 | 21st.dev değerlendirme + kurulum anlatımı + `.mcp.json` | ✅ (sahip kararıyla genişletildi) | `05` §7, `12-21st-tasarim-secimi.md`, `.mcp.json`, `.claude/settings.json` `enabledMcpjsonServers` |
| 5 | Kamera: seçenekler, veri, çatışmalar, hukuk/lisans, kod kalitesi, aşamalı plan | ✅ | `06-…md` (§6.3 sahibin model kararı + lisans), `ekler/kamera-kaynaklar.md`, `ekler/kamera-kod-bulgulari.md` (§0 paket eşlemesi) |
| 5.2 | Çoklu otel | ✅ | `10-coklu-otel.md`; K-54 kesin (sahip cevapları) |
| 6 | Plan: 08, faz dosyaları 17–22, YURUTME dalgaları, DURUM, gereksinim/karar/soru | ✅ | `08-…md` §1–§10; `faz-17…22`; `YURUTME.md` dalga 1–16 + Son; `01-gereksinimler.md` G-193…G-196, Ö-20…Ö-24; K-48…K-62; S-100…S-122 |
| 7.1 | Model ataması, gerekçe tablosu | ✅ | `09-…md` §2 (18 ajan); ajan dosyaları `model:`/`effort:` |
| 7.2 | Ajanlar (yapan + kontrol) | ✅ | `.claude/agents/` 18 dosya; `camera-integrator` "Faz 20" düzeltildi; `rust-shell-builder` eklendi |
| 7.3 | Beceriler: `/orkestra`, durma koşulları, bütçe; diğerlerinin uyumu; **Ponytail** | ✅ | `.claude/skills/orkestra/SKILL.md` (§3 adım 5a sadeleştirme), `/ponytail` (sabit 5.3.3), `/qa`, `/parallel-build`, `/phase-runner`, `/token-economy` |
| 7.4 | Kancalar test edildi, yeni kancalar, CLAUDE.md | ✅ | `node .claude/hooks/test-hooks.mjs` → 89/89 (2026-11-13); `camera-data-guard`, `workflow-guard`; CLAUDE.md yasak 1/14 güncel (K-49/K-50) |
| 7.5 | Opus devir notu + tek satır komut | ✅ | `OPUS-BASLANGIC.md` (bütçe 200, soru sormadan başlar) |
| 8 | Her aşamada commit/push; son kontrol (tutarlılık, bulgu→paket, paket→ajan) | ✅ | Tutarlılık denetimi (`.tmp/verify-plan/REPORT.md`, 22 boşluk kapatıldı: `24881d9`); bu oturumda 12+ commit |

## B. Tamamlama talimatı (`docs/fable-tamamlama.md` (silinmiş; git geçmişinde))

| § | Madde | Durum | Kanıt |
|---|---|---|---|
| 2 | Her rapor istenen içeriği karşılıyor | ✅ | A tablosu |
| 2 | Her bulgunun paketi var | ✅ | `verify-plan` 22 boşluk → `08` P17a/c, P19b, P20a/d, P21d/e; `kamera-kod-bulgulari.md` §0 |
| 2 | Her paketin ajanı ve modeli var | ✅ | `08` kartları + `YURUTME` "Ajan" sütunu; 18 ajan dosyasında `model:` |
| 2 | Kancalar testli | ✅ | 89/89 |
| 2 | `npm run check` geçiyor | ✅ 2026-11-13 01:28 — typecheck, lint, format, 277 dosya / 2427 test (7 dk 53 s) | `.tmp/check3.log`; ilk koşuda yük altında tek zamanlama testi kaldı (02 §1 notu) |
| 3 | "Doğrulanmadı" maddeleri | ✅ 11/11 madde doğrulandı ya da "doğrulanamadı + neden" | `grep -rniE "doğrulanmadı" docs/analiz` → kalanlar yalnız tarihsel not (ör. "ilk turda doğrulanmadı") ya da "doğrulanamadı: <neden>" |
| 4 | Akış testi kapsamı: denenmemiş modüller `flow-tester` ile | ✅ 33 route'un tamamı (iki ajan, ~950 öğe; 7 Orta, 22 Düşük; Kritik/Yüksek yok) | `05` §5 tablosu; `02` H-19…H-47 |
| 5 | Sahip cevapları S-100…S-118 işlendi | ✅ | `06-kararlar.md` 7. tur; `05-sorular.md` ✅; K-48…K-55 kesin, K-57…K-62; faz/paket/dalga/maliyet/OB güncel |
| B.1 | Rust raporu (ölç, karşılaştır, karar, paketler) | ✅ | `11-rust-gecisi.md` (ölçüm §2: boşta 693 MB / taban 421 MB; CPU yoğun %19), Faz 22, K-62, `rust-shell-builder` |
| B.2 | Ponytail: oku, güvenlik, kur, çatışma notu, orkestra adımı, 09 güncel | ✅ | `.claude/skills/ponytail/SKILL.md`; `09` §3.2a; K-61 |
| B.3 | 21st.dev: secret adımları, Apps + bileşen tarama, seçim, `enabledMcpjsonServers`, bağlantı denemesi | ✅ | `12-21st-tasarim-secimi.md` (§1 `get_usage` → paid); `.claude/settings.json` |
| 6 | Bitiş bloğu | ✅ | son mesaj (`✅ FABLE İŞİ BİTTİ`) |

## C. Oturum ortam notları (yeni Codespace için)
- 4 çekirdek / 15 GB ölçüldü (2026-11-12); kodlayan ajan sınırı 2 kalır.
- `git push` "git-lfs not found" → `sudo apt-get install -y git-lfs` (devcontainer apt listesine eklendi).
- Windows paketi: `wine64` + `wine32:i386` + temiz `~/.wine` (07 §2).
- Commit kancası (`pre-commit-gate`) komut çalışmadan önce değerlendirir: belge düzenlemesi ve `git add/commit` **ayrı**
  Bash çağrılarında yapılmalı; aksi halde "yalnız belge" tespiti çalışmaz ve tam test koşar (yük altında zaman aşımı).
