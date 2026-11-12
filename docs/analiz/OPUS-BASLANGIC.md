# OPUS BAŞLANGIÇ — devir notu (Fable → Opus 5.5)

**Sahibin yapıştıracağı tek satır (Codespace terminali):**

```
node tools/ajan/ajan.mjs --model claude-opus-5-5 --butce 150 "docs/analiz/OPUS-BASLANGIC.md dosyasını oku ve /orkestra ile dalga 1'den başla; sahip cevapları yoksa varsayılanları uygula."
```

> Başlatıcı `tools/ajan/ajan.mjs` Claude Agent SDK ile çalışır; `AskUserQuestion` aracı **yok**: soru sormak için
> mesajın sonuna `❓ SORULARIM` başlığıyla numaralı sorular yaz ve turu bitir; sahip terminalden cevaplar. `--butce`
> kümülatiftir; bitince `node tools/ajan/ajan.mjs --devam --butce <yeni>` ile kaldığı yerden sürer. `--butce 150`
> önerisi: dalga 1–4 (Faz 17 + ekran düzeltmeleri) ≈ $95–135; tamamı ≈ $300–440 (`08-gelistirme-plani.md` §6).

## 1. İlk mesajda sırayla oku (toplam ~15 dk)

1. `CLAUDE.md` (otomatik yüklenir) — yasaklar 14–15 ve "Opus için nereden başlarım" bölümü.
2. `docs/analiz/00-ozet.md` — durum, 10 kritik bulgu, yol haritası, sahip soruları.
3. `docs/plan/fazlar/YURUTME.md` — "Faz 17–21 dalgaları" tablosu ve günlüğün son satırı (tek ilerleme kaynağı).
4. `docs/analiz/08-gelistirme-plani.md` — dalga 1 paket kartları (P17a, P19c) ve §6 maliyet tablosu.
5. `docs/plan/06-kararlar.md` "Sahip cevapları (2026-11-12, 7. tur)" — sahip cevap yazdıysa önce onları işle
   (K-48…K-55 taslaklarını kesinleştir); yazmadıysa `05-sorular.md` S-100…S-118 varsayılanları geçerli.
6. Dalga 1 için: `docs/analiz/03-resepsiyon-geri-bildirimi.md` (P17a tasarımı), `docs/plan/fazlar/faz-17-*.md`,
   `.claude/agents/calendar-specialist.md`, `.claude/skills/orkestra/SKILL.md`.

Okumadan kod yazma; ajan dağıtmadan `/token-economy` kurallarını hatırla (2 çekirdek → aynı anda 2 kodlayan ajan).

## 2. `/orkestra` nasıl başlatılır

- `/orkestra 1` (ya da "sıradaki dalga"): beceri YURUTME'den dalga 1'i alır → ortak altyapı yoksa doğrudan dağıtır →
  P17a `calendar-specialist` (worktree, port 47511/47512) ve P19c `feature-builder-lite` (47521/47522) **tek mesajda,
  arka planda** → raporları `.claude/worktrees/<ajan>/.tmp/REPORT.md`'den oku → cherry-pick + `i18n:add` → yük düşükken
  `npm run check` bir kez → kontrol ajanları (ui-reviewer, turkish-ui-copy, db-reviewer, decision-auditor) tek mesajda →
  Yüksek bulgular aynı dalgada `P17afix` → commit (`feat(booking): give-up and refund flow (P17a)` biçimi) + push
  `claude/…` dalına → faz-17 kabul kutuları + YURUTME ✅ + günlük + harcama + DURUM.
- Bağlam sıkıştıktan sonra: `session-context` kancası açık paketleri basar; **ilk iş** YURUTME.md'yi okumak, sonra
  `git status` ve `git log -3`; yarım worktree varsa (`git worktree list`) ajana "devam et" diye ver.
- Commit kapısı: belge/ayar-yalnız commit'lerde hızlı; kod commit'inde typecheck + lint + tam test (2 çekirdekte ~20 dk;
  yük > 3 iken başlatma, yetim `vitest` kalırsa `pkill -f "vitest run"`).

## 3. Dalga 1 içeriği

| Paket | Ajan | Ne yapılacak (kısa) | Kabul |
|---|---|---|---|
| P17a | `calendar-specialist` | `booking.undoCheckIn`; `in_house` menüsünde "Vazgeçme ve iade" (3 seçenek); iptal ve çıkış pencerelerinde tahsilat özeti + iade satırı / "İade bekliyor" parkı; `checked_out` panelde üç nokta menüsü; iade defter + kasa teslimi; raporda iade satırı; kılavuz | faz-17 kabul maddeleri 1–4; e2e masaüstü + telefon |
| P19c | `feature-builder-lite` | `git tag archive/faz0`; `prototypes/`, `faz0-*.yml`, `resources/icon.png` sil; kanca istisnaları + `test-hooks.mjs` güncelle; `otel-kamera` belgelerinde yerel yolları temizle; kök README'ye analiz işaretçisi | `npm run check` + kanca testleri yeşil |

Dalga 1 bitince dalga 2 (P17d + P18a), sonra 3 (P17b + P17c)… tablo YURUTME'de.

## 4. Ne zaman durup sahibe sorarsın (`/orkestra` §5)

1. Sahip kararı gerektiren soru ve varsayılanla ilerlemek pahalı/geri alınamaz: **S-101** (grup yorumu; P17b'den önce),
   **S-102…S-105** (gündüz kuralları; P17d migrasyonundan önce), **S-107…S-112** (kamera; dalga 7'den önce),
   **S-114…S-117** (çoklu otel; dalga 10'dan önce). Varsayılanlar S-100 ve S-106 için yeterlidir; dalga 1 soru beklemez.
2. Aynı pakette 2 başarısız deneme; kanca engeli gerektiren iş; bütçe (kalan < sıradaki dalga tahmini); G-xx çelişkisi.
3. Gerçek cihaz/hesap gerektiren adımlar sahip onay paketine yazılır, dalga durmaz (S-80 Windows denemesi, Mac DMG,
   21st.dev anahtarı S-118, KVKK avukat görüşü).

Durunca: YURUTME günlüğüne "⏸ durdu: neden"; mesaj sonunda `❓ SORULARIM` (numaralı, her soruya önerilen cevap); tur biter.
Cevap gelince `06-kararlar.md` 7. tur tablosuna yaz ve devam et.

## 5. Yasaklar (kısa hatırlatma)
GitHub Actions tetikleme yok (`workflow-guard`); kamera/biyometrik veri ve sır commit edilmez (`camera-data-guard`);
`01-gereksinimler.md` yalnız `/requirement-change`; migrasyon değişmez (sıradaki 0019); push yalnız `claude/…`; model adı
hiçbir dosyada; `.mcp.json` 21st.dev sunucusu yalnız sahip S-118'i onaylayıp secret eklerse kullanılır.

## 6. Kapanış (planın sonunda)
"Son" dalgası: modül başına `bug-hunter` + `flow-tester`, `decision-auditor`, `security-reviewer`, `db-reviewer`,
`ui-reviewer`, `screen-auditor`, `privacy-auditor`, `turkish-ui-copy`, `requirements-tracer` → düzeltme turu →
`/owner-review` ile sahibe onay sayfası. Sonra sahibe: ne yapıldı, açık sorular, gerçek cihazda denenecekler listesi.
