import assert from "node:assert/strict";
import { test } from "node:test";

process.env.MIDAS_LANG = "tr";
const { resolveTarget } = await import("../src/cli/accounts.js");

const HOME = "/home/test";
const FILE = "/home/test/.config/mcp-midas/accounts.json";

function deps(files: Record<string, string>, env: NodeJS.ProcessEnv = {}) {
  return {
    env,
    home: HOME,
    readFile: (file: string) => {
      if (!(file in files)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files[file];
    },
  };
}

const ACCOUNTS = JSON.stringify({
  default: "ana",
  accounts: {
    ana: { server: "http://127.0.0.1:9001/mcp", token_file: "~/.config/a/token" },
    ikinci: { server: "http://127.0.0.1:9002/mcp", token_file: "/etc/b/token" },
  },
});

test("dosya yoksa ve seçenek yoksa yerel kip", () => {
  assert.deepEqual(resolveTarget({}, deps({})), { kind: "local" });
});

test("dosyadaki varsayılan hesap uzak kipe gider, ~ açılır", () => {
  const target = resolveTarget({}, deps({ [FILE]: ACCOUNTS, "/home/test/.config/a/token": "abc\n" }));
  assert.deepEqual(target, { kind: "remote", url: "http://127.0.0.1:9001/mcp", token: "abc", account: "ana" });
});

test("--account dosyadaki hesabı seçer", () => {
  const target = resolveTarget({ account: "ikinci" }, deps({ [FILE]: ACCOUNTS, "/etc/b/token": "xyz" }));
  assert.equal(target.kind, "remote");
  assert.equal(target.kind === "remote" && target.url, "http://127.0.0.1:9002/mcp");
  assert.equal(target.kind === "remote" && target.account, "ikinci");
});

test("bilinmeyen hesap adı hata verir, başka hesaba düşmez", () => {
  assert.throws(() => resolveTarget({ account: "yok" }, deps({ [FILE]: ACCOUNTS })), /Bilinmeyen hesap: yok.*ana, ikinci/);
  assert.throws(() => resolveTarget({ account: "toString" }, deps({ [FILE]: ACCOUNTS })), /Bilinmeyen hesap/);
});

test("--account verilip dosya yoksa hata", () => {
  assert.throws(() => resolveTarget({ account: "ana" }, deps({})), /Hesap dosyası yok/);
});

test("--server dosyayı ezer, jeton varsayılan yerden okunur", () => {
  const target = resolveTarget(
    { server: "http://127.0.0.1:9100/mcp" },
    deps({ [FILE]: ACCOUNTS, "/home/test/.config/mcp-midas/token": "tok" })
  );
  assert.deepEqual(target, { kind: "remote", url: "http://127.0.0.1:9100/mcp", token: "tok", account: null });
});

test("--token-file jeton yerini değiştirir; boş jeton hata", () => {
  const ok = resolveTarget({ server: "http://h/mcp", tokenFile: "/t" }, deps({ "/t": "k" }));
  assert.equal(ok.kind === "remote" && ok.token, "k");
  assert.throws(() => resolveTarget({ server: "http://h/mcp", tokenFile: "/t" }, deps({ "/t": "  \n" })), /boş/);
  assert.throws(() => resolveTarget({ server: "http://h/mcp", tokenFile: "/yok" }, deps({})), /Jeton dosyası okunamadı/);
});

test("geçersiz adres reddedilir", () => {
  assert.throws(() => resolveTarget({ server: "ftp://h/mcp" }, deps({ "/home/test/.config/mcp-midas/token": "t" })), /Geçersiz/);
});

test("bozuk hesap dosyası yerel kipe düşmez, hata verir", () => {
  assert.throws(() => resolveTarget({}, deps({ [FILE]: "{bozuk" })), /Hesap dosyası okunamadı/);
});

test("--local hesap dosyasını yok sayar, --server ile birlikte verilemez", () => {
  assert.deepEqual(resolveTarget({ local: true }, deps({ [FILE]: ACCOUNTS })), { kind: "local" });
  assert.throws(() => resolveTarget({ local: true, server: "http://h/mcp" }, deps({})), /--local/);
});

test("XDG_CONFIG_HOME hesap dosyasının yerini değiştirir", () => {
  const files = { "/x/mcp-midas/accounts.json": ACCOUNTS, "/home/test/.config/a/token": "abc" };
  const target = resolveTarget({}, deps(files, { XDG_CONFIG_HOME: "/x" }));
  assert.equal(target.kind, "remote");
});
