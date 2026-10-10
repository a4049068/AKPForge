#!/usr/bin/env node
/* bench.mjs — repeatable performance probe for the transpiler pipeline.
 *
 *   node tools/bench.mjs [test/*.apk ...]
 *
 * Reports, per package: zip+parse+index time, boot time, methods JIT-compiled,
 * VM invocations, heap growth, and a dispatch micro-benchmark (1M shim calls
 * and 1M field accesses) so resolution-cache changes are measurable.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { installDom, El } from './domstub.js';

const { document } = installDom();
const { Host } = await import('../js/host.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let apks = process.argv.slice(2).filter((a) => a.endsWith('.apk'));
if (!apks.length) apks = ['tk.al54.dev.badpixels_4.apk', 'com.santiagorodriguez.countaway_10.apk', 'biz.binarysolutions.weatherusa_25.apk', 'dk.cocode.chess_5018.apk'].map((f) => path.join('test', f));

const rows = [];
for (const rel of apks) {
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const name = path.basename(file);
  const host = new Host();
  const screen = new El('div');
  document.body.appendChild(screen);

  const t0 = process.hrtime.bigint();
  await host.loadApk(readFileSync(file), name, () => {});
  const tLoad = Number(process.hrtime.bigint() - t0) / 1e6;

  host.renderer.screen = screen;
  const t1 = process.hrtime.bigint();
  try { await host.boot(); } catch { /* no launcher etc. */ }
  const tBoot = Number(process.hrtime.bigint() - t1) / 1e6;
  await new Promise((r) => setTimeout(r, 120));

  const heap = process.memoryUsage().heapUsed / 1048576;
  rows.push([name, tLoad, tBoot, host.transpiler.stats.compiled, host.R.stats.calls, host.crashes.length, heap]);
  host.halt();
}

/* ---- dispatch micro-benchmark on the last host ---- */
const R = new (await import('../js/runtime.js')).Runtime({});
const { installFramework } = await import('../js/framework.js');
const { installWidgets } = await import('../js/ui.js');
const fakeHost = {
  log() {}, crash() {}, post(f) { f(); }, postDelayed() {}, timers: new Set(),
  prefs: () => ({ $m: new Map() }), persistPrefs() {}, resources: () => null, packageName: 'bench',
  resString: () => 'x', resColor: () => 0, resDimen: () => 0, resDrawable: () => null, resStringArray: () => [],
  resIntArray: () => [], resIdentifier: () => 0, resBoolean: () => false, resInt: () => 0, resLayoutParser: () => null,
  typedArray: () => null, displayMetrics: () => ({}), systemService: () => null, startActivity() {}, setContentView() {},
  findViewById: () => null, finish() {}, recreate() {}, layoutInflater: () => ({}), setTitle() {}, setSubtitle() {},
  makeCanvas: () => null, lockCanvas: () => null, surfaceCreated() {}, surfaceRect: () => ({}), startGLRenderer() {},
  glRender() {}, stopGLRenderer() {}, toast() {}, showDialog() {}, dismissDialog() {}, mediaPlay() {}, mediaPause() {},
  mediaPlaying: () => false, mediaDuration: () => 0, mediaPosition: () => 0, mediaSeek() {}, clipboardWrite() {},
  webviewLoad() {}, webviewData() {}, initView() {}, viewSetBackground() {}, viewSetPadding() {}, setRecyclerAdapter() {},
  inflateMenu() {}, statusBarColor: null, navBarColor: null, applicationContext: () => ({}), currentActivity: () => ({}),
  screenWidth: () => 360, screenHeight: () => 640, openAsset: () => null, openRawResource: () => null, vfs: new Map(),
  openFileInput: () => null, openFileOutput: () => ({}), redrawSurface() {}, renderer: { ensureView() {}, applyDrawableBg() {}, applyBackground() {}, applyPadding() {} },
};
installFramework(R, fakeHost);
installWidgets(R, fakeHost);

const N = 1_000_000;
let t = process.hrtime.bigint();
for (let i = 0; i < N; i++) R.is('Ljava/lang/Math;->abs(I)I', -5);
const tInvoke = Number(process.hrtime.bigint() - t) / 1e6;

const obj = R.ni('Landroid/os/Bundle;');
t = process.hrtime.bigint();
for (let i = 0; i < N; i++) { R.pf(obj, 'Landroid/os/Bundle;->x:I', i); R.gf(obj, 'Landroid/os/Bundle;->x:I'); }
const tField = Number(process.hrtime.bigint() - t) / 1e6;

t = process.hrtime.bigint();
for (let i = 0; i < 200000; i++) R.iv('Ljava/lang/String;->length()I', 'abcdef');
const tStr = Number(process.hrtime.bigint() - t) / 1e6;

console.log('\npackage                                      load ms   boot ms  compiled   vm calls  crash   heap MB');
console.log('-'.repeat(100));
for (const [n, l, b, c, v, cr, h] of rows) {
  console.log(`${n.slice(0, 42).padEnd(42)} ${l.toFixed(1).padStart(8)} ${b.toFixed(1).padStart(9)} ${String(c).padStart(9)} ${String(v).padStart(10)} ${String(cr).padStart(6)} ${h.toFixed(1).padStart(9)}`);
}
console.log('-'.repeat(100));
console.log(`dispatch: ${(tInvoke).toFixed(0)} ms / 1M static shim calls (${(tInvoke / N * 1e6).toFixed(0)} ns/call)`);
console.log(`fields:   ${(tField).toFixed(0)} ms / 1M put+get pairs (${(tField / N * 1e6 / 2).toFixed(0)} ns/op)`);
console.log(`virtual:  ${(tStr).toFixed(0)} ms / 200k String.length() (${(tStr / 200000 * 1e6).toFixed(0)} ns/call)`);
