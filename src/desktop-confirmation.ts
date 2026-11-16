import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDesktopConfirmationGate, type ProcessResult, type ProcessRunner } from "./desktop-confirmation-core.js";

const OUTPUT_LIMIT = 64 * 1024;

const runProcess: ProcessRunner = (spec) =>
  new Promise<ProcessResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    const finish = (result: Omit<ProcessResult, "stdout" | "stderr" | "timedOut">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({ ...result, stdout, stderr, timedOut });
    };

    const child = spawn(spec.command, spec.args, { stdio: ["pipe", "pipe", "pipe"], shell: false });
    const append = (current: string, chunk: Buffer) =>
      current.length >= OUTPUT_LIMIT ? current : (current + chunk.toString("utf8")).slice(0, OUTPUT_LIMIT);
    child.stdout.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));
    // Önizleme verisi argv'de değil stdin'de: süreç listesinde görünmez.
    child.stdin.on("error", () => undefined);
    child.stdin.end(spec.stdin ?? "");

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3_000);
      killTimer.unref();
    }, spec.timeoutMs);
    timer.unref();

    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ code: null, signal: null, spawnError: { code: error.code, message: error.message } });
    });
    child.once("close", (code, signal) => finish({ code, signal }));
  });

const onayScript = fileURLToPath(new URL("../onay/onay.py", import.meta.url));
// Sistem Python'u PySide6 + QtWebEngine taşır; systemd servisinin PATH'ine güvenmeyiz.
const pythonPath = existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";

// Üretim yolu kalıcı olarak gerçek masaüstü çalıştırıcısına bağlıdır. Birim testlerde
// yalnız saf çekirdek fabrikası enjekte edilebilir; MCP araçları onaylayıcı sağlayamaz.
export const confirmOrderOnDesktop = createDesktopConfirmationGate(runProcess, process.env, { pythonPath, onayScript });
