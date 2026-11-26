/**
 * Giriş akışının iz ve hata yardımcıları. Midas onayı aldıktan sonra Atlas kodu token'a çeviremezse
 * sayfa `/login?error=sso_failed&error_status=…&error_ref=…` adresine döner; bu tanınmazsa akış
 * onay süresi dolana kadar boşuna bekler ve yanlışlıkla "onaylanmadı" der.
 */

export interface SsoFailure {
  error: string;
  status: string | null;
  ref: string | null;
  description: string | null;
}

/** Adres Atlas'ın giriş hatası sayfasıysa ayrıntıları, değilse null. */
export function ssoFailure(url: string, atlasUrl: string): SsoFailure | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(atlasUrl).origin) return null;
  const error = parsed.searchParams.get("error");
  if (!error) return null;
  return {
    error,
    status: parsed.searchParams.get("error_status"),
    ref: parsed.searchParams.get("error_ref"),
    description: parsed.searchParams.get("error_description"),
  };
}

/** Günlüğe yazılacak adım: yalnız alan ve yol. Sorgu (kod, state, PKCE) hiç yazılmaz. */
export function loginStep(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host + parsed.pathname;
  } catch {
    return "?";
  }
}
