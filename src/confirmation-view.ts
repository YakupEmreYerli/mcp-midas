import type { ApprovalPreview } from "./order-approval.js";
import { defineMessages, language, locale, type Lang } from "./i18n.js";

// Onay penceresinin gösterdiği her metin burada, saf fonksiyonlarla kurulur. Pencere
// (onay/onay.py + onay.html) yalnızca bu modeli textContent ile çizer; HTML üretmez.
// Pencerenin sabit metinleri (ipucu, sütun başlıkları…) onay.js'teki tablodadır. Dili pencere
// seçer (onay/onay.py): `MIDAS_LANG` verilmişse modeldeki `dil`, verilmemişse pencerenin açıldığı
// cihazın yereli; bu yüzden pencereye giden model (buildWindowModel) dile bağlı metinleri iki dilde taşır.

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
  /** Metinlerin dili. Pencereye yalnız `MIDAS_LANG` açıkça verilmişse gider (bkz. buildWindowModel). */
  dil: Lang;
  /** İşlem anahtarı; dilden bağımsızdır (pencere bunu doğrular). Gösterilen bant metni `islemYazi`. */
  islem: ActionLabel;
  islemYazi: string;
  ton: Tone;
  ozet: string;
  sembol: string;
  ad: string;
  pazar: string;
  yon: "ALIŞ" | "SATIŞ";
  yonYazi: string;
  emirTipi: string;
  satirlar: DialogRow[];
  tutar: DialogRow;
  /** Tutar harcanacak/alınacak para mı (ALIŞ/SATIŞ/DEĞİŞTİR) yoksa yalnız bilgi mi (İPTAL)? */
  tutarVurgulu: boolean;
  degisiklikler: DialogChange[];
  emirNo: string | null;
  hesap: string;
  /** Birden çok hesapta okunur hesap adı (MIDAS_ACCOUNT_LABEL); pencerenin şeridinde gösterilir. */
  hesapEtiketi: string | null;
  soru: string;
  evet: string;
  hayir: string;
  sureSn: number;
}

/** Dile bağlı alanlar: sunucunun kurduğu metinler ve dile göre biçimlenmiş sayılar. */
export const LOCALIZED_FIELDS = [
  "islemYazi",
  "ozet",
  "yonYazi",
  "emirTipi",
  "satirlar",
  "tutar",
  "degisiklikler",
  "soru",
  "evet",
  "hayir",
] as const;

export type LocalizedTexts = Pick<DialogModel, (typeof LOCALIZED_FIELDS)[number]>;

/**
 * Pencereye stdin'den giden model. Dil zorlanmışsa `dil` taşıyan tek dilli model; değilse `dil`
 * yok, dile bağlı alanlar `metinler.tr` ve `metinler.en` içinde, pencere cihazının diline göre
 * birini seçer. Düz alanlar o zaman Türkçedir: `metinler`i tanımayan eski bir onay.py kopyası
 * (ör. uzak makinede güncellenmemiş) boş değil, eskisi gibi Türkçe bir pencere çizer.
 */
export type WindowModel =
  | DialogModel
  | (Omit<DialogModel, "dil"> & { metinler: Record<Lang, LocalizedTexts> });

export const CONFIRMATION_TIMEOUT_SECONDS = 120;

type Side = ApprovalPreview["side"];

const M = defineMessages(
  {
    band: { ALIŞ: "ALIŞ", SATIŞ: "SATIŞ", İPTAL: "İPTAL", DEĞİŞTİR: "DEĞİŞTİR" } as Record<ActionLabel, string>,
    side: { ALIŞ: "ALIŞ", SATIŞ: "SATIŞ" } as Record<Side, string>,
    orderTypes: {
      MARKET: "Piyasa",
      LIMIT: "Limit",
      STOP: "Stop",
      STOP_LIMIT: "Stop limit",
      TAKE_PROFIT: "Kâr al",
      STOP_LOSS: "Zarar durdur",
      TAKE_PROFIT_AND_STOP_LOSS: "Kâr al + zarar durdur",
      DEMAND: "Fon talebi",
    } as Record<string, string>,
    fields: {
      quantity: "Adet",
      limitPrice: "Limit fiyatı",
      stopPrice: "Stop fiyatı",
      profitPrice: "Kâr al",
      lossPrice: "Zarar durdur",
      status: "Durum",
    } as Record<string, string>,
    rows: {
      quantity: "Adet",
      amount: "Tutar",
      limitPrice: "Limit fiyatı",
      takeProfit: "Kâr al",
      stopLoss: "Zarar durdur",
      currentPrice: "Güncel fiyat",
    },
    status: { pending: "Bekliyor", partial: "Kısmen gerçekleşti", canceled: "İptal edildi" },
    total: "Tahmini tutar",
    cancelValue: "Emrin güncel değeri",
    summary: {
      cancel: (size: string, symbol: string, buy: boolean) =>
        `Bekleyen ${size ? `${size} adetlik ` : ""}${symbol} ${buy ? "alış" : "satış"} emri iptal edilecek.`,
      update: (symbol: string, buy: boolean) => `Bekleyen ${symbol} ${buy ? "alış" : "satış"} emrinin değerleri değişecek.`,
      amount: (money: string, symbol: string, buy: boolean) => `${money} tutarında ${symbol} ${buy ? "alınacak" : "satılacak"}.`,
      limit: (qty: string, symbol: string, price: string, buy: boolean) =>
        `${qty ? `${qty} adet ` : ""}${symbol}, ${price} limit fiyatla ${buy ? "alınacak" : "satılacak"}.`,
      market: (qty: string, symbol: string, buy: boolean) =>
        `${qty ? `${qty} adet ` : ""}${symbol} piyasa fiyatından ${buy ? "alınacak" : "satılacak"}.`,
      other: (qty: string, symbol: string, type: string, buy: boolean) =>
        `${qty ? `${qty} adet ` : ""}${symbol}, ${type.toLocaleLowerCase("tr-TR")} emriyle ${buy ? "alınacak" : "satılacak"}.`,
    },
    questions: {
      ALIŞ: { soru: "Bu alış emri Midas'a gönderilsin mi?", evet: "Evet, al" },
      SATIŞ: { soru: "Bu satış emri Midas'a gönderilsin mi?", evet: "Evet, sat" },
      İPTAL: { soru: "Bu emir iptal edilsin mi?", evet: "Evet, iptal et" },
      DEĞİŞTİR: { soru: "Bu değişiklik Midas'a gönderilsin mi?", evet: "Evet, değiştir" },
    } as Record<ActionLabel, { soru: string; evet: string }>,
    no: "Hayır",
    plain: {
      accountBanner: "HESAP",
      market: "Pazar",
      side: "Yön",
      orderType: "Emir tipi",
      changes: "Eski → yeni:",
      orderId: "Emir no",
      account: "Hesap",
    },
  },
  {
    band: { ALIŞ: "BUY", SATIŞ: "SELL", İPTAL: "CANCEL", DEĞİŞTİR: "MODIFY" },
    side: { ALIŞ: "BUY", SATIŞ: "SELL" },
    orderTypes: {
      MARKET: "Market",
      LIMIT: "Limit",
      STOP: "Stop",
      STOP_LIMIT: "Stop limit",
      TAKE_PROFIT: "Take profit",
      STOP_LOSS: "Stop loss",
      TAKE_PROFIT_AND_STOP_LOSS: "Take profit + stop loss",
      DEMAND: "Fund order",
    },
    fields: {
      quantity: "Quantity",
      limitPrice: "Limit price",
      stopPrice: "Stop price",
      profitPrice: "Take profit",
      lossPrice: "Stop loss",
      status: "Status",
    },
    rows: {
      quantity: "Quantity",
      amount: "Amount",
      limitPrice: "Limit price",
      takeProfit: "Take profit",
      stopLoss: "Stop loss",
      currentPrice: "Current price",
    },
    status: { pending: "Pending", partial: "Partially filled", canceled: "Canceled" },
    total: "Estimated total",
    cancelValue: "Current order value",
    summary: {
      cancel: (size, symbol, buy) => `Cancel the pending ${buy ? "buy" : "sell"} order for ${size ? `${size} ` : ""}${symbol}.`,
      update: (symbol, buy) => `Modify the pending ${buy ? "buy" : "sell"} order for ${symbol}.`,
      amount: (money, symbol, buy) => `${buy ? "Buy" : "Sell"} ${money} of ${symbol}.`,
      limit: (qty, symbol, price, buy) => `${buy ? "Buy" : "Sell"} ${qty ? `${qty} ` : ""}${symbol} at a limit price of ${price}.`,
      market: (qty, symbol, buy) => `${buy ? "Buy" : "Sell"} ${qty ? `${qty} ` : ""}${symbol} at the market price.`,
      other: (qty, symbol, type, buy) =>
        `${buy ? "Buy" : "Sell"} ${qty ? `${qty} ` : ""}${symbol} with a ${type.toLowerCase()} order.`,
    },
    questions: {
      ALIŞ: { soru: "Send this buy order to Midas?", evet: "Yes, buy" },
      SATIŞ: { soru: "Send this sell order to Midas?", evet: "Yes, sell" },
      İPTAL: { soru: "Cancel this order?", evet: "Yes, cancel it" },
      DEĞİŞTİR: { soru: "Send this change to Midas?", evet: "Yes, modify" },
    },
    no: "No",
    plain: {
      accountBanner: "ACCOUNT",
      market: "Market",
      side: "Side",
      orderType: "Order type",
      changes: "Before → after:",
      orderId: "Order ID",
      account: "Account",
    },
  }
);

const FIELD_ORDER = ["quantity", "limitPrice", "stopPrice", "profitPrice", "lossPrice", "status"];

const PRICE_FIELDS = new Set(["limitPrice", "stopPrice", "profitPrice", "lossPrice"]);

const STATUS_KEYS: Record<string, "pending" | "partial" | "canceled"> = {
  PENDING: "pending",
  NEW: "pending",
  OPEN: "pending",
  ACTIVE: "pending",
  WAITING: "pending",
  PARTIALLY_FILLED: "partial",
  CANCELED: "canceled",
  CANCELLED: "canceled",
};

export function formatMoney(value: number, lang: Lang = language()): string {
  const text = Math.abs(value).toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₺${text}`;
}

export function formatPrice(value: number, lang: Lang = language()): string {
  // Fon fiyatları 6 haneye kadar küsurat taşır; hisse fiyatları 2 hanede kalır.
  const text = value.toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return `₺${text}`;
}

export function formatQuantity(value: number, lang: Lang = language()): string {
  return value.toLocaleString(locale(lang), { maximumFractionDigits: 6 });
}

export function orderTypeLabel(type: string, lang: Lang = language()): string {
  return M(lang).orderTypes[type] ?? type;
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

function fieldValue(field: string, value: unknown, lang: Lang): string {
  if (value == null || value === "") return "—";
  if (field === "status") {
    const key = STATUS_KEYS[String(value)];
    return key ? M(lang).status[key] : String(value);
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (field === "quantity") return formatQuantity(numeric, lang);
  if (PRICE_FIELDS.has(field)) return numeric === 0 ? "—" : formatPrice(numeric, lang);
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
  newValues: Record<string, unknown> | undefined,
  lang: Lang = language()
): DialogChange[] {
  if (!oldValues && !newValues) return [];
  const before = oldValues ?? {};
  const after = newValues ?? {};
  const fields = FIELD_ORDER.filter((field) => {
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
      etiket: M(lang).fields[field],
      eski: fieldValue(field, oldValue, lang),
      yeni: fieldValue(field, newValue, lang),
      degisti: !sameValue(oldValue, newValue),
    };
  });
}

function summary(preview: ApprovalPreview, action: ActionLabel, lang: Lang): string {
  const text = M(lang).summary;
  const buy = preview.side === "ALIŞ";
  const qty = present(preview.quantity) ? formatQuantity(preview.quantity, lang) : "";
  if (action === "İPTAL") return text.cancel(qty, preview.symbol, buy);
  if (action === "DEĞİŞTİR") return text.update(preview.symbol, buy);
  if (!present(preview.quantity) && present(preview.amountTry)) {
    return text.amount(formatMoney(preview.amountTry, lang), preview.symbol, buy);
  }
  if (preview.orderType === "LIMIT" && present(preview.limitPrice)) {
    return text.limit(qty, preview.symbol, formatPrice(preview.limitPrice, lang), buy);
  }
  if (preview.orderType === "MARKET") return text.market(qty, preview.symbol, buy);
  return text.other(qty, preview.symbol, orderTypeLabel(preview.orderType, lang), buy);
}

type RowKey = keyof ReturnType<typeof M>["rows"];

function rows(preview: ApprovalPreview, lang: Lang): Array<DialogRow & { key: RowKey }> {
  const list: Array<{ key: RowKey; deger: string }> = [];
  if (present(preview.quantity)) list.push({ key: "quantity", deger: formatQuantity(preview.quantity, lang) });
  if (present(preview.amountTry)) list.push({ key: "amount", deger: formatMoney(preview.amountTry, lang) });
  if (present(preview.limitPrice) && preview.limitPrice !== 0) list.push({ key: "limitPrice", deger: formatPrice(preview.limitPrice, lang) });
  if (present(preview.takeProfitPrice) && preview.takeProfitPrice !== 0) list.push({ key: "takeProfit", deger: formatPrice(preview.takeProfitPrice, lang) });
  if (present(preview.stopLossPrice) && preview.stopLossPrice !== 0) list.push({ key: "stopLoss", deger: formatPrice(preview.stopLossPrice, lang) });
  if (present(preview.currentPrice)) list.push({ key: "currentPrice", deger: formatPrice(preview.currentPrice, lang) });
  return list.map((row) => ({ ...row, etiket: M(lang).rows[row.key] }));
}

export function buildDialogModel(
  preview: ApprovalPreview,
  accountLabel: string | null = null,
  lang: Lang = language()
): DialogModel {
  const text = M(lang);
  const islem = actionOf(preview);
  const orderId = preview.oldValues?.uid;
  const allChanges = buildChanges(preview.oldValues, preview.newValues, lang);
  // İptalde emir sürmez: "sonra" sütununda değer göstermek yanlış olur. Emrin değerleri
  // üst tabloda, değişim tablosunda yalnız Durum → İptal edildi kalır.
  const degisiklikler = islem === "İPTAL" ? allChanges.filter((change) => change.degisti) : allChanges;
  // Değiştirmede emir değerleri eski → yeni tablosunda; üst tabloda yalnız piyasa bilgisi kalır.
  const keep: Set<RowKey> | null = islem === "DEĞİŞTİR" && degisiklikler.length ? new Set(["currentPrice", "amount"]) : null;
  return {
    dil: lang,
    islem,
    islemYazi: text.band[islem],
    ton: toneOf(islem),
    ozet: summary(preview, islem, lang),
    sembol: preview.symbol,
    ad: preview.instrumentName,
    pazar: preview.market,
    yon: preview.side,
    yonYazi: text.side[preview.side],
    emirTipi: orderTypeLabel(preview.orderType, lang),
    satirlar: rows(preview, lang)
      .filter((row) => !keep || keep.has(row.key))
      .map(({ etiket, deger }) => ({ etiket, deger })),
    tutar: { etiket: islem === "İPTAL" ? text.cancelValue : text.total, deger: formatMoney(preview.estimatedTry, lang) },
    tutarVurgulu: islem !== "İPTAL",
    degisiklikler,
    emirNo: typeof orderId === "string" && orderId ? orderId : null,
    hesap: preview.accountUid,
    hesapEtiketi: accountLabel,
    ...text.questions[islem],
    hayir: text.no,
    sureSn: CONFIRMATION_TIMEOUT_SECONDS,
  };
}

function localizedTexts(model: LocalizedTexts): LocalizedTexts {
  return Object.fromEntries(LOCALIZED_FIELDS.map((field) => [field, model[field]])) as LocalizedTexts;
}

export function buildWindowModel(
  preview: ApprovalPreview,
  accountLabel: string | null,
  forced: Lang | null
): WindowModel {
  if (forced) return buildDialogModel(preview, accountLabel, forced);
  const { dil: _tr, ...tr } = buildDialogModel(preview, accountLabel, "tr");
  const en = buildDialogModel(preview, accountLabel, "en");
  return { ...tr, metinler: { tr: localizedTexts(tr), en: localizedTexts(en) } };
}

// kdialog/zenity yedekleri için düz metin; aynı model, ham JSON yok.
export function formatApprovalMessage(
  preview: ApprovalPreview,
  accountLabel: string | null = null,
  lang: Lang = language()
): string {
  const model = buildDialogModel(preview, accountLabel, lang);
  const label = M(lang).plain;
  const lines = [
    ...(model.hesapEtiketi ? [`${label.accountBanner}: ${model.hesapEtiketi}`, ""] : []),
    `${model.islemYazi} — ${model.sembol}`,
    model.ozet,
    "",
    `${model.ad} (${model.sembol})`,
    `${label.market}: ${model.pazar}`,
    `${label.side}: ${model.yonYazi} · ${label.orderType}: ${model.emirTipi}`,
    ...model.satirlar.map((row) => `${row.etiket}: ${row.deger}`),
    `${model.tutar.etiket}: ${model.tutar.deger}`,
  ];
  if (model.degisiklikler.length) {
    lines.push("", label.changes);
    for (const change of model.degisiklikler) {
      lines.push(`${change.degisti ? "• " : "  "}${change.etiket}: ${change.eski} → ${change.yeni}`);
    }
  }
  if (model.emirNo) lines.push("", `${label.orderId}: ${model.emirNo}`);
  lines.push(`${label.account}: ${model.hesap}`, "", model.soru);
  return lines.join("\n");
}
