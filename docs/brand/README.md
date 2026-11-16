# midas-mcp marka kiti

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="kilit-koyu.svg">
  <img src="kilit-acik.svg" alt="midas-mcp" height="64">
</picture>

Kimlik bir kapıdır. Ajan tahtayı okur ve emri hazırlar; emir kapıda bekler, sen onaylayana
kadar içeri geçmez. Logo bunu çizer: iki direk ve aralarında bekleyen tek nokta. Söylediği
tek şey şu: **ajan emri hazırlar, emir sen onaylamadan Midas'a gitmez.**

## Midas'la ilişki

midas-mcp resmî bir Midas ürünü değildir; Midas Menkul Değerler A.Ş. ya da Midas Finansal
Teknolojiler A.Ş. ile bağlantısı yoktur. Bu yüzden:

- Midas'ın logosu, amblemi, yazı biçimi ya da ekran görüntüleri **kullanılmaz**, taklit
  edilmez; logomuz Midas logosuna benzetilmez.
- Ad her zaman **midas-mcp** olarak, küçük harfle, tireyle ve "mcp" ile birlikte yazılır (depo
  adıyla aynı). Tek başına "Midas" ürün adı olarak kullanılmaz; "Midas" yalnız aracı kurumu
  anlatır.
- Renk ailesi Midas mavisine yakın bir tondan kurulur (`#4959EA`). Bu bilinçli bir selamdır:
  aracın hangi hizmetle çalıştığını hatırlatır. Resmîlik ya da onay ima etmez; renk hiçbir
  yerde Midas'ın adı ya da işaretiyle yan yana "resmî" izlenimi verecek biçimde kullanılmaz.
- Vitrin görsellerinde ve banner'da "Resmî değildir" ibaresi bulunur ve kaldırılmaz.

## Logo

| Dosya | Kullanım |
| --- | --- |
| [`logo.svg`](logo.svg) | 24 px ve üstü; README başlığı, sunumlar, pencere simgesi |
| [`logo-16.svg`](logo-16.svg) | Yalnız 16 px; direkler kalın, nokta büyük, kenar çizgisi yok |
| `logo-16.png` … `logo-1024.png` | 16, 32, 128, 256, 512, 1024 px kare PNG |
| [`favicon.ico`](favicon.ico) | 16, 32 ve 48 px tek dosyada |
| [`kilit-acik.svg`](kilit-acik.svg), [`kilit-koyu.svg`](kilit-koyu.svg) | Yatay kilit (simge + ad): açık zeminde `acik`, koyu zeminde `koyu`; PNG'leri 256 px yükseklikte |
| [`yazi-acik.svg`](yazi-acik.svg), [`yazi-koyu.svg`](yazi-koyu.svg) | Yalnız kelime işareti (karosuz): README başlığı, `<picture>` ile temaya göre |

**Kapı simgesi:** gece mavisi yuvarlak köşeli karo, içinde iki beyaz direk ve tam ortalarında
marka mavisi bir nokta. Nokta emirdir; direklerin arasında, senin kararını bekler. Koyu
zeminde kaybolmasın diye karonun içinde ince bir `#262C63` kenar çizgisi vardır (`logo.svg`
ve `kilit-koyu.svg`). Kelime işareti Geist 620 ile yazılır: "midas" gece (koyuda buz),
"-mcp" marka mavisi (koyuda gök).

Logo SVG'lerindeki yazı yola çevrilmiştir; font kurulu olmadan da aynı görünür. SVG'leri
[`logo-uret.py`](logo-uret.py) üretir (fonttools gerekir); PNG'ler ve favicon:

```bash
rsvg-convert -w 16 -h 16 logo-16.svg -o logo-16.png
for s in 32 128 256 512 1024; do rsvg-convert -w $s -h $s logo.svg -o logo-$s.png; done
for k in acik koyu; do rsvg-convert -h 256 kilit-$k.svg -o kilit-$k.png; done
```

<table>
  <tr>
    <td align="center"><img src="logo.svg" width="128" alt=""><br><sub>128</sub></td>
    <td align="center"><img src="logo.svg" width="48" alt=""><br><sub>48</sub></td>
    <td align="center"><img src="logo.svg" width="32" alt=""><br><sub>32</sub></td>
    <td align="center"><img src="logo-16.svg" width="16" alt=""><br><sub>16</sub></td>
  </tr>
</table>

### Yapılmaması gerekenler

- Karo yeniden renklendirilmez; açık zeminde de gece mavisi kalır.
- Direkler ya da nokta çıkarılmaz, yer değiştirmez; nokta direklerin dışına taşınmaz.
- Logo döndürülmez, esnetilmez; gölge, degrade, parıltı ya da çerçeve eklenmez.
- Ad başka bir yazı tipiyle yeniden dizilmez, büyük harfle ("Midas-MCP") yazılmaz; kilit dosyası olduğu gibi kullanılır.
- Logomuz Midas'ın logosuyla yan yana, ortak bir işaret gibi kullanılmaz.
- Kilidin çevresinde simge yüksekliğinin en az dörtte biri kadar boşluk bırakılır.
- 24 px'in altında `logo.svg` yerine `logo-16.svg` kullanılır.

## Renkler

| Ad | Değer | Rol |
| --- | --- | --- |
| Marka mavisi | `#4959EA` | Ana renk: logo noktası, Hayır düğmesi, açık zeminde "-mcp", rozetler |
| Gece | `#0A0D2A` | Koyu zemin, logo karosu, açık zeminde ana yazı |
| Panel | `#151A45` | Koyu ikincil yüzey |
| Çizgi | `#262C63` | Koyu zeminde çizgiler, kenarlar, karo kenarı |
| Buz | `#E1E4FF` | Koyu zeminde ana yazı |
| Soluk | `#8E95C8` | Koyu zeminde ikincil yazı, dipnot |
| Gök | `#8C96F6` | Koyu zeminde mavi yazı ("-mcp", ajan etiketi) |
| Kâğıt | `#F5F6FC` | Açık zemin |
| Kâğıt çizgi | `#DCDFF2` | Açık zeminde çizgiler |
| Mürekkep ikincil | `#3D4372` | Açık zeminde ikincil yazı |
| Mürekkep soluk | `#5B6194` | Açık zeminde soluk yazı |
| Yükseliş | `#22D67E` | Yalnız alış, artış ve olumlu değişim |
| Düşüş | `#FF5468` | Yalnız satış, düşüş ve olumsuz değişim (koyu zeminde) |
| Altın | `#F4C24D` | Yalnız onay penceresindeki DEĞİŞTİR bandı ve bekleyen emir durumu |

**Kontrast (WCAG):** Buz / Gece 15,2:1 · Soluk / Gece 6,6:1 · Gök / Gece 7,1:1 · Gök /
Panel 6,2:1 · beyaz / marka mavisi 5,4:1 (AA) · marka mavisi / Kâğıt 5,0:1 · Gece / Kâğıt
17,6:1 · Mürekkep ikincil / Kâğıt 8,7:1 · Mürekkep soluk / Kâğıt 5,4:1 · Gece / Altın
11,5:1. Marka mavisi / Gece yalnız 3,5:1'dir: koyu zeminde mavi **yazı** için `#8C96F6`
kullanılır, `#4959EA` orada yalnız dolgu ve grafik öğedir (logo noktası).

Yeşil, kırmızı ve altın güvenlik renkleridir; yalnız yön ya da işlem tipi bildirir, tek
başına anlam taşımaz: her zaman ok, sözcük ya da piktogramla birlikte kullanılır. Marka
mavisi güvenlik anlamı taşımaz; güvenlik renkleri de marka işi yapmaz.

## Yazı

| Aile | Nerede | Lisans |
| --- | --- | --- |
| [Geist](https://github.com/vercel/geist-font) | Kelime işareti (620), banner ve vitrin başlıkları, onay penceresinde cümleler, düğmeler, etiketler | SIL OFL 1.1 — [`fontlar/LICENSE-Geist.txt`](fontlar/LICENSE-Geist.txt) |
| [Geist Mono](https://github.com/vercel/geist-font) | Rakamlar, semboller, sinyal sözcüğü (ALIŞ, SATIŞ…), araç adları ve kimlik kodları | SIL OFL 1.1 — aynı lisans |
| [Inter](https://github.com/rsms/inter) (yalnız ₺) | Geist ailesinde ₺ glifi yok; onay penceresi ve vitrin ₺'yi Inter SemiBold'un tek glifli alt kümesinden alır | SIL OFL 1.1 — [`onay/fontlar/OFL-Inter.txt`](../../onay/fontlar/OFL-Inter.txt) |

Logo yazısı yola çevrilidir, font gerektirmez. Onay penceresi ağa çıkmadığı için Geist ve
Geist Mono'nun Latin + Türkçe alt kümesini ve ₺ köprüsünü depoda taşır
([`onay/fontlar/`](../../onay/fontlar/), OFL lisans metinleriyle) ve sayfaya `data:` URL olarak
gömer. Rakamlar her yerde tablo rakamıdır (`tabular-nums`); para Türkçe biçimde yazılır
(`₺1.234,56`, `%2,40`).

Onay penceresinin kendi tasarım sistemi vardır ([`DESIGN.md`](../../DESIGN.md)). Pencere
markayı taşır: gece zemin, marka mavisi Hayır düğmesi, Geist Mono rakamlar, üstte kapı
işaretli künye şeridi. İşlem tipi (ALIŞ, SATIŞ, DEĞİŞTİR, İPTAL) ise marka renginden ayrı,
tek bir sinyal bandıyla söylenir: SATIŞ ve İPTAL kırmızı zeminde beyaz, ALIŞ yeşil, DEĞİŞTİR
altın zeminde gece yazı; renk her zaman sözcük ve piktogramla gelir.

## Ses ve üslup

- **Kısa, net Türkçe.** Bir cümle bir iş söyler. "Emir, sen onaylamadan Midas'a gitmez."
- **Kullanıcıya "sen" diye hitap edilir**; ajan "ajan"dır, sunucu "sunucu".
- **Güvence abartılmaz.** "Güvenli", "garantili", "akıllı" gibi sıfatlar yerine mekanizma
  söylenir: varsayılan Hayır, basılı tutulan Evet, 120 saniye.
- **Yatırım dili kullanılmaz.** Al/sat önerisi, getiri vaadi, "fırsat" yoktur. Veri ve
  araç anlatılır.
- Teknik adlar (araç adları, ortam değişkenleri) özgün hâliyle, kod biçiminde yazılır.

## Görseller

| Dosya | Boyut | İçerik |
| --- | --- | --- |
| [`../banner.tr.png`](../banner.tr.png), [`../banner.en.png`](../banner.en.png) | 1280×640 | Banner: her README kendi dilindekini başta gösterir; GitHub sosyal önizlemesi `banner.tr.png` |
| [`../vitrin/okuma.png`](../vitrin/okuma.png) | 1760×1144 | Temsilî ajan oturumu: işlem geçmişi ve portföy okuma |
| [`../vitrin/emir-kapilari.png`](../vitrin/emir-kapilari.png) | 1760×820 | Bir emrin geçtiği beş kapı ve denetim günlüğü |
| [`../vitrin/onay-iptal-koyu.png`](../vitrin/onay-iptal-koyu.png), [`-acik`](../vitrin/onay-iptal-acik.png) | 560×832 | Onay penceresi, iki tema, örnek veri |

Semboller gerçek BIST kodlarıdır; fiyatlar, değişimler ve işlemler uydurmadır ve her
görselde "temsilî" ya da "örnek veri" ibaresi bulunur. Pencere görüntülerindeki hesap ve emir
kimlikleri örnektir.

Hepsi depodaki kaynaktan üretilir, Playwright'ın kendi Chromium'uyla (depo kökünden):

- Banner: [`banner/banner.html`](banner/banner.html) → `node docs/brand/banner/render.mjs`
- Vitrin: [`vitrin/`](vitrin/) altındaki HTML → `node docs/brand/vitrin/render.mjs`
- Onay pencereleri ayrı görsel olarak tutulmaz: [`pencere.mjs`](pencere.mjs)
  [`onay/onay.html`](../../onay/onay.html)'i örnek emirle açıp çeker. Pencereyi her işlem
  tipinde ve iki temada gözle denemek için: `node docs/brand/pencere.mjs <klasör>`.
