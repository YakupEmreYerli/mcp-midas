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

type ConfirmationFunction = (preview: ApprovalPreview) => Promise<ConfirmationDecision>;

export function createConfirmationQueue(confirm: ConfirmationFunction): ConfirmationFunction {
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

  let decision: ConfirmationDecision;
  try {
    decision = await confirm(preview);
  } catch (error) {
    decision = "error";
    await audit({
      event: "confirmation",
      action: preview.action,
      symbol: preview.symbol,
      details: { decision, error: error instanceof Error ? error.message : String(error) },
    });
    throw new ApprovalDeniedError("Onay penceresi açılamadı; işlem güvenli biçimde reddedildi.");
  }

  await audit({
    event: "confirmation",
    action: preview.action,
    symbol: preview.symbol,
    details: { decision },
  });
  if (decision !== "approved") {
    throw new ApprovalDeniedError(`İşlem gönderilmedi: masaüstü onayı ${decision}.`);
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
