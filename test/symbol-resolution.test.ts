import assert from "node:assert/strict";
import { test } from "node:test";
import {
  candidateSummary,
  needsPositions,
  pickInstrument,
  type HeldInstrument,
  type SearchCandidate,
} from "../src/symbol-resolution.js";

// Sahte arama sonuçları: aynı "GTM" sembolünü taşıyan bir ABD hissesi ve bir TEFAS fonu.
const ZOOMINFO: SearchCandidate = {
  uid: "us-gtm",
  symbol: "GTM",
  title: "ZoomInfo Technologies",
  subtitle: "NASDAQ",
  country: "US",
  type: "MARKET_INSTRUMENTS",
};
const GTM_FUND: SearchCandidate = {
  uid: "tr-gtm",
  symbol: "GTM",
  title: "Örnek Portföy Fonu",
  subtitle: "TEFAS",
  country: "TR",
  type: "INVESTMENT_FUNDS",
};
const GTMX: SearchCandidate = { ...ZOOMINFO, uid: "us-gtmx", symbol: "GTMX", title: "Başka" };
const HELD_GTM: HeldInstrument = { symbol: "GTM", assetUid: "tr-gtm", name: "GTM", market: "TR" };

test("tek birebir eşleşme pozisyona bakmadan seçilir", () => {
  const pick = pickInstrument("thyao", [{ ...GTM_FUND, uid: "thy", symbol: "THYAO" }], { mode: "read" });
  assert.equal(pick.asset.uid, "thy");
  assert.equal(pick.resolvedBy, "exact");
  assert.equal(needsPositions("THYAO", [{ ...GTM_FUND, symbol: "THYAO" }], { mode: "read" }), false);
});

test("okumada belirsizlik ya da ipucu pozisyon ister, emir yolu her zaman ister", () => {
  assert.equal(needsPositions("GTM", [ZOOMINFO, GTM_FUND], { mode: "read" }), true);
  assert.equal(needsPositions("GTM", [ZOOMINFO], { mode: "read", market: "TR" }), true);
  assert.equal(needsPositions("GTM", [ZOOMINFO], { mode: "order" }), true);
});

test("GTM: birden çok birebir eşleşmede pozisyondaki enstrüman seçilir (ilk sonuç ZoomInfo olsa da)", () => {
  for (const mode of ["read", "order"] as const) {
    const pick = pickInstrument("GTM", [ZOOMINFO, GTMX, GTM_FUND], { mode, positions: [HELD_GTM] });
    assert.equal(pick.asset.uid, "tr-gtm", mode);
    assert.equal(pick.asset.title, "Örnek Portföy Fonu", "ad arama sonucundan gelir");
    assert.equal(pick.resolvedBy, "position");
    assert.deepEqual(pick.candidates.map((c) => c.uid), ["us-gtm", "tr-gtm"]);
  }
});

test("aramada tek eşleşme çıkıp kullanıcı aynı sembolde başka enstrüman tutuyorsa pozisyon seçilir", () => {
  const pick = pickInstrument("GTM", [ZOOMINFO], { mode: "order", positions: [HELD_GTM] });
  assert.equal(pick.asset.uid, "tr-gtm");
  assert.equal(pick.resolvedBy, "position");
  assert.equal(pick.candidates.length, 2);
});

test("arama boşsa aynı sembollü pozisyona düşülür, o da yoksa bulunamadı hatası", () => {
  assert.equal(pickInstrument("GTM", [], { mode: "order", positions: [HELD_GTM] }).asset.uid, "tr-gtm");
  assert.throws(() => pickInstrument("GTM", [], { mode: "read", positions: [] }), /enstrüman bulunamadı/);
});

test("yazma aracında pozisyon ayırt etmiyorsa tahmin yapılmaz, adaylar hata olarak listelenir", () => {
  assert.throws(
    () => pickInstrument("gtm", [ZOOMINFO, GTM_FUND], { mode: "order", positions: [] }),
    (error: Error) => {
      assert.match(error.message, /tahmin yapılmadı/);
      assert.match(error.message, /ZoomInfo Technologies \(NASDAQ\); piyasa: ABD, ülke: US, tip: MARKET_INSTRUMENTS/);
      assert.match(error.message, /Örnek Portföy Fonu \(TEFAS\); piyasa: TEFAS, ülke: TR, tip: INVESTMENT_FUNDS/);
      return true;
    }
  );
});

test("yazma aracında piyasa ipucu belirsizliği çözmez", () => {
  assert.throws(
    () => pickInstrument("GTM", [ZOOMINFO, GTM_FUND], { mode: "order", market: "TR", positions: [] }),
    /tahmin yapılmadı/
  );
});

test("güncelleme/iptalde emrin kendi enstrümanı seçilir", () => {
  const pick = pickInstrument("GTM", [ZOOMINFO, GTM_FUND], { mode: "order", preferUid: "tr-gtm", positions: [] });
  assert.equal(pick.asset.uid, "tr-gtm");
  assert.equal(pick.resolvedBy, "order");
});

test("emrin enstrümanı adaylarda yoksa tercih yok sayılır ve tahmin yapılmaz", () => {
  assert.throws(
    () => pickInstrument("GTM", [ZOOMINFO, GTM_FUND], { mode: "order", preferUid: "baska", positions: [] }),
    /tahmin yapılmadı/
  );
});

test("okumada piyasa ipucu seçer, ipucu yoksa ilk birebir eşleşme adaylarla döner", () => {
  const hinted = pickInstrument("GTM", [ZOOMINFO, GTM_FUND], { mode: "read", market: "TR", positions: [] });
  assert.equal(hinted.asset.uid, "tr-gtm");
  assert.equal(hinted.resolvedBy, "market");

  const fallback = pickInstrument("GTM", [ZOOMINFO, GTM_FUND], { mode: "read", positions: [] });
  assert.equal(fallback.asset.uid, "us-gtm");
  assert.equal(fallback.resolvedBy, "first-exact");
  assert.deepEqual(
    candidateSummary(fallback.candidates).map((c) => [c.name, c.market, c.country]),
    [
      ["ZoomInfo Technologies", "ABD", "US"],
      ["Örnek Portföy Fonu", "TEFAS", "TR"],
    ]
  );
});

test("birebir eşleşme yoksa okuma bulanık ilk sonuca düşer", () => {
  const pick = pickInstrument("GT", [GTMX, ZOOMINFO], { mode: "read" });
  assert.equal(pick.asset.uid, "us-gtmx");
  assert.equal(pick.resolvedBy, "fuzzy");
});
