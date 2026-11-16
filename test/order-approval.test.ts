import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApprovalDeniedError,
  createConfirmationQueue,
  executeWithApproval,
  type ApprovalPreview,
  type ConfirmationDecision,
} from "../src/order-approval.js";

const preview: ApprovalPreview = {
  action: "PLACE",
  instrumentName: "Türk Hava Yolları A.O.",
  symbol: "THYAO",
  market: "TR HİSSE",
  side: "ALIŞ",
  orderType: "LIMIT",
  quantity: 5,
  limitPrice: 300,
  currentPrice: 299,
  estimatedTry: 1_500,
  accountUid: "account-1",
};

for (const decision of ["rejected", "timeout", "unavailable", "error"] as const) {
  test(`${decision} kararı mutation fonksiyonunu hiç çağırmaz`, async () => {
    let mutationCalls = 0;
    const auditEvents: string[] = [];

    await assert.rejects(
      executeWithApproval({
        preview,
        confirm: async () => decision,
        mutate: async () => {
          mutationCalls += 1;
          return "sent";
        },
        audit: async (event) => {
          auditEvents.push(event.event);
        },
      }),
      ApprovalDeniedError
    );

    assert.equal(mutationCalls, 0);
    assert.deepEqual(auditEvents, ["preview", "confirmation"]);
  });
}

test("onay penceresi hatası mutation fonksiyonunu hiç çağırmaz", async () => {
  let mutationCalls = 0;

  await assert.rejects(
    executeWithApproval({
      preview,
      confirm: async () => {
        throw new Error("DISPLAY bulunamadı");
      },
      mutate: async () => {
        mutationCalls += 1;
        return "sent";
      },
      audit: async () => {},
    }),
    ApprovalDeniedError
  );

  assert.equal(mutationCalls, 0);
});

test("yalnızca approved kararı mutation fonksiyonunu bir kez çağırır", async () => {
  let mutationCalls = 0;
  const result = await executeWithApproval({
    preview,
    confirm: async () => "approved",
    mutate: async () => {
      mutationCalls += 1;
      return { orderId: "order-1" };
    },
    audit: async () => {},
  });

  assert.equal(mutationCalls, 1);
  assert.deepEqual(result, { orderId: "order-1" });
});

test("eşzamanlı onay pencerelerini seri çalıştırır", async () => {
  const entered: number[] = [];
  const released: Array<() => void> = [];
  const queue = createConfirmationQueue(async () => {
    const id = entered.length + 1;
    entered.push(id);
    await new Promise<void>((resolve) => released.push(resolve));
    return "approved" as ConfirmationDecision;
  });

  const first = queue(preview);
  const second = queue({ ...preview, symbol: "ASELS" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(entered, [1]);

  released.shift()?.();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(entered, [1, 2]);

  released.shift()?.();
  await second;
});

test("onaylanan fiyattan yüzde 2'den büyük sapmayı reddeder", async () => {
  let mutationCalls = 0;

  await assert.rejects(
    executeWithApproval({
      preview,
      confirm: async () => "approved",
      revalidate: async () => ({ ok: false, reason: "Fiyat %2,34 değişti" }),
      mutate: async () => {
        mutationCalls += 1;
        return "sent";
      },
      audit: async () => {},
    }),
    ApprovalDeniedError
  );

  assert.equal(mutationCalls, 0);
});
