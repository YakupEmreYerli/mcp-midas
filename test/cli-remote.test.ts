import assert from "node:assert/strict";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

process.env.MIDAS_LANG = "tr";
const { connectRemote } = await import("../src/cli/connect.js");
const { run } = await import("../src/cli/commands.js");

const TOKEN = "test-token";

/** http.ts'teki gibi durumsuz, jetonlu küçük bir MCP servisi; araçlar sahte. */
async function startFakeServer() {
  const seen: string[] = [];
  const httpServer = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "yetkisiz" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    const server = new McpServer({ name: "midas-test", version: "0" });
    server.registerTool("get_asset_price", { inputSchema: { symbol: z.string() } }, async ({ symbol }) => {
      seen.push(`get_asset_price:${symbol}`);
      return {
        content: [
          { type: "text", text: JSON.stringify({ symbol, price: 312.5, currency: "TRY", previousClose: 300, changePercent: 4.1667 }) },
          { type: "text", text: "Hesap: deneme" },
        ],
      };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, text ? JSON.parse(text) : undefined);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, seen, close: () => new Promise((r) => httpServer.close(r)) };
}

test("uzak kip: jetonla bağlanır, aracı çağırır, hesap satırını alır", async () => {
  const server = await startFakeServer();
  try {
    const caller = await connectRemote(server.url, TOKEN);
    const result = await caller.call("get_asset_price", { symbol: "THYAO" });
    await caller.close();
    assert.equal(result.isError, false);
    assert.equal((result.data as any).price, 312.5);
    assert.equal(result.accountLine, "Hesap: deneme");
    assert.deepEqual(server.seen, ["get_asset_price:THYAO"]);
  } finally {
    await server.close();
  }
});

test("uzak kip: yanlış jeton bağlantıyı reddeder", async () => {
  const server = await startFakeServer();
  try {
    await assert.rejects(connectRemote(server.url, "yanlis"));
    assert.deepEqual(server.seen, []);
  } finally {
    await server.close();
  }
});

test("uzak kip uçtan uca: midas price düz metin basar; emir araçları yoksa buy reddedilir", async () => {
  const server = await startFakeServer();
  try {
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      connect: async () => connectRemote(server.url, TOKEN),
      resolveTarget: () => ({ kind: "remote" as const, url: server.url, token: TOKEN, account: "deneme" }),
      out: (t: string) => out.push(t),
      err: (t: string) => err.push(t),
    };
    assert.equal(await run(["price", "THYAO"], deps), 0, err.join("\n"));
    assert.match(out.join("\n"), /Hesap: deneme\nTHYAO: 312,5000 TRY/);
    assert.equal(await run(["buy", "THYAO", "1", "--confirm"], deps), 1);
    assert.match(err.join("\n"), /emir araçları kapalı/);
  } finally {
    await server.close();
  }
});
