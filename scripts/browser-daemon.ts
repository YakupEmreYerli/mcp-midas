/**
 * Keşif/geliştirme için uzun süre çalışan, görünür tarayıcı.
 * Diğer betikler connectOverCDP ile bağlanabilsin diye CDP'yi 9222 portunda açar.
 * Tüm XHR/fetch yanıtlarını discovery/network.jsonl dosyasına yazar (küçük JSON gövdeleri satır içi).
 */
import { chromium } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SESSION_DIR = path.join(ROOT, ".midas-session");
const DISCOVERY_DIR = path.join(ROOT, "discovery");
fs.mkdirSync(DISCOVERY_DIR, { recursive: true });
const logStream = fs.createWriteStream(path.join(DISCOVERY_DIR, "network.jsonl"), { flags: "a" });

const context = await chromium.launchPersistentContext(SESSION_DIR, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ["--remote-debugging-port=9222"],
});

context.on("response", async (response) => {
  const req = response.request();
  if (!["xhr", "fetch"].includes(req.resourceType())) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    method: req.method(),
    url: response.url(),
    status: response.status(),
    contentType: response.headers()["content-type"] ?? "",
    postData: req.postData()?.slice(0, 5000) ?? null,
  };
  if (response.url().includes("router-graphql")) {
    try {
      entry.reqHeaders = Object.fromEntries(
        Object.entries(await req.allHeaders()).map(([k, v]) => [k, v.slice(0, 80)])
      );
    } catch {
      /* başlıklar alınamadı */
    }
  }
  try {
    const ct = String(entry.contentType);
    if (ct.includes("json") || ct.includes("grpc")) {
      const body = await response.body();
      entry.bodyLength = body.length;
      if (body.length < 20000) {
        entry.body = ct.includes("json") ? body.toString("utf8") : body.toString("base64");
      }
    }
  } catch {
    // gövde alınamadı (ör. yönlendirme) — üst veri kaydını koru
  }
  logStream.write(JSON.stringify(entry) + "\n");
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://atlas.getmidas.com/", { waitUntil: "domcontentloaded" });
console.log("Tarayıcı açık. CDP http://localhost:9222 üzerinde — bu süreci çalışır bırak.");

// sonlandırılana kadar açık tut
await new Promise(() => {});
