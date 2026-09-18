import { buildDialogModel, CONFIRMATION_TIMEOUT_SECONDS, formatApprovalMessage } from "./confirmation-view.js";
import {
  createConfirmationQueue,
  type ApprovalPreview,
  type ConfirmationOutcome,
  type DialogAttemptRecord,
} from "./order-approval.js";

// Onay zinciri: tasarımlı pencere (onay/onay.py) → kdialog → zenity → "unavailable".
// Bir sonraki araca yalnızca önceki araç HİÇ açılamadıysa geçilir; kullanıcının
// gördüğü bir pencerenin sonucu (Hayır, zaman aşımı) asla başka bir pencereyle
// yeniden sorulmaz. Araç hatası ("error") hiçbir zaman "rejected" diye okunmaz.

export type DialogTool = "onay" | "kdialog" | "zenity";
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

const TITLE = "Midas-MCP emir onayı";
const TIMEOUT_MS = CONFIRMATION_TIMEOUT_SECONDS * 1000;

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

export function kdialogArgs(message: string): string[] {
  return [
    "--title",
    TITLE,
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

export function zenityArgs(message: string): string[] {
  return [
    "--question",
    `--title=${TITLE}`,
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
  const raw = async (preview: ApprovalPreview): Promise<ConfirmationOutcome> => {
    if (!environment.DISPLAY && !environment.WAYLAND_DISPLAY) {
      return { decision: "unavailable", dialog: null, detail: "masaüstü oturumu yok (DISPLAY/WAYLAND_DISPLAY boş)", attempts: [] };
    }
    const message = formatApprovalMessage(preview);
    const chain: Array<{ spec: DialogSpec; interpret: (result: ProcessResult) => DialogAttempt }> = [
      {
        spec: {
          tool: "onay",
          command: options.pythonPath,
          args: [options.onayScript],
          stdin: JSON.stringify(buildDialogModel(preview)),
          // Pencere kendi 120 sn sayacını tutar; bu süre yalnızca asılmaya karşı yedek.
          timeoutMs: TIMEOUT_MS + 15_000,
        },
        interpret: interpretOnay,
      },
      { spec: { tool: "kdialog", command: "kdialog", args: kdialogArgs(message), timeoutMs: TIMEOUT_MS }, interpret: interpretKdialog },
      { spec: { tool: "zenity", command: "zenity", args: zenityArgs(message), timeoutMs: TIMEOUT_MS + 5_000 }, interpret: interpretZenity },
    ];

    const attempts: DialogAttemptRecord[] = [];
    for (const { spec, interpret } of chain) {
      let attempt: DialogAttempt;
      try {
        attempt = interpret(await run(spec));
      } catch (error) {
        attempt = { outcome: "error", shown: false, detail: error instanceof Error ? error.message : String(error) };
      }
      attempts.push({ tool: spec.tool, outcome: attempt.outcome, ...(attempt.detail ? { detail: attempt.detail } : {}) });
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
    return { decision: "unavailable", dialog: null, detail: "onay penceresi, kdialog ve zenity bulunamadı", attempts };
  };

  return createConfirmationQueue(raw);
}

export { formatApprovalMessage };
