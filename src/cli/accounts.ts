/**
 * CLI'nın nereye bağlanacağı: yerel kip (paket süreç içinde) ya da uzak kip (çalışan HTTP MCP servisi).
 *
 * Sıra: `--local` → `--server` (+ `--token-file`) → `--account` (hesap dosyası) → dosyadaki `default` → yerel.
 * Hesap adları koda yazılmaz; kullanıcının `accounts.json` dosyasından gelir.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineMessages } from "../i18n.js";

const M = defineMessages(
  {
    noFile: (file: string) => `Hesap dosyası yok: ${file}. --server ile adres verin ya da dosyayı oluşturun (README, "Komut satırı").`,
    badFile: (file: string, why: string) => `Hesap dosyası okunamadı (${file}): ${why}`,
    unknownAccount: (name: string, known: string) => `Bilinmeyen hesap: ${name}. Dosyadaki hesaplar: ${known || "yok"}`,
    noServer: (name: string) => `"${name}" hesabında server adresi yok`,
    badUrl: (url: string) => `Geçersiz sunucu adresi: ${url}`,
    noToken: (file: string, why: string) => `Jeton dosyası okunamadı (${file}): ${why}`,
    emptyToken: (file: string) => `Jeton dosyası boş: ${file}`,
    localWithServer: "--local ile --server ya da --account birlikte verilemez",
  },
  {
    noFile: (file) => `No accounts file: ${file}. Give an address with --server or create the file (README, "Command line").`,
    badFile: (file, why) => `Couldn't read the accounts file (${file}): ${why}`,
    unknownAccount: (name, known) => `Unknown account: ${name}. Accounts in the file: ${known || "none"}`,
    noServer: (name) => `Account "${name}" has no server address`,
    badUrl: (url) => `Invalid server address: ${url}`,
    noToken: (file, why) => `Couldn't read the token file (${file}): ${why}`,
    emptyToken: (file) => `The token file is empty: ${file}`,
    localWithServer: "--local can't be combined with --server or --account",
  }
);

export type Target =
  | { kind: "local" }
  | { kind: "remote"; url: string; token: string; account: string | null };

export interface TargetOptions {
  local?: boolean;
  server?: string;
  tokenFile?: string;
  account?: string;
}

interface AccountEntry {
  server?: string;
  token_file?: string;
}

interface AccountsFile {
  default?: string;
  accounts?: Record<string, AccountEntry>;
}

export interface TargetDeps {
  env?: NodeJS.ProcessEnv;
  home?: string;
  readFile?: (file: string) => string;
}

function configDir(env: NodeJS.ProcessEnv, home: string): string {
  return join(env.XDG_CONFIG_HOME?.trim() || join(home, ".config"), "mcp-midas");
}

export function accountsFilePath(deps: TargetDeps = {}): string {
  return join(configDir(deps.env ?? process.env, deps.home ?? homedir()), "accounts.json");
}

function expandHome(file: string, home: string): string {
  return file === "~" ? home : file.startsWith("~/") ? join(home, file.slice(2)) : file;
}

function errorText(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? (error instanceof Error ? error.message : String(error));
}

export function resolveTarget(options: TargetOptions, deps: TargetDeps = {}): Target {
  const env = deps.env ?? process.env;
  const home = deps.home ?? homedir();
  const read = deps.readFile ?? ((file: string) => readFileSync(file, "utf8"));

  if (options.local) {
    if (options.server || options.account) throw new Error(M().localWithServer);
    return { kind: "local" };
  }

  const readToken = (file: string): string => {
    const path = expandHome(file, home);
    let token: string;
    try {
      token = read(path).trim();
    } catch (error) {
      throw new Error(M().noToken(path, errorText(error)));
    }
    if (!token) throw new Error(M().emptyToken(path));
    return token;
  };

  const remote = (url: string, tokenFile: string, account: string | null): Target => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(M().badUrl(url));
    }
    return { kind: "remote", url, token: readToken(tokenFile), account };
  };

  // Sunucunun kendi varsayılan jeton yeri (http.ts ile aynı).
  const defaultTokenFile = env.MIDAS_TOKEN_FILE?.trim() || join(configDir(env, home), "token");

  if (options.server) return remote(options.server, options.tokenFile ?? defaultTokenFile, null);

  const file = accountsFilePath({ env, home });
  let parsed: AccountsFile | null = null;
  try {
    parsed = JSON.parse(read(file)) as AccountsFile;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
    if (!missing) throw new Error(M().badFile(file, errorText(error)));
    if (options.account) throw new Error(M().noFile(file));
    return { kind: "local" };
  }

  const accounts = parsed.accounts ?? {};
  const name = options.account ?? parsed.default;
  if (!name) return { kind: "local" };
  const entry = Object.hasOwn(accounts, name) ? accounts[name] : undefined;
  if (!entry) throw new Error(M().unknownAccount(name, Object.keys(accounts).join(", ")));
  if (!entry.server) throw new Error(M().noServer(name));
  return remote(entry.server, options.tokenFile ?? entry.token_file ?? defaultTokenFile, name);
}
