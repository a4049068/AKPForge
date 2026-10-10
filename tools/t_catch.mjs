import { readFileSync } from 'node:fs';
import { installDom } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
await host.loadApk(readFileSync('test/dk.cocode.chess_5018.apk'), 'x.apk', () => {});
const R = host.R;
const orig = R.catchAt.bind(R);
let n = 0;
R.catchAt = function (TT, addr, e) {
  const r = orig(TT, addr, e);
  if (n++ < 12) console.log('catchAt addr=' + addr, 'exc=' + R.classNameOf(e), 'TT=' + JSON.stringify(TT || []).slice(0, 160), '=> bb ' + r);
  return r;
};
try { await host.boot(); } catch (e) { console.log('boot fail', e.message); }
await new Promise((r) => setTimeout(r, 300));
for (const c of host.crashes) console.log('CRASH:', R.classNameOf(c), R.messageOf(c), (c.$stack || []).slice(0, 3).join(' <- '));
host.halt();
