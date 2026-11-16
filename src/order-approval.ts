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

export function denialMessage(outcome: ConfirmationOutcome): string {
  const where = outcome.dialog ? ` (pencere: ${outcome.dialog})` : "";
  switch (outcome.decision) {
    case "rejected":
      return `İşlem gönderilmedi: onay penceresinde Hayır seçildi${where}.`;
    case "timeout":
      return `İşlem gönderilmedi: onay penceresi 120 sn içinde cevaplanmadı${where}.`;
    case "unavailable":
      return `İşlem gönderilmedi: onay penceresi açılamadı: ${outcome.detail ?? "masaüstü oturumu ya da pencere aracı yok"}.`;
    case "error":
      return `İşlem gönderilmedi: onay penceresi açılamadı: ${outcome.detail ?? "bilinmeyen hata"}${where}.`;
    default:
      return `İşlem gönderilmedi: masaüstü onayı ${outcome.decision}.`;
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
      throw new ApprovalDeniedError(
        `Onaydan sonra işlem koşulları değişti; işlem gönderilmedi${validation.reason ? `: ${validation.reason}` : "."}`
      );
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
