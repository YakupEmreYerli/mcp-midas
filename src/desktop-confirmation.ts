import { spawn } from "node:child_process";
import { createDesktopConfirmationGate, type DialogAttempt, type DialogRunner } from "./desktop-confirmation-core.js";

const runDialog: DialogRunner = (command, args, timeoutMs) =>
  new Promise<DialogAttempt>((resolve) => {
    let settled = false;
    const finish = (result: DialogAttempt) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, { stdio: "ignore", shell: false });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish("timeout");
    }, timeoutMs);
    timer.unref();

    child.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT" ? "missing" : "error");
    });
    child.once("close", (code) => {
      if (code === 0) finish("approved");
      else if (code === 1) finish("rejected");
      else if (command === "zenity" && code === 5) finish("timeout");
      else finish("error");
    });
  });

// The production path is permanently wired to the real desktop runner. Only the pure
// core factory is injectable for unit tests; MCP tools cannot supply a confirmer.
export const confirmOrderOnDesktop = createDesktopConfirmationGate(runDialog, process.env);
