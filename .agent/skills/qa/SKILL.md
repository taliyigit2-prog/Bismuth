---
name: qa
description: >-
  Tüm kontrolleri (typecheck, lint, format:check, birim testleri, koruma testleri; istenirse
  dosya bazlı e2e) sırayla koşar ve kısa bir geçti/kaldı özeti çıkarır. "Kontrolleri çalıştır",
  "testleri koş", "QA yap" isteklerinde kullanın.
---

# Kalite ve Doğrulama Rehberi (`qa`)

## Kurallar

1. **Ağır işleri aynı anda tek çalıştır** (sahibin Mac'i bellek kısıtlıdır).
2. **Sıra**:
   1. `npm run check` (`typecheck` → `lint` → `format:check` → `test`; başarıda `.cache/.checks-passed` işaretini yazar).
   2. Kalırsa hata veren adımı belirle ve ilgili adımları tek tek koş (`npm run typecheck`, `npm run lint`, `npm run format:check`, `npx vitest run <dosya>`).
   3. Koruma/kanca değişikliklerinde `node scripts/guards/test-guards.mjs` ve çeviri kontrollerinde `npm run i18n:check` çalıştır.
   4. E2E gerekiyorsa önce `npm run build`, ardından bütün takımı değil **ilgili tek e2e dosyasını** koş:
      - `npx playwright test --project=electron tests/e2e/electron/<dosya>.spec.ts`
      - `npx playwright test --project=mobile tests/e2e/mobile/<dosya>.spec.ts`
3. Çıktı özetinde yalnızca dosya/satır hatalarını ve süreleri kısa raporla.
