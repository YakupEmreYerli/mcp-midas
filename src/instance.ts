/**
 * Aynı makinede birden çok Midas hesabı için örnek ayarları: veri dizini ve hesap etiketi.
 *
 * `config.ts`'i içe aktarmaz; ayrıştırma kimlik bilgisi istemeden test edilebilsin diye saf
 * tutulur. Her hesap ayrı bir süreçtir (ayrı port, token, kimlik bilgisi, veri dizini).
 */
import * as path from "node:path";
import { defineMessages, type Lang } from "./i18n.js";

const M = defineMessages(
  {
    dataDirAbsolute: (value: string | undefined) => `MIDAS_DATA_DIR mutlak bir yol olmalı: "${value}"`,
    labelControl: "MIDAS_ACCOUNT_LABEL denetim karakteri içeremez",
    labelLength: (max: number) => `MIDAS_ACCOUNT_LABEL en çok ${max} karakter olabilir`,
    instructions: (label: string) =>
      `Bu MCP sunucusu yalnız "${label}" etiketli Midas hesabına bağlıdır. Aynı istemcide başka Midas ` +
      `sunucuları (başka hesaplar) olabilir: verileri ve emirleri birbirine karıştırma, her sonucu ` +
      `"Hesap: ${label}" diye bu hesaba bağla. Hangi hesabın kastedildiği belirsizse önce sor. ` +
      `get_session_status giriş başlatmadan oturumun açık olup olmadığını söyler; diğer araçlar oturum ` +
      `kapalıysa giriş başlatır ve hesap sahibinin telefonuna onay bildirimi gönderir.`,
    accountLine: (label: string) => `Hesap: ${label}`,
  },
  {
    dataDirAbsolute: (value) => `MIDAS_DATA_DIR must be an absolute path: "${value}"`,
    labelControl: "MIDAS_ACCOUNT_LABEL can't contain control characters",
    labelLength: (max) => `MIDAS_ACCOUNT_LABEL can be at most ${max} characters`,
    instructions: (label) =>
      `This MCP server is connected only to the Midas account labeled "${label}". The same client may ` +
      `have other Midas servers (other accounts): never mix their data or orders, and attribute every ` +
      `result to this account as "Account: ${label}". If it's unclear which account is meant, ask first. ` +
      `get_session_status tells whether the session is open without starting a login; the other tools ` +
      `start a login when the session is closed, which sends an approval notification to the account ` +
      `owner's phone.`,
    accountLine: (label) => `Account: ${label}`,
  }
);

export interface DataPaths {
  /** Playwright kalıcı tarayıcı profili. */
  sessionDir: string;
  /** Çerez + localStorage anlık görüntüsü. */
  stateFile: string;
  /** Emir denetim günlüğü. */
  orderLogFile: string;
}

/**
 * Oturum dizini, durum dosyası ve emir günlüğünün yolları. `MIDAS_DATA_DIR` verilmezse eski
 * yerler (proje kökü) kullanılır; mevcut kurulumların dosyaları yer değiştirmez.
 */
export function resolveDataPaths(value: string | undefined, projectRoot: string, home?: string): DataPaths {
  const raw = (value ?? "").trim();
  let dir = projectRoot;
  if (raw) {
    const expanded = home && (raw === "~" || raw.startsWith("~/")) ? path.join(home, raw.slice(1)) : raw;
    if (!path.isAbsolute(expanded)) {
      throw new Error(M().dataDirAbsolute(value));
    }
    dir = path.resolve(expanded);
  }
  return {
    sessionDir: path.join(dir, ".midas-session"),
    stateFile: path.join(dir, ".midas-state.json"),
    orderLogFile: path.join(dir, ".midas-orders.log.jsonl"),
  };
}

export const ACCOUNT_LABEL_MAX = 40;

/**
 * `MIDAS_ACCOUNT_LABEL`: insanın ve ajanın hesapları karıştırmaması için kısa, okunur ad
 * (ör. "parent", "child"). Boşsa null. Denetim karakteri ve aşırı uzunluk reddedilir: etiket onay
 * penceresinde, bildirimlerde ve araç sonuçlarında aynen gösterilir.
 */
export function parseAccountLabel(value: string | undefined): string | null {
  const label = (value ?? "").trim();
  if (!label) return null;
  if (/[\u0000-\u001f\u007f]/.test(label)) {
    throw new Error(M().labelControl);
  }
  if ([...label].length > ACCOUNT_LABEL_MAX) {
    throw new Error(M().labelLength(ACCOUNT_LABEL_MAX));
  }
  return label;
}

/** MCP sunucusunun adı; etiket varsa istemci listesinde hesap görünür. */
export function serverName(label: string | null): string {
  return label ? `midas-mcp (${label})` : "midas-mcp";
}

/** Etiketli sunucunun ajana verdiği yönerge; etiketsiz kurulumda yönerge yoktur. */
export function serverInstructions(label: string | null, lang?: Lang): string | undefined {
  if (!label) return undefined;
  return M(lang).instructions(label);
}

/** Her araç sonucuna eklenen hesap satırı. */
export function accountLine(label: string, lang?: Lang): string {
  return M(lang).accountLine(label);
}
