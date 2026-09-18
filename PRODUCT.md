# Product

<!-- impeccable:product-schema 1 -->

> Bu kayıt soru turu yapılamadan brief'ten ve depodan çıkarıldı. "Çıkarım" işaretli
> maddeler doğrulanmadı.

## Platform

web (yerel masaüstü penceresi: PySide6 QWebEngineView içinde yerel HTML; ağ yok)

## Users

Sunucuyu kendi Midas hesabı için kendi bilgisayarında çalıştıran hesap sahibi. Bir AI
ajanı Midas MCP üzerinden emir göndermek, değiştirmek ya da iptal etmek istediğinde, Linux
masaüstünde (ör. KDE Plasma, Wayland) beklenmedik anda açılan bir pencerede kararı yalnızca
o verir. Çıkarım: çoğu zaman başka bir işin ortasında, klavyede.

## Product Purpose

mcp-midas, Midas Atlas API'sine erişen MCP sunucusudur. Onay penceresi, ajanın geçemeyeceği
insan kapısıdır: gerçek para hareketinden önce işlemi okunur Türkçe gösterir, varsayılan
cevabı Hayır'dır. Başarı: kullanıcı birkaç saniyede ne onayladığını doğru anlar; yanlışlıkla
Evet'e basmak zor, bilinçli Evet kolaydır.

## Operating Context

- Sunucu stdio ya da kalıcı HTTP servisi (ör. systemd kullanıcı servisi, 127.0.0.1:8766) olarak çalışır; pencereyi sunucu süreci açar.
- Emir araçları yalnız `MIDAS_ORDERS_ENABLED=1` ile kayıtlıdır; kapalıyken pencere hiç açılmaz.
- İşlem tipleri: ALIŞ, SATIŞ (yeni emir), DEĞİŞTİR (bekleyen emir güncelleme), İPTAL.
- Önizleme verisi Midas'tan çözümlenir: sembol, tam ad, pazar (TR HİSSE (BIST), TR FON (TEFAS)),
  emir tipi, adet, limit / kâr al / zarar durdur fiyatları, güncel fiyat, tahmini TL tutarı,
  güncellemede eski ve yeni değerler.
- 120 sn içinde cevap yoksa Hayır. Esc ve pencere kapatma Hayır. Enter Evet'e basmaz.

## Capabilities and Constraints

- Onay kapısı atlanamaz: ajanın cevaplayabileceği hiçbir kanal (HTTP, dosya, env) olmaz.
- Pencere yerel HTML çizer; ağ erişimi ve dış kaynak yoktur, fontlar sistemden gelir.
- Geri dönüş zinciri: tasarımlı pencere → kdialog → zenity → yoksa işlem reddedilir.
- Para biçimi Türkçe (₺1.234,56).

## Brand Commitments

Yok. Resmî olmayan, bağımsız bir araç: Midas adı, logosu ve markası taklit edilmez.

## Product Principles

1. Ret varsayılandır; onay bilinçli bir el hareketi ister.
2. Kararı değiştiren bilgi önce: işlem tipi, sembol, adet, tutar.
3. Tehlikeli yön (SATIŞ, İPTAL) renk ve sözle ayrı okunur; renk tek sinyal değildir.
4. Hata ret değildir: pencere açılamazsa bu söylenir.

## Accessibility & Inclusion

Çıkarım: klavyeyle tam kullanım, görünür odak, WCAG AA kontrast, açık ve koyu tema.
