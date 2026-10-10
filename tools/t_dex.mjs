import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { DexFile } from '../js/dex.js';
for (const f of process.argv.slice(2)) {
  const zip = ZipArchive.open(readFileSync(f));
  for (const n of zip.order.filter(x=>x.endsWith('.dex'))) {
    const d = new DexFile(await zip.data(n), n);
    const s = d.stats;
    console.log(`${f} :: ${n} v${s.version} classes=${s.classes} strings=${s.strings} types=${s.types} methods=${s.methods} fields=${s.fields} insns=${s.insns} codeBytes=${s.codeBytes}`);
  }
}
