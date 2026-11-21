import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { parseIdleCloseMs, parseKeepAliveMs, parseLoginMethod, parseLoginWindowMode } from "./login-window.js";
import { parseAccountLabel, resolveDataPaths } from "./instance.js";
import { parseCommandSetting } from "./command-setting.js";

/** Depo kökü (dist/ ya da src/ klasörünün bir üstü); yerel dosyalar burada tutulur. */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

loadDotenv({ path: join(PROJECT_ROOT, ".env") });

const env = process.env;

/** `MIDAS_DATA_DIR` yoksa oturum ve günlük dosyaları proje kökünde kalır (eski yerleri). */
const dataPaths = resolveDataPaths(env.MIDAS_DATA_DIR, PROJECT_ROOT, homedir());
if (env.MIDAS_DATA_DIR?.trim()) {
  mkdirSync(dirname(dataPaths.stateFile), { recursive: true, mode: 0o700 });
}

/** Atlas web uygulaması ve onun GraphQL geçidi. */
const ATLAS_ORIGIN = "https://atlas.getmidas.com";
const GATEWAY_ORIGIN = "https://api.atlas.getmidas.com";

function optionalEnv(key: string): string {
  return (env[key] ?? "").trim();
}

/** Ortamdan okunan ayarlar ve sabit adresler. */
export const config = {
  phone: optionalEnv("MIDAS_PHONE"),
  password: optionalEnv("MIDAS_PASSWORD"),
  /** Ek güvenlik tavanı; bu değerin altında da masaüstü onayı zorunludur. */
  maxOrderValueTry: Number(env.MAX_ORDER_VALUE_TRY ?? 10_000),
  /** Normal çalışmada tarayıcı başsız; yalnız HEADLESS=false görünür açar. */
  headless: env.HEADLESS?.toLowerCase() !== "false",
  /** Giriş gerektiğinde tarayıcı: hidden (varsayılan), visible (eski görünür pencere), headless. */
  loginWindow: parseLoginWindowMode(env.MIDAS_LOGIN_WINDOW),
  /** Formdan sonraki doğrulama: push (telefon bildirimi, varsayılan) ya da sms (kodu kullanıcı pencereye yazar). */
  loginMethod: parseLoginMethod(env.MIDAS_LOGIN_METHOD),
  /** SMS yolunda kodu soran komut (MIDAS_SMS_CODE_COMMAND, JSON dizi); yoksa kod Midas penceresine elle yazılır. */
  smsCodeCommand: parseCommandSetting("MIDAS_SMS_CODE_COMMAND", env.MIDAS_SMS_CODE_COMMAND),
  /** HTTP servisinde canlı tutma aralığı (MIDAS_KEEPALIVE_HOURS, varsayılan 4 sa; 0 kapatır). */
  keepAliveMs: parseKeepAliveMs(env.MIDAS_KEEPALIVE_HOURS),
  /** Boştaki tarayıcının kapanma süresi (MIDAS_IDLE_CLOSE_MINUTES, varsayılan 10 dk; 0 kapatır). */
  idleCloseMs: parseIdleCloseMs(env.MIDAS_IDLE_CLOSE_MINUTES),
  /** Birden çok hesapta hesabın okunur adı (MIDAS_ACCOUNT_LABEL); sonuçlarda ve onay penceresinde görünür. */
  accountLabel: parseAccountLabel(env.MIDAS_ACCOUNT_LABEL),
  /** Chromium'un kalıcı profil klasörü (MIDAS_DATA_DIR verilirse onun altında). */
  sessionDir: dataPaths.sessionDir,
  /** Çerez + localStorage anlık görüntüsü; Chromium'un atacağı oturum çerezleri dahil. */
  stateFile: dataPaths.stateFile,
  orderLogFile: dataPaths.orderLogFile,
  atlasUrl: `${ATLAS_ORIGIN}/`,
  graphqlUrl: `${GATEWAY_ORIGIN}/router-graphql`,
  /** x-client-version olarak gönderilir; yalnız gerçek bir web sürümüne benzemesi yeter. */
  clientVersion: env.MIDAS_CLIENT_VERSION ?? "v1.133.0",
};

if (!Number.isFinite(config.maxOrderValueTry) || config.maxOrderValueTry <= 0) {
  throw new Error("MAX_ORDER_VALUE_TRY pozitif bir sayı olmalı");
}
