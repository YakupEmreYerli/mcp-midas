import { withAuthenticationRecovery } from "./auth-recovery.js";
import { config } from "./config.js";
import { MidasApiError } from "./errors.js";
import { session } from "./session.js";
import { defineMessages } from "./i18n.js";

const M = defineMessages(
  {
    expired: "Midas oturumu sona erdi. Sunucu yeniden giriş akışını başlattı; " +
      "telefondaki bildirimi onayladıktan sonra çağrıyı yeniden deneyin.",
    unexpected: (status: number, body: string) => `Midas'tan beklenmeyen yanıt (HTTP ${status}): ${body}`,
    noData: "Midas veri döndürmedi",
    mutationNotRetried: "Güvenlik gereği başarısız mutation otomatik yeniden gönderilmedi; yeni çağrı yeni masaüstü onayı ister.",
  },
  {
    expired: "The Midas session expired. The server started signing in again; " +
      "approve the notification on your phone, then retry the call.",
    unexpected: (status, body) => `Unexpected response from Midas (HTTP ${status}): ${body}`,
    noData: "Midas returned no data",
    mutationNotRetried: "For safety, the failed mutation was not resent automatically; a new call needs a new desktop approval.",
  }
);

export { MidasApiError } from "./errors.js";


class AuthenticationRejected extends MidasApiError {
  constructor(status?: number) {
    super(`${M().expired}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "AuthenticationRejected";
  }
}

/**
 * Geçidin isteği hangi alt servise yönlendireceğini belirleyen ad: belgedeki ilk kök alan.
 * İlk seçim takma adsa (`kisa: gercekAlan(...)`) bu ad yanlış çıkar; çağıran o zaman gerçek
 * alanı `rootFieldOverride` ile verir.
 */
function firstRootField(document: string): string | undefined {
  const open = document.indexOf("{");
  if (open < 0) return undefined;
  return /^\s*([A-Za-z_]\w*)/.exec(document.slice(open + 1))?.[1];
}

/** Atlas web uygulamasının geçide gönderdiği başlıklar (çerezleri tarayıcı ekler). */
function gatewayHeaders(routeField: string, rid: string): Record<string, string> {
  return Object.fromEntries([
    ["content-type", "application/json"],
    ["accept", "application/graphql-response+json,application/json;q=0.9"],
    ["accept-language", "TR"],
    ["midas-app-id", "midas_web"],
    ["x-apollo-operation-name", routeField],
    ["x-client-version", config.clientVersion],
    ["x-midas-rid", rid],
  ]);
}

/**
 * Sayfa bağlamında çalışacak fetch ifadesi. Girdi JSON olarak gömülür; sayfa bu modülün
 * değişkenlerini göremez.
 */
function inPageFetch(url: string, init: object): string {
  const payload = JSON.stringify({ url, init: { ...init, method: "POST", credentials: "include" } });
  return `(async (p) => {
    const r = await fetch(p.url, p.init);
    return { status: r.status, text: await r.text() };
  })(${payload})`;
}

/**
 * Midas GraphQL geçidine istek. İstek oturumlu Atlas sayfasının içinden yapılır. Okumada
 * 401/403 gelirse oturum bir kez yenilenip istek yinelenir; mutation yinelenmez.
 */
export async function gql<T = any>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
  /** Belgenin ilk seçimi bir takma adsa yönlendirme başlığını geçersiz kılar. */
  rootFieldOverride?: string
): Promise<T> {
  const isMutation = /^\s*mutation\b/.test(query);
  const routeField = rootFieldOverride ?? firstRootField(query) ?? operationName;

  const send = async (): Promise<T> => {
    const page = await session.getPage();
    const init = {
      headers: gatewayHeaders(routeField, await session.getRid()),
      body: JSON.stringify({ operationName, query, variables }),
    };

    let reply: { status: number; text: string };
    try {
      reply = (await page.evaluate(inPageFetch(config.graphqlUrl, init))) as typeof reply;
    } catch (error) {
      // Oturumu kapanmış sayfa başka bir kökenden sunulur; fetch HTTP durumu vermeden
      // başarısız olabilir.
      if (session.isLoggedOut()) throw new AuthenticationRejected();
      throw error;
    }
    if (reply.status === 401 || reply.status === 403) throw new AuthenticationRejected(reply.status);

    let body: { data?: T; errors?: Array<{ message: string }> };
    try {
      body = JSON.parse(reply.text);
    } catch {
      throw new MidasApiError(M().unexpected(reply.status, reply.text.slice(0, 300)));
    }
    if (body.errors?.length) throw new MidasApiError(body.errors.map((e) => e.message).join("; "));
    if (!body.data) throw new MidasApiError(M().noData);
    return body.data;
  };

  return withAuthenticationRecovery({
    mutation: isMutation,
    request: send,
    isAuthenticationError: (error) => error instanceof AuthenticationRejected,
    renew: () => session.reauthenticate(),
    mutationExpiredError: () =>
      new MidasApiError(`${M().expired} ${M().mutationNotRetried}`),
  });
}
