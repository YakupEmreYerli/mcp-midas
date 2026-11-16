/**
 * Sunucunun Midas Atlas geçidine gönderdiği GraphQL belgeleri.
 *
 * İşlem adları ve kök alanlar Atlas web uygulamasının kullandıklarıyla aynıdır (geçit
 * yönlendirmeyi kök alana göre yapar); alan seçimleri araçların döndürdüğü alanlarla
 * sınırlıdır.
 */

/** Toplam portföy değeri, dönem kâr/zararı ve piyasa (TR/US) başına hesaplar. */
export const PORTFOLIO_SUMMARY = /* GraphQL */ `
  query GetPortfolioOverview($memberUid: String!, $currencyCode: CurrencyCode!, $timeRange: ProfitLossTimeRange!) {
    overviewV2(memberUid: $memberUid, currencyCode: $currencyCode, timeRange: $timeRange) {
      portfolioValue
      profitLosses { timeRange value percentage }
      accounts { accountUid assetVertical currency buyingPower cash withdrawableCash }
    }
  }
`;

/**
 * Dört pozisyon grubu tek istekte: BIST hisseleri, TEFAS fonları, ABD hisseleri, ABD
 * opsiyonları. İlk seçim takma ad olduğundan çağıran kök alanı (`overviewPositionsV2`)
 * açıkça vermelidir.
 */
export const HOLDINGS = /* GraphQL */ `
  query OverviewAllPositions($memberUid: String!) {
    bist: overviewPositionsV2(memberUid: $memberUid, assetVertical: TR, investmentType: MARKET_INSTRUMENTS) { ...Holding }
    tefas: overviewPositionsV2(memberUid: $memberUid, assetVertical: TR, investmentType: INVESTMENT_FUNDS) { ...Holding }
    usEquity: overviewPositionsV2(memberUid: $memberUid, assetVertical: US, investmentType: MARKET_INSTRUMENTS) { ...Holding }
    usOption: overviewPositionsV2(memberUid: $memberUid, assetVertical: US, investmentType: OPTIONS) { ...Holding }
  }
  fragment Holding on OverviewPositionResponseV2 {
    accountUid assetUid assetVertical symbol displayName quantity averageCost currency multiplier
    tradePriceV3 { price currency tradingSessionStatus }
  }
`;

/** Sembol ya da ad araması; hisse/ETF ve yatırım fonu sonuçları aynı alanlarla. */
export const INSTRUMENT_SEARCH = /* GraphQL */ `
  query Search($query: String!, $searchItemTypes: [SearchItemType!]!, $page: Int!, $size: Int!) {
    Search(query: $query, searchItemTypes: $searchItemTypes, page: $page, size: $size) {
      results {
        uid type
        ... on InstrumentSearchResultItem { symbol title subtitle country }
        ... on InvestmentFundSearchResultItem { symbol title subtitle country }
      }
    }
  }
`;

/** Tek enstrümanın adı, türü, son fiyatı, önceki kapanışı ve emre açık olup olmadığı. */
export const INSTRUMENT_QUOTE = /* GraphQL */ `
  query GetAssetSnapshot($uid: String!, $currency: CurrencyCode) {
    asset(uid: $uid) {
      uid name investmentType currency orderFlowEnabled
      tradePrice(currency: $currency) { price currency tradingSessionStatus }
      previousClosePrice(currency: $currency)
    }
  }
`;

/**
 * Bir enstrümanın işlem bağlamını döner: alım gücü, satılabilir adet, izin verilen emir
 * tipleri, günlük fiyat bandı ve varsayılan emir geçerlilik tarihi.
 */
export const PREPARE_ORDER = /* GraphQL */ `
  query PrepareOrder($accountUid: String!, $input: OrderPreparationRequest!) {
    orderPreparationV2(accountUid: $accountUid, input: $input) {
      acceptedOrderBases availableOrderTypes availableShares availableSharesDecoupled buyingPowerDecoupled
      country dayOrderRestricted defaultOrderBase isFractionable positionIntent
      fundPreparationDto { coefficient executionDate maxQuantity minAmount minBuyAmountBasedMargin minQuantity }
      priceRange(input: $input) { minPrice maxPrice fatFingerMinPrice fatFingerMaxPrice }
      validityPeriodDto {
        tradingRangeDto { validityPeriodCalendarItems { actionType isActive isSelected selectedOrderDate timeInForce title } }
      }
    }
  }
`;

export const PLACE_ORDER = /* GraphQL */ `
  mutation PlaceOrder($accountUid: String!, $request: PlaceOrderRequest!) {
    placeOrderV2(accountUid: $accountUid, input: $request) {
      order { uid accountUid assetName side type status statusDescription quantity limitPrice totalPrice }
    }
  }
`;

export const UPDATE_ORDER = /* GraphQL */ `
  mutation UpdateOrder($accountUid: String!, $orderUid: String!, $stockUid: String, $request: UpdateOrderRequest!) {
    updateOrder(accountUid: $accountUid, orderUid: $orderUid, stockUid: $stockUid, input: $request) {
      order { uid status statusDescription }
    }
  }
`;

export const CANCEL_ORDER = /* GraphQL */ `
  mutation CancelOrder($accountUid: String!, $orderId: String!, $stockUid: String) {
    cancelOrder(accountUid: $accountUid, orderId: $orderId, stockUid: $stockUid) { order { uid status statusDescription } }
  }
`;

export const ORDER_DETAIL = /* GraphQL */ `
  query OrderDetail($accountUid: String!, $orderId: String!) {
    orderDetail(accountUid: $accountUid, orderId: $orderId) {
      assetName
      country
      currency
      eligibleToCancel
      showUpdate
      filledAveragePrice
      filledQuantity
      limitPrice
      lossPrice
      profitPrice
      quantity
      notional
      side
      status
      statusDescription
      stopPrice
      totalPrice
      type
      uid
      stockUid
      underlyingInstrumentSymbol
      investmentType
      positionIntent
    }
  }
`;

/** Bir hesapta tek enstrümanın bekleyen emirleri. */
export const OPEN_ORDERS_FOR_INSTRUMENT = /* GraphQL */ `
  query PendingOrders($accountUid: String!, $stockUid: String!) {
    pendingOrders(accountUid: $accountUid, stockUid: $stockUid) {
      orders { uid type side status quantity limitPrice stopPrice lossPrice profitPrice showCancel showUpdate }
    }
  }
`;

/**
 * Atlas "İşlem geçmişi" ekranının arkasındaki hesap hareketleri listesi: emirler, para
 * transferleri, döviz, nema, stopaj, temettü. Satırlar görüntüleme biçimindedir (başlık,
 * yılsız gün ve ay, biçimlendirilmiş tutar); yapı RECENT_ORDERS ve TRANSACTION_DETAIL'dan
 * gelir. `selectedFilterPath`, filtre ağacının kökünden başlayan kimlik zinciridir, ör.
 * ["orders", "o_buy"]; tek başına yaprak kimliği reddedilir.
 */
export const TRANSACTION_HISTORY = /* GraphQL */ `
  query TempTransactionHistory(
    $memberUid: String!
    $status: TransactionStatus
    $selectedFilterPath: [String!]
    $page: Int
    $size: Int
  ) {
    tempTransactionHistory(
      memberUid: $memberUid
      status: $status
      selectedFilterPath: $selectedFilterPath
      page: $page
      size: $size
    ) {
      hasMore
      page
      pageSize
      items {
        uid
        accountUid
        type
        typeV2
        detail {
          title
          titleDescription {
            description
            subDescription {
              text
            }
          }
          trailing {
            ... on ListDetailTrailingText {
              text
            }
            ... on ListDetailTrailingTag {
              tagText
            }
          }
        }
      }
    }
  }
`;

export const TRANSACTION_FILTER_TREE = /* GraphQL */ `
  query TransactionHistoryFilterTree {
    transactionHistoryFilterTree {
      filters {
        id
        name
        parentId
        leaf
      }
    }
  }
`;

/** Bir geçmiş satırının ayrıntı sayfası; `transactionDetailType` satırın typeV2 değeridir. */
export const TRANSACTION_DETAIL = /* GraphQL */ `
  query TempDetailPage(
    $accountUid: String!
    $memberUid: String!
    $transactionDetailType: String!
    $uid: String!
  ) {
    tempDetailPage(
      accountUid: $accountUid
      memberUid: $memberUid
      transactionDetailType: $transactionDetailType
      uid: $uid
    ) {
      subHeader {
        title
      }
      timeline {
        title
        subTitle
        state
      }
      items {
        ...DetailPageItem
      }
      sectionItems {
        title
        items {
          ...DetailPageItem
        }
      }
    }
  }

  fragment DetailPageTrailing on TRDListInfoHorizontalTrailing {
    ... on TRDListInfoHorizontalTrailingText {
      text
    }
    ... on TRDListInfoHorizontalTrailingTag {
      tagText
    }
  }

  fragment DetailPageRow on TRDListInfoHorizontal {
    title
    trailing {
      ...DetailPageTrailing
    }
  }

  fragment DetailPageItem on GenericDetailPageV3Items {
    ... on TRDListInfoHorizontal {
      ...DetailPageRow
    }
    ... on ListInfoDropdown {
      parent {
        ...DetailPageRow
      }
      children {
        title
        trailing {
          ...DetailPageTrailing
        }
      }
    }
  }
`;

const RECENT_ORDER_FIELDS = `
  accountUid
  description
  status
  subDescription
  symbol
  timestamp
  title
  trailingDetail
  type
  uid
  transactionDetails {
    __typename
    ... on OrderDetails {
      country
      createdAt
      currency
      filledAveragePrice
      filledQuantity
      investmentType
      clientOrderType
      limitPrice
      notional
      quantity
      side
      stockUid
      stopPrice
      totalPrice
      type
    }
  }
`;

/**
 * Tüm hesaplardaki bekleyen emirler ve emir geçmişi, yapılandırılmış adet/fiyat/tutar
 * alanlarıyla. OPEN_ORDERS_FOR_INSTRUMENT'ın aksine sembol gerektirmez.
 */
export const RECENT_ORDERS = /* GraphQL */ `
  query RecentOrdersV2($memberUid: String!, $page: Int!, $size: Int!) {
    recentOrdersV2(memberUid: $memberUid, page: $page, size: $size) {
      error
      pendingOrders {
        ${RECENT_ORDER_FIELDS}
      }
      orderHistory {
        ${RECENT_ORDER_FIELDS}
      }
    }
  }
`;

/** Enstrüman sayfasında gösterilen anahtar/değer istatistikleri (fon risk seviyesi, ücretler; hisse oranları). */
export const INSTRUMENT_OVERVIEW = /* GraphQL */ `
  query getInstrumentOverview($uid: String!) {
    instrumentOverviewSection(uid: $uid) {
      stats {
        items {
          key
          value
        }
      }
      digestDetail {
        direction
        comment
        completedAgo
      }
    }
  }
`;
