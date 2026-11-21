import { defineMessages } from "./i18n.js";

export type ConfirmationDecision = "approved" | "rejected" | "timeout" | "unavailable" | "error";

export interface ApprovalPreview {
  action: "PLACE" | "UPDATE" | "CANCEL";
  instrumentName: string;
  symbol: string;
  market: string;
  side: "ALIŞ" | "SATIŞ";
  orderType: string;
  quantity?: number | null;
  amountTry?: number | null;
  limitPrice?: number | null;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  currentPrice?: number | null;
  estimatedTry: number;
  accountUid: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export interface AuditEvent {
  event: "preview" | "confirmation" | "revalidation" | "mutation_result" | "error";
  action: ApprovalPreview["action"];
  symbol: string;
  details?: Record<string, unknown>;
}

export class ApprovalDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalDeniedError";
  }
}

export interface DialogAttemptRecord {
  tool: string;
  outcome: string;
  detail?: string;
  /** Ortamdan yapılandırılmış onay komutu (MIDAS_CONFIRM_LOCAL/REMOTE); hangi komutun sorduğu kayda geçer. */
  command?: string[];
}

// Kapının ayrıntılı sonucu: hangi pencere açıldı, neden. "error" ve "unavailable"
// kullanıcı reddi değildir; araç hatasıdır ve öyle raporlanır.
export interface ConfirmationOutcome {
  decision: ConfirmationDecision;
  dialog?: string | null;
  detail?: string;
  attempts?: DialogAttemptRecord[];
}

type ConfirmationFunction = (preview: ApprovalPreview) => Promise<ConfirmationDecision | ConfirmationOutcome>;

function normalizeOutcome(value: ConfirmationDecision | ConfirmationOutcome): ConfirmationOutcome {
  return typeof value === "string" ? { decision: value } : value;
}

const M = defineMessages(
  {
    where: (dialog: string) => ` (pencere: ${dialog})`,
    rejected: (where: string) => `İşlem gönderilmedi: onay penceresinde Hayır seçildi${where}.`,
    timeout: (where: string) => `İşlem gönderilmedi: onay penceresi 120 sn içinde cevaplanmadı${where}.`,
    unavailable: (detail: string | undefined) =>
      `İşlem gönderilmedi: onay penceresi açılamadı: ${detail ?? "masaüstü oturumu ya da pencere aracı yok"}.`,
    error: (detail: string | undefined, where: string) =>
      `İşlem gönderilmedi: onay penceresi açılamadı: ${detail ?? "bilinmeyen hata"}${where}.`,
    other: (decision: string) => `İşlem gönderilmedi: masaüstü onayı ${decision}.`,
    changed: (reason: string | undefined) =>
      `Onaydan sonra işlem koşulları değişti; işlem gönderilmedi${reason ? `: ${reason}` : "."}`,
  },
  {
    where: (dialog) => ` (window: ${dialog})`,
    rejected: (where) => `Order not sent: No was chosen in the approval window${where}.`,
    timeout: (where) => `Order not sent: the approval window got no answer within 120 seconds${where}.`,
    unavailable: (detail) =>
      `Order not sent: the approval window couldn't open: ${detail ?? "no desktop session or dialog tool"}.`,
    error: (detail, where) => `Order not sent: the approval window couldn't open: ${detail ?? "unknown error"}${where}.`,
    other: (decision) => `Order not sent: desktop approval returned ${decision}.`,
    changed: (reason) => `Order not sent: conditions changed after approval${reason ? `: ${reason}` : "."}`,
  }
);

export function denialMessage(outcome: ConfirmationOutcome): string {
  const text = M();
  const where = outcome.dialog ? text.where(outcome.dialog) : "";
  switch (outcome.decision) {
    case "rejected":
      return text.rejected(where);
    case "timeout":
      return text.timeout(where);
    case "unavailable":
      return text.unavailable(outcome.detail);
    case "error":
      return text.error(outcome.detail, where);
    default:
      return text.other(outcome.decision);
  }
}

export function createConfirmationQueue<R>(
  confirm: (preview: ApprovalPreview) => Promise<R>
): (preview: ApprovalPreview) => Promise<R> {
  let tail: Promise<void> = Promise.resolve();

  return (preview) => {
    const result = tail.then(() => confirm(preview));
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

export async function executeWithApproval<T>({
  preview,
  confirm,
  mutate,
  revalidate,
  audit,
}: {
  preview: ApprovalPreview;
  confirm: ConfirmationFunction;
  mutate: () => Promise<T>;
  revalidate?: () => Promise<{ ok: boolean; reason?: string }>;
  audit: (event: AuditEvent) => Promise<void>;
}): Promise<T> {
  await audit({ event: "preview", action: preview.action, symbol: preview.symbol, details: { preview } });

  let outcome: ConfirmationOutcome;
  try {
    outcome = normalizeOutcome(await confirm(preview));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await audit({
      event: "confirmation",
      action: preview.action,
      symbol: preview.symbol,
      details: { decision: "error", error: detail },
    });
    throw new ApprovalDeniedError(denialMessage({ decision: "error", detail }));
  }

  await audit({
    event: "confirmation",
    action: preview.action,
    symbol: preview.symbol,
    details: {
      decision: outcome.decision,
      dialog: outcome.dialog ?? null,
      ...(outcome.detail ? { detail: outcome.detail } : {}),
      ...(outcome.attempts ? { attempts: outcome.attempts } : {}),
    },
  });
  if (outcome.decision !== "approved") {
    throw new ApprovalDeniedError(denialMessage(outcome));
  }

  if (revalidate) {
    const validation = await revalidate();
    await audit({
      event: "revalidation",
      action: preview.action,
      symbol: preview.symbol,
      details: validation,
    });
    if (!validation.ok) {
      throw new ApprovalDeniedError(M().changed(validation.reason));
    }
  }

  try {
    const result = await mutate();
    await audit({
      event: "mutation_result",
      action: preview.action,
      symbol: preview.symbol,
      details: { ok: true, result },
    });
    return result;
  } catch (error) {
    await audit({
      event: "error",
      action: preview.action,
      symbol: preview.symbol,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
