---
name: parallel-build
description: Bir fazın ya da düzeltme turunun işini bağımsız paketlere böler, her paketi kendi worktree'sinde bir feature-builder ajanına verir (aynı anda), sonra dalları ana checkout'ta birleştirir (dosyalar + i18n spec), kontrolleri ve gözden geçiricileri paralel koşar. "İşi paralel yap", "ajanlara dağıt", phase-runner'ın 4. adımı için.
argument-hint: "[faz-no ya da tur adı]"
---

## Ne zaman

Üç ya da daha fazla bağımsız iş varsa (ayrı ekranlar, ayrı servisler, sahip düzeltmeleri). Tek küçük iş ya da
birbirine sıkı bağlı işler (aynı servis + aynı ekran) için bölme; kendin yap.

## 1. Paketle (birleştirme kolay olsun diye)

- Her paket **kendi dosyalarına** sahip: `src/renderer/features/<ad>/`, kendi servisi, kendi testleri. İki paket aynı
  dosyayı değiştirecekse ya birleştir ya ortak kısmı önce sen yap ve commit et (paketler o commit'ten başlar).
- Ortak dosyalar: `src/shared/contract/*` ve `src/main/api` yönlendiricisi çakışmaya en açık olanlar; bir pakete ver
  ya da önce kendin ekle. `src/renderer/i18n/*.json` hiçbir pakette elle değişmez (spec dosyası, aşağıda).
- Migrasyon gereken paket tek olsun; numarayı görev metninde ver.
- Port tablosu (ui:shot / `E2E_PORT`): paket 1 → 47411/47412, 2 → 47421/47422, 3 → 47431/47432, 4 → 47441/47442,
  5 → 47451/47452.

## 2. Ajan ve model seçimi

Model ve çaba **ajan dosyasının ön bilgisinde** sabittir (`.claude/agents/<ad>.md`); burada tekrar yazılmaz, `model`
parametresi verilmez (tablo: `docs/analiz/09-ajan-sistemi.md` §2). Paket → ajan eşlemesi:

| İş | Ajan |
|---|---|
| Takvim, rezervasyon paneli, konaklama/gece kuralları, iptal/iade | `calendar-specialist` |
| Ekran + servis + test (diğer modüller) | `feature-builder` |
| Şema/migrasyon/veri taşıma | `db-migration-builder` (ekran paketinden önce biter) |
| Kamera yan süreci, Python, Kamera sekmesi | `camera-integrator` |
| electron-builder, iş akışı dosyaları, kurulum belgeleri | `packager` |
| Seed/liste, metin, belge, küçük düzeltme | `feature-builder-lite` |
| Alan araştırması | `researcher` |
| Kontroller, e2e, özet | `/qa` |

Aynı anda en çok **2 kodlayan ajan** (bu Codespace 2 çekirdek; 4 çekirdekte 4). Kontrol ajanları kodlayanlar bittikten
sonra, tek mesajda paralel.

## 3. Görev metni (her pakete)

Kısa ve eksiksiz: (1) sahibin/fazın isteği aynen ve anlamı; (2) ilgili dosyalar ve mevcut davranış (yolları ver,
ajan aramakla vakit kaybetmesin); (3) yapılacaklar maddeler hâlinde; (4) dokunabileceği dizinler ve i18n ad
alanları; (5) testler; (6) bakılacak ekran görüntüleri; (7) portlar ve `Claude-Session` satırı. Ortak kurallar
`feature-builder` tanımında; tekrar yazma.

Hepsini **tek mesajda** başlat (`Agent`, `subagent_type: feature-builder`, `run_in_background: true`). Ajan
tanımı oturum başında yüklenir: tür bulunamazsa `general-purpose` + `isolation: worktree` ile başlat ve görev
metnine "önce `.claude/agents/feature-builder.md` dosyasını oku ve ona uy" yaz. Beklerken
başka işe geç (belgeler, araçlar, sonraki paketin hazırlığı); ajan sonuçlarını tahmin etme.

## 4. Birleştir (her ajan bitince)

Önce kolay yol — ajan commit'ini commit etmeden uygula, hepsini toplayıp bir kez kontrol et:

```bash
git cherry-pick -n <commit>              # ajan raporundaki commit; sırayla her paket
git diff --name-only --diff-filter=U     # çakışma var mı
```

- Çakışma yoksa bitti (i18n json'ları çoğu zaman kendiliğinden birleşir).
- Çakışma `src/renderer/i18n/*.json` içindeyse: `git checkout HEAD -- src/renderer/i18n` sonra her paket için
  `npm run i18n:add -- .claude/worktrees/<ajan>/i18n-spec/<ad>.json`.
- Kod dosyasında çakışma: `git diff HEAD <commit> -- <dosya>` ile elle birleştir.
- Sonra `node scripts/i18n-check.mjs`, `npm run check > $S/check.log 2>&1` (S = scratchpad), ilgili e2e. Hepsi
  geçince tek commit (her commit tam kontrol kancası koşturur; birkaç paketi tek commit'te toplamak dakikalar
  kazandırır), mesajda her paketi bir satırla say.
- Temizlik: `W=.claude/worktrees/<ajan>; rm -f $W/node_modules && git worktree remove --force $W && git branch -D
  <dal>`.

## 5. Gözden geçir

UI değiştiyse `ui-reviewer` + `turkish-ui-copy`; servis/şema değiştiyse `db-reviewer`; main/preload/sunucu değiştiyse
`security-reviewer` — hepsi **tek mesajda, paralel**. Bulguları yine paketlere bölüp aynı yolla düzelt.
