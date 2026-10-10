import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/octave.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
host.R.maxSteps = 300000;
try { await host.boot(); } catch (e) { console.log('boot:', e.message); }
await new Promise((r) => setTimeout(r, 400));
for (const c of host.crashes.slice(0, 3)) {
  console.log('CRASH:', host.R.classNameOf(c), '|', host.R.messageOf(c));
  for (const f of (c.$stack || []).slice(0, 8)) console.log('   at', f);
}
host.halt();
