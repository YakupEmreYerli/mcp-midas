**Türkçe** · [English](CONTRIBUTING.en.md)

# Katkı

Katkıya açığız: hata düzeltmesi, test, belge (README.en.md dahil), macOS ya da Windows'ta
deneme raporu ve Midas web uygulaması değiştiğinde bozulan bir aracın tespiti. Proje tek
kişinin gönüllü emeğiyle yürüyor; büyük bir değişikliğe başlamadan önce issue açıp konuş.

Kabul edilmeyenler:

- onay kapısını gevşeten ya da atlatan her şey (aşağıdaki kurallara bak),
- emir araçlarını varsayılan olarak açan ya da canlı emirle test eden değişiklikler,
- testte Midas kimlik bilgisi ya da gerçek hesap gerektiren her şey,
- kişisel portföy verisi, kişisel strateji ya da yatırım tavsiyesi içeren içerik.

## Kurulum

Gerekenler: Node.js 20 ya da 22 (CI ikisini de sınar) ve git. Testler için Midas hesabı,
kimlik bilgisi, `.env` ya da tarayıcı gerekmez.

```bash
git clone https://github.com/YakupEmreYerli/mcp-midas.git
cd mcp-midas
npm ci
npm run build
npm test
```

Bağımlılıklar indikten sonra derleme ve testler birkaç saniye sürer. Çıktı şöyle biter:

```text
# tests 130
# pass 130
# fail 0
```

Test sayısı zamanla artar; önemli olan `fail 0`. Sunucuyu gerçekten çalıştıracaksan ayrıca
`npx playwright install chromium` gerekir. Onay penceresini denemek için sistem
Python'unda PySide6 ve QtWebEngine gerekir; yoksa `kdialog` ya da `zenity` kullanılır.

## Ne üzerinde çalışılır

[`good first issue`](https://github.com/YakupEmreYerli/mcp-midas/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
etiketli issue'lar yeni gelenler için ayrılmıştır. Üstlenmek için issue'ya yorum yaz;
14 gün içinde pull request ya da ara durum gelmezse issue yeniden boşa çıkar. Uygun bir şey
yoksa yapmak istediğini anlatan bir issue aç.

## Göndermeden önce

- `npm run build` ve `npm test` temiz geçmeli; CI aynı iki komutu Node.js 20 ve 22'de çalıştırır.
  Testler Midas'a bağlanmaz.
- Commit mesajları Türkçe, ne yapıldığını somut söyleyen bir başlık; gövdede neden.
- Kod yorumları Türkçe. Araç açıklamaları ve kullanıcıya dönen mesajlar Türkçe ve İngilizce
  yazılır (bkz. aşağıdaki "Türkçe ve İngilizce" bölümü). Tanımlayıcılar, JSON alan adları ve
  araç adları İngilizce kalır.
- Kullanıcının fark edeceği bir değişiklikse pull request açıklamasına bir satır yaz; bakımcı
  bunu [CHANGELOG.md](CHANGELOG.md)'ye taşır. Araç adı, argüman, ortam değişkeni, onay
  protokolü ya da denetim günlüğü değişiyorsa [RELEASES.md](RELEASES.md)'deki uyum kurallarına bak.
- `AGENTS.md` ile `CLAUDE.md` ikizdir; birini değiştirirsen diğerini de değiştir.
- CLA ya da `Signed-off-by` satırı istenmez; katkın projenin [MIT lisansıyla](LICENSE) yayımlanır.

## Gönderdikten sonra

- İlk yanıt genelde bir hafta içinde gelir.
- Fork'tan gelen ilk pull request'te CI'ın çalışması için bakımcının onayı gerekir; bu yüzden
  CI biraz gecikebilir.
- Pull request'te "Allow edits by maintainers" açık kalsın; küçük bir eksik kalırsa bakımcı
  tamamlayıp birleştirebilir.
- Dış katkılar merge commit ile birleştirilir, yazarlığın korunur. Kullanıcıya görünen her
  katkı CHANGELOG'da GitHub kullanıcı adınla anılır.
- İki hafta yanıt gelmezse pull request'e yorum yazarak hatırlat. Takıldığın bir yer olursa
  da pull request'e ya da issue'ya yaz.

## Değişmeyen kurallar

- **Canlı emir testi yok.** Geliştirme ya da test sırasında Midas'a gerçek emir, güncelleme
  ya da iptal gönderme. Emir yolu birim testlerle, sahte onaylayıcıyla sınanır.
- **Onay kapısı atlanamaz.** Araç şemasına, ortam değişkenine ya da yapılandırmaya
  `confirmed`, `approve`, test modu veya ajanın cevap verebileceği bir kanal eklenmez.
  Üretim yolu gerçek masaüstü çalıştırıcısına bağlıdır (`src/desktop-confirmation.ts`).
- **Emir araçları varsayılan kapalı kalır.** Yalnız `MIDAS_ORDERS_ENABLED=1` açar
  (`src/tool-flags.ts`); bayrağı açan başka bir değer eklenmez.
- **Mutation otomatik yinelenmez.** Oturum düşerse okuma bir kez yinelenir, emir yinelenmez;
  yeni çağrı yeni onay ister.
- Kimlik bilgisi, oturum dosyası, emir günlüğü ya da `discovery/` çıktısı commit'lenmez.

## Türkçe ve İngilizce

- Dili `MIDAS_LANG` (`tr` | `en`) belirler. Verilmezse sistem yereline bakılır (`LC_ALL`,
  `LC_MESSAGES`, `LANG`): `tr` ile başlayan her değer Türkçe, geri kalan her şey İngilizcedir.
- Kullanıcının ya da ajanın gördüğü her metin iki dilde de bulunur. TypeScript modülleri
  metinlerini kodun yanında, `src/i18n.ts` içindeki `defineMessages(tr, en)` ile tanımlar;
  `en` nesnesinin anahtarları `tr` ile birebir aynı olmalı. Eksik ya da fazla anahtarı derleme
  yakalar, çalışma anında da `test/i18n.test.ts` denetler.
- Onay ve SMS pencereleri dili açıldıkları cihaza göre seçer (`onay/dil.py`: `LC_ALL`,
  `LC_MESSAGES`, `LANG`, üçü de boşsa `/etc/locale.conf`, yoksa `/etc/default/locale`).
  `MIDAS_LANG` verilmişse sunucu dili `dil` alanıyla gönderir ve o geçerlidir. Dil zorlanmadığında
  onay modeli dile bağlı metinleri `metinler.tr` ve `metinler.en` içinde taşır
  (`buildWindowModel`); sunucuda çalışan bildirimler, hata mesajları ve kdialog/zenity yedekleri
  sunucunun dilindedir. Sayfanın sabit metinleri
  `onay/onay.js` ve `onay/sms.js` içindeki `METIN` tablosunda durur (`METIN-BAŞI` ile
  `METIN-SONU` işaretleri arasında). Python tarafındaki pencere başlıkları ve hata gerekçeleri
  `onay/onay.py` ile `onay/sms.py` içindeki `METIN` sözlüğündedir.
- Araç adları, argüman adları ve JSON alan adları dile göre değişmez.
- Türkçe metin bekleyen testler dosyanın başında `process.env.MIDAS_LANG = "tr"` ile dili sabitler.

## Depoya özgü tuzaklar

- **`x-midas-rid` hesaplanmaz, gözlenir.** API geçidi bu başlığı ister; web uygulaması onu
  profil başına üretir. `src/session.ts` uygulamanın kendi isteklerinden okur.
- **Yönlendirme kök alan adıyladır.** Geçit `x-apollo-operation-name` başlığıyla yönlendirir
  ve değer işlem adı değil, belgedeki ilk kök alan olmalıdır. İlk seçim takma adsa
  `gql()` çağrısına gerçek alan adını açıkça ver.
- **Başsız Chromium 403 alır.** Normal user agent ve client hint başlıkları olmadan geçit
  isteği reddeder; `session.ts` bunları ayarlar.
- **Kalıcı profil tek başına yetmez.** Atlas kimliği oturum çerezlerinde tutar; Chromium
  bunları diske yazmaz. Oturum `storageState()` ile `.midas-state.json` dosyasına alınır.
  Bayat görüntü yeni girişten önce silinmelidir, yoksa localStorage'ı taze token'ları ezer.
- **Yalnız URL'ye bakıp oturumu açık sayma.** Profil, çerezler gittikten sonra da
  `/dashboard` gösterebilir; oturum API'ye sorularak doğrulanır.
- **Sunucuda introspection kapalı.** Yeni bir GraphQL belgesi, Atlas web uygulamasının
  tarayıcıdaki ağ trafiğinde gönderdiği işlemden alınır; alan seçimi aracın gerçekten
  döndürdüğü alanlara indirilir. Bu sırada kaydedilen her şey `discovery/` altında tutulur;
  hesap verisi içerebilir ve gitignore'ludur.
- **Okumada sembol çözümü bulanıktır**, emir araçlarında birebir olmalıdır
  (`assertExactResolvedSymbol`). Aynı sembolü birden çok enstrüman taşıyorsa seçim
  `src/symbol-resolution.ts` içindeki saf mantıkla yapılır (emrin enstrümanı → okumada açık
  piyasa ipucu → pozisyon); emir yolunda ayırt edilemeyen eşleşme tahmin edilmez, reddedilir.

## Güvenlik

Güvenlik açıklarını herkese açık issue yerine [SECURITY.md](SECURITY.md) içindeki yolla bildir.
