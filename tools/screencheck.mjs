#!/usr/bin/env node
/* screencheck.mjs — structural (browser-free) twin of tools/screencheck.py.
 *
 * Boots each APK against the DOM stub and inspects the raw screen tree the
 * same way the pixel tool inspects a screenshot: is anything attached, did the
 * app paint a background, is there text, and is that text actually visible
 * against its effective background (WCAG contrast)?
 *
 * A critical regression in the VM/renderer almost always shows up here as a
 * pristine white screen with zero app views, or as dark-on-dark text.
 *
 *   node tools/screencheck.mjs [test/*.apk ...]
 * Exit code: 0 = no FAIL, 1 = at least one FAIL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { installDom, El } from './domstub.js';

const { document } = installDom();
const { Host } = await import('../js/host.js');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SOLID_BY_DESIGN = new Set(['org.vi_server.red_screen_3.apk']);

/* ---------------- colour helpers ---------------- */
function parseColor(c) {
  if (!c || typeof c !== 'string') return null;
  let m = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  m = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
  if (m) {
    const h = m[1];
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    if (h.length === 3) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
  }
  return null;
}
function lum(c) {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- walk the screen tree ---------------- */
function census(screen) {
  const out = {
    views: 0, texts: [], imgs: 0, canvases: 0, iframes: 0, inputs: 0,
    bgs: new Set(), lowContrast: 0, lowSamples: [], textInk: 0,
  };
  const screenBg = parseColor(screen.style.backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const screenFg = parseColor(screen.style.color) || { r: 17, g: 17, b: 17, a: 1 };

  const walk = (el, inheritedFg, bgStack) => {
    for (const child of el.childNodes) {
      if (!(child instanceof El)) continue;
      const st = child.style || {};
      let bg = bgStack;
      const cbg = parseColor(st.backgroundColor);
      const hasImg = st.backgroundImage && st.backgroundImage !== 'none' && st.backgroundImage !== '';
      if ((cbg && cbg.a > 0.05) || hasImg) {
        bg = bgStack.concat([{ color: cbg, image: hasImg }]);
        if (cbg) out.bgs.add(`${cbg.r},${cbg.g},${cbg.b}`);
        if (hasImg) out.bgs.add('image');
      }
      const fg = parseColor(st.color) || inheritedFg;

      if (child.tagName === 'IMG' && child.attrs.src) out.imgs++;
      if (child.tagName === 'CANVAS') out.canvases++;
      if (child.tagName === 'IFRAME' && (child.srcdoc || child.attrs.srcdoc || child.src || child.attrs.src)) out.iframes++;
      if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA' || child.tagName === 'SELECT') out.inputs++;
      if (child._classes.includes('av')) out.views++;
      const label = child.childNodes.find((c) => c instanceof El && c._classes.includes('av-compound-text'));
      const own = (child._text || '').trim();
      const t = own || (label ? (label._text || '').trim() : '');
      if (t && child._classes.includes('av')) {
        out.texts.push(t.slice(0, 40));
        out.textInk += t.length;
        // effective background = nearest painted ancestor, else the screen
        let eff = screenBg;
        for (let i = bg.length - 1; i >= 0; i--) if (bg[i].color) { eff = bg[i].color; break; }
        const c = contrast(fg, eff);
        if (c < 1.35) { out.lowContrast++; if (out.lowSamples.length < 4) out.lowSamples.push(`${t.slice(0, 22)} @${c.toFixed(2)}`); }
      }
      walk(child, fg, bg);
    }
  };
  walk(screen, screenFg, []);
  out.texts = [...new Set(out.texts)];
  return out;
}

function verdict(c, name, host) {
  const reasons = [];
  if (c.views === 0) {
    if (host && host.lastBootError && /no launcher/.test(host.lastBootError)) {
      return ['SKIP', ['no launcher <activity> in the manifest (service/tile/widget-only package)']];
    }
    return ['FAIL', ['blank-default: no app view attached to the screen']];
  }
  let v = 'PASS';
  const painted = c.bgs.size >= 1 || c.imgs >= 1 || c.canvases >= 1;
  const embedded = c.canvases >= 1 || c.iframes >= 1;
  const explained = (host && (host.usesCompose || host.deferredIntent));
  if (c.texts.length === 0 && c.imgs === 0 && c.inputs === 0 && !painted && !embedded && !explained) {
    return ['FAIL', ['flat-no-content: screen has views but no text, image, input, canvas or painted background']];
  }
  if (embedded && c.texts.length === 0 && c.imgs === 0) {
    reasons.push(c.canvases ? 'content is custom onDraw() painting on a canvas layer' : 'content lives inside a WebView');
    if (v === 'PASS') v = 'WARN';
  }
  if (host && host.usesCompose) {
    reasons.push('UI is Jetpack Compose (its own toolkit, not XML views) — out of scope for the view renderer');
    v = 'WARN';
  }
  if (host && host.deferredIntent) {
    reasons.push(`app immediately delegated to an external intent (${host.deferredIntent}) and shows no UI of its own`);
    v = 'WARN';
  }
  if (SOLID_BY_DESIGN.has(name) && c.texts.length === 0) {
    v = 'WARN'; reasons.push('uniform fill is the documented purpose of this app');
  }
  if (c.lowContrast) {
    reasons.push(`${c.lowContrast} text node(s) nearly invisible on their background: ` + c.lowSamples.join('; '));
    if (v === 'PASS') v = 'WARN';
  }
  return [v, reasons];
}

/* ---------------- run ---------------- */
let args = process.argv.slice(2).filter((a) => a.endsWith('.apk'));
if (!args.length) {
  const { readdirSync } = await import('node:fs');
  args = readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.apk')).map((f) => path.join('test', f));
}
const rows = [];
let fails = 0;
for (const rel of args) {
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const name = path.basename(file);
  const host = new Host();
  const screen = new El('div');
  screen.style.backgroundColor = 'rgb(255,255,255)';
  screen.style.color = 'rgb(17,17,17)';
  document.body.appendChild(screen);
  let c = null, v = 'FAIL', reasons = [];
  try {
    await host.loadApk(readFileSync(file), name, () => {});
    host.renderer.screen = screen;
    try { await host.boot(); } catch (e) { reasons.push(`boot: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 250));
    c = census(screen);
    host.lastBootError = reasons.find((r) => r.startsWith('boot:')) || null;
    host.usesCompose = [...host.transpiler._byDesc.keys()].some((d) => d.includes('androidx/compose/ui'))
      || (host.logs || []).some((l) => /ViewTreeLifecycleOwner not found|AndroidComposeView/.test(l.msg || ''));
    const defer = (host.logs || []).find((l) => /No activity resolves action (.+) in the browser/.test(l.msg || ''));
    host.deferredIntent = defer ? (defer.msg.match(/action (.+) in/) || [])[1] : null;
    {
      const [vv, rr] = verdict(c, name, host);
      v = vv; reasons = rr.concat(reasons);
    }
  } catch (e) {
    reasons = [`harness error: ${e.message}`];
  }
  if (v === 'FAIL') fails++;
  rows.push([name, v, c, reasons, host.crashes.length]);
  host.halt();
}

const hdr = `${'package'.padEnd(42)} ${'verdict'.padEnd(6)} ${'views'.padStart(5)} ${'txt'.padStart(4)} ${'img'.padStart(3)} ${'inp'.padStart(3)} ${'bgs'.padStart(4)} ${'ink'.padStart(5)} ${'lowC'.padStart(5)} ${'crash'.padStart(5)}`;
console.log('\n' + hdr);
console.log('-'.repeat(hdr.length));
for (const [name, v, c, reasons, crashes] of rows) {
  console.log(
    name.slice(0, 42).padEnd(42) + ' ' + v.padEnd(6) +
    String(c ? c.views : 0).padStart(5) +
    String(c ? c.texts.length : 0).padStart(4) +
    String(c ? c.imgs : 0).padStart(3) +
    String(c ? c.inputs : 0).padStart(3) +
    String(c ? c.bgs.size : 0).padStart(4) +
    String(c ? c.textInk : 0).padStart(5) +
    String(c ? c.lowContrast : 0).padStart(5) +
    String(crashes).padStart(5));
  for (const r of reasons) console.log(' '.repeat(44) + '└ ' + r);
}
console.log('-'.repeat(hdr.length));
console.log(`${rows.length - fails}/${rows.length} screens look alive · ${fails} FAIL`);
process.exit(fails ? 1 : 0);
