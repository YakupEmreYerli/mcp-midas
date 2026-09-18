import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDesktopConfirmationGate,
  formatApprovalMessage,
  type DialogAttempt,
} from "../src/desktop-confirmation-core.js";
import type { ApprovalPreview } from "../src/order-approval.js";

const preview: ApprovalPreview = {
  action: "UPDATE",
  instrumentName: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.",
  symbol: "ASELS",
  market: "TR HİSSE",
  side: "SATIŞ",
  orderType: "TAKE_PROFIT_AND_STOP_LOSS",
  quantity: 5,
  limitPrice: 122.5,
  takeProfitPrice: 122.5,
  stopLossPrice: 100.5,
  currentPrice: 111,
  estimatedTry: 555,
  accountUid: "account-tr",
  oldValues: { quantity: 5, profitPrice: 120, lossPrice: 99 },
  newValues: { quantity: 5, profitPrice: 122.5, lossPrice: 100.5 },
};

test("ekran yoksa fail-closed döner ve pencere komutu çalıştırmaz", async () => {
  let calls = 0;
  const gate = createDesktopConfirmationGate(async () => {
    calls += 1;
    return "approved";
  }, {});

  assert.equal(await gate(preview), "unavailable");
  assert.equal(calls, 0);
});

test("yalnızca kdialog bulunamadığında zenity kullanır", async () => {
  const commands: string[] = [];
  const gate = createDesktopConfirmationGate(async (command) => {
    commands.push(command);
    return command === "kdialog" ? "missing" : "approved";
  }, { DISPLAY: ":0" });

  assert.equal(await gate(preview), "approved");
  assert.deepEqual(commands, ["kdialog", "zenity"]);
});

test("kdialog ve zenity bulunamazsa fail-closed döner", async () => {
  const commands: string[] = [];
  const gate = createDesktopConfirmationGate(async (command) => {
    commands.push(command);
    return "missing";
  }, { DISPLAY: ":0" });

  assert.equal(await gate(preview), "unavailable");
  assert.deepEqual(commands, ["kdialog", "zenity"]);
});

for (const attempt of ["rejected", "timeout", "error"] as DialogAttempt[]) {
  test(`kdialog ${attempt} sonucunda kapı fail-closed kalır`, async () => {
    const commands: string[] = [];
    const gate = createDesktopConfirmationGate(async (command) => {
      commands.push(command);
      return attempt;
    }, { WAYLAND_DISPLAY: "wayland-0" });

    assert.equal(await gate(preview), attempt);
    assert.deepEqual(commands, ["kdialog"]);
  });
}

test("önizleme metni çözümlenmiş emir ayrıntılarını içerir", () => {
  const text = formatApprovalMessage(preview);
  for (const expected of [
    "Aselsan Elektronik Sanayi ve Ticaret A.Ş. (ASELS)",
    "TR HİSSE",
    "SATIŞ",
    "TAKE_PROFIT_AND_STOP_LOSS",
    "5",
    "122,50",
    "100,50",
    "111,00",
    "555,00",
    "account-tr",
    '"profitPrice": 120',
    '"lossPrice": 100.5',
  ]) {
    assert.ok(text.includes(expected), `Eksik önizleme parçası: ${expected}`);
  }
});
