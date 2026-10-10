import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
const { document } = installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync(process.argv[2]), 'x.apk', () => {});
host.renderer.screen = screen;
try { await host.boot(); } catch (e) { console.log('BOOT:', e.message); }
for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 120));
console.log('crashes:', host.crashes.length);
console.log('compiled methods:', host.transpiler.stats.compiled, 'vm calls:', host.R.stats.calls);
const act = host.activities[host.activities.length - 1];
if (act && act.$contentView && act.$contentView.$el) {
  const d = act.$contentView.$el.dump(1).split('\n');
  console.log('content view tree (' + d.length + ' lines):');
  console.log(d.slice(0, 24).join('\n'));
} else {
  console.log('decor tree:');
  console.log(screen.dump(1).split('\n').slice(0, 20).join('\n'));
}
host.halt();
