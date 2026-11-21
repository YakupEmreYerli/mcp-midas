import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ACCOUNT_LABEL_MAX,
  accountLine,
  parseAccountLabel,
  resolveDataPaths,
  serverInstructions,
  serverName,
} from "../src/instance.js";
import { buildDialogModel, formatApprovalMessage } from "../src/confirmation-view.js";
import { createDesktopConfirmationGate, kdialogArgs, zenityArgs } from "../src/desktop-confirmation-core.js";
import type { ApprovalPreview } from "../src/order-approval.js";

// Bu dosyadaki beklentiler Türkçe metinleri sabitler; dil sistem yerelinden bağımsız seçilir.
process.env.MIDAS_LANG = "tr";

// Sunucu testleri geçici bir veri dizininde koşar: proje kökündeki gerçek oturum dosyasına
// dokunulmaz, durum aracı tarayıcı açmaz.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-midas-test-"));
process.env.MIDAS_PHONE ??= "5550000000"; // sahte numara, acik-depo-izin
process.env.MIDAS_PASSWORD ??= "test-only";
process.env.MIDAS_ORDERS_ENABLED = "";
process.env.MIDAS_DATA_DIR = dataDir;
process.env.MIDAS_ACCOUNT_LABEL = "parent";
const { config } = await import("../src/config.js");
const { createServer } = await import("../src/server.js");

test("MIDAS_DATA_DIR yoksa dosyalar proje kökünde kalır", () => {
  for (const value of [undefined, "", "  "]) {
    assert.deepEqual(resolveDataPaths(value, "/repo"), {
      sessionDir: "/repo/.midas-session",
      stateFile: "/repo/.midas-state.json",
      orderLogFile: "/repo/.midas-orders.log.jsonl",
    });
  }
});

test("MIDAS_DATA_DIR oturum, durum ve emir günlüğünü taşır; ~ ev dizinine açılır, göreli yol reddedilir", () => {
  assert.deepEqual(resolveDataPaths("/veri/parent/", "/repo"), {
    sessionDir: "/veri/parent/.midas-session",
    stateFile: "/veri/parent/.midas-state.json",
    orderLogFile: "/veri/parent/.midas-orders.log.jsonl",
  });
  assert.equal(resolveDataPaths("~/.local/share/mcp-midas/parent", "/repo", "/home/user").stateFile, "/home/user/.local/share/mcp-midas/parent/.midas-state.json");
  assert.throws(() => resolveDataPaths("veri/parent", "/repo"), /MIDAS_DATA_DIR mutlak/);
  assert.throws(() => resolveDataPaths("~/veri", "/repo"), /MIDAS_DATA_DIR mutlak/, "ev dizini bilinmiyorsa ~ açılmaz");
});

test("config MIDAS_DATA_DIR ve MIDAS_ACCOUNT_LABEL değerlerini okur, dizini kurar", () => {
  assert.equal(config.stateFile, path.join(dataDir, ".midas-state.json"));
  assert.equal(config.sessionDir, path.join(dataDir, ".midas-session"));
  assert.equal(config.orderLogFile, path.join(dataDir, ".midas-orders.log.jsonl"));
  assert.equal(config.accountLabel, "parent");
  assert.ok(fs.statSync(dataDir).isDirectory());
});

test("hesap etiketi kırpılır, boşsa yoktur, denetim karakteri ve aşırı uzunluk reddedilir", () => {
  assert.equal(parseAccountLabel(undefined), null);
  assert.equal(parseAccountLabel("  "), null);
  assert.equal(parseAccountLabel(" parent "), "parent");
  assert.equal(parseAccountLabel("Ayşe Çocuk"), "Ayşe Çocuk");
  assert.equal(parseAccountLabel("ş".repeat(ACCOUNT_LABEL_MAX)), "ş".repeat(ACCOUNT_LABEL_MAX));
  assert.throws(() => parseAccountLabel("a".repeat(ACCOUNT_LABEL_MAX + 1)), /en çok/);
  assert.throws(() => parseAccountLabel("parent\nchild"), /denetim karakteri/);
});

test("etiket sunucu adında ve yönergesinde görünür; etiketsizde eski ad, yönerge yok", () => {
  assert.equal(serverName(null), "midas-mcp");
  assert.equal(serverName("parent"), "midas-mcp (parent)");
  assert.equal(serverInstructions(null), undefined);
  assert.match(serverInstructions("parent") ?? "", /"parent" etiketli Midas hesabına/);
  assert.equal(accountLine("parent"), "Hesap: parent");
});

async function connect(accountLabel?: string | null) {
  const server = createServer(accountLabel === undefined ? {} : { accountLabel });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

test("etiketli sunucu adını ve yönergesini istemciye bildirir", async () => {
  const { client, close } = await connect();
  assert.equal(client.getServerVersion()?.name, "midas-mcp (parent)");
  assert.match(client.getInstructions() ?? "", /parent/);
  await close();
  const plain = await connect(null);
  assert.equal(plain.client.getServerVersion()?.name, "midas-mcp");
  assert.equal(plain.client.getInstructions(), undefined);
  await plain.close();
});

test("get_session_status kayıtlı oturum yokken tarayıcı açmadan logged-out döner; ilk parça saf JSON, ardından hesap satırı", async () => {
  fs.rmSync(path.join(dataDir, ".midas-state.json"), { force: true });
  const { client, close } = await connect();
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "get_session_status"));
  const result = (await client.callTool({ name: "get_session_status", arguments: {} })) as any;
  await close();
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.account, "parent");
  assert.equal(body.status, "logged-out");
  assert.equal(body.browser, false);
  assert.equal(body.checked, "saved-state");
  assert.deepEqual(result.content[1], { type: "text", text: "Hesap: parent" });
});

const preview: ApprovalPreview = {
  action: "PLACE",
  instrumentName: "Aselsan",
  symbol: "ASELS",
  market: "TR HİSSE",
  side: "ALIŞ",
  orderType: "MARKET",
  quantity: 1,
  currentPrice: 100,
  estimatedTry: 100,
  accountUid: "account-tr",
};

test("onay penceresi modeli ve düz metin yedeği hesap etiketini taşır", () => {
  assert.equal(buildDialogModel(preview).hesapEtiketi, null);
  assert.equal(buildDialogModel(preview, "parent").hesapEtiketi, "parent");
  assert.match(formatApprovalMessage(preview, "parent"), /^HESAP: parent\n/);
  assert.doesNotMatch(formatApprovalMessage(preview), /HESAP:/);
  assert.ok(kdialogArgs("m", "midas-mcp emir onayı — Hesap: parent").includes("midas-mcp emir onayı — Hesap: parent"));
  assert.ok(zenityArgs("m", "midas-mcp emir onayı — Hesap: parent").includes("--title=midas-mcp emir onayı — Hesap: parent"));
});

test("onay kapısı MIDAS_ACCOUNT_LABEL'ı pencereye ve yedeklerin başlığına geçirir", async () => {
  const calls: { tool: string; args: string[]; stdin?: string }[] = [];
  const gate = createDesktopConfirmationGate(
    async (spec) => {
      calls.push(spec);
      // Tasarımlı pencere açılamadı → kdialog; kdialog Hayır seçti.
      return spec.tool === "onay"
        ? { code: null, signal: null, stdout: "", stderr: "", timedOut: false, spawnError: { code: "ENOENT", message: "yok" } }
        : { code: 1, signal: null, stdout: "", stderr: "", timedOut: false };
    },
    { DISPLAY: ":0", MIDAS_ACCOUNT_LABEL: "parent" },
    { pythonPath: "/usr/bin/python3", onayScript: "/repo/onay/onay.py" }
  );
  const outcome = await gate(preview);
  assert.equal(outcome.decision, "rejected");
  assert.equal(JSON.parse(calls[0].stdin ?? "{}").hesapEtiketi, "parent");
  assert.ok(calls[1].args.includes("midas-mcp emir onayı — Hesap: parent"));
  assert.match(calls[1].args.find((arg) => arg.startsWith("HESAP:")) ?? "", /^HESAP: parent/);
});
