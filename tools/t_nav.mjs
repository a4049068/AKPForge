/* Navigation probe: boot a multi-activity app, click through to a second
 * activity, then Back, and assert the stack + visible decor at each step. */
import { readFileSync } from 'node:fs';
import { installDom, El } from './domstub.js';
const { document } = installDom();
const { Host } = await import('../js/host.js');

const host = new Host();
const screen = new El('div'); document.body.appendChild(screen);
await host.loadApk(readFileSync('test/com.santiagorodriguez.countaway_10.apk'), 'x.apk', () => {});
host.renderer.screen = screen;
await host.boot();
await new Promise((r) => setTimeout(r, 200));

const state = (label) => {
  const stack = host.activities.map((a) => host.R.classNameOf(a).split('.').pop() + (a.$state ? ':' + a.$state : ''));
  const visible = screen.childNodes.filter((c) => c.style.display !== 'none').length;
  const texts = [];
  const walk = (e, d) => { for (const c of e.childNodes) { if (c._text && c._text.trim()) texts.push(c._text.trim().slice(0, 28)); walk(c, d + 1); } };
  for (const c of screen.childNodes) if (c.style.display !== 'none') walk(c, 0);
  console.log(`${label}\n   stack=[${stack.join(' → ')}] visibleDecors=${visible} texts=${JSON.stringify(texts.slice(0, 4))}`);
};
state('after boot:');

// click "Add countdown"
const find = (el, pred) => { if (pred(el)) return el; for (const c of el.childNodes) { const f = find(c, pred); if (f) return f; } return null; };
const btn = find(screen, (e) => e._text && /Add countdown/i.test(e._text));
console.log('found button:', !!btn);
if (btn) { btn.dispatch('click'); }
await new Promise((r) => setTimeout(r, 300));
state('after tap "Add countdown":');

// Back via onBackPressed on the top activity
const top = host.activities[host.activities.length - 1];
if (top) { try { host.R.iv('Landroid/app/Activity;->onBackPressed()V', top); } catch (e) { console.log('back threw', e.message); } }
await new Promise((r) => setTimeout(r, 300));
state('after Back:');
console.log('crashes:', host.crashes.length);
host.halt();
