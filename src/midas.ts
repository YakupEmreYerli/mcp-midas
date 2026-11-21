import { gql, MidasApiError } from "./api.js";
import { defineMessages } from "./i18n.js";
import { config } from "./config.js";
import { confirmOrderOnDesktop } from "./desktop-confirmation.js";
import {
  assertExactResolvedSymbol,
  buildPlaceOrderRequest,
  buildUpdateOrderRequest,
  isTpslOrderType,
  meaningfulPriceDrift,
  resolveTpslOrderType,
  updateNotAllowedMessage,
  type PlaceOrderType,
  type Side,
  type UpdatableOrderType,
} from "./order-domain.js";
import { executeWithApproval, type ApprovalPreview } from "./order-approval.js";
import { createOrderAuditLogger } from "./order-audit.js";
import { getAllPendingOrders } from "./history.js";
import * as Q from "./queries.js";
import { session } from "./session.js";
import {
  candidateSummary,
  needsPositions,
  pickInstrument,
  type Country,
  type HeldInstrument,
  type PickResult,
  type ResolvedBy,
  type ResolveMode,
  type SearchCandidate,
} from "./symbol-resolution.js";

const M = defineMessages(
  {
    noAccount: (market: string) => `Bu Midas profilinde ${market} hesabı bulunamadı`,
    ambiguityNote: "Bu sembolü birden çok enstrüman taşıyor; farklı enstrüman için market parametresini (TR ya da US) ver.",
    trOnly: "Emir araçları yalnızca BIST hisseleri ve TEFAS fonları içindir",
    detailUnverified: "Midas enstrüman ayrıntısını doğrulayamadı; işlem reddedildi",
    noTryPrice: (symbol: string) => `${symbol} için güncel TRY fiyatı yok; işlem reddedildi`,
    noPrep: "Midas emir hazırlığını döndürmedi",
    overCap: (estimated: string, cap: string) => `Tahmini ₺${estimated} tutar, ₺${cap} güvenlik tavanını aşıyor`,
    noOrderDetail: (orderId: string) => `Emir ayrıntısı bulunamadı: ${orderId}`,
    instrumentChanged: "Çözümlenen enstrüman onay önizlemesinden farklı",
    tpslOnly: (orderType: string) =>
      `take_profit_price/stop_loss_price yalnızca TAKE_PROFIT, STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS emirlerinde kullanılır; ${orderType} için verilemez`,
    tpslNoLimit: "Kâr al/zarar durdur emrinde limit_price ve amount_try verilmez; quantity, take_profit_price ve/veya stop_loss_price kullan",
    tpslStocksOnly: "Kâr al/zarar durdur emirleri yalnızca BIST hisseleri için verilebilir",
    amountFundOnly: "amount_try yalnızca TEFAS fon alışında kullanılır; BIST hissesinde quantity ver",
    typeNotAccepted: (type: string, available: string) => `${type} şu anda kabul edilmiyor; kullanılabilir tipler: ${available}`,
    sharesBlocked: " Adetler bekleyen başka bir satış emrinde (ör. mevcut kâr al/zarar durdur) bloke olabilir; önce o emri cancel_order ile iptal edin.",
    sellable: (available: number, quantity: number, blocked: string) => `Satılabilir adet ${available}; ${quantity} adet gönderilemez.${blocked}`,
    stopFloor: (floor: number) => `Zarar durdurma fiyatı Midas alt sınırı ${floor} altında`,
    profitCeiling: (ceiling: number) => `Kâr alma fiyatı Midas üst sınırı ${ceiling} üstünde`,
    fractional: (symbol: string) => `${symbol} kesirli adedi desteklemiyor`,
    limitLow: (lowest: number) => `Limit fiyatı günlük alt sınır ${lowest} altında`,
    limitHigh: (highest: number) => `Limit fiyatı günlük üst sınır ${highest} üstünde`,
    marketFund: "TR FON (TEFAS)",
    marketStock: "TR HİSSE (BIST)",
    noPlaceId: "Midas emri kabul ettiğini doğrulayan emir kimliği döndürmedi",
    nothingToUpdate: "Güncellenecek en az bir emir alanı verilmelidir",
    wrongInstrument: "Emir, çözümlenen enstrümana ait değil; işlem reddedildi",
    updateUnsupported: (type: string) => `${type} emir güncellemesi desteklenmiyor`,
    valuesChanged: "Emrin mevcut değerleri onay önizlemesinden sonra değişti",
    noUpdateId: "Midas güncelleme sonucunda emir kimliği döndürmedi",
    notCancelable: "Midas bu emrin iptal edilebilir olduğunu belirtmiyor",
    cancelChanged: "Emir iptal onayından sonra değişti veya artık iptal edilemiyor",
    noCancelId: "Midas iptal sonucunda emir kimliği döndürmedi",
  },
  {
    noAccount: (market) => `No ${market} account found in this Midas profile`,
    ambiguityNote: "Several instruments share this symbol; to get a different one, pass the market parameter (TR or US).",
    trOnly: "Order tools only work with BIST stocks and TEFAS funds",
    detailUnverified: "Midas couldn't confirm the instrument details; order rejected",
    noTryPrice: (symbol) => `No current TRY price for ${symbol}; order rejected`,
    noPrep: "Midas didn't return the order preparation",
    overCap: (estimated, cap) => `The estimated ₺${estimated} exceeds the ₺${cap} safety cap`,
    noOrderDetail: (orderId) => `Order details not found: ${orderId}`,
    instrumentChanged: "The resolved instrument differs from the approval preview",
    tpslOnly: (orderType) =>
      `take_profit_price/stop_loss_price only apply to TAKE_PROFIT, STOP_LOSS and TAKE_PROFIT_AND_STOP_LOSS orders, not to ${orderType}`,
    tpslNoLimit: "Take-profit/stop-loss orders don't take limit_price or amount_try; use quantity, take_profit_price and/or stop_loss_price",
    tpslStocksOnly: "Take-profit/stop-loss orders are only available for BIST stocks",
    amountFundOnly: "amount_try only applies to TEFAS fund buys; use quantity for BIST stocks",
    typeNotAccepted: (type, available) => `${type} isn't accepted right now; available types: ${available}`,
    sharesBlocked: " The shares may be held by another pending sell order (e.g. an existing take profit/stop loss); cancel that order with cancel_order first.",
    sellable: (available, quantity, blocked) => `Only ${available} can be sold; can't send ${quantity}.${blocked}`,
    stopFloor: (floor) => `The stop-loss price is below the Midas floor of ${floor}`,
    profitCeiling: (ceiling) => `The take-profit price is above the Midas ceiling of ${ceiling}`,
    fractional: (symbol) => `${symbol} doesn't support fractional quantities`,
    limitLow: (lowest) => `The limit price is below the daily floor of ${lowest}`,
    limitHigh: (highest) => `The limit price is above the daily ceiling of ${highest}`,
    marketFund: "TR fund (TEFAS)",
    marketStock: "TR stock (BIST)",
    noPlaceId: "Midas didn't return an order ID confirming it accepted the order",
    nothingToUpdate: "Give at least one order field to update",
    wrongInstrument: "The order doesn't belong to the resolved instrument; order rejected",
    updateUnsupported: (type) => `Updating ${type} orders isn't supported`,
    valuesChanged: "The order's values changed after the approval preview",
    noUpdateId: "Midas didn't return an order ID after the update",
    notCancelable: "Midas doesn't mark this order as cancelable",
    cancelChanged: "The order changed after the cancel approval or can no longer be canceled",
    noCancelId: "Midas didn't return an order ID after the cancel",
  }
);

export type { Side } from "./order-domain.js";

type Market = "TR" | "US";

/** Bir piyasadaki (TR ya da US) yatırım hesabı ve bakiyeleri. */
export interface Account {
  accountUid: string;
  assetVertical: Market;
  currency: string;
  buyingPower: number;
  cash: number;
  withdrawableCash: number;
}

/** get_assets satırı: adet, maliyet, güncel değer ve kâr/zarar. */
export interface Position {
  symbol: string;
  name: string;
  assetUid: string;
  accountUid: string;
  market: Market;
  quantity: number;
  averageCost: number;
  price: number | null;
  currency: string;
  marketValue: number | null;
  profitLoss: number | null;
  profitLossPercent: number | null;
  sessionStatus: string | null;
}

/** Portföy değeri (TL), günlük kâr/zarar ve piyasa başına nakit bakiyeleri. */
export async function getPortfolio() {
  const res = await gql("GetPortfolioOverview", Q.PORTFOLIO_SUMMARY, {
    memberUid: await session.getMemberUid(),
    currencyCode: "TRY",
    timeRange: "DAY",
  });
  const overview = res.overviewV2;
  const pnl: Array<{ timeRange: string }> = overview.profitLosses ?? [];
  return {
    portfolioValueTry: overview.portfolioValue,
    dayProfitLoss: pnl.find((entry) => entry.timeRange === "DAY") ?? null,
    accounts: (overview.accounts ?? []) as Account[],
  };
}

/** Profildeki `market` hesabı; yoksa hata. */
async function accountFor(market: Market): Promise<Account> {
  const { accounts } = await getPortfolio();
  const match = accounts.find((acc) => acc.assetVertical === market);
  if (match) return match;
  throw new MidasApiError(M().noAccount(market));
}

/** Midas'ın pozisyon satırı (HOLDINGS belgesindeki Holding parçası). */
interface RawHolding {
  accountUid: string;
  assetUid: string;
  assetVertical: Market;
  symbol: string;
  displayName?: string | null;
  quantity: number;
  averageCost: number;
  currency: string;
  multiplier?: number | null;
  tradePriceV3?: { price?: number | null; tradingSessionStatus?: string | null } | null;
}

/** Ham satırı araç çıktısına çevirir; opsiyonlarda değer kontrat çarpanıyla hesaplanır. */
function toPosition(row: RawHolding): Position {
  const units = row.quantity * (row.multiplier ?? 1);
  const price = row.tradePriceV3?.price ?? null;
  const invested = row.averageCost * units;
  const value = price === null ? null : price * units;
  const gain = value === null ? null : value - invested;
  return {
    symbol: row.symbol,
    name: row.displayName ?? row.symbol,
    assetUid: row.assetUid,
    accountUid: row.accountUid,
    market: row.assetVertical,
    quantity: row.quantity,
    averageCost: row.averageCost,
    price,
    currency: row.currency,
    marketValue: value,
    profitLoss: gain,
    profitLossPercent: gain === null || invested === 0 ? null : (gain / invested) * 100,
    sessionStatus: row.tradePriceV3?.tradingSessionStatus ?? null,
  };
}

/** BIST hisseleri, ABD hisseleri, TEFAS fonları ve ABD opsiyonlarındaki tüm açık pozisyonlar. */
export async function getPositions(): Promise<Position[]> {
  const res = await gql<Record<string, RawHolding[] | null>>(
    "OverviewAllPositions",
    Q.HOLDINGS,
    { memberUid: await session.getMemberUid() },
    "overviewPositionsV2"
  );
  return (["bist", "usEquity", "tefas", "usOption"] as const).flatMap((group) => (res[group] ?? []).map(toPosition));
}

export interface ResolvedAsset {
  uid: string;
  symbol: string;
  title: string;
  subtitle: string;
  country: Market;
  type: string;
  /** Seçimin nasıl yapıldığı: birebir tek eşleşme, emir, pozisyon, piyasa ipucu, ilk eşleşme, bulanık. */
  resolvedBy: ResolvedBy;
  /** Birebir aynı sembolü taşıyan bütün adaylar; birden çoksa sembol belirsizdir. */
  candidates: SearchCandidate[];
}

export interface ResolveOptions {
  /** "order": belirsiz eşleşmede tahmin yapmaz, adayları listeleyerek hata verir. */
  mode?: ResolveMode;
  /** Okuma araçları için isteğe bağlı ülke/piyasa ipucu (TR ya da US). */
  market?: Country;
  /** Güncelleme/iptalde emrin kendi enstrümanı (OrderDetail.stockUid). */
  preferUid?: string;
}

async function heldInstruments(): Promise<HeldInstrument[]> {
  try {
    return (await getPositions()).map((p) => ({
      symbol: p.symbol,
      assetUid: p.assetUid,
      name: p.name,
      market: p.market,
    }));
  } catch (error) {
    if (!(error instanceof MidasApiError)) throw error;
    return [];
  }
}

/** Atlas aramasında hisse/ETF ve fon sonuçları; sayfa başına en çok 30. */
async function searchInstruments(text: string): Promise<SearchCandidate[]> {
  const res = await gql("Search", Q.INSTRUMENT_SEARCH, {
    query: text,
    searchItemTypes: ["MARKET_INSTRUMENTS", "INVESTMENT_FUNDS"],
    page: 0,
    size: 30,
  });
  return ((res.Search?.results ?? []) as SearchCandidate[]).filter((r) => r.symbol);
}

/**
 * Sembolü Midas enstrüman uid'sine çözer. Tek birebir eşleşme varsa onu seçer. Aynı
 * sembolü birden çok enstrüman taşıyorsa sırasıyla emrin kendi enstrümanını, okumada açık
 * piyasa ipucunu ve kullanıcının pozisyonundaki enstrümanı kullanır; emir yolunda (`mode: "order"`)
 * bunlar ayırt etmezse adayları listeleyerek hata verir. Birebir eşleşme hiç yoksa ilk
 * arama sonucuna düşer (kısmi adlar okumada çalışsın diye; emir yolu bunu reddeder).
 */
export async function resolveSymbol(symbol: string, options: ResolveOptions = {}): Promise<ResolvedAsset> {
  const results = await searchInstruments(symbol);
  const pickOptions = { mode: options.mode ?? "read", market: options.market, preferUid: options.preferUid } as const;
  // Arama boşsa da tutulan aynı sembollü pozisyona bakılır (ör. aramada çıkmayan fon).
  const positions = !results.length || needsPositions(symbol, results, pickOptions) ? await heldInstruments() : [];
  return toResolved(pickInstrument(symbol, results, { ...pickOptions, positions }));
}

function toResolved({ asset, resolvedBy, candidates }: PickResult): ResolvedAsset {
  const { uid, symbol, title, subtitle, type } = asset;
  return { uid, symbol, title, subtitle, country: asset.country as Market, type, resolvedBy, candidates };
}

/** Okuma sonuçlarına eklenen belirsizlik bilgisi; tek adayda boş nesne. */
function ambiguityInfo(asset: ResolvedAsset) {
  if (asset.candidates.length < 2) return {};
  return {
    ambiguousSymbol: true,
    resolvedBy: asset.resolvedBy,
    candidates: candidateSummary(asset.candidates),
    note: M().ambiguityNote,
  };
}

/** Bir sembolün son işlem fiyatı; istenirse başka bir para birimine çevrilir. */
export async function getAssetPrice(symbol: string, currency?: "TRY" | "USD", market?: Country) {
  const asset = await resolveSymbol(symbol, { market });
  return { ...(await priceFor(asset, currency)), ...ambiguityInfo(asset) };
}

/** Çözülmüş enstrümanın fiyat özeti; değişim önceki kapanışa göre yüzde. */
async function priceFor(asset: ResolvedAsset, currency?: "TRY" | "USD") {
  const { asset: quote } = await gql("GetAssetSnapshot", Q.INSTRUMENT_QUOTE, { uid: asset.uid, currency: currency ?? null });
  const last: number | null = quote.tradePrice?.price ?? null;
  const prior: number | null = quote.previousClosePrice ?? null;
  return {
    symbol: asset.symbol,
    name: quote.name,
    uid: quote.uid,
    price: last,
    currency: quote.tradePrice?.currency ?? quote.currency,
    previousClose: prior,
    changePercent: last !== null && prior ? (100 * (last - prior)) / prior : null,
    sessionStatus: quote.tradePrice?.tradingSessionStatus ?? null,
    tradable: quote.orderFlowEnabled ?? false,
  };
}

/** "Risk seviyesi" → "riskSeviyesi" gibi anahtarlar Türkçe etiketleri gizler; etiketler olduğu gibi kalır. */
function statsObject(items: Array<{ key: string; value: string }> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items ?? []) if (item?.key) out[item.key] = item.value;
  return out;
}

/**
 * Bir sembolün tanıtıcı bilgisi ve güncel fiyatı. `stats`, Atlas enstrüman sayfasının
 * anahtar/değer bloğudur: TEFAS fonlarında risk seviyesi, valör, vergi, yıllık ücret ve
 * yatırımcı sayısı; hisselerde fiyat bandı, 52 haftalık aralık ve oranlar. Arama bulanık
 * olduğundan `exactMatch`, çözümlenen sembolün istenenle aynı olup olmadığını söyler.
 */
export async function getAssetInfo(symbol: string, market?: Country) {
  const asset = await resolveSymbol(symbol, { market });
  // Fiyat, sembolü yeniden aramadan aynı uid üzerinden alınır; aksi hâlde belirsiz sembolde
  // bilgi ve fiyat farklı enstrümanlardan gelebilir.
  const [price, overview, snapshot] = await Promise.all([
    priceFor(asset),
    gql("getInstrumentOverview", Q.INSTRUMENT_OVERVIEW, { uid: asset.uid })
      .then((d) => d.instrumentOverviewSection)
      .catch(() => null),
    gql("GetAssetSnapshot", Q.INSTRUMENT_QUOTE, { uid: asset.uid, currency: null })
      .then((d) => d.asset)
      .catch(() => null),
  ]);
  const stats = statsObject(overview?.stats?.items);
  const isFund = snapshot?.investmentType === "INVESTMENT_FUNDS";
  const info = {
    requestedSymbol: symbol,
    exactMatch: asset.symbol.toUpperCase() === symbol.trim().toUpperCase(),
    market: asset.country === "TR" ? (isFund ? "TEFAS" : "BIST") : "US",
    investmentType: snapshot?.investmentType ?? null,
    // Arama sonucunun alt başlığı: şirketin ya da fonun tam adı.
    description: asset.subtitle,
  };
  return Object.assign(price, info, {
    ...(isFund ? { riskLevel: stats["Risk seviyesi"] ?? null } : {}),
    stats,
    digest: overview?.digestDetail
      ? {
          direction: overview.digestDetail.direction ?? null,
          comment: overview.digestDetail.comment ?? null,
          completedAgo: overview.digestDetail.completedAgo ?? null,
        }
      : null,
    ...ambiguityInfo(asset),
  });
}

/**
 * Bekleyen emirler. Sembolsüz: tüm hesaplardaki bekleyen emirler tek çağrıda. Sembolle:
 * sembol birebir çözülürse enstrüman başına liste, çözülmezse sembole göre süzülmüş tüm
 * hesaplar listesi (arama bazı ABD ETF'lerini bulamıyor).
 */
export async function getPendingOrders(symbol?: string, market?: Country) {
  if (!symbol?.trim()) {
    const orders = await getAllPendingOrders();
    return { symbol: null, count: orders.length, orders };
  }
  const wanted = symbol.toUpperCase().trim();
  let asset: ResolvedAsset | null = null;
  try {
    asset = await resolveSymbol(symbol, { market });
  } catch (error) {
    if (!(error instanceof MidasApiError)) throw error;
  }
  // Belirsiz sembolde (pozisyon ya da ipucu ayırt etmedi) tek enstrümana daralmak yerine
  // tüm hesaplardaki aynı sembollü emirler döner.
  const unresolvedAmbiguity = asset?.resolvedBy === "first-exact";
  if (!asset || unresolvedAmbiguity || asset.symbol.toUpperCase() !== wanted) {
    const orders = (await getAllPendingOrders()).filter((o) => o.symbol?.toUpperCase() === wanted);
    return {
      symbol: wanted,
      source: "all-accounts",
      count: orders.length,
      orders,
      ...(asset && unresolvedAmbiguity ? ambiguityInfo(asset) : {}),
    };
  }
  const { accountUid } = await accountFor(asset.country);
  const orders = await pendingForAsset(accountUid, asset.uid);
  return { symbol: asset.symbol, accountUid, stockUid: asset.uid, orders, ...ambiguityInfo(asset) };
}

const auditOrder = createOrderAuditLogger(config.orderLogFile);

type MaybeNumber = number | null | undefined;

/** Atlas'ın emir formu için verdiği tarih seçeneği (geçerlilik takvimi). */
interface ValidityChoice {
  actionType?: string;
  isActive?: boolean;
  isSelected?: boolean;
  selectedOrderDate?: string | null;
}

/** PrepareOrder yanıtının kullanılan kısmı: izinli tipler, satılabilir adet, fiyat bandı, tarih. */
interface OrderPreparation {
  acceptedOrderBases: string[];
  defaultOrderBase: string | null;
  availableOrderTypes: Array<string>;
  isFractionable: boolean;
  availableShares: MaybeNumber;
  availableSharesDecoupled: MaybeNumber;
  /** Günlük fiyat limitleri ve Atlas'ın "fat finger" koruma aralığı. */
  priceRange?: { minPrice?: MaybeNumber; maxPrice?: MaybeNumber; fatFingerMinPrice?: MaybeNumber; fatFingerMaxPrice?: MaybeNumber } | null;
  validityPeriodDto?: { tradingRangeDto?: { validityPeriodCalendarItems?: ValidityChoice[] } } | null;
}

/** place_order aracının argümanları (camelCase). */
interface PlaceOrderInput {
  symbol: string;
  side: Side;
  orderType?: PlaceOrderType;
  /** Hisse adedi ya da fon payı. */
  quantity?: number;
  /** TEFAS fon alışında TL tutarı. */
  amountTry?: number;
  /** LIMIT emrinde istenen fiyat. */
  limitPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
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

/**
 * Emir yolu çözümlemesi: sembol birebir eşleşmeli; aynı sembolü birden çok enstrüman
 * taşıyorsa emrin kendi enstrümanı (`preferUid`) ya da kullanıcının pozisyonu seçer,
 * hiçbiri ayırt etmiyorsa tahmin yapılmaz ve adaylarla hata döner.
 */
async function exactOrderAsset(symbol: string, preferUid?: string) {
  const asset = await resolveSymbol(symbol, { mode: "order", preferUid });
  assertExactResolvedSymbol(symbol, asset.symbol);
  if (asset.country !== "TR") {
    throw new MidasApiError(M().trOnly);
  }
  const data = await gql("GetAssetSnapshot", Q.INSTRUMENT_QUOTE, { uid: asset.uid, currency: "TRY" });
  const snapshot = data.asset;
  if (!snapshot?.uid || snapshot.uid !== asset.uid) {
    throw new MidasApiError(M().detailUnverified);
  }
  const price = snapshot.tradePrice?.price;
  if (!Number.isFinite(price) || price <= 0) {
    throw new MidasApiError(M().noTryPrice(asset.symbol));
  }
  return { asset, snapshot, price: price as number, kind: isFund(snapshot) ? "fund" as const : "stock" as const };
}

/**
 * Atlas'ın emir formunu açarken yaptığı hazırlık sorgusu. Güncellemede mevcut emrin uid'si
 * de verilir.
 */
async function prepareOrder(
  account: string,
  order: { stockUid: string; side: Side; type: string; orderUid?: string }
): Promise<OrderPreparation> {
  const input = order.orderUid ? order : { stockUid: order.stockUid, side: order.side, type: order.type };
  const res = await gql<{ orderPreparationV2?: OrderPreparation }>("PrepareOrder", Q.PREPARE_ORDER, { accountUid: account, input });
  if (res.orderPreparationV2) return res.orderPreparationV2;
  throw new MidasApiError(M().noPrep);
}

function defaultEndingDate(prep: OrderPreparation): string | undefined {
  return prep.validityPeriodDto?.tradingRangeDto?.validityPeriodCalendarItems?.find(
    (item) => item.actionType === "SELECTION" && item.isActive && item.isSelected && item.selectedOrderDate
  )?.selectedOrderDate ?? undefined;
}

/** MAX_ORDER_VALUE_TRY tavanı; onay penceresinden önce uygulanır, onun yerine geçmez. */
function assertOrderValue(estimatedTry: number): void {
  const cap = config.maxOrderValueTry;
  if (estimatedTry <= cap) return;
  throw new MidasApiError(M().overCap(estimatedTry.toFixed(2), cap.toFixed(2)));
}

function sideLabel(side: Side): "ALIŞ" | "SATIŞ" {
  return side === "BUY" ? "ALIŞ" : "SATIŞ";
}

async function orderDetail(accountUid: string, orderId: string): Promise<any> {
  const data = await gql("OrderDetail", Q.ORDER_DETAIL, { accountUid, orderId });
  if (!data.orderDetail?.uid) throw new MidasApiError(M().noOrderDetail(orderId));
  return data.orderDetail;
}

async function pendingForAsset(accountUid: string, stockUid: string): Promise<any[]> {
  const data = await gql("PendingOrders", Q.OPEN_ORDERS_FOR_INSTRUMENT, { accountUid, stockUid });
  return data.pendingOrders?.orders ?? [];
}

/** Onaydan sonra değişip değişmediği denetlenen emir alanları (sıra karşılaştırmada önemli). */
const STABLE_ORDER_FIELDS = ["uid", "stockUid", "status", "quantity", "limitPrice", "stopPrice", "profitPrice", "lossPrice"] as const;

function stableOrderValues(order: any): Record<string, unknown> {
  return Object.fromEntries(STABLE_ORDER_FIELDS.map((field) => [field, order[field]]));
}

async function revalidateAsset(
  symbol: string,
  expected: { uid: string; name: string; price: number }
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const current = await exactOrderAsset(symbol, expected.uid);
    if (current.asset.uid !== expected.uid || current.snapshot.name !== expected.name) {
      return { ok: false, reason: M().instrumentChanged };
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
  const tpslFromPrices = resolveTpslOrderType(input.takeProfitPrice, input.stopLossPrice);
  const orderType: PlaceOrderType =
    input.orderType ??
    tpslFromPrices ??
    (resolved.kind === "fund" ? "DEMAND" : input.limitPrice != null ? "LIMIT" : "MARKET");
  const tpsl = isTpslOrderType(orderType);
  if (!tpsl && (input.takeProfitPrice != null || input.stopLossPrice != null)) {
    throw new MidasApiError(
      M().tpslOnly(orderType)
    );
  }
  if (tpsl && (input.limitPrice != null || input.amountTry != null)) {
    throw new MidasApiError(
      M().tpslNoLimit
    );
  }
  if (tpsl && resolved.kind !== "stock") {
    throw new MidasApiError(M().tpslStocksOnly);
  }
  if (resolved.kind === "stock" && input.amountTry != null) {
    throw new MidasApiError(M().amountFundOnly);
  }
  // Atlas, kâr al ve zarar durdur bacaklarını tek "Kâr al, zarar durdur" sekmesinden
  // hazırlar; yalnız TAKE_PROFIT ya da STOP_LOSS gönderilse de hazırlık bu tiple yapılır.
  const prepType = tpsl ? "TAKE_PROFIT_AND_STOP_LOSS" : orderType;
  const prep = await prepareOrder(account.accountUid, { stockUid: resolved.asset.uid, side: input.side, type: prepType });
  if (prep.availableOrderTypes?.length && !prep.availableOrderTypes.includes(prepType)) {
    throw new MidasApiError(M().typeNotAccepted(prepType, prep.availableOrderTypes.join(", ")));
  }
  if (input.side === "SELL" && input.quantity != null) {
    const available = prep.availableSharesDecoupled ?? prep.availableShares;
    if (available != null && input.quantity > available) {
      const blocked = tpsl
        ? M().sharesBlocked
        : "";
      throw new MidasApiError(M().sellable(available, input.quantity, blocked));
    }
  }
  if (tpsl && prep.priceRange) {
    const floor = prep.priceRange.fatFingerMinPrice;
    const ceiling = prep.priceRange.fatFingerMaxPrice;
    if (floor != null && input.stopLossPrice != null && input.stopLossPrice < floor) {
      throw new MidasApiError(M().stopFloor(floor));
    }
    if (ceiling != null && input.takeProfitPrice != null && input.takeProfitPrice > ceiling) {
      throw new MidasApiError(M().profitCeiling(ceiling));
    }
  }
  if (resolved.kind === "stock" && !prep.isFractionable && input.quantity != null && !Number.isInteger(input.quantity)) {
    throw new MidasApiError(M().fractional(resolved.asset.symbol));
  }
  const band = orderType === "LIMIT" ? prep.priceRange : null;
  if (band) {
    // Günlük limit yoksa Atlas'ın fat-finger aralığı sınır sayılır.
    const lowest = band.minPrice ?? band.fatFingerMinPrice;
    const highest = band.maxPrice ?? band.fatFingerMaxPrice;
    const asked = input.limitPrice ?? 0;
    if (lowest != null && asked < lowest) throw new MidasApiError(M().limitLow(lowest));
    if (highest != null && asked > highest) throw new MidasApiError(M().limitHigh(highest));
  }

  const request = buildPlaceOrderRequest({
    kind: resolved.kind,
    stockUid: resolved.asset.uid,
    side: input.side,
    orderType,
    quantity: input.quantity,
    amountTry: input.amountTry,
    limitPrice: input.limitPrice,
    takeProfitPrice: input.takeProfitPrice,
    stopLossPrice: input.stopLossPrice,
    referencePrice: tpsl ? resolved.price : undefined,
    endingDate: orderType === "LIMIT" || tpsl ? defaultEndingDate(prep) : undefined,
  });
  const unitPrice = orderType === "LIMIT"
    ? input.limitPrice!
    : tpsl
      ? Math.max(resolved.price, input.takeProfitPrice ?? 0)
      : resolved.price;
  const estimatedTry = input.amountTry ?? unitPrice * (input.quantity ?? 0);
  assertOrderValue(estimatedTry);

  const preview: ApprovalPreview = {
    action: "PLACE",
    instrumentName: resolved.snapshot.name,
    symbol: resolved.asset.symbol,
    market: resolved.kind === "fund" ? M().marketFund : M().marketStock,
    side: sideLabel(input.side),
    orderType,
    quantity: input.quantity,
    amountTry: input.amountTry,
    limitPrice: tpsl ? undefined : input.limitPrice,
    takeProfitPrice: tpsl ? input.takeProfitPrice : undefined,
    stopLossPrice: tpsl ? input.stopLossPrice : undefined,
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
      const placed = await gql("PlaceOrder", Q.PLACE_ORDER, { accountUid: account.accountUid, request });
      const order = placed.placeOrderV2?.order;
      if (!order?.uid) throw new MidasApiError(M().noPlaceId);
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
    throw new MidasApiError(M().nothingToUpdate);
  }
  const account = await accountFor("TR");
  const existing = await orderDetail(account.accountUid, input.orderId);
  // Aynı sembolü birden çok enstrüman taşıyorsa emrin kendi enstrümanı seçilir.
  const resolved = await exactOrderAsset(input.symbol, existing.stockUid);
  if (existing.stockUid !== resolved.asset.uid) throw new MidasApiError(M().wrongInstrument);
  if (!existing.showUpdate) throw new MidasApiError(updateNotAllowedMessage(existing, resolved.asset.symbol));
  const supported: UpdatableOrderType[] = ["LIMIT", "STOP", "STOP_LIMIT", "TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"];
  if (!supported.includes(existing.type)) throw new MidasApiError(M().updateUnsupported(existing.type));
  await prepareOrder(account.accountUid, {
    stockUid: resolved.asset.uid,
    side: existing.side,
    type: existing.type,
    orderUid: existing.uid,
  });

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
    market: resolved.kind === "fund" ? M().marketFund : M().marketStock,
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
          : { ok: false, reason: M().valuesChanged };
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
      if (!data.updateOrder?.order?.uid) throw new MidasApiError(M().noUpdateId);
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

/** cancel_order: emrin iptali, masaüstü onayından sonra. */
export async function cancelOrder(orderUid: string, symbol: string) {
  const account = await accountFor("TR");
  const existing = await orderDetail(account.accountUid, orderUid);
  const resolved = await exactOrderAsset(symbol, existing.stockUid);
  if (existing.stockUid !== resolved.asset.uid) throw new MidasApiError(M().wrongInstrument);
  if (!existing.eligibleToCancel) throw new MidasApiError(M().notCancelable);
  const oldValues = stableOrderValues(existing);
  const quantity = Number(existing.quantity) || 0;
  const preview: ApprovalPreview = {
    action: "CANCEL",
    instrumentName: resolved.snapshot.name,
    symbol: resolved.asset.symbol,
    market: resolved.kind === "fund" ? M().marketFund : M().marketStock,
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
        const latest = await orderDetail(account.accountUid, orderUid);
        return latest.eligibleToCancel && JSON.stringify(stableOrderValues(latest)) === JSON.stringify(oldValues)
          ? { ok: true }
          : { ok: false, reason: M().cancelChanged };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
    mutate: async () => {
      const cancelVars = { accountUid: account.accountUid, orderId: orderUid, stockUid: resolved.asset.uid };
      const data = await gql("CancelOrder", Q.CANCEL_ORDER, cancelVars);
      if (!data.cancelOrder?.order?.uid) throw new MidasApiError(M().noCancelId);
      const [pendingResult, detailResult] = await Promise.allSettled([
        pendingForAsset(account.accountUid, resolved.asset.uid),
        orderDetail(account.accountUid, orderUid),
      ]);
      const stillPending = pendingResult.status === "fulfilled"
        ? pendingResult.value.find((item) => item.uid === orderUid) ?? null
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
