import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { forcedLanguage, LANGUAGES, language, messageTables, resolveLanguage } from "../src/i18n.js";
import { buildDialogModel, buildWindowModel, formatApprovalMessage, LOCALIZED_FIELDS } from "../src/confirmation-view.js";
import type { ApprovalPreview } from "../src/order-approval.js";

// Araç listesi için tarayıcı açılmaz; boş değer yerel .env'nin bayrağı açmasını engeller.
process.env.MIDAS_ORDERS_ENABLED = "";
// Metin tablosu olan modüller; yan etkili giriş noktaları (http, login, smoke) dışarıda.
const { createServer } = await import("../src/server.js");
await import("../src/desktop-confirmation-core.js");
await import("../src/keepalive.js");

// ---------- Dil seçimi ----------

test("MIDAS_LANG dili belirler, sistem yerelinden önce gelir", () => {
  assert.equal(resolveLanguage({ MIDAS_LANG: "en", LANG: "tr_TR.UTF-8" }), "en");
  assert.equal(resolveLanguage({ MIDAS_LANG: "tr", LANG: "en_US.UTF-8" }), "tr");
  assert.equal(resolveLanguage({ MIDAS_LANG: " EN " }), "en");
  assert.throws(() => resolveLanguage({ MIDAS_LANG: "de" }), /MIDAS_LANG/);
});

test("MIDAS_LANG yoksa yerel: LC_ALL, LC_MESSAGES, LANG sırasıyla; tr ile başlayan Türkçe, gerisi İngilizce", () => {
  assert.equal(resolveLanguage({ LANG: "tr_TR.UTF-8" }), "tr");
  assert.equal(resolveLanguage({ LANG: "tr" }), "tr");
  assert.equal(resolveLanguage({ LANG: "en_US.UTF-8" }), "en");
  assert.equal(resolveLanguage({ LANG: "C.UTF-8" }), "en");
  assert.equal(resolveLanguage({ LANG: "de_DE.UTF-8" }), "en");
  assert.equal(resolveLanguage({}), "en");
  assert.equal(resolveLanguage({ LC_ALL: "en_US.UTF-8", LC_MESSAGES: "tr_TR.UTF-8", LANG: "tr_TR.UTF-8" }), "en");
  assert.equal(resolveLanguage({ LC_MESSAGES: "tr_TR.UTF-8", LANG: "en_US.UTF-8" }), "tr");
  assert.equal(resolveLanguage({ LC_ALL: "", LANG: "tr_TR.UTF-8" }), "tr", "boş değer atlanır");
  assert.equal(resolveLanguage({ MIDAS_LANG: "", LANG: "tr_TR.UTF-8" }), "tr", "boş MIDAS_LANG yok sayılır");
});

test("geçersiz MIDAS_LANG çalışma anında İngilizceye düşer (açılışta config.ts hata verir)", () => {
  const saved = process.env.MIDAS_LANG;
  try {
    process.env.MIDAS_LANG = "xx";
    assert.equal(language(), "en");
  } finally {
    if (saved === undefined) delete process.env.MIDAS_LANG;
    else process.env.MIDAS_LANG = saved;
  }
});

test("pencerelere dil yalnız MIDAS_LANG açıkça verilmişse zorlanır; yerel ve geçersiz değer zorlamaz", () => {
  assert.equal(forcedLanguage({ MIDAS_LANG: "en", LANG: "tr_TR.UTF-8" }), "en");
  assert.equal(forcedLanguage({ MIDAS_LANG: " TR " }), "tr");
  assert.equal(forcedLanguage({ LANG: "tr_TR.UTF-8" }), null);
  assert.equal(forcedLanguage({ MIDAS_LANG: "" }), null);
  assert.equal(forcedLanguage({ MIDAS_LANG: "de" }), null);
});

// ---------- Tabloların iki dilde aynı anahtarları taşıması ----------

function sameShape(tr: unknown, en: unknown, where: string): void {
  if (typeof tr === "function") {
    assert.equal(typeof en, "function", where);
    assert.equal((en as Function).length, tr.length, `${where}: parametre sayısı`);
    return;
  }
  if (Array.isArray(tr)) {
    assert.ok(Array.isArray(en), where);
    assert.equal((en as unknown[]).length, tr.length, where);
    return;
  }
  if (tr && typeof tr === "object") {
    assert.ok(en && typeof en === "object", where);
    assert.deepEqual(Object.keys(en as object).sort(), Object.keys(tr).sort(), where);
    for (const key of Object.keys(tr)) sameShape((tr as any)[key], (en as any)[key], `${where}.${key}`);
    return;
  }
  assert.equal(typeof en, typeof tr, where);
  assert.ok(String(en).length > 0, `${where}: boş metin`);
}

test("TypeScript metin tablolarının her anahtarı iki dilde de var", () => {
  assert.ok(messageTables.length >= 15, `beklenenden az tablo: ${messageTables.length}`);
  messageTables.forEach(({ tr, en }, index) => sameShape(tr, en, `tablo ${index}`));
});

function windowTable(file: string): Record<string, Record<string, unknown>> {
  const source = readFileSync(new URL(`../onay/${file}`, import.meta.url), "utf8");
  const start = source.indexOf("METIN-BAŞI");
  const end = source.indexOf("// METIN-SONU");
  assert.ok(start > 0 && end > start, `${file}: METIN-BAŞI/METIN-SONU işaretleri`);
  const code = source.slice(source.indexOf("\n", start), end);
  return new Function(`${code}; return METIN;`)();
}

test("pencere sayfalarının (onay.js, sms.js) metin tablosu iki dilde aynı anahtarları taşır", () => {
  for (const file of ["onay.js", "sms.js"]) {
    const table = windowTable(file);
    assert.deepEqual(Object.keys(table).sort(), [...LANGUAGES].sort(), file);
    sameShape(table.tr, table.en, file);
  }
});

test("sayfadaki her data-metin anahtarı tabloda var", () => {
  for (const [page, script] of [["onay.html", "onay.js"], ["sms.html", "sms.js"]]) {
    const html = readFileSync(new URL(`../onay/${page}`, import.meta.url), "utf8");
    const table = windowTable(script);
    const keys = [...html.matchAll(/data-metin(?:-etiket)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 5, page);
    for (const key of keys) assert.ok(key in table.en && key in table.tr, `${page}: ${key}`);
    assert.match(html, /<html lang="__DIL__"/, `${page}: dil yer tutucusu`);
  }
});

let python: string | null = null;
for (const candidate of ["/usr/bin/python3", "python3"]) {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    python = candidate;
    break;
  } catch {
    // sıradakini dene
  }
}

test("Python pencerelerinin (onay.py, sms.py) metin tablosu iki dilde aynı anahtarları taşır", { skip: !python }, () => {
  const out = execFileSync(python!, [
    "-I",
    "-c",
    "import json, sys; sys.path.insert(0, sys.argv[1]); import onay, sms; " +
      "print(json.dumps({'onay': onay.METIN, 'sms': sms.METIN}))",
    fileURLToPath(new URL("../onay", import.meta.url)),
  ]).toString();
  const tables = JSON.parse(out) as Record<string, Record<string, Record<string, string>>>;
  for (const [name, table] of Object.entries(tables)) {
    assert.deepEqual(Object.keys(table).sort(), [...LANGUAGES].sort(), name);
    assert.deepEqual(Object.keys(table.en).sort(), Object.keys(table.tr).sort(), name);
  }
});

// ---------- Pencerenin cihaz dili (onay/dil.py) ----------

function runPython(code: string, ...args: string[]): unknown {
  const out = execFileSync(python!, [
    "-I",
    "-c",
    "import json, sys; sys.path.insert(0, sys.argv[1]); " + code,
    fileURLToPath(new URL("../onay", import.meta.url)),
    ...args,
  ]).toString();
  return JSON.parse(out);
}

test("pencere cihaz dilini LC_ALL → LC_MESSAGES → LANG, sonra yerel dosyalardan bulur", { skip: !python }, () => {
  const dir = mkdtempSync(join(tmpdir(), "midas-dil-"));
  try {
    const conf = join(dir, "locale.conf");
    const debian = join(dir, "default-locale");
    const none = join(dir, "yok");
    writeFileSync(conf, '# yorum\nLC_TIME=en_US.UTF-8\nLANG="tr_TR.UTF-8"\n');
    writeFileSync(debian, "LANG=en_GB.UTF-8\n");
    const cases: Array<[Record<string, string>, string[], string, string]> = [
      [{ LC_ALL: "en_US.UTF-8", LC_MESSAGES: "tr_TR.UTF-8", LANG: "tr_TR.UTF-8" }, [conf], "en", "LC_ALL önce"],
      [{ LC_MESSAGES: "tr_TR.UTF-8", LANG: "en_US.UTF-8" }, [], "tr", "sonra LC_MESSAGES"],
      [{ LC_ALL: " ", LANG: "tr_TR.UTF-8" }, [], "tr", "boş değer atlanır"],
      [{ LANG: "en_US.UTF-8" }, [conf], "en", "ortamda değer varsa dosyaya bakılmaz"],
      [{ LANG: "C.UTF-8" }, [conf], "tr", "C seçim sayılmaz, dosyaya bakılır"],
      [{ LC_ALL: "POSIX" }, [conf], "tr", "POSIX seçim sayılmaz"],
      [{ LANG: "C" }, [none], "en", "C ve dosya yoksa İngilizce"],
      [{}, [conf, debian], "tr", "ortam boşsa locale.conf"],
      [{}, [none, debian], "en", "locale.conf yoksa /etc/default/locale"],
      [{ LANG: "" }, [none, conf], "tr", "ikinci dosya da okunur"],
      [{}, [none], "en", "hiçbiri yoksa İngilizce"],
    ];
    const result = runPython(
      "import dil; cases = json.loads(sys.argv[2]); " +
        "print(json.dumps([dil.device_language(env, files) for env, files, _, _ in cases]))",
      JSON.stringify(cases)
    ) as string[];
    cases.forEach(([, , expected, why], index) => assert.equal(result[index], expected, why));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("onay.py dili seçer: --dil, modeldeki dil, iki dilli modelde cihaz; eski model Türkçe", { skip: !python }, () => {
  const dir = mkdtempSync(join(tmpdir(), "midas-dil-"));
  try {
    const conf = join(dir, "locale.conf");
    writeFileSync(conf, "LANG=tr_TR.UTF-8\n");
    const dual = buildWindowModel(place, null, null);
    const forced = buildWindowModel(place, null, "en");
    const { dil: _dil, ...oldNoLang } = buildDialogModel(place, null, "tr");
    const result = runPython(
      "import os; [os.environ.pop(k, None) for k in ('LC_ALL', 'LC_MESSAGES', 'LANG')]; import onay, sms; " +
        "dual, forced, old, conf = json.loads(sys.argv[2]); files = [conf]; " +
        "pick = lambda m, cli=None: onay.choose_language(m, cli, files); " +
        "print(json.dumps({" +
        "'cihaz': pick(dual), 'cihazYok': onay.choose_language(dual, None, []), 'zorla': pick(forced), " +
        "'cli': pick(forced, 'tr'), 'eski': pick(old), 'alanlar': onay.LOCALIZED_FIELDS, " +
        "'yapisal': onay.localize({**dual, 'metinler': {'en': {'islem': 'ALIŞ', 'soru': 'x'}}}, 'en')['islem'], " +
        "'duz': onay.localize(dual, 'en'), 'eskiDuz': onay.localize(old, 'tr'), " +
        "'sms': [sms.choose_language({}, None, files), sms.choose_language({}, None, []), " +
        "sms.choose_language({'dil': 'en'}, 'tr', files), sms.choose_language({}, 'en', files)]}))",
      JSON.stringify([dual, forced, oldNoLang, conf])
    ) as Record<string, unknown>;
    assert.equal(result.cihaz, "tr", "ortam boş, locale.conf Türkçe");
    assert.equal(result.cihazYok, "en");
    assert.equal(result.zorla, "en", "sunucunun MIDAS_LANG'i cihazdan önce gelir");
    assert.equal(result.cli, "tr");
    assert.equal(result.eski, "tr", "dil ve metinler yoksa eskisi gibi Türkçe");
    assert.deepEqual(result.alanlar, [...LOCALIZED_FIELDS], "onay.py ile confirmation-view.ts aynı alanları taşır");
    assert.equal(result.yapisal, "SATIŞ", "metinler yapısal alanı değiştiremez");
    // Seçilen dilin metinleri düz alanlara yazılır; sayfa eski biçimi görür.
    assert.deepEqual(result.duz, buildDialogModel(place, null, "en"));
    assert.deepEqual(result.eskiDuz, { ...oldNoLang, dil: "tr" });
    assert.deepEqual(result.sms, ["tr", "en", "en", "en"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Onay penceresi modeli iki dilde ----------

const preview: ApprovalPreview = {
  action: "UPDATE",
  instrumentName: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.",
  symbol: "ASELS",
  market: "TR stock (BIST)",
  side: "SATIŞ",
  orderType: "TAKE_PROFIT_AND_STOP_LOSS",
  quantity: 5,
  takeProfitPrice: 122.5,
  stopLossPrice: 100.5,
  currentPrice: 111,
  estimatedTry: 1555,
  accountUid: "account-tr",
  oldValues: { uid: "order-1", quantity: 5, profitPrice: 120, lossPrice: 99, status: "PENDING" },
  newValues: { quantity: 5, profitPrice: 122.5, lossPrice: 100.5 },
};
const place = { ...preview, action: "PLACE" as const, orderType: "LIMIT", limitPrice: 122.5, oldValues: undefined, newValues: undefined };

test("pencere modeli İngilizce çizer; işlem ve yön anahtarları dilden bağımsız kalır", () => {
  const sell = buildDialogModel(place, null, "en");
  assert.equal(sell.dil, "en");
  assert.equal(sell.islem, "SATIŞ");
  assert.equal(sell.islemYazi, "SELL");
  assert.equal(sell.yon, "SATIŞ");
  assert.equal(sell.yonYazi, "SELL");
  assert.equal(sell.ozet, "Sell 5 ASELS at a limit price of ₺122.50.");
  assert.equal(sell.soru, "Send this sell order to Midas?");
  assert.equal(sell.evet, "Yes, sell");
  assert.equal(sell.hayir, "No");
  assert.equal(sell.emirTipi, "Limit");
  assert.equal(sell.tutar.etiket, "Estimated total");
  assert.equal(sell.tutar.deger, "₺1,555.00");
  assert.deepEqual(
    sell.satirlar.map((row) => row.etiket),
    ["Quantity", "Limit price", "Take profit", "Stop loss", "Current price"]
  );

  const buy = buildDialogModel({ ...place, side: "ALIŞ", orderType: "MARKET" }, null, "en");
  assert.equal(buy.islemYazi, "BUY");
  assert.equal(buy.ozet, "Buy 5 ASELS at the market price.");

  const cancel = buildDialogModel({ ...preview, action: "CANCEL", newValues: { status: "CANCELED" } }, null, "en");
  assert.equal(cancel.islem, "İPTAL");
  assert.equal(cancel.islemYazi, "CANCEL");
  assert.equal(cancel.ozet, "Cancel the pending sell order for 5 ASELS.");
  assert.equal(cancel.tutar.etiket, "Current order value");
  assert.deepEqual(cancel.degisiklikler, [{ etiket: "Status", eski: "Pending", yeni: "Canceled", degisti: true }]);

  const update = buildDialogModel(preview, "personal", "en");
  assert.equal(update.islemYazi, "MODIFY");
  assert.equal(update.evet, "Yes, modify");
  assert.deepEqual(update.satirlar.map((row) => row.etiket), ["Current price"]);
  assert.deepEqual(
    update.degisiklikler.map((row) => [row.etiket, row.eski, row.yeni, row.degisti]),
    [["Quantity", "5", "5", false], ["Take profit", "₺120.00", "₺122.50", true], ["Stop loss", "₺99.00", "₺100.50", true]]
  );
});

test("pencere modeli Türkçe çizer; aynı önizleme aynı yapıyı verir", () => {
  const tr = buildDialogModel(place, null, "tr");
  const en = buildDialogModel(place, null, "en");
  assert.equal(tr.dil, "tr");
  assert.equal(tr.islemYazi, "SATIŞ");
  assert.equal(tr.ozet, "5 adet ASELS, ₺122,50 limit fiyatla satılacak.");
  assert.equal(tr.evet, "Evet, sat");
  assert.equal(tr.hayir, "Hayır");
  assert.equal(tr.tutar.deger, "₺1.555,00");
  // Pencere davranışını belirleyen alanlar dilden bağımsızdır.
  for (const key of ["islem", "ton", "yon", "tutarVurgulu", "sureSn", "emirNo", "hesap"] as const) {
    assert.deepEqual(tr[key], en[key], key);
  }
  assert.equal(tr.satirlar.length, en.satirlar.length);
});

test("dil zorlanmamışsa pencere modeli dile bağlı metinleri iki dilde, yapısal alanları tek taşır", () => {
  const model = buildWindowModel(place, "personal", null);
  assert.ok(!("dil" in model));
  assert.ok("metinler" in model);
  const tr = buildDialogModel(place, "personal", "tr");
  const en = buildDialogModel(place, "personal", "en");
  for (const field of LOCALIZED_FIELDS) {
    assert.deepEqual(model.metinler.tr[field], tr[field], `tr ${field}`);
    assert.deepEqual(model.metinler.en[field], en[field], `en ${field}`);
  }
  assert.deepEqual(Object.keys(model.metinler).sort(), ["en", "tr"]);
  // Yapısal alanlar tek; düz metin alanları metinler'i tanımayan eski pencere için Türkçe.
  const { dil: _dil, ...flatTr } = tr;
  const { metinler: _metinler, ...flat } = model;
  assert.deepEqual(flat, flatTr);
});

test("MIDAS_LANG verilmişse pencere modeli tek dilli ve dil alanını taşır (eski biçim)", () => {
  for (const lang of LANGUAGES) {
    const model = buildWindowModel(place, null, lang);
    assert.deepEqual(model, buildDialogModel(place, null, lang));
    assert.ok(!("metinler" in model));
  }
});

test("kdialog/zenity düz metni İngilizcede Türkçe arayüz sözcüğü taşımaz", () => {
  const text = formatApprovalMessage(preview, "personal", "en");
  for (const expected of [
    "ACCOUNT: personal",
    "MODIFY — ASELS",
    "Modify the pending sell order for ASELS.",
    "Market: TR stock (BIST)",
    "Side: SELL · Order type: Take profit + stop loss",
    "Before → after:",
    "• Take profit: ₺120.00 → ₺122.50",
    "Order ID: order-1",
    "Account: account-tr",
    "Send this change to Midas?",
  ]) {
    assert.ok(text.includes(expected), `eksik: ${expected}`);
  }
  // Enstrüman adı dışında Türkçe arayüz metni kalmamalı.
  const ui = text.replace(preview.instrumentName, "");
  assert.doesNotMatch(ui, /[çğıöşüÇĞİÖŞÜ]|Hesap|Evet|Hayır|Emir/);
});

// ---------- MCP yüzeyi ----------

async function listTools(lang: "tr" | "en") {
  const saved = process.env.MIDAS_LANG;
  process.env.MIDAS_LANG = lang;
  process.env.MIDAS_ORDERS_ENABLED = "1";
  try {
    const server = createServer({ accountLabel: "personal" });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    const instructions = client.getInstructions();
    await client.close();
    await server.close();
    return { tools, instructions };
  } finally {
    process.env.MIDAS_ORDERS_ENABLED = "";
    if (saved === undefined) delete process.env.MIDAS_LANG;
    else process.env.MIDAS_LANG = saved;
  }
}

test("araç ve argüman açıklamaları seçilen dilde; araç ve argüman adları aynı kalır", async () => {
  const en = await listTools("en");
  const tr = await listTools("tr");
  assert.deepEqual(en.tools.map((t) => t.name), tr.tools.map((t) => t.name));
  for (const [index, tool] of en.tools.entries()) {
    const other = tr.tools[index];
    assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}), Object.keys(other.inputSchema.properties ?? {}), tool.name);
    assert.notEqual(tool.description, other.description, `${tool.name} açıklaması çevrilmemiş`);
    assert.doesNotMatch(tool.description ?? "", /[çğıöşüÇĞİÖŞÜ]/, `${tool.name} İngilizce açıklamada Türkçe harf`);
    for (const [name, schema] of Object.entries((tool.inputSchema.properties ?? {}) as Record<string, any>)) {
      if (schema.description) assert.doesNotMatch(schema.description, /[çğıöşüÇĞİÖŞÜ]/, `${tool.name}.${name}`);
    }
  }
  const place = en.tools.find((t) => t.name === "place_order")!;
  assert.match(place.description ?? "", /local desktop approval window; no schema argument can skip the approval/);
  assert.match(en.instructions ?? "", /connected only to the Midas account labeled "personal"/);
  assert.match(tr.instructions ?? "", /"personal" etiketli Midas hesabına/);
});
