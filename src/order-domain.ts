import { MidasApiError } from "./errors.js";

export type Side = "BUY" | "SELL";
export type TpslOrderType = "TAKE_PROFIT" | "STOP_LOSS" | "TAKE_PROFIT_AND_STOP_LOSS";
export type PlaceOrderType = "MARKET" | "LIMIT" | "DEMAND" | TpslOrderType;

export const TPSL_ORDER_TYPES: readonly TpslOrderType[] = ["TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"];

export function isTpslOrderType(type: string | undefined | null): type is TpslOrderType {
  return type != null && (TPSL_ORDER_TYPES as readonly string[]).includes(type);
}
export type UpdatableOrderType =
  | "LIMIT"
  | "STOP"
  | "STOP_LIMIT"
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "TAKE_PROFIT_AND_STOP_LOSS";

interface PlaceOrderFields {
  kind: "stock" | "fund";
  stockUid: string;
  side: Side;
  orderType: PlaceOrderType;
  quantity?: number;
  amountTry?: number;
  limitPrice?: number;
  endingDate?: string;
  /** Kâr al/zarar durdur emirlerinde kâr alma fiyatı. */
  takeProfitPrice?: number;
  /** Kâr al/zarar durdur emirlerinde zarar durdurma fiyatı. */
  stopLossPrice?: number;
  /** Kâr al/zarar durdur emirlerinde oranların hesaplandığı güncel fiyat (nominalPrice). */
  referencePrice?: number;
}

interface UpdateOrderFields {
  orderType: UpdatableOrderType;
  quantity: number;
  nominalPrice?: number | null;
  limitPrice?: number;
  stopPrice?: number;
}

function positive(value: number | undefined, field: string): number {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new MidasApiError(`${field} sıfırdan büyük olmalıdır`);
  }
  return value;
}

export function assertExactResolvedSymbol(requested: string, resolved: string): void {
  if (requested.trim().toUpperCase() !== resolved.trim().toUpperCase()) {
    throw new MidasApiError(
      `Emir sembolü birebir eşleşmedi: istenen ${requested.trim()}, Midas sonucu ${resolved}. İşlem reddedildi.`
    );
  }
}

/**
 * Atlas'ın kâr al/zarar durdur oranı: güncel fiyata göre yüzde, 2 hane, kâr 0–999,
 * zarar 0–99 aralığına kırpılır (bundle: tpslDisplayRateFromPrice + clampTpslRate).
 */
export function tpslRate(leg: "profit" | "loss", referencePrice: number, price: number): number {
  const diff = leg === "profit" ? price - referencePrice : referencePrice - price;
  const raw = referencePrice <= 0 ? 0 : Math.round((diff / referencePrice) * 100 * 100) / 100;
  return Math.min(Math.max(raw, 0), leg === "profit" ? 999 : 99);
}

/** Verilen bacaklardan emir tipi (bundle: resolveTpslOrderType). */
export function resolveTpslOrderType(takeProfitPrice?: number, stopLossPrice?: number): TpslOrderType | null {
  if (takeProfitPrice != null && stopLossPrice != null) return "TAKE_PROFIT_AND_STOP_LOSS";
  if (takeProfitPrice != null) return "TAKE_PROFIT";
  if (stopLossPrice != null) return "STOP_LOSS";
  return null;
}

/**
 * Kâr al/zarar durdur yerleştirme isteği. Alan kümesi Atlas web paketindeki TpslSellForm
 * gönderimiyle aynıdır: `{type, side: SELL, stockUid, nominalPrice, ...fiyat alanları,
 * endingDate, quantity}`; fiyat alanları `buildTpslPlaceOrderPriceFields` ile kurulur
 * (kâr bacağı limitPrice + profitPrice + profitRate + isProfitByRatio, zarar bacağı
 * stopPrice + lossPrice + lossRate + isLossByRatio). Fiyatlar doğrudan verildiği için
 * `isProfitByRatio`/`isLossByRatio` false gider (paket: anchor "price").
 */
function buildTpslPlaceOrderRequest(fields: PlaceOrderFields & { orderType: TpslOrderType }): Record<string, unknown> {
  if (fields.side !== "SELL") {
    throw new MidasApiError("Kâr al/zarar durdur emirleri Midas'ta yalnızca satış (SELL) yönünde verilebilir");
  }
  const reference = positive(fields.referencePrice, "güncel fiyat");
  const wantsProfit = fields.orderType !== "STOP_LOSS";
  const wantsLoss = fields.orderType !== "TAKE_PROFIT";
  const request: Record<string, unknown> = {
    type: fields.orderType,
    side: "SELL",
    stockUid: fields.stockUid,
    nominalPrice: reference,
  };
  if (wantsProfit) {
    const profit = positive(fields.takeProfitPrice, "take_profit_price");
    if (profit <= reference) {
      throw new MidasApiError(`Kâr alma fiyatı (${profit}) güncel fiyatın (${reference}) üstünde olmalıdır`);
    }
    Object.assign(request, {
      limitPrice: profit,
      profitPrice: profit,
      profitRate: tpslRate("profit", reference, profit),
      isProfitByRatio: false,
    });
  } else if (fields.takeProfitPrice != null) {
    throw new MidasApiError("STOP_LOSS emrinde take_profit_price verilmez; ikisi için TAKE_PROFIT_AND_STOP_LOSS kullan");
  }
  if (wantsLoss) {
    const loss = positive(fields.stopLossPrice, "stop_loss_price");
    if (loss >= reference) {
      throw new MidasApiError(`Zarar durdurma fiyatı (${loss}) güncel fiyatın (${reference}) altında olmalıdır`);
    }
    Object.assign(request, {
      stopPrice: loss,
      lossPrice: loss,
      lossRate: tpslRate("loss", reference, loss),
      isLossByRatio: false,
    });
  } else if (fields.stopLossPrice != null) {
    throw new MidasApiError("TAKE_PROFIT emrinde stop_loss_price verilmez; ikisi için TAKE_PROFIT_AND_STOP_LOSS kullan");
  }
  if (fields.endingDate) request.endingDate = fields.endingDate;
  request.quantity = positive(fields.quantity, "quantity");
  return request;
}

export function buildPlaceOrderRequest(fields: PlaceOrderFields): Record<string, unknown> {
  if (fields.kind === "fund") {
    if (fields.orderType !== "DEMAND") {
      throw new MidasApiError("TEFAS fon emirleri yalnızca DEMAND tipiyle gönderilebilir");
    }
    if (fields.side === "BUY") {
      throw new MidasApiError(
        "TEFAS fon alışının PlaceOrderRequest alanı yakalanan Atlas bundle'ından doğrulanamadı; işlem reddedildi"
      );
    }
    return {
      type: "DEMAND",
      side: "SELL",
      stockUid: fields.stockUid,
      quantity: positive(fields.quantity, "quantity"),
    };
  }

  if (isTpslOrderType(fields.orderType)) {
    return buildTpslPlaceOrderRequest({ ...fields, orderType: fields.orderType });
  }
  if (fields.orderType !== "MARKET" && fields.orderType !== "LIMIT") {
    throw new MidasApiError(
      "BIST hisse emirlerinde yalnızca MARKET, LIMIT, TAKE_PROFIT, STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS desteklenir"
    );
  }
  const request: Record<string, unknown> = {
    type: fields.orderType,
    side: fields.side,
    stockUid: fields.stockUid,
    quantity: positive(fields.quantity, "quantity"),
  };
  if (fields.orderType === "LIMIT") {
    request.limitPrice = positive(fields.limitPrice, "limit_price");
    if (fields.endingDate) request.endingDate = fields.endingDate;
  }
  return request;
}

export function buildUpdateOrderRequest(fields: UpdateOrderFields): Record<string, unknown> {
  const request: Record<string, unknown> = { newQuantity: positive(fields.quantity, "quantity") };
  if (fields.nominalPrice != null && fields.nominalPrice > 0) request.nominalPrice = fields.nominalPrice;

  switch (fields.orderType) {
    case "LIMIT":
    case "TAKE_PROFIT":
      request.newLimitPrice = positive(fields.limitPrice, "limit_price");
      break;
    case "STOP":
    case "STOP_LOSS":
      request.newStopPrice = positive(fields.stopPrice, "stop_price");
      break;
    case "STOP_LIMIT":
    case "TAKE_PROFIT_AND_STOP_LOSS":
      request.newLimitPrice = positive(fields.limitPrice, "limit_price");
      request.newStopPrice = positive(fields.stopPrice, "stop_price");
      break;
  }
  return request;
}

/**
 * Midas bir emirde `showUpdate: false` döndürdüğünde güncelleme yolu yoktur (ör. mevcut
 * TAKE_PROFIT_AND_STOP_LOSS emirleri). Mesaj, iptal edip yeniden girme yolunu tarif eder.
 */
export function updateNotAllowedMessage(order: {
  uid: string;
  type?: string | null;
  side?: string | null;
  quantity?: number | null;
  eligibleToCancel?: boolean | null;
}, symbol: string): string {
  const type = order.type ?? "bu";
  const base = `Midas ${type} emrinin güncellenmesine izin vermiyor (showUpdate: false); bu emir yerinde değiştirilemez.`;
  if (order.eligibleToCancel === false) {
    return `${base} Midas emrin iptal edilebilir olduğunu da belirtmiyor; emri Midas uygulamasından kontrol edin.`;
  }
  const sym = symbol.trim().toUpperCase();
  const qty = order.quantity != null ? `, quantity: ${order.quantity}` : "";
  const side = order.side ? `, side: "${order.side}"` : "";
  let placeArgs = `symbol: "${sym}"${side}, order_type: "${type}"${qty}`;
  if (type === "TAKE_PROFIT_AND_STOP_LOSS") placeArgs += ", take_profit_price: <yeni>, stop_loss_price: <yeni>";
  else if (type === "TAKE_PROFIT") placeArgs += ", take_profit_price: <yeni>";
  else if (type === "STOP_LOSS") placeArgs += ", stop_loss_price: <yeni>";
  else if (type === "LIMIT") placeArgs += ", limit_price: <yeni>";
  return (
    `${base} Değiştirmek için iptal edip yeniden girin: önce cancel_order (order_id: "${order.uid}", symbol: "${sym}"), ` +
    `iptal gerçekleştikten sonra place_order (${placeArgs}). Her iki adım ayrı masaüstü onayı ister; ` +
    `iptal ile yeni emir arasında pozisyon korumasız kalır.`
  );
}

export function meaningfulPriceDrift(before: number | null | undefined, after: number | null | undefined): string | null {
  if (before == null || after == null || before <= 0 || after <= 0) return "Fiyat karşılaştırılamadı";
  const percent = Math.abs((after - before) / before) * 100;
  return percent > 2
    ? `Fiyat %${percent.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} değişti`
    : null;
}
