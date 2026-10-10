import { readFileSync } from 'node:fs';
import { installDom } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
await host.loadApk(readFileSync('test/dk.cocode.chess_5018.apk'), 'x.apk', () => {});
const R = host.R;
const ogf = R.gf.bind(R);
let seen = 0;
R.gf = function (o, key) {
  const v = ogf(o, key);
  if (seen < 8 && v === null && /:Ljava\/lang\/Boolean;$/.test(key)) {
    seen++;
    console.log('NULL Boolean field', key, 'on', o ? R.classNameOf(o) : 'null');
    console.log('   stack:', (R._callStack || []).slice(-7).join(' <- '));
  }
  return v;
};
const oag = R.ago.bind(R);
R.ago = function (a, i) {
  const v = oag(a, i);
  if (seen < 12 && v === null && a && a[Symbol.for('dex2web.arrayClass')] && String(a[Symbol.for('dex2web.arrayClass')].desc || '').includes('Boolean')) {
    seen++; console.log('NULL Boolean array elem', i, 'stack:', (R._callStack || []).slice(-6).join(' <- '));
  }
  return v;
};
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 250));
host.halt();
