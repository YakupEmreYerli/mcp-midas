import { defineMessages } from "./i18n.js";

const M = defineMessages(
  {
    invalid: (name: string) => `${name} geçersiz: boş olmayan bir JSON dizi olmalı, ör. ["/usr/local/bin/my-approval-window"]`,
  },
  {
    invalid: (name) => `${name} is invalid: it must be a non-empty JSON array, e.g. ["/usr/local/bin/my-approval-window"]`,
  }
);

/**
 * Komut ayarları (`MIDAS_CONFIRM_LOCAL`, `MIDAS_CONFIRM_REMOTE`, `MIDAS_SMS_CODE_COMMAND` …):
 * JSON dizi, ilk öğe çalıştırılacak program, kalanlar argümanları. Kabuk kullanılmaz.
 *
 * Bu komutlar yalnız sunucunun kendi ortamından (servis dosyası, `.env`) okunur; araç
 * şemasından, istekten ya da çalışma anında değiştirilebilen bir kanaldan gelmez.
 */
export function parseCommandSetting(name: string, value: string | undefined): string[] | null {
  if (!value?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === "string" && item.length > 0)) {
    return parsed as string[];
  }
  throw new Error(M().invalid(name));
}
