# Katkı

## Kurulum

```bash
npm ci
npx playwright install chromium
npm run build
npm test
```

Node.js 20 ve 22 CI'da sınanır. Onay penceresini denemek için sistem Python'unda PySide6 ve
QtWebEngine gerekir; yoksa `kdialog` ya da `zenity` kullanılır.

## Göndermeden önce

- `npm run build` ve `npm test` temiz geçmeli. Testler Midas'a bağlanmaz.
- Commit mesajları Türkçe, ne yapıldığını somut söyleyen bir başlık; gövdede neden.
- Kod yorumları, araç açıklamaları ve kullanıcıya dönen mesajlar Türkçe. Tanımlayıcılar,
  JSON alan adları ve araç adları İngilizce kalır.
- `AGENTS.md` ile `CLAUDE.md` ikizdir; birini değiştirirsen diğerini de değiştir.

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
- **Sunucuda introspection kapalı.** Yeni GraphQL belgeleri `scripts/` altındaki araçlarla
  web uygulamasının paketlerinden çıkarılır; bu araçların ürettiği `discovery/` hesap verisi
  içerebilir ve gitignore'ludur.
- **Okumada sembol çözümü bulanıktır**, emir araçlarında birebir olmalıdır
  (`assertExactResolvedSymbol`). Aynı sembolü birden çok enstrüman taşıyorsa seçim
  `src/symbol-resolution.ts` içindeki saf mantıkla yapılır (emrin enstrümanı → pozisyon →
  piyasa ipucu); emir yolunda ayırt edilemeyen eşleşme tahmin edilmez, reddedilir.

## Güvenlik

Güvenlik açıklarını herkese açık issue yerine [SECURITY.md](SECURITY.md) içindeki yolla bildir.
