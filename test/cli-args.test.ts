import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MIDAS_LANG = "tr";
const { parseArgs, parseNumber } = await import("../src/cli/args.js");

test("konum argümanları ve bayraklar ayrılır", () => {
  const parsed = parseArgs(["price", "THYAO", "--currency", "USD", "--json"]);
  assert.deepEqual(parsed.positionals, ["price", "THYAO"]);
  assert.equal(parsed.flags.currency, "USD");
  assert.equal(parsed.flags.json, true);
});

test("--ad=değer biçimi ve --hesap eşi", () => {
  const parsed = parseArgs(["--hesap=anne", "portfolio"]);
  assert.equal(parsed.flags.account, "anne");
  assert.deepEqual(parsed.positionals, ["portfolio"]);
});

test("değer isteyen bayrak değersiz kalırsa hata", () => {
  assert.throws(() => parseArgs(["price", "THYAO", "--currency"]), /--currency/);
  assert.throws(() => parseArgs(["buy", "X", "1", "--tp", "--confirm"]), /--tp/);
});

test("bilinmeyen bayrak hatadır, yanlış yazılmış bayrak sessizce geçmez", () => {
  assert.throws(() => parseArgs(["buy", "THYAO", "1", "--confim"]), /--confim/);
  assert.throws(() => parseArgs(["sell", "THYAO", "1", "--stop-loss", "5"]), /--stop-loss/);
});

test("değersiz bayrağa değer verilemez", () => {
  assert.throws(() => parseArgs(["buy", "X", "1", "--confirm=yes"]), /--confirm/);
});

test("sayılar yalnız noktalı ondalık kabul eder", () => {
  assert.equal(parseNumber("12.5", "--limit"), 12.5);
  assert.equal(parseNumber("3", "adet"), 3);
  for (const bad of ["12,5", "-1", "0", "abc", "1e3", ""]) {
    assert.throws(() => parseNumber(bad, "--limit"), /--limit/, bad);
  }
});
