/**
 * GraphQL documents used by this server.
 *
 * These mirror the operations the Midas Atlas web app itself sends. Field
 * selections are trimmed to what the tools actually surface.
 */

export const PORTFOLIO_OVERVIEW = /* GraphQL */ `
  query GetPortfolioOverview(
    $memberUid: String!
    $currencyCode: CurrencyCode!
    $timeRange: ProfitLossTimeRange!
  ) {
    overviewV2(memberUid: $memberUid, currencyCode: $currencyCode, timeRange: $timeRange) {
      portfolioValue
      profitLosses {
        timeRange
        value
        percentage
      }
      accounts {
        accountUid
        assetVertical
        currency
        buyingPower
        cash
        withdrawableCash
      }
    }
  }
`;

export const ALL_POSITIONS = /* GraphQL */ `
  query OverviewAllPositions(
    $memberUid: String!
    $includeUsStocks: Boolean!
    $includeTrStocks: Boolean!
    $includeTrFunds: Boolean!
    $includeUsOptions: Boolean! = false
  ) {
    usStocks: overviewPositionsV2(
      memberUid: $memberUid
      assetVertical: US
      investmentType: MARKET_INSTRUMENTS
    ) @include(if: $includeUsStocks) {
      ...PositionFields
    }
    trStocks: overviewPositionsV2(
      memberUid: $memberUid
      assetVertical: TR
      investmentType: MARKET_INSTRUMENTS
    ) @include(if: $includeTrStocks) {
      ...PositionFields
    }
    trFunds: overviewPositionsV2(
      memberUid: $memberUid
      assetVertical: TR
      investmentType: INVESTMENT_FUNDS
    ) @include(if: $includeTrFunds) {
      ...PositionFields
    }
    usOptions: overviewPositionsV2(
      memberUid: $memberUid
      assetVertical: US
      investmentType: OPTIONS
    ) @include(if: $includeUsOptions) {
      ...PositionFields
    }
  }

  fragment PositionFields on OverviewPositionResponseV2 {
    accountUid
    assetUid
    assetVertical
    symbol
    displayName
    quantity
    blockageQuantity
    averageCost
    currency
    country
    instrumentType
    multiplier
    tradePriceV3 {
      price
      currency
      tradingSessionStatus
    }
  }
`;

export const SEARCH = /* GraphQL */ `
  query Search(
    $query: String!
    $searchItemTypes: [SearchItemType!]!
    $page: Int! = 0
    $size: Int! = 30
  ) {
    Search(query: $query, searchItemTypes: $searchItemTypes, page: $page, size: $size) {
      results {
        uid
        type
        ... on InstrumentSearchResultItem {
          symbol
          title
          subtitle
          country
        }
        ... on InvestmentFundSearchResultItem {
          symbol
          title
          subtitle
          country
        }
      }
    }
  }
`;

export const ASSET_SNAPSHOT = /* GraphQL */ `
  query GetAssetSnapshot($uid: String!, $currency: CurrencyCode) {
    asset(uid: $uid) {
      uid
      name
      investmentType
      currency
      tradePrice(currency: $currency) {
        price
        currency
        tradingSessionStatus
      }
      previousClosePrice(currency: $currency)
      orderFlowEnabled
    }
  }
`;

/**
 * Returns tradability context for one instrument: buying power, sellable shares,
 * allowed order types, the daily price band, and the default order validity date.
 */
export const PREPARE_ORDER = /* GraphQL */ `
  query PrepareOrder($accountUid: String!, $input: OrderPreparationRequest!) {
    orderPreparationV2(accountUid: $accountUid, input: $input) {
      acceptedOrderBases
      availableOrderTypes
      availableShares
      availableSharesDecoupled
      buyingPowerDecoupled
      country
      dayOrderRestricted
      defaultOrderBase
      isFractionable
      positionIntent
      fundPreparationDto {
        coefficient
        executionDate
        maxQuantity
        minAmount
        minBuyAmountBasedMargin
        minQuantity
      }
      priceRange(input: $input) {
        minPrice
        maxPrice
        fatFingerMinPrice
        fatFingerMaxPrice
      }
      validityPeriodDto {
        tradingRangeDto {
          validityPeriodCalendarItems {
            actionType
            isActive
            isSelected
            selectedOrderDate
            timeInForce
            title
          }
        }
      }
    }
  }
`;

export const PLACE_ORDER = /* GraphQL */ `
  mutation PlaceOrder($accountUid: String!, $request: PlaceOrderRequest!) {
    placeOrderV2(accountUid: $accountUid, input: $request) {
      order {
        uid
        accountUid
        assetName
        side
        type
        status
        statusDescription
        quantity
        limitPrice
        totalPrice
      }
    }
  }
`;

export const UPDATE_ORDER = /* GraphQL */ `
  mutation UpdateOrder(
    $accountUid: String!
    $orderUid: String!
    $stockUid: String
    $request: UpdateOrderRequest!
  ) {
    updateOrder(accountUid: $accountUid, orderUid: $orderUid, stockUid: $stockUid, input: $request) {
      order {
        uid
        status
        statusDescription
      }
    }
  }
`;

export const CANCEL_ORDER = /* GraphQL */ `
  mutation CancelOrder($accountUid: String!, $orderId: String!, $stockUid: String) {
    cancelOrder(accountUid: $accountUid, orderId: $orderId, stockUid: $stockUid) {
      order {
        uid
        status
        statusDescription
      }
    }
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

export const PENDING_ORDERS = /* GraphQL */ `
  query PendingOrders($accountUid: String!, $stockUid: String!) {
    pendingOrders(accountUid: $accountUid, stockUid: $stockUid) {
      orders {
        uid
        type
        side
        status
        quantity
        limitPrice
        stopPrice
        lossPrice
        profitPrice
        showCancel
        showUpdate
      }
    }
  }
`;

/**
 * Account activity list behind Atlas' "İşlem geçmişi" screen: orders, money transfers,
 * FX, fund interest, withholding tax, dividends. Rows are display-shaped (title, day and
 * month without year, formatted amount); structure comes from RECENT_ORDERS and
 * TRANSACTION_DETAIL. `selectedFilterPath` is the id chain from the filter tree root,
 * e.g. ["orders", "o_buy"]; a leaf id alone is rejected.
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

/** Detail sheet for one history row; `transactionDetailType` is the row's typeV2. */
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
 * Every pending order across all accounts plus the order history, with structured
 * quantity/price/amount fields. Needs no symbol, unlike PENDING_ORDERS.
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

/** Key/value stats shown on an instrument page (fund risk level, fees; stock ratios). */
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
