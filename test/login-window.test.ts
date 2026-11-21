import assert from "node:assert/strict";
import { test } from "node:test";
import {
  askSmsCode,
  DEFAULT_KEEPALIVE_HOURS,
  extractSmsCode,
  parseIdleCloseMs,
  hiddenLaunchArgs,
  kwinHideScript,
  kwinRevealScript,
  LOGIN_WINDOW_CLASS,
  parseBusctlInt,
  parseKeepAliveMs,
  parseLoginMethod,
  parseLoginWindowMode,
} from "../src/login-window.js";

test("giriş penceresi kipi varsayılan olarak gizlidir ve eski görünür davranış seçilebilir", () => {
  assert.equal(parseLoginWindowMode(undefined), "hidden");
  assert.equal(parseLoginWindowMode(""), "hidden");
  assert.equal(parseLoginWindowMode("visible"), "visible");
  assert.equal(parseLoginWindowMode(" HEADLESS "), "headless");
  assert.throws(() => parseLoginWindowMode("gorunmez"), /MIDAS_LOGIN_WINDOW geçersiz/);
});

test("giriş doğrulaması varsayılan olarak bildirimdir, SMS seçilebilir", () => {
  assert.equal(parseLoginMethod(undefined), "push");
  assert.equal(parseLoginMethod(" SMS "), "sms");
  assert.throws(() => parseLoginMethod("otp"), /MIDAS_LOGIN_METHOD geçersiz/);
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

test("SMS kodu çıktıdaki 4-8 rakamdır; boşluk ve tire kabul edilir", () => {
  assert.equal(extractSmsCode("123456\n"), "123456");
  assert.equal(extractSmsCode(" 123 456 "), "123456");
  assert.equal(extractSmsCode("123-456"), "123456");
  assert.equal(extractSmsCode(""), null);
  assert.equal(extractSmsCode("12"), null);
  assert.equal(extractSmsCode("123456789"), null);
  assert.equal(extractSmsCode("abc123"), null);
});

const node = process.execPath;

test("SMS kodu komutu stdin'den hesap etiketini ve süreyi alır, kodu stdout'tan verir", async () => {
  // Komut stdin'i doğrular; beklenen veri gelmezse kod yerine boş yazar.
  const script =
    'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);' +
    'process.stdout.write(v.hesapEtiketi==="child"&&v.sureSn===60?"654321\\n":"")})';
  assert.equal(await askSmsCode([node, "-e", script], { hesapEtiketi: "child", sureSn: 60 }, 10_000), "654321");
});

test("SMS kodu komutu iptal ederse, hata verirse ya da kod yazmazsa null döner", async () => {
  assert.equal(await askSmsCode([node, "-e", "process.exit(1)"], { hesapEtiketi: null, sureSn: 60 }, 10_000), null);
  assert.equal(await askSmsCode([node, "-e", 'process.stdout.write("123456");process.exit(2)'], { hesapEtiketi: null, sureSn: 60 }, 10_000), null);
  assert.equal(await askSmsCode([node, "-e", 'process.stdout.write("tamam")'], { hesapEtiketi: null, sureSn: 60 }, 10_000), null);
  assert.equal(await askSmsCode(["/nonexistent/sms-command"], { hesapEtiketi: null, sureSn: 60 }, 10_000), null);
  assert.equal(await askSmsCode([node, "-e", "setTimeout(()=>{},5000)"], { hesapEtiketi: null, sureSn: 60 }, 300), null);
});

test("boşta kapanma süresi varsayılan 10 dakikadır, 0 kapatır, geçersiz değer reddedilir", () => {
  assert.equal(parseIdleCloseMs(undefined), 10 * 60_000);
  assert.equal(parseIdleCloseMs(" "), 10 * 60_000);
  assert.equal(parseIdleCloseMs("0"), 0);
  assert.equal(parseIdleCloseMs("2.5"), 150_000);
  assert.throws(() => parseIdleCloseMs("-1"), /MIDAS_IDLE_CLOSE_MINUTES/);
  assert.throws(() => parseIdleCloseMs("on"), /MIDAS_IDLE_CLOSE_MINUTES/);
});
