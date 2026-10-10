/* app.js — Dex2Web front-end. Wires the transpiler engine to the workbench UI. */

import { Host } from './host.js';
import { axmlToXml, TYPE } from './axml.js';
import { escapeHtml } from './binary.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const STAGES = [
  ['zip', 'ZIP container', 'central directory'],
  ['resources', 'resources.arsc', 'resource table'],
  ['manifest', 'AndroidManifest', 'binary AXML'],
  ['dex', 'DEX', 'bytecode tables'],
  ['vm', 'VM bootstrap', 'java.* / android.*'],
  ['transpile', 'Index & transpile', 'class registry'],
  ['icon', 'Assets', 'icon / drawables'],
  ['done', 'Ready', ''],
];

let host = null;
let currentClass = null;
let currentMethod = null;
let resType = null;
let bundleText = null;
let running = false;

/* ================================================================== */
/*  Boot                                                                */
/* ================================================================== */
initDropzone();
initTabs();
initSamples();
initRunControls();
initConsole();
initSearch();
tickClock();
setInterval(tickClock, 20000);

function tickClock() {
  const d = new Date();
  const el = $('#sbTime');
  if (el) el.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ================================================================== */
/*  Drop zone                                                           */
/* ================================================================== */
function initDropzone() {
  const drop = $('#drop'), file = $('#file');
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  file.addEventListener('change', () => { if (file.files[0]) handleFile(file.files[0]); });
  ['dragenter', 'dragover'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); if (t === 'dragleave' && e.relatedTarget) return; drop.classList.remove('over'); }));
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  $('#loadAnother').addEventListener('click', () => {
    $('#workbench').classList.remove('on');
    $('#hero').classList.remove('hidden');
    $('#pipeline').classList.add('hidden');
    $('#errBanner').classList.remove('on');
    $('#loadAnother').hidden = true;
    $('#enginePill').innerHTML = 'engine <b>idle</b>';
    $('#statPill').hidden = true;
    if (host) { host.halt(); host = null; }
    running = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function handleFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await loadApk(bytes, file.name);
}

async function loadApkBytes(bytes, name) { await loadApk(new Uint8Array(bytes), name); }

async function loadApk(bytes, name) {
  showError('');
  $('#hero').classList.add('hidden');
  $('#pipeline').classList.remove('hidden');
  $('#workbench').classList.remove('on');
  $('#loadAnother').hidden = true;
  renderStages(null);
  $('#enginePill').innerHTML = `engine <b>working</b>`;

  if (host) { host.halt(); host = null; }
  bundleText = null;
  $('#dlBundle').disabled = true;
  running = false;
  resetScreen();

  const h = new Host();
  h.on('log', onLog);
  h.on('title', (t) => { $('#sbTitle').textContent = t || ''; });
  h.on('status', (s) => { $('#enginePill').innerHTML = `engine <b>${escapeHtml(s)}</b>`; });

  let t0 = performance.now();
  try {
    await h.loadApk(bytes, name, (stage, msg) => { renderStages(stage, msg); yieldUI(); });
  } catch (e) {
    renderStages('error', e.message);
    showError(`${name}: ${e.message}\n\nDex2Web needs a real APK: a ZIP archive containing AndroidManifest.xml and at least one classes.dex.`);
    $('#enginePill').innerHTML = 'engine <b>failed</b>';
    $('#loadAnother').hidden = false;
    return;
  }
  host = h;
  h.renderer.screen = $('#screen');
  h.titleEl = $('#titleBar');
  renderStages('done');
  const dt = performance.now() - t0;

  $('#enginePill').innerHTML = `engine <b>ready</b>`;
  $('#loadAnother').hidden = false;
  $('#workbench').classList.add('on');
  populateWorkbench(dt);
  $('#workbench').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function* _noop() {}
function yieldUI() { return new Promise((r) => setTimeout(r, 0)); }

function renderStages(active, detail) {
  const el = $('#stages');
  const order = STAGES.map((s) => s[0]);
  const allDone = active === 'done';
  const ai = active === 'error' ? -2 : order.indexOf(active);
  el.innerHTML = STAGES.map(([key, title, sub], i) => {
    let cls = '';
    if (allDone) cls = 'done';
    else if (active === 'error') cls = i === 0 ? 'err' : '';
    else if (ai < 0) cls = '';
    else if (i < ai) cls = 'done';
    else if (i === ai) cls = 'active';
    const mark = cls === 'done' ? '✓' : cls === 'active' ? `<span class="spinner"></span>` : cls === 'err' ? '✕' : `<span class="n">${i + 1}</span>`;
    const dd = cls === 'active' && detail ? detail : sub;
    return `<div class="stage ${cls}">${mark.startsWith('<') ? mark : `<span class="n">${mark}</span>`}<span class="t">${title}<span class="d">${escapeHtml(dd || '')}</span></span></div>`;
  }).join('');
}

function showError(msg) {
  const b = $('#errBanner');
  b.textContent = msg;
  b.classList.toggle('on', !!msg);
}

/* ================================================================== */
/*  Workbench                                                           */
/* ================================================================== */
function populateWorkbench(ms) {
  const m = host.manifest;
  const d0 = host.dexes[0];
  const st = d0 ? d0.dex.stats : { classes: 0, methods: 0, insns: 0 };
  let classes = 0, methods = 0, insns = 0, codeBytes = 0;
  for (const d of host.dexes) { const s = d.dex.stats; classes += s.classes; methods += s.methods; insns += s.insns; codeBytes += s.codeBytes; }

  $('#appIcon').src = host.iconDataUri || blankIcon();
  $('#appName').textContent = String(m.label || m.package || 'Unknown app');
  $('#appPkg').textContent = m.package || '—';
  $('#appChips').innerHTML = [
    ['version', `${m.versionName || '?'} (${m.versionCode ?? '?'})`],
    ['sdk', `${m.minSdk ?? '?'} → ${m.targetSdk ?? '?'}`],
    ['classes', classes.toLocaleString()],
    ['methods', methods.toLocaleString()],
  ].map(([k, v]) => `<span class="chip">${k} <b>${escapeHtml(String(v))}</b></span>`).join('');
  $('#cntRes').textContent = host.rt ? host.rt.stats.entries.toLocaleString() : '0';
  $('#cntCls').textContent = classes.toLocaleString();
  $('#cntZip').textContent = host.entries.length.toLocaleString();
  $('#statPill').hidden = false;
  $('#statPill').textContent = `${(ms).toFixed(0)} ms · ${(host.apkBytes.length / 1024).toFixed(0)} KB`;
  $('#footStats').textContent = `${classes.toLocaleString()} classes · ${methods.toLocaleString()} methods · ${insns.toLocaleString()} Dalvik instructions · ${host.R.classes.size.toLocaleString()} shim classes`;

  /* ---- overview ---- */
  const resStats = host.rt ? host.rt.stats : { byType: {}, entries: 0 };
  $('#ovStats').innerHTML = [
    [insns.toLocaleString(), 'Dalvik instructions'],
    [codeBytes.toLocaleString(), 'bytes of bytecode'],
    [host.R.classes.size.toLocaleString(), 'runtime classes'],
    [resStats.entries.toLocaleString(), 'resource entries'],
    [host.entries.length.toLocaleString(), 'archive entries'],
    [ms.toFixed(1) + ' ms', 'load + index time'],
  ].map(([v, k]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

  $('#ovPkg').innerHTML = kv([
    ['package', m.package],
    ['app label', m.label],
    ['versionName', m.versionName],
    ['versionCode', m.versionCode],
    ['minSdkVersion', m.minSdk],
    ['targetSdkVersion', m.targetSdk],
    ['launcher activity', m.launcherName || '— none —'],
    ['allowBackup', yn(m.allowBackup)],
    ['debuggable', yn(m.debuggable)],
    ['signature', d0 ? d0.dex.signature : '—'],
    ['dex version', d0 ? d0.dex.version : '—'],
  ]);

  $('#ovDex').innerHTML = host.dexes.map((d) => {
    const s = d.dex.stats;
    return `<div class="bar-row"><span class="nm">${escapeHtml(d.name)}</span><span class="bar"><i style="width:${Math.min(100, (s.insns / Math.max(1, insns)) * 100)}%"></i></span><span class="ct">${s.insns.toLocaleString()}</span></div>`;
  }).join('') + `<div class="small muted" style="margin-top:9px">dex v${d0 ? d0.dex.version : '?'}, SHA-1 <span class="mono">${d0 ? d0.dex.signature : ''}</span></div>`;

  const comp = (label, list) => list.length
    ? `<div style="margin-bottom:10px"><div class="mono small muted" style="margin-bottom:5px">${label} · ${list.length}</div>${list.map((n) => `<div class="mono small" style="padding:2px 0;color:var(--ink-2)">${escapeHtml(n)}</div>`).join('')}</div>`
    : '';
  $('#ovComponents').innerHTML =
    comp('activities', m.activities.map((a) => a.name + (a.name === m.launcherName ? '  ⟵ launcher' : ''))) +
    comp('services', m.services) + comp('receivers', m.receivers) + comp('providers', m.providers) +
    comp('uses-feature', m.features) ||
    '<div class="small muted">No components declared.</div>';

  $('#ovPerms').innerHTML = m.permissions.length
    ? `<div class="taglist">${m.permissions.map((p) => {
        const short = p.replace('android.permission.', '');
        const risky = /LOCATION|CAMERA|MICROPHONE|RECORD_AUDIO|CONTACTS|READ_|WRITE_|PHONE|SMS|CALENDAR|BODY_SENSORS|STORAGE|POST_NOTIFICATIONS/.test(short);
        return `<span class="tag ${risky ? 'warn' : ''}" title="${escapeHtml(p)}">${escapeHtml(short)}</span>`;
      }).join('')}</div>`
    : '<div class="small muted">None requested.</div>';

  const so = host.nativeLibs;
  const abis = [...new Set(so.map((n) => (n.split('/')[1] || '?')))].sort();
  $('#ovNative').innerHTML = `
    <div class="grid3">
      <div><div class="mono small muted">native libraries</div><div class="mono" style="font-size:19px;color:var(--acc-2)">${so.length}</div></div>
      <div><div class="mono small muted">ABIs</div><div class="mono small">${abis.length ? abis.map((a) => `<span class="tag ${a === 'wasm' ? 'ok' : 'danger'}">${escapeHtml(a)}</span>`).join(' ') : '<span class="muted">none</span>'}</div></div>
      <div><div class="mono small muted">assets</div><div class="mono" style="font-size:19px;color:var(--acc-2)">${host.assets.length}</div></div>
    </div>
    ${so.length ? `<div class="hintbox" style="margin-top:12px">⚠ <b>${so.length} native <span class="mono">.so</span> librar${so.length === 1 ? 'y' : 'ies'}</b> found (${abis.join(', ')}).
      Dex2Web transpiles <b>Dalvik bytecode only</b>. JNI methods backed by these libraries return default values and are
      reported in the transpile log, so Java-only code paths still run — but native engines, codecs and crypto will not.</div>` : ''}
    ${host.assets.length ? `<div class="small muted" style="margin-top:10px">${host.assets.slice(0, 12).map((a) => `<div class="mono" style="padding:1px 0">${escapeHtml(a)}</div>`).join('')}${host.assets.length > 12 ? `<div class="mono">… +${host.assets.length - 12} more</div>` : ''}</div>` : ''}`;

  /* ---- manifest ---- */
  $('#manifestCode').innerHTML = highlightXml(axmlToXml(host.manifestXml.root));

  /* ---- resources ---- */
  buildResTabs();
  renderResources();

  /* ---- classes ---- */
  buildClassList();

  /* ---- archive ---- */
  renderArchive('');

  /* ---- report ---- */
  renderReport();
}

function yn(v) { return v === undefined || v === null || v === '' ? '—' : String(v); }
function kv(rows) {
  return rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd${k === 'launcher activity' && v && !v.includes('none') ? ' class="hl"' : ''}>${escapeHtml(v === undefined || v === null || v === '' ? '—' : String(v))}</dd>`).join('');
}
function blankIcon() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23161d2b'/%3E%3Cpath d='M16 20a8 8 0 0 1 16 0v10a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z' fill='%236ee7b7' opacity='.7'/%3E%3Ccircle cx='21' cy='21' r='1.6' fill='%2308110d'/%3E%3Ccircle cx='27' cy='21' r='1.6' fill='%2308110d'/%3E%3C/svg%3E";
}

/* ================================================================== */
/*  Tabs                                                                */
/* ================================================================== */
function initTabs() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    $$('.tab').forEach((t) => t.classList.toggle('on', t === b));
    $$('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + b.dataset.p));
    if (b.dataset.p === 'report') renderReport();
    if (b.dataset.p === 'archive') renderArchive($('#zipSearch').value);
  });
  $('#zipSearch').addEventListener('input', (e) => renderArchive(e.target.value));
  $$('[data-dl]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.dl === 'manifest') download(`${host.manifest.package || 'app'}-AndroidManifest.xml`, axmlToXml(host.manifestXml.root), 'text/xml');
  }));
}

/* ================================================================== */
/*  Resources panel                                                     */
/* ================================================================== */
function buildResTabs() {
  if (!host.rt) { $('#resTabs').innerHTML = '<span class="muted small">This APK has no resources.arsc</span>'; return; }
  const types = [];
  for (const pkg of host.rt.packages) for (const [n, b] of pkg.types) {
    const count = b.configs.reduce((s, c) => s + c.entries.length, 0);
    types.push([n, count]);
  }
  types.sort((a, b) => b[1] - a[1]);
  resType = types.length ? types[0][0] : null;
  $('#resTabs').innerHTML = types.map(([n, c]) => `<button class="res-tab ${n === resType ? 'on' : ''}" data-t="${escapeHtml(n)}">${escapeHtml(n)} <span class="muted">${c}</span></button>`).join('');
  $('#resTabs').onclick = (e) => {
    const b = e.target.closest('.res-tab');
    if (!b) return;
    resType = b.dataset.t;
    $$('.res-tab').forEach((x) => x.classList.toggle('on', x === b));
    renderResources();
  };
}

function renderResources() {
  const q = ($('#resSearch').value || '').toLowerCase();
  const tbl = $('#resTable');
  if (!host.rt) { tbl.innerHTML = ''; return; }
  const rows = [];
  for (const pkg of host.rt.packages) {
    const bucket = pkg.types.get(resType);
    if (!bucket) continue;
    for (const cfg of bucket.configs) {
      for (const e of cfg.entries) {
        if (q && !(e.key.toLowerCase().includes(q) || host.rt.describe(e).toLowerCase().includes(q))) continue;
        rows.push([e, cfg.label]);
      }
    }
  }
  rows.sort((a, b) => a[0].key.localeCompare(b[0].key) || a[1].localeCompare(b[1]));
  const shown = rows.slice(0, 600);
  tbl.innerHTML = `<thead><tr><th style="width:88px">id</th><th style="width:230px">name</th><th style="width:110px">config</th><th>value</th></tr></thead><tbody>` +
    shown.map(([e, cfg]) => {
      let val;
      if (e.complex) {
        val = `<span class="tag">${e.values.length} entries</span> ` + e.values.slice(0, 6).map((v) => `<span class="muted">${escapeHtml(host.rt.describe({ dataType: v.dataType, data: v.data, value: v.value }))}</span>`).join(' · ');
      } else if (e.dataType >= TYPE.INT_COLOR_ARGB8 && e.dataType <= TYPE.INT_COLOR_RGB4) {
        val = `<span class="swatch" style="background:${escapeHtml(e.css)}"></span><span class="mono">${escapeHtml(host.rt.describe(e))}</span>`;
      } else if (e.dataType === TYPE.STRING && e.str && /\.(png|webp|jpe?g|gif|xml)$/i.test(e.str)) {
        const uri = /\.(png|webp|jpe?g|gif)$/i.test(e.str) ? host.dataUri(e.str) : null;
        val = uri ? `<img class="thumb" src="${uri}" alt=""> <span class="muted">${escapeHtml(e.str)}</span>` : `<span class="muted">${escapeHtml(e.str)}</span>`;
      } else {
        val = escapeHtml(host.rt.describe(e));
      }
      return `<tr><td class="id">${e.idHex}</td><td>${escapeHtml(e.key)}</td><td class="id">${escapeHtml(cfg)}</td><td class="v">${val}</td></tr>`;
    }).join('') + `</tbody>` +
    (rows.length > shown.length ? `<tfoot><tr><td colspan="4" class="muted">… ${rows.length - shown.length} more rows hidden — refine the filter</td></tr></tfoot>` : '');
}

/* ================================================================== */
/*  Classes & code panel                                                */
/* ================================================================== */
function allClassDescs() {
  const out = [];
  for (const { dex } of host.dexes) for (const cd of dex.classDefs) out.push(cd.descriptor);
  return out.sort();
}
function buildClassList() {
  const q = ($('#clsSearch').value || '').toLowerCase();
  const scope = $('#clsScope').value;
  const pkgPrefix = 'L' + (host.manifest.package || '').replace(/\./g, '/') ;
  const descs = allClassDescs().filter((d) => {
    if (q && !d.toLowerCase().includes(q)) return false;
    if (scope === 'app' && !d.startsWith(pkgPrefix)) return false;
    if (scope === 'withcode') {
      const f = host.transpiler.lookup(d);
      if (!f) return false;
      return f.cd.directMethods.some((m) => m.codeOff) || f.cd.virtualMethods.some((m) => m.codeOff);
    }
    return true;
  });
  $('#clsCount').textContent = `${descs.length.toLocaleString()} classes`;
  const list = $('#clsList');
  const shown = descs.slice(0, 800);
  list.innerHTML = shown.map((d) => {
    const short = d.slice(1, -1).replace(/\//g, '.');
    const f = host.transpiler.lookup(d);
    const n = f ? f.cd.directMethods.length + f.cd.virtualMethods.length : 0;
    return `<div class="row ${d === currentClass ? 'on' : ''}" data-d="${escapeHtml(d)}" title="${escapeHtml(d)}"><span>${escapeHtml(short)}</span><span class="m">${n}</span></div>`;
  }).join('') + (descs.length > shown.length ? `<div class="row muted" style="cursor:default">… ${descs.length - shown.length} more — refine the filter</div>` : '');
  list.onclick = (e) => {
    const r = e.target.closest('.row[data-d]');
    if (!r) return;
    selectClass(r.dataset.d);
  };
}

function selectClass(desc) {
  currentClass = desc; currentMethod = null;
  $$('#clsList .row').forEach((r) => r.classList.toggle('on', r.dataset.d === desc));
  const f = host.transpiler.lookup(desc);
  const ml = $('#mList');
  if (!f) { ml.innerHTML = `<div class="row muted">not defined in this APK</div>`; $('#codePanels').innerHTML = ''; return; }
  const { dex, cd } = f;
  const items = [];
  items.push(`<div class="grp">class · ${escapeHtml(cd.flags || '')} · ${cd.instanceFields.length + cd.staticFields.length} fields · extends ${escapeHtml((cd.superDescriptor || '—').slice(1, -1).replace(/\//g, '.'))}</div>`);
  for (const fld of cd.staticFields) items.push(`<div class="row" style="cursor:default"><span class="muted">static</span> <span>${escapeHtml(fld.name)}</span><span class="m">${escapeHtml(fld.type)}</span></div>`);
  for (const fld of cd.instanceFields) items.push(`<div class="row" style="cursor:default"><span class="muted">field</span> <span>${escapeHtml(fld.name)}</span><span class="m">${escapeHtml(fld.type)}</span></div>`);
  items.push(`<div class="grp">methods</div>`);
  for (const list of [cd.directMethods, cd.virtualMethods]) {
    for (const m of list) {
      const code = dex.code(cd, m);
      items.push(`<div class="row" data-m="${escapeHtml(m.name)}" data-p="${escapeHtml(m.proto)}" title="${escapeHtml(m.flags)}">
        <span class="sig">${escapeHtml(m.name)}</span><span class="muted">${escapeHtml(m.proto)}</span>
        <span class="m">${code ? code.insnsSize + 'u' : (m.accessFlags & 0x100 ? 'native' : 'abs')}</span></div>`);
    }
  }
  ml.innerHTML = items.join('');
  ml.onclick = (e) => {
    const r = e.target.closest('.row[data-m]');
    if (!r) return;
    selectMethod(r.dataset.m, r.dataset.p);
    $$('#mList .row').forEach((x) => x.classList.remove('on'));
    r.classList.add('on');
  };
  // auto-select the most interesting method
  const first = ml.querySelector('.row[data-m]');
  if (first) { first.classList.add('on'); selectMethod(first.dataset.m, first.dataset.p); }
}

function selectMethod(name, proto) {
  currentMethod = { name, proto };
  const f = host.transpiler.lookup(currentClass);
  const { dex, cd } = f;
  const m = [...cd.directMethods, ...cd.virtualMethods].find((x) => x.name === name && x.proto === proto);
  const code = m && dex.code(cd, m);
  if (!code) {
    $('#codePanels').innerHTML = `<div class="hintbox">No bytecode — this is a <b>native</b> or <b>abstract</b> method, so there is nothing to transpile.</div>`;
    return;
  }
  const dbg = dex.debugInfo(code, m);
  const dis = dex.disassemble(cd, m);

  const dalvik = dis.map((i) => {
    const parts = [];
    if (i.kind === 'invoke') parts.push(...i.args.map((a) => `v${a}`), '→', dex.methodKey(i.index));
    else if (i.kind === 'field-get' || i.kind === 'field-set') {
      if (i.op >= 0x60) parts.push(dex.fieldKey(i.index), '→', `v${i.regs.A}`);
      else parts.push(`v${i.regs.A}`, `v${i.regs.B}`, dex.fieldKey(i.index));
    } else if (i.op === 0x1a || i.op === 0x1b) parts.push(`v${i.regs.A}`, JSON.stringify(dex.string(i.index)));
    else if (i.kind === 'const') parts.push(`v${i.regs.A}`, fmtImm(i));
    else if (i.kind === 'branch') {
      const regs = Object.keys(i.regs || {}).map((k) => `v${i.regs[k]}`);
      parts.push(...regs, `→ ${i.target}`);
    } else {
      const regs = Object.keys(i.regs || {}).map((k) => `v${i.regs[k]}`);
      parts.push(...regs);
      if (i.args) parts.push('{', i.args.map((a) => 'v' + a).join(', '), '}');
      if (i.index !== undefined && i.kind !== 'invoke') parts.push(dex.typeName(i.index));
      if (i.imm !== undefined && i.index === undefined && i.kind !== 'const') parts.push('#' + i.imm);
      if (i.target !== undefined) parts.push(`→ ${i.target}`);
    }
    const ln = dbg.lines.get(i.addr);
    const loc = dbg.locals.find((l) => l.reg === (i.regs ? i.regs.A : -1) && i.addr >= l.start && i.addr < l.end);
    const note = loc ? `  ; ${loc.name}` : '';
    return `<span class="c">${String(i.addr).padStart(5)}${ln ? ' L' + ln : ''}</span>  <span class="k">${i.name}</span> ${escapeHtml(parts.join(' '))}${escapeHtml(note)}`;
  }).join('\n');

  const js = host.transpiler.methodSource(cd.descriptor, name, proto);
  const tries = code.tries.length
    ? code.tries.map((t) => `; try ${t.startAddr}..${t.startAddr + t.insnCount} → ${(t.handlers || []).map((h) => `${h.catchAll ? 'any' : h.type} @${h.addr}`).join(', ')}`).join('\n')
    : '';

  $('#codePanels').innerHTML = `
    <div class="toolbar">
      <span class="mono small" style="color:var(--ink-2)">${escapeHtml(cd.descriptor.slice(1, -1).replace(/\//g, '.'))}.<b style="color:var(--acc)">${escapeHtml(name)}</b>${escapeHtml(proto)}</span>
      <span class="pill">regs ${code.registersSize}</span>
      <span class="pill">ins ${code.insSize}</span>
      <span class="pill">${code.insnsSize} code units</span>
      <span class="pill">${dis.length} insns</span>
      ${code.tries.length ? `<span class="pill" style="color:var(--warn)">${code.tries.length} try</span>` : ''}
      ${dbg.file ? `<span class="pill">${escapeHtml(dbg.file)}</span>` : ''}
      <div class="spacer"></div>
      <button class="btn ghost sm" id="dlJs">Download this method</button>
    </div>
    ${tries ? `<pre class="code" style="max-height:70px;margin-bottom:10px">${escapeHtml(tries)}</pre>` : ''}
    <div class="cols2">
      <div>
        <div class="colhead"><span class="badge dalvik">INPUT</span><span class="lbl">Dalvik bytecode · smali-style</span></div>
        <pre class="code">${dalvik}</pre>
      </div>
      <div>
        <div class="colhead"><span class="badge js">OUTPUT</span><span class="lbl">Transpiled JavaScript · generated on demand</span></div>
        <pre class="code">${highlightJs(js || '// no code')}</pre>
      </div>
    </div>`;
  $('#dlJs').onclick = () => download(`${name.replace(/[^\w]/g, '_')}.js`, js || '', 'text/javascript');
}

function fmtImm(i) {
  if (i.imm === undefined) return '';
  if (typeof i.imm === 'number' && Math.abs(i.imm) > 1e6) return `${i.imm} (0x${(i.imm >>> 0).toString(16)})`;
  return String(i.imm);
}

/* ================================================================== */
/*  Report panel                                                        */
/* ================================================================== */
function renderReport() {
  if (!host) return;
  const ts = host.transpiler.stats;
  let insns = 0, methods = 0;
  for (const d of host.dexes) { const s = d.dex.stats; insns += s.insns; methods += s.methods; }
  $('#repStats').innerHTML = [
    [ts.compiled.toLocaleString(), 'methods JIT-compiled'],
    [ts.instructions.toLocaleString(), 'instructions emitted'],
    [ts.unsupported.size, 'unsupported opcodes'],
    [(host.unresolved ? host.unresolved.size : 0).toLocaleString(), 'unresolved API calls'],
    [host.R.stats.calls.toLocaleString(), 'VM invocations'],
    [host.crashes.length, 'uncaught exceptions'],
  ].map(([v, k]) => `<div class="stat"><div class="v" style="color:${k.includes('unsupported') || k.includes('uncaught') ? (Number(String(v).replace(/,/g, '')) ? 'var(--warn)' : 'var(--ok)') : 'var(--acc-2)'}">${v}</div><div class="k">${k}</div></div>`).join('');

  const hist = [...host.transpiler.opcodeHistogram.entries()].sort((a, b) => b[1] - a[1]);
  const max = hist.length ? hist[0][1] : 1;
  $('#repOpcodes').innerHTML = hist.length
    ? hist.slice(0, 26).map(([n, c]) => `<div class="bar-row"><span class="nm">${escapeHtml(n)}</span><span class="bar"><i style="width:${(c / max) * 100}%"></i></span><span class="ct">${c.toLocaleString()}</span></div>`).join('') +
      (hist.length > 26 ? `<div class="small muted" style="margin-top:8px">… ${hist.length - 26} more distinct opcodes</div>` : '') +
      `<div class="small muted" style="margin-top:10px">Histogram covers the ${ts.compiled.toLocaleString()} methods compiled so far. Compiling more (run the app, browse classes, or hit AOT) fills it in.</div>`
    : '<div class="small muted">Nothing compiled yet — run the app or press “Transpile everything”.</div>';

  const unres = host.unresolved ? [...host.unresolved.entries()].sort((a, b) => b[1] - a[1]) : [];
  $('#repUnresolved').innerHTML = unres.length
    ? unres.slice(0, 40).map(([k, n]) => `<div class="bar-row"><span class="nm" title="${escapeHtml(k)}">${escapeHtml(k.split('->').pop())}</span><span class="bar"><i style="width:${Math.min(100, (n / unres[0][1]) * 100)}%;background:linear-gradient(90deg,#fcd34d,#fda4af)"></i></span><span class="ct">×${n}</span></div>`).join('') +
      (unres.length > 40 ? `<div class="small muted" style="margin-top:8px">… ${unres.length - 40} more</div>` : '') +
      `<div class="small muted" style="margin-top:10px">Calls the shim doesn't implement yet. They log a warning and return a type-correct default, so execution continues instead of aborting.</div>`
    : '<div class="small ok">✓ Every framework call the app made is implemented by the runtime shim.</div>';

  $('#repWarnings').innerHTML = (host.transpiler.warnings.length
    ? host.transpiler.warnings
    : ts.unsupported.size ? [...ts.unsupported].map(([n, c]) => `unsupported opcode ${n} × ${c}`) : ['none'])
    .slice(0, 200).map((w) => `<div style="color:var(--warn)">· ${escapeHtml(String(w))}</div>`).join('');

  $('#aotBtn').onclick = async () => {
    $('#aotBtn').disabled = true;
    $('#aotProgress').hidden = false;
    await new Promise((r) => setTimeout(r, 30));
    try {
      bundleText = host.transpiler.fullSource((p) => { $('#aotProgress').textContent = `${(p * 100).toFixed(0)}%`; });
      $('#dlBundle').disabled = false;
      const kb = (bundleText.length / 1024).toFixed(0);
      $('#aotProgress').textContent = `${host.transpiler.stats.compiled.toLocaleString()} methods · ${kb} KB of JavaScript`;
      renderReport();
    } catch (e) {
      $('#aotProgress').textContent = 'failed: ' + e.message;
    }
    $('#aotBtn').disabled = false;
  };
  $('#dlBundle').onclick = () => download(`${(host.manifest.package || 'app')}-dex2web.js`, bundleText, 'text/javascript');
}

/* ================================================================== */
/*  Archive panel                                                       */
/* ================================================================== */
function renderArchive(q) {
  if (!host) return;
  q = (q || '').toLowerCase();
  const rows = host.entries.filter((e) => !q || e.name.toLowerCase().includes(q));
  const total = host.entries.reduce((s, e) => s + e.size, 0);
  const comp = host.entries.reduce((s, e) => s + e.compSize, 0);
  $('#zipInfo').textContent = `${rows.length} / ${host.entries.length} entries · ${(total / 1048576).toFixed(2)} MB raw · ${(comp / 1048576).toFixed(2)} MB stored`;
  const shown = rows.slice(0, 500);
  $('#zipTable').innerHTML = `<thead><tr><th>entry</th><th style="width:80px">method</th><th style="width:100px;text-align:right">raw</th><th style="width:100px;text-align:right">stored</th><th style="width:76px;text-align:right">ratio</th></tr></thead><tbody>` +
    shown.map((e) => {
      const ratio = e.size ? (100 - (e.compSize / e.size) * 100).toFixed(0) : '0';
      return `<tr><td>${escapeHtml(e.name)}</td><td class="id">${e.method === 8 ? 'deflate' : 'store'}</td><td style="text-align:right">${fmtSize(e.size)}</td><td style="text-align:right" class="id">${fmtSize(e.compSize)}</td><td style="text-align:right" class="id">${ratio}%</td></tr>`;
    }).join('') + '</tbody>';
}
function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB'; }

/* ================================================================== */
/*  Run panel                                                           */
/* ================================================================== */
function initRunControls() {
  $('#runBtn').addEventListener('click', () => { switchTab('run'); doRun(); });
  $('#btnRun').addEventListener('click', doRun);
  $('#btnRestart').addEventListener('click', () => { if (host) { host.reset(); resetScreen(); doRun(); } });
  $('#btnBack').addEventListener('click', () => {
    if (!host || !host.activities.length) return;
    const a = host.activities[host.activities.length - 1];
    try { host.R.iv('Landroid/app/Activity;->onBackPressed()V', a); } catch (e) { host.crash(e); }
  });
  $('#btnHome').addEventListener('click', () => {
    if (!host) return;
    host.reset(); resetScreen();
    $('#enginePill').innerHTML = 'engine <b>stopped</b>';
    pushLog({ t: Date.now(), level: 'I', tag: 'Dex2Web', msg: 'App stopped. Press Run to boot the launcher activity again.' });
  });
  $('#btnClearLog').addEventListener('click', () => { $('#logcat').innerHTML = ''; host.logs.length = 0; updateLogCount(); });
}

function resetScreen() {
  const s = $('#screen');
  s.innerHTML = `<div class="idle-screen"><div class="em">▢</div><div>Nothing running yet.<br>Press <b>Run app</b> to boot the launcher activity.</div></div>`;
  $('#titleBar').classList.remove('on');
  $('#sbTitle').textContent = '';
}

async function doRun() {
  if (!host || running) return;
  running = true;
  $('#btnRun').disabled = true; $('#runBtn').disabled = true;
  host.reset();
  resetScreen();
  $('#screen').innerHTML = '';
  $('#enginePill').innerHTML = 'engine <b>booting</b>';
  pushLog({ t: Date.now(), level: 'S', tag: 'Dex2Web', msg: `══ booting ${host.manifest.package} ══` });
  await new Promise((r) => setTimeout(r, 30));
  try {
    const ms = await host.boot();
    $('#enginePill').innerHTML = `engine <b>running</b>`;
    pushLog({ t: Date.now(), level: 'S', tag: 'Dex2Web', msg: `══ first frame after ${ms.toFixed(1)} ms · ${host.transpiler.stats.compiled} methods transpiled ══` });
  } catch (e) {
    $('#enginePill').innerHTML = 'engine <b>halted</b>';
    if (e.noLauncher) {
      host.lastNoLauncher = true;
      $('#screen').innerHTML = `<div class="idle-screen"><div class="em">⊘</div><div><b>No launcher activity.</b><br><br>This package declares only services, receivers or quick-settings tiles — there is no screen to show.<br><br><span class="mono" style="font-size:11px">${escapeHtml(host.manifest.services.concat(host.manifest.receivers).slice(0, 6).join('\n'))}</span></div></div>`;
      pushLog({ level: 'W', tag: 'Dex2Web', msg: e.message });
    } else {
      showError(e.message);
      pushLog({ level: 'E', tag: 'Dex2Web', msg: e.message });
    }
  }
  running = false;
  $('#btnRun').disabled = false; $('#runBtn').disabled = false;
  renderReport();
}

/* ---- logcat ---- */
function initSearch() {
  $('#resSearch').addEventListener('input', () => renderResources());
  let t = null;
  const rebuild = () => { clearTimeout(t); t = setTimeout(buildClassList, 130); };
  $('#clsSearch').addEventListener('input', rebuild);
  $('#clsScope').addEventListener('change', rebuild);
  $('#logFilter').addEventListener('input', () => rerenderLog());
  $('#logLevel').addEventListener('change', () => rerenderLog());
}
const LEVELS = { V: 0, D: 1, I: 2, W: 3, E: 4 };
function logVisible(l) {
  const min = LEVELS[$('#logLevel').value] ?? 2;
  const q = ($('#logFilter').value || '').toLowerCase();
  if ((LEVELS[l.level] ?? 2) < min) return false;
  if (q && !(`${l.tag} ${l.msg}`.toLowerCase().includes(q))) return false;
  return true;
}
function onLog(entry) { pushLog(entry); }
function pushLog(l) {
  const box = $('#logcat');
  if (!logVisible(l)) { updateLogCount(); return; }
  box.appendChild(logLine(l));
  while (box.childNodes.length > 1500) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  updateLogCount();
}
function logLine(l) {
  const d = document.createElement('div');
  d.className = `ln l-${l.level}`;
  const t = new Date(l.t || Date.now());
  d.innerHTML = `<span class="lv">${l.level}</span> <span class="tg">${escapeHtml(String(t.toTimeString().slice(0, 8)) + ' ' + (l.tag || '').padEnd(18).slice(0, 18))}</span> <span class="ms">${escapeHtml(l.msg || '')}${l.thr ? '\n      ⤷ ' + escapeHtml(l.thr) : ''}</span>`;
  return d;
}
function rerenderLog() {
  const box = $('#logcat');
  box.innerHTML = '';
  if (!host) return;
  for (const l of host.logs) if (logVisible(l)) box.appendChild(logLine(l));
  box.scrollTop = box.scrollHeight;
  updateLogCount();
}
function updateLogCount() { $('#logCount').textContent = `${$('#logcat').childNodes.length} lines`; }

/* ================================================================== */
/*  Java console                                                        */
/* ================================================================== */
function initConsole() {
  const run = () => {
    const inp = $('#jcmd');
    const cmd = inp.value.trim();
    if (!cmd) return;
    inp.value = '';
    pushLog({ t: Date.now(), level: 'S', tag: 'console', msg: '$ ' + cmd });
    let out;
    try { out = execCmd(cmd); } catch (e) { out = '✗ ' + (e.message || e); }
    if (out !== undefined && out !== null && out !== '') pushLog({ t: Date.now(), level: 'S', tag: '', msg: String(out) });
  };
  $('#jrun').addEventListener('click', run);
  $('#jcmd').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

function execCmd(cmd) {
  if (!host) return 'no APK loaded';
  const R = host.R;
  const parts = cmd.split(/\s+/);
  const head = parts[0].toLowerCase();

  if (head === 'help') return `commands:
  help                         this list
  stats                        VM + transpiler counters
  classes <text>               list classes matching <text>
  methods <class-desc>         list methods of a class
  launch <com.foo.Bar>         start an activity by name
  current                      show the running activity
  call <owner>-><sig> [args]   invoke a method on the current activity
  res <0x7f0a0001>             resolve a resource id
  str <0x7f0a0001>             read a string resource
  prefs                        dump SharedPreferences
  vfs                          list the virtual filesystem
  js <expr>                    evaluate raw JavaScript (host, R, screen)`;

  if (head === 'stats') {
    const ts = host.transpiler.stats;
    return `classes indexed   ${ts.classes}
methods declared  ${ts.methods}
methods compiled  ${ts.compiled}
instructions      ${ts.instructions}
VM invocations    ${R.stats.calls}
shim classes      ${R.classes.size}
unresolved APIs   ${host.unresolved ? host.unresolved.size : 0}
crashes           ${host.crashes.length}
activities live   ${host.activities.length}`;
  }

  if (head === 'classes') {
    const q = parts.slice(1).join(' ').toLowerCase();
    const hits = [...host.transpiler._byDesc.keys()].filter((d) => d.toLowerCase().includes(q));
    return hits.length ? hits.slice(0, 80).join('\n') + (hits.length > 80 ? `\n… +${hits.length - 80} more` : '') : 'no match';
  }

  if (head === 'methods') {
    const f = host.transpiler.lookup(parts[1] || '');
    if (!f) return 'no such class in this APK';
    return [...f.cd.directMethods, ...f.cd.virtualMethods].map((m) => `${m.flags.padEnd(22)} ${m.name}${m.proto}`).join('\n');
  }

  if (head === 'launch') {
    const n = parts[1];
    if (!n) return 'usage: launch com.example.Activity';
    host.launch(n);
    return 'launching ' + n;
  }

  if (head === 'current') {
    if (!host.activities.length) return 'nothing running';
    return host.activities.map((a) => R.classNameOf(a)).join('\n');
  }

  if (head === 'call') {
    const spec = parts[1] || '';
    const args = parts.slice(2).map(parseArg);
    const [owner, sig] = spec.split('->');
    const target = owner === 'this' || !owner.includes(';') ? host.activities[host.activities.length - 1] : null;
    const desc = target ? R.descOf(target) : owner;
    if (!desc) return 'nothing running (use "launch" first)';
    const cls = R.klass(desc);
    R.initClass(cls);
    const m = R.findMethod(cls, sig);
    if (!m) return `no such method ${desc}->${sig}`;
    const argv = target ? [target, ...args] : args;
    const v = R.callMethod(m, argv);
    return `→ ${R.str(v)}`;
  }

  if (head === 'res') {
    const id = parseInt(parts[1], 16);
    const e = host.rt && host.rt.get(id);
    if (!e) return 'not found';
    return `${e.idHex}  ${e.typeName}/${e.key}  [${e.configLabel}]\n  = ${host.rt.describe(e)}`;
  }
  if (head === 'str') {
    const id = parseInt(parts[1], 16);
    return JSON.stringify(host.resString(id));
  }
  if (head === 'prefs') {
    if (!host.prefsStore.size) return '(empty)';
    return [...host.prefsStore].map(([k, v]) => `${k}:\n` + [...v.$m].map(([a, b]) => `  ${a} = ${JSON.stringify(b)}`).join('\n')).join('\n');
  }
  if (head === 'vfs') return host.vfs.size ? [...host.vfs.keys()].map((k) => `${k}  (${host.vfs.get(k).length} bytes)`).join('\n') : '(empty)';

  if (head === 'js') {
    const expr = cmd.slice(3);
    // eslint-disable-next-line no-new-func
    return String(new Function('host', 'R', 'screen', 'return (' + expr + ')')(host, R, $('#screen')));
  }
  return `unknown command "${head}" — try "help"`;
}
function parseArg(s) {
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if (s === 'true') return 1;
  if (s === 'false') return 0;
  if (s === 'null') return null;
  if (/^".*"$/.test(s)) return s.slice(1, -1);
  return s;
}

/* ================================================================== */
/*  helpers                                                             */
/* ================================================================== */
function switchTab(name) {
  const b = $(`.tab[data-p="${name}"]`);
  if (b) b.click();
}
function download(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---- tiny syntax highlighters (no external deps) ---- */
const JS_KEYWORDS = /\b(var|let|const|function|return|if|else|for|while|switch|case|default|break|continue|throw|try|catch|finally|new|typeof|instanceof|this|null|undefined|true|false|void|delete|in|of|do)\b/g;
function highlightJs(src) {
  let out = escapeHtml(src);
  out = out.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="c">$1</span>');
  out = out.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|'(?:[^'\\\n]|\\.)*')/g, '<span class="s">$1</span>');
  out = out.replace(/\b(R)\.([A-Za-z_$][\w$]*)/g, '<span class="f">$1</span><span class="o">.</span><span class="f">$2</span>');
  out = out.replace(/(?<![\w$.>])(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g, '<span class="n">$1</span>');
  out = out.replace(JS_KEYWORDS, (m) => `<span class="k">${m}</span>`);
  out = out.replace(/\b(v\d+)\b/g, '<span class="r">$1</span>');
  return out;
}
function highlightXml(src) {
  let out = escapeHtml(src);
  out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c">$1</span>');
  out = out.replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="k">$2</span>');
  out = out.replace(/([\w:.-]+)=(&quot;[^&]*?&quot;)/g, '<span class="f">$1</span>=<span class="s">$2</span>');
  return out;
}

/* ================================================================== */
/*  Samples                                                             */
/* ================================================================== */
async function initSamples() {
  const box = $('#samples');
  let samples = [];
  try { const mod = await import('./samples.js'); samples = mod.SAMPLES || []; } catch { /* optional */ }
  if (!samples.length) return;
  box.innerHTML = samples.map((s, i) =>
    `<button class="sample-btn" data-i="${i}" title="${escapeHtml(s.note || '')}">${s.icon ? `<img src="${s.icon}" alt="">` : ''}${escapeHtml(s.label)} <span class="muted mono" style="font-size:10.5px">${escapeHtml(s.size)}</span></button>`).join('');
  box.onclick = async (e) => {
    const b = e.target.closest('.sample-btn');
    if (!b) return;
    const s = samples[Number(b.dataset.i)];
    box.querySelectorAll('.sample-btn').forEach((x) => (x.disabled = true));
    try {
      const bytes = base64ToBytes(s.data);
      await loadApk(bytes, s.file);
    } catch (err) { showError(err.message); }
    box.querySelectorAll('.sample-btn').forEach((x) => (x.disabled = false));
  };
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* expose for debugging from the browser console */
window.Dex2Web = { get host() { return host; }, loadApk: loadApkBytes };
