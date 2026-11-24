---
name: requirement-change
description: >-
  Gereksinim kataloğunu (docs/plan/01-gereksinimler.md) yalnızca sahibin açık isteğiyle
  değiştirmenin yolu. Sahip bir gereksinimi değiştirmeyi onayladığında kullanın.
---

# Gereksinim Değişikliği (`requirement-change`)

Bu beceri **yalnızca sahip açıkça gereksinim değişikliği istediğinde veya onayladığında** uygulanır. `protect-files` koruması `edit_file` / `write_file` ile `docs/plan/01-gereksinimler.md` üzerine doğrudan yazmayı engeller; değişiklik aşağıdaki yolla yapılır:

1. Değişecek `G-xx` satırını ve ona atıf yapan belgeleri listele (`docs/plan/fazlar/`).
2. Sahibe değişikliği tek cümleyle özetle ve açık onay al (sahip mesajında zaten açıkça onayladıysa atlanır).
3. Onay sonrası yeni içeriği geçici scratch klasörüne yaz, ardından kontrollü biçimde `docs/plan/01-gereksinimler.md` hedefine kopyala (`cp <scratch>/01-gereksinimler.md docs/plan/01-gereksinimler.md`). Satır sonuna `(değişti: YYYY-MM-DD)` ekle; kaldırılan madde satırı silinmez, `~~üstü çizili~~` + "(kaldırıldı)" yapılır.
4. Etkilenen karar kaydını (`docs/plan/06-kararlar.md`) ve testleri güncelle.
5. Commit mesajı: `docs(req): change G-xx — <kısa açıklama>`.
