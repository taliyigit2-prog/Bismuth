---
name: recurring-copy-errors
description: Tekrarlayan Bismuth metin hataları (ASCII tire, eylem adı tutarsızlığı, yetkisiz mesajda yönlendirme eksikliği, ru düğme/seçenek uyumsuzluğu); P17a incelemesinden.
metadata:
  type: feedback
---

Bismuth arayüz metinlerinde tekrar eden hatalar:

- Aynı kavram için iki eylem adı: "Çıkış yap" (calendar.panel.checkOut) yerine "Çıkışa geç" yazılmış (booking.giveup.checkoutConfirm). Eylem adı, panel düğmesiyle aynı olmalı.
- Kısa tire yerine ASCII "-" kullanımı: "giriş-çıkış". Doğrusu "giriş‑çıkış" (U+2011), tüm dosyada böyle.
- Yetkisiz mesajı yalnız "X yetkiniz yok." diye bitiyor; "Otel sahibine ya da müdüre başvurun." eklenmeli.
- ru'da seçenek etiketi ile düğme etiketi farklı ifade ediliyor ("Отложить: ожидает возврата" / "Отложить до возврата").
- Alan etiketi "neden", hata metni "gerekçe" (errors.reasonRequired, ortak anahtar; kapsam geniş, sahip kararı).
- en menü adı geçmiş zamanlı: "Gave up and refund"; kılavuzla birlikte değişmeli.

**Why:** P17a (commit 41e5b6b) incelemesinde bulundu.
**How to apply:** Yeni booking/calendar metinlerinde bu kalıpları ara; düğme adını panel düğmesiyle eşle.
