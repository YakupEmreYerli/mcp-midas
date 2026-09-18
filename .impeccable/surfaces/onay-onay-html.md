---
version: 1
slug: "onay-onay-html"
primary_target: "onay/onay.html"
related_targets: []
---

# Onay penceresi (onay/onay.html)

Scope: tek ekran, Operate modu. Yerel masaüstü penceresi (PySide6 QWebEngineView), gerçek para kararı.
Görev: kullanıcı (hesap sahibi), ajanın istediği ALIŞ / SATIŞ / DEĞİŞTİR / İPTAL işlemini birkaç saniyede doğru okuyup Evet ya da Hayır der. Varsayılan Hayır; Esc, kapatma ve 120 sn sessizlik Hayır; Enter Evet'e basmaz.
Soru turu yapılamadı; yön brief'ten çıkarıldı, seed zarının atadığı 7. aday kuruldu.

## Direction contract

THESIS: Onay ekranı bir diyalog kutusu değil, kapaklı emniyet anahtarıdır. Kategorinin varsayılanı (başlık, paragraf, iki eş düğme) reddedilir: işlem tipi ISO 3864 / ANSI Z535 sinyal sözcüğü gibi renkli bir bantta okunur, Evet kapağın altındaki anahtardır ve ancak basılı tutulunca kalkar.
OWN-WORLD: marka kiti Yön A · Tahta (docs/brand/README.md): koyu temada gece zemin #0A0D2A, açık temada kâğıt beyazı tahta; üstte gece künye şeridi (Midas-MCP kelime işareti) aynı zamanda çerçevesiz pencerenin başlık çubuğu (taşıma, kapat = Hayır); tek güvenlik rengi bandı (SATIŞ ve İPTAL kırmızı #D32F4A + beyaz, ALIŞ yükseliş yeşili #22D67E + gece, DEĞİŞTİR altın #F4C24D + gece); geri sayım bandın dibinde ince, düz bir çubuk (Yakup 2026-09-18: noktalı ray değil, eski düz çubuk); Martian Mono sinyal sözcüğü, sembol ve rakamlar, Fira Sans gövde; Hayır Midas mavisi #4959EA; tek cihaz pikseli çizgilerle cetvelli değer tablosu; köşe yarıçapı küçük ve tek.
STORY: Kullanıcı bandın rengini ve sözcüğünü görür, tek cümlelik özeti okur (ne, kaç adet, hangi fiyat), tabloda rakamları ve tahmini tutarı doğrular, değişiklikte eski → yeni satırlarında yalnız değişen satırlar öne çıkar; karar verir.
FIRST VIEWPORT: 560 px genişlik, içerik kadar yükseklik. Üstte tam genişlik sinyal bandı (sol: piktogram + 56 px sinyal sözcüğü; sağ: geri sayım ve bandın altında 120 sn'de boşalan 4 px ray). Altında özet cümlesi, sembol bloğu, cetvelli tablo, alt çizgili tahmini tutar. En altta soru ve eylem çubuğu: solda kapaklı "Evet" (basılı tut, dolgu soldan sağa), sağda geniş, odaklı "Hayır".
FORM: kapaklı emniyet anahtarı + güvenlik işaretlemesi; sıralı listemde 7. aday; seed key 583095ab. Raise'ler: tek kırmızı yalnız tehlike için (Game Boy dörtlü yeşil: pil lambası tek kırmızı); vurgu rengi yalnız eylemde (drawcord pelerin: altın kordon hem vurgu hem kumanda); tek sürekli hareket saat rayı (davul makinesi: kovalayan ışık "şimdi"yi söyler); rakamlar tek ızgarada, tablo hizalı (ASCII: tek katı ızgara); eski → yeni tablosunda ortada etiket rayı (merkez ray dizgisi, rekabetçi aday).
FINISH: incelenmemiş ve belgelenmemiş iş bitmemiştir; bu yapım bitiş incelemesi, karar, DESIGN.md ve kaynağı belirtilmiş her yayın görseliyle biter
