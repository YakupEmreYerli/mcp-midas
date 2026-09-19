import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

process.env.MIDAS_PHONE ??= "5550000000";
process.env.MIDAS_PASSWORD ??= "test-only";

const { config } = await import("../src/config.js");
const { MidasSession } = await import("../src/session.js");

// Gerçek oturum dosyasına asla dokunulmasın.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-midas-test-"));
config.stateFile = path.join(dir, "state.json");
fs.writeFileSync(config.stateFile, "{}");

/** Tarayıcı açmayan, ağa çıkmayan sahte oturum: yalnız çağrıları kaydeder. */
function fakeSession(authenticated: boolean) {
  const s = new MidasSession({ headless: true }) as any;
  const calls: string[] = [];
  let open = false;
  s.launch = async (mode: string) => {
    calls.push(`launch:${mode}`);
    open = true;
    s.page = { isClosed: () => !open, url: () => "https://atlas.getmidas.com/dashboard", reload: async () => calls.push("reload"), waitForTimeout: async () => {} };
  };
  s.closeContext = async () => {
    calls.push("close");
    open = false;
    s.page = null;
  };
  s.isAuthenticated = async () => authenticated;
  s.interactiveLogin = async () => calls.push("interactiveLogin");
  s.waitForRid = async () => {};
  s.readMemberUid = async () => {};
  s.saveState = async () => {
    calls.push("saveState");
    return null;
  };
  return { s, calls };
}

test("canlı tutma düşmüş oturumda giriş başlatmaz ve kayıtlı durumu silmez", async () => {
  const { s, calls } = fakeSession(false);
  const result = await s.keepAlive();
  assert.deepEqual(result, { status: "logged-out" });
  assert.deepEqual(calls, ["launch:headless", "close"]);
  assert.ok(fs.existsSync(config.stateFile), "durum dosyası silinmemeli");
  assert.equal(s.isStarted(), false, "sonraki araç çağrısı tam açılış yapabilmeli");
});

test("canlı tutma geçerli oturumu başsız açar ve durumu kaydeder", async () => {
  const { s, calls } = fakeSession(true);
  const result = await s.keepAlive();
  assert.equal(result.status, "alive");
  assert.deepEqual(calls, ["launch:headless", "saveState", "saveState"]);
  assert.ok(!calls.includes("interactiveLogin"));
});

test("açık oturumda canlı tutma yalnız yoklar; 401 olursa bir kez yeniden yükler", async () => {
  const { s, calls } = fakeSession(true);
  await s.keepAlive();
  calls.length = 0;
  let answers = [false, false];
  s.isAuthenticated = async () => answers.shift() ?? false;
  assert.deepEqual(await s.keepAlive(), { status: "logged-out" });
  assert.deepEqual(calls, ["reload"]);
  assert.ok(!calls.includes("interactiveLogin"));
});

test("araç çağrısının açılışı düşmüş oturumda giriş akışına gider", async () => {
  const { s, calls } = fakeSession(false);
  await s.ensureStarted();
  assert.ok(calls.includes("interactiveLogin"));
  assert.ok(!fs.existsSync(config.stateFile), "bayat anlık görüntü girişten önce silinir");
});

test("sessiz açılış sürerken gelen araç çağrısı, açılış başarısızsa kendi girişini başlatır", async () => {
  const { s, calls } = fakeSession(false);
  const quiet = s.keepAlive();
  const tool = s.ensureStarted();
  assert.deepEqual(await quiet, { status: "logged-out" });
  await tool;
  assert.ok(calls.includes("interactiveLogin"), "araç çağrısı SessionUnavailable ile düşmemeli");
});
