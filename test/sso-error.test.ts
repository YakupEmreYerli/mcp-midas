import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MIDAS_LANG = "tr";
const { ssoFailure, loginStep } = await import("../src/sso-error.js");

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
