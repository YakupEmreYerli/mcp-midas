import * as dotenv from "dotenv";
import * as path from "node:path";
import * as url from "node:url";
import { parseKeepAliveMs, parseLoginWindowMode } from "./login-window.js";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} eksik: ortam değişkeni olarak ver ya da .env.example'ı .env olarak kopyalayıp doldur`);
  return v;
}

export const config = {
  phone: required("MIDAS_PHONE"),
  password: required("MIDAS_PASSWORD"),
  /** Ek güvenlik tavanı; bu değerin altında da masaüstü onayı zorunludur. */
  maxOrderValueTry: Number(process.env.MAX_ORDER_VALUE_TRY ?? 10_000),
  headless: (process.env.HEADLESS ?? "true").toLowerCase() !== "false",
  /** Giriş gerektiğinde tarayıcı: hidden (varsayılan), visible (eski görünür pencere), headless. */
  loginWindow: parseLoginWindowMode(process.env.MIDAS_LOGIN_WINDOW),
  /** HTTP servisinde canlı tutma aralığı (MIDAS_KEEPALIVE_HOURS, varsayılan 4 sa; 0 kapatır). */
  keepAliveMs: parseKeepAliveMs(process.env.MIDAS_KEEPALIVE_HOURS),
  sessionDir: path.join(PROJECT_ROOT, ".midas-session"),
  /** Çerez + localStorage anlık görüntüsü; Chromium'un atacağı oturum çerezleri dahil. */
  stateFile: path.join(PROJECT_ROOT, ".midas-state.json"),
  orderLogFile: path.join(PROJECT_ROOT, ".midas-orders.log.jsonl"),
  atlasUrl: "https://atlas.getmidas.com/",
  graphqlUrl: "https://api.atlas.getmidas.com/router-graphql",
  /** x-client-version olarak gönderilir; yalnız gerçek bir web sürümüne benzemesi yeter. */
  clientVersion: process.env.MIDAS_CLIENT_VERSION ?? "v1.133.0",
};

if (!Number.isFinite(config.maxOrderValueTry) || config.maxOrderValueTry <= 0) {
  throw new Error("MAX_ORDER_VALUE_TRY pozitif bir sayı olmalı");
}
