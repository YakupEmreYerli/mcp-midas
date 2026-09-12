# mcp-midas — ajan kuralları

Midas Atlas API'sine **salt okuma** erişimi veren MCP sunucusu. BIST portföyünü,
pozisyonları ve işlem geçmişini okur; hiçbir emir göndermez.

> **İkiz dosya:** bu dosyanın eşi `CLAUDE.md`. Birini değiştirirsen diğerini de değiştir.

## Bağlayıcı kurallar

- **Salt okuma.** Alım, satım, emir iptali gibi yazma yetenekleri sunucuya
  eklenmez. Yetenek sökülür; "izin verilmez" yeterli değildir.
- **Kimlik bilgisi yalnız ortamda.** `MIDAS_PHONE` ve `MIDAS_PASSWORD` ortam değişkeniyle
  (sır yöneticisi ya da gitignore'lu `.env`) verilir; koda, loga, commit'e yazılmaz.
- **Oturum `storageState` ile açılır** — onaysız ve başsız çalışır.

## BIST analiz kuralları

Hisse tarama ve puanlama çerçevesi **`docs/analiz-kurallari.md`** içinde. Bu dosya
17 KB'tı ve her oturumda bağlama giriyordu; analiz yapılmayan oturumlarda
karşılığı olmayan ~5.700 token demekti. Tarama, analiz veya puanlama istendiğinde
o dosyayı aç ve harfiyen uygula.
