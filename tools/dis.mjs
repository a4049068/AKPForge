/* dis.mjs — multi-dex disassembler / string finder.
 *
 *   node tools/dis.mjs <apk> <classFilter> [methodFilter]     disassemble
 *   node tools/dis.mjs <apk> --string <needle>                find string users
 *   node tools/dis.mjs <apk> --classes <filter>               list matching classes
 *
 * classFilter may be a dotted name (androidx.lifecycle.l0), a descriptor
 * fragment (eb/a) or /regex/.  All classes*.dex files are searched.
 */
import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { DexFile } from '../js/dex.js';

const argv = process.argv.slice(2);
const apk = argv.shift();
if (!apk) { console.log('usage: dis.mjs <apk> <filter|--string needle|--classes filter> [methodFilter]'); process.exit(1); }

const zip = ZipArchive.open(readFileSync(apk));
const dexNames = zip.list().filter((n) => /\.dex$/.test(n) && !n.includes('/'));
const dexes = dexNames.map((n) => ({ name: n, dex: new DexFile(zip.dataSync(n)) }));

function mkMatcher(f) {
  if (typeof f === 'string' && f.startsWith('/') && f.endsWith('/')) return new RegExp(f.slice(1, -1));
  const plain = f.replace(/\./g, '/');
  return { test: (s) => s.includes(plain) || s.includes(f) };
}

const mode = argv[0];
if (mode === '--string') {
  const needle = argv[1];
  for (const { name, dex } of dexes) {
    const hits = [];
    for (let i = 0; i < dex.stringIdsSize; i++) { const s = dex.string(i); if (s && s.includes(needle)) hits.push(i); }
    for (const hi of hits) {
      for (const cd of dex.classDefs) {
        for (const list of [cd.directMethods, cd.virtualMethods]) for (const m of list) {
          const c = dex.code(cd, m);
          if (!c) continue;
          for (const ins of dex.disassemble(cd, m)) {
            if ((ins.op === 0x1a || ins.op === 0x1b) && ins.index === hi) {
              console.log(`${name}  ${cd.descriptor}->${m.name}${m.proto}  @${ins.addr}  "${dex.string(hi).slice(0, 80)}"`);
            }
          }
        }
      }
    }

  }
  process.exit(0);
}

if (mode === '--classes') {
  const m = mkMatcher(argv[1]);
  for (const { name, dex } of dexes) {
    for (const cd of dex.classDefs) {
      if (m.test(cd.descriptor)) console.log(`${name}  ${cd.descriptor}  super=${cd.superDescriptor} ifaces=${cd.interfaces.join(',')}`);
    }
  }
  process.exit(0);
}

const filter = mkMatcher(argv[0]);
const mfilter = argv[1] ? mkMatcher(argv[1]) : null;
for (const { name, dex } of dexes) {
  for (const cd of dex.classDefs) {
    if (!filter.test(cd.descriptor)) continue;
    console.log(`\n=== ${name} .class ${cd.flags} ${cd.descriptor}`);
    console.log(`    .super ${cd.superDescriptor}  .source ${cd.sourceFile}`);
    if (cd.interfaces.length) console.log(`    .implements ${cd.interfaces.join(', ')}`);
    for (const f of cd.instanceFields) console.log(`    .field ${f.flags} ${f.name}:${f.type}`);
    for (const f of cd.staticFields) console.log(`    .sfield ${f.flags} ${f.name}:${f.type}`);
    for (const list of [cd.directMethods, cd.virtualMethods]) for (const m of list) {
      if (mfilter && !mfilter.test(m.name + m.proto)) continue;
      const c = dex.code(cd, m);
      console.log(`\n  .method ${m.flags} ${m.name}${m.proto}`);
      if (!c) { console.log('    (native/abstract)'); continue; }
      console.log(`    regs=${c.registersSize} ins=${c.insSize} units=${c.insnsSize} tries=${c.triesSize}`);
      const dbg = dex.debugInfo(c, m);
      if (dbg && dbg.locals.length) console.log(`    locals: ${dbg.locals.map((l) => `v${l.reg}=${l.name}:${l.type}`).join(' ')}`);
      for (const i of dex.disassemble(cd, m)) {
        const parts = [];
        if (i.regs) for (const k of Object.keys(i.regs)) parts.push(`${k}=v${i.regs[k]}`);
        if (i.args) parts.push('args=[' + i.args.map((a) => 'v' + a).join(',') + ']');
        if (i.index !== undefined) {
          if (i.kind === 'invoke') parts.push(`-> ${dex.methodKey(i.index)}`);
          else if (i.kind.startsWith('field')) parts.push(`-> ${dex.fieldKey(i.index)}`);
          else if (i.op === 0x1a || i.op === 0x1b) parts.push(`-> "${dex.string(i.index)}"`);
          else parts.push(`-> ${dex.typeName(i.index)}`);
        }
        if (i.target !== undefined) parts.push(`target=${i.target}`);
        if (i.imm !== undefined && i.index === undefined) parts.push(`imm=${i.imm}`);
        const ln = dbg ? dbg.lines.get(i.addr) : 0;
        console.log(`    ${String(i.addr).padStart(5)} ${ln ? `L${ln}` : '    '} ${i.name.padEnd(22)} ${parts.join(' ')}`);
        if (i.payload) console.log(`           payload ${i.payload.type} @${i.payloadAddr} ${JSON.stringify(i.payload.targets || i.payload.keys || i.payload.size)}`);
      }
      for (const t of c.tries) console.log(`    try ${t.startAddr}..${t.startAddr + t.insnCount} -> ${JSON.stringify(t.handlers)}`);
    }
  }
}
