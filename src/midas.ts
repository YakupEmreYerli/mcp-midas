import { gql, MidasApiError } from "./api.js";
import { config } from "./config.js";
import { confirmOrderOnDesktop } from "./desktop-confirmation.js";
import {
  assertExactResolvedSymbol,
  buildPlaceOrderRequest,
  buildUpdateOrderRequest,
  meaningfulPriceDrift,
  type PlaceOrderType,
  type Side,
  type UpdatableOrderType,
} from "./order-domain.js";
import { executeWithApproval, type ApprovalPreview } from "./order-approval.js";
import { createOrderAuditLogger } from "./order-audit.js";
import { session } from "./session.js";
import * as Q from "./queries.js";

export type { Side } from "./order-domain.js";

export interface Account {
  accountUid: string;
  assetVertical: "TR" | "US";
  currency: string;
  buyingPower: number;
  cash: number;
  withdrawableCash: number;
}

export interface Position {
  symbol: string;
  name: string;
  assetUid: string;
  accountUid: string;
  market: "TR" | "US";
  quantity: number;
  averageCost: number;
  price: number | null;
  currency: string;
  marketValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  sessionStatus: string | null;
}

/** Portfolio value, day P/L, and per-market cash balances. */
export async function getPortfolio() {
  const memberUid = await session.getMemberUid();
  const data = await gql("GetPortfolioOverview", Q.PORTFOLIO_OVERVIEW, {
    memberUid,
    currencyCode: "TRY",
    timeRange: "DAY",
  });
  const o = data.overviewV2;
  return {
    portfolioValueTry: o.portfolioValue,
    dayProfitLoss: o.profitLosses?.find((p: any) => p.timeRange === "DAY") ?? null,
    accounts: (o.accounts ?? []) as Account[],
  };
}

async function getAccounts(): Promise<Account[]> {
  return (await getPortfolio()).accounts;
}

async function accountFor(market: "TR" | "US"): Promise<Account> {
  const account = (await getAccounts()).find((a) => a.assetVertical === market);
  if (!account) throw new MidasApiError(`No ${market} account found on this Midas profile`);
  return account;
}

/** All open positions across BIST stocks, US stocks, TR funds and US options. */
export async function getPositions(): Promise<Position[]> {
  const memberUid = await session.getMemberUid();
  const data = await gql(
    "OverviewAllPositions",
    Q.ALL_POSITIONS,
    {
      memberUid,
      includeUsStocks: true,
      includeTrStocks: true,
      includeTrFunds: true,
      includeUsOptions: true,
    },
    "overviewPositionsV2"
  );

  const groups = [data.trStocks, data.usStocks, data.trFunds, data.usOptions];
  const positions: Position[] = [];
  for (const group of groups) {
    for (const p of group ?? []) {
      const price: number | null = p.tradePriceV3?.price ?? null;
      const multiplier = p.multiplier ?? 1;
      const marketValue = price === null ? null : price * p.quantity * multiplier;
      const costBasis = p.averageCost * p.quantity * multiplier;
      positions.push({
        symbol: p.symbol,
        name: p.displayName ?? p.symbol,
        assetUid: p.assetUid,
        accountUid: p.accountUid,
        market: p.assetVertical,
        quantity: p.quantity,
        averageCost: p.averageCost,
        price,
        currency: p.currency,
        marketValue,
        profitLoss: marketValue === null ? null : marketValue - costBasis,
        profitLossPercent:
          marketValue === null || costBasis === 0 ? null : ((marketValue - costBasis) / costBasis) * 100,
        sessionStatus: p.tradePriceV3?.tradingSessionStatus ?? null,
      });
    }
  }
  return positions;
}

export interface ResolvedAsset {
  uid: string;
  symbol: string;
  title: string;
  subtitle: string;
  country: "TR" | "US";
  type: string;
}

/**
 * Resolve a ticker to a Midas instrument uid. Prefers an exact symbol match;
 * falls back to the first search hit so partial names still work.
 */
export async function resolveSymbol(symbol: string): Promise<ResolvedAsset> {
  const data = await gql("Search", Q.SEARCH, {
    query: symbol,
    searchItemTypes: ["MARKET_INSTRUMENTS", "INVESTMENT_FUNDS"],
    page: 0,
    size: 30,
  });
  const results = (data.Search?.results ?? []).filter((r: any) => r.symbol);
  if (!results.length) throw new MidasApiError(`No instrument found for "${symbol}"`);

  const wanted = symbol.trim().toUpperCase();
  const hit = results.find((r: any) => r.symbol.toUpperCase() === wanted) ?? results[0];
  return {
    uid: hit.uid,
    symbol: hit.symbol,
    title: hit.title,
    subtitle: hit.subtitle,
    country: hit.country,
    type: hit.type,
  };
}

/** Last trade price for a symbol, optionally converted to another currency. */
export async function getAssetPrice(symbol: string, currency?: "TRY" | "USD") {
  const asset = await resolveSymbol(symbol);
  const data = await gql("GetAssetSnapshot", Q.ASSET_SNAPSHOT, {
    uid: asset.uid,
    currency: currency ?? null,
  });
  const a = data.asset;
  const price = a.tradePrice?.price ?? null;
  const previousClose = a.previousClosePrice ?? null;
  return {
    symbol: asset.symbol,
    name: a.name,
    uid: a.uid,
    price,
    currency: a.tradePrice?.currency ?? a.currency,
    previousClose,
    changePercent:
      price === null || !previousClose ? null : ((price - previousClose) / previousClose) * 100,
    sessionStatus: a.tradePrice?.tradingSessionStatus ?? null,
    tradable: a.orderFlowEnabled ?? false,
  };
}

/** Descriptive info plus current pricing for a symbol. */
export async function getAssetInfo(symbol: string) {
  const asset = await resolveSymbol(symbol);
  const price = await getAssetPrice(asset.symbol);
  return {
    ...price,
    market: asset.country === "TR" ? "BIST" : "US",
    description: asset.subtitle,
  };
}

export async function getPendingOrders(symbol: string) {
  const asset = await resolveSymbol(symbol);
  const account = await accountFor(asset.country === "TR" ? "TR" : "US");
  const data = await gql("PendingOrders", Q.PENDING_ORDERS, {
    accountUid: account.accountUid,
    stockUid: asset.uid,
  });
  return {
    symbol: asset.symbol,
    accountUid: account.accountUid,
    stockUid: asset.uid,
    orders: data.pendingOrders?.orders ?? [],
  };
}

const auditOrder = createOrderAuditLogger(config.orderLogFile);

interface OrderPreparation {
  acceptedOrderBases: string[];
  availableOrderTypes: string[];
  availableShares: number | null;
  availableSharesDecoupled: number | null;
  isFractionable: boolean;
  defaultOrderBase: string | null;
  priceRange?: {
    minPrice?: number | null;
    maxPrice?: number | null;
    fatFingerMinPrice?: number | null;
    fatFingerMaxPrice?: number | null;
  } | null;
  validityPeriodDto?: {
    tradingRangeDto?: {
      validityPeriodCalendarItems?: Array<{
        actionType?: string;
        isActive?: boolean;
        isSelected?: boolean;
        selectedOrderDate?: string | null;
      }>;
    };
  } | null;
}

interface PlaceOrderInput {
  symbol: string;
  side: Side;
  orderType?: PlaceOrderType;
  quantity?: number;
  amountTry?: number;
  limitPrice?: number;
}

interface UpdateOrderInput {
  orderId: string;
  symbol: string;
  newQuantity?: number;
  newLimitPrice?: number;
  newStopPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

function isFund(snapshot: any): boolean {
  return snapshot?.investmentType === "INVESTMENT_FUNDS";
}

async function exactOrderAsset(symbol: string) {
  const asset = await resolveSymbol(symbol);
  assertExactResolvedSymbol(symbol, asset.symbol);
  if (asset.country !== "TR") {
    throw new MidasApiError("Emir araçları yalnızca BIST hisseleri ve TEFAS fonları içindir");
  }
  const data = await gql("GetAssetSnapshot", Q.ASSET_SNAPSHOT, { uid: asset.uid, currency: "TRY" });
  const snapshot = data.asset;
  if (!snapshot?.uid || snapshot.uid !== asset.uid) {
    throw new MidasApiError("Midas enstrüman ayrıntısını doğrulayamadı; işlem reddedildi");
  }
  const price = snapshot.tradePrice?.price;
  if (!Number.isFinite(price) || price <= 0) {
    throw new MidasApiError(`${asset.symbol} için güncel TRY fiyatı yok; işlem reddedildi`);
  }
  return { asset, snapshot, price: price as number, kind: isFund(snapshot) ? "fund" as const : "stock" as const };
}

async function prepareOrder(
  accountUid: string,
  stockUid: string,
  side: Side,
  type: string,
  orderUid?: string
): Promise<OrderPreparation> {
  const data = await gql("PrepareOrder", Q.PREPARE_ORDER, {
    accountUid,
    input: { stockUid, side, type, ...(orderUid ? { orderUid } : {}) },
  });
  if (!data.orderPreparationV2) throw new MidasApiError("Midas emir hazırlığını döndürmedi");
  return data.orderPreparationV2 as OrderPreparation;
}

function defaultEndingDate(prep: OrderPreparation): string | undefined {
  return prep.validityPeriodDto?.tradingRangeDto?.validityPeriodCalendarItems?.find(
    (item) => item.actionType === "SELECTION" && item.isActive && item.isSelected && item.selectedOrderDate
  )?.selectedOrderDate ?? undefined;
}

function assertOrderValue(estimatedTry: number): void {
  if (estimatedTry > config.maxOrderValueTry) {
    throw new MidasApiError(
      `Tahmini ₺${estimatedTry.toFixed(2)} tutar, ₺${config.maxOrderValueTry.toFixed(2)} güvenlik tavanını aşıyor`
    );
  }
}

function sideLabel(side: Side): "ALIŞ" | "SATIŞ" {
  return side === "BUY" ? "ALIŞ" : "SATIŞ";
}

async function orderDetail(accountUid: string, orderId: string): Promise<any> {
  const data = await gql("OrderDetail", Q.ORDER_DETAIL, { accountUid, orderId });
  if (!data.orderDetail?.uid) throw new MidasApiError(`Emir ayrıntısı bulunamadı: ${orderId}`);
  return data.orderDetail;
}

async function pendingForAsset(accountUid: string, stockUid: string): Promise<any[]> {
  const data = await gql("PendingOrders", Q.PENDING_ORDERS, { accountUid, stockUid });
  return data.pendingOrders?.orders ?? [];
}

function stableOrderValues(order: any): Record<string, unknown> {
  return {
    uid: order.uid,
    stockUid: order.stockUid,
    status: order.status,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    stopPrice: order.stopPrice,
    profitPrice: order.profitPrice,
    lossPrice: order.lossPrice,
  };
}

async function revalidateAsset(
  symbol: string,
  expected: { uid: string; name: string; price: number }
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const current = await exactOrderAsset(symbol);
    if (current.asset.uid !== expected.uid || current.snapshot.name !== expected.name) {
      return { ok: false, reason: "Çözümlenen enstrüman onay önizlemesinden farklı" };
    }
    const drift = meaningfulPriceDrift(expected.price, current.price);
    return drift ? { ok: false, reason: drift } : { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function placeOrder(input: PlaceOrderInput) {
  const resolved = await exactOrderAsset(input.symbol);
  const account = await accountFor("TR");
  const orderType: PlaceOrderType = input.orderType ?? (resolved.kind === "fund" ? "DEMAND" : input.limitPrice != null ? "LIMIT" : "MARKET");
  const prep = await prepareOrder(account.accountUid, resolved.asset.uid, input.side, orderType);
  if (prep.availableOrderTypes?.length && !prep.availableOrderTypes.includes(orderType)) {
    throw new MidasApiError(`${orderType} şu anda kabul edilmiyor; kullanılabilir tipler: ${prep.availableOrderTypes.join(", ")}`);
  }
  if (input.side === "SELL" && input.quantity != null) {
    const available = prep.availableSharesDecoupled ?? prep.availableShares;
    if (available != null && input.quantity > available) {
      throw new MidasApiError(`Satılabilir adet ${available}; ${input.quantity} adet gönderilemez`);
    }
  }
  if (resolved.kind === "stock" && !prep.isFractionable && input.quantity != null && !Number.isInteger(input.quantity)) {
    throw new MidasApiError(`${resolved.asset.symbol} kesirli adedi desteklemiyor`);
  }
  if (orderType === "LIMIT" && prep.priceRange) {
    const min = prep.priceRange.minPrice ?? prep.priceRange.fatFingerMinPrice;
    const max = prep.priceRange.maxPrice ?? prep.priceRange.fatFingerMaxPrice;
    if (min != null && (input.limitPrice ?? 0) < min) throw new MidasApiError(`Limit fiyatı günlük alt sınır ${min} altında`);
    if (max != null && (input.limitPrice ?? 0) > max) throw new MidasApiError(`Limit fiyatı günlük üst sınır ${max} üstünde`);
  }

  const request = buildPlaceOrderRequest({
    kind: resolved.kind,
    stockUid: resolved.asset.uid,
    side: input.side,
    orderType,
    quantity: input.quantity,
    amountTry: input.amountTry,
    limitPrice: input.limitPrice,
    endingDate: orderType === "LIMIT" ? defaultEndingDate(prep) : undefined,
  });
  const unitPrice = orderType === "LIMIT" ? input.limitPrice! : resolved.price;
  const estimatedTry = input.amountTry ?? unitPrice * (input.quantity ?? 0);
  assertOrderValue(estimatedTry);

  const preview: ApprovalPreview = {
    action: "PLACE",
    instrumentName: resolved.snapshot.name,
    symbol: resolved.asset.symbol,
    market: resolved.kind === "fund" ? "TR FON (TEFAS)" : "TR HİSSE (BIST)",
    side: sideLabel(input.side),
    orderType,
    quantity: input.quantity,
    amountTry: input.amountTry,
    limitPrice: input.limitPrice,
    currentPrice: resolved.price,
    estimatedTry,
    accountUid: account.accountUid,
  };

  return executeWithApproval({
    preview,
    confirm: confirmOrderOnDesktop,
    audit: auditOrder,
    revalidate: () => revalidateAsset(input.symbol, { uid: resolved.asset.uid, name: resolved.snapshot.name, price: resolved.price }),
    mutate: async () => {
      const data = await gql("PlaceOrder", Q.PLACE_ORDER, { accountUid: account.accountUid, request });
      const order = data.placeOrderV2?.order;
      if (!order?.uid) throw new MidasApiError("Midas emri kabul ettiğini doğrulayan emir kimliği döndürmedi");
      const [pendingResult, detailResult] = await Promise.allSettled([
        pendingForAsset(account.accountUid, resolved.asset.uid),
        orderDetail(account.accountUid, order.uid),
      ]);
      const pendingMatch = pendingResult.status === "fulfilled"
        ? pendingResult.value.find((item) => item.uid === order.uid) ?? null
        : null;
      const detail = detailResult.status === "fulfilled" ? detailResult.value : null;
      return {
        order,
        verification: {
          verified: detail?.uid === order.uid || pendingMatch?.uid === order.uid,
          pending: pendingMatch,
          detail,
          errors: [
            ...(pendingResult.status === "rejected" ? [`PendingOrders: ${String(pendingResult.reason)}`] : []),
            ...(detailResult.status === "rejected" ? [`OrderDetail: ${String(detailResult.reason)}`] : []),
          ],
        },
      };
    },
  });
}

export async function updateOrder(input: UpdateOrderInput) {
  if (
    input.newQuantity == null &&
    input.newLimitPrice == null &&
    input.newStopPrice == null &&
    input.takeProfitPrice == null &&
    input.stopLossPrice == null
  ) {
    throw new MidasApiError("Güncellenecek en az bir emir alanı verilmelidir");
  }
  const resolved = await exactOrderAsset(input.symbol);
  const account = await accountFor("TR");
  const existing = await orderDetail(account.accountUid, input.orderId);
  if (existing.stockUid !== resolved.asset.uid) throw new MidasApiError("Emir, çözümlenen enstrümana ait değil; işlem reddedildi");
  if (!existing.showUpdate) throw new MidasApiError("Midas bu emrin güncellenebilir olduğunu belirtmiyor");
  const supported: UpdatableOrderType[] = ["LIMIT", "STOP", "STOP_LIMIT", "TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"];
  if (!supported.includes(existing.type)) throw new MidasApiError(`${existing.type} emir güncellemesi desteklenmiyor`);
  await prepareOrder(account.accountUid, resolved.asset.uid, existing.side, existing.type, existing.uid);

  const quantity = input.newQuantity ?? existing.quantity;
  const limitPrice = input.takeProfitPrice ?? input.newLimitPrice ?? existing.limitPrice ?? existing.profitPrice;
  const stopPrice = input.stopLossPrice ?? input.newStopPrice ?? existing.stopPrice ?? existing.lossPrice;
  const nominalPrice = [existing.limitPrice, existing.stopPrice, existing.profitPrice, existing.lossPrice, resolved.price]
    .find((value) => Number.isFinite(value) && value > 0);
  const request = buildUpdateOrderRequest({
    orderType: existing.type,
    quantity,
    nominalPrice,
    limitPrice,
    stopPrice,
  });
  const oldValues = stableOrderValues(existing);
  const newValues = {
    quantity,
    ...(existing.type === "TAKE_PROFIT_AND_STOP_LOSS"
      ? { profitPrice: limitPrice, lossPrice: stopPrice }
      : { limitPrice, stopPrice }),
  };
  const preview: ApprovalPreview = {
    action: "UPDATE",
    instrumentName: resolved.snapshot.name,
    symbol: resolved.asset.symbol,
    market: resolved.kind === "fund" ? "TR FON (TEFAS)" : "TR HİSSE (BIST)",
    side: sideLabel(existing.side),
    orderType: existing.type,
    quantity,
    limitPrice: existing.type === "TAKE_PROFIT_AND_STOP_LOSS" ? undefined : limitPrice,
    takeProfitPrice: existing.type === "TAKE_PROFIT_AND_STOP_LOSS" ? limitPrice : undefined,
    stopLossPrice: existing.type === "TAKE_PROFIT_AND_STOP_LOSS" ? stopPrice : undefined,
    currentPrice: resolved.price,
    estimatedTry: resolved.price * quantity,
    accountUid: account.accountUid,
    oldValues,
    newValues,
  };

  return executeWithApproval({
    preview,
    confirm: confirmOrderOnDesktop,
    audit: auditOrder,
    revalidate: async () => {
      const assetCheck = await revalidateAsset(input.symbol, { uid: resolved.asset.uid, name: resolved.snapshot.name, price: resolved.price });
      if (!assetCheck.ok) return assetCheck;
      try {
        const latest = await orderDetail(account.accountUid, input.orderId);
        return JSON.stringify(stableOrderValues(latest)) === JSON.stringify(oldValues)
          ? { ok: true }
          : { ok: false, reason: "Emrin mevcut değerleri onay önizlemesinden sonra değişti" };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    mutate: async () => {
      const data = await gql("UpdateOrder", Q.UPDATE_ORDER, {
        accountUid: account.accountUid,
        orderUid: existing.uid,
        stockUid: resolved.asset.uid,
        request,
      });
      if (!data.updateOrder?.order?.uid) throw new MidasApiError("Midas güncelleme sonucunda emir kimliği döndürmedi");
      const [pendingResult, detailResult] = await Promise.allSettled([
        pendingForAsset(account.accountUid, resolved.asset.uid),
        orderDetail(account.accountUid, existing.uid),
      ]);
      const pending = pendingResult.status === "fulfilled"
        ? pendingResult.value.find((item) => item.uid === existing.uid) ?? null
        : null;
      const detail = detailResult.status === "fulfilled" ? detailResult.value : null;
      const observed = detail ?? pending;
      const sameNumber = (left: unknown, right: unknown) => Number(left) === Number(right);
      const quantityMatches = observed != null && sameNumber(observed.quantity, quantity);
      const limitMatches = !Object.hasOwn(request, "newLimitPrice") || sameNumber(
        observed?.limitPrice ?? observed?.profitPrice,
        request.newLimitPrice
      );
      const stopMatches = !Object.hasOwn(request, "newStopPrice") || sameNumber(
        observed?.stopPrice ?? observed?.lossPrice,
        request.newStopPrice
      );
      return {
        order: data.updateOrder.order,
        verification: {
          verified: quantityMatches && limitMatches && stopMatches,
          pending,
          detail,
          errors: [
            ...(pendingResult.status === "rejected" ? [`PendingOrders: ${String(pendingResult.reason)}`] : []),
            ...(detailResult.status === "rejected" ? [`OrderDetail: ${String(detailResult.reason)}`] : []),
          ],
        },
      };
    },
  });
}

export async function cancelOrder(orderId: string, symbol: string) {
  const resolved = await exactOrderAsset(symbol);
  const account = await accountFor("TR");
  const existing = await orderDetail(account.accountUid, orderId);
  if (existing.stockUid !== resolved.asset.uid) throw new MidasApiError("Emir, çözümlenen enstrümana ait değil; işlem reddedildi");
  if (!existing.eligibleToCancel) throw new MidasApiError("Midas bu emrin iptal edilebilir olduğunu belirtmiyor");
  const oldValues = stableOrderValues(existing);
  const quantity = Number(existing.quantity) || 0;
  const preview: ApprovalPreview = {
    action: "CANCEL",
    instrumentName: resolved.snapshot.name,
    symbol: resolved.asset.symbol,
    market: resolved.kind === "fund" ? "TR FON (TEFAS)" : "TR HİSSE (BIST)",
    side: sideLabel(existing.side),
    orderType: existing.type,
    quantity,
    limitPrice: existing.limitPrice,
    takeProfitPrice: existing.profitPrice,
    stopLossPrice: existing.lossPrice ?? existing.stopPrice,
    currentPrice: resolved.price,
    estimatedTry: existing.notional ?? existing.totalPrice ?? resolved.price * quantity,
    accountUid: account.accountUid,
    oldValues,
    newValues: { status: "CANCELED" },
  };

  return executeWithApproval({
    preview,
    confirm: confirmOrderOnDesktop,
    audit: auditOrder,
    revalidate: async () => {
      const assetCheck = await revalidateAsset(symbol, { uid: resolved.asset.uid, name: resolved.snapshot.name, price: resolved.price });
      if (!assetCheck.ok) return assetCheck;
      try {
        const latest = await orderDetail(account.accountUid, orderId);
        return latest.eligibleToCancel && JSON.stringify(stableOrderValues(latest)) === JSON.stringify(oldValues)
          ? { ok: true }
          : { ok: false, reason: "Emir iptal onayından sonra değişti veya artık iptal edilemiyor" };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    mutate: async () => {
      const data = await gql("CancelOrder", Q.CANCEL_ORDER, {
        accountUid: account.accountUid,
        orderId,
        stockUid: resolved.asset.uid,
      });
      if (!data.cancelOrder?.order?.uid) throw new MidasApiError("Midas iptal sonucunda emir kimliği döndürmedi");
      const [pendingResult, detailResult] = await Promise.allSettled([
        pendingForAsset(account.accountUid, resolved.asset.uid),
        orderDetail(account.accountUid, orderId),
      ]);
      const stillPending = pendingResult.status === "fulfilled"
        ? pendingResult.value.find((item) => item.uid === orderId) ?? null
        : null;
      const detail = detailResult.status === "fulfilled" ? detailResult.value : null;
      return {
        order: data.cancelOrder.order,
        verification: {
          verified:
            (pendingResult.status === "fulfilled" && !stillPending) ||
            stillPending?.status === "PENDING_CANCEL" ||
            (detail != null && detail.status !== existing.status),
          pending: stillPending,
          detail,
          errors: [
            ...(pendingResult.status === "rejected" ? [`PendingOrders: ${String(pendingResult.reason)}`] : []),
            ...(detailResult.status === "rejected" ? [`OrderDetail: ${String(detailResult.reason)}`] : []),
          ],
        },
      };
    },
  });
}
