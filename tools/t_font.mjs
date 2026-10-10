import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/octave.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
const R = host.R;
const og = R.gf.bind(R);
let n = 0;
R.gf = function (o, k) {
  const v = og(o, k);
  if (n < 8 && /fontScale/.test(k)) { n++; console.log('[fontScale read]', v, 'from', o ? R.classNameOf(o) : 'null', 'keys:', o ? Object.keys(o).filter(x => x.includes('Configuration')).length : 0); }
  return v;
};
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 200));
host.halt(); process.exit(0);
