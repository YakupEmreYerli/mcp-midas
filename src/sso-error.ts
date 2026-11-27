
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

/**
 * Giriş sayfasındaki düğme ve bağlantı yazıları, günlüğe yazılmadan önce sadeleşir: boşluk
 * toplanır, rakamlar (maskeli telefon, kod) gizlenir, 60 karakterde kesilir, boş ve tekrar düşer.
 */
export function controlLabels(texts: string[]): string[] {
  const labels = texts
    .map((text) => text.replace(/\s+/g, " ").trim().replace(/\d/g, "•").slice(0, 60))
    .filter(Boolean);
  return [...new Set(labels)];
}

/**
 * Giriş izine giren yanıt gövdesi: JWT, 40+ karakterlik gizli dizi (kod, verifier) ve 7+ haneli
 * rakam dizisi (telefon) maskelenir, 2000 karakterde kesilir. 32 haneli başvuru kimliği kalır.
 */
export function redactTrace(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]")
    .replace(/[\w-]{40,}/g, "[gizli]")
    .replace(/(?<![\w-])\+?\d{7,}(?![\w-])/g, "[rakam]")
    .slice(0, 2000);
}

/** İstek gövdesinin yalnız anahtar adları (JSON nesnesi ya da form); değerler hiç dönmez. */
export function jsonKeys(body: string | null): string[] {
  if (!body) return [];
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : [];
  } catch {
    return body.includes("=") ? [...new URLSearchParams(body).keys()] : [];
  }
}

/**
 * Tarayıcıya bağlı çerezler (cf_clearance, __cf_bm, _cfuvid) başka bir tarayıcıda işe yaramaz; oturum geri
 * yüklenirken bunlar düşer, tarayıcı kendininkini alır.
 */
export function withoutBrowserBoundCookies<T extends { name: string }>(cookies: T[]): T[] {
  return cookies.filter((cookie) => !["cf_clearance", "__cf_bm", "_cfuvid"].includes(cookie.name));
}
