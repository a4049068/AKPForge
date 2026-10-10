import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/dk.cocode.chess_5018.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
const R = host.R;
const oiv = R.iv.bind(R), oid = R.id.bind(R);
const log = (kind, key, a) => { if (/setTag|getTag/.test(key)) console.log('[tag]', kind, key.slice(key.indexOf('->') + 2), 'id=0x' + ((a[1] ?? a[0]) >>> 0).toString(16), 'view=' + (a[0] ? R.classNameOf(a[0]) : 'null'), 'val=' + (a[2] !== undefined ? (a[2] === null ? 'null' : R.classNameOf(a[2]) || typeof a[2]) : a[1] === null ? 'null' : typeof a[1] === 'object' ? R.classNameOf(a[1]) : a[1])); };
R.iv = function (key, ...a) { log('iv', key, a); return oiv(key, ...a); };
R.id = function (key, ...a) { log('id', key, a); return oid(key, ...a); };
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 150));
console.log('registry:', [...host.tagRegistry.keys()].map((k) => '0x' + k.toString(16)));
host.halt(); process.exit(0);
