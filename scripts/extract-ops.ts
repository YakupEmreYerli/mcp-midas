/** Bir pakete gömülü tüm GraphQL işlem adlarını (query+mutation) listeler. */
import * as fs from "node:fs";

const src = fs.readFileSync(process.argv[2], "utf8");
const out: string[] = [];
for (const kind of ["query", "mutation", "subscription"]) {
  const marker = `operation:"${kind}"`;
  let idx = 0;
  while ((idx = src.indexOf(marker, idx)) !== -1) {
    const name = src.slice(idx, idx + 4000).match(/name:\{kind:"Name",value:"([^"]+)"\}/)?.[1];
    out.push(`${kind}\t${name ?? "(anon)"}`);
    idx += marker.length;
  }
}
console.log(out.join("\n"));
