/**
 * HTTP servisinin canlı tutma döngüsü. Oturumu yoklayan asıl iş `MidasSession.keepAlive()`
 * içindedir; bu modül yalnız zamanlamayı ve log satırını tutar (tarayıcısız test edilir).
 */
import { formatAuthExpiry } from "./auth-expiry.js";
import type { KeepAliveResult } from "./session.js";
import { defineMessages } from "./i18n.js";

const M = defineMessages(
  {
    alive: (expiry: string) => `keepAlive: oturum canlı, durum kaydedildi; ${expiry}`,
    noExpiry: "süre bilgisi okunamadı",
    skipped: (reason: string) => `keepAlive: atlandı (${reason})`,
    loggedOut: "keepAlive: oturum düşmüş; giriş başlatılmadı, bir sonraki araç çağrısı giriş akışını açacak",
    error: (message: string) => `keepAlive: hata: ${message}`,
  },
  {
    alive: (expiry) => `keepAlive: session alive, state saved; ${expiry}`,
    noExpiry: "couldn't read the expiry",
    skipped: (reason) => `keepAlive: skipped (${reason})`,
    loggedOut: "keepAlive: session lost; no sign-in started, the next tool call will start the sign-in flow",
    error: (message) => `keepAlive: error: ${message}`,
  }
);

export function describeKeepAlive(result: KeepAliveResult, now = Date.now()): string {
  switch (result.status) {
    case "alive":
      return M().alive(result.expiry ? formatAuthExpiry(result.expiry, now) : M().noExpiry);
    case "skipped":
      return M().skipped(result.reason);
    case "logged-out":
      return M().loggedOut;
  }
}

/**
 * `tick`'i önce `initialDelayMs`, sonra her `intervalMs`'de bir çalıştırır; önceki tur
 * bitmeden yenisi başlamaz. `intervalMs` 0 ise döngü kurulmaz. Durdurma fonksiyonu döner.
 */
export function startKeepAliveLoop(options: {
  intervalMs: number;
  initialDelayMs: number;
  tick: () => Promise<KeepAliveResult>;
  log: (line: string) => void;
}): () => void {
  const { intervalMs, initialDelayMs, tick, log } = options;
  if (intervalMs <= 0) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      log(describeKeepAlive(await tick()));
    } catch (error) {
      log(M().error(error instanceof Error ? error.message : String(error)));
    } finally {
      running = false;
    }
  };
  const first = setTimeout(run, initialDelayMs);
  const every = setInterval(run, intervalMs);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
