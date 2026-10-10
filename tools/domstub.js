/* domstub.js — a minimal DOM so the runtime can be exercised headlessly. */

let idSeq = 1;
class ClassList {
  constructor(el) { this.el = el; }
  add(...c) { for (const x of c) if (!this.el._classes.includes(x)) this.el._classes.push(x); }
  remove(...c) { this.el._classes = this.el._classes.filter((x) => !c.includes(x)); }
  toggle(c, on) { const has = this.el._classes.includes(c); const want = on === undefined ? !has : !!on; if (want && !has) this.el._classes.push(c); if (!want && has) this.el._classes = this.el._classes.filter((x) => x !== c); }
  contains(c) { return this.el._classes.includes(c); }
  get value() { return this.el._classes.join(' '); }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag).toLowerCase();
    this.childNodes = [];
    this.parentNode = null;
    this.style = new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = String(v); return true; } });
    this.dataset = {};
    this._classes = [];
    this.classList = new ClassList(this);
    this.attrs = {};
    this._listeners = {};
    this._text = '';
    this.value = '';
    this.rows = 1;
    this.width = 300; this.height = 150;
    this.clientWidth = 360; this.clientHeight = 640;
    this.offsetWidth = 360; this.offsetHeight = 48;
    this.scrollLeft = 0; this.scrollTop = 0;
    this.disabled = false;
    this.type = '';
    this.placeholder = '';
    this.title = '';
    this.alt = '';
    this.checked = false;
    this.selectedIndex = 0;
    this.innerHTML = '';
    Object.defineProperty(this, 'className', {
      get: () => this._classes.join(' '),
      set: (v) => { this._classes = String(v).split(/\s+/).filter(Boolean); },
    });
    Object.defineProperty(this, 'textContent', {
      get() { return this._text || this.childNodes.map((c) => c.textContent).join(''); },
      set(v) { this._text = String(v); this.childNodes.length = 0; },
    });
    Object.defineProperty(this, 'children', { get() { return this.childNodes.filter((c) => c instanceof El); } });
    Object.defineProperty(this, 'firstChild', { get() { return this.childNodes[0] || null; } });
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') { this._classes = String(v).split(/\s+/).filter(Boolean); } if (k === 'type') this.type = v; if (k === 'value') this.value = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    return c;
  }
  removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
  replaceChild(n, o) { const i = this.childNodes.indexOf(o); if (i >= 0) { this.childNodes[i] = n; n.parentNode = this; o.parentNode = null; } return o; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter((f) => f !== fn); }
  dispatch(t, ev) { for (const f of (this._listeners[t] || [])) f(ev || { target: this, preventDefault() {}, stopPropagation() {} }); }
  focus() { global.document.activeElement = this; }
  blur() { global.document.activeElement = null; }
  setSelectionRange() {}
  scrollTo() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 360, bottom: 48, width: 360, height: 48 }; }
  getContext() { return ctx2dStub(this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  dump(depth = 0) {
    const pad = '  '.repeat(depth);
    const st = Object.entries(this.style).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(';');
    const txt = this._text ? ` "${this._text}"` : '';
    let s = `${pad}<${this.localName}${this._classes.length ? ' class="' + this._classes.join(' ') + '"' : ''}${st ? ' style="' + st + '"' : ''}>${txt}\n`;
    for (const c of this.childNodes) if (c instanceof El) s += c.dump(depth + 1);
    return s;
  }
}
function ctx2dStub(canvas) {
  const noop = () => {};
  const ctx = {
    canvas, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textBaseline: '', globalAlpha: 1,
    fillRect: noop, strokeRect: noop, clearRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, rect: noop, roundRect: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, scale: noop, rotate: noop, fillText: noop, strokeText: noop, drawImage: noop, measureText: (t) => ({ width: String(t).length * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }), putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return ctx;
}
const documentStub = {
  createElement: (t) => new El(t),
  createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; },
  body: new El('body'),
  documentElement: new El('html'),
  activeElement: null,
  addEventListener() {}, removeEventListener() {},
  querySelector() { return null; },
  getElementById() { return null; },
};
const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 1280, innerHeight: 800,
  addEventListener() {}, removeEventListener() {},
  open() {}, matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
  requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 0),
  cancelAnimationFrame: (h) => clearTimeout(h),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  navigator: { userAgent: 'Dex2Web/1.0', language: 'en', clipboard: null },
  Audio: class { constructor() { this.paused = true; this.duration = 0; this.currentTime = 0; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } },
  localStorage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })(),
};

export function installDom() {
  globalThis.document = documentStub;
  globalThis.window = windowStub;
  globalThis.navigator = windowStub.navigator;
  globalThis.localStorage = windowStub.localStorage;
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;
  globalThis.Audio = windowStub.Audio;
  globalThis.getComputedStyle = windowStub.getComputedStyle;
  globalThis.Element = El;
  return { document: documentStub, window: windowStub, El };
}
export { El };
