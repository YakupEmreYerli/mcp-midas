#!/usr/bin/env node
/**
 * `npm run login`: oturumu elle kurmak için. Görünür tarayıcıda SSO formu gönderilir,
 * telefondaki Midas bildirimi onaylanınca oturum .midas-session/ ve .midas-state.json'a
 * yazılır; MCP sunucusu sonra bunu kullanır.
 */
import { MidasSession } from "./session.js";
import { defineMessages } from "./i18n.js";

const M = defineMessages(
  {
    done: "Giriş yapıldı. Oturum .midas-session/ altına kaydedildi; MCP sunucusunu başlatabilirsin.",
  },
  {
    done: "Signed in. The session is saved under .midas-session/; you can start the MCP server now.",
  }
);

const visible = new MidasSession({ headless: false });
await visible
  .ensureStarted()
  .then(() => console.log(M().done))
  .finally(() => visible.close());
