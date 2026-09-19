import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as midas from "./midas.js";
import { getTechnicals, getCandles } from "./technicals.js";
import { getTransactions, getTransactionFilters } from "./history.js";
import { ordersEnabled } from "./tool-flags.js";
import { candidateSummary } from "./symbol-resolution.js";

export interface ServerOptions {
  /**
   * place_order, update_order ve cancel_order araçlarını kaydeder. Varsayılanı
   * `MIDAS_ORDERS_ENABLED=1`'dir; bu bayrak yoksa emir araçları hiç var olmaz.
   */
  ordersEnabled?: boolean;
}

/**
 * Okuma araçlarıyla, açıksa emir araçlarıyla birlikte yeni bir MCP sunucusu kurar. Tarayıcı
 * oturumu modül düzeyinde tektir; stdio (tek istemci) ve HTTP servisi (istek başına bir
 * sunucu) aynı oturumlu Chromium'u paylaşır.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const withOrders = options.ordersEnabled ?? ordersEnabled();
  const server = new McpServer({ name: "midas-mcp", version: "0.1.0" });

  /** Araçlar JSON metni döner; model yapılandırılmış, belirsizliği olmayan veri alır. */
  function json(value: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  }

  function failure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Hata: ${message}` }], isError: true };
  }

  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<unknown>,
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
    .describe(
      "Aynı sembolü birden çok enstrüman taşıyorsa (ör. GTM: TEFAS fonu ve NASDAQ hissesi) ülke/piyasa ipucu. " +
        "Verilmezse önce pozisyondaki enstrüman, yoksa Midas'ın ilk birebir eşleşmesi seçilir ve adaylar sonuçta listelenir."
    );
  const WRITING = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

  tool(
    "get_portfolio",
    "Portföyün TL cinsinden toplam değerini, günlük kâr/zararı ve Türkiye (BIST/TRY) ile ABD (USD) hesaplarının nakit bakiyesini ve alım gücünü döner.",
    {},
    () => midas.getPortfolio(),
    READ_ONLY
  );

  tool(
    "get_assets",
    "Tüm açık pozisyonları (BIST hisseleri, ABD hisseleri, TEFAS fonları, ABD opsiyonları) adet, ortalama maliyet, güncel fiyat, piyasa değeri ve kâr/zararla listeler.",
    {},
    () => midas.getPositions(),
    READ_ONLY
  );

  tool(
    "get_asset_price",
    "Bir sembolün son işlem fiyatını önceki kapanış, yüzde değişim ve seansın açık olup olmadığıyla birlikte döner.",
    {
      symbol: z.string().describe("Sembol, ör. TUCLK, THYAO, AAPL"),
      currency: z
        .enum(["TRY", "USD"])
        .optional()
        .describe("Fiyatı enstrümanın kendi para birimi yerine bu para birimine çevir"),
      market,
    },
    ({ symbol, currency, market }) => midas.getAssetPrice(symbol, currency, market),
    READ_ONLY
  );

  tool(
    "get_asset_info",
    "Bir enstrümanın tanıtıcı bilgilerini (tam ad, pazar, açıklama) güncel fiyatıyla ve Atlas enstrüman sayfası " +
      "istatistikleriyle döner: TEFAS fonlarında risk seviyesi (riskLevel), valör, vergi, yıllık yönetim ücreti ve yatırımcı " +
      "sayısı; hisselerde günlük fiyat bandı, 52 haftalık aralık ve oranlar. Sembol araması bulanıktır: exactMatch ve name alanlarını kontrol et; " +
      "ambiguousSymbol true ise candidates listesindeki diğer enstrümanlar için market parametresini kullan.",
    { symbol: z.string().describe("Aranacak sembol ya da şirket adı"), market },
    ({ symbol, market }) => midas.getAssetInfo(symbol, market),
    READ_ONLY
  );

  tool(
    "get_technicals",
    "Bir sembolün fiyat geçmişinden tam bir teknik analiz özeti hesaplar: " +
      "RSI(14), SMA/EMA (20/50/200), MACD, Bollinger bantları, ATR ve yıllıklandırılmış oynaklık, " +
      "52 haftalık aralık, dönüş noktalarından (swing pivot) destek/direnç seviyeleri ve hacmin ortalamaya oranı. " +
      "Bunları kendi analizinde girdi olarak kullan; hiçbiri yatırım tavsiyesi değildir.",
    {
      symbol: z.string().describe("Analiz edilecek sembol, ör. TUCLK, ASELS, THYAO"),
      interval: z
        .enum(["1d", "1w"])
        .optional()
        .describe("Mum aralığı; varsayılan günlük (1d)"),
      market,
    },
    ({ symbol, interval, market }) => getTechnicals(symbol, interval ?? "1d", undefined, market),
    READ_ONLY
  );

  tool(
    "get_chart",
    "Bir sembolün ham OHLCV mumlarını döner (açılış, en yüksek, en düşük, kapanış, hacim, zaman damgası). " +
      "Hesaplanmış göstergeler için get_technicals kullan; bunu yalnız ham seri gerektiğinde kullan.",
    {
      symbol: z.string().describe("Mumları alınacak sembol"),
      interval: z
        .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
        .optional()
        .describe("Mum aralığı; varsayılan günlük (1d)"),
      limit: z.number().int().positive().max(500).optional().describe("Mum sayısı (en çok 500)"),
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
    "Henüz gerçekleşmemiş emirleri emir kimlikleriyle listeler. symbol verilmezse tüm hesaplardaki (BIST, TEFAS, ABD) " +
      "bekleyen emirler tek çağrıda döner; symbol verilirse yalnız o enstrümanın emirleri.",
    { symbol: z.string().optional().describe("İsteğe bağlı sembol; tüm bekleyen emirler için boş bırak"), market },
    ({ symbol, market }) => midas.getPendingOrders(symbol, market),
    READ_ONLY
  );

  tool(
    "get_transactions",
    "Hesap hareketleri geçmişi (Atlas 'İşlem geçmişi'), en yeni önce: hisse/ETF/TEFAS fonu alış ve satışları, TL yatırma " +
      "ve çekme, döviz alış/satış, nema, stopaj, temettü, anında nakit. Her satırda tarih/saat, kategori, sembol, yön, emir " +
      "tipi, adet, ortalama fiyat, tutar, para birimi ve durum (COMPLETED, PENDING, CANCELLED, REJECTED, EXPIRED) bulunur. " +
      "Bekleyen satırlar her zaman dahildir. Varsayılan: son 30 gün.",
    {
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Başlangıç tarihi (dahil), YYYY-AA-GG (varsayılan: 30 gün önce)"),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Bitiş tarihi (dahil), YYYY-AA-GG (varsayılan: bugün)"),
      status: z.enum(["ALL", "COMPLETED", "PENDING"]).optional().describe("Varsayılan ALL"),
      filter: z
        .string()
        .optional()
        .describe(
          "Atlas kategori kimliği: orders, o_buy, o_sell, journal, j_try, j_usd, exchange, e_usd, interest, i_try, dividend, instant_cash, other. " +
            "Tam liste için get_transaction_filters"
        ),
      details: z
        .boolean()
        .optional()
        .describe("Her satırın ayrıntı sayfasını da getir (tam saat, kur, komisyon, banka…); satır başına bir ek istek"),
      limit: z.number().int().positive().max(500).optional().describe("Sayfa başına satır, varsayılan 100"),
      offset: z.number().int().min(0).optional().describe("Sayfalama için atlanacak satır sayısı"),
    },
    ({ from_date, to_date, status, filter, details, limit, offset }) =>
      getTransactions({ fromDate: from_date, toDate: to_date, status, filter, details, limit, offset }),
    READ_ONLY
  );

  tool(
    "get_transaction_filters",
    "get_transactions filtresi olarak kullanılabilecek Atlas işlem geçmişi kategori ağacını (id, name, parentId) listeler.",
    {},
    () => getTransactionFilters(),
    READ_ONLY
  );

  if (!withOrders) return server;

  tool(
    "place_order",
    "BIST hissesi için MARKET/LIMIT emri, eldeki BIST hissesi için kâr al/zarar durdur satış emri " +
      "(TAKE_PROFIT_AND_STOP_LOSS, TAKE_PROFIT, STOP_LOSS) ya da TEFAS fonu için DEMAND satış emri verir. " +
      "Kâr al/zarar durdur için side SELL, quantity ve take_profit_price ve/veya stop_loss_price ver; order_type verilmezse " +
      "verilen fiyatlardan çıkarılır. Midas'ın güncellemeye izin vermediği mevcut bir kâr al/zarar durdur emrini değiştirmek " +
      "için önce cancel_order ile iptal et, sonra bununla yeniden gir. Sembol birden çok enstrümanla eşleşirse pozisyondaki " +
      "enstrüman seçilir; pozisyon ayırt etmiyorsa tahmin yapılmaz, adaylar hata olarak döner. " +
      "Kabul edilen her istek yerel bir masaüstü onay penceresi açar; hiçbir şema argümanı onayı atlatamaz. " +
      "TEFAS alışı şimdilik reddedilir: Atlas paketinden PlaceOrderRequest'in tutar mı adet mi beklediği kanıtlanamadı.",
    {
      symbol: z.string().min(1).describe("Birebir Midas sembolü; bulanık eşleşme reddedilir"),
      side: z.enum(["BUY", "SELL"]),
      order_type: z
        .enum(["MARKET", "LIMIT", "DEMAND", "TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"])
        .optional(),
      quantity: z.number().positive().optional().describe("Hisse ya da fon payı adedi"),
      amount_try: z.number().positive().optional().describe("TL tutarı; istek alanı kanıtlandığında TEFAS alışı için ayrıldı"),
      limit_price: z.number().positive().optional().describe("LIMIT hisse emirlerinde zorunlu"),
      take_profit_price: z
        .number()
        .positive()
        .optional()
        .describe("Kâr alma fiyatı; güncel fiyatın üstünde olmalı (TAKE_PROFIT ve TAKE_PROFIT_AND_STOP_LOSS)"),
      stop_loss_price: z
        .number()
        .positive()
        .optional()
        .describe("Zarar durdurma fiyatı; güncel fiyatın altında olmalı (STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS)"),
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
    "Bekleyen bir emri zorunlu yerel masaüstü onayından sonra günceller. LIMIT, STOP, STOP_LIMIT, TAKE_PROFIT, " +
      "STOP_LOSS ve TAKE_PROFIT_AND_STOP_LOSS desteklenir; kâr al/zarar durdur için take_profit_price ve stop_loss_price kullan. " +
      "Midas emirde güncellemeye izin vermiyorsa (showUpdate: false; mevcut kâr al/zarar durdur emirlerinde görülür) " +
      "araç hata döner: emri cancel_order ile iptal edip place_order ile yeniden gir.",
    {
      order_id: z.string().min(1).describe("Bekleyen emrin uid değeri"),
      symbol: z.string().min(1).describe("Emre ait birebir sembol"),
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
    "Bekleyen bir emri, Midas'taki güncel OrderDetail bilgisini zorunlu yerel masaüstü onay penceresinde gösterdikten sonra iptal eder.",
    {
      order_id: z.string().min(1).describe("Bekleyen emrin uid değeri"),
      symbol: z.string().min(1).describe("Emre ait birebir sembol"),
    },
    ({ order_id, symbol }) => midas.cancelOrder(order_id, symbol),
    WRITING
  );

  return server;
}
