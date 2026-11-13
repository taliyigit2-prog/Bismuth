# OPUS BAŞLANGIÇ — devir notu (Fable → Opus 5.5)

**Sahibin yapıştıracağı tek satır (Codespace terminali):**

```
node tools/ajan/ajan.mjs --model claude-opus-5-5 --butce 200 "docs/analiz/OPUS-BASLANGIC.md dosyasını oku; ilk mesajın sonunda açık S-100…S-119 sorularını tek listede sor ama bekleme, /orkestra ile dalga 1'den başla; cevapsız soruda varsayılanı uygula."
```

> Başlatıcı `tools/ajan/ajan.mjs` Claude Agent SDK ile çalışır; `AskUserQuestion` aracı **yok**: soru sormak için
> mesajın sonuna `❓ SORULARIM` başlığıyla numaralı sorular yaz ve turu bitir; sahip terminalden cevaplar. `--butce`
> kümülatiftir; bitince `node tools/ajan/ajan.mjs --devam --butce <yeni>` ile kaldığı yerden sürer. `--butce 200`
> önerisi: dalga 1–5 (Faz 17 + ekran düzeltmeleri) ≈ $110–210; tamamı 13 dalga + Son ≈ $315–575 (`08-gelistirme-plani.md`
> §6; model başına Opus $50–130 · Sonnet $250–415 · Haiku $15–30). Codespace 2026-11-12'de 4 çekirdek / 15 GB ölçüldü;
> kodlayan ajan sınırı yine 2, kalan çekirdekler test ve paketleme için.

## 1. İlk mesajda sırayla oku (toplam ~15 dk)

1. `CLAUDE.md` (otomatik yüklenir) — yasaklar 14–15 ve "Opus için nereden başlarım" bölümü.
2. `docs/analiz/00-ozet.md` — durum, 10 kritik bulgu, yol haritası, sahip soruları.
3. `docs/plan/fazlar/YURUTME.md` — "Faz 17–21 dalgaları" tablosu ve günlüğün son satırı (tek ilerleme kaynağı).
4. `docs/analiz/08-gelistirme-plani.md` — dalga 1 paket kartları (P17a, P19c) ve §6 maliyet tablosu.
5. `docs/plan/06-kararlar.md` "Sahip cevapları (2026-11-12, 7. tur)" — sahip cevap yazdıysa önce onları işle
   (K-48…K-55 taslaklarını kesinleştir); yazmadıysa `05-sorular.md` S-100…S-119 varsayılanları geçerli.
6. Dalga 1 için: `docs/analiz/03-resepsiyon-geri-bildirimi.md` (P17a tasarımı), `docs/plan/fazlar/faz-17-*.md`,
   `.claude/agents/calendar-specialist.md`, `.claude/skills/orkestra/SKILL.md`.

Okumadan kod yazma; ajan dağıtmadan `/token-economy` kurallarını hatırla (aynı anda en çok 2 kodlayan ajan).

**İlk mesajın sonunda** (dalga 1'i başlattıktan sonra, aynı mesajda) `❓ SORULARIM` başlığıyla cevapsız S-100…S-119'u
**tek listede** sor (CLAUDE.md "tek seferde" kuralı); her soruya varsayılanı yaz; turu bitirme, dalga 1 soru beklemez.
Cevap gelirse `06-kararlar.md` 7. tur tablosuna işle; gelmezse ilgili dalgadan önce varsayılanla ilerle (aşağıda §4).

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

Dalga 1 bitince dalga 2 (P17d migrasyon 0019 + P18a), sonra 3 (P17b migrasyon 0020 + P18c), 4 (P17c + P17e), 5 (P18b + P18d)…
tablo ve dalga sırası kuralları YURUTME'de (bağımlı paket bir sonraki dalgada).

## 4. Ne zaman durup sahibe sorarsın (`/orkestra` §5)

1. Sahip kararı gerektiren soru ve varsayılanla ilerlemek pahalı/geri alınamaz: **S-101** (grup yorumu; P17b'den önce),
   **S-102…S-105** (gündüz kuralları; P17d migrasyonundan önce), **S-107…S-112** (kamera; dalga 7'den önce),
   **S-114…S-117** (çoklu otel; dalga 11'den önce). Varsayılanlar S-100, S-106, S-113, S-118 ve S-119 için yeterlidir
   (sorulur ama beklenmez); dalga 1 soru beklemez. Hepsi ilk mesajda tek listede sorulduğu için sonraki dalgalarda
   yalnız hâlâ cevapsız ve varsayılanı pahalı olanlar için durulur (S-101, S-102…S-105, S-107…S-112, S-114…S-117).
2. Aynı pakette 2 başarısız deneme; kanca engeli gerektiren iş; bütçe (kalan < sıradaki dalga tahmini); G-xx çelişkisi.
3. Gerçek cihaz/hesap gerektiren adımlar sahip onay paketine yazılır, dalga durmaz (S-80 Windows denemesi, Mac DMG,
   21st.dev anahtarı S-118, KVKK avukat görüşü).

Durunca: YURUTME günlüğüne "⏸ durdu: neden"; mesaj sonunda `❓ SORULARIM` (numaralı, her soruya önerilen cevap); tur biter.
Cevap gelince `06-kararlar.md` 7. tur tablosuna yaz ve devam et.

## 5. Yasaklar (kısa hatırlatma) ve ortam notları
Ortam: `git push` "git-lfs not found" derse `sudo apt-get install -y git-lfs`; Windows paketi Codespace'te `wine64 wine32:i386`
ister (07 §2); Electron e2e `xvfb-run -a` ile çalışır (devcontainer düzeltildi).

GitHub Actions tetikleme yok (`workflow-guard`); kamera/biyometrik veri ve sır commit edilmez (`camera-data-guard`);
`01-gereksinimler.md` yalnız `/requirement-change`; migrasyon değişmez (sıradaki 0019 = P17d); push yalnız `claude/…`; ajan modeli
yalnız `.claude/agents/*.md` ön bilgisinde (tek kaynak; beceri ve belgelerde tekrar yazılmaz); `.mcp.json` 21st.dev sunucusu yalnız sahip S-118'i onaylayıp secret eklerse kullanılır.

## 6. Kapanış (planın sonunda)
"Son" dalgası: modül başına `bug-hunter` + `flow-tester`, `decision-auditor`, `security-reviewer`, `db-reviewer`,
`ui-reviewer`, `screen-auditor`, `privacy-auditor`, `turkish-ui-copy`, `requirements-tracer` → düzeltme turu →
`/owner-review` ile sahibe onay sayfası. Sonra sahibe: ne yapıldı, açık sorular, gerçek cihazda denenecekler listesi.
