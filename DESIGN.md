---
name: Midas emir onayı
description: Ajanın geçemeyeceği insan kapısı; kapaklı emniyet anahtarı gibi okunan tek ekranlık onay paneli.
colors:
  zemin-acik: "oklch(0.972 0.004 250)"
  yuzey-acik: "oklch(0.995 0.002 250)"
  murekkep-acik: "oklch(0.2 0.012 255)"
  ikincil-acik: "oklch(0.44 0.014 255)"
  soluk-acik: "oklch(0.5 0.012 255)"
  cizgi-acik: "oklch(0.86 0.008 255)"
  cizgi-guclu-acik: "oklch(0.3 0.012 255)"
  hayir-zemin-acik: "oklch(0.24 0.014 255)"
  hayir-yazi-acik: "oklch(0.985 0.003 250)"
  zemin-koyu: "oklch(0.2 0.008 255)"
  yuzey-koyu: "oklch(0.235 0.009 255)"
  murekkep-koyu: "oklch(0.95 0.004 250)"
  ikincil-koyu: "oklch(0.76 0.01 255)"
  soluk-koyu: "oklch(0.66 0.01 255)"
  cizgi-koyu: "oklch(0.34 0.01 255)"
  cizgi-guclu-koyu: "oklch(0.78 0.008 255)"
  hayir-zemin-koyu: "oklch(0.93 0.004 250)"
  hayir-yazi-koyu: "oklch(0.18 0.01 255)"
  tehlike-acik: "oklch(0.52 0.2 27)"
  tehlike-koyu: "oklch(0.52 0.19 27)"
  tehlike-yazi: "oklch(0.99 0.005 27)"
  tehlike-ton-acik: "oklch(0.5 0.19 27)"
  tehlike-ton-koyu: "oklch(0.72 0.16 27)"
  alis-acik: "oklch(0.5 0.12 158)"
  alis-koyu: "oklch(0.47 0.11 158)"
  alis-yazi: "oklch(0.99 0.005 158)"
  alis-ton-acik: "oklch(0.46 0.11 158)"
  alis-ton-koyu: "oklch(0.76 0.12 158)"
  dikkat-acik: "oklch(0.83 0.155 82)"
  dikkat-koyu: "oklch(0.82 0.15 82)"
  dikkat-yazi: "oklch(0.2 0.03 70)"
  dikkat-ton-acik: "oklch(0.5 0.11 70)"
  dikkat-ton-koyu: "oklch(0.84 0.14 82)"
typography:
  display:
    fontFamily: "Fira Sans Condensed, Fira Sans, Noto Sans, sans-serif"
    fontSize: "54px"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.005em"
  figure:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "0.005em"
    fontFeature: "tnum, lnum"
  title:
    fontFamily: "Fira Sans, Noto Sans, DejaVu Sans, sans-serif"
    fontSize: "19px"
    fontWeight: 500
    lineHeight: 1.35
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
  mono:
    fontFamily: "Hack, DejaVu Sans Mono, monospace"
    fontSize: "11.5px"
    fontWeight: 400
rounded:
  ray: "2px"
  etiket: "4px"
  r: "6px"
spacing:
  etiket: "6px"
  sm: "12px"
  md: "14px"
  lg: "20px"
  bosluk: "28px"
components:
  button-hayir:
    backgroundColor: "{colors.hayir-zemin-acik}"
    textColor: "{colors.hayir-yazi-acik}"
    rounded: "{rounded.r}"
    height: "52px"
  button-evet-tehlike:
    backgroundColor: "transparent"
    textColor: "{colors.tehlike-ton-acik}"
    rounded: "{rounded.r}"
    height: "52px"
  button-evet-tehlike-tutuluyor:
    backgroundColor: "{colors.tehlike-acik}"
    textColor: "{colors.tehlike-yazi}"
  sinyal-bandi-tehlike:
    backgroundColor: "{colors.tehlike-acik}"
    textColor: "{colors.tehlike-yazi}"
    typography: "{typography.display}"
    padding: "26px 28px 28px"
  sinyal-bandi-dikkat:
    backgroundColor: "{colors.dikkat-acik}"
    textColor: "{colors.dikkat-yazi}"
    typography: "{typography.display}"
    padding: "26px 28px 28px"
  sinyal-bandi-alis:
    backgroundColor: "{colors.alis-acik}"
    textColor: "{colors.alis-yazi}"
    typography: "{typography.display}"
    padding: "26px 28px 28px"
  etiket:
    backgroundColor: "{colors.yuzey-acik}"
    textColor: "{colors.ikincil-acik}"
    typography: "{typography.label}"
    rounded: "{rounded.etiket}"
    padding: "0 9px"
    height: "24px"
  eylem-cubugu:
    backgroundColor: "{colors.yuzey-acik}"
    padding: "18px 28px 22px"
---

# Design System: Midas emir onayı

## Overview

**Creative North Star: "Kapaklı Emniyet Anahtarı"**

Onay penceresi bir diyalog kutusu değil, endüstriyel bir kumanda panelidir. İşlem tipi, ISO 3864 / ANSI Z535 sinyal sözcüğü gibi tam genişlikte renkli bir bantta okunur; altında sakin, nötr bir çelik ya da grafit panel rakamları cetvelli bir tabloda verir; en altta Evet, taralı kapağın altındaki anahtardır ve ancak basılı tutulunca kalkar. Hayır ise dolu, geniş ve baştan odaklıdır.

Yoğunluk sıkı ama ferah: 560 px sabit genişlik, içerik kadar yükseklik, tek yatay kenar boşluğu (28 px). Panel düzdür, gölge yoktur; derinlik yalnız ton farkıyla (zemin ve bir basamak açık yüzey) ve tek cihaz pikseli çizgilerle kurulur. Hareket azdır ve işlevseldir: tek sürekli hareket geri sayım rayıdır, geri kalan her şey el hareketine cevaptır.

Renk az ve anlamlıdır. Ekranda bir anda yalnız bir güvenlik rengi yaşar; o renk bantta, Evet anahtarında ve değişen değerlerde görünür, başka hiçbir yerde görünmez. Kırmızı yalnız tehlike içindir.

**Key Characteristics:**
- Tek güvenlik rengi bandı işlem tipini söz, piktogram ve renkle birlikte söyler.
- Nötr, soğuk tonlu panel (ton 250-255); açık tema çelik, koyu tema grafit.
- Tablo rakamları (tabular, lining), sağa hizalı tutarlar, cetvelli satırlar.
- Küçük ve tek köşe yarıçapı; gölgesiz, ton ve çizgiyle katmanlanan yüzey.
- Onay basılı tutma ister; ret dolu, geniş ve varsayılandır.

## Colors

Soğuk, düşük kromalı bir nötr skala üzerinde tek yüksek kromalı güvenlik rengi; her iki tema da aynı rolleri taşır, tema `html[data-theme]` ile, güvenlik tonu panelin `data-ton` değeriyle seçilir.

### Primary
Primary tek bir renk değil, işlem tipine göre seçilen bir güvenlik rengi yuvasıdır (`--bant`, `--bant-yazi`, `--ton`). Her tonun üç rolü vardır: bant dolgusu, bant üstü yazı ve nötr zemin üzerindeki metin tonu (Evet çerçevesi, Evet yazısı, değişen değer, değişim noktası).

- **Emniyet Kırmızısı** (`tehlike-*`): SATIŞ ve İPTAL. Bant dolgusu üzerinde beyaza yakın yazı (`tehlike-yazi`). Koyu temada nötr zemindeki ton, okunurluk için açılır (`tehlike-ton-koyu`).
- **Piyasa Yeşili** (`alis-*`): ALIŞ. Bant dolgusu üzerinde beyaza yakın yazı (`alis-yazi`).
- **Emniyet Sarısı** (`dikkat-*`): DEĞİŞTİR. Sarı bant üzerinde siyaha yakın yazı (`dikkat-yazi`); açık temada nötr zemindeki ton okunurluk için hardal-kahveye kayar (`dikkat-ton-acik`, hue 70).

### Neutral
- **Çelik Zemin / Grafit Zemin** (`zemin-acik`, `zemin-koyu`): pencere ve içerik zemini.
- **Panel Yüzeyi** (`yuzey-*`): zeminden bir basamak ayrışan yüzey; eylem çubuğu ve etiketler.
- **Mürekkep** (`murekkep-*`): ana metin, tutar, değişen alan adı; ayrıca odak halkası rengi.
- **İkincil Metin** (`ikincil-*`): tablo satır başlıkları, tam ad, etiket yazısı, eski değer.
- **Soluk Metin** (`soluk-*`): sütun başlıkları, alan rayı, kimlik satırı, ipucu.
- **İnce Çizgi** (`cizgi-*`): tablo cetvelleri, etiket çerçevesi, eylem çubuğu üst çizgisi.
- **Güçlü Çizgi** (`cizgi-guclu-*`): yalnız tahmini tutarın üstündeki 2 px toplam çizgisi.
- **Hayır Dolgusu** (`hayir-zemin-*`, `hayir-yazi-*`): temaya ters tonlu dolu düğme; açıkta koyu, koyuda açık.

### Named Rules
**The Tek Bant Rule.** Bir ekranda yalnız bir güvenlik rengi yaşar ve yalnız üç yerde görünür: sinyal bandı, Evet anahtarı, değişen değer. Nötr panelin geri kalanına renk girmez.

**The Kırmızı Yalnız Tehlike Rule.** Emniyet kırmızısı yalnız geri dönüşü zor ya da para çıkaran yön (SATIŞ, İPTAL) içindir; hata, uyarı ya da vurgu için kullanılmaz.

**The Renk Tek Sinyal Değil Rule.** Güvenlik rengi her zaman sinyal sözcüğü ve piktogramla birlikte gelir: tehlike ve dikkat için üçgen uyarı işareti, alış için daire içinde artı.

## Typography

**Display Font:** Fira Sans Condensed ExtraBold (Fira Sans, Noto Sans yedekli)
**Body Font:** Fira Sans (Noto Sans, DejaVu Sans yedekli)
**Label/Mono Font:** Hack (DejaVu Sans Mono yedekli), yalnız kimlik değerleri için

**Character:** Tek aile, iki genişlik: dar ve ağır sinyal sözcüğü bir güvenlik levhası gibi bağırır, normal genişlikte Fira Sans gövdeyi sakin ve teknik tutar. Fontlar sistemden gelir; sayfa ağdan hiçbir şey yüklemez (CSP `font-src 'none'`).

### Hierarchy
- **Display** (800, 54 px, 0.95): yalnız sinyal bandındaki işlem sözcüğü (SATIŞ, ALIŞ, DEĞİŞTİR, İPTAL). Tek satır, kırılmaz.
- **Headline** (700, 30 px, 1.1): enstrüman sembolü.
- **Figure** (700, 24 px): tahmini tutar; tablonun toplam satırında sağa hizalı. Geri sayım değeri aynı ailede 600 / 26 px.
- **Title** (500, 19 px, 1.35): tek cümlelik özet; `text-wrap: balance`. Soru satırı 600 / 16 px.
- **Body** (400, 15 px, 1.45): tablo satırları, tam ad. Değerler 600 ağırlıkta.
- **Label** (500, 12.5 px): etiketler, ipucu, sayaç notu, Evet'in "basılı tutun" notu.
- **Column head** (600, 12 px, 0.04em, büyük harf): yalnız değişim tablosunun "Şimdi / Sonra" sütun başlıkları.
- **Mono** (400, 11.5 px): emir numarası ve hesap kimliği; seçilebilir tek metin.

### Named Rules
**The Rakam Izgarası Rule.** Tüm sayfa `font-variant-numeric: tabular-nums lining-nums` ile dizilir; tutarlar ve değerler sağa hizalanır, rakamlar alt alta tek ızgarada durur.

**The Tek Bağıran Söz Rule.** Dar ExtraBold yüz yalnız sinyal sözcüğüne aittir; başka başlık, düğme ya da vurgu için kullanılmaz.

## Layout

Tek sütun, 560 px sabit genişlikte yerel pencere; yükseklik içeriğe göre ölçülür ve pencere o yükseklikte sabitlenir. Yatay kenar boşluğu her blokta aynıdır (`bosluk`, 28 px). Dikey sıra sabittir: tam genişlik sinyal bandı (üst 26 px, alt 28 px iç boşluk; alt kenardan 9 px yukarıda 3 px geri sayım rayı) → içerik bloğu (üst 22 px, bloklar arası 20 px) → üst çizgili eylem çubuğu (22 px aralıkla ayrılır; 18 / 22 px iç boşluk, öğeler arası 14 px).

Bant içinde sol grup (40 px piktogram + sinyal sözcüğü, 14 px aralık) ile sağda sayaç iki uca yaslanır. Düğmeler iki sütunlu ızgarada 1fr / 1.25fr oranında, 12 px aralıkla durur: solda Evet, sağda daha geniş Hayır. Değişim tablosu 38 / 24 / 38 yüzde sütunlarıyla ortada bir alan rayı taşır: solda şimdiki değer sağa, sağda sonraki değer sola hizalı.

Yön sözleşmesi sinyal sözcüğünü 56 px, rayı 4 px tarif ediyordu; yapı 54 px ve 3 px ile gönderildi. Yapı esastır.

### Named Rules
**The Tek Cihaz Pikseli Rule.** Cetveller 1 px'tir. Tek istisna, harcanacak paranın üstündeki 2 px güçlü toplam çizgisidir; iptalde tutar yalnız bilgi olduğu için o çizgi de 1 px'e iner.

## Elevation & Depth

Sistem tamamen düzdür: hiçbir öğede `box-shadow` yoktur. Derinlik iki araçla kurulur: zemin ile bir basamak ayrışan yüzey tonu (eylem çubuğu, etiketler) ve ince cetveller. Durum bildirimi gölgeyle değil dolgu, filtre ve çerçeveyle yapılır.

### Named Rules
**The Gölgesiz Panel Rule.** Yüzeyler gölge almaz; bir katmanı ayırmak gerekiyorsa ton basamağı ya da 1 px çizgi kullanılır.

## Shapes

Köşe dili küçük ve tektir: düğmeler 6 px (`r`), etiketler 4 px, ray ve kaydırma çubuğu 2-5 px. Sinyal bandı ve panel köşesizdir; pencere kenarına tam oturur. Yinelenen tek geometri güvenlik işaretlemesidir: 45 derece çapraz tarama (Evet kapağı, 9 px aralık, 2.2 px çizgi, yüzde 16 opaklık), dolu üçgen ya da daire piktogram ve değişen değerin önünde 7 px tam daire nokta.

## Components

### Buttons
Karar düğmeleri bilinçli olarak eşit değildir: ret kolay ve varsayılan, onay kasıtlı bir el hareketidir.

- **Shape:** hafif yuvarlatılmış köşe (6 px), 52 px yükseklik.
- **Hayır (birincil, varsayılan):** temaya ters tonlu dolu yüzey, 17 px / 700 yazı, daha geniş sütun. Açılışta odaklıdır ve odak halkası pencere odağı gidip gelse de görünür kalır.
- **Hover / Active:** `filter: brightness(1.12)` / `brightness(0.94)`, 150 ms ease-out.
- **Focus:** 3 px düz mürekkep rengi dış çizgi, 3 px ofset; her iki düğmede aynı.

### Kapaklı Anahtar (Evet)
- **Dinlenme:** şeffaf zemin, 2 px güvenlik tonu çerçeve, ton renginde 16 px / 700 eylem sözü ve altında 12.5 px / 600 "basılı tutun" notu; arkada taralı emniyet kapağı.
- **Hover:** tonun yüzde 8'i kadar zemin.
- **Basılı tutma:** bant renginde dolgu 900 ms doğrusal hızla soldan sağa kalkar, yazı bant yazısı rengine döner; bırakılınca dolgu 220 ms `cubic-bezier(0.16, 1, 0.3, 1)` ile geri iner.
- **Tek tıklama / Enter:** hiçbir şey onaylamaz; düğme 360 ms yatay silkelenir (−4 px / +3 px).
- **Kilitli:** pencere göründükten sonraki ilk 700 ms yüzde 55 opaklık ve bekleme imleci.
- **Azaltılmış hareket:** dolgu altı basamakta ilerler, silkeleme kapanır.

### Sinyal Bandı
Tam genişlik güvenlik rengi dolgusu; solda 40 px piktogram ve display sözcük, sağda 26 px geri sayım ve altında "sonra Hayır" notu. Alt kenara yakın 3 px ray, bant yazısı renginde dolu başlar ve süre boyunca doğrusal olarak boşalır; ray yolu bant yazısının yüzde 28'i ile karıştırılmış bant rengidir.

### Chips (Etiketler)
- **Style:** 24 px yükseklik, 9 px yatay iç boşluk, 1 px ince çizgi çerçeve, panel yüzeyi zemin, ikincil metin, 4 px köşe.
- **State:** yön etiketi (Satış / Alış) mürekkep rengi ve 600 ağırlıkla öne çıkar; renk almaz.

### Cetvelli Değer Tablosu
- Satır başı solda ikincil metinle, değer sağda 600 ağırlıkla; satırlar 9 px dikey boşluk ve 1 px cetvelle ayrılır, son satırda cetvel yoktur.
- Toplam satırı: üstte 2 px güçlü çizgi, 12 px üst boşluk, etiket mürekkep / 600, tutar figure rolünde.
- Hafif varyant (iptal): toplam 1 px çizgi, ikincil etiket, gövde boyunda tutar.

### Değişim Tablosu (eski → yeni)
- Ortada iki yanı 1 px çizgili alan rayı (13 px / 500, soluk, ortalı).
- Değişen satır: alan adı mürekkep / 600, eski değer 1 px soluk üstü çizili, yeni değer güvenlik tonunda 700 ağırlıkla ve önünde 7 px ton renginde nokta.
- Değişmeyen satır: yeni sütunda ikincil renkte "aynı".

## Do's and Don'ts

### Do:
- **Do** güvenlik rengini yalnız panelin `data-ton` yuvasından (`--bant`, `--bant-yazi`, `--ton`) okuyun; yeni bir yüzey tonu değiştirmek için yuvayı değiştirir, rengi elle yazmaz.
- **Do** her sinyal sözcüğünü piktogramıyla birlikte verin (tehlike ve dikkat: üçgen; alış: daire içinde artı).
- **Do** tüm rakamları tabular ve lining dizin, tutarları sağa hizalayın.
- **Do** tabloları 1 px cetvelle ayırın; 2 px çizgiyi yalnız harcanacak toplamın üstünde kullanın.
- **Do** onaylayıcı ve geri dönüşü zor eylemi basılı tutmalı kapaklı anahtar olarak, reddi dolu ve varsayılan odaklı düğme olarak kurun.
- **Do** 28 px yatay kenar boşluğunu her blokta koruyun.

### Don't:
- **Don't** emniyet kırmızısını tehlike dışı (hata, uyarı, dekor) bir anlam için kullanmayın.
- **Don't** bir ekrana ikinci bir güvenlik rengi ya da bant dışında renkli yüzey eklemeyin.
- **Don't** yüzeylere gölge vermeyin; ayrım ton basamağı ve çizgiyle yapılır.
- **Don't** dar ExtraBold yüzü sinyal sözcüğü dışında kullanmayın.
- **Don't** Evet ile Hayır'ı eş ağırlıkta iki dolu düğme olarak dizmeyin; Enter hiçbir zaman onaylamaz.
- **Don't** çapraz taramayı dekor olarak yaymayın; o yalnız Evet kapağının malzemesidir.
- **Don't** büyük harfli küçük etiketi başlık üstü süs olarak kullanmayın; büyük harf yalnız değişim tablosu sütun başlıklarındadır.
- **Don't** ağdan font ya da kaynak yüklemeyin; aile sistemden gelir.
