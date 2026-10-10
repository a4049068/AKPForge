/* t_run.mjs — headless end-to-end run: load an APK, transpile, boot the
 * launcher activity and dump the resulting view tree + logcat. */
import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';

const { document } = installDom();

const { Host } = await import('../js/host.js');

const apkPath = process.argv[2];
const bytes = readFileSync(apkPath);
const host = new Host();

const screen = new El('div');
screen.clientWidth = 360; screen.clientHeight = 640;
document.body.appendChild(screen);

let lastStage = '';
await host.loadApk(bytes, apkPath.split('/').pop(), (stage, msg) => {
  if (stage !== lastStage) { console.log(`  [${stage}] ${msg}`); lastStage = stage; }
});
host.renderer.screen = screen;
host.titleEl = new El('div');

// validate every shim method signature: must be name(...)ret
let badSig = 0;
for (const [desc, c] of host.R.classes) {
  for (const [sig, m] of c.methods) {
    const i = sig.indexOf('(');
    if (i <= 0 || !sig.endsWith(')') && sig.indexOf(')') < 0) { if (badSig++ < 8) console.log('  BAD SIG', desc, sig); continue; }
    const close = sig.indexOf(')');
    if (close < i) { if (badSig++ < 8) console.log('  BAD SIG', desc, sig); }
  }
}
console.log(`  shim classes: ${host.R.classes.size}, malformed signatures: ${badSig}`);

console.log('\n── manifest ──────────────────────────────');
const m = host.manifest;
console.log(`  package      ${m.package}`);
console.log(`  label        ${m.label}`);
console.log(`  version      ${m.versionName} (${m.versionCode})`);
console.log(`  sdk          min=${m.minSdk} target=${m.targetSdk}`);
console.log(`  launcher     ${m.launcherName}`);
console.log(`  activities   ${m.activities.length}`);
console.log(`  permissions  ${m.permissions.length}`);
console.log(`  icon         ${host.iconDataUri ? host.iconDataUri.slice(0, 48) + '…' : 'none'}`);
console.log(`  dex          ${host.dexes.map((d) => d.name).join(', ')}`);
const st = host.dexes[0].dex.stats;
console.log(`  dex stats    ${st.classes} classes / ${st.methods} methods / ${st.insns} insns`);
if (host.rt) console.log(`  resources    ${JSON.stringify(host.rt.stats.byType)}`);

console.log('\n── boot ──────────────────────────────────');
const t0 = Date.now();
try {
  await host.boot();
} catch (e) {
  console.log('  BOOT FAILED:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
}
console.log(`  booted in ${Date.now() - t0} ms`);

// let queued tasks flush
await new Promise((r) => setTimeout(r, 120));

console.log('\n── view tree ─────────────────────────────');
const act = host.activities[host.activities.length - 1];
if (act && act.$contentView && act.$contentView.$el) {
  const d = act.$contentView.$el.dump(1);
  console.log(d.split('\n').slice(0, 60).join('\n'));
} else {
  console.log('  (no content view attached)');
  if (screen.childNodes.length) console.log(screen.dump(1).split('\n').slice(0, 40).join('\n'));
}

console.log('\n── transpiler stats ──────────────────────');
const ts = host.transpiler.stats;
console.log(`  classes indexed   ${ts.classes}`);
console.log(`  methods declared  ${ts.methods}`);
console.log(`  methods compiled  ${ts.compiled}`);
console.log(`  instructions      ${ts.instructions}`);
console.log(`  VM calls          ${host.R.stats.calls}`);
if (ts.unsupported.size) console.log(`  unsupported ops   ${JSON.stringify([...ts.unsupported])}`);
const unres = host.unresolved ? [...host.unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) : [];
console.log(`  unresolved APIs   ${host.unresolved ? host.unresolved.size : 0}`);
for (const [k, n] of unres) console.log(`     ×${n}  ${k}`);
console.log(`  crashes           ${host.crashes.length}`);

console.log('\n── logcat ────────────────────────────────');
for (const l of host.logs.slice(-45)) {
  console.log(`  ${l.level} ${l.tag.padEnd(20).slice(0, 20)} ${l.msg.slice(0, 150)}${l.thr ? '  ⤷ ' + l.thr.slice(0, 120) : ''}`);
}
host.halt();
