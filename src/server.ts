import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as midas from "./midas.js";
import { getTechnicals, getCandles } from "./technicals.js";
import { getTransactions, getTransactionFilters } from "./history.js";
import { ordersEnabled } from "./tool-flags.js";
import { candidateSummary } from "./symbol-resolution.js";
import { session } from "./session.js";
import { config } from "./config.js";
import { accountLine, serverInstructions, serverName } from "./instance.js";
import { defineMessages, language } from "./i18n.js";

/** Sunucunun bildirdiği sürüm; package.json'dan okunur (src/ ve dist/ aynı derinlikte), elle eskimez. */
export const SERVER_VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** Araç ve argüman açıklamaları. Araç, argüman ve JSON alan adları dilden bağımsızdır. */
const D = defineMessages(
  {
    errorPrefix: "Hata",
    market:
      "Aynı sembolü birden çok enstrüman taşıyorsa (ör. GTM: TEFAS fonu ve NASDAQ hissesi) ülke/piyasa ipucu. " +
        "Verilmezse önce pozisyondaki enstrüman, yoksa Midas'ın ilk birebir eşleşmesi seçilir ve adaylar sonuçta listelenir.",
    sessionStatus:
      "Midas oturumunun açık olup olmadığını ve refresh_token bitişini döner. Hiçbir koşulda giriş başlatmaz, " +
      "telefona onay bildirimi göndermez. status: logged-in, logged-out ya da starting (giriş sürüyor). " +
      "Diğer araçlar oturum kapalıyken giriş başlatır; giriş istenmiyorsa önce bunu çağır.",
    portfolio:
      "Portföyün TL cinsinden toplam değerini, günlük kâr/zararı ve Türkiye (BIST/TRY) ile ABD (USD) hesaplarının nakit bakiyesini ve alım gücünü döner.",
    assets:
      "Tüm açık pozisyonları (BIST hisseleri, ABD hisseleri, TEFAS fonları, ABD opsiyonları) adet, ortalama maliyet, güncel fiyat, piyasa değeri ve kâr/zararla listeler.",
    price:
      "Bir sembolün son işlem fiyatını önceki kapanış, yüzde değişim ve seansın açık olup olmadığıyla birlikte döner.",
    priceSymbol:
      "Sembol, ör. TUCLK, THYAO, AAPL",
    priceCurrency:
      "Fiyatı enstrümanın kendi para birimi yerine bu para birimine çevir",
    info:
      "Bir enstrümanın tanıtıcı bilgilerini (tam ad, pazar, açıklama) güncel fiyatıyla ve Atlas enstrüman sayfası " +
      "istatistikleriyle döner: TEFAS fonlarında risk seviyesi (riskLevel), valör, vergi, yıllık yönetim ücreti ve yatırımcı " +
      "sayısı; hisselerde günlük fiyat bandı, 52 haftalık aralık ve oranlar. Sembol araması bulanıktır: exactMatch ve name alanlarını kontrol et; " +
      "ambiguousSymbol true ise candidates listesindeki diğer enstrümanlar için market parametresini kullan.",
    infoSymbol:
      "Aranacak sembol ya da şirket adı",
    technicals:
      "Bir sembolün fiyat geçmişinden tam bir teknik analiz özeti hesaplar: " +
      "RSI(14), SMA/EMA (20/50/200), MACD, Bollinger bantları, ATR ve yıllıklandırılmış oynaklık, " +
      "52 haftalık aralık, dönüş noktalarından (swing pivot) destek/direnç seviyeleri ve hacmin ortalamaya oranı. " +
      "Bunları kendi analizinde girdi olarak kullan; hiçbiri yatırım tavsiyesi değildir.",
    technicalsSymbol:
      "Analiz edilecek sembol, ör. TUCLK, ASELS, THYAO",
    interval:
      "Mum aralığı; varsayılan günlük (1d)",
    chart:
      "Bir sembolün ham OHLCV mumlarını döner (açılış, en yüksek, en düşük, kapanış, hacim, zaman damgası). " +
      "Hesaplanmış göstergeler için get_technicals kullan; bunu yalnız ham seri gerektiğinde kullan.",
    chartSymbol:
      "Mumları alınacak sembol",
    chartLimit:
      "Mum sayısı (en çok 500)",
    pending:
      "Henüz gerçekleşmemiş emirleri emir kimlikleriyle listeler. symbol verilmezse tüm hesaplardaki (BIST, TEFAS, ABD) " +
      "bekleyen emirler tek çağrıda döner; symbol verilirse yalnız o enstrümanın emirleri.",
    pendingSymbol:
      "İsteğe bağlı sembol; tüm bekleyen emirler için boş bırak",
    transactions:
      "Hesap hareketleri geçmişi (Atlas 'İşlem geçmişi'), en yeni önce: hisse/ETF/TEFAS fonu alış ve satışları, TL yatırma " +
      "ve çekme, döviz alış/satış, nema, stopaj, temettü, anında nakit. Her satırda tarih/saat, kategori, sembol, yön, emir " +
      "tipi, adet, ortalama fiyat, tutar, para birimi ve durum (COMPLETED, PENDING, CANCELLED, REJECTED, EXPIRED) bulunur. " +
      "Bekleyen satırlar her zaman dahildir. Varsayılan: son 30 gün.",
    fromDate:
      "Başlangıç tarihi (dahil), YYYY-AA-GG (varsayılan: 30 gün önce)",
    toDate:
      "Bitiş tarihi (dahil), YYYY-AA-GG (varsayılan: bugün)",
    status:
      "Varsayılan ALL",
    filter:
      "Atlas kategori kimliği: orders, o_buy, o_sell, journal, j_try, j_usd, exchange, e_usd, interest, i_try, dividend, instant_cash, other. " +
            "Tam liste için get_transaction_filters",
    details:
      "Her satırın ayrıntı sayfasını da getir (tam saat, kur, komisyon, banka…); satır başına bir ek istek",
    txLimit:
      "Sayfa başına satır, varsayılan 100",
    offset:
      "Sayfalama için atlanacak satır sayısı",
    filters:
      "get_transactions filtresi olarak kullanılabilecek Atlas işlem geçmişi kategori ağacını (id, name, parentId) listeler.",
    place:
      "BIST hissesi için MARKET/LIMIT emri, eldeki BIST hissesi için kâr al/zarar durdur satış emri " +
      "(TAKE_PROFIT_AND_STOP_LOSS, TAKE_PROFIT, STOP_LOSS) ya da eldeki TEFAS fonu için DEMAND satış emri (adetle, quantity) verir. " +
      "TEFAS fon alımı Atlas'ta yok, reddedilir; fon alışı Midas telefon uygulamasından yapılır. " +
      "Kâr al/zarar durdur için side SELL, quantity ve take_profit_price ve/veya stop_loss_price ver; order_type verilmezse " +
      "verilen fiyatlardan çıkarılır. Midas'ın güncellemeye izin vermediği mevcut bir kâr al/zarar durdur emrini değiştirmek " +
      "için önce cancel_order ile iptal et, sonra bununla yeniden gir. Sembol birden çok enstrümanla eşleşirse pozisyondaki " +
      "enstrüman seçilir; pozisyon ayırt etmiyorsa tahmin yapılmaz, adaylar hata olarak döner. " +
      "Kabul edilen her istek yerel bir masaüstü onay penceresi açar; hiçbir şema argümanı onayı atlatamaz.",
    placeSymbol:
      "Birebir Midas sembolü; bulanık eşleşme reddedilir",
    quantity:
      "Hisse ya da fon payı adedi",
    amountTry:
      "Kullanılmıyor: TEFAS fon alımı Atlas'ta yok",
    limitPrice:
      "LIMIT hisse emirlerinde zorunlu",
    takeProfit:
      "Kâr alma fiyatı; güncel fiyatın üstünde olmalı (TAKE_PROFIT ve TAKE_PROFIT_AND_STOP_LOSS)",
    stopLoss:
      "Zarar durdurma fiyatı; güncel fiyatın altında olmalı (STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS)",
    update:
      "Bekleyen bir emri zorunlu yerel masaüstü onayından sonra günceller. LIMIT, STOP, STOP_LIMIT, TAKE_PROFIT, " +
      "STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS desteklenir; kâr al/zarar durdur için take_profit_price ve stop_loss_price kullan. " +
      "Midas emirde güncellemeye izin vermiyorsa (showUpdate: false; mevcut kâr al/zarar durdur emirlerinde görülür) " +
      "araç hata döner: emri cancel_order ile iptal edip place_order ile yeniden gir.",
    orderId:
      "Bekleyen emrin uid değeri",
    orderSymbol:
      "Emre ait birebir sembol",
    cancel:
      "Bekleyen bir emri, Midas'taki güncel OrderDetail bilgisini zorunlu yerel masaüstü onay penceresinde gösterdikten sonra iptal eder.",
  },
  {
    errorPrefix: "Error",
    market:
      "Country/market hint when several instruments share the symbol (e.g. GTM: a TEFAS fund and a NASDAQ stock). " +
      "Without it, the instrument you hold wins; otherwise Midas's first exact match is used and the candidates are listed in the result.",
    sessionStatus:
      "Returns whether the Midas session is open and when the refresh_token expires. Never starts a login and never " +
      "sends an approval notification to the phone. status: logged-in, logged-out or starting (login in progress). " +
      "The other tools start a login when the session is closed; call this first if you don't want that.",
    portfolio:
      "Returns the portfolio's total value in TRY, the day's profit/loss, and the cash balance and buying power of the Turkey (BIST/TRY) and US (USD) accounts.",
    assets:
      "Lists all open positions (BIST stocks, US stocks, TEFAS funds, US options) with quantity, average cost, current price, market value and profit/loss.",
    price:
      "Returns a symbol's last trade price with the previous close, percent change and whether the session is open.",
    priceSymbol:
      "Symbol, e.g. TUCLK, THYAO, AAPL",
    priceCurrency:
      "Convert the price to this currency instead of the instrument's own",
    info:
      "Returns an instrument's profile (full name, market, description) with its current price and the Atlas instrument page " +
      "statistics: for TEFAS funds the risk level (riskLevel), settlement days, tax, annual management fee and number of " +
      "investors; for stocks the daily price band, 52-week range and ratios. Symbol search is fuzzy: check the exactMatch and name fields; " +
      "if ambiguousSymbol is true, use the market parameter to reach the other instruments in candidates.",
    infoSymbol:
      "Symbol or company name to search for",
    technicals:
      "Computes a full technical analysis summary from a symbol's price history: " +
      "RSI(14), SMA/EMA (20/50/200), MACD, Bollinger Bands, ATR and annualized volatility, " +
      "the 52-week range, support/resistance levels from swing pivots, and volume relative to its average. " +
      "Use these as inputs to your own analysis; none of them is investment advice.",
    technicalsSymbol:
      "Symbol to analyze, e.g. TUCLK, ASELS, THYAO",
    interval:
      "Candle interval; defaults to daily (1d)",
    chart:
      "Returns a symbol's raw OHLCV candles (open, high, low, close, volume, timestamp). " +
      "For computed indicators use get_technicals; use this only when you need the raw series.",
    chartSymbol:
      "Symbol to fetch candles for",
    chartLimit:
      "Number of candles (at most 500)",
    pending:
      "Lists orders that haven't filled yet, with their order IDs. Without symbol, returns the pending orders of all accounts " +
      "(BIST, TEFAS, US) in one call; with symbol, only that instrument's orders.",
    pendingSymbol:
      "Optional symbol; leave empty for all pending orders",
    transactions:
      "Account activity history (Atlas \"Transaction history\"), newest first: stock/ETF/TEFAS fund buys and sells, TRY deposits " +
      "and withdrawals, currency buys/sells, interest, withholding tax, dividends, instant cash. Each row has the date/time, category, symbol, side, order " +
      "type, quantity, average price, amount, currency and status (COMPLETED, PENDING, CANCELLED, REJECTED, EXPIRED). " +
      "Pending rows are always included. Default: the last 30 days.",
    fromDate:
      "Start date (inclusive), YYYY-MM-DD (default: 30 days ago)",
    toDate:
      "End date (inclusive), YYYY-MM-DD (default: today)",
    status:
      "Defaults to ALL",
    filter:
      "Atlas category ID: orders, o_buy, o_sell, journal, j_try, j_usd, exchange, e_usd, interest, i_try, dividend, instant_cash, other. " +
            "See get_transaction_filters for the full list",
    details:
      "Also fetch each row's detail page (exact time, exchange rate, commission, bank…); one extra request per row",
    txLimit:
      "Rows per page, default 100",
    offset:
      "Number of rows to skip for pagination",
    filters:
      "Lists the Atlas transaction history category tree (id, name, parentId) you can use as the get_transactions filter.",
    place:
      "Places a MARKET/LIMIT order for a BIST stock, a take-profit/stop-loss sell order for a BIST stock you hold " +
      "(TAKE_PROFIT_AND_STOP_LOSS, TAKE_PROFIT, STOP_LOSS), or a DEMAND sell order for a TEFAS fund you hold (by quantity). " +
      "Atlas can't buy TEFAS funds, so fund buys are rejected; buy funds in the Midas phone app. " +
      "For take profit/stop loss, give side SELL, quantity and take_profit_price and/or stop_loss_price; without order_type " +
      "it is inferred from the prices given. To change an existing take-profit/stop-loss order that Midas won't let you update, " +
      "cancel it with cancel_order first, then place it again with this tool. If the symbol matches several instruments, the one you " +
      "hold is used; if your positions don't tell them apart, nothing is guessed and the candidates come back as an error. " +
      "Every accepted request opens a local desktop approval window; no schema argument can skip the approval.",
    placeSymbol:
      "Exact Midas symbol; fuzzy matches are rejected",
    quantity:
      "Number of shares or fund units",
    amountTry:
      "Unused: Atlas can't buy TEFAS funds",
    limitPrice:
      "Required for LIMIT stock orders",
    takeProfit:
      "Take-profit price; must be above the current price (TAKE_PROFIT and TAKE_PROFIT_AND_STOP_LOSS)",
    stopLoss:
      "Stop-loss price; must be below the current price (STOP_LOSS and TAKE_PROFIT_AND_STOP_LOSS)",
    update:
      "Updates a pending order after a mandatory local desktop approval. Supports LIMIT, STOP, STOP_LIMIT, TAKE_PROFIT, " +
      "STOP_LOSS and TAKE_PROFIT_AND_STOP_LOSS; for take profit/stop loss use take_profit_price and stop_loss_price. " +
      "If Midas doesn't allow updating the order (showUpdate: false; seen on existing take-profit/stop-loss orders), " +
      "the tool returns an error: cancel the order with cancel_order and place it again with place_order.",
    orderId:
      "The pending order's uid",
    orderSymbol:
      "The order's exact symbol",
    cancel:
      "Cancels a pending order after showing its current OrderDetail from Midas in the mandatory local desktop approval window.",
  }
);


export interface ServerOptions {
  /**
   * place_order, update_order ve cancel_order araçlarını kaydeder. Varsayılanı
   * `MIDAS_ORDERS_ENABLED=1`'dir; bu bayrak yoksa emir araçları hiç var olmaz.
   */
  ordersEnabled?: boolean;
  /**
   * Hesap etiketi (`MIDAS_ACCOUNT_LABEL`). Verilirse sunucu adında ve yönergesinde görünür,
   * her araç sonucuna "Hesap: <etiket>" satırı ayrı bir parça olarak eklenir.
   */
  accountLabel?: string | null;
}

/**
 * Okuma araçlarıyla, açıksa emir araçlarıyla birlikte yeni bir MCP sunucusu kurar. Tarayıcı
 * oturumu modül düzeyinde tektir; stdio (tek istemci) ve HTTP servisi (istek başına bir
 * sunucu) aynı oturumlu Chromium'u paylaşır.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const withOrders = options.ordersEnabled ?? ordersEnabled();
  const label = options.accountLabel === undefined ? config.accountLabel : options.accountLabel;
  const lang = language();
  const d = D(lang);
  const instructions = serverInstructions(label, lang);
  const server = new McpServer({ name: serverName(label), version: SERVER_VERSION }, instructions ? { instructions } : undefined);

  // Hesap satırı JSON'dan sonra ayrı bir metin parçasıdır: ilk parça her zaman saf JSON kalır,
  // sonucu ayrıştıran istemciler (content[0]) etkilenmez.
  const accountPart = label ? [{ type: "text" as const, text: accountLine(label, lang) }] : [];

  /** Araçlar JSON metni döner; model yapılandırılmış, belirsizliği olmayan veri alır. */
  function json(value: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }, ...accountPart] };
  }

  function failure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `${d.errorPrefix}: ${message}` }, ...accountPart], isError: true };
  }

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
  ) {
    server.registerTool(name, { description, inputSchema, annotations }, (async (args: any) => {
      try {
        return json(await handler(args));
      } catch (error) {
        return failure(error);
      }
    }) as any);
  }

  const READ_ONLY = { readOnlyHint: true, openWorldHint: true };

  const market = z
    .enum(["TR", "US"])
    .optional()
    .describe(d.market);
  const WRITING = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

  tool(
    "get_session_status",
    d.sessionStatus,
    {},
    async () => {
      const result = await session.status();
      const limit = result.expiry ? (result.expiry.refreshTokenExp ?? result.expiry.refreshExpiry) : null;
      return {
        ...(label ? { account: label } : {}),
        ...result,
        refreshExpiresAt: limit === null ? null : new Date(limit).toISOString(),
      };
    },
    { readOnlyHint: true, openWorldHint: false }
  );

  tool(
    "get_portfolio",
    d.portfolio,
    {},
    () => midas.getPortfolio(),
    READ_ONLY
  );

  tool(
    "get_assets",
    d.assets,
    {},
    () => midas.getPositions(),
    READ_ONLY
  );

  tool(
    "get_asset_price",
    d.price,
    {
      symbol: z.string().describe(d.priceSymbol),
      currency: z
        .enum(["TRY", "USD"])
        .optional()
        .describe(d.priceCurrency),
      market,
    },
    ({ symbol, currency, market }) => midas.getAssetPrice(symbol, currency, market),
    READ_ONLY
  );

  tool(
    "get_asset_info",
    d.info,
    { symbol: z.string().describe(d.infoSymbol), market },
    ({ symbol, market }) => midas.getAssetInfo(symbol, market),
    READ_ONLY
  );

  tool(
    "get_technicals",
    d.technicals,
    {
      symbol: z.string().describe(d.technicalsSymbol),
      interval: z
        .enum(["1d", "1w"])
        .optional()
        .describe(d.interval),
      market,
    },
    ({ symbol, interval, market }) => getTechnicals(symbol, interval ?? "1d", undefined, market),
    READ_ONLY
  );

  tool(
    "get_chart",
    d.chart,
    {
      symbol: z.string().describe(d.chartSymbol),
      interval: z
        .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
        .optional()
        .describe(d.interval),
      limit: z.number().int().positive().max(500).optional().describe(d.chartLimit),
      market,
    },
    async ({ symbol, interval, limit, market }) => {
      const asset = await midas.resolveSymbol(symbol, { market });
      const candles = await getCandles(asset.uid, interval ?? "1d", limit ?? 200);
      return {
        symbol: asset.symbol,
        interval: interval ?? "1d",
        count: candles.length,
        ...(asset.candidates.length > 1 ? { candidates: candidateSummary(asset.candidates) } : {}),
        candles,
      };
    },
    READ_ONLY
  );

  tool(
    "get_pending_orders",
    d.pending,
    { symbol: z.string().optional().describe(d.pendingSymbol), market },
    ({ symbol, market }) => midas.getPendingOrders(symbol, market),
    READ_ONLY
  );

  tool(
    "get_transactions",
    d.transactions,
    {
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(d.fromDate),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe(d.toDate),
      status: z.enum(["ALL", "COMPLETED", "PENDING"]).optional().describe(d.status),
      filter: z
        .string()
        .optional()
        .describe(d.filter),
      details: z
        .boolean()
        .optional()
        .describe(d.details),
      limit: z.number().int().positive().max(500).optional().describe(d.txLimit),
      offset: z.number().int().min(0).optional().describe(d.offset),
    },
    ({ from_date, to_date, status, filter, details, limit, offset }) =>
      getTransactions({ fromDate: from_date, toDate: to_date, status, filter, details, limit, offset }),
    READ_ONLY
  );

  tool(
    "get_transaction_filters",
    d.filters,
    {},
    () => getTransactionFilters(),
    READ_ONLY
  );

  if (!withOrders) return server;

  tool(
    "place_order",
    d.place,
    {
      symbol: z.string().min(1).describe(d.placeSymbol),
      side: z.enum(["BUY", "SELL"]),
      order_type: z
        .enum(["MARKET", "LIMIT", "DEMAND", "TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"])
        .optional(),
      quantity: z.number().positive().optional().describe(d.quantity),
      amount_try: z.number().positive().optional().describe(d.amountTry),
      limit_price: z.number().positive().optional().describe(d.limitPrice),
      take_profit_price: z
        .number()
        .positive()
        .optional()
        .describe(d.takeProfit),
      stop_loss_price: z
        .number()
        .positive()
        .optional()
        .describe(d.stopLoss),
    },
    ({ symbol, side, order_type, quantity, amount_try, limit_price, take_profit_price, stop_loss_price }) =>
      midas.placeOrder({
        symbol,
        side,
        orderType: order_type,
        quantity,
        amountTry: amount_try,
        limitPrice: limit_price,
        takeProfitPrice: take_profit_price,
        stopLossPrice: stop_loss_price,
      }),
    WRITING
  );

  tool(
    "update_order",
    d.update,
    {
      order_id: z.string().min(1).describe(d.orderId),
      symbol: z.string().min(1).describe(d.orderSymbol),
      new_quantity: z.number().positive().optional(),
      new_limit_price: z.number().positive().optional(),
      new_stop_price: z.number().positive().optional(),
      take_profit_price: z.number().positive().optional(),
      stop_loss_price: z.number().positive().optional(),
    },
    ({ order_id, symbol, new_quantity, new_limit_price, new_stop_price, take_profit_price, stop_loss_price }) =>
      midas.updateOrder({
        orderId: order_id,
        symbol,
        newQuantity: new_quantity,
        newLimitPrice: new_limit_price,
        newStopPrice: new_stop_price,
        takeProfitPrice: take_profit_price,
        stopLossPrice: stop_loss_price,
      }),
    WRITING
  );

  tool(
    "cancel_order",
    d.cancel,
    {
      order_id: z.string().min(1).describe(d.orderId),
      symbol: z.string().min(1).describe(d.orderSymbol),
    },
    ({ order_id, symbol }) => midas.cancelOrder(order_id, symbol),
    WRITING
  );

  return server;
}
