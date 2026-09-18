import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createOrderAuditLogger } from "../src/order-audit.js";

test("JSONL kaydı 0600 izinle yazılır ve hassas anahtarlar maskelenir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "midas-audit-"));
  const file = join(dir, "orders.jsonl");
  const audit = createOrderAuditLogger(file);

  await audit({
    event: "preview",
    action: "PLACE",
    symbol: "THYAO",
    details: {
      password: "secret",
      nested: { accessToken: "token", phone: "5550000000", safe: "kept" },
    },
  });

  const line = JSON.parse((await readFile(file, "utf8")).trim());
  assert.equal(line.event, "preview");
  assert.equal(line.symbol, "THYAO");
  assert.match(line.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(line.details.password, "[REDACTED]");
  assert.equal(line.details.nested.accessToken, "[REDACTED]");
  assert.equal(line.details.nested.phone, "[REDACTED]");
  assert.equal(line.details.nested.safe, "kept");
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});
