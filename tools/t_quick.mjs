import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync(process.argv[2]), 'x.apk', () => {});
host.renderer.screen = screen;
host.R.maxSteps = 400000; host.taskBudget = 4000;
try { await host.boot(); } catch (e) { console.log('BOOT:', e.message); }
await new Promise((r) => setTimeout(r, 300));
for (const c of host.crashes.slice(0, 4)) { console.log('CRASH:', host.R.classNameOf(c), '|', host.R.messageOf(c)); for (const f of (c.$stack || []).slice(0, 4)) console.log('   at', f); }
console.log('unresolved:', [...(host.unresolved || []).entries()].slice(0, 10).map(([k, v]) => `${v}×${k}`).join('  '));
host.halt(); process.exit(0);
