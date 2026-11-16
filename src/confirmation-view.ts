import type { ApprovalPreview } from "./order-approval.js";

// Onay penceresinin gösterdiği her metin burada, saf fonksiyonlarla kurulur. Pencere
// (onay/onay.py + onay.html) yalnızca bu modeli textContent ile çizer; HTML üretmez.

export type ActionLabel = "ALIŞ" | "SATIŞ" | "İPTAL" | "DEĞİŞTİR";
export type Tone = "alis" | "tehlike" | "dikkat";

export interface DialogRow {
  etiket: string;
  deger: string;
}

export interface DialogChange {
  etiket: string;
  eski: string;
  yeni: string;
  degisti: boolean;
}

export interface DialogModel {
  islem: ActionLabel;
  ton: Tone;
  ozet: string;
  sembol: string;
  ad: string;
  pazar: string;
  yon: "ALIŞ" | "SATIŞ";
  emirTipi: string;
  satirlar: DialogRow[];
  tutar: DialogRow;
  /** Tutar harcanacak/alınacak para mı (ALIŞ/SATIŞ/DEĞİŞTİR) yoksa yalnız bilgi mi (İPTAL)? */
  tutarVurgulu: boolean;
  degisiklikler: DialogChange[];
  emirNo: string | null;
  hesap: string;
  soru: string;
  evet: string;
  hayir: string;
  sureSn: number;
}

export const CONFIRMATION_TIMEOUT_SECONDS = 120;

const ORDER_TYPES: Record<string, string> = {
  MARKET: "Piyasa",
  LIMIT: "Limit",
  STOP: "Stop",
  STOP_LIMIT: "Stop limit",
  TAKE_PROFIT: "Kâr al",
  STOP_LOSS: "Zarar durdur",
  TAKE_PROFIT_AND_STOP_LOSS: "Kâr al + zarar durdur",
  DEMAND: "Fon talebi",
};

const FIELD_LABELS: Record<string, string> = {
  quantity: "Adet",
  limitPrice: "Limit fiyatı",
  stopPrice: "Stop fiyatı",
  profitPrice: "Kâr al",
  lossPrice: "Zarar durdur",
  status: "Durum",
};

const PRICE_FIELDS = new Set(["limitPrice", "stopPrice", "profitPrice", "lossPrice"]);

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  NEW: "Bekliyor",
  OPEN: "Bekliyor",
  ACTIVE: "Bekliyor",
  WAITING: "Bekliyor",
  PARTIALLY_FILLED: "Kısmen gerçekleşti",
  CANCELED: "İptal edildi",
  CANCELLED: "İptal edildi",
};

export function formatMoney(value: number): string {
  const text = Math.abs(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₺${text}`;
}

export function formatPrice(value: number): string {
  // Fon fiyatları 6 haneye kadar küsurat taşır; hisse fiyatları 2 hanede kalır.
  const text = value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `₺${text}`;
}

export function formatQuantity(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 6 });
}

export function orderTypeLabel(type: string): string {
  return ORDER_TYPES[type] ?? type;
}

function actionOf(preview: ApprovalPreview): ActionLabel {
  if (preview.action === "CANCEL") return "İPTAL";
  if (preview.action === "UPDATE") return "DEĞİŞTİR";
  return preview.side;
}

function toneOf(action: ActionLabel): Tone {
  if (action === "ALIŞ") return "alis";
  if (action === "DEĞİŞTİR") return "dikkat";
  return "tehlike";
}

const present = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

function fieldValue(field: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "status") return STATUS_LABELS[String(value)] ?? String(value);
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (field === "quantity") return formatQuantity(numeric);
  if (PRICE_FIELDS.has(field)) return numeric === 0 ? "—" : formatPrice(numeric);
  return String(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  const a = Number(left);
  const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return String(left) === String(right);
}

export function buildChanges(
  oldValues: Record<string, unknown> | undefined,
  newValues: Record<string, unknown> | undefined
): DialogChange[] {
  if (!oldValues && !newValues) return [];
  const before = oldValues ?? {};
  const after = newValues ?? {};
  const fields = Object.keys(FIELD_LABELS).filter((field) => {
    if (!Object.hasOwn(after, field) && !Object.hasOwn(before, field)) return false;
    // Durum yalnız işlem onu değiştiriyorsa (iptal) gösterilir.
    if (field === "status" && !Object.hasOwn(after, field)) return false;
    // Midas'ın bu emir tipinde hiç taşımadığı alanları (ikisi de boş) göstermeyiz.
    const emptyBoth = [before[field], after[field]].every((value) => value == null || value === 0);
    return !emptyBoth;
  });
  return fields.map((field) => {
    const oldValue = before[field];
    const newValue = Object.hasOwn(after, field) ? after[field] : oldValue;
    return {
      etiket: FIELD_LABELS[field],
      eski: fieldValue(field, oldValue),
      yeni: fieldValue(field, newValue),
      degisti: !sameValue(oldValue, newValue),
    };
  });
}

function summary(preview: ApprovalPreview, action: ActionLabel): string {
  const verb = preview.side === "ALIŞ" ? "alınacak" : "satılacak";
  const sideWord = preview.side === "ALIŞ" ? "alış" : "satış";
  const qty = present(preview.quantity) ? `${formatQuantity(preview.quantity)} adet ` : "";
  if (action === "İPTAL") {
    const size = present(preview.quantity) ? `${formatQuantity(preview.quantity)} adetlik ` : "";
    return `Bekleyen ${size}${preview.symbol} ${sideWord} emri iptal edilecek.`;
  }
  if (action === "DEĞİŞTİR") {
    return `Bekleyen ${preview.symbol} ${sideWord} emrinin değerleri değişecek.`;
  }
  if (!present(preview.quantity) && present(preview.amountTry)) {
    return `${formatMoney(preview.amountTry)} tutarında ${preview.symbol} ${verb}.`;
  }
  if (preview.orderType === "LIMIT" && present(preview.limitPrice)) {
    return `${qty}${preview.symbol}, ${formatPrice(preview.limitPrice)} limit fiyatla ${verb}.`;
  }
  if (preview.orderType === "MARKET") return `${qty}${preview.symbol} piyasa fiyatından ${verb}.`;
  return `${qty}${preview.symbol}, ${orderTypeLabel(preview.orderType).toLocaleLowerCase("tr-TR")} emriyle ${verb}.`;
}

function rows(preview: ApprovalPreview): DialogRow[] {
  const list: DialogRow[] = [];
  if (present(preview.quantity)) list.push({ etiket: "Adet", deger: formatQuantity(preview.quantity) });
  if (present(preview.amountTry)) list.push({ etiket: "Tutar", deger: formatMoney(preview.amountTry) });
  if (present(preview.limitPrice) && preview.limitPrice !== 0) list.push({ etiket: "Limit fiyatı", deger: formatPrice(preview.limitPrice) });
  if (present(preview.takeProfitPrice) && preview.takeProfitPrice !== 0) list.push({ etiket: "Kâr al", deger: formatPrice(preview.takeProfitPrice) });
  if (present(preview.stopLossPrice) && preview.stopLossPrice !== 0) list.push({ etiket: "Zarar durdur", deger: formatPrice(preview.stopLossPrice) });
  if (present(preview.currentPrice)) list.push({ etiket: "Güncel fiyat", deger: formatPrice(preview.currentPrice) });
  return list;
}

const QUESTIONS: Record<ActionLabel, { soru: string; evet: string }> = {
  ALIŞ: { soru: "Bu alış emri Midas'a gönderilsin mi?", evet: "Evet, al" },
  SATIŞ: { soru: "Bu satış emri Midas'a gönderilsin mi?", evet: "Evet, sat" },
  İPTAL: { soru: "Bu emir iptal edilsin mi?", evet: "Evet, iptal et" },
  DEĞİŞTİR: { soru: "Bu değişiklik Midas'a gönderilsin mi?", evet: "Evet, değiştir" },
};

export function buildDialogModel(preview: ApprovalPreview): DialogModel {
  const islem = actionOf(preview);
  const orderId = preview.oldValues?.uid;
  const allChanges = buildChanges(preview.oldValues, preview.newValues);
  // İptalde emir sürmez: "sonra" sütununda değer göstermek yanlış olur. Emrin değerleri
  // üst tabloda, değişim tablosunda yalnız Durum → İptal edildi kalır.
  const degisiklikler = islem === "İPTAL" ? allChanges.filter((change) => change.degisti) : allChanges;
  // Değiştirmede emir değerleri eski → yeni tablosunda; üst tabloda yalnız piyasa bilgisi kalır.
  const keep = islem === "DEĞİŞTİR" && degisiklikler.length ? new Set(["Güncel fiyat", "Tutar"]) : null;
  return {
    islem,
    ton: toneOf(islem),
    ozet: summary(preview, islem),
    sembol: preview.symbol,
    ad: preview.instrumentName,
    pazar: preview.market,
    yon: preview.side,
    emirTipi: orderTypeLabel(preview.orderType),
    satirlar: rows(preview).filter((row) => !keep || keep.has(row.etiket)),
    tutar: { etiket: islem === "İPTAL" ? "Emrin güncel değeri" : "Tahmini tutar", deger: formatMoney(preview.estimatedTry) },
    tutarVurgulu: islem !== "İPTAL",
    degisiklikler,
    emirNo: typeof orderId === "string" && orderId ? orderId : null,
    hesap: preview.accountUid,
    ...QUESTIONS[islem],
    hayir: "Hayır",
    sureSn: CONFIRMATION_TIMEOUT_SECONDS,
  };
}

// kdialog/zenity yedekleri için düz metin; aynı model, ham JSON yok.
export function formatApprovalMessage(preview: ApprovalPreview): string {
  const model = buildDialogModel(preview);
  const lines = [
    `${model.islem} — ${model.sembol}`,
    model.ozet,
    "",
    `${model.ad} (${model.sembol})`,
    `Pazar: ${model.pazar}`,
    `Yön: ${model.yon} · Emir tipi: ${model.emirTipi}`,
    ...model.satirlar.map((row) => `${row.etiket}: ${row.deger}`),
    `${model.tutar.etiket}: ${model.tutar.deger}`,
  ];
  if (model.degisiklikler.length) {
    lines.push("", "Eski → yeni:");
    for (const change of model.degisiklikler) {
      lines.push(`${change.degisti ? "• " : "  "}${change.etiket}: ${change.eski} → ${change.yeni}`);
    }
  }
  if (model.emirNo) lines.push("", `Emir no: ${model.emirNo}`);
  lines.push(`Hesap: ${model.hesap}`, "", model.soru);
  return lines.join("\n");
}
