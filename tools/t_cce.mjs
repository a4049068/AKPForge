globalThis.__D2W_PROBE_CCE = true;
import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/octave.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
const R0 = host.R;
const origIv = R0.iv.bind(R0);
let tagLog = 0;
R0.iv = function (key, ...a) {
  if (tagLog < 40 && /setTag\(ILjava\/lang\/Object;\)|getTag\(I\)/.test(key)) {
    tagLog++;
    console.log('[tag]', key.slice(key.indexOf('->') + 2), 'id=0x' + (a[1] !== undefined ? (a[1] >>> 0).toString(16) : (a[0] >>> 0).toString(16)), 'view=' + (a[0] ? R0.classNameOf(a[0]) : 'null'), 'val=' + (a[2] !== undefined ? (a[2] === null ? 'null' : R0.classNameOf(a[2]) || typeof a[2]) : (a[1] === null ? 'null' : typeof a[1] === 'object' ? R0.classNameOf(a[1]) : a[1])));
  }
  return origIv(key, ...a);
};
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 250));
host.halt();
