import * as dotenv from "dotenv";
import * as path from "node:path";
import * as url from "node:url";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (copy .env.example and fill it in)`);
  return v;
}

export const config = {
  phone: required("MIDAS_PHONE"),
  password: required("MIDAS_PASSWORD"),
  /** An additional safety ceiling; desktop approval is still mandatory below this value. */
  maxOrderValueTry: Number(process.env.MAX_ORDER_VALUE_TRY ?? 10_000),
  headless: (process.env.HEADLESS ?? "true").toLowerCase() !== "false",
  sessionDir: path.join(PROJECT_ROOT, ".midas-session"),
  /** Snapshot of cookies + localStorage, including the session cookies Chromium would drop. */
  stateFile: path.join(PROJECT_ROOT, ".midas-state.json"),
  orderLogFile: path.join(PROJECT_ROOT, ".midas-orders.log.jsonl"),
  atlasUrl: "https://atlas.getmidas.com/",
  graphqlUrl: "https://api.atlas.getmidas.com/router-graphql",
  /** Sent as x-client-version; only needs to look like a real web build. */
  clientVersion: process.env.MIDAS_CLIENT_VERSION ?? "v1.133.0",
};

if (!Number.isFinite(config.maxOrderValueTry) || config.maxOrderValueTry <= 0) {
  throw new Error("MAX_ORDER_VALUE_TRY must be a positive number");
}
