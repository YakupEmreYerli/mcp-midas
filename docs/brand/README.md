# Midas-MCP marka kiti

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="kilit-koyu.svg">
  <img src="kilit-acik.svg" alt="Midas-MCP" height="64">
</picture>

Kimlik, borsa tahtasının gece ekranından gelir: koyu zemin, kayan kotasyon şeridi, tek
renkli bir bant. Ad bir kotasyon satırı gibi okunur, simge o şeritten alınmış bir kesittir.
Söylediği tek şey şu: **ajan tahtayı okur, emri hazırlar; emir, sen onaylamadan Midas'a
gitmez.**

## Midas'la ilişki

Midas-MCP resmî bir Midas ürünü değildir; Midas Menkul Değerler A.Ş. ya da Midas Finansal
Teknolojiler A.Ş. ile bağlantısı yoktur. Bu yüzden:

- Midas'ın logosu, amblemi, yazı biçimi ya da ekran görüntüleri **kullanılmaz**, taklit
  edilmez; logomuz Midas logosuna benzetilmez.
- Ad her zaman **Midas-MCP** olarak, tireyle ve "MCP" ile birlikte yazılır. Tek başına
  "Midas" ürün adı olarak kullanılmaz.
- Ana renk Midas mavisine yakın bir tondur (`#4959EA`). Bu bilinçli bir tercihtir: aracın
  hangi hizmetle çalıştığını hatırlatır. Resmîlik ya da onay ima etmez; renk hiçbir yerde
  Midas'ın adı ya da işaretiyle yan yana "resmî" izlenimi verecek biçimde kullanılmaz.
- Vitrin görsellerinde "Resmî değildir" ibaresi bulunur ve kaldırılmaz.

## Logo

| Dosya | Kullanım |
| --- | --- |
| [`logo.svg`](logo.svg) | 32 px ve üstü; README başlığı, sunumlar |
| [`logo-16.svg`](logo-16.svg) | Yalnız 16 px; nokta sıraları bu ölçekte kaybolduğu için sadeleştirilmiş |
| `logo-16.png` … `logo-1024.png` | 16, 32, 128, 256, 512, 1024 px kare PNG |
| [`favicon.ico`](favicon.ico) | 16, 32 ve 48 px tek dosyada |
| [`kilit-acik.svg`](kilit-acik.svg), [`kilit-koyu.svg`](kilit-koyu.svg) | Yatay kilit (simge + ad): açık zeminde `acik`, koyu zeminde `koyu`; PNG'leri 256 px yükseklikte |
| [`yazi-acik.svg`](yazi-acik.svg), [`yazi-koyu.svg`](yazi-koyu.svg) | Yalnız kelime işareti (ad + yükseliş oku, karosuz): README başlığı, `<picture>` ile temaya göre |

**Tahta simgesi:** gece mavisi karo, üstte ve altta soluk kotasyon noktaları, ortada karoyu
enine kesen Midas mavisi şerit. Şeridin içinde yeşil yükseliş oku ve üç kotasyon hücresi.
Yatay kilitte ad Martian Mono 700 ile yazılır, "MCP" mavi, sonunda yükseliş oku.

Logo SVG'lerindeki yazı yola çevrilmiştir; font kurulu olmadan da aynı görünür.

<table>
  <tr>
    <td align="center"><img src="logo.svg" width="128" alt=""><br><sub>128</sub></td>
    <td align="center"><img src="logo.svg" width="48" alt=""><br><sub>48</sub></td>
    <td align="center"><img src="logo.svg" width="32" alt=""><br><sub>32</sub></td>
    <td align="center"><img src="logo-16.svg" width="16" alt=""><br><sub>16</sub></td>
  </tr>
</table>

### Yapılmaması gerekenler

- Karo yeniden renklendirilmez; açık zeminde de koyu kalır (kendi kenar çizgisi vardır).
- Şerit, ok ya da hücreler çıkarılmaz, yer değiştirmez; ok aşağı döndürülmez.
- Logo döndürülmez, esnetilmez; gölge, degrade, parıltı ya da çerçeve eklenmez.
- Ad başka bir yazı tipiyle yeniden dizilmez; kilit dosyası olduğu gibi kullanılır.
- Kilidin çevresinde simge yüksekliğinin en az dörtte biri kadar boşluk bırakılır.
- 24 px'in altında `logo.svg` yerine `logo-16.svg` kullanılır.

## Renkler

| Ad | Değer | Rol |
| --- | --- | --- |
| Midas mavisi | `#4959EA` | Ana renk: şerit, bant, "MCP", rozetler |
| Gece | `#0A0D2A` | Zemin, logo karosu |
| Panel | `#151A45` | İkincil yüzey, alt şerit |
| Çizgi | `#262C63` | Kolon çizgileri, kenarlar, soluk noktalar |
| Buz | `#E1E4FF` | Koyu zeminde ana yazı |
| Soluk | `#8E95C8` | Koyu zeminde ikincil yazı, dipnot |
| Gök | `#8C96F6` | Koyu zeminde mavi yazı ("MCP", ajan etiketi) |
| Yükseliş | `#22D67E` | Yalnız artış oku ve olumlu değişim |
| Yükseliş (açık) | `#0B8A55` | Açık zeminde yükseliş oku |
| Düşüş | `#FF5468` | Yalnız düşüş oku ve olumsuz değişim |
| Altın | `#F4C24D` | Tek nokta: senin onayın, "temsilî" etiketi |

**Kontrast (WCAG):** Buz / Gece 15,2:1 · Soluk / Gece 6,6:1 · Gök / Gece 7,1:1 · beyaz /
Midas mavisi 5,4:1 (AA) · Altın / Gece 11,5:1. Midas mavisi / Gece yalnız 3,5:1'dir: koyu
zeminde mavi **yazı** için `#8C96F6` kullanılır, `#4959EA` yalnız dolgu ve büyük grafik
öğedir. `#0B8A55` beyaz üzerinde 4,4:1'dir; yalnız grafik (ok) içindir, gövde metni
olmaz.

Yeşil ve kırmızı yalnız yön bildirir, tek başına anlam taşımaz: her zaman ok yönü ya da
sözcükle birlikte kullanılır.

## Yazı

| Aile | Nerede | Lisans |
| --- | --- | --- |
| [Martian Mono](https://github.com/evilmartians/mono) | Logo, kilit, vitrin görselleri, onay penceresinde sinyal sözcüğü, sembol, rakam ve kimlikler (başlık 700–800, metin 400–500; genişlik ekseni 87,5–112,5) | SIL OFL 1.1 — [`fontlar/LICENSE-MartianMono.txt`](fontlar/LICENSE-MartianMono.txt) |
| [Fira Sans](https://github.com/mozilla/Fira) | Onay penceresinde gövde metni ve ₺ glifi (Martian Mono'da ₺ yoktur) | SIL OFL 1.1 — [`fontlar/LICENSE-FiraSans.txt`](fontlar/LICENSE-FiraSans.txt) |

Logo yazısı yola çevrilidir, font gerektirmez. Onay penceresi ağa çıkmadığı için Martian
Mono'nun Latin + Türkçe alt kümesini depoda taşır ([`onay/fontlar/`](../../onay/fontlar/),
OFL lisans metniyle) ve sayfaya `data:` URL olarak gömer; Fira Sans sistemden gelir. Rakamlar her yerde tablo rakamıdır (`tabular-nums`); para Türkçe biçimde yazılır
(`₺1.234,56`, `%2,40`).

Onay penceresinin kendi tasarım sistemi vardır ([`DESIGN.md`](../../DESIGN.md)). Pencere
markayı taşır: gece zemin, Midas mavisi Hayır düğmesi, Martian Mono rakamlar, üstte künye
şeridi ve kotasyon noktalarından geri sayım. İşlem tipi (ALIŞ, SATIŞ, DEĞİŞTİR, İPTAL) ise
marka renginden ayrı, tek bir sinyal bandıyla söylenir: SATIŞ ve İPTAL kırmızı zeminde beyaz,
ALIŞ yeşil, DEĞİŞTİR altın zeminde gece yazı; renk her zaman sözcük ve piktogramla gelir.

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
| [`../vitrin/hero.png`](../vitrin/hero.png) | 1760×920 (880×460 @2x) | README başlık görseli: iki onay penceresi, tahta şeritleri |
| [`../vitrin/okuma.png`](../vitrin/okuma.png) | 1760×1144 | Temsilî ajan oturumu: işlem geçmişi ve portföy okuma |
| [`../vitrin/emir-kapilari.png`](../vitrin/emir-kapilari.png) | 1760×820 | Bir emrin geçtiği beş kapı |
| [`../vitrin/onay-iptal-koyu.png`](../vitrin/onay-iptal-koyu.png), [`-acik`](../vitrin/onay-iptal-acik.png) | 560×832 | Onay penceresi, iki tema, örnek veri |
| [`../social-preview.png`](../social-preview.png) | 1280×640 | GitHub sosyal önizleme |

Şeritlerdeki semboller gerçek BIST kodlarıdır; fiyatlar, değişimler ve işlemler
uydurmadır ve her görselde "temsilî" ya da "örnek veri" ibaresi bulunur. Pencere
görüntülerindeki hesap ve emir kimlikleri örnektir.
