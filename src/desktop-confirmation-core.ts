import {
  createConfirmationQueue,
  type ApprovalPreview,
  type ConfirmationDecision,
} from "./order-approval.js";

export type DialogAttempt = ConfirmationDecision | "missing";
export type DialogRunner = (
  command: "kdialog" | "zenity",
  args: string[],
  timeoutMs: number
) => Promise<DialogAttempt>;

const money = (value: number) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function optionalLine(label: string, value: number | null | undefined): string[] {
  return value == null ? [] : [`${label}: ${money(value)}`];
}

export function formatApprovalMessage(preview: ApprovalPreview): string {
  const action = preview.action === "PLACE" ? "YENİ EMİR" : preview.action === "UPDATE" ? "EMİR GÜNCELLEME" : "EMİR İPTALİ";
  const lines = [
    action,
    "",
    `Enstrüman: ${preview.instrumentName} (${preview.symbol})`,
    `Piyasa: ${preview.market}`,
    `Yön: ${preview.side}`,
    `Emir tipi: ${preview.orderType}`,
    ...(preview.quantity == null ? [] : [`Adet: ${preview.quantity}`]),
    ...(preview.amountTry == null ? [] : [`Tutar: ₺${money(preview.amountTry)}`]),
    ...optionalLine("Limit fiyatı", preview.limitPrice),
    ...optionalLine("Kâr al fiyatı", preview.takeProfitPrice),
    ...optionalLine("Zarar durdur fiyatı", preview.stopLossPrice),
    ...optionalLine("Güncel fiyat", preview.currentPrice),
    `Tahmini TL tutarı: ₺${money(preview.estimatedTry)}`,
    `Hesap: ${preview.accountUid}`,
  ];
  if (preview.oldValues) lines.push("", `Eski değerler:\n${JSON.stringify(preview.oldValues, null, 2)}`);
  if (preview.newValues) lines.push("", `Yeni değerler:\n${JSON.stringify(preview.newValues, null, 2)}`);
  lines.push("", "Bu işlemi Midas'a göndermek istiyor musunuz?");
  return lines.join("\n");
}

export function createDesktopConfirmationGate(
  runDialog: DialogRunner,
  environment: Record<string, string | undefined>
) {
  const raw = async (preview: ApprovalPreview): Promise<ConfirmationDecision> => {
    if (!environment.DISPLAY && !environment.WAYLAND_DISPLAY) return "unavailable";
    const message = formatApprovalMessage(preview);
    const kdialog = await runDialog(
      "kdialog",
      [
        "--title",
        "Midas emir onayı",
        "--yes-label",
        "Evet",
        "--no-label",
        "Hayır",
        "--defaultno",
        "--yesno",
        message,
      ],
      120_000
    );
    if (kdialog !== "missing") return kdialog;

    const zenity = await runDialog(
      "zenity",
      [
        "--question",
        "--title=Midas emir onayı",
        `--text=${message}`,
        "--ok-label=Evet",
        "--cancel-label=Hayır",
        "--default-cancel",
        "--timeout=120",
        "--no-wrap",
      ],
      120_000
    );
    return zenity === "missing" ? "unavailable" : zenity;
  };

  return createConfirmationQueue(raw);
}
