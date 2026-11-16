#!/usr/bin/env node
/**
 * `npm run login`: oturumu elle kurmak için. Görünür tarayıcıda SSO formu gönderilir,
 * telefondaki Midas bildirimi onaylanınca oturum .midas-session/ ve .midas-state.json'a
 * yazılır; MCP sunucusu sonra bunu kullanır.
 */
import { MidasSession } from "./session.js";

const visible = new MidasSession({ headless: false });
await visible
  .ensureStarted()
  .then(() => console.log("Giriş yapıldı. Oturum .midas-session/ altına kaydedildi; MCP sunucusunu başlatabilirsin."))
  .finally(() => visible.close());
