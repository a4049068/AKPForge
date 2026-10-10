import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
const { document } = installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync(process.argv[2]), 'x.apk', () => {});
host.renderer.screen = screen;
try { await host.boot(); } catch (e) { console.log('BOOT FAIL', e.message); }
await new Promise((r) => setTimeout(r, 150));
for (const c of host.crashes) {
  console.log('CRASH:', host.R.classNameOf(c), '|', host.R.messageOf(c));
  for (const f of (c.$stack || [])) console.log('   at', f);
}
host.halt();
