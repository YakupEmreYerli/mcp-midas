/**
 * storageState içindeki oturum sürelerini özetler. Yalnız zaman bilgisi döner: token
 * değerleri, jti ya da hesap alanları asla dışarı çıkmaz; sonuç loga yazılabilir.
 */
export interface AuthExpiry {
  /** Atlas'ın localStorage'daki `midas:access-expiry` değeri (ms). */
  accessExpiry: number | null;
  /** `midas:refresh-expiry` (ms); uygulama her yenilemede `now + refreshTokenExpiresIn` yazar. */
  refreshExpiry: number | null;
  /** `refresh_token` çerezindeki JWT `iat` (ms); yenilemede değişiyorsa token dönüyordur. */
  refreshIssuedAt: number | null;
  /** `refresh_token` çerezindeki JWT `exp` (ms); asıl sunucu sınırı budur. */
  refreshTokenExp: number | null;
}

interface StorageStateLike {
  cookies?: { name: string; value: string }[];
  origins?: { origin: string; localStorage?: { name: string; value: string }[] }[];
}

function jwtTimes(token: string): { iat: number | null; exp: number | null } {
  const part = token.split(".")[1];
  if (!part) return { iat: null, exp: null };
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v * 1000 : null);
    return { iat: num(payload.iat), exp: num(payload.exp) };
  } catch {
    return { iat: null, exp: null };
  }
}

function numeric(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function describeAuthExpiry(state: StorageStateLike, atlasOrigin = "https://atlas.getmidas.com"): AuthExpiry {
  const items = state.origins?.find((o) => o.origin === atlasOrigin)?.localStorage ?? [];
  const ls = (name: string) => items.find((i) => i.name === name)?.value;
  const refreshCookie = state.cookies?.find((c) => c.name === "refresh_token");
  const times = refreshCookie ? jwtTimes(refreshCookie.value) : { iat: null, exp: null };
  return {
    accessExpiry: numeric(ls("midas:access-expiry")),
    refreshExpiry: numeric(ls("midas:refresh-expiry")),
    refreshIssuedAt: times.iat,
    refreshTokenExp: times.exp,
  };
}

function stamp(ms: number | null): string {
  if (ms === null) return "?";
  return new Date(ms).toLocaleString("tr-TR", { timeZone: process.env.TZ || undefined, hour12: false });
}

/** Tek satırlık log metni: yalnız tarih/saat ve kalan süre. */
export function formatAuthExpiry(e: AuthExpiry, now = Date.now()): string {
  const limit = e.refreshTokenExp ?? e.refreshExpiry;
  const left = limit === null ? "?" : `${Math.max(0, (limit - now) / 3_600_000).toFixed(1)} sa`;
  return (
    `refresh_token verildi ${stamp(e.refreshIssuedAt)}, bitiş ${stamp(e.refreshTokenExp)} ` +
    `(uygulama bitiş ${stamp(e.refreshExpiry)}, kalan ${left}); access bitiş ${stamp(e.accessExpiry)}`
  );
}
