import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { DexFile } from '../js/dex.js';
const [apk, want] = process.argv.slice(2);
const zip = ZipArchive.open(readFileSync(apk));
const d = new DexFile(await zip.data('classes.dex'));
for (const cd of d.classDefs) {
  if (want && !cd.descriptor.includes(want)) continue;
  console.log(`\n.class ${cd.flags} ${cd.descriptor}`);
  console.log(`  .super ${cd.superDescriptor}  .source ${cd.sourceFile}`);
  if (cd.interfaces.length) console.log(`  .implements ${cd.interfaces.join(', ')}`);
  for (const f of cd.instanceFields) console.log(`  .field ${f.flags} ${f.name}:${f.type}`);
  for (const f of cd.staticFields) console.log(`  .sfield ${f.flags} ${f.name}:${f.type}`);
  for (const list of [cd.directMethods, cd.virtualMethods]) for (const m of list) {
    console.log(`\n  .method ${m.flags} ${m.name}${m.proto}   [methodIdx=${m.methodIdx}]`);
    const c = d.code(cd,m);
    if (!c) { console.log('    (native/abstract)'); continue; }
    console.log(`    regs=${c.registersSize} ins=${c.insSize} outs=${c.outsSize} tries=${c.triesSize} units=${c.insnsSize}`);
    const dbg = d.debugInfo(c, m);
    if (dbg.locals.length) console.log(`    locals: ${dbg.locals.map(l=>`v${l.reg}=${l.name}:${l.type}`).join(' ')}`);
    for (const i of d.disassemble(cd,m)) {
      const parts=[];
      if (i.regs) for (const k of Object.keys(i.regs)) parts.push(`${k}=v${i.regs[k]}`);
      if (i.args) parts.push('args=['+i.args.map(a=>'v'+a).join(',')+']');
      if (i.index!==undefined) {
        if (i.kind==='invoke') parts.push(`-> ${d.methodKey(i.index)}`);
        else if (i.kind.startsWith('field')) parts.push(`-> ${d.fieldKey(i.index)}`);
        else if (i.op===0x1a||i.op===0x1b) parts.push(`-> "${d.string(i.index)}"`);
        else parts.push(`-> ${d.typeName(i.index)}`);
      }
      if (i.target!==undefined) parts.push(`target=${i.target}`);
      if (i.imm!==undefined && i.index===undefined) parts.push(`imm=${i.imm}`);
      const ln = dbg.lines.get(i.addr);
      console.log(`    ${String(i.addr).padStart(5)} ${ln?`L${ln}`:'    '} ${i.name.padEnd(24)} ${parts.join(' ')}`);
      if (i.payload) console.log(`           payload ${i.payload.type} @${i.payloadAddr} ${JSON.stringify(i.payload.targets||i.payload.keys||i.payload.size)}`);
    }
    for (const t of c.tries) console.log(`    try ${t.startAddr}..${t.startAddr+t.insnCount} -> ${JSON.stringify(t.handlers)}`);
  }
}
