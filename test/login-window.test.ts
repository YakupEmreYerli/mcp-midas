import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_KEEPALIVE_HOURS,
  hiddenLaunchArgs,
  kwinHideScript,
  kwinRevealScript,
  LOGIN_WINDOW_CLASS,
  parseBusctlInt,
  parseKeepAliveMs,
  parseLoginWindowMode,
} from "../src/login-window.js";

test("giriş penceresi kipi varsayılan olarak gizlidir ve eski görünür davranış seçilebilir", () => {
  assert.equal(parseLoginWindowMode(undefined), "hidden");
  assert.equal(parseLoginWindowMode(""), "hidden");
  assert.equal(parseLoginWindowMode("visible"), "visible");
  assert.equal(parseLoginWindowMode(" HEADLESS "), "headless");
  assert.throws(() => parseLoginWindowMode("gorunmez"), /MIDAS_LOGIN_WINDOW geçersiz/);
});

test("canlı tutma aralığı saatten milisaniyeye çevrilir, 0 döngüyü kapatır", () => {
  assert.equal(parseKeepAliveMs(undefined), DEFAULT_KEEPALIVE_HOURS * 3_600_000);
  assert.equal(parseKeepAliveMs("4"), 4 * 3_600_000);
  assert.equal(parseKeepAliveMs("0.5"), 30 * 60_000);
  assert.equal(parseKeepAliveMs("0"), 0);
  assert.equal(parseKeepAliveMs("0.001"), 5 * 60_000, "alt sınır 5 dakika");
  assert.throws(() => parseKeepAliveMs("-1"), /MIDAS_KEEPALIVE_HOURS/);
  assert.throws(() => parseKeepAliveMs("dört"), /MIDAS_KEEPALIVE_HOURS/);
});

test("gizli pencere yalnız X11 ekranı varsa XWayland'a ve ayırt edici sınıfa zorlanır", () => {
  assert.deepEqual(hiddenLaunchArgs({ DISPLAY: ":0" }), ["--ozone-platform=x11", `--class=${LOGIN_WINDOW_CLASS}`]);
  assert.deepEqual(hiddenLaunchArgs({}), []);
});

test("KWin betikleri yalnız giriş penceresinin sınıfına dokunur", () => {
  const hide = kwinHideScript();
  assert.match(hide, new RegExp(`const SINIF = "${LOGIN_WINDOW_CLASS}"`));
  assert.match(hide, /w\.resourceClass !== SINIF\) return/);
  for (const property of ["minimized = true", "skipTaskbar = true", "opacity = 0", "keepBelow = true"]) {
    assert.ok(hide.includes(property), property);
  }
  const reveal = kwinRevealScript();
  assert.match(reveal, /w\.resourceClass !== SINIF\) return/);
  assert.ok(reveal.includes("minimized = false") && reveal.includes("opacity = 1"));
  // Sınıf adı betiğe JSON olarak gömülür; tırnak betikten kaçamaz.
  assert.ok(kwinHideScript('x"; evil(); "').includes(JSON.stringify('x"; evil(); "')));
});

test("busctl betik kimliği ayrıştırılır, hata ve negatif kimlik yok sayılır", () => {
  assert.equal(parseBusctlInt("i 3\n"), 3);
  assert.equal(parseBusctlInt("i -1"), null);
  assert.equal(parseBusctlInt(null), null);
  assert.equal(parseBusctlInt("b true"), null);
});
