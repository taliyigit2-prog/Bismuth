---
name: qa
description: Tüm kontrolleri (typecheck, lint, birim testleri; istenirse e2e) ayrı bir bağlamda koşar ve kısa bir geçti/kaldı özeti döndürür, uzun test çıktısı ana bağlama taşınmaz. "Kontrolleri çalıştır", "testleri koş", "QA yap", "her şey geçiyor mu", "run the checks", "/qa", "/qa e2e" için.
argument-hint: "[e2e|mobile|all]"
context: fork
agent: general-purpose
model: haiku
allowed-tools: Bash(npm run *) Bash(npm test *) Bash(npx vitest *) Bash(npx playwright *) Bash(git status *) Bash(git diff *)
---

## Durum

!`git status --short | head -20`
!`grep -A25 '"scripts"' package.json 2>/dev/null | head -25`

## Kurallar

1. **Hiçbir dosyayı düzenleme, hiçbir hatayı düzeltme.** Görevin yalnızca çalıştırıp raporlamak; düzeltmeyi ana bağlam yapar.
2. Sıra:
   1. `package.json` içinde `check` betiği varsa önce `npm run check` (typecheck + lint + test; başarıda
      `.claude/.checks-passed` işaretini yazar, `stop-gate` kancası buna bakar).
      - Geçerse üç adım da ✓ sayılır.
      - Kalırsa hangi adımın kaldığını çıktıdan belirle, sonra **kalan** adımları da tek tek koş
        (`npm run typecheck`, `npm run lint`, `npm test`) ki özet üçünü de kapsasın.
   2. `check` yoksa üçünü tek tek koş; biri kalsa da diğerlerini koşmaya devam et.
   3. `$ARGUMENTS` içinde `e2e` ya da `all` varsa `npm run e2e`; `mobile` ya da `all` varsa `npm run e2e:mobile`.
      e2e derlenmiş uygulama istiyor ve bulamıyorsa (ör. `out/` yok) bir kez `npm run build` çalıştırıp tekrar dene.
3. Uzun çıktıyı okurken yalnızca hata satırlarını topla: TypeScript `dosya:satır:sütun TSxxxx`, ESLint `dosya:satır kural`,
   Vitest `FAIL dosya > describe > it` ve ilk beklenti farkı, Playwright `[proje] › dosya:satır › test adı`.
4. Her adımın süresini yaklaşık olarak not et.

## Dönüş biçimi (40 satırı geçme, ham günlük ekleme)

```
## QA özeti — ✓ hepsi geçti | ✗ N adım kaldı
| Adım | Sonuç | Süre | Not |
|---|---|---|---|
| typecheck | ✓/✗ | 12 sn | 3 hata |
| lint | ✓/✗ | 8 sn | |
| test | ✓/✗ | 20 sn | 152 geçti, 2 kaldı |
| e2e (electron) | ✓/✗/koşulmadı | | |
| e2e (mobile) | ✓/✗/koşulmadı | | |

### Başarısızlar (her adımda en fazla 10)
- typecheck: `src/main/x.ts:12:5 TS2322 ...`
- test: `src/shared/money.test.ts > Money > kuruşu yuvarlar` — beklenen 250050, gelen 250049
- e2e: `[mobile] › tests/e2e/shell.spec.ts:20 › alt gezinme görünür`

.checks-passed: güncellendi / güncellenmedi
```
