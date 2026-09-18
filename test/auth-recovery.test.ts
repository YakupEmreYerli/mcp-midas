import assert from "node:assert/strict";
import { test } from "node:test";
import { withAuthenticationRecovery } from "../src/auth-recovery.js";

class AuthError extends Error {}

test("okuma isteği 401 sonrasında ortak yeniden girişten sonra bir kez tekrarlanır", async () => {
  let calls = 0;
  let renewals = 0;
  const result = await withAuthenticationRecovery({
    mutation: false,
    request: async () => {
      calls += 1;
      if (calls === 1) throw new AuthError("401");
      return "ok";
    },
    isAuthenticationError: (error) => error instanceof AuthError,
    renew: async () => {
      renewals += 1;
    },
    mutationExpiredError: () => new Error("mutation yeniden gönderilmedi"),
  });

  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.equal(renewals, 1);
});

test("mutation 401 sonrasında yeniden giriş yapar ama mutation'ı tekrar çağırmaz", async () => {
  let calls = 0;
  let renewals = 0;
  await assert.rejects(
    withAuthenticationRecovery({
      mutation: true,
      request: async () => {
        calls += 1;
        throw new AuthError("401");
      },
      isAuthenticationError: (error) => error instanceof AuthError,
      renew: async () => {
        renewals += 1;
      },
      mutationExpiredError: () => new Error("mutation yeniden gönderilmedi"),
    }),
    /yeniden gönderilmedi/
  );

  assert.equal(calls, 1);
  assert.equal(renewals, 1);
});

test("kimlik doğrulama dışı hata yeniden giriş başlatmadan iletilir", async () => {
  let renewals = 0;
  const failure = new Error("sunucu bozuk");
  await assert.rejects(
    withAuthenticationRecovery({
      mutation: false,
      request: async () => {
        throw failure;
      },
      isAuthenticationError: (error) => error instanceof AuthError,
      renew: async () => {
        renewals += 1;
      },
      mutationExpiredError: () => new Error("mutation yeniden gönderilmedi"),
    }),
    failure
  );
  assert.equal(renewals, 0);
});
