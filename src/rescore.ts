#!/usr/bin/env node
/**
 * Tamamlanmış v3.1 taramalarını reel VWAP konumlanma terimini ekleyerek v3.2'ye göre
 * yeniden puanlar.
 *
 * Terim harman sonrası sınırlı bir düzeltme olduğundan tam yeniden tarama gerekmez: saklanan
 * Q, P ve R, FINAL_raw değerini birebir üretir; yalnız eklenen kısım değişir.
 * scans/_RESCORE.md ve scans/_rescored.json dosyalarını yazar.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_ROOT } from "./config.js";

const JOURNAL = process.argv[2];
if (!JOURNAL || !fs.existsSync(JOURNAL)) throw new Error("iş akışı journal.jsonl dosyasının yolunu ver");

const positioning = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, "scans", "_positioning.json"), "utf8")
) as Record<string, any>;

interface Row {
  symbol: string;
  company?: string;
  price?: number;
  q: number;
  p: number;
  r: number;
  tape: number;
  final31: number;
  stance31: string;
  ceiling_applied?: boolean;
  confidence?: string;
  one_line?: string;
}

const rows = new Map<string, Row>();
for (const line of fs.readFileSync(JOURNAL, "utf8").split("\n").filter(Boolean)) {
  let j: any;
  try {
    j = JSON.parse(line);
  } catch {
    continue;
  }
  const res = j?.result;
  if (j.type === "result" && res?.symbol && res.status === "ok") {
    rows.set(res.symbol, {
      symbol: res.symbol,
      company: res.company,
      price: res.price,
      q: res.q,
      p: res.p,
      r: res.r,
      tape: res.tape ?? 0,
      final31: res.final,
      stance31: res.stance,
      ceiling_applied: res.ceiling_applied,
      confidence: res.confidence,
      one_line: res.one_line,
    });
  }
}

// Duruş adları tarama günlüğündeki (journal) stance değerleriyle karşılaştırıldığı için
// İngilizce kalır.
function stanceFor(final: number): string {
  if (final >= 75) return "Strong Buy";
  if (final >= 60) return "Buy / Accumulate";
  if (final >= 45) return "Hold / Neutral";
  if (final >= 32) return "Speculative / Weak Hold";
  return "Unattractive / Reduce-into-strength";
}

const out: any[] = [];
for (const r of rows.values()) {
  const pos = positioning[r.symbol];
  const term: number = pos && typeof pos.term === "number" ? pos.term : 0;
  const blend = 100 * (r.q / 100) ** 0.45 * (r.p / 100) ** 0.55;
  const raw = blend * r.r + r.tape + term;
  // spekülatif tavan, eklenen terimlerden sonra da geçerlidir
  const ceiling = r.q < 45 ? 55 : 100;
  const final32 = Math.max(0, Math.min(raw, ceiling));
  out.push({
    ...r,
    z: pos?.z ?? null,
    stabilizing: pos?.stabilizing ?? false,
    bucket: pos?.bucket ?? "n/a",
    reasons: pos?.stabilizingReasons ?? [],
    term,
    final32: Math.round(final32 * 10) / 10,
    stance32: stanceFor(final32),
    delta: Math.round((final32 - r.final31) * 10) / 10,
    changed: stanceFor(final32) !== r.stance31.split(" (")[0].trim(),
  });
}

out.sort((a, b) => b.final32 - a.final32);
fs.writeFileSync(path.join(PROJECT_ROOT, "scans", "_rescored.json"), JSON.stringify(out, null, 2));

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const lines: string[] = [];
lines.push("# BIST-100 taraması — v3.2 yeniden puanlama (reel VWAP konumlanma terimi eklendi)");
lines.push("");
lines.push(
  `Tamamlanmış ${out.length} tarama yeniden puanlandı. Konumlanma terimi harman sonrası sınırlı ` +
    "bir düzeltmedir; bu yüzden Q, P ve R her hissenin v3.1 puan kartındakiyle aynıdır — yalnız " +
    "eklenen kısım değişir. Terimin biçimi ve kanıtı: `docs/analiz-kurallari.md` §PositioningTerm."
);
lines.push("");
lines.push("| # | Sembol | v3.2 | v3.1 | Δ | Terim | z | Grup | Duruş (v3.2) |");
lines.push("|---|---|---|---|---|---|---|---|---|");
out.forEach((r, i) => {
  lines.push(
    `| ${i + 1} | ${r.symbol} | **${r.final32}** | ${r.final31} | ${fmt(r.delta)} | ${fmt(
      r.term
    )} | ${r.z === null ? "–" : r.z.toFixed(2)} | ${r.bucket} | ${r.stance32} |`
  );
});

const stab = out.filter((r) => r.term === 10);
lines.push("");
lines.push("## Teyitli teslimiyet taraması (terim +10)");
lines.push("");
lines.push(
  "Reel VWAP'ın çok altında **ve** dengeleniyor — geriye dönük testin en keskin ayırıcısı " +
    "(aynı ucuzlukta hâlâ düşenlere göre 63 günlük fazla getiride +4 puan)."
);
lines.push("");
if (stab.length) {
  for (const r of stab) {
    lines.push(`- **${r.symbol}** — z ${r.z.toFixed(2)}, ${r.reasons.join("; ")} → ${r.final32} (${r.stance32})`);
  }
} else {
  lines.push("- Tamamlanan kümede yok.");
}

const danger = out.filter((r) => r.term === -5);
lines.push("");
lines.push(`## Tehlike bölgesi (terim −5): ${danger.length} hisse`);
lines.push("");
lines.push(
  "z −2 ile −0.5 arasında: cazip görünecek kadar ucuz, teslimiyete varacak kadar değil. " +
    "Tarihsel olarak en kötü grup (63 günde −%3,15 fazla getiri, n=1139)."
);
lines.push("");
lines.push(danger.map((r) => r.symbol).join(" · ") || "Yok.");

const moved = out.filter((r) => r.changed);
lines.push("");
lines.push(`## Duruş değişiklikleri: ${moved.length}`);
lines.push("");
for (const r of moved) {
  lines.push(`- ${r.symbol}: ${r.stance31} → **${r.stance32}** (${r.final31} → ${r.final32})`);
}

fs.writeFileSync(path.join(PROJECT_ROOT, "scans", "_RESCORE.md"), lines.join("\n") + "\n");
console.log(
  JSON.stringify({
    rescored: out.length,
    stanceChanges: moved.length,
    plus10: stab.length,
    minus5: danger.length,
  })
);
