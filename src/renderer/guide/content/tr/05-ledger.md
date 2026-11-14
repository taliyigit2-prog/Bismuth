# Defter ve giderler

**Defter ve kasa** ekranı otelin günlük gelir‑gider defteridir: o günün ödemeleri, giderleri, günün özeti ve kasa durumu. Ödemeler rezervasyondan geldiği için deftere bir daha yazılmaz; burada giderleri, oda dışı satışları ve gerekirse rezervasyon ödemelerini girersiniz.

## Defteri açmak {#open-ledger}

Sol menüde **Para → Defter ve kasa**'yı açın. Telefonda alt menüdeki **Kasa** düğmesidir. Ekran bugünle açılır.

![Defter ve kasa](ledger)

- **Gün** ve **Ay** düğmeleri gün görünümüyle ay görünümü arasında geçer.
- Oklarla önceki ya da sonraki güne gidin; tarihe tıklayıp bir gün seçin.
- **Sıralama**: ödemeleri **Yönteme göre** (Nakit, Kredi kartı, IBAN… grupları) ya da **Saate göre** dizer. Seçiminiz sizin için hatırlanır.

## Günün ödemeleri {#ledger-payments}

**Ödemeler** tablosunda o gün alınan her ödeme bir satırdır: saat, oda, misafir, tür (ödeme, kapora, iade), yöntem, kanal, tutar, ana para birimi karşılığı ve kaydeden kişi.

- Satırın başındaki **x**, paranın sahip ya da müdür tarafından teslim alındığını gösterir. Bkz. [Parayı teslim almak](guide:payments#handover).
- "Kur yok" işaretli satır, kaydedildiğinde kuru bilinmeyen dövizli ödemedir; ana para birimi toplamına girmez. Satırı açıp kuru elle yazabilirsiniz.

## Gider eklemek {#add-expense}

Kasadan ya da bankadan çıkan her parayı gider olarak yazın: market, fatura, tamirci, kırtasiye…

1. **Gider ekle**'ye basın.
2. **Açıklama**'yı yazın (örneğin "Market (su, çay, şeker)"). Yazdıkça önceki açıklamalar önerilir; aynı yazımı seçmek raporlarda tek satır olmasını sağlar.
3. **Tutar**'ı ve para birimini yazın.
4. **Bölüm**'ü seçin (örneğin Genel). Sahibin özel giderleri için ayrı bir bölüm olabilir (**Sahip giderleri**); onu yalnız sahip görür. Bu bölümün giderleri **kasadan ödenmez**: sahip kasadaki parayı önce **Teslim al** ile alır, gideri sonra kasa dışından yazar. Böylece kasa her rolde fiziksel kasayla tutar.
5. **Ödeme yöntemi**ni seçin.
6. Para resepsiyon kasasından çıktıysa **Kasadan ödendi** açık kalsın; kasa durumundan düşülür.
7. İsterseniz **Ürün satırları**'na ürün, miktar ve birim fiyat girin. Ürün girerseniz fiyat değişimleri ve "en çok harcama" ürün grubuna göre izlenir.
8. **Kaydet**'e basın.

![Gider penceresi](expense-dialog)

> [!tip]
> Tedarikçiden toplu alım yaptıysanız gideri **Tedarik** ekranındaki **Alım gir** ile yazın; ürün fiyatları da güncellenir. Maaş ve avanslar **Personel** ekranından, çamaşırhane faturası **Çamaşırhane** ekranından gelir; bunlar defterde kilit simgesiyle görünür ve kendi ekranlarından değiştirilir.

Yanlış gideri **Gider işlemleri** düğmesinden **Düzenle** ya da **İptal et** ile düzeltin. İptal edilen gider silinmez, üstü çizili kalır.

## Günün özeti ve gün notu {#day-summary}

**Günün özeti** kutusu ana para birimi karşılığıyla **Gelir**, **Gider** ve **Günün neti**'ni gösterir. **Gün notu**'na o günle ilgili önemli bir şeyi yazın (kasa farkı, izin, olay) ve altındaki **Kaydet**'e basın.

Görme yetkiniz olmayan bir gider bölümü ya da maaş ödemesi varsa ekranda **Kısmi görünüm** yazar; toplamlar yalnız gördüğünüz satırlardan hesaplanır. Kasadan yapılan personel ödemeleri (avans, nakit maaş) kasa hareketi olduğu için kasayı görebilen herkese görünür.

## Ay görünümü {#ledger-month}

**Ay**'a basınca ayın her günü bir satırda görünür: gelir, gider ve net. Üstte **Ay toplamları** vardır. Bir güne tıklayınca **Günü göster** ile o güne geçersiniz.

## Açıklama sözlüğü {#expense-dictionary}

Aynı gider farklı yazılmış olabilir ("market", "Market alışverişi", "MARKET"). **Açıklama sözlüğü**'nü açın; yazımları görür, **Yeniden adlandır** ya da **Birleştir** ile tek ada toplarsınız. Tutarlar değişmez; yalnız raporlardaki gruplama düzelir.

## Gün kapatma {#day-closing}

Bazı oteller her gece günü kapatır; kapanan güne sonradan kimse habersiz kayıt ekleyemez. Bu özellik varsayılan olarak kapalıdır; otel sahibi **Ayarlar → Takvim → Gün kapatma** bölümünden açar.

1. Açıksa defterde o günün üstünde **Günü kapat** düğmesi görünür.
2. Basınca "… kapatılsın mı?" diye sorar; onaylayın.
3. Gün **Kapalı gün** olarak işaretlenir.

Kapalı bir güne kayıt eklemek ya da değiştirmek için yetki gerekir ve **Kapalı gün gerekçesi** yazılır; her değişiklik denetim kaydına girer. Yetkili kişi **Günü yeniden aç** ile günü yeniden açabilir.
