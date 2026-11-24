---
trigger: model_decision
description: Apply when writing or running unit tests, factories, or Playwright E2E specs (**/*.test.ts, **/*.test.tsx, tests/**).
---

# Test Kuralları

- Birim: Vitest; dosya adı `x.test.ts` kaynağın yanında; iş kuralları `src/shared/domain/*.test.ts`, servisler `src/main/services/*.test.ts` (`:memory:` SQLite fabrikası `tests/factories/db.ts`).
- Test adı davranışı anlatır: `it('ödeme 2000 ise ilk gece ödendi, diğerleri ödenmedi')`.
- Excel'den doğrulanmış sayılar değişmez test verisidir (`03-mimari.md` §6): 31.500, 2.328, 6.667, 5.333, 37.300.
- Yetki testleri: her yeni servis metodu için en az bir "yetkisiz rol → PERMISSION_DENIED" testi.
- E2E: Playwright `_electron.launch`; senaryolar `tests/e2e/electron/*.spec.ts` ve `tests/e2e/mobile/*.spec.ts`; temiz `BISMUTH_USER_DATA` klasörüyle başlar. Düşük bellekli Mac'te e2e dosyaları tek tek çalıştırılır.
- Ağ kapalı testi: `network.enabled=false` iken istek sayacı 0.
- Sahte veri: `scripts/seed-demo.ts`; gerçek isim/para/kimlik içermez.
