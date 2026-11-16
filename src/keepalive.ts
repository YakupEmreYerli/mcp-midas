/**
 * HTTP servisinin canlı tutma döngüsü. Oturumu yoklayan asıl iş `MidasSession.keepAlive()`
 * içindedir; bu modül yalnız zamanlamayı ve log satırını tutar (tarayıcısız test edilir).
 */
import { formatAuthExpiry } from "./auth-expiry.js";
import type { KeepAliveResult } from "./session.js";

export function describeKeepAlive(result: KeepAliveResult, now = Date.now()): string {
  switch (result.status) {
    case "alive":
      return `keepAlive: oturum canlı, durum kaydedildi; ${result.expiry ? formatAuthExpiry(result.expiry, now) : "süre bilgisi okunamadı"}`;
    case "skipped":
      return `keepAlive: atlandı (${result.reason})`;
    case "logged-out":
      return "keepAlive: oturum düşmüş; giriş başlatılmadı, bir sonraki araç çağrısı giriş akışını açacak";
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
      log(`keepAlive: hata: ${error instanceof Error ? error.message : String(error)}`);
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
