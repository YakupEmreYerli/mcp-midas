import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertExactResolvedSymbol,
  buildPlaceOrderRequest,
  buildUpdateOrderRequest,
  meaningfulPriceDrift,
  resolveTpslOrderType,
  tpslRate,
  updateNotAllowedMessage,
} from "../src/order-domain.js";

test("emir yolu bulanık arama sonucunu reddeder", () => {
  assert.throws(() => assertExactResolvedSymbol("VOO", "IOO"), /birebir eşleşmedi/);
  assert.doesNotThrow(() => assertExactResolvedSymbol(" thyao ", "THYAO"));
});

test("BIST MARKET hisse isteği bundle sözleşmesindeki alanları üretir", () => {
  assert.deepEqual(
    buildPlaceOrderRequest({
      kind: "stock",
      stockUid: "stock-1",
      side: "BUY",
      orderType: "MARKET",
      quantity: 7,
    }),
    { type: "MARKET", side: "BUY", stockUid: "stock-1", quantity: 7 }
  );
});

test("BIST LIMIT hisse isteği limit ve geçerlilik tarihini üretir", () => {
  assert.deepEqual(
    buildPlaceOrderRequest({
      kind: "stock",
      stockUid: "stock-1",
      side: "SELL",
      orderType: "LIMIT",
      quantity: 3,
      limitPrice: 122.5,
      endingDate: "2026-09-14",
    }),
    {
      type: "LIMIT",
      side: "SELL",
      stockUid: "stock-1",
      quantity: 3,
      limitPrice: 122.5,
      endingDate: "2026-09-14",
    }
  );
});

test("TEFAS fon satışı DEMAND ve adet ile gider", () => {
  assert.deepEqual(
    buildPlaceOrderRequest({
      kind: "fund",
      stockUid: "fund-1",
      side: "SELL",
      orderType: "DEMAND",
      quantity: 37,
    }),
    { type: "DEMAND", side: "SELL", stockUid: "fund-1", quantity: 37 }
  );
});

test("bundle alanı kanıtlanmayan TEFAS fon alışını reddeder", () => {
  assert.throws(
    () =>
      buildPlaceOrderRequest({
        kind: "fund",
        stockUid: "fund-1",
        side: "BUY",
        orderType: "DEMAND",
        amountTry: 1_000,
      }),
    /fon alışının.*doğrulanamadı/i
  );
});

test("TP/SL güncellemesi bundle'daki new alanlarını üretir", () => {
  assert.deepEqual(
    buildUpdateOrderRequest({
      orderType: "TAKE_PROFIT_AND_STOP_LOSS",
      quantity: 5,
      nominalPrice: 120,
      limitPrice: 122.5,
      stopPrice: 100.5,
    }),
    { newQuantity: 5, nominalPrice: 120, newLimitPrice: 122.5, newStopPrice: 100.5 }
  );
});

test("fiyat sapması yüzde 2 sınırında kabul, üstünde ret üretir", () => {
  assert.equal(meaningfulPriceDrift(100, 102), null);
  assert.match(meaningfulPriceDrift(100, 102.01) ?? "", /%2,01/);
  assert.match(meaningfulPriceDrift(0, 102) ?? "", /karşılaştırılamadı/);
});

test("kâr al + zarar durdur yerleştirme isteği Atlas TpslSellForm alanlarını üretir", () => {
  assert.deepEqual(
    buildPlaceOrderRequest({
      kind: "stock",
      stockUid: "tcell",
      side: "SELL",
      orderType: "TAKE_PROFIT_AND_STOP_LOSS",
      quantity: 5,
      takeProfitPrice: 122.5,
      stopLossPrice: 100.5,
      referencePrice: 110,
      endingDate: "2026-12-17",
    }),
    {
      type: "TAKE_PROFIT_AND_STOP_LOSS",
      side: "SELL",
      stockUid: "tcell",
      nominalPrice: 110,
      limitPrice: 122.5,
      profitPrice: 122.5,
      profitRate: 11.36,
      isProfitByRatio: false,
      stopPrice: 100.5,
      lossPrice: 100.5,
      lossRate: 8.64,
      isLossByRatio: false,
      endingDate: "2026-12-17",
      quantity: 5,
    }
  );
});

test("yalnız kâr al ve yalnız zarar durdur yalnız kendi bacağını taşır", () => {
  const base = { kind: "stock" as const, stockUid: "s", side: "SELL" as const, quantity: 2, referencePrice: 50 };
  assert.deepEqual(buildPlaceOrderRequest({ ...base, orderType: "TAKE_PROFIT", takeProfitPrice: 55 }), {
    type: "TAKE_PROFIT",
    side: "SELL",
    stockUid: "s",
    nominalPrice: 50,
    limitPrice: 55,
    profitPrice: 55,
    profitRate: 10,
    isProfitByRatio: false,
    quantity: 2,
  });
  assert.deepEqual(buildPlaceOrderRequest({ ...base, orderType: "STOP_LOSS", stopLossPrice: 45 }), {
    type: "STOP_LOSS",
    side: "SELL",
    stockUid: "s",
    nominalPrice: 50,
    stopPrice: 45,
    lossPrice: 45,
    lossRate: 10,
    isLossByRatio: false,
    quantity: 2,
  });
  assert.throws(
    () => buildPlaceOrderRequest({ ...base, orderType: "TAKE_PROFIT", takeProfitPrice: 55, stopLossPrice: 45 }),
    /TAKE_PROFIT emrinde stop_loss_price verilmez/
  );
});

test("kâr al/zarar durdur isteği yön, eksik bacak ve fiyat tarafını doğrular", () => {
  const base = {
    kind: "stock" as const,
    stockUid: "s",
    orderType: "TAKE_PROFIT_AND_STOP_LOSS" as const,
    quantity: 5,
    referencePrice: 100,
  };
  assert.throws(
    () => buildPlaceOrderRequest({ ...base, side: "BUY", takeProfitPrice: 110, stopLossPrice: 90 }),
    /yalnızca satış/
  );
  assert.throws(() => buildPlaceOrderRequest({ ...base, side: "SELL", takeProfitPrice: 110 }), /stop_loss_price/);
  assert.throws(
    () => buildPlaceOrderRequest({ ...base, side: "SELL", takeProfitPrice: 99, stopLossPrice: 90 }),
    /Kâr alma fiyatı.*üstünde/
  );
  assert.throws(
    () => buildPlaceOrderRequest({ ...base, side: "SELL", takeProfitPrice: 110, stopLossPrice: 100 }),
    /Zarar durdurma fiyatı.*altında/
  );
  assert.throws(
    () => buildPlaceOrderRequest({ ...base, side: "SELL", referencePrice: undefined, takeProfitPrice: 110, stopLossPrice: 90 }),
    /güncel fiyat/
  );
  assert.throws(
    () =>
      buildPlaceOrderRequest({
        kind: "fund",
        stockUid: "f",
        side: "SELL",
        orderType: "TAKE_PROFIT_AND_STOP_LOSS",
        quantity: 1,
        takeProfitPrice: 2,
        stopLossPrice: 1,
        referencePrice: 1.5,
      }),
    /yalnızca DEMAND/
  );
});

test("TP/SL oranı Atlas yuvarlama ve kırpma kuralını izler", () => {
  assert.equal(tpslRate("profit", 102.4, 122.5), 19.63);
  assert.equal(tpslRate("loss", 102.4, 100.5), 1.86);
  assert.equal(tpslRate("loss", 10, 0.01), 99);
  assert.equal(tpslRate("profit", 1, 20), 999);
  assert.equal(tpslRate("profit", 10, 9), 0);
});

test("fiyatlardan emir tipi çıkarılır", () => {
  assert.equal(resolveTpslOrderType(10, 5), "TAKE_PROFIT_AND_STOP_LOSS");
  assert.equal(resolveTpslOrderType(10, undefined), "TAKE_PROFIT");
  assert.equal(resolveTpslOrderType(undefined, 5), "STOP_LOSS");
  assert.equal(resolveTpslOrderType(), null);
});

test("showUpdate:false mesajı iptal edip yeniden girme yolunu tarif eder", () => {
  const message = updateNotAllowedMessage(
    { uid: "dbff-1", type: "TAKE_PROFIT_AND_STOP_LOSS", side: "SELL", quantity: 5, eligibleToCancel: true },
    "tcell"
  );
  assert.match(message, /showUpdate: false/);
  assert.match(message, /cancel_order \(order_id: "dbff-1", symbol: "TCELL"\)/);
  assert.match(
    message,
    /place_order \(symbol: "TCELL", side: "SELL", order_type: "TAKE_PROFIT_AND_STOP_LOSS", quantity: 5, take_profit_price: <yeni>, stop_loss_price: <yeni>\)/
  );
  assert.match(message, /ayrı masaüstü onayı/);

  const stuck = updateNotAllowedMessage({ uid: "x", type: "DEMAND", eligibleToCancel: false }, "YIT");
  assert.match(stuck, /iptal edilebilir olduğunu da belirtmiyor/);
  assert.doesNotMatch(stuck, /cancel_order/);
});
