import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// config.ts kimlik bilgisini içe aktarımda ister. Durum dosyası geçici dizine yönlendirilir:
// proje kökündeki gerçek oturum dosyasına dokunulmaz, durum aracı tarayıcı açmaz.
process.env.MIDAS_PHONE ??= "5550000000"; // sahte numara, acik-depo-izin
process.env.MIDAS_PASSWORD ??= "test-only";
process.env.MIDAS_ORDERS_ENABLED = "";
const { config } = await import("../src/config.js");
const { createServer } = await import("../src/server.js");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-midas-test-"));
config.stateFile = path.join(dataDir, ".midas-state.json");

async function callStatus() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  const result = (await client.callTool({ name: "get_session_status", arguments: {} })) as any;
  await client.close();
  await server.close();
  return { names: tools.map((t) => t.name), body: JSON.parse(result.content[0].text) };
}

test("get_session_status kayıtlı oturum yokken tarayıcı açmadan logged-out döner", async () => {
  fs.rmSync(config.stateFile, { force: true });
  const { names, body } = await callStatus();
  assert.ok(names.includes("get_session_status"));
  assert.equal(body.status, "logged-out");
  assert.equal(body.browser, false);
  assert.equal(body.checked, "saved-state");
  assert.equal(body.refreshExpiresAt, null);
});

test("get_session_status refresh_token süresi dolmuş kayıtlı oturumda da tarayıcı açmaz", async () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const jwt = ["e30", Buffer.from(JSON.stringify({ iat: past - 86_400, exp: past })).toString("base64url"), "imza"].join(".");
  fs.writeFileSync(config.stateFile, JSON.stringify({ cookies: [{ name: "refresh_token", value: jwt }], origins: [] }));
  const { body } = await callStatus();
  assert.equal(body.status, "logged-out");
  assert.equal(body.browser, false);
  assert.equal(body.refreshExpiresAt, new Date(past * 1000).toISOString());
});
