/** Bağımlılıksız argüman ayrıştırıcı. Bilinmeyen bayrak hatadır: yanlış yazılmış `--tp` sessizce düşmesin. */
import { defineMessages } from "../i18n.js";

const M = defineMessages(
  {
    unknownFlag: (flag: string) => `Bilinmeyen seçenek: ${flag}`,
    missingValue: (flag: string) => `${flag} bir değer istiyor`,
    noValue: (flag: string) => `${flag} değer almaz`,
    badNumber: (what: string, value: string) => `${what} sıfırdan büyük bir sayı olmalı, nokta ile (ör. 12.5): "${value}"`,
  },
  {
    unknownFlag: (flag) => `Unknown option: ${flag}`,
    missingValue: (flag) => `${flag} needs a value`,
    noValue: (flag) => `${flag} takes no value`,
    badNumber: (what, value) => `${what} must be a number above zero, with a dot (e.g. 12.5): "${value}"`,
  }
);

/** Değer alan bayraklar. */
const VALUE_FLAGS = [
  "account", "server", "token-file",
  "currency", "market", "interval", "limit",
  "from", "to", "status", "filter", "offset",
  "type", "tp", "sl", "quantity", "stop",
] as const;

/** Açma/kapama bayrakları. */
const BOOLEAN_FLAGS = ["json", "confirm", "details", "local", "help"] as const;

const ALIASES: Record<string, string> = { hesap: "account", h: "help" };

export type Flags = Record<string, string | true>;

export interface ParsedArgs {
  positionals: string[];
  flags: Flags;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    const raw = arg.replace(/^--?/, "");
    const eq = raw.indexOf("=");
    const given = eq === -1 ? raw : raw.slice(0, eq);
    const name = ALIASES[given] ?? given;
    const inline = eq === -1 ? undefined : raw.slice(eq + 1);
    if ((BOOLEAN_FLAGS as readonly string[]).includes(name)) {
      if (inline !== undefined) throw new Error(M().noValue(`--${given}`));
      flags[name] = true;
    } else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const value = inline ?? argv[i + 1];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) {
        throw new Error(M().missingValue(`--${given}`));
      }
      if (inline === undefined) i++;
      flags[name] = value;
    } else {
      throw new Error(M().unknownFlag(`--${given}`));
    }
  }
  return { positionals, flags };
}

/** Sıfırdan büyük, noktalı ondalık sayı; virgül, üs ve eksi reddedilir. */
export function parseNumber(value: string, what: string): number {
  if (!/^\d+(\.\d+)?$/.test(value.trim()) || Number(value) <= 0) throw new Error(M().badNumber(what, value));
  return Number(value);
}
