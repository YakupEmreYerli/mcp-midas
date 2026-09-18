import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertExactResolvedSymbol,
  buildPlaceOrderRequest,
  buildUpdateOrderRequest,
  meaningfulPriceDrift,
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
