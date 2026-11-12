---
name: requirement-change
description: Gereksinim kataloğunu (docs/plan/01-gereksinimler.md) sahibin açık isteğiyle değiştirmenin tek yolu. "/requirement-change G-37 'yeni metin'" veya "gereksinimi değiştir".
argument-hint: "[G-xx] [açıklama]"
disable-model-invocation: true
allowed-tools: Bash(cp *) Bash(grep *) Bash(git diff *)
---

Bu beceri yalnızca sahip gereksinim değişikliği istediğinde çalışır. `protect-files` kancası Edit/Write ile bu dosyaya
yazmayı engeller; sahibin isteği üzerine yapılan değişiklik aşağıdaki yolla girer.

1. Değişecek `G-xx` satırını ve ona atıf yapan faz dosyalarını listele: `grep -rn "G-xx" docs/plan/fazlar`.
2. Sahibe değişikliği tek cümleyle özetle ve onay iste. (Sahip mesajında değişikliği zaten açıkça yazdıysa bu adım atlanır.)
3. Dosyanın yeni halini **scratchpad dizinine** yaz (Write ile; o yol korumalı değildir), sonra Bash ile kopyala:
   `cp <scratchpad>/01-gereksinimler.md docs/plan/01-gereksinimler.md`. Satır sonuna `(değişti: YYYY-MM-DD)` ekle; silinen madde satırı kalır ve `~~üstü çizili~~` + "(kaldırıldı)" olur.
4. Etkilenen faz dosyalarındaki teslimat/kabul maddelerini ve ilgili testleri güncelle; `06-kararlar.md` "Sahip cevapları" bölümüne not düş.
5. Commit mesajı: `docs(req): change G-xx — <kısa açıklama>`.
