/**
 * Aynı makinede birden çok Midas hesabı için örnek ayarları: veri dizini ve hesap etiketi.
 *
 * `config.ts`'i içe aktarmaz; ayrıştırma kimlik bilgisi istemeden test edilebilsin diye saf
 * tutulur. Her hesap ayrı bir süreçtir (ayrı port, token, kimlik bilgisi, veri dizini).
 */
import * as path from "node:path";

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
      throw new Error(`MIDAS_DATA_DIR mutlak bir yol olmalı: "${value}"`);
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
    throw new Error("MIDAS_ACCOUNT_LABEL denetim karakteri içeremez");
  }
  if ([...label].length > ACCOUNT_LABEL_MAX) {
    throw new Error(`MIDAS_ACCOUNT_LABEL en çok ${ACCOUNT_LABEL_MAX} karakter olabilir`);
  }
  return label;
}

/** MCP sunucusunun adı; etiket varsa istemci listesinde hesap görünür. */
export function serverName(label: string | null): string {
  return label ? `midas-mcp (${label})` : "midas-mcp";
}

/** Etiketli sunucunun ajana verdiği yönerge; etiketsiz kurulumda yönerge yoktur. */
export function serverInstructions(label: string | null): string | undefined {
  if (!label) return undefined;
  return (
    `Bu MCP sunucusu yalnız "${label}" etiketli Midas hesabına bağlıdır. Aynı istemcide başka Midas ` +
    `sunucuları (başka hesaplar) olabilir: verileri ve emirleri birbirine karıştırma, her sonucu ` +
    `"Hesap: ${label}" diye bu hesaba bağla. Hangi hesabın kastedildiği belirsizse önce sor. ` +
    `get_session_status giriş başlatmadan oturumun açık olup olmadığını söyler; diğer araçlar oturum ` +
    `kapalıysa giriş başlatır ve hesap sahibinin telefonuna onay bildirimi gönderir.`
  );
}

/** Her araç sonucuna eklenen hesap satırı. */
export function accountLine(label: string): string {
  return `Hesap: ${label}`;
}
