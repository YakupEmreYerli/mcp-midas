import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MIDAS_LANG = "tr";
const { run } = await import("../src/cli/commands.js");

const WRITE_TOOLS = ["place_order", "update_order", "cancel_order"];
const READ_TOOLS = ["get_session_status", "get_portfolio", "get_assets", "get_asset_price", "get_asset_info", "get_pending_orders", "get_transactions"];

interface Call {
  name: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

/** Araç adına göre sabit cevap veren sahte istemci; her çağrıyı kaydeder. */
function fakeCaller(responses: Record<string, unknown>, tools = [...READ_TOOLS, ...WRITE_TOOLS]) {
  const calls: Call[] = [];
  let closed = false;
  const caller = {
    async call(name: string, args: Record<string, unknown>, options: { timeoutMs?: number } = {}) {
      calls.push({ name, args, timeoutMs: options.timeoutMs });
      const data = responses[name];
      if (data instanceof Error) return { data: data.message, raw: `Hata: ${data.message}`, accountLine: "Hesap: test", isError: true };
      return { data, raw: JSON.stringify(data), accountLine: "Hesap: test", isError: false };
    },
    async toolNames() {
      return tools;
    },
    async close() {
      closed = true;
    },
  };
  return { caller, calls, isClosed: () => closed };
}

async function cli(argv: string[], responses: Record<string, unknown> = {}, tools?: string[]) {
  const fake = fakeCaller(responses, tools);
  const out: string[] = [];
  const err: string[] = [];
  let connected = false;
  const code = await run(argv, {
    connect: async () => {
      connected = true;
      return fake.caller;
    },
    resolveTarget: () => ({ kind: "local" }),
    out: (t) => out.push(t),
    err: (t) => err.push(t),
  });
  return { code, out: out.join("\n"), err: err.join("\n"), calls: fake.calls, connected, closed: fake.isClosed() };
}

const THYAO_INFO = {
  symbol: "THYAO", name: "Türk Hava Yolları", price: 300, currency: "TRY", exactMatch: true,
  market: "BIST", investmentType: "STOCK",
};

const PENDING = {
  symbol: "THYAO",
  orders: [{ uid: "ord-1", symbol: "THYAO", side: "BUY", type: "LIMIT", quantity: 10, limitPrice: 290 }],
};

test("buy --confirm olmadan yalnız okuma aracı çağırır, önizleme basar", async () => {
  const r = await cli(["buy", "THYAO", "10", "--limit", "295.5"], { get_asset_info: THYAO_INFO });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.calls.map((c) => c.name), ["get_asset_info"]);
  assert.match(r.out, /ÖNİZLEME, gönderilmedi/);
  assert.match(r.out, /ALIŞ THYAO/);
  assert.match(r.out, /LIMIT/);
  assert.match(r.out, /--confirm/);
  assert.ok(r.closed);
});

test("sell, modify, cancel --confirm olmadan hiçbir yazma aracı çağırmaz", async () => {
  const responses = { get_asset_info: THYAO_INFO, get_pending_orders: PENDING };
  for (const argv of [
    ["sell", "THYAO", "5", "--tp", "350", "--sl", "250"],
    ["modify", "ord-1", "THYAO", "--limit", "295"],
    ["cancel", "ord-1", "THYAO"],
  ]) {
    const r = await cli(argv, responses);
    assert.equal(r.code, 0, `${argv.join(" ")}: ${r.err}`);
    for (const call of r.calls) assert.ok(!WRITE_TOOLS.includes(call.name), `${argv[0]} ${call.name} çağırmamalı`);
    assert.match(r.out, /ÖNİZLEME/);
  }
});

test("--json önizlemede de gönderilmediğini söyler ve yazma aracı çağırmaz", async () => {
  const r = await cli(["buy", "THYAO", "1", "--json"], { get_asset_info: THYAO_INFO });
  assert.equal(r.code, 0, r.err);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.sent, false);
  assert.equal(parsed.tool, "place_order");
  assert.ok(r.calls.every((c) => !WRITE_TOOLS.includes(c.name)));
});

test("--confirm yazma aracını bir kez, uzun zaman aşımıyla çağırır", async () => {
  const r = await cli(["buy", "THYAO", "10", "--limit", "295.5", "--confirm"], { place_order: { orderId: "new-1", status: "SENT" } });
  assert.equal(r.code, 0, r.err);
  const writes = r.calls.filter((c) => WRITE_TOOLS.includes(c.name));
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].args, { symbol: "THYAO", side: "BUY", quantity: 10, limit_price: 295.5 });
  assert.ok((writes[0].timeoutMs ?? 0) >= 300_000);
  assert.match(r.out, /Gönderildi/);
});

test("reddedilen emir hata koduyla döner ve yinelenmez", async () => {
  const r = await cli(["cancel", "ord-1", "THYAO", "--confirm"], { cancel_order: new Error("Emir onaylanmadı") });
  assert.equal(r.code, 1);
  assert.match(r.err, /onaylanmadı/);
  assert.equal(r.calls.filter((c) => c.name === "cancel_order").length, 1);
});

test("modify argümanları update_order şemasına çevrilir", async () => {
  const r = await cli(["modify", "ord-1", "THYAO", "--quantity", "3", "--tp", "400", "--confirm"], { update_order: { ok: true } });
  assert.equal(r.code, 0, r.err);
  const call = r.calls.find((c) => c.name === "update_order")!;
  assert.deepEqual(call.args, { order_id: "ord-1", symbol: "THYAO", new_quantity: 3, take_profit_price: 400 });
});

test("sunucuda emir araçları yoksa anlaşılır hata, önizleme bile kurulmaz", async () => {
  const r = await cli(["buy", "THYAO", "1"], { get_asset_info: THYAO_INFO }, READ_TOOLS);
  assert.equal(r.code, 1);
  assert.match(r.err, /emir araçları kapalı/);
  assert.equal(r.calls.length, 0);
});

test("birebir eşleşmeyen sembolde önizleme hata verir", async () => {
  const r = await cli(["buy", "THY", "1"], { get_asset_info: { ...THYAO_INFO, exactMatch: false } });
  assert.equal(r.code, 1);
  assert.match(r.err, /birebir eşleşmedi/);
});

test("modify'da emir bulunamazsa hata; değişiklik yoksa sunucuya gidilmez", async () => {
  const missing = await cli(["modify", "yok", "THYAO", "--limit", "1"], { get_pending_orders: PENDING });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /yok/);
  const empty = await cli(["modify", "ord-1", "THYAO"]);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /Değiştirilecek/);
  assert.equal(empty.connected, false);
});

test("hatalı sayı bağlanmadan reddedilir", async () => {
  const r = await cli(["buy", "THYAO", "10,5", "--confirm"]);
  assert.equal(r.code, 1);
  assert.equal(r.connected, false);
});

test("komuta ait olmayan seçenek reddedilir (price --confirm)", async () => {
  const r = await cli(["price", "THYAO", "--confirm"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /--confirm/);
  assert.equal(r.connected, false);
});

test("okuma komutu düz metin, --json ham JSON basar", async () => {
  const data = { portfolioValueTry: 1234.5, dayProfitLoss: { timeRange: "DAY", value: 10, percentage: 0.8 }, accounts: [] };
  const text = await cli(["portfolio"], { get_portfolio: data });
  assert.equal(text.code, 0);
  assert.match(text.out, /^Hesap: test\nPortföy: 1\.234,50 TRY/);
  const json = await cli(["portfolio", "--json"], { get_portfolio: data });
  assert.deepEqual(JSON.parse(json.out), data);
});

test("price argümanları araca aynen gider", async () => {
  const r = await cli(["price", "AAPL", "--currency", "TRY", "--market", "US"], {
    get_asset_price: { symbol: "AAPL", price: 7000, currency: "TRY", previousClose: 6900, changePercent: 1.45 },
  });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.calls[0], { name: "get_asset_price", args: { symbol: "AAPL", currency: "TRY", market: "US" }, timeoutMs: undefined });
  assert.match(r.out, /AAPL: 7\.000,0000 TRY \(\+1,45%\)/);
});

test("bilinmeyen komut ve eksik argüman", async () => {
  assert.equal((await cli(["sat", "X"])).code, 1);
  const r = await cli(["price"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /Kullanım: midas price/);
});
