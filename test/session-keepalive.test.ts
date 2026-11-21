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
  s.openBrowser = async (mode: string) => {
    calls.push(`launch:${mode}`);
    open = true;
    s.page = { isClosed: () => !open, url: () => "https://atlas.getmidas.com/dashboard", reload: async () => calls.push("reload"), waitForTimeout: async () => {} };
  };
  s.shutdownBrowser = async () => {
    calls.push("close");
    open = false;
    s.page = null;
  };
  s.isAuthenticated = async () => authenticated;
  s.interactiveLogin = async () => calls.push("interactiveLogin");
  s.awaitRequestId = async () => {};
  s.loadMemberUid = async () => {};
  s.persistState = async () => {
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
  assert.deepEqual(calls, ["launch:headless", "saveState", "saveState", "close"]);
  assert.equal(s.isStarted(), false, "yoklama bitince tarayıcı kapanmalı");
  assert.ok(!calls.includes("interactiveLogin"));
});

test("oturum 401 verirse canlı tutma bir kez yeniden yükler, düzelmezse tarayıcıyı kapatır", async () => {
  const { s, calls } = fakeSession(true);
  await s.ensureStarted();
  calls.length = 0;
  let answers = [false, false];
  s.isAuthenticated = async () => answers.shift() ?? false;
  assert.deepEqual(await s.keepAlive(), { status: "logged-out" });
  assert.deepEqual(calls, ["reload", "close"]);
  assert.equal(s.isStarted(), false, "düşmüş oturumun tarayıcısı kapanmalı");
  assert.ok(!calls.includes("interactiveLogin"));
  s.close();
});

test("canlı tutma kendi açtığı tarayıcıyı kapatır, araç çağrısının açtığını kapatmaz", async () => {
  const { s, calls } = fakeSession(true);
  assert.equal((await s.keepAlive()).status, "alive");
  assert.ok(calls.includes("close"), "kimsenin kullanmadığı tarayıcı yoklama bitince kapanmalı");
  assert.equal(s.isStarted(), false);

  calls.length = 0;
  await s.ensureStarted();
  assert.equal((await s.keepAlive()).status, "alive");
  assert.equal(s.isStarted(), true, "araç çağrısının açık tarayıcısı canlı tutmayla kapanmamalı");
  assert.ok(!calls.includes("close"));
  assert.ok(!calls.includes("interactiveLogin"));
  s.close();
});

test("MIDAS_IDLE_CLOSE_MINUTES=0 iken canlı tutma tarayıcıyı açık bırakır (eski davranış)", async () => {
  const { s, calls } = fakeSession(true);
  s.idleCloseMs = 0;
  assert.equal((await s.keepAlive()).status, "alive");
  assert.equal(s.isStarted(), true);
  assert.ok(!calls.includes("close"));
});

test("araç çağrısının açtığı tarayıcı boşta kalınca durumu kaydedip kapanır, yeni çağrı sessizce yeniden açar", async () => {
  const { s, calls } = fakeSession(true);
  s.idleCloseMs = 100;
  await s.ensureStarted();
  assert.equal(s.isStarted(), true, "çağrı sırasında tarayıcı açık kalmalı");
  calls.length = 0;

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(s.isStarted(), false, "boşta süre dolunca tarayıcı kapanmalı");
  assert.deepEqual(calls, ["saveState", "close"], "kapanmadan önce son token'lar kaydedilmeli");

  await s.ensureStarted();
  assert.equal(s.isStarted(), true, "yeni çağrı tarayıcıyı yeniden açmalı");
  assert.ok(!calls.includes("interactiveLogin"), "kayıtlı oturumla yeniden açılış giriş istememeli");
  s.close();
});

test("art arda gelen çağrılar boşta kapanmayı erteler", async () => {
  const { s } = fakeSession(true);
  s.idleCloseMs = 200;
  await s.ensureStarted();
  await new Promise((resolve) => setTimeout(resolve, 120));
  await s.getPage();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(s.isStarted(), true, "aradaki çağrı süreyi sıfırlamalı");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(s.isStarted(), false, "son çağrıdan sonra süre dolunca kapanmalı");
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
