import { buildDialogModel, CONFIRMATION_TIMEOUT_SECONDS, formatApprovalMessage } from "./confirmation-view.js";
import {
  createConfirmationQueue,
  type ApprovalPreview,
  type ConfirmationOutcome,
  type DialogAttemptRecord,
} from "./order-approval.js";
import { parseAccountLabel } from "./instance.js";
import { parseCommandSetting } from "./command-setting.js";

// Onay zinciri: tasarımlı pencere (onay/onay.py) → kdialog → zenity → "unavailable".
// Bir sonraki araca yalnızca önceki araç HİÇ açılamadıysa geçilir; kullanıcının
// gördüğü bir pencerenin sonucu (Hayır, zaman aşımı) asla başka bir pencereyle
// yeniden sorulmaz. Araç hatası ("error") hiçbir zaman "rejected" diye okunmaz.
//
// İsteğe bağlı komutlar (yalnız sunucunun kendi ortamından, ör. servis dosyası):
// - MIDAS_CONFIRM_REMOTE: aynı stdin/stdout protokolüyle onay penceresini başka bir yerde
//   açan komut (JSON dizi, ör. ssh ile başka bir masaüstünde onay.py). Pencere burada ve
//   orada aynı anda açılır; gösterilmiş bir pencerede verilen ilk Evet, Hayır ya da zaman
//   aşımı karar olur, öteki pencere kapatılır. Hiç açılamayan pencere (makine kapalı, ssh
//   bağlanamadı) beklenmez. MIDAS_CONFIRM_REMOTE_CLOSE açık kalan uzak pencereyi kapatır.
// - MIDAS_CONFIRM_LOCAL: yerel onay penceresi komutunun yerine geçer (ekranına kimsenin
//   bakmadığı bir makine için). O zaman yerel ekran gerekmez, kdialog ve zenity yedekleri
//   çalışmaz. MIDAS_CONFIRM_LOCAL_CLOSE o pencereyi kapatır.
// Bu komutlar yerel pencere kadar güvenilir sayılır: servis yapılandırmasını kim
// yönetiyorsa onayları da o yönetir. Kullanılan komut denetim günlüğüne yazılır.

export type DialogTool = "onay" | "onay-remote" | "kdialog" | "zenity";
export type AttemptOutcome = "approved" | "rejected" | "timeout" | "error" | "missing";

export interface DialogAttempt {
  outcome: AttemptOutcome;
  /** Pencere kullanıcıya gösterildi mi (ya da gösterilmiş sayılmalı mı)? */
  shown: boolean;
  detail?: string;
}

export interface DialogSpec {
  tool: DialogTool;
  command: string;
  args: string[];
  stdin?: string;
  timeoutMs: number;
  /** Abort, süreci öldürür (bir pencere karar verince ötekini kapatmak için). */
  signal?: AbortSignal;
  /** Komut ortamdan yapılandırıldı (MIDAS_CONFIRM_*); denetim kaydına komutun kendisi de yazılır. */
  configured?: boolean;
}

export interface ProcessResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: { code?: string; message: string };
}

export type ProcessRunner = (spec: DialogSpec) => Promise<ProcessResult>;

export interface GateOptions {
  pythonPath: string;
  onayScript: string;
}

const TITLE = "midas-mcp emir onayı";
const TIMEOUT_MS = CONFIRMATION_TIMEOUT_SECONDS * 1000;
const CLOSE_TIMEOUT_MS = 15_000;

function record(spec: DialogSpec, attempt: DialogAttempt): DialogAttemptRecord {
  return {
    tool: spec.tool,
    outcome: attempt.outcome,
    ...(attempt.detail ? { detail: attempt.detail } : {}),
    ...(spec.configured ? { command: [spec.command, ...spec.args] } : {}),
  };
}

/** Gösterilmiş bir pencerenin bu sonucu karardır; öteki pencere beklenmez. */
function decisive(attempt: DialogAttempt): boolean {
  return attempt.shown && (attempt.outcome === "approved" || attempt.outcome === "rejected" || attempt.outcome === "timeout");
}

/**
 * Yerel ve uzak onay penceresini birlikte çalıştırır. Gösterilmiş bir penceredeki Evet, Hayır
 * ya da zaman aşımı hemen karar olur ve öteki pencere kapatılır (abort + varsa kapatma komutu).
 * Hiç açılamayan ya da gösterildikten sonra hatayla biten pencere ötekini beklerken yok sayılır;
 * ikisi de kararsız biterse gösterilmiş olan, yoksa yerel sonuç döner.
 */
export async function raceOnay(
  run: ProcessRunner,
  local: DialogSpec,
  remote: DialogSpec,
  closeLocal: DialogSpec | null,
  closeRemote: DialogSpec | null
): Promise<{ winner: DialogSpec; attempt: DialogAttempt; records: DialogAttemptRecord[] }> {
  const windows = [
    { spec: local, close: closeLocal, controller: new AbortController() },
    { spec: remote, close: closeRemote, controller: new AbortController() },
  ];
  const records: DialogAttemptRecord[] = [];
  const settled: Array<{ spec: DialogSpec; attempt: DialogAttempt }> = [];
  return new Promise((resolve) => {
    let done = false;
    const finish = (winner: DialogSpec, attempt: DialogAttempt) => {
      if (done) return;
      done = true;
      for (const { spec, close, controller } of windows) {
        if (spec === winner || settled.some((item) => item.spec === spec)) continue;
        controller.abort();
        if (close) void run(close).catch(() => undefined);
      }
      resolve({ winner, attempt, records });
    };
    for (const { spec, controller } of windows) {
      run({ ...spec, signal: controller.signal })
        .then(interpretOnay, (error: unknown): DialogAttempt => ({
          outcome: "error",
          shown: false,
          detail: error instanceof Error ? error.message : String(error),
        }))
        .then((attempt) => {
          if (done) return;
          records.push(record(spec, attempt));
          settled.push({ spec, attempt });
          if (decisive(attempt)) return finish(spec, attempt);
          if (settled.length < windows.length) return;
          const pick = settled.find((item) => item.attempt.shown) ?? settled.find((item) => item.spec === local) ?? settled[0];
          finish(pick.spec, pick.attempt);
        });
    }
  });
}

/** `kdialog --help-all` (KDE Frameworks 6) çıktısında bulunan, kullandığımız seçenekler. */
export const KDIALOG_SUPPORTED_OPTIONS = new Set(["--title", "--default", "--menu"]);
/** `zenity --help-question` / `--help-general` çıktısında bulunan, kullandığımız seçenekler. */
export const ZENITY_SUPPORTED_OPTIONS = new Set([
  "--question",
  "--title",
  "--text",
  "--ok-label",
  "--cancel-label",
  "--default-cancel",
  "--timeout",
  "--no-wrap",
]);

function tail(text: string, max = 300): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
}

function spawnFailure(result: ProcessResult): DialogAttempt | null {
  if (!result.spawnError) return null;
  if (result.spawnError.code === "ENOENT") return { outcome: "missing", shown: false, detail: "komut bulunamadı" };
  return { outcome: "error", shown: false, detail: `başlatılamadı: ${result.spawnError.message}` };
}

function exitDescription(result: ProcessResult): string {
  return result.signal ? `sinyal ${result.signal}` : `çıkış kodu ${result.code}`;
}

/**
 * onay.py protokolü: pencere gösterilince stdout'a "ACILDI", bitince "SONUC <x>" yazar.
 * Çıkış kodu 0 = Evet, 1 = Hayır, 2 = hata/zaman aşımı. Kod ile SONUC satırı
 * birbirini doğrulamazsa sonuç hatadır (ör. Python'un yakalanmamış istisnası da 1 döner).
 */
export function interpretOnay(result: ProcessResult): DialogAttempt {
  const failed = spawnFailure(result);
  if (failed) return failed;
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim());
  const shown = lines.includes("ACILDI");
  const verdict = [...lines].reverse().find((line) => line.startsWith("SONUC "))?.slice(6).trim() ?? "";
  if (result.timedOut) {
    return shown
      ? { outcome: "timeout", shown }
      : { outcome: "error", shown, detail: "pencere zamanında açılmadı" };
  }
  if (result.code === 0 && verdict === "evet" && shown) return { outcome: "approved", shown };
  if (result.code === 1 && verdict === "hayir" && shown) return { outcome: "rejected", shown };
  if (result.code === 2 && verdict === "zaman-asimi" && shown) return { outcome: "timeout", shown };
  const reason = verdict.startsWith("hata") ? verdict.slice(4).trim() : tail(result.stderr) || verdict;
  return {
    outcome: "error",
    shown,
    detail: `onay penceresi ${exitDescription(result)}${reason ? `: ${reason}` : ""}`,
  };
}

const KDIALOG_USAGE_ERROR = /bilinmeyen seçenek|unknown option|kullanım:|usage:/i;

/**
 * kdialog `--menu` yalnızca seçilen öğenin etiketini yazar; onay için stdout TAM OLARAK
 * "evet" olmalıdır. Böylece hata, iptal ya da boş seçim hiçbir zaman onay sayılmaz.
 */
export function interpretKdialog(result: ProcessResult): DialogAttempt {
  const failed = spawnFailure(result);
  if (failed) return failed;
  if (result.timedOut) return { outcome: "timeout", shown: true };
  const choice = result.stdout.trim();
  if (result.code === 0 && choice === "evet") return { outcome: "approved", shown: true };
  if (result.code === 0 && choice === "hayir") return { outcome: "rejected", shown: true };
  if (result.code === 0) return { outcome: "error", shown: true, detail: `kdialog beklenmeyen seçim döndü: ${tail(choice, 60) || "boş"}` };
  if (result.code === 1 && KDIALOG_USAGE_ERROR.test(result.stderr)) {
    // Geçersiz bayrak: pencere hiç açılmadı; bu kullanıcı reddi değildir.
    return { outcome: "error", shown: false, detail: `kdialog ${tail(result.stderr)}` };
  }
  if (result.code === 1) return { outcome: "rejected", shown: true };
  return { outcome: "error", shown: false, detail: `kdialog ${exitDescription(result)}${result.stderr ? `: ${tail(result.stderr)}` : ""}` };
}

export function interpretZenity(result: ProcessResult): DialogAttempt {
  const failed = spawnFailure(result);
  if (failed) return failed;
  if (result.timedOut) return { outcome: "timeout", shown: true };
  if (result.code === 0) return { outcome: "approved", shown: true };
  if (result.code === 1) return { outcome: "rejected", shown: true };
  if (result.code === 5) return { outcome: "timeout", shown: true };
  return { outcome: "error", shown: false, detail: `zenity ${exitDescription(result)}${result.stderr ? `: ${tail(result.stderr)}` : ""}` };
}

export function kdialogArgs(message: string, title = TITLE): string[] {
  return [
    "--title",
    title,
    "--default",
    "hayir",
    "--menu",
    `${message}\n\nOnay için "Evet, gönder" satırını seçip Tamam'a basın.`,
    "hayir",
    "Hayır, gönderme",
    "evet",
    "Evet, gönder",
  ];
}

export function zenityArgs(message: string, title = TITLE): string[] {
  return [
    "--question",
    `--title=${title}`,
    `--text=${message}`,
    "--ok-label=Evet",
    "--cancel-label=Hayır",
    "--default-cancel",
    `--timeout=${CONFIRMATION_TIMEOUT_SECONDS}`,
    "--no-wrap",
  ];
}

export function createDesktopConfirmationGate(
  run: ProcessRunner,
  environment: Record<string, string | undefined>,
  options: GateOptions
) {
  const accountLabel = parseAccountLabel(environment.MIDAS_ACCOUNT_LABEL);
  const title = accountLabel ? `${TITLE} — Hesap: ${accountLabel}` : TITLE;
  // Geçersiz komut ayarı sessizce yok sayılmaz: her onay isteği hata (yine ret) döner.
  let commands: Record<"local" | "localClose" | "remote" | "remoteClose", string[] | null>;
  let settingError: string | null = null;
  try {
    commands = {
      local: parseCommandSetting("MIDAS_CONFIRM_LOCAL", environment.MIDAS_CONFIRM_LOCAL),
      localClose: parseCommandSetting("MIDAS_CONFIRM_LOCAL_CLOSE", environment.MIDAS_CONFIRM_LOCAL_CLOSE),
      remote: parseCommandSetting("MIDAS_CONFIRM_REMOTE", environment.MIDAS_CONFIRM_REMOTE),
      remoteClose: parseCommandSetting("MIDAS_CONFIRM_REMOTE_CLOSE", environment.MIDAS_CONFIRM_REMOTE_CLOSE),
    };
  } catch (error) {
    commands = { local: null, localClose: null, remote: null, remoteClose: null };
    settingError = error instanceof Error ? error.message : String(error);
  }
  const closeSpec = (tool: DialogTool, command: string[] | null): DialogSpec | null =>
    command ? { tool, command: command[0], args: command.slice(1), timeoutMs: CLOSE_TIMEOUT_MS, configured: true } : null;

  const raw = async (preview: ApprovalPreview): Promise<ConfirmationOutcome> => {
    if (settingError) return { decision: "error", dialog: null, detail: settingError, attempts: [] };
    if (!commands.local && !environment.DISPLAY && !environment.WAYLAND_DISPLAY) {
      return { decision: "unavailable", dialog: null, detail: "masaüstü oturumu yok (DISPLAY/WAYLAND_DISPLAY boş)", attempts: [] };
    }
    const message = formatApprovalMessage(preview, accountLabel);
    const chain: Array<{ spec: DialogSpec; interpret: (result: ProcessResult) => DialogAttempt }> = [
      {
        spec: {
          tool: "onay",
          command: options.pythonPath,
          args: [options.onayScript],
          stdin: JSON.stringify(buildDialogModel(preview, accountLabel)),
          // Pencere kendi 120 sn sayacını tutar; bu süre yalnızca asılmaya karşı yedek.
          timeoutMs: TIMEOUT_MS + 15_000,
        },
        interpret: interpretOnay,
      },
      { spec: { tool: "kdialog", command: "kdialog", args: kdialogArgs(message, title), timeoutMs: TIMEOUT_MS }, interpret: interpretKdialog },
      { spec: { tool: "zenity", command: "zenity", args: zenityArgs(message, title), timeoutMs: TIMEOUT_MS + 5_000 }, interpret: interpretZenity },
    ];

    if (commands.local) {
      chain[0].spec = { ...chain[0].spec, command: commands.local[0], args: commands.local.slice(1), configured: true };
      chain.length = 1; // kdialog ve zenity kimsenin bakmadığı bu ekranda açılırdı
    }

    const attempts: DialogAttemptRecord[] = [];
    if (commands.remote) {
      const local = chain[0].spec;
      const remote: DialogSpec = { ...local, tool: "onay-remote", command: commands.remote[0], args: commands.remote.slice(1), configured: true };
      const { winner, attempt, records } = await raceOnay(
        run,
        local,
        remote,
        closeSpec("onay", commands.localClose),
        closeSpec("onay-remote", commands.remoteClose)
      );
      attempts.push(...records);
      if (attempt.shown) {
        return { decision: attempt.outcome as ConfirmationOutcome["decision"], dialog: winner.tool, ...(attempt.detail ? { detail: attempt.detail } : {}), attempts };
      }
      chain.shift(); // iki onay penceresi de açılamadı: buradaki kdialog ve zenity denenir
    }

    for (const { spec, interpret } of chain) {
      let attempt: DialogAttempt;
      try {
        attempt = interpret(await run(spec));
      } catch (error) {
        attempt = { outcome: "error", shown: false, detail: error instanceof Error ? error.message : String(error) };
      }
      attempts.push(record(spec, attempt));
      const { outcome } = attempt;
      if (outcome === "missing" || (outcome === "error" && !attempt.shown)) continue;
      return {
        decision: outcome,
        dialog: spec.tool,
        ...(attempt.detail ? { detail: attempt.detail } : {}),
        attempts,
      };
    }

    const errors = attempts.filter((item) => item.outcome === "error");
    if (errors.length) {
      return {
        decision: "error",
        dialog: null,
        detail: errors.map((item) => `${item.tool}: ${item.detail ?? "hata"}`).join("; "),
        attempts,
      };
    }
    const tried = commands.local ? "onay komutu" : "onay penceresi, kdialog ve zenity";
    return { decision: "unavailable", dialog: null, detail: `${tried} bulunamadı`, attempts };
  };

  return createConfirmationQueue(raw);
}

export { formatApprovalMessage };
