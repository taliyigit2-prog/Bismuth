# Tekrarlayan Bismuth Metin Hataları (Tarihsel Notlar)

Bismuth arayüz metinlerinde geçmiş incelemelerde yakalanan hatalar ve yerleşik kararlar:

- Aynı kavram için iki eylem adı: "Çıkış yap" (`calendar.panel.checkOut`) yerine "Çıkışa geç" yazılmamalı; eylem adı panel düğmesiyle aynı olmalı.
- Kısa tire yerine bölünmez tire (U+2011) kullanımı: "giriş‑çıkış".
- Yetkisiz mesajı yalnız "X yetkiniz yok." diye bitmemeli; "Otel sahibine ya da müdüre başvurun." eklenmeli.
- Rusça seçenek etiketi ile düğme etiketi aynı fiil/durum uyumunu korumalı.
- "Gelmedi" tek başına no-show demektir (sözlük: Gelmedi = No-show). Gelecek tarihler veya henüz başlamamış zaman için "henüz başlamadı" / "giriş günü henüz değil" kullanılmalı.
- Saatlik ürün adı dağınık olmamalı: ürün adı **Saatlik satış / Hourly sale / Почасовая продажа**.
- Menü terim kayması: menü öğesi ile ayar/kısayol adı aynı olmalı ("Yakınlaştır" / "Uzaklaştır").
- Rusça çoğul hatası: sayılı isim taşıyan anahtarlarda mutlaka `_one/_few/_many/_other` dört biçim yazılmalı (düz anahtar kullanılacaksa Rusça değerde sayı isme bağlanmadan yazılır).
- Hardcoded sayı veya parça birleştirme (`{t('...')} ({n})`) yasaktır; `{{count}}` enterpolasyonu kullanılmalı.
- Düğme birinci tekil şahıs ("Gördüm", "Hallettim", "Bildirdim") yerine emir kipi ("Görüldü olarak işaretle", "Halledildi olarak işaretle") tercih edilmeli; toast bildirimleri ise noktasız kısa geçmiş zaman olmalıdır ("Ödeme kaydedildi").
- "Sayfa" yerine masaüstü programı için "Ekran" terimi kullanılmalı ("Ekranı yenileyin").
- KBS terimi tutarlı olmalı: "KBS bildirimi eksik" ve `{{count}} KBS eksik`.
- Gerekçe/Neden ayrımı: doğrulama hatası `errors.reasonRequired` ("Bir gerekçe yazın.") ile uyumlu alan etiketleri ("Gerekçe").
