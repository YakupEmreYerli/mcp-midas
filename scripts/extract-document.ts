/**
 * Küçültülmüş paketin gömülü graphql-tag AST'sinden tam bir GraphQL belgesini yeniden kurar.
 * Kullanım: npx tsx scripts/extract-document.ts <dosya.js> <İşlemAdı>
 */
import * as fs from "node:fs";
import { print } from "graphql";

const src = fs.readFileSync(process.argv[2], "utf8");
const opName = process.argv[3];

const nameIdx = src.indexOf(`value:"${opName}"`);
if (nameIdx === -1) throw new Error(`${opName} işlemi bulunamadı`);

// kapsayan {kind:"Document" düğümüne geri yürü
const docIdx = src.lastIndexOf('{kind:"Document"', nameIdx);
if (docIdx === -1) throw new Error("kapsayan Document düğümü bulunamadı");

// docIdx'ten başlayan, süslü parantezleri dengeli nesne değişmezini çıkar
let depth = 0;
let end = -1;
for (let i = docIdx; i < src.length; i++) {
  const c = src[i];
  if (c === '"') {
    // dize değişmezini atla
    i++;
    while (i < src.length && !(src[i] === '"' && src[i - 1] !== "\\")) i++;
    continue;
  }
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end === -1) throw new Error("dengesiz nesne değişmezi");

const literal = src.slice(docIdx, end);
// değişmez, graphql-tag'in ürettiği saf veridir (kind/value/name nesneleri)
const ast = new Function(`"use strict"; return (${literal});`)();

const doc = {
  ...ast,
  definitions: ast.definitions.filter(
    (d: any) => d.kind !== "OperationDefinition" || d.name?.value === opName
  ),
};

console.log(print(doc as any));
