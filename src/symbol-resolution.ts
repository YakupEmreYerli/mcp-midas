import { MidasApiError } from "./errors.js";

/**
 * Sembol çözümlemenin ağa çıkmayan seçim mantığı. Midas araması aynı sembolü taşıyan
 * birden çok enstrüman döndürebilir (ör. "GTM": bir TEFAS fonu ve NASDAQ'taki ZoomInfo).
 * Seçim sırası: emrin kendi enstrümanı (güncelleme/iptal) → kullanıcının pozisyonu →
 * piyasa ipucu. Yazma araçlarında bunların hiçbiri ayırt etmiyorsa tahmin yapılmaz.
 */

export type Country = "TR" | "US";

export interface SearchCandidate {
  uid: string;
  symbol: string;
  title: string;
  subtitle: string;
  country: string;
  type: string;
}

export interface HeldInstrument {
  symbol: string;
  assetUid: string;
  name: string;
  market: string;
}

export type ResolveMode = "read" | "order";

export type ResolvedBy = "exact" | "order" | "position" | "market" | "first-exact" | "fuzzy";

export interface PickOptions {
  mode: ResolveMode;
  /** Kullanıcının açık pozisyonları; belirsizlikte ilk tercih. */
  positions?: HeldInstrument[];
  /** Güncelleme/iptalde emrin kendi stockUid değeri. */
  preferUid?: string;
  /** Okuma araçları için isteğe bağlı ülke/piyasa ipucu. */
  market?: Country;
}

export interface PickResult {
  asset: SearchCandidate;
  /** Birebir sembol eşleşen bütün adaylar (pozisyonlar dahil); tek adayda bir öğe. */
  candidates: SearchCandidate[];
  resolvedBy: ResolvedBy;
}

const norm = (value: string) => value.trim().toUpperCase();

function fromPosition(position: HeldInstrument): SearchCandidate {
  return {
    uid: position.assetUid,
    symbol: position.symbol,
    title: position.name,
    subtitle: "",
    country: position.market,
    type: "POZİSYON",
  };
}

/** Aday için insan okunur piyasa etiketi; yalnız gösterim içindir, seçimde kullanılmaz. */
export function marketLabel(candidate: Pick<SearchCandidate, "country" | "type">): string {
  if (candidate.country === "US") return "ABD";
  if (candidate.country === "TR") return /FUND/i.test(candidate.type) ? "TEFAS" : "BIST";
  return candidate.country || "?";
}

export function describeCandidate(candidate: SearchCandidate): string {
  const name = candidate.subtitle && candidate.subtitle !== candidate.title
    ? `${candidate.title} (${candidate.subtitle})`
    : candidate.title || candidate.symbol;
  return `${candidate.symbol} — ${name}; piyasa: ${marketLabel(candidate)}, ülke: ${candidate.country || "?"}, tip: ${candidate.type || "?"}`;
}

/** Okuma sonucunda gösterilecek sade aday listesi. */
export function candidateSummary(candidates: SearchCandidate[]) {
  return candidates.map((c) => ({
    uid: c.uid,
    symbol: c.symbol,
    name: c.title,
    description: c.subtitle || null,
    market: marketLabel(c),
    country: c.country,
    type: c.type,
  }));
}

/** Arama sonuçlarında birebir sembol eşleşenler. */
export function exactMatches(requested: string, results: SearchCandidate[]): SearchCandidate[] {
  const wanted = norm(requested);
  return results.filter((r) => r.symbol && norm(r.symbol) === wanted);
}

/**
 * Pozisyon listesinin gerekip gerekmediği: emir yolunda her zaman (tek arama sonucu
 * kullanıcının tuttuğu enstrümandan farklı olabilir), okumada yalnız belirsizlik ya da
 * piyasa ipucu varken. Böylece sıradan okuma çağrıları ek istek yapmaz.
 */
export function needsPositions(requested: string, results: SearchCandidate[], options: Omit<PickOptions, "positions">): boolean {
  if (options.mode === "order") return true;
  return exactMatches(requested, results).length !== 1 || options.market != null;
}

export function pickInstrument(requested: string, results: SearchCandidate[], options: PickOptions): PickResult {
  const wanted = norm(requested);
  const exact = exactMatches(requested, results);
  const held = (options.positions ?? []).filter((p) => p.symbol && norm(p.symbol) === wanted && p.assetUid);

  // Aday havuzu: birebir arama eşleşmeleri + aramada çıkmamış ama tutulan aynı sembol.
  const pool: SearchCandidate[] = [...exact];
  for (const position of held) {
    if (!pool.some((c) => c.uid === position.assetUid)) pool.push(fromPosition(position));
  }

  if (pool.length === 0) {
    if (!results.length) throw new MidasApiError(`"${requested.trim()}" için enstrüman bulunamadı`);
    // Birebir eşleşme yok: okumada bulanık ilk sonuç; emir yolu bunu ayrıca reddeder.
    return { asset: results[0], candidates: [], resolvedBy: "fuzzy" };
  }

  if (options.preferUid) {
    const own = pool.find((c) => c.uid === options.preferUid);
    if (own) return { asset: own, candidates: pool, resolvedBy: "order" };
  }

  if (pool.length === 1) {
    return { asset: pool[0], candidates: pool, resolvedBy: exact.length ? "exact" : "position" };
  }

  const heldUids = new Set(held.map((p) => p.assetUid));
  const heldInPool = pool.filter((c) => heldUids.has(c.uid));
  if (heldInPool.length === 1) return { asset: heldInPool[0], candidates: pool, resolvedBy: "position" };

  if (options.mode === "order") {
    throw new MidasApiError(
      `"${requested.trim()}" sembolü ${pool.length} farklı enstrümanla birebir eşleşiyor ve ` +
        `pozisyonlarınız hangisi olduğunu ayırt etmiyor; emir için tahmin yapılmadı, işlem reddedildi. ` +
        `Adaylar: ${pool.map((c, i) => `${i + 1}) ${describeCandidate(c)}`).join("; ")}.`
    );
  }

  if (options.market) {
    const inMarket = pool.filter((c) => c.country === options.market);
    if (inMarket.length >= 1) return { asset: inMarket[0], candidates: pool, resolvedBy: "market" };
  }

  // Okuma: Midas'ın sıralamasındaki ilk birebir eşleşme; adaylar sonuçta görünür.
  return { asset: pool[0], candidates: pool, resolvedBy: "first-exact" };
}
