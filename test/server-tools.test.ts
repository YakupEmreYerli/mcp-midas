import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ordersEnabled } from "../src/tool-flags.js";

// config.ts kimlik bilgisini içe aktarımda ister; araç listesi için tarayıcı açılmaz.
process.env.MIDAS_PHONE ??= "5550000000";
process.env.MIDAS_PASSWORD ??= "test-only";
// Boş değer, yerel bir .env dosyasının bayrağı içe aktarımda (dotenv) açmasını engeller.
process.env.MIDAS_ORDERS_ENABLED = "";
const { createServer } = await import("../src/server.js");

const ORDER_TOOLS = ["place_order", "update_order", "cancel_order"];

async function listToolNames(env: NodeJS.ProcessEnv): Promise<string[]> {
  const saved = process.env.MIDAS_ORDERS_ENABLED;
  if (env.MIDAS_ORDERS_ENABLED === undefined) delete process.env.MIDAS_ORDERS_ENABLED;
  else process.env.MIDAS_ORDERS_ENABLED = env.MIDAS_ORDERS_ENABLED;
  try {
    const server = createServer();
    const client = new Client({ name: "test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    await client.close();
    await server.close();
    return tools.map((t) => t.name);
  } finally {
    if (saved === undefined) delete process.env.MIDAS_ORDERS_ENABLED;
    else process.env.MIDAS_ORDERS_ENABLED = saved;
  }
}

test("bayrak yokken emir araçları listede hiç yok", async () => {
  const names = await listToolNames({});
  for (const name of ORDER_TOOLS) assert.ok(!names.includes(name), `${name} görünmemeli`);
  assert.ok(names.includes("get_portfolio"));
  assert.ok(names.includes("get_pending_orders"));
});

test("MIDAS_ORDERS_ENABLED=1 iken emir araçları kayıtlı", async () => {
  const names = await listToolNames({ MIDAS_ORDERS_ENABLED: "1" });
  for (const name of ORDER_TOOLS) assert.ok(names.includes(name), `${name} görünmeli`);
  assert.ok(names.includes("get_portfolio"));
});

test("yalnız tam olarak 1 değeri açar", () => {
  assert.equal(ordersEnabled({}), false);
  for (const value of ["", "0", "true", "yes", "on", "2", "false"]) {
    assert.equal(ordersEnabled({ MIDAS_ORDERS_ENABLED: value }), false, `"${value}" açmamalı`);
  }
  assert.equal(ordersEnabled({ MIDAS_ORDERS_ENABLED: "1" }), true);
  assert.equal(ordersEnabled({ MIDAS_ORDERS_ENABLED: " 1 " }), true);
});

async function listTools(ordersOn: boolean) {
  const server = createServer({ ordersEnabled: ordersOn });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  await server.close();
  return tools;
}

test("place_order kâr al/zarar durdur tiplerini ve fiyat alanlarını kabul eder", async () => {
  const tools = await listTools(true);
  const place = tools.find((t) => t.name === "place_order")!;
  const props = place.inputSchema.properties as Record<string, any>;
  assert.deepEqual(props.order_type.enum, ["MARKET", "LIMIT", "DEMAND", "TAKE_PROFIT", "STOP_LOSS", "TAKE_PROFIT_AND_STOP_LOSS"]);
  assert.ok(props.take_profit_price);
  assert.ok(props.stop_loss_price);
  for (const forbidden of ["confirmed", "approve", "approved", "test_mode"]) {
    assert.ok(!(forbidden in props), `${forbidden} şemada olmamalı`);
  }
  const update = tools.find((t) => t.name === "update_order")!;
  assert.match(update.description ?? "", /cancel_order ile iptal edip place_order ile yeniden gir/);
});

test("okuma araçları isteğe bağlı market ipucu alır, emir araçları almaz", async () => {
  const tools = await listTools(true);
  for (const name of ["get_asset_price", "get_asset_info", "get_technicals", "get_chart", "get_pending_orders"]) {
    const props = tools.find((t) => t.name === name)!.inputSchema.properties as Record<string, any>;
    assert.deepEqual(props.market?.enum, ["TR", "US"], name);
  }
  for (const name of ["place_order", "update_order", "cancel_order"]) {
    const props = tools.find((t) => t.name === name)!.inputSchema.properties as Record<string, any>;
    assert.ok(!("market" in props), `${name} market ipucu almamalı`);
  }
});
