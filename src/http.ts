#!/usr/bin/env node
/**
 * Yerel döngü arayüzünde (loopback) Streamable HTTP üzerinden çalışan uzun ömürlü MCP servisi.
 *
 * stdio giriş noktası her istemci oturumuyla birlikte ölür ve her yeni süreç bir Chromium
 * açılışı (bazen de telefonda bildirim onayı) bedeli öder. Bu süreç masaüstü oturumu başına
 * bir kez (ör. systemd ile) başlar ve tarayıcı oturumunu tüm istemciler için sıcak tutar.
 * Durumsuz taşıma: istek başına yeni bir McpServer, tek paylaşılan oturum.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { session } from "./session.js";
import { createServer } from "./server.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MIDAS_HTTP_PORT ?? 8766);
const TOKEN_FILE = process.env.MIDAS_TOKEN_FILE ?? path.join(os.homedir(), ".config", "mcp-midas", "token");
const KEEPALIVE_MS = 20 * 60_000;

/** Aksi hâlde her yerel süreç emir araçlarına ulaşabilirdi; bu yüzden portu bir bearer token korur. */
function loadToken(): string {
  if (!fs.existsSync(TOKEN_FILE)) {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return fs.readFileSync(TOKEN_FILE, "utf8").trim();
}

const token = loadToken();
const expected = Buffer.from(`Bearer ${token}`);

function authorized(req: http.IncomingMessage): boolean {
  const given = Buffer.from(req.headers.authorization ?? "");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function reply(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}`);

  if (url.pathname === "/health") {
    return reply(res, 200, { ok: true, browser: session.isStarted() });
  }
  if (url.pathname !== "/mcp") return reply(res, 404, { error: "bulunamadı" });
  if (!authorized(req)) return reply(res, 401, { error: "yetkisiz" });
  if (req.method !== "POST") {
    // Durumsuz modda sürdürülecek, sunucunun başlattığı bir akış yoktur.
    return reply(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Yönteme izin verilmiyor" }, id: null });
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    const body = await readBody(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) {
      const message = error instanceof Error ? error.message : String(error);
      reply(res, 500, { jsonrpc: "2.0", error: { code: -32603, message }, id: null });
    }
  }
});

// Uygulama token'larını yalnız sayfa açıkken yeniler; düzenli yeniden yükleme yenileme
// döngüsünü sürdürür ve sonucu kaydeder, böylece boşta geçen bir gece yeni bildirim onayı istemez.
const keepAlive = setInterval(() => {
  session.keepAlive().catch((error) => console.error("keepAlive:", error));
}, KEEPALIVE_MS);
keepAlive.unref();

const shutdown = async () => {
  httpServer.close();
  await session.close().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

httpServer.listen(PORT, HOST, () => {
  console.error(`midas-mcp HTTP servisi dinliyor: http://${HOST}:${PORT}/mcp`);
});
