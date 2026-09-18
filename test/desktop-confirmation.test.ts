import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDesktopConfirmationGate,
  interpretKdialog,
  interpretOnay,
  interpretZenity,
  kdialogArgs,
  KDIALOG_SUPPORTED_OPTIONS,
  zenityArgs,
  ZENITY_SUPPORTED_OPTIONS,
  type DialogSpec,
  type ProcessResult,
} from "../src/desktop-confirmation-core.js";
import { buildDialogModel, formatApprovalMessage } from "../src/confirmation-view.js";
import { ApprovalDeniedError, executeWithApproval, type ApprovalPreview } from "../src/order-approval.js";

const preview: ApprovalPreview = {
  action: "UPDATE",
  instrumentName: "Aselsan Elektronik Sanayi ve Ticaret A.Ş.",
  symbol: "ASELS",
  market: "TR HİSSE",
  side: "SATIŞ",
  orderType: "TAKE_PROFIT_AND_STOP_LOSS",
  quantity: 5,
  takeProfitPrice: 122.5,
  stopLossPrice: 100.5,
  currentPrice: 111,
  estimatedTry: 555,
  accountUid: "account-tr",
  oldValues: { uid: "order-1", quantity: 5, profitPrice: 120, lossPrice: 99, status: "PENDING" },
  newValues: { quantity: 5, profitPrice: 122.5, lossPrice: 100.5 },
};

const options = { pythonPath: "/usr/bin/python3", onayScript: "/repo/onay/onay.py" };

const result = (partial: Partial<ProcessResult>): ProcessResult => ({
  code: 0,
  signal: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  ...partial,
});
const missing = result({ code: null, spawnError: { code: "ENOENT", message: "spawn ENOENT" } });

function scripted(responses: Partial<Record<DialogSpec["tool"], ProcessResult>>) {
  const calls: DialogSpec[] = [];
  const run = async (spec: DialogSpec) => {
    calls.push(spec);
    return responses[spec.tool] ?? missing;
  };
  return { calls, run };
}

// ---------- Çıkış kodu eşlemesi ----------

test("onay penceresi: 0 + SONUC evet onaydır", () => {
  assert.equal(interpretOnay(result({ code: 0, stdout: "ACILDI\nSONUC evet\n" })).outcome, "approved");
});

test("onay penceresi: 1 + SONUC hayir kullanıcı reddidir", () => {
  const attempt = interpretOnay(result({ code: 1, stdout: "ACILDI\nSONUC hayir\n" }));
  assert.equal(attempt.outcome, "rejected");
  assert.equal(attempt.shown, true);
});

test("onay penceresi: 2 + SONUC zaman-asimi zaman aşımıdır", () => {
  assert.equal(interpretOnay(result({ code: 2, stdout: "ACILDI\nSONUC zaman-asimi\n" })).outcome, "timeout");
});

test("onay penceresi: Python çökmesi (kod 1, SONUC yok) ret değil hatadır", () => {
  const attempt = interpretOnay(
    result({ code: 1, stderr: "Traceback (most recent call last):\nModuleNotFoundError: No module named 'PySide6'" })
  );
  assert.equal(attempt.outcome, "error");
  assert.equal(attempt.shown, false);
  assert.match(attempt.detail ?? "", /PySide6/);
});

test("onay penceresi: kod 0 ama SONUC evet yoksa onay sayılmaz", () => {
  assert.equal(interpretOnay(result({ code: 0, stdout: "" })).outcome, "error");
  assert.equal(interpretOnay(result({ code: 0, stdout: "SONUC evet\n" })).outcome, "error", "ACILDI olmadan evet geçersiz");
});

test("onay penceresi: SONUC hata sebebi ayrıntıya taşınır", () => {
  const attempt = interpretOnay(result({ code: 2, stdout: "SONUC hata onay sayfası yüklenemedi\n" }));
  assert.equal(attempt.outcome, "error");
  assert.match(attempt.detail ?? "", /onay sayfası yüklenemedi/);
});

test("kdialog: yalnız stdout 'evet' onaydır", () => {
  assert.equal(interpretKdialog(result({ code: 0, stdout: "evet\n" })).outcome, "approved");
  assert.equal(interpretKdialog(result({ code: 0, stdout: "hayir\n" })).outcome, "rejected");
  assert.equal(interpretKdialog(result({ code: 0, stdout: "" })).outcome, "error");
  assert.equal(interpretKdialog(result({ code: 1 })).outcome, "rejected");
});

test("kdialog: geçersiz bayrak (Bilinmeyen seçenek, kod 1) ret değil hatadır — regresyon", () => {
  const attempt = interpretKdialog(result({ code: 1, stderr: 'kdialog: Bilinmeyen seçenek "defaultno".\n' }));
  assert.equal(attempt.outcome, "error");
  assert.equal(attempt.shown, false);
  assert.match(attempt.detail ?? "", /defaultno/);
});

test("zenity: 0 onay, 1 ret, 5 zaman aşımı, 255 hata", () => {
  assert.equal(interpretZenity(result({ code: 0 })).outcome, "approved");
  assert.equal(interpretZenity(result({ code: 1 })).outcome, "rejected");
  assert.equal(interpretZenity(result({ code: 5 })).outcome, "timeout");
  assert.equal(interpretZenity(result({ code: 255, stderr: "Bu seçenek yok." })).outcome, "error");
});

test("kdialog ve zenity yalnız desteklenen seçenekleri kullanır; --defaultno yok", () => {
  const message = formatApprovalMessage(preview);
  const kdialog = kdialogArgs(message).filter((arg) => arg.startsWith("--"));
  assert.ok(!kdialog.includes("--defaultno"));
  for (const option of kdialog) assert.ok(KDIALOG_SUPPORTED_OPTIONS.has(option), `kdialog seçeneği: ${option}`);
  for (const arg of zenityArgs(message)) {
    const option = arg.split("=")[0];
    assert.ok(ZENITY_SUPPORTED_OPTIONS.has(option), `zenity seçeneği: ${option}`);
  }
});

// ---------- Zincir ----------

test("ekran yoksa fail-closed döner ve pencere komutu çalıştırmaz", async () => {
  const { calls, run } = scripted({});
  const gate = createDesktopConfirmationGate(run, {}, options);
  const outcome = await gate(preview);
  assert.equal(outcome.decision, "unavailable");
  assert.equal(calls.length, 0);
});

test("tasarımlı pencere önizlemeyi argv yerine stdin'den alır", async () => {
  const { calls, run } = scripted({ onay: result({ code: 1, stdout: "ACILDI\nSONUC hayir\n" }) });
  const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
  const outcome = await gate(preview);
  assert.equal(outcome.decision, "rejected");
  assert.equal(outcome.dialog, "onay");
  assert.deepEqual(calls.map((call) => call.tool), ["onay"]);
  assert.deepEqual(calls[0].args, [options.onayScript]);
  assert.ok(!calls[0].args.join(" ").includes("ASELS"));
  assert.equal(JSON.parse(calls[0].stdin ?? "{}").sembol, "ASELS");
});

test("tasarımlı pencere açılamazsa kdialog'a düşer", async () => {
  const { calls, run } = scripted({
    onay: result({ code: 1, stderr: "ModuleNotFoundError: PySide6" }),
    kdialog: result({ code: 0, stdout: "evet\n" }),
  });
  const gate = createDesktopConfirmationGate(run, { WAYLAND_DISPLAY: "wayland-0" }, options);
  const outcome = await gate(preview);
  assert.equal(outcome.decision, "approved");
  assert.equal(outcome.dialog, "kdialog");
  assert.deepEqual(calls.map((call) => call.tool), ["onay", "kdialog"]);
  assert.deepEqual(outcome.attempts?.map((attempt) => attempt.outcome), ["error", "approved"]);
});

test("kullanıcının gördüğü pencerede Hayır demesi başka pencereyle yeniden sorulmaz", async () => {
  for (const onay of [
    result({ code: 1, stdout: "ACILDI\nSONUC hayir\n" }),
    result({ code: 2, stdout: "ACILDI\nSONUC zaman-asimi\n" }),
    result({ code: 2, stdout: "ACILDI\nSONUC hata beklenmedik\n" }),
  ]) {
    const { calls, run } = scripted({ onay, kdialog: result({ code: 0, stdout: "evet\n" }) });
    const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
    const outcome = await gate(preview);
    assert.notEqual(outcome.decision, "approved");
    assert.deepEqual(calls.map((call) => call.tool), ["onay"]);
  }
});

test("kdialog geçersiz bayrakla düşerse zenity sorar; sonuç ret diye okunmaz", async () => {
  const { calls, run } = scripted({
    onay: missing,
    kdialog: result({ code: 1, stderr: 'kdialog: Bilinmeyen seçenek "defaultno".' }),
    zenity: missing,
  });
  const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
  const outcome = await gate(preview);
  assert.deepEqual(calls.map((call) => call.tool), ["onay", "kdialog", "zenity"]);
  assert.equal(outcome.decision, "error");
  assert.match(outcome.detail ?? "", /kdialog.*Bilinmeyen seçenek/);
});

test("hiçbir pencere aracı yoksa unavailable döner", async () => {
  const { calls, run } = scripted({});
  const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
  const outcome = await gate(preview);
  assert.equal(outcome.decision, "unavailable");
  assert.deepEqual(calls.map((call) => call.tool), ["onay", "kdialog", "zenity"]);
});

// ---------- Hata ≠ ret: MCP'ye dönen mesaj ----------

test("pencere hatası MCP'ye 'pencere açılamadı' diye döner, 'Hayır' diye değil", async () => {
  const { run } = scripted({ onay: missing, kdialog: result({ code: 1, stderr: "kdialog: Bilinmeyen seçenek \"defaultno\"." }), zenity: missing });
  const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
  const audits: Array<Record<string, unknown> | undefined> = [];
  let mutated = 0;
  await assert.rejects(
    executeWithApproval({
      preview,
      confirm: gate,
      mutate: async () => (mutated += 1),
      audit: async (event) => {
        if (event.event === "confirmation") audits.push(event.details);
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApprovalDeniedError);
      assert.match(error.message, /onay penceresi açılamadı: /);
      assert.doesNotMatch(error.message, /Hayır|rejected/);
      return true;
    }
  );
  assert.equal(mutated, 0);
  assert.equal(audits[0]?.decision, "error");
  assert.ok(Array.isArray(audits[0]?.attempts));
});

test("kullanıcı reddi MCP'ye Hayır olarak döner ve pencere günlüğe yazılır", async () => {
  const { run } = scripted({ onay: result({ code: 1, stdout: "ACILDI\nSONUC hayir\n" }) });
  const gate = createDesktopConfirmationGate(run, { DISPLAY: ":0" }, options);
  const audits: Array<Record<string, unknown> | undefined> = [];
  await assert.rejects(
    executeWithApproval({
      preview,
      confirm: gate,
      mutate: async () => "sent",
      audit: async (event) => {
        if (event.event === "confirmation") audits.push(event.details);
      },
    }),
    /Hayır seçildi \(pencere: onay\)/
  );
  assert.equal(audits[0]?.decision, "rejected");
  assert.equal(audits[0]?.dialog, "onay");
});

// ---------- Okunur önizleme ----------

test("önizleme metni çözümlenmiş emir ayrıntılarını okunur Türkçe verir, ham JSON yok", () => {
  const text = formatApprovalMessage(preview);
  for (const expected of [
    "DEĞİŞTİR — ASELS",
    "Aselsan Elektronik Sanayi ve Ticaret A.Ş. (ASELS)",
    "TR HİSSE",
    "SATIŞ",
    "Kâr al + zarar durdur",
    "₺111,00",
    "₺555,00",
    "Kâr al: ₺120,00 → ₺122,50",
    "Zarar durdur: ₺99,00 → ₺100,50",
    "account-tr",
  ]) {
    assert.ok(text.includes(expected), `Eksik önizleme parçası: ${expected}`);
  }
  assert.ok(!text.includes("{") && !text.includes('"'), "ham JSON kalmamalı");
});

test("pencere modeli işlem tipini ve tehlike tonunu doğru seçer", () => {
  const sell = buildDialogModel({ ...preview, action: "PLACE", orderType: "LIMIT", limitPrice: 122.5, oldValues: undefined, newValues: undefined });
  assert.equal(sell.islem, "SATIŞ");
  assert.equal(sell.ton, "tehlike");
  assert.equal(sell.ozet, "5 adet ASELS, ₺122,50 limit fiyatla satılacak.");
  const buy = buildDialogModel({ ...preview, action: "PLACE", side: "ALIŞ", orderType: "MARKET", oldValues: undefined, newValues: undefined });
  assert.equal(buy.islem, "ALIŞ");
  assert.equal(buy.ton, "alis");
  const cancel = buildDialogModel({ ...preview, action: "CANCEL", newValues: { status: "CANCELED" } });
  assert.equal(cancel.islem, "İPTAL");
  assert.equal(cancel.ton, "tehlike");
  assert.deepEqual(cancel.degisiklikler.find((row) => row.etiket === "Durum"), {
    etiket: "Durum",
    eski: "Bekliyor",
    yeni: "İptal edildi",
    degisti: true,
  });
  const update = buildDialogModel(preview);
  assert.equal(update.islem, "DEĞİŞTİR");
  assert.equal(update.ton, "dikkat");
  assert.equal(update.emirNo, "order-1");
  assert.deepEqual(
    update.degisiklikler.map((row) => [row.etiket, row.degisti]),
    [["Adet", false], ["Kâr al", true], ["Zarar durdur", true]]
  );
});
