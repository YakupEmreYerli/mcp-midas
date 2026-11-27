import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MIDAS_LANG = "tr";
const sso = await import("../src/sso-error.js");
const { ssoFailure, loginStep } = sso;

const ATLAS = "https://atlas.getmidas.com";

test("Atlas'ın SSO hata adresi durum ve başvuru kimliğiyle tanınır", () => {
  const url =
    "https://atlas.getmidas.com/login?error=sso_failed&error_description=SSO+giri%C5%9Fi+ba%C5%9Far%C4%B1s%C4%B1z+oldu&error_status=403&error_ref=0c0fee8f3714411d8c3";
  assert.deepEqual(ssoFailure(url, ATLAS), {
    error: "sso_failed",
    status: "403",
    ref: "0c0fee8f3714411d8c3",
    description: "SSO girişi başarısız oldu",
  });
});

test("hatasız giriş ve başka siteler hata sayılmaz", () => {
  assert.equal(ssoFailure("https://atlas.getmidas.com/login", ATLAS), null);
  assert.equal(ssoFailure("https://atlas.getmidas.com/dashboard", ATLAS), null);
  assert.equal(ssoFailure("https://sso.getmidas.com/giris/mobil-onay?error=x", ATLAS), null);
  assert.equal(ssoFailure("https://evil.example/login?error=sso_failed", ATLAS), null);
  assert.equal(ssoFailure("bozuk adres", ATLAS), null);
});

test("adım satırı yalnız alan ve yolu taşır; kod, state ve telefon gibi sorgu alanları girmez", () => {
  const line = loginStep("https://atlas.getmidas.com/auth/callback?code=gizli-kod&state=gizli-state");
  assert.equal(line, "atlas.getmidas.com/auth/callback");
  assert.ok(!line.includes("gizli"));
  assert.equal(loginStep("bozuk"), "?");
});

test("sayfa denetimlerinin adları sadeleşir; rakamlar (telefon gibi) maskelenir, boş ve tekrar düşer", () => {
  const { controlLabels } = sso;
  assert.deepEqual(controlLabels(["  SMS ile\n giriş yap ", "", "Kod 123456 gönderildi", "SMS ile giriş yap", "x".repeat(80)]), [
    "SMS ile giriş yap",
    "Kod •••••• gönderildi",
    "x".repeat(60),
  ]);
});

test("iz gövdesinde token, uzun gizli dizi ve uzun rakam dizisi maskelenir; başvuru kimliği kalır", () => {
  const { redactTrace } = sso;
  const jwt = ["eyJ" + "a".repeat(8), "b".repeat(8), "c".repeat(8)].join(".");
  const secret = "a".repeat(45);
  const ref = "0123456789abcdef0123456789abcdef";
  const digits = "1".repeat(10);
  const body = `{"error":"forbidden","ref":"${ref}","t":"${jwt}","v":"${secret}","n":"${digits}"}`;
  assert.equal(redactTrace(body), `{"error":"forbidden","ref":"${ref}","t":"[jwt]","v":"[gizli]","n":"[rakam]"}`);
  assert.equal(redactTrace("x".repeat(3000)).length <= 2000, true);
});

test("istek gövdesinden yalnız JSON anahtar adları alınır; JSON değilse boş", () => {
  const { jsonKeys } = sso;
  assert.deepEqual(jsonKeys('{"code":"gizli","codeVerifier":"gizli","redirectUri":"x"}'), ["code", "codeVerifier", "redirectUri"]);
  assert.deepEqual(jsonKeys("code=gizli&state=gizli"), ["code", "state"]);
  assert.deepEqual(jsonKeys(null), []);
  assert.deepEqual(jsonKeys("[1,2]"), []);
});

test("geri yüklenen oturumdan tarayıcıya bağlı çerezler düşer, kimlik çerezleri kalır", () => {
  const { withoutBrowserBoundCookies } = sso;
  const names = withoutBrowserBoundCookies([
    { name: "cf_clearance" }, { name: "__cf_bm" }, { name: "_cfuvid" }, { name: "access_token" }, { name: "refresh_token" }, { name: "FPID" },
  ]).map((c) => c.name);
  assert.deepEqual(names, ["access_token", "refresh_token", "FPID"]);
});
