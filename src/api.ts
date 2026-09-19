import { config } from "./config.js";
export { MidasApiError } from "./errors.js";
import { MidasApiError } from "./errors.js";
import { withAuthenticationRecovery } from "./auth-recovery.js";
import { session } from "./session.js";

const SESSION_EXPIRED =
  "Midas oturumu sona erdi. Sunucu yeniden giriş akışını başlattı; " +
  "telefondaki bildirimi onayladıktan sonra çağrıyı yeniden deneyin.";

class AuthenticationRejected extends MidasApiError {
  constructor(status?: number) {
    super(`${SESSION_EXPIRED}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "AuthenticationRejected";
  }
}

/**
 * GraphQL isteğini oturumlu sayfanın içinden yapar; oturum çerezlerini tarayıcı ekler.
 * İstek geri çağırma yerine metin olarak kurulur, çünkü sayfa bu modülün kapsamına
 * erişemez.
 */
export async function gql<T = any>(
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
  /** Belgenin ilk seçimi bir takma adsa yönlendirme başlığını geçersiz kılar. */
  rootFieldOverride?: string
): Promise<T> {
  const mutation = /^\s*mutation\b/.test(query);

  return withAuthenticationRecovery({
    mutation,
    isAuthenticationError: (error) => error instanceof AuthenticationRejected,
    renew: () => session.reauthenticate(),
    mutationExpiredError: () =>
      new MidasApiError(
        `${SESSION_EXPIRED} Güvenlik gereği başarısız mutation otomatik yeniden gönderilmedi; yeni çağrı yeni masaüstü onayı ister.`
      ),
    request: async () => {
      const page = await session.getPage();
      const rid = await session.getRid();
      const body = JSON.stringify({ operationName, query, variables });

      // Geçit kök alan adına göre yönlendirir; bu normalde belgedeki ilk seçimdir. Orada bir
      // takma ad olursa istek hiçbir yere yönlenmez; geçersiz kılma bu yüzden var.
      const rootField =
        rootFieldOverride ?? query.match(/\{\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? operationName;

      let result: { status: number; text: string };
      try {
        result = (await page.evaluate(
          `(async () => {
             const res = await fetch(${JSON.stringify(config.graphqlUrl)}, {
               method: "POST",
               credentials: "include",
               headers: {
                 "content-type": "application/json",
                 "accept": "application/graphql-response+json,application/json;q=0.9",
                 "accept-language": "TR",
                 "midas-app-id": "midas_web",
                 "x-apollo-operation-name": ${JSON.stringify(rootField)},
                 "x-client-version": ${JSON.stringify(config.clientVersion)},
                 "x-midas-rid": ${JSON.stringify(rid)},
               },
               body: ${JSON.stringify(body)},
             });
             return { status: res.status, text: await res.text() };
           })()`
        )) as { status: number; text: string };
      } catch (error) {
        // Oturumu kapanmış sayfa başka bir kökenden sunulur; fetch HTTP durumu vermeden
        // başarısız olabilir.
        if (session.isLoggedOut()) throw new AuthenticationRejected();
        throw error;
      }

      if (result.status === 401 || result.status === 403) {
        throw new AuthenticationRejected(result.status);
      }

      let parsed: { data?: T; errors?: { message: string }[] };
      try {
        parsed = JSON.parse(result.text);
      } catch {
        throw new MidasApiError(`Midas'tan beklenmeyen yanıt (HTTP ${result.status}): ${result.text.slice(0, 300)}`);
      }

      if (parsed.errors?.length) {
        throw new MidasApiError(parsed.errors.map((e) => e.message).join("; "));
      }
      if (!parsed.data) throw new MidasApiError("Midas veri döndürmedi");
      return parsed.data;
    },
  });
}
