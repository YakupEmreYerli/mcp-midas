import { MidasApiError } from "./errors.js";

export type Side = "BUY" | "SELL";
export type PlaceOrderType = "MARKET" | "LIMIT" | "DEMAND";
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

  if (fields.orderType !== "MARKET" && fields.orderType !== "LIMIT") {
    throw new MidasApiError("BIST hisse emirlerinde yalnızca MARKET ve LIMIT desteklenir");
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

export function meaningfulPriceDrift(before: number | null | undefined, after: number | null | undefined): string | null {
  if (before == null || after == null || before <= 0 || after <= 0) return "Fiyat karşılaştırılamadı";
  const percent = Math.abs((after - before) / before) * 100;
  return percent > 2
    ? `Fiyat %${percent.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} değişti`
    : null;
}
