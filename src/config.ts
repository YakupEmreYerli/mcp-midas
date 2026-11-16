import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { parseKeepAliveMs, parseLoginMethod, parseLoginWindowMode } from "./login-window.js";

/** Depo kökü (dist/ ya da src/ klasörünün bir üstü); yerel dosyalar burada tutulur. */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadDotenv({ path: join(PROJECT_ROOT, ".env") });

const env = process.env;

/** Atlas web uygulaması ve onun GraphQL geçidi. */
const ATLAS_ORIGIN = "https://atlas.getmidas.com";
const GATEWAY_ORIGIN = "https://api.atlas.getmidas.com";

function mustHave(key: string): string {
  const value = env[key];
  if (value) return value;
  throw new Error(`${key} eksik: ortam değişkeni olarak ver ya da .env.example'ı .env olarak kopyalayıp doldur`);
}

/** Ortamdan okunan ayarlar ve sabit adresler. */
export const config = {
  phone: mustHave("MIDAS_PHONE"),
  password: mustHave("MIDAS_PASSWORD"),
  /** Ek güvenlik tavanı; bu değerin altında da masaüstü onayı zorunludur. */
  maxOrderValueTry: Number(env.MAX_ORDER_VALUE_TRY ?? 10_000),
  /** Normal çalışmada tarayıcı başsız; yalnız HEADLESS=false görünür açar. */
  headless: env.HEADLESS?.toLowerCase() !== "false",
  /** Giriş gerektiğinde tarayıcı: hidden (varsayılan), visible (eski görünür pencere), headless. */
  loginWindow: parseLoginWindowMode(env.MIDAS_LOGIN_WINDOW),
  /** Formdan sonraki doğrulama: push (telefon bildirimi, varsayılan) ya da sms (kodu kullanıcı pencereye yazar). */
  loginMethod: parseLoginMethod(env.MIDAS_LOGIN_METHOD),
  /** HTTP servisinde canlı tutma aralığı (MIDAS_KEEPALIVE_HOURS, varsayılan 4 sa; 0 kapatır). */
  keepAliveMs: parseKeepAliveMs(env.MIDAS_KEEPALIVE_HOURS),
  /** Chromium'un kalıcı profil klasörü. */
  sessionDir: join(PROJECT_ROOT, ".midas-session"),
  /** Çerez + localStorage anlık görüntüsü; Chromium'un atacağı oturum çerezleri dahil. */
  stateFile: join(PROJECT_ROOT, ".midas-state.json"),
  orderLogFile: join(PROJECT_ROOT, ".midas-orders.log.jsonl"),
  atlasUrl: `${ATLAS_ORIGIN}/`,
  graphqlUrl: `${GATEWAY_ORIGIN}/router-graphql`,
  /** x-client-version olarak gönderilir; yalnız gerçek bir web sürümüne benzemesi yeter. */
  clientVersion: env.MIDAS_CLIENT_VERSION ?? "v1.133.0",
};

if (!Number.isFinite(config.maxOrderValueTry) || config.maxOrderValueTry <= 0) {
  throw new Error("MAX_ORDER_VALUE_TRY pozitif bir sayı olmalı");
}
