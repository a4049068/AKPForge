import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/dk.cocode.chess_5018.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
const R = host.R;
const oiv = R.iv.bind(R);
let n = 0;
R.iv = function (key, ...a) {
  const r = oiv(key, ...a);
  if (n < 14 && /getTag\(I\)|setTag\(IL/.test(key)) {
    n++;
    console.log('[tag]', key.includes('set') ? 'SET' : 'GET', 'id=0x' + (a[1] !== undefined ? (a[1] >>> 0).toString(16) : (a[0] >>> 0).toString(16)), 'on', a[0] ? R.classNameOf(a[0]) : 'null', '→', r === null ? 'null' : R.classNameOf(r));
  }
  return r;
};
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 200));
const act = host.activities[0];
console.log('decor tags:', act && act.$decor && act.$decor.$tags ? [...act.$decor.$tags.keys()].map((k) => '0x' + k.toString(16)) : 'NONE');
host.halt(); process.exit(0);
