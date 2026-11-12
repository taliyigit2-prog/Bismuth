# Oda durumu ve arıza

**Oda durumu** ekranı her odanın temizlik durumunu, odada kim kaldığını, bugünkü giriş‑çıkışı, arızaları ve satışa kapalı olup olmadığını tek bakışta gösterir. **Arızalar** ekranı ise odalardaki ve ortak alanlardaki sorunları fotoğrafıyla kaydeder.

## Oda durumları {#room-states}

Her odanın bir durumu vardır:

- **Temiz**: oda hazır, satılabilir.
- **Kirli**: temizlenmesi gerekiyor. Çıkış yapılınca oda **kendiliğinden** kirli olur.
- **Kontrol edildi**: temizlik kontrol edildi (isteğe bağlı bir adım).
- **Bakımda**: odada bakım var; oda takvimde satışa kapanır.
- **Kullanım dışı**: oda kullanılamaz; takvimde satışa kapanır.

## Kat planı {#floor-plan}

Sol menüde **Günlük işler → Oda durumu**'nu açın. Odalar kat kat kutular hâlinde görünür.

![Oda durumu, kat planı](rooms)

- Kutunun rengi ve yazısı durumu söyler; içinde odadaki misafir, **Bugün giriş**, **Bugün çıkış**, açık arıza sayısı ve **Satışa kapalı** bilgisi çıkar.
- Üstteki süzgeçle yalnız bir durumdaki odaları görün (örneğin yalnız kirliler).
- **Kat planı** ve **Liste** düğmeleri iki görünüm arasında geçer. Listede son değişikliği kimin yaptığı ve derin temizlik sayacı da yazar.

## Odayı temiz yapmak {#mark-clean}

Kat görevlisi odayı temizleyince (ya da WhatsApp'ta "302+" yazınca):

1. Odanın kutusundaki **Temizlendi** düğmesine basın.
2. "Oda 302 “Temiz” olarak işaretlendi" yazar.

Başka bir durum seçmek için odaya tıklayın; açılan pencerede **Durumu değiştir** altından durumu seçin. **Not** alanına kısa bir not yazabilirsiniz (örneğin "çarşaf eksik"); durum değişince not silinir.

> [!tip]
> **Bakımda** ya da **Kullanım dışı** seçilen oda takvimde kendiliğinden satışa kapanır; başka bir durum seçince yeniden satılır. Oda bu gece doluysa kapatılamaz; misafir çıkınca durumu yeniden seçin.

## Arıza bildirmek {#issues}

Odada ya da ortak alanda bir sorun görülünce (kırık klozet kapağı, akan musluk, yanmayan lamba):

1. Sol menüde **İşletme → Arızalar**'ı açın ve **Arıza bildir**'e basın.
2. **Nerede?**: **Oda** seçip odayı işaretleyin ya da **Genel alan** seçip yeri yazın (lobi, çatı, merdiven).
3. **Kısa başlık** yazın (örneğin "Tuvalet kapağı kırık") ve isterseniz **Açıklama**.
4. **Önem**: **Düşük**, **Orta** ya da **Acil**.
5. Oda kullanılamayacaksa **Odayı satışa kapat**'ı işaretleyin; arıza çözülene kadar oda takvimde kapalı görünür.
6. **Fotoğraflar**'a fotoğraf ekleyin (telefonla çekip ekleyebilirsiniz).
7. Kaydedin.

![Arıza bildir penceresi](issue-dialog)

Arıza resepsiyon ve sahip tarafından hemen görülür: Bugün ekranında, takvimde oda numarasının yanındaki anahtar simgesinde ve kat planında.

## Arızayı planlamak ve kapatmak {#resolve-issue}

**Arızalar** ekranında arızaya tıklayın:

- **Planla**: **Hangi gün?** ve **Kim yapacak?** (örneğin "tesisatçı") yazıp **Planı kaydet**'e basın. Arıza **Planlandı** olur.
- Onarım bitince **Çözüldü olarak kapat** altında **Çözüm notu** yazın (örneğin "conta değişti") ve **Çözüldü**'ye basın. Oda satışa kapatılmışsa yeniden açılır.
- Masraf olduysa deftere gider olarak yazın; arıza kaydında tutar tutulmaz.

Çözülmüş arızaların fotoğrafları belli bir süre sonra kendiliğinden silinir (arıza yazısı kalır); hemen silmek için **Fotoğrafları şimdi sil**.

Üstteki süzgeçle **Açık**, **Planlandı**, **Çözüldü** arızaları ayrı ayrı görebilirsiniz.
