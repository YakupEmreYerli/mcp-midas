/**
 * Giriş penceresini göz önünden kaldırma ve canlı tutma ayarları.
 *
 * Bu modül `config.ts`'i içe aktarmaz; ayrıştırma ve betik üretimi ağa ya da kimlik
 * bilgisine dokunmadan test edilebilsin diye saf tutulur. Yan etkili yardımcılar
 * (`busctl`, `notify-send`) hata vermez: masaüstü yoksa sessizce atlanır.
 */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineMessages, type Lang } from "./i18n.js";

const M = defineMessages(
  {
    invalid: (name: string, value: string | undefined, allowed: string) =>
      `${name} geçersiz: "${value}". Geçerli değerler: ${allowed}`,
    notNegative: (name: string, value: string | undefined) => `${name} sıfır ya da pozitif bir sayı olmalı: "${value}"`,
  },
  {
    invalid: (name, value, allowed) => `${name} is invalid: "${value}". Valid values: ${allowed}`,
    notNegative: (name, value) => `${name} must be zero or a positive number: "${value}"`,
  }
);

/**
 * Giriş gerektiğinde tarayıcının nasıl açılacağı.
 * - `hidden`: görünür (headed) Chromium XWayland'da açılır, KWin betiği onu küçültür,
 *   ekran dışına alır, görev çubuğundan gizler. Varsayılan.
 * - `visible`: eski davranış; normal görünür pencere.
 * - `headless`: giriş formu başsız doldurulur. Cloudflare Turnstile doğrulaması başsız
 *   geçmezse form gönderilmeden `hidden` moduna düşülür (telefona bildirim gitmez).
 */
export type LoginWindowMode = "hidden" | "visible" | "headless";

export const LOGIN_WINDOW_MODES: readonly LoginWindowMode[] = ["hidden", "visible", "headless"];

/** Chromium'a `--class` ile verilen X11 WM_CLASS; KWin betiği yalnız bu pencereye dokunur. */
export const LOGIN_WINDOW_CLASS = "mcp-midas-login";

export const DEFAULT_KEEPALIVE_HOURS = 4;

/**
 * Formdan sonraki doğrulama yolu (`MIDAS_LOGIN_METHOD`).
 * - `push`: telefondaki Midas uygulamasına giden bildirim onaylanır. Varsayılan.
 * - `sms`: mobil onay ekranında "SMS ile giriş yap" seçilir, kullanıcı gelen kodu pencereye
 *   kendisi yazar. Bildirim onayının "geçersiz imza" verdiği hesaplar için.
 */
export type LoginMethod = "push" | "sms";

export function parseLoginMethod(value: string | undefined): LoginMethod {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "push";
  if (v === "push" || v === "sms") return v;
  throw new Error(M().invalid("MIDAS_LOGIN_METHOD", value, "push, sms"));
}

/** SMS kodu (4-8 rakam) komut çıktısında; rakamlar arasındaki boşluk ve tire kabul edilir. Yoksa null. */
export function extractSmsCode(output: string): string | null {
  const digits = output.replace(/[\s-]/g, "");
  return /^\d{4,8}$/.test(digits) ? digits : null;
}

/**
 * SMS kodunu soracak komut: `MIDAS_SMS_CODE_COMMAND` verildiyse o; verilmediyse ve yerel masaüstü
 * varsa depodaki SMS kodu penceresi (onay/sms.py); ikisi de yoksa null (kod Midas penceresine
 * elle yazılır).
 */
export function resolveSmsCodeCommand(
  configured: string[] | null,
  env: NodeJS.ProcessEnv,
  smsScript: string,
  exists: (file: string) => boolean = fs.existsSync
): string[] | null {
  if (configured) return configured;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  if (!exists(smsScript)) return null;
  // Sistem Python'u PySide6 + QtWebEngine taşır; systemd servisinin PATH'ine güvenilmez.
  return [exists("/usr/bin/python3") ? "/usr/bin/python3" : "python3", smsScript];
}

/**
 * SMS kodunu soran komutu çalıştırır (`MIDAS_SMS_CODE_COMMAND`). Komuta stdin'den JSON verilir
 * (`hesapEtiketi`, `sureSn`; `dil` yalnız `MIDAS_LANG` açıkça verilmişse, yoksa pencere kendi
 * cihazının dilini bulur); komut kodu stdout'a yazıp 0 ile çıkar. İptal, hata, zaman aşımı
 * ya da kod olmayan çıktı null döner. Kod hiçbir yere yazılmaz; çağıran yalnız sayfaya yazar.
 */
export function askSmsCode(
  command: string[],
  input: { hesapEtiketi: string | null; sureSn: number; dil?: Lang | null },
  timeoutMs: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(command[0], command.slice(1), { timeout: timeoutMs, maxBuffer: 4096 }, (error, stdout) =>
      resolve(error ? null : extractSmsCode(String(stdout)))
    );
    child.stdin?.on("error", () => undefined);
    const { dil, ...rest } = input;
    child.stdin?.end(JSON.stringify(dil ? { ...rest, dil } : rest));
  });
}

export function parseLoginWindowMode(value: string | undefined): LoginWindowMode {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "hidden";
  if ((LOGIN_WINDOW_MODES as readonly string[]).includes(v)) return v as LoginWindowMode;
  throw new Error(M().invalid("MIDAS_LOGIN_WINDOW", value, LOGIN_WINDOW_MODES.join(", ")));
}

export const DEFAULT_IDLE_CLOSE_MINUTES = 10;

/**
 * `MIDAS_IDLE_CLOSE_MINUTES`: son araç çağrısından bu kadar dakika sonra tarayıcı kapanır;
 * oturum diske kaydedildiği için sonraki çağrı onu sessizce yeniden açar. 0 kapatır.
 */
export function parseIdleCloseMs(value: string | undefined): number {
  const raw = (value ?? "").trim();
  const minutes = raw === "" ? DEFAULT_IDLE_CLOSE_MINUTES : Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error(M().notNegative("MIDAS_IDLE_CLOSE_MINUTES", value));
  }
  return Math.round(minutes * 60_000);
}

/** Saat cinsinden aralığı milisaniyeye çevirir; 0 döngüyü kapatır. */
export function parseKeepAliveMs(value: string | undefined): number {
  const raw = (value ?? "").trim();
  const hours = raw === "" ? DEFAULT_KEEPALIVE_HOURS : Number(raw);
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(M().notNegative("MIDAS_KEEPALIVE_HOURS", value));
  }
  if (hours === 0) return 0;
  // Dakikadan kısa aralık Atlas'ı gereksiz yere yoklar; alt sınır 5 dakika.
  return Math.max(Math.round(hours * 3_600_000), 5 * 60_000);
}

/**
 * `hidden` modda Chromium'a eklenen argümanlar. Wayland'da istemci pencere konumunu
 * belirleyemez ve KWin betiği `resourceClass`'ı yalnız X11 penceresinde `--class` ile
 * alabilir; bu yüzden pencere XWayland'da açılır. DISPLAY yoksa ek argüman verilmez.
 */
export function hiddenLaunchArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!env.DISPLAY) return [];
  return ["--ozone-platform=x11", `--class=${LOGIN_WINDOW_CLASS}`];
}

/** Giriş penceresini küçültür, ekran dışına alır, saydam yapar, görev çubuğundan gizler. */
export function kwinHideScript(windowClass = LOGIN_WINDOW_CLASS): string {
  return `
const SINIF = ${JSON.stringify(windowClass)};
function gizle(w) {
    if (!w || w.resourceClass !== SINIF) return;
    w.skipTaskbar = true;
    w.skipSwitcher = true;
    w.skipPager = true;
    w.keepBelow = true;
    w.opacity = 0;
    const g = w.frameGeometry;
    w.frameGeometry = { x: -20000, y: -20000, width: g.width, height: g.height };
    w.minimized = true;
}
workspace.windowAdded.connect(gizle);
workspace.windowActivated.connect(gizle);
workspace.windowList().forEach(gizle);
`;
}

/** Gizlenmiş giriş penceresini geri getirir; kullanıcı etkileşimi gerektiğinde kullanılır. */
export function kwinRevealScript(windowClass = LOGIN_WINDOW_CLASS): string {
  return `
const SINIF = ${JSON.stringify(windowClass)};
function goster(w) {
    if (!w || w.resourceClass !== SINIF) return;
    w.opacity = 1;
    w.skipTaskbar = false;
    w.skipSwitcher = false;
    w.skipPager = false;
    w.keepBelow = false;
    w.minimized = false;
    const alan = workspace.clientArea(KWin.PlacementArea, workspace.activeScreen, workspace.currentDesktop);
    const g = w.frameGeometry;
    w.frameGeometry = {
        x: Math.round(alan.x + (alan.width - g.width) / 2),
        y: Math.round(alan.y + (alan.height - g.height) / 2),
        width: g.width, height: g.height
    };
    workspace.activeWindow = w;
}
workspace.windowList().forEach(goster);
`;
}

export const KWIN_HIDE_PLUGIN = "mcp-midas-login-gizle";
export const KWIN_REVEAL_PLUGIN = "mcp-midas-login-goster";

function run(file: string, args: string[], timeoutMs = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout) => resolve(error ? null : String(stdout)));
  });
}

/** `busctl` çıktısındaki betik kimliğini ayrıştırır (ör. `i 3`). Başarısızsa null. */
export function parseBusctlInt(output: string | null): number | null {
  const m = output?.trim().match(/^i\s+(-?\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return id >= 0 ? id : null;
}

/**
 * Betiği KWin'e yükler ve çalıştırır. KWin yoksa (başka masaüstü, oturum yolu yok) false döner;
 * çağıran CDP ile küçültmeye düşer.
 */
export async function loadKwinScript(plugin: string, source: string): Promise<boolean> {
  const dir = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  const file = path.join(dir, `${plugin}.js`);
  try {
    fs.writeFileSync(file, source, { mode: 0o600 });
  } catch {
    return false;
  }
  await unloadKwinScript(plugin);
  const id = parseBusctlInt(
    await run("busctl", ["--user", "call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "loadScript", "ss", file, plugin])
  );
  if (id === null) return false;
  const ran = await run("busctl", ["--user", "call", "org.kde.KWin", `/Scripting/Script${id}`, "org.kde.kwin.Script", "run"]);
  return ran !== null;
}

export async function unloadKwinScript(plugin: string): Promise<void> {
  await run("busctl", ["--user", "call", "org.kde.KWin", "/Scripting", "org.kde.kwin.Scripting", "unloadScript", "s", plugin]);
}

/** Masaüstü bildirimi; notify-send yoksa sessizce atlanır. */
export function notifyDesktop(summary: string, body: string, urgency: "low" | "normal" | "critical" = "normal"): void {
  execFile("notify-send", ["-a", "Midas MCP", "-i", "dialog-password", "-u", urgency, summary, body], { timeout: 3000 }, () => {});
}
