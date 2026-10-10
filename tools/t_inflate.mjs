import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { inflateRawSync } from '../js/binary.js';
import { crc32 } from '../js/binary.js';
for (const f of ['test/tk.al54.dev.badpixels_4.apk','test/com.santiagorodriguez.countaway_10.apk','test/dk.cocode.chess_5018.apk']) {
  const zip = ZipArchive.open(readFileSync(f));
  let ok=0, bad=0, crcbad=0;
  for (const n of zip.order) {
    const e = zip.get(n);
    if (e.isDir) continue;
    const a = await zip.data(n);
    if (e.method===8) {
      const raw = zip._rawSlice(e);
      const b = inflateRawSync(raw);
      if (b.length!==a.length || !b.every((v,i)=>v===a[i])) bad++; else ok++;
    } else ok++;
    if (e.uncompSize !== a.length) crcbad++;
  }
  console.log(f, 'entries',zip.order.length,'inflate-match',ok,'mismatch',bad,'size-mismatch',crcbad);
}
