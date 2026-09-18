---
name: Midas-MCP emir onayı
description: Ajanın geçemeyeceği insan kapısı; tahtanın gece ekranında kapaklı emniyet anahtarı gibi okunan tek ekranlık onay paneli.
colors:
  midas: "#4959EA"
  gok: "#8C96F6"
  gece: "#0A0D2A"
  gece-panel: "#151A45"
  gece-cizgi: "#262C63"
  gece-cizgi-guclu: "#C4C9EE"
  buz: "#E1E4FF"
  buz-ikincil: "#B6BBE3"
  gece-soluk: "#8E95C8"
  kagit: "#F5F6FC"
  beyaz: "#FFFFFF"
  murekkep-ikincil: "#3D4372"
  murekkep-soluk: "#5B6194"
  kagit-cizgi: "#DCDFF2"
  tehlike: "#D32F4A"
  tehlike-ton-acik: "#C2253F"
  dusus: "#FF5468"
  yukselis: "#22D67E"
  alis-ton-acik: "#087A4B"
  altin: "#F4C24D"
  dikkat-ton-acik: "#8A6200"
typography:
  display:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 100"
  headline:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 100"
  sayac:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontFeature: "tnum, lnum"
  deger:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "14px"
    fontWeight: 500
    fontFeature: "tnum, lnum"
  marka:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 112.5"
  kod:
    fontFamily: "Midas TL, Martian Mono, Fira Sans, DejaVu Sans Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    fontVariation: "'wdth' 87.5"
  title:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.38
  body:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum, lnum"
  label:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
  column-head:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  etiket: "4px"
  r: "6px"
  pencere-r: "10px"
spacing:
  etiket: "6px"
  sm: "12px"
  md: "14px"
  lg: "20px"
  bosluk: "28px"
components:
  kunye-seridi:
    backgroundColor: "{colors.gece}"
    textColor: "{colors.gece-soluk}"
    typography: "{typography.kod}"
    height: "28px"
    padding: "0 28px"
  kunye-seridi-koyu:
    backgroundColor: "{colors.gece-panel}"
    textColor: "{colors.gece-soluk}"
  sinyal-bandi-tehlike:
    backgroundColor: "{colors.tehlike}"
    textColor: "{colors.beyaz}"
    typography: "{typography.display}"
    padding: "20px 28px 30px"
  sinyal-bandi-alis:
    backgroundColor: "{colors.yukselis}"
    textColor: "{colors.gece}"
    typography: "{typography.display}"
    padding: "20px 28px 30px"
  sinyal-bandi-dikkat:
    backgroundColor: "{colors.altin}"
    textColor: "{colors.gece}"
    typography: "{typography.display}"
    padding: "20px 28px 30px"
  button-hayir:
    backgroundColor: "{colors.midas}"
    textColor: "{colors.beyaz}"
    rounded: "{rounded.r}"
    height: "52px"
  button-evet-tehlike:
    backgroundColor: "transparent"
    textColor: "{colors.tehlike-ton-acik}"
    rounded: "{rounded.r}"
    height: "52px"
  button-evet-tehlike-koyu:
    backgroundColor: "transparent"
    textColor: "{colors.dusus}"
  button-evet-tehlike-tutuluyor:
    backgroundColor: "{colors.tehlike}"
    textColor: "{colors.beyaz}"
  etiket:
    backgroundColor: "{colors.beyaz}"
    textColor: "{colors.murekkep-ikincil}"
    typography: "{typography.label}"
    rounded: "{rounded.etiket}"
    padding: "0 9px"
    height: "24px"
  etiket-koyu:
    backgroundColor: "{colors.gece-panel}"
    textColor: "{colors.buz-ikincil}"
  eylem-cubugu:
    backgroundColor: "{colors.beyaz}"
    padding: "18px 28px 22px"
  eylem-cubugu-koyu:
    backgroundColor: "{colors.gece-panel}"
---

# Design System: Midas-MCP emir onayı

## Overview

**Creative North Star: "Tahtanın Gece Ekranında Kapaklı Anahtar"**

Onay penceresi bir diyalog kutusu değil, borsa tahtasına takılmış bir emniyet anahtarıdır. En üstte gece zeminli ince bir künye şeridi pencereyi kimin açtığını söyler (Midas-MCP kelime işareti, yeşil yükseliş oku) ve pencerenin başlık çubuğudur: pencere çerçevesizdir, şerit taşır ve sağındaki kapat düğmesi Hayır'dır. Altında işlem tipi, ISO 3864 / ANSI Z535 sinyal sözcüğü gibi tam genişlikte tek renkli bir bantta Martian Mono ile yazılır; bandın dibinde ince, düz bir çubuk geri sayımı taşır. Gövde sakin bir kâğıt ya da gece yüzeyidir: sembol, tutar ve değerler Martian Mono'da, cümleler Fira Sans'ta. En altta Evet taralı kapağın altındaki anahtardır ve ancak basılı tutulunca kalkar; Hayır Midas mavisiyle dolu, geniş ve baştan odaklıdır.

Yoğunluk sıkı ama ferah: 560 px sabit genişlik, içerik kadar yükseklik, her blokta aynı 28 px yatay kenar boşluğu. Panel içte düzdür; derinlik ton basamağı ve tek cihaz pikseli cetvellerle kurulur. Tek gölge pencerenin kendisinindir: çerçevesiz pencere 10 px yuvarlak köşe, 1 px kenar ve masaüstünden ayıran yumuşak bir gölgeyle durur. Tek sürekli hareket geri sayım çubuğunun kısalmasıdır; geri kalan her hareket el hareketine cevaptır.

Renk iki ayrı işe bölünmüştür. Marka (Midas mavisi, gök, gece) kimliği ve reddi taşır; güvenlik renkleri (tehlike kırmızısı, yükseliş yeşili, altın) yalnız işlem tipini söyler ve ekranda bir anda yalnız biri yaşar. İkisi birbirinin işini yapmaz.

**Key Characteristics:**
- Tek güvenlik rengi bandı işlem tipini söz, piktogram ve renkle birlikte söyler.
- Midas mavisi yalnız Hayır dolgusu ve seçim rengidir; güvenlik anlamı taşımaz.
- Künye şeridi iki temada da gece zeminde kalır; logo karosu gibi.
- Martian Mono rakamın, sembolün, kimliğin ve sinyal sözcüğünün yüzüdür; cümleler Fira Sans'tır.
- Geri sayım, bandın dibinde 3 px ince, düz bir çubuğun soldan sağa doğru kısalmasıdır.
- İçte gölgesiz, ton ve 1 px çizgiyle katmanlanan yüzey; küçük, tek köşe yarıçapı. Pencere çerçevesiz, 10 px köşeli ve gölgeli.
- Onay basılı tutma ister; ret dolu, geniş ve varsayılandır.

## Colors

Marka paletinden gelen gece mavisi bir nötr skala, tek marka mavisi ve işlem tipine göre seçilen tek bir güvenlik rengi; tema `html[data-theme]`, güvenlik tonu panelin `data-ton` değeriyle seçilir.

### Primary
- **Midas Mavisi** (`midas`): Hayır düğmesinin dolgusu (üstünde `beyaz`, 5,4:1) ve metin seçimi zemini. Marka ve ret rengidir. Gece zeminde yazı olarak okunmaz (3,5:1); orada mavi yazı gerekiyorsa `gok` kullanılır.
- **Gök** (`gok`): künye şeridindeki "MCP" ve koyu temanın odak halkası (gece üzerinde 7,1:1, panel üzerinde 6,2:1).

### Secondary: güvenlik rengi yuvası
Güvenlik rengi tek bir renk değil, işlem tipine göre dolan bir yuvadır (`--bant`, `--bant-yazi`, `--ton`). Her tonun üç rolü vardır: bant dolgusu, bant üstü yazı ve nötr zemindeki metin tonu (Evet çerçevesi ve yazısı, taralı kapak, değişen değer ve noktası).

- **Tehlike Kırmızısı** (`tehlike`): SATIŞ ve İPTAL bandı, üstünde `beyaz` (4,9:1). Ton açıkta `tehlike-ton-acik`, koyuda `dusus` (gece üzerinde 6,1:1).
- **Yükseliş Yeşili** (`yukselis`): ALIŞ bandı, üstünde `gece` yazı (9,9:1); koyu temada ton da odur. Açık temada ton `alis-ton-acik` (kâğıt üzerinde 5,0:1). Aynı yeşil künye şeridindeki yükseliş okudur.
- **Altın** (`altin`): DEĞİŞTİR bandı, üstünde `gece` yazı (11,5:1); koyu temada ton da odur. Açık temada ton hardal-kahveye iner: `dikkat-ton-acik` (kâğıt üzerinde 5,1:1).

### Neutral
Rollerin iki temadaki karşılığı:

| Rol | Açık tema | Koyu tema |
| --- | --- | --- |
| Zemin | `kagit` | `gece` |
| Yüzey (eylem çubuğu, etiket) | `beyaz` | `gece-panel` |
| Mürekkep (ana metin, tutar) | `gece` | `buz` |
| İkincil metin | `murekkep-ikincil` | `buz-ikincil` |
| Soluk metin | `murekkep-soluk` | `gece-soluk` |
| İnce çizgi | `kagit-cizgi` | `gece-cizgi` |
| Güçlü çizgi (toplam) | `gece` | `gece-cizgi-guclu` |
| Odak halkası | `gece` | `gok` |
| Künye şeridi zemini | `gece` | `gece-panel` |

Künye şeridinin yazısı iki temada da `buz` (kelime işareti) ve `gece-soluk` (not) kalır.

### Named Rules
**The Tek Bant Rule.** Tek Bant kuralı güvenlik renkleri içindir: bir ekranda yalnız biri yaşar ve yalnız üç yerde görünür: sinyal bandı, Evet anahtarı, değişen değer. Künye şeridindeki yükseliş oku markanın parçasıdır, bu sayıma girmez.

**The Mavi Ret Rengidir Rule.** Midas mavisi güvenlik rengi değildir; Hayır'ın dolgusu ve seçim rengidir. Odak halkası, uyarı, bilgi ya da onay için kullanılmaz; odak halkası açıkta gece, koyuda gök'tür.

**The Kırmızı Yalnız Tehlike Rule.** Tehlike kırmızısı yalnız para çıkaran ya da geri dönüşü zor yön (SATIŞ, İPTAL) içindir; hata, vurgu ya da dekor için kullanılmaz.

**The Renk Tek Sinyal Değil Rule.** Güvenlik rengi her zaman sinyal sözcüğü ve piktogramla gelir: tehlike ve dikkat için üçgen uyarı işareti, alış için daire içinde artı.

**The Gece Şerit Rule.** Künye şeridi açık temada da gece zeminde kalır, tıpkı logo karosu gibi; kâğıda uyarlanmaz.

## Typography

**Display Font:** Martian Mono (değişken, 100-800 ağırlık, genişlik 75-112,5; `onay/fontlar/MartianMono.woff2`, SIL OFL 1.1), `data:` URL olarak gömülü
**Body Font:** Fira Sans (Noto Sans, DejaVu Sans yedekli), sistemden
**Label/Mono Font:** Martian Mono; yığının başındaki "Midas TL" yüzü yalnız ₺ glifini taşır

**Character:** Tahtanın rakam yüzü ile sakin bir insan yazısı. Martian Mono sinyal sözcüğünü, sembolü ve her rakamı bir kotasyon hücresi gibi dizer; Fira Sans özetleri, soruyu, düğmeleri ve etiketleri teknik ama okunur tutar. Sayfa ağdan hiçbir şey yüklemez: Martian Mono `onay.py` tarafından `data:` URL olarak gömülür (CSP `font-src data:`); dosya yoksa pencere yine açılır ve rakamlar sistem yedeklerine düşer.

### Hierarchy
- **Display** (Martian Mono 800, 46 px, 1, -0.02em): yalnız bandın sinyal sözcüğü (SATIŞ, ALIŞ, DEĞİŞTİR, İPTAL). Tek satır, kırılmaz.
- **Headline** (Martian Mono 700, 28 px, 1.1): enstrüman sembolü.
- **Sayaç** (Martian Mono 600, 24 px, 1): bandın sağındaki geri sayım; altında Fira 12.5 px / 600 "sonra Hayır" notu.
- **Figure** (Martian Mono 700, 22 px, -0.02em): tahmini tutar; toplam satırında sağa hizalı.
- **Değer** (Martian Mono 500, 14 px): tablo değerleri, değişim tablosunun eski ve yeni değerleri (yeni 600, değişmişse 700).
- **Marka** (Martian Mono 700, 12 px, genişlik 112.5): künye şeridindeki "Midas-MCP" kelime işareti.
- **Kod** (Martian Mono 400, 11 px, genişlik 87.5): künye şeridi notu, emir numarası ve hesap kimliği; kimlik kodu seçilebilir tek metindir.
- **Title** (Fira Sans 500, 18 px, 1.38): tek cümlelik özet, `text-wrap: balance`. Soru satırı 600 / 16 px; Hayır 700 / 17 px; Evet 700 / 16 px.
- **Body** (Fira Sans 400, 15 px, 1.45): tablo satır başlıkları, tam ad.
- **Label** (Fira Sans 500, 12.5 px): etiketler, ipucu, Evet'in "basılı tutun" notu (600).
- **Column head** (Fira Sans 600, 12 px, 0.04em, büyük harf): yalnız değişim tablosunun "Şimdi / Sonra" sütun başlıkları.

### Named Rules
**The Mono Kostüm Değil Rule.** Martian Mono yalnız rakam, sembol, kimlik kodu, sinyal sözcüğü ve künye şeridinde kullanılır. Cümle, soru, düğme yazısı, etiket ve satır başlığı Fira Sans'tır.

**The ₺ Köprüsü Rule.** ₺ Martian Mono'da yoktur. Rakam yığınının başındaki "Midas TL" yüzü (`unicode-range: U+20BA`) glifi yerel Fira Sans SemiBold'dan `size-adjust: 116%` ile rakam boyuna getirir; yığın sırası değiştirilmez.

**The Rakam Izgarası Rule.** Tüm sayfa `font-variant-numeric: tabular-nums lining-nums` ile dizilir; tutarlar ve değerler sağa hizalanır, rakamlar alt alta tek ızgarada durur.

## Layout

Tek sütun, 560 px sabit genişlikte panel; çerçevesiz yerel pencere (Wayland, yoksa X11) panelin çevresine 12 px şeffaf gölge payı ekler (584 px); yükseklik içeriğe göre ölçülür (en az 320 px, en çok ekran yüksekliği eksi 80 px) ve pencere o yükseklikte sabitlenir. Yatay kenar boşluğu her blokta aynıdır (`bosluk`, 28 px).

Dikey sıra sabittir: 28 px künye şeridi (solda kelime işareti, sağda not, iki uca yaslı) → tam genişlik sinyal bandı (20 px üst, 30 px alt iç boşluk; alt kenardan 12 px yukarıda 3 px yüksekliğinde geri sayım çubuğu) → içerik bloğu (üst 22 px, bloklar arası 20 px) → üst çizgili eylem çubuğu (22 px aralıkla ayrılır; 18 / 22 px iç boşluk, öğeler arası 14 px).

Bant içinde sol grup (38 px piktogram ve sinyal sözcüğü, 14 px aralık) ile sağda sayaç iki uca yaslanır. Düğmeler iki sütunlu ızgarada 1fr / 1.25fr oranında, 12 px aralıkla durur: solda Evet, sağda daha geniş Hayır. Değişim tablosu 38 / 24 / 38 yüzde sütunlarıyla ortada bir alan rayı taşır: solda şimdiki değer sağa, sağda sonraki değer sola hizalı. Etiketler 6 px aralıkla sarılır.

### Named Rules
**The Tek Cihaz Pikseli Rule.** Cetveller 1 px'tir. Tek istisna, harcanacak paranın üstündeki 2 px güçlü toplam çizgisidir; iptalde tutar yalnız bilgi olduğu için o çizgi de 1 px'e iner.

## Elevation & Depth

Panelin içi tamamen düzdür: pencere gölgesi dışında hiçbir öğede `box-shadow` yoktur. Derinlik iki araçla kurulur: zeminden bir basamak ayrışan yüzey tonu (eylem çubuğu, etiketler; koyu temada künye şeridi de) ve ince cetveller. Durum bildirimi gölgeyle değil dolgu, parlaklık filtresi ve çerçeveyle yapılır.

### Named Rules
**The Gölgesiz Panel Rule.** Yüzeyler gölge almaz; bir katmanı ayırmak gerekiyorsa ton basamağı ya da 1 px çizgi kullanılır. Tek istisna çerçevesiz pencerenin kendi gölgesidir (12 px şeffaf pay içinde, `0 4px 10px -2px`).

## Shapes

Köşe dili küçük ve tektir: düğmeler 6 px (`r`), etiketler 4 px. Künye şeridi ve sinyal bandı köşesizdir, panele tam oturur; panelin (pencerenin) kendisi 10 px (`pencere-r`) yuvarlak köşelidir ve köşeler içeriği kırpar. Yinelenen geometriler tahtadan ve emniyet işaretlemesinden gelir:

- **Geri sayım çubuğu:** 3 px yüksek, 2 px yuvarlatılmış düz çubuk. Yolu bant yazısının yüzde 24'ü ile karıştırılmış bant rengidir, dolu kısım bant yazısı rengindedir (yüzde 92).
- **Çapraz tarama:** 45 derece, 9 px aralık, 2,2 px çizgi, yüzde 16 opaklık; yalnız Evet kapağı.
- **Piktogram:** dolu üçgen (tehlike, dikkat) ya da dolu daire (alış), içinde bant renginde işaret.
- **Yükseliş oku:** künye şeridinde 8 × 7 px dolu yukarı üçgen, `yukselis` renginde.
- **Değişim noktası:** değişen değerin önünde 7 px tam daire, güvenlik tonunda.

### Named Rules
**The Tahta Malzemesi Rule.** Çapraz tarama yalnız Evet kapağıdır; yüzeye doku ya da süs olarak yayılmaz. Kotasyon noktaları markanın (logo, vitrin) malzemesidir, pencerede kullanılmaz.

## Components

### Künye Şeridi
Pencerenin kimliği ve başlık çubuğu; tek satır, 28 px, köşesiz. Pencere çerçevesizdir: şeritte basılı sürükleme pencereyi taşır (`startSystemMove`), en sağdaki 28 × 22 px kapat düğmesi (`gece-soluk` 1,6 px çarpı; hover'da `buz` ve yüzde 14 `buz` zemin) yalnız Hayır üretir ve sekme sırasına girmez (Esc aynı işi yapar). Büyütme ve küçültme yoktur. Solda "Midas-" `buz` renginde, "MCP" `gok` renginde (marka rolü, 12 px / 700, genişlik 112.5), hemen ardından yeşil yükseliş oku. Sağda `gece-soluk` renginde kısa not (kod rolü, 11 px, genişlik 87.5). Zemin açık temada `gece`, koyu temada bir basamak açık `gece-panel`.

### Sinyal Bandı
Tam genişlik güvenlik rengi dolgusu; solda 38 px piktogram ve display sözcük, sağda sayaç ve altında "sonra Hayır" notu. Bandın dibindeki ray ince, düz bir çubuktur: pencere göründüğünde dolu başlar ve süre (varsayılan 120 sn) boyunca doğrusal olarak sağ ucundan sola doğru kısalır (`transform: scaleX(1)` → `scaleX(0)`, `transform-origin: left`, Web Animations, `fill: forwards`).

### Buttons
Karar düğmeleri bilinçli olarak eşit değildir: ret kolay ve varsayılan, onay kasıtlı bir el hareketidir.

- **Shape:** hafif yuvarlatılmış köşe (6 px), 52 px yükseklik.
- **Hayır (birincil, varsayılan):** Midas mavisi dolgu, beyaz 17 px / 700 yazı, daha geniş sütun. Açılışta odaklıdır ve odak halkası pencere odağı gidip gelse de görünür kalır; halka yalnız odak Evet'e geçince kalkar.
- **Hover / Active:** `filter: brightness(1.1)` / `brightness(0.92)`, 150 ms ease-out.
- **Focus:** 3 px düz dış çizgi, 3 px ofset; açıkta `gece`, koyuda `gok`. Her iki düğmede aynı.

### Kapaklı Anahtar (Evet)
- **Dinlenme:** şeffaf zemin, 2 px güvenlik tonu çerçeve, ton renginde 16 px / 700 eylem sözü ve altında 12.5 px / 600 "basılı tutun" notu; arkada taralı emniyet kapağı.
- **Hover:** tonun yüzde 8'i kadar zemin.
- **Basılı tutma:** bant renginde dolgu 900 ms doğrusal hızla soldan sağa kalkar, yazı 200 ms gecikmeyle bant yazısı rengine döner; bırakılınca dolgu 220 ms `cubic-bezier(0.16, 1, 0.3, 1)` ile geri iner. Klavyede Boşluk basılı tutulur.
- **Tek tıklama / Enter:** hiçbir şey onaylamaz; düğme 360 ms yatay silkelenir (−4 px / +3 px).
- **Kilitli:** pencere göründükten sonraki ilk 700 ms yüzde 55 opaklık ve bekleme imleci.
- **Azaltılmış hareket:** dolgu altı basamakta ilerler, silkeleme kapanır.

Esc, pencereyi kapatmak ya da sürenin dolması Hayır'dır.

### Chips (Etiketler)
- **Style:** 24 px yükseklik, 9 px yatay iç boşluk, 1 px ince çizgi çerçeve, yüzey zemini, ikincil metin, 4 px köşe, Fira Sans.
- **State:** yön etiketi (Satış / Alış) mürekkep rengi ve 600 ağırlıkla öne çıkar; renk almaz.

### Cetvelli Değer Tablosu
- Satır başı solda Fira Sans ikincil metinle; değer sağda Martian Mono 14 px / 500. Satırlar 9 px dikey boşluk ve 1 px cetvelle ayrılır, son satırda cetvel yoktur.
- Toplam satırı: üstte 2 px güçlü çizgi, 12 px üst boşluk, etiket mürekkep / 600, tutar figure rolünde.
- Hafif varyant (iptal): toplam 1 px çizgi, ikincil etiket, değer boyunda tutar.

### Değişim Tablosu (eski → yeni)
- Ortada iki yanı 1 px çizgili alan rayı (Fira 13 px / 500, soluk, ortalı); eski ve yeni değerler Martian Mono.
- Değişen satır: alan adı mürekkep / 600, eski değer 1 px soluk üstü çizili, yeni değer güvenlik tonunda 700 ağırlıkla ve önünde 7 px ton renginde nokta.
- Değişmeyen satır: yeni sütunda Fira Sans ikincil renkte "aynı".

### Kimlik Satırı
Fira 12 px soluk ad ("Emir", "Hesap") ve yanında kod rolünde ikincil renkte kimlik değeri; sayfanın seçilebilir tek metni.

## Do's and Don'ts

### Do:
- **Do** güvenlik rengini yalnız panelin `data-ton` yuvasından (`--bant`, `--bant-yazi`, `--ton`) okuyun; ton değiştirmek için yuvayı değiştirin, rengi elle yazmayın.
- **Do** her sinyal sözcüğünü piktogramıyla birlikte verin (tehlike ve dikkat: üçgen; alış: daire içinde artı).
- **Do** rakamları, sembolü, tutarı ve kimlik kodlarını Martian Mono'da; cümleleri, düğmeleri ve etiketleri Fira Sans'ta dizin.
- **Do** koyu zeminde mavi yazı gerektiğinde `gok` kullanın; `midas` yalnız dolgudur.
- **Do** tabloları 1 px cetvelle ayırın; 2 px çizgiyi yalnız harcanacak toplamın üstünde kullanın.
- **Do** onaylayıcı ve geri dönüşü zor eylemi basılı tutmalı kapaklı anahtar olarak, reddi Midas mavisi dolu ve varsayılan odaklı düğme olarak kurun.
- **Do** 28 px yatay kenar boşluğunu her blokta koruyun.

### Don't:
- **Don't** Midas mavisini güvenlik anlamında (uyarı, onay, bilgi) ya da odak halkası olarak kullanmayın.
- **Don't** tehlike kırmızısını tehlike dışı (hata, vurgu, dekor) bir anlam için kullanmayın.
- **Don't** bir ekrana ikinci bir güvenlik rengi ya da bant dışında renkli yüzey eklemeyin.
- **Don't** Martian Mono'yu cümle, başlık ya da düğme yazısına giydirmeyin; ₺ için "Midas TL" yüzünü yığından çıkarmayın.
- **Don't** yüzeylere gölge vermeyin; ayrım ton basamağı ve çizgiyle yapılır.
- **Don't** Evet ile Hayır'ı eş ağırlıkta iki dolu düğme olarak dizmeyin; Enter hiçbir zaman onaylamaz.
- **Don't** çapraz taramayı dekor olarak yaymayın; pencereye kotasyon noktası eklemeyin.
- **Don't** büyük harfli küçük etiketi başlık üstü süs olarak kullanmayın; büyük harf yalnız değişim tablosu sütun başlıklarındadır.
- **Don't** ağdan font ya da kaynak yüklemeyin; Martian Mono `data:` URL, Fira Sans sistemden gelir.
