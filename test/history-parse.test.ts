import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asciiLabel,
  assignYears,
  dateFromDetailRows,
  parseMoney,
  parseTurkishDate,
  sideFromTitle,
  splitTimestamp,
  statusFromText,
  symbolFromTitle,
} from "../src/history-parse.js";

test("parseMoney Türkçe ve ondalık noktalı tutarları para birimiyle okur", () => {
  assert.deepEqual(parseMoney("₺1.001,09"), { amount: 1001.09, currency: "TRY" });
  assert.deepEqual(parseMoney("₺3.800,00"), { amount: 3800, currency: "TRY" });
  assert.deepEqual(parseMoney("$6,48"), { amount: 6.48, currency: "USD" });
  assert.deepEqual(parseMoney("₺317.40"), { amount: 317.4, currency: "TRY" });
  assert.deepEqual(parseMoney("₺1.250"), { amount: 1250, currency: "TRY" });
  assert.equal(parseMoney("Ücretsiz"), null);
  assert.equal(parseMoney(null), null);
});

test("parseTurkishDate liste ve ayrıntı biçimlerini işler", () => {
  assert.deepEqual(parseTurkishDate("17 Eylül"), { day: 17, month: 9, year: null, time: null });
  assert.deepEqual(parseTurkishDate("31 Ağustos 2026, 15:57:57"), { day: 31, month: 8, year: 2026, time: "15:57:57" });
  assert.deepEqual(parseTurkishDate("1 ŞUBAT 2025"), { day: 1, month: 2, year: 2025, time: null });
  assert.equal(parseTurkishDate("Bekliyor"), null);
});

test("assignYears geriye doğru yıl sınırını geçer ve yakın gelecekteki valör tarihlerine izin verir", () => {
  const today = new Date(2026, 0, 10);
  const rows = ["12 Ocak", "3 Ocak", "28 Aralık", "2 Kasım", "5 Ocak", "30 Aralık"].map(parseTurkishDate);
  assert.deepEqual(assignYears(rows, today), [
    "2026-01-12",
    "2026-01-03",
    "2025-12-28",
    "2025-11-02",
    "2025-01-05",
    "2024-12-30",
  ]);
  const sept = new Date(2026, 8, 18);
  assert.deepEqual(assignYears([parseTurkishDate("20 Eylül"), parseTurkishDate("24 Ağustos")], sept), [
    "2026-09-20",
    "2026-08-24",
  ]);
  assert.deepEqual(assignYears([parseTurkishDate("20 Aralık")], sept), ["2025-12-20"]);
});

test("durum, yön, sembol ve etiket yardımcıları", () => {
  assert.equal(statusFromText("Reddedildi"), "REJECTED");
  assert.equal(statusFromText("İptal edildi"), "CANCELLED");
  assert.equal(statusFromText("Bekliyor"), "PENDING");
  assert.equal(statusFromText("₺132,40 / ₺85,40"), null);
  assert.equal(sideFromTitle("TCELL piyasa alış"), "BUY");
  assert.equal(sideFromTitle("USD/TL satış"), "SELL");
  assert.equal(sideFromTitle("TCELL kâr al, zarar durdur"), null);
  assert.equal(symbolFromTitle("ORDER", "TP2 fon alış"), "TP2");
  assert.equal(symbolFromTitle("DIVIDEND", "SPY temettü"), "SPY");
  assert.equal(symbolFromTitle("JOURNAL_DEPOSIT", "TL aktarma"), null);
  assert.equal(asciiLabel("USD/TL alış"), "usdtry alis");
  assert.equal(asciiLabel("kâr al, zarar durdur"), "kar al zarar durdur");
  assert.deepEqual(splitTimestamp("2026-09-17 15:48:06"), { date: "2026-09-17", time: "15:48:06" });
});

test("dateFromDetailRows gerçekleşme ve işlem tarihlerini tercih eder", () => {
  assert.deepEqual(
    dateFromDetailRows({ "Emir tarihi": "17 Eylül 2026, 15:48:05", "Gerçekleşme tarihi": "17 Eylül 2026, 15:48:06" }),
    { date: "2026-09-17", time: "15:48:06" }
  );
  assert.deepEqual(dateFromDetailRows({ "Temettü tarihi": "18 Eylül 2026", "Temettü ödemesi": "30 Ekim 2026" }), {
    date: "2026-09-18",
    time: null,
  });
  assert.equal(dateFromDetailRows({ Durum: "Ödendi" }), null);
});
