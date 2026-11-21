import { MidasApiError } from "./errors.js";
import { defineMessages, locale } from "./i18n.js";

const M = defineMessages(
  {
    mustBePositive: (field: string) => `${field} sıfırdan büyük olmalıdır`,
    currentPrice: "güncel fiyat",
    symbolMismatch: (requested: string, resolved: string) =>
      `Emir sembolü birebir eşleşmedi: istenen ${requested}, Midas sonucu ${resolved}. İşlem reddedildi.`,
    tpslSellOnly: "Kâr al/zarar durdur emirleri Midas'ta yalnızca satış (SELL) yönünde verilebilir",
    profitAbove: (profit: number, reference: number) => `Kâr alma fiyatı (${profit}) güncel fiyatın (${reference}) üstünde olmalıdır`,
    stopLossNoProfit: "STOP_LOSS emrinde take_profit_price verilmez; ikisi için TAKE_PROFIT_AND_STOP_LOSS kullan",
    lossBelow: (loss: number, reference: number) => `Zarar durdurma fiyatı (${loss}) güncel fiyatın (${reference}) altında olmalıdır`,
    profitNoStop: "TAKE_PROFIT emrinde stop_loss_price verilmez; ikisi için TAKE_PROFIT_AND_STOP_LOSS kullan",
    fundBuy: "Midas Atlas TEFAS fon alımını desteklemiyor; fon alışını Midas telefon uygulamasından ver. Fon satışı ve BIST/ABD emirleri buradan verilebilir.",
    fundDemandOnly: "TEFAS fon emirleri yalnızca DEMAND tipiyle gönderilebilir",
    fundByQuantity: "TEFAS fon satışı adetle verilir; amount_try değil quantity kullan",
    stockTypes: "BIST hisse emirlerinde yalnızca MARKET, LIMIT, TAKE_PROFIT, STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS desteklenir",
    thisType: "bu",
    updateBase: (type: string) =>
      `Midas ${type} emrinin güncellenmesine izin vermiyor (showUpdate: false); bu emir yerinde değiştirilemez.`,
    notCancelable: (base: string) => `${base} Midas emrin iptal edilebilir olduğunu da belirtmiyor; emri Midas uygulamasından kontrol edin.`,
    newValue: "<yeni>",
    replaceSteps: (base: string, uid: string, symbol: string, placeArgs: string) =>
      `${base} Değiştirmek için iptal edip yeniden girin: önce cancel_order (order_id: "${uid}", symbol: "${symbol}"), ` +
      `iptal gerçekleştikten sonra place_order (${placeArgs}). Her iki adım ayrı masaüstü onayı ister; ` +
      `iptal ile yeni emir arasında pozisyon korumasız kalır.`,
    priceUnknown: "Fiyat karşılaştırılamadı",
    priceMoved: (percent: string) => `Fiyat %${percent} değişti`,
  },
  {
    mustBePositive: (field) => `${field} must be greater than zero`,
    currentPrice: "current price",
    symbolMismatch: (requested, resolved) =>
      `The order symbol isn't an exact match: you asked for ${requested}, Midas returned ${resolved}. Order rejected.`,
    tpslSellOnly: "Midas only accepts take-profit/stop-loss orders on the sell (SELL) side",
    profitAbove: (profit, reference) => `The take-profit price (${profit}) must be above the current price (${reference})`,
    stopLossNoProfit: "A STOP_LOSS order doesn't take take_profit_price; use TAKE_PROFIT_AND_STOP_LOSS for both",
    lossBelow: (loss, reference) => `The stop-loss price (${loss}) must be below the current price (${reference})`,
    profitNoStop: "A TAKE_PROFIT order doesn't take stop_loss_price; use TAKE_PROFIT_AND_STOP_LOSS for both",
    fundBuy: "Midas Atlas can't buy TEFAS funds; buy funds in the Midas phone app. Fund sells and BIST/US orders work here.",
    fundDemandOnly: "TEFAS fund orders can only be sent as DEMAND",
    fundByQuantity: "TEFAS fund sells go by quantity; use quantity, not amount_try",
    stockTypes: "BIST stock orders only support MARKET, LIMIT, TAKE_PROFIT, STOP_LOSS and TAKE_PROFIT_AND_STOP_LOSS",
    thisType: "this",
    updateBase: (type) =>
      `Midas doesn't allow updating ${type === "this" ? "this" : `this ${type}`} order (showUpdate: false), so it can't be changed in place.`,
    notCancelable: (base) => `${base} Midas doesn't mark it as cancelable either; check the order in the Midas app.`,
    newValue: "<new>",
    replaceSteps: (base, uid, symbol, placeArgs) =>
      `${base} To change it, cancel and place it again: first cancel_order (order_id: "${uid}", symbol: "${symbol}"), ` +
      `then, once the cancel has gone through, place_order (${placeArgs}). Each step needs its own desktop approval; ` +
      `the position is unprotected between the cancel and the new order.`,
    priceUnknown: "Couldn't compare the price",
    priceMoved: (percent) => `The price moved ${percent}%`,
  }
);

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
    throw new MidasApiError(M().mustBePositive(field));
  }
  return value;
}

export function assertExactResolvedSymbol(requested: string, resolved: string): void {
  if (requested.trim().toUpperCase() !== resolved.trim().toUpperCase()) {
    throw new MidasApiError(
      M().symbolMismatch(requested.trim(), resolved)
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
    throw new MidasApiError(M().tpslSellOnly);
  }
  const reference = positive(fields.referencePrice, M().currentPrice);
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
      throw new MidasApiError(M().profitAbove(profit, reference));
    }
    Object.assign(request, {
      limitPrice: profit,
      profitPrice: profit,
      profitRate: tpslRate("profit", reference, profit),
      isProfitByRatio: false,
    });
  } else if (fields.takeProfitPrice != null) {
    throw new MidasApiError(M().stopLossNoProfit);
  }
  if (wantsLoss) {
    const loss = positive(fields.stopLossPrice, "stop_loss_price");
    if (loss >= reference) {
      throw new MidasApiError(M().lossBelow(loss, reference));
    }
    Object.assign(request, {
      stopPrice: loss,
      lossPrice: loss,
      lossRate: tpslRate("loss", reference, loss),
      isLossByRatio: false,
    });
  } else if (fields.stopLossPrice != null) {
    throw new MidasApiError(M().profitNoStop);
  }
  if (fields.endingDate) request.endingDate = fields.endingDate;
  request.quantity = positive(fields.quantity, "quantity");
  return request;
}

export function fundBuyUnsupported(): string {
  return M().fundBuy;
}

/**
 * Emir yerleştirme isteği.
 *
 * TEFAS fonunda satış **adet** üzerinden gider. Fon alışı Atlas'ta yok: Midas `{type: DEMAND,
 * side: BUY, notional}` isteğini "Talep emri şu anda verilemiyor" diye reddediyor (27 Ekim 2026,
 * nakit varken iki deneme); alış yalnız Midas mobil uygulamasında var.
 */

export function buildPlaceOrderRequest(fields: PlaceOrderFields): Record<string, unknown> {
  if (fields.kind === "fund") {
    if (fields.orderType !== "DEMAND") {
      throw new MidasApiError(M().fundDemandOnly);
    }
    if (fields.side === "BUY") {
      throw new MidasApiError(fundBuyUnsupported());
    }
    if (fields.amountTry != null) {
      throw new MidasApiError(M().fundByQuantity);
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
      M().stockTypes
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
  const text = M();
  const type = order.type ?? text.thisType;
  const base = text.updateBase(type);
  if (order.eligibleToCancel === false) {
    return text.notCancelable(base);
  }
  const sym = symbol.trim().toUpperCase();
  const qty = order.quantity != null ? `, quantity: ${order.quantity}` : "";
  const side = order.side ? `, side: "${order.side}"` : "";
  let placeArgs = `symbol: "${sym}"${side}, order_type: "${type}"${qty}`;
  const fresh = text.newValue;
  if (type === "TAKE_PROFIT_AND_STOP_LOSS") placeArgs += `, take_profit_price: ${fresh}, stop_loss_price: ${fresh}`;
  else if (type === "TAKE_PROFIT") placeArgs += `, take_profit_price: ${fresh}`;
  else if (type === "STOP_LOSS") placeArgs += `, stop_loss_price: ${fresh}`;
  else if (type === "LIMIT") placeArgs += `, limit_price: ${fresh}`;
  return text.replaceSteps(base, order.uid, sym, placeArgs);
}

export function meaningfulPriceDrift(before: number | null | undefined, after: number | null | undefined): string | null {
  if (before == null || after == null || before <= 0 || after <= 0) return M().priceUnknown;
  const percent = Math.abs((after - before) / before) * 100;
  return percent > 2
    ? M().priceMoved(percent.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    : null;
}
