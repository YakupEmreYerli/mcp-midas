import { open } from "node:fs/promises";
import type { AuditEvent } from "./order-approval.js";

const SENSITIVE_KEY = /(password|passphrase|secret|token|cookie|authorization|phone|telefon)/i;

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item, seen);
  }
  return sanitized;
}

export function createOrderAuditLogger(file: string) {
  return async (event: AuditEvent): Promise<void> => {
    const sanitized = redact(event) as Record<string, unknown>;
    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...sanitized }) + "\n";
    const handle = await open(file, "a", 0o600);
    try {
      await handle.chmod(0o600);
      await handle.appendFile(line, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
}
