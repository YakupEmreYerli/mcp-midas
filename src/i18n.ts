/**
 * Arayüz dili: Türkçe ya da İngilizce. Tek ayar `MIDAS_LANG` (`tr` | `en`); verilmezse sistem
 * yereli (`LC_ALL` → `LC_MESSAGES` → `LANG`) `tr` ile başlıyorsa Türkçe, değilse İngilizce.
 *
 * Kütüphane yok: her modül kendi metinlerini `defineMessages(tr, en)` ile yanında tanımlar.
 * `en` parametresi `tr`'nin tipini taşır; eksik ya da fazla anahtar derlemede hata verir.
 * Dil her çağrıda ortamdan okunur (`.env` sonradan yüklense de, testler dili sabitlese de doğru).
 */

export type Lang = "tr" | "en";

export const LANGUAGES: readonly Lang[] = ["tr", "en"];

export function resolveLanguage(env: Record<string, string | undefined> = process.env): Lang {
  const explicit = env.MIDAS_LANG?.trim().toLowerCase();
  if (explicit) {
    if (explicit === "tr" || explicit === "en") return explicit;
    throw new Error(`MIDAS_LANG must be "tr" or "en", got "${env.MIDAS_LANG}"`);
  }
  // POSIX önceliği: LC_ALL, sonra LC_MESSAGES, sonra LANG; boş değer atlanır.
  const locale = [env.LC_ALL, env.LC_MESSAGES, env.LANG].find((value) => value?.trim())?.trim().toLowerCase() ?? "";
  return locale.startsWith("tr") ? "tr" : "en";
}

/** Şu anki dil; `MIDAS_LANG` geçersizse İngilizce (hata, yapılandırma doğrulamasında görünür). */
export function language(): Lang {
  try {
    return resolveLanguage(process.env);
  } catch {
    return "en";
  }
}

/** Sayı ve tarih biçimi için yerel. */
export function locale(lang: Lang = language()): string {
  return lang === "tr" ? "tr-TR" : "en-US";
}

/** Testler için: tanımlanan her tablo (anahtarların iki dilde aynı olduğu çalışma anında da denetlenir). */
export const messageTables: Array<{ tr: object; en: object }> = [];

/**
 * Bir modülün metin tablosu. Dönen fonksiyon verilen (ya da şu anki) dilin metinlerini verir.
 * Değerler düz metin ya da parametreli metin fonksiyonu olabilir.
 */
export function defineMessages<T extends object>(tr: T, en: NoInfer<T>): (lang?: Lang) => T {
  messageTables.push({ tr, en });
  return (lang = language()) => (lang === "tr" ? tr : en);
}
