import assert from "node:assert/strict";
import { test } from "node:test";
import { describeAuthExpiry, formatAuthExpiry } from "../src/auth-expiry.js";
import { describeKeepAlive, startKeepAliveLoop } from "../src/keepalive.js";

const SECRET = "gizli-imza-degeri";

function jwt(payload: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(payload)}.${SECRET}`;
}

const iat = Date.UTC(2026, 8, 19, 12, 29, 17) / 1000;
const state = {
  cookies: [
    { name: "refresh_token", value: jwt({ iat, exp: iat + 86_400, jti: "jti-gizli", user_name: "5550000000" }) },
    { name: "access_token", value: jwt({ iat, exp: iat + 900 }) },
  ],
  origins: [
    {
      origin: "https://atlas.getmidas.com",
      localStorage: [
        { name: "midas:access-expiry", value: String((iat + 900) * 1000) },
        { name: "midas:refresh-expiry", value: String((iat + 86_400) * 1000) },
        { name: "midas:member-uid", value: "uye-gizli" },
      ],
    },
  ],
};

test("storageState'ten yalnız süre bilgisi çıkarılır", () => {
  const expiry = describeAuthExpiry(state);
  assert.deepEqual(expiry, {
    accessExpiry: (iat + 900) * 1000,
    refreshExpiry: (iat + 86_400) * 1000,
    refreshIssuedAt: iat * 1000,
    refreshTokenExp: (iat + 86_400) * 1000,
  });
  const line = formatAuthExpiry(expiry, iat * 1000 + 3_600_000);
  assert.match(line, /kalan 23\.0 sa/);
  for (const secret of [SECRET, "jti-gizli", "5550000000", "uye-gizli", state.cookies[0].value]) {
    assert.ok(!line.includes(secret), "log satırı token ya da hesap verisi içermemeli");
  }
});

test("bozuk ya da eksik durum süre bilgisini boş bırakır", () => {
  assert.deepEqual(describeAuthExpiry({ cookies: [{ name: "refresh_token", value: "bozuk" }] }), {
    accessExpiry: null,
    refreshExpiry: null,
    refreshIssuedAt: null,
    refreshTokenExp: null,
  });
  assert.match(formatAuthExpiry(describeAuthExpiry({})), /kalan \?/);
});

test("canlı tutma sonucu loga giriş başlatmadığını söyleyerek yazılır", () => {
  assert.match(describeKeepAlive({ status: "logged-out" }), /giriş başlatılmadı/);
  assert.match(describeKeepAlive({ status: "skipped", reason: "giriş sürüyor" }), /atlandı \(giriş sürüyor\)/);
  assert.match(describeKeepAlive({ status: "alive", expiry: describeAuthExpiry(state) }), /oturum canlı/);
});

test("döngü 0 aralıkla kurulmaz; turlar üst üste binmez ve hata loglanır", async () => {
  let ticks = 0;
  startKeepAliveLoop({ intervalMs: 0, initialDelayMs: 0, tick: async () => { ticks++; return { status: "logged-out" }; }, log: () => {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ticks, 0);

  const lines: string[] = [];
  let release!: () => void;
  let concurrent = 0;
  let maxConcurrent = 0;
  const stop = startKeepAliveLoop({
    intervalMs: 5,
    initialDelayMs: 0,
    tick: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((r) => (release = r));
      concurrent--;
      throw new Error("ağ yok");
    },
    log: (line) => lines.push(line),
  });
  await new Promise((r) => setTimeout(r, 40));
  release();
  await new Promise((r) => setTimeout(r, 5));
  stop();
  assert.equal(maxConcurrent, 1);
  assert.ok(lines.some((l) => l === "keepAlive: hata: ağ yok"));
});
