#!/usr/bin/env node
/**
 * Tek seferlik etkileşimli giriş: görünür tarayıcı açar, SSO formunu gönderir ve Midas mobil
 * uygulamasındaki bildirimin onaylanmasını bekler. Oluşan oturum .midas-session/ altında
 * saklanır ve MCP sunucusu tarafından yeniden kullanılır.
 */
import { MidasSession } from "./session.js";

const s = new MidasSession({ headless: false });
try {
  await s.ensureStarted();
  console.log("Giriş yapıldı. Oturum .midas-session/ altına kaydedildi; MCP sunucusunu başlatabilirsin.");
} finally {
  await s.close();
}
