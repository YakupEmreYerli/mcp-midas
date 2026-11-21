[Türkçe](METHOD.md) · **English**

# How get_technicals computes its numbers

Where each number returned by `get_technicals` comes from and how it is calculated. Code:
[`src/indicators.ts`](src/indicators.ts) (pure calculations),
[`src/technicals.ts`](src/technicals.ts) (assembling the summary),
[`src/vwap.ts`](src/vwap.ts) and [`src/inflation.ts`](src/inflation.ts) (real VWAP).
`test/indicators.test.ts` checks the calculations against small series worked out by
hand.

## Data

The symbol is first resolved to an instrument through Midas search, then candles are pulled
from Atlas chart data (the `chart` query): daily (`1d`, the default) or weekly (`1w`), up to
400 candles, extended-hours trades included. Candles are ordered oldest to newest. The tool
returns an error for an instrument with fewer than 30 candles of history. Below, "price"
means the close of the last candle.

Prices are rounded to 4 decimal places, percentages to 2. An indicator without enough data
comes back as `null`.

## Trend (`trend`)

| Field | Calculation |
| --- | --- |
| `sma20`, `sma50`, `sma200` | Arithmetic mean of the last 20/50/200 closes |
| `ema20` | 20-day exponential moving average, α = 2/21; seeded with the mean of the first 20 closes |
| `priceVsSma50Pct`, `priceVsSma200Pct` | Percentage difference between price and the average |
| `goldenCross` | `true` if SMA50 > SMA200 |

## Momentum (`momentum`)

- **RSI(14)**, Wilder's method: average gain and average loss over the first 14 changes,
  then each day `(previous × 13 + new) / 14`. RSI = 100 − 100 / (1 + gain/loss); 100 if
  there are no losses at all. `rsiZone`: below 30 is `oversold`, above 70 is `overbought`,
  anything in between is `neutral`.
- **MACD(12, 26, 9)**: the difference between the 12- and 26-day EMAs is the line, the
  9-day EMA of the line is the signal; histogram = line − signal. Needs at least 35 closes.
  `macdCrossover` is `bullish` when the histogram is zero or above, `bearish` when below.
- **`roc20Pct`**: percentage change in price from the close 20 candles earlier.

## Volatility (`volatility`)

- **ATR(14)**: the true range of each candle is
  `max(high − low, |high − previous close|, |low − previous close|)`; ATR is the **simple**
  average of the last 14 true ranges (not Wilder smoothing). `atrPctOfPrice` is ATR as a
  percentage of price.
- **`annualizedPct`**: sample standard deviation of the last 30 daily log returns
  × √252 × 100. Weekly candles use the same multiplier; the number is then not annual and
  is only for comparison.
- **Bollinger(20, 2)**: the middle band is SMA20, the upper and lower bands are ± 2 × (the
  population standard deviation of the last 20 closes). `bollingerPosition` says where the
  price sits relative to the bands: `above_upper`, `upper_half`, `lower_half`,
  `below_lower`.

## Levels (`levels`)

- **52 weeks**: the highest high and lowest low of the last 252 candles, and the price's
  percentage distance from each.
- **Support and resistance**: a candle is a swing high if its high is above the highs of
  all three candles on each side, and a swing low if its low is below all of their lows.
  Swing highs (or swing lows) within 2% of the price of each other are merged into one
  level; `touches` is the number of pivots at that level. Levels above the price are
  resistance (nearest first), levels below are support; at most four of each are returned,
  and the nearest one is also given in `nearestSupport` / `nearestResistance`.

## Volume (`volume`)

The volume of the last candle, the average volume of the last 20 candles (rounded to a
whole number), and the percentage difference between the last volume and that average.

## Real VWAP (`realVwap`)

Volume-weighted average price: VWAP = Σ(typical price × volume) / Σ volume, where typical
price = (high + low + close) / 3. In the real version, each candle's typical price is first
restated in lira as of the last candle's date using CPI. Under high inflation, 100 TL paid a
year ago is not the same as 100 TL today, so nominal VWAP understates the average cost.

Three windows are calculated: the last 252 candles (`year1`), the last 504 candles
(`year2`) and every available candle (`all`; with the default 400 candles, `year2` is in
practice the whole series too). For each window:

| Field | Meaning |
| --- | --- |
| `realVwap`, `nominalVwap` | VWAP with and without inflation adjustment |
| `realStdev`, `bands` | Volume-weighted standard deviation of real prices around the VWAP; bands at ±1, ±2, ±3 deviations |
| `premiumPct` | Percentage difference between price and real VWAP; negative means below the average real cost of those who traded in the window |
| `zScore` | The same difference, in standard deviations |
| `volumeAbovePricePct` | Share of volume whose real typical price is above today's price: roughly, the volume bought in that window that is still at a loss |

It also returns the close from 252 candles ago in today's lira (`realPriceOneYearAgo`) and
the one-year change in real and nominal terms. A window shorter than 20 candles, or with
zero volume, returns `null`.

**CPI data.** [`src/inflation.ts`](src/inflation.ts) builds a price level by chaining the
monthly CPI changes published by TurkStat (TÜİK) (the CBRT (TCMB) "Tüketici Fiyatları"
(Consumer Prices) table, from January 2023 onward). Each month's level is placed at the
middle of the month, and days in between are interpolated linearly. Months after the last
one in the table are estimated from the average monthly increase of the last six months;
each newly published month has to be added to the table. The tests check that the chain
matches the annual rates TurkStat published (32.87% and 29.77%).

## Limits

- The indicators come from price and volume alone; they say nothing about the value of the
  company or fund. Analysis guide:
  [`docs/analiz-kurallari.en.md`](docs/analiz-kurallari.en.md).
- When the market is closed, the last candle shows the last session.
- No output is investment advice.
