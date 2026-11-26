/**
 * CLI her iki kipte de bir MCP istemcisidir: yerelde süreç içi sunucuya (InMemoryTransport), uzakta
 * çalışan HTTP servisine bağlanır. Araç şeması, emir bayrağı ve onay kapısı tek yerde, sunucuda kalır.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Target } from "./accounts.js";

/** Bir araç çağrısının CLI'nın kullandığı hâli. */
export interface ToolResult {
  /** `content[0]` JSON ise ayrıştırılmış değeri, değilse metnin kendisi. */
  data: unknown;
  /** `content[0]` ham metni (--json bunu basar). */
  raw: string;
  /** Sunucunun eklediği hesap satırı ("Hesap: …"), varsa. */
  accountLine: string | null;
  isError: boolean;
}

export interface ToolCaller {
  call(name: string, args: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<ToolResult>;
  toolNames(): Promise<string[]>;
  close(): Promise<void>;
}

/** Okuma araçları için istek zaman aşımı (giriş akışı da sürebilir). */
export const READ_TIMEOUT_MS = 180_000;
/** Yazma araçları: onay penceresi 120 sn, telefon dalı 30 sn + telefon beklemesi; SDK varsayılanı (60 sn) yetmez. */
export const WRITE_TIMEOUT_MS = 600_000;

export function toToolResult(result: any): ToolResult {
  const parts: Array<{ type: string; text?: string }> = Array.isArray(result?.content) ? result.content : [];
  const raw = parts[0]?.type === "text" ? (parts[0].text ?? "") : "";
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // Hata metni ya da düz metin: olduğu gibi kalır.
  }
  const accountLine = parts.slice(1).find((p) => p.type === "text")?.text ?? null;
  return { data, raw, accountLine, isError: result?.isError === true };
}

export function clientFor(client: Client, onClose: () => Promise<void> = async () => {}): ToolCaller {
  return {
    async call(name, args, options = {}) {
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: options.timeoutMs ?? READ_TIMEOUT_MS,
      });
      return toToolResult(result);
    },
    async toolNames() {
      return (await client.listTools()).tools.map((t) => t.name);
    },
    async close() {
      await client.close().catch(() => {});
      await onClose();
    },
  };
}

const CLIENT_INFO = { name: "midas-cli", version: "1" };

export async function connectRemote(url: string, token: string): Promise<ToolCaller> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client(CLIENT_INFO);
  await client.connect(transport);
  return clientFor(client);
}

/** Yerel kip: sunucu modülü yalnız burada yüklenir (kimlik bilgisini içe aktarımda ister). */
export async function connectLocal(): Promise<ToolCaller> {
  const [{ createServer }, { session }] = await Promise.all([import("../server.js"), import("../session.js")]);
  const server = createServer();
  const client = new Client(CLIENT_INFO);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return clientFor(client, async () => {
    await server.close().catch(() => {});
    // Tarayıcı kapanır ve oturum kaydedilir; yoksa süreç açık kalır.
    await session.close().catch(() => {});
  });
}

export function connect(target: Target): Promise<ToolCaller> {
  return target.kind === "local" ? connectLocal() : connectRemote(target.url, target.token);
}
