[Türkçe](analiz-kurallari.md) · **English**

# Stock and fund analysis: agent guide

Follow this guide when the user asks you to "analyse", "look at", "screen" or "compare" a
stock or fund. The goal is an honest picture that helps the user decide; the decision is
the user's. This guide is not a scoring formula. It is not investment advice.

## Sources

| What | Where from |
| --- | --- |
| Last price, previous close, session status | `get_asset_price` |
| Instrument profile; for funds, risk level, fees, settlement period (valör); for stocks, ratios | `get_asset_info` |
| Indicators (trend, momentum, volatility, levels, volume, real VWAP) | `get_technicals`; field meanings in [METHOD.en.md](../METHOD.en.md) |
| Raw candles | `get_chart` (only if you need something the indicators don't give) |
| The user's position, cost basis, pending orders | `get_assets`, `get_pending_orders` |
| Financial statements, KAP (Public Disclosure Platform) filings, sector and macro news | Web; every item with its source and date |

The Midas tools don't provide company financials. Fundamental analysis needs web sources;
data you can't find is not filled in with estimates but written as "not found".

## Data rules

- **A date on every number.** Prices and indicators are tied to the `asOf` time of the tool
  output, financials to their reporting period (e.g. 9M 2026), news to its publication day.
- **Account for inflation.** With annual inflation around 30% in lira, 30% nominal growth
  means standing still in real terms. When you interpret growth and returns, state the real
  figure; for the price's long-term position, the `realVwap` fields mean more than nominal
  VWAP.
- **Keep facts and interpretation apart.** Numbers from a tool or source go in one place,
  your interpretation in another; the reader must never confuse the two.
- **Say when data is missing.** If there is no data for a section, don't skip the section;
  write that the data is missing and how much that affects the conclusion.

## What to look at

1. **The business or the fund.** What it does, where its revenue comes from, and how
   profitability, debt and cash flow have moved in recent periods. For a fund: what it
   invests in, its risk level, fees, size and number of investors.
2. **Valuation.** Multiples (P/E, P/B, EV/EBITDA) compared with similar companies and with
   the company's own history. Technical levels are no substitute for valuation.
3. **Price behaviour.** From the `get_technicals` output: trend direction (SMA50/200 and the
   price's distance from them), momentum (RSI, MACD), volatility (ATR, annualized
   volatility), nearest support and resistance, volume relative to its average, and where
   the price sits relative to real VWAP.
4. **Risks and events.** Rights issues (bedelli sermaye artırımı), ongoing losses, measures
   by the SPK (Capital Markets Board of Türkiye) or the exchange, thin trading volume,
   problems in management or ownership structure; upcoming earnings, dividend and general
   meeting dates.

## How to write the result

Short and readable. Suggested order:

```
{SYMBOL} · {name} · {date and time}  [low confidence: {reason}]  (if needed)

Status      price, daily change, session
Business    2-4 sentences, with sources
Valuation   multiples and what they are compared with
Technicals  trend · momentum · volatility · support/resistance · volume · real VWAP position
Risks       bullet points
Events      upcoming dates

Assessment  3-5 sentences: strengths and weaknesses, what they mean over which
            time horizon, what would change the view
```

If the user is asking about a position they hold, you may add the profit/loss against their
cost basis and a reasonable stop-loss distance based on ATR; these are given as information.
If several symbols were requested, start with a one-line table for each, then the details.

## Working rules

- **Analysis doesn't place orders.** Don't call `place_order`, `update_order` or
  `cancel_order` during an analysis, however negative the result and even if the user holds
  the stock. An order is placed only on a separate instruction in which the user explicitly
  states the symbol, side and quantity, and every order still goes through desktop approval
  and the `MAX_ORDER_VALUE_TRY` cap.
- **No urgency.** Don't use language like "sell now" or "don't miss out". For someone holding
  the stock, frame a weak picture as "you might consider reducing under this condition".
- **Say if the market is closed.** The technical indicators then show the last session.
- **Ambiguous symbol.** If the tool output contains `ambiguousSymbol` or `candidates`, state
  which instrument was analysed; if needed, query again with the `market` parameter (TR or
  US).
- Personal portfolio data and personal strategy are not written to the repository.
