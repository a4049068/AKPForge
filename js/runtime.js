/* runtime.js — the Dex2Web virtual machine.
 *
 * Object model
 * ------------
 *   java object   -> plain JS object { $c: JClass, ...fields, ...shim state }
 *   java String   -> a native JS string
 *   java array    -> a native JS Array tagged with a hidden $c symbol
 *   null          -> null / undefined (normalised to null)
 *   boolean       -> the integers 0 / 1, exactly like Dalvik registers
 *   long          -> a JS number (exact below 2^53; bitwise/mul ops go via BigInt)
 *
 * Methods resolve through the real Java algorithm (virtual/interface dispatch
 * walks the receiver's hierarchy; direct/static/super do not), and dex
 * exception tables are matched against genuine JS `throw`s.
 */

export const ARR_CLASS = Symbol('dex2web.arrayClass');
export const CLASS_OBJ = Symbol('dex2web.classObject');

export class VMError extends Error {
  constructor(msg) { super(msg); this.name = 'VMError'; }
}

/* ---------------- descriptors ---------------- */
export function descToName(d) { return d.startsWith('L') ? d.slice(1, -1).replace(/\//g, '.') : d; }
export function nameToDesc(n) { return 'L' + n.replace(/\./g, '/') + ';'; }
export function componentType(d) { return d.startsWith('[') ? d.slice(1) : null; }
export function isArrayDesc(d) { return d.startsWith('['); }

/** True when a register value must be interpreted as a Java null reference.
 *  Dalvik represents `null` as the integer constant 0, so `check-cast`,
 *  `instance-of`, field access and virtual dispatch all have to agree. */
const BOXED = new Set([
  'Ljava/lang/Boolean;', 'Ljava/lang/Integer;', 'Ljava/lang/Long;', 'Ljava/lang/Float;',
  'Ljava/lang/Double;', 'Ljava/lang/Character;', 'Ljava/lang/Byte;', 'Ljava/lang/Short;',
]);

export function isNullRef(x) { return x === null || x === undefined || x === 0 || x === false; }

export function defaultValue(t) {
  if (!t) return null;
  switch (t[0]) {
    case 'I': case 'S': case 'B': case 'C': case 'Z': case 'J': case 'F': case 'D': return 0;
    case 'V': return undefined;
    default: return null;
  }
}

const PROTO_RET = (proto) => proto.slice(proto.indexOf(')') + 1);

/** Unboxing methods and the primitive default we substitute for a null receiver. */
const UNBOX_DEFAULT = {
  'booleanValue()Z': 0,
  'intValue()I': 0,
  'longValue()J': 0,
  'floatValue()F': 0,
  'doubleValue()D': 0,
  'byteValue()B': 0,
  'shortValue()S': 0,
  'charValue()C': 0,
};

/* ================================================================== */
export class JClass {
  constructor(desc) {
    this.desc = desc;
    this.name = descToName(desc);
    this.superDesc = 'Ljava/lang/Object;';
    this.super = null;
    this.interfaces = [];
    this.interfaceClasses = [];
    this.accessFlags = 1;
    this.staticFields = [];       // [{name,type,flags,key}]
    this.instanceFields = [];
    this.statics = Object.create(null);
    this.methods = new Map();     // "name+proto" -> JMethod
    this.initialized = false;
    this.initializing = false;
    this.clinit = null;
    this.fromDex = null;
    this.native = false;          // framework/shim class
    this.fieldOrder = null;       // cached hierarchy field keys
    this.javaClass = null;        // the java.lang.Class mirror
    this.hooks = Object.create(null);
  }
  isInterface() { return !!(this.accessFlags & 0x200); }
  isAbstract() { return !!(this.accessFlags & 0x400); }
  isEnum() { return !!(this.accessFlags & 0x4000); }
  isAnnotation() { return !!(this.accessFlags & 0x2000); }
}

export class JMethod {
  constructor(owner, name, proto, accessFlags) {
    this.owner = owner; this.name = name; this.proto = proto;
    this.accessFlags = accessFlags || 0;
    this.key = name + proto;
    this.fn = null;          // compiled JS body (dex)
    this.nativeFn = null;    // shim implementation
    this.stub = null;        // 'native' | 'abstract'
    this.retType = PROTO_RET(proto);
  }
  isStatic() { return !!(this.accessFlags & 0x8); }
  isNative() { return !!(this.accessFlags & 0x100); }
  isAbstract() { return !!(this.accessFlags & 0x400); }
  isConstructor() { return this.name === '<init>'; }
}

/* ================================================================== */
export class Runtime {
  constructor(env = {}) {
    this.env = env;                        // hooks supplied by the host (log, ui, ...)
    this.classes = new Map();              // descriptor -> JClass
    this.transpiler = null;
    this.exc = null;                       // exception awaiting `move-exception`
    this.log = env.log || (() => {});
    this.stats = { calls: 0, classes: 0, methods: 0, compiled: 0, unresolvedMethods: new Map(), unresolvedClasses: new Set() };
    this._mref = new Map();
    this._fref = new Map();
    this._vresolve = new Map();
    this.pendingTasks = [];
    this.halted = false;
    this._callStack = [];
    this.maxDepth = 4000;
    this.VMError = VMError;
    this.maxSteps = 2000000;    // per-invocation basic-block budget
    this.globalSteps = 0;       // cumulative basic blocks for the whole session
    this.globalStepLimit = 120000000;
    VMError.prototype.$vm = true;
  }

  /* ---------------- class registry ---------------- */
  klass(desc) {
    if (desc == null) return null;
    let c = this.classes.get(desc);
    if (c) return c;
    c = new JClass(desc);
    c.native = true;
    c.accessFlags = 1;
    this.classes.set(desc, c);
    this.stats.unresolvedClasses.add(desc);
    return c;
  }
  hasClass(desc) { return this.classes.has(desc); }

  declareClass(spec) {
    let c = this.classes.get(spec.desc);
    if (!c) { c = new JClass(spec.desc); this.classes.set(spec.desc, c); }
    const changed = c.superDesc !== (spec.superDesc || 'Ljava/lang/Object;') ||
      (c.interfaces || []).join() !== (spec.interfaces || []).join();
    c.superDesc = spec.superDesc || 'Ljava/lang/Object;';
    c.interfaces = spec.interfaces || [];
    if (changed) this.invalidateHierarchy(c);
    c.accessFlags = spec.accessFlags === undefined ? 1 : spec.accessFlags;
    c.staticFields = spec.statics || [];
    c.instanceFields = spec.instances || [];
    c.fromDex = spec.fromDex || null;
    c.native = false;
    c.fieldOrder = null;
    for (const f of c.staticFields) if (!(f.key in c.statics)) c.statics[f.key] = defaultValue(f.type);
    if (spec.initValues) {
      spec.initValues.forEach((val, i) => {
        const f = c.staticFields[i];
        if (f) c.statics[f.key] = this._materialise(val);
      });
    }
    this.stats.classes++;
    return c;
  }

  _materialise(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => this._materialise(x));
    if (v.$class !== undefined) return this.classObject(v.$class);
    if (v.$fieldRef !== undefined) return { $c: this.klass('Ljava/lang/Object;'), $fieldRef: v.$fieldRef };
    if (v.$methodRef !== undefined) return { $c: this.klass('Ljava/lang/Object;'), $methodRef: v.$methodRef };
    if (v.$annotation !== undefined) return { $c: this.klass('Ljava/lang/Object;'), $annotation: v.$annotation };
    return v;
  }

  declareMethod(ownerDesc, name, proto, accessFlags, stubKind) {
    const c = this.klass(ownerDesc);
    const m = new JMethod(c, name, proto, accessFlags);
    if (stubKind) m.stub = stubKind;
    c.methods.set(m.key, m);
    if (name === '<clinit>') c.clinit = m;
    this.stats.methods++;
    return m;
  }

  /* AOT-bundle friendly aliases */
  C(desc, sup, ifaces, access, statics, instances, initValues) {
    this.declareClass({
      desc, superDesc: sup || 'Ljava/lang/Object;', interfaces: ifaces || [], accessFlags: access,
      statics: (statics || []).map(([name, type, flags]) => ({ name, type, flags, key: `${desc}->${name}:${type}` })),
      instances: (instances || []).map(([name, type, flags]) => ({ name, type, flags, key: `${desc}->${name}:${type}` })),
      initValues: initValues || null,
    });
  }
  M(ownerDesc, name, proto, accessFlags, fn) {
    const c = this.klass(ownerDesc);
    let m = c.methods.get(name + proto);
    if (!m) { m = new JMethod(c, name, proto, accessFlags); c.methods.set(m.key, m); if (name === '<clinit>') c.clinit = m; }
    m.accessFlags = accessFlags; m.stub = null;
    m.fn = fn;
    this.stats.compiled++;
    return m;
  }

  /** Register a framework (shim) class. */
  def(desc, spec) {
    const c = this.klass(desc);
    c.native = true;
    c.accessFlags = spec.access === undefined ? 0x1 : spec.access;
    const supChanged = (spec.sup && c.superDesc !== spec.sup) || (spec.ifaces && (c.interfaces || []).join() !== spec.ifaces.join());
    if (spec.sup) c.superDesc = spec.sup;
    if (spec.ifaces) c.interfaces = spec.ifaces;
    if (supChanged) this.invalidateHierarchy(c);
    if (spec.statics) for (const k in spec.statics) c.statics[`${desc}->${k}`] = spec.statics[k];
    if (spec.fields) c.instanceFields = spec.fields.map(([name, type]) => ({ name, type, flags: 0, key: `${desc}->${name}:${type}` }));
    if (spec.m) for (const sig in spec.m) this._defNative(c, sig, spec.m[sig], false);
    if (spec.sm) for (const sig in spec.sm) this._defNative(c, sig, spec.sm[sig], true);
    if (spec.hooks) Object.assign(c.hooks, spec.hooks);
    return c;
  }
  _defNative(c, sig, fn, isStatic) {
    const i = sig.indexOf('(');
    const name = sig.slice(0, i), proto = sig.slice(i);
    let m = c.methods.get(sig);
    if (!m) { m = new JMethod(c, name, proto, isStatic ? 0x109 : 0x101); c.methods.set(sig, m); }
    m.nativeFn = fn; m.stub = null;
    m.accessFlags = (m.accessFlags & ~0x108) | (isStatic ? 0x8 : 0);
    if (name === '<clinit>') c.clinit = m;
  }

  /* ---------------- hierarchy ---------------- */
  sup(c) {
    if (!c) return null;
    if (c.super === undefined) {
      if (!c.superDesc || c.superDesc === c.desc) c.super = null;
      else c.super = this.klass(c.superDesc);
    }
    return c.super;
  }
  /** Drop memoised hierarchy state; called whenever super/interfaces change. */
  invalidateHierarchy(c) {
    if (!c) return;
    c.super = undefined;
    c.interfaceClasses = [];
    c._ifacesResolved = false;
    c.fieldOrder = null;
    this._vresolve.clear();
  }
  ifaces(c) {
    if (c.interfaceClasses && c.interfaceClasses.length === (c.interfaces || []).length && c._ifacesResolved) return c.interfaceClasses;
    c.interfaceClasses = (c.interfaces || []).map((d) => this.klass(d));
    c._ifacesResolved = true;
    return c.interfaceClasses;
  }

  /** All instance field keys of a class, superclass-first (stable insertion order). */
  fieldKeys(c) {
    if (c.fieldOrder) return c.fieldOrder;
    const s = this.sup(c);
    const keys = s ? this.fieldKeys(s).slice() : [];
    for (const f of c.instanceFields) if (!keys.includes(f.key)) keys.push(f.key);
    c.fieldOrder = keys;
    return keys;
  }

  isAssignable(from, toDesc) {
    if (from === toDesc) return true;
    const to = this.klass(toDesc);
    let c = this.classes.get(from) || this.klass(from);
    let guard = 0;
    while (c && guard++ < 200) {
      if (c.desc === toDesc) return true;
      for (const i of this.ifaces(c)) if (i && this.isAssignable(i.desc, toDesc)) return true;
      c = this.sup(c);
    }
    return false;
  }

  /* ---------------- object model ---------------- */
  classOf(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string') return this.klass('Ljava/lang/String;');
    if (typeof obj === 'number' || typeof obj === 'boolean') return this.klass('Ljava/lang/Integer;');
    if (Array.isArray(obj)) return obj[ARR_CLASS] || this.klass('[Ljava/lang/Object;');
    if (obj.$c) return obj.$c;
    return null;
  }
  descOf(obj) { if (isNullRef(obj)) return null; const c = this.classOf(obj); return c ? c.desc : null; }

  newInstanceObj(cls) {
    const o = { $c: cls };
    for (const k of this.fieldKeys(cls)) o[k] = defaultValue(k.slice(k.lastIndexOf(':') + 1));
    return o;
  }

  ni(desc) {
    const c = this.klass(desc);
    this.initClass(c);
    if (c.hooks.create) return c.hooks.create(this, c);
    return this.newInstanceObj(c);
  }

  na(desc, size) {
    const n = size | 0;
    if (n < 0) throw this.newException('Ljava/lang/NegativeArraySizeException;', `size ${size}`);
    const comp = componentType(desc) || 'Ljava/lang/Object;';
    const arr = new Array(n);
    const d = defaultValue(comp);
    for (let i = 0; i < n; i++) arr[i] = d;
    arr[ARR_CLASS] = this.klass(desc);
    return arr;
  }
  fna(desc, ...vals) {
    const arr = vals.slice();
    arr[ARR_CLASS] = this.klass(desc);
    return arr;
  }
  fad(arr, data) {
    if (!arr) throw this.newException('Ljava/lang/NullPointerException;', 'fill-array-data on null');
    for (let i = 0; i < data.length && i < arr.length; i++) arr[i] = data[i];
  }
  al(arr) {
    if (isNullRef(arr)) throw this.newException('Ljava/lang/NullPointerException;', 'array-length on null');
    return arr.length | 0;
  }

  /* arrays */
  ag(a, i) { this._ckA(a, i); return a[i]; }
  ago(a, i) { this._ckA(a, i); return this.refNull(a[i], 'L'); }
  apo(a, i, v) { this._ckA(a, i); a[i] = this.refNull(v, 'L'); }
  ap(a, i, v) { this._ckA(a, i); a[i] = v; }
  agb(a, i) { this._ckA(a, i); return a[i] ? 1 : 0; }
  apb(a, i, v) { this._ckA(a, i); a[i] = v ? 1 : 0; }
  agy(a, i) { this._ckA(a, i); return a[i] | 0; }
  apy(a, i, v) { this._ckA(a, i); a[i] = (v << 24) >> 24; }
  agc(a, i) { this._ckA(a, i); return (a[i] | 0) & 0xffff; }
  apc(a, i, v) { this._ckA(a, i); a[i] = (v | 0) & 0xffff; }
  ags(a, i) { this._ckA(a, i); return a[i] | 0; }
  aps(a, i, v) { this._ckA(a, i); a[i] = (v << 16) >> 16; }
  _ckA(a, i) {
    if (isNullRef(a)) throw this.newException('Ljava/lang/NullPointerException;', 'array access on null');
    if (i < 0 || i >= a.length) throw this.newException('Ljava/lang/ArrayIndexOutOfBoundsException;', `index ${i}, length ${a.length}`);
  }

  /* fields */
  _fr(key) {
    let r = this._fref.get(key);
    if (r) return r;
    const a = key.indexOf('->');
    const owner = key.slice(0, a);
    const rest = key.slice(a + 2);
    const ci = rest.indexOf(':');
    r = { owner, name: rest.slice(0, ci), type: rest.slice(ci + 1), key };
    this._fref.set(key, r);
    return r;
  }
  _staticHolder(key) {
    const r = this._fr(key);
    const c = this.klass(r.owner);
    this.initClass(c);
    return c;
  }
  gf(o, key) { const f = this._fr(key); if (isNullRef(o)) throw this.npe('field get ' + key); return this.refNull(key in o ? o[key] : defaultValue(f.type), f.type); }
  pf(o, key, v) { const f = this._fr(key); if (isNullRef(o)) throw this.npe('field put ' + key); o[key] = this.refNull(v, f.type); }
  gfb(o, k) { return this.gf(o, k) ? 1 : 0; }
  pfb(o, k, v) { this.pf(o, k, v ? 1 : 0); }
  gfy(o, k) { return this.gf(o, k) | 0; }
  pfy(o, k, v) { this.pf(o, k, (v << 24) >> 24); }
  gfc(o, k) { return (this.gf(o, k) | 0) & 0xffff; }
  pfc(o, k, v) { this.pf(o, k, (v | 0) & 0xffff); }
  gfs(o, k) { return this.gf(o, k) | 0; }
  pfs(o, k, v) { this.pf(o, k, (v << 16) >> 16); }

  gs(key) { const f = this._fr(key); const c = this._staticHolder(key); return this.refNull(key in c.statics ? c.statics[key] : defaultValue(f.type), f.type); }
  ps(key, v) { const f = this._fr(key); this._staticHolder(key).statics[key] = this.refNull(v, f.type); }
  gsb(k) { return this.gs(k) ? 1 : 0; }
  psb(k, v) { this.ps(k, v ? 1 : 0); }
  gsy(k) { return this.gs(k) | 0; }
  psy(k, v) { this.ps(k, (v << 24) >> 24); }
  gsc(k) { return (this.gs(k) | 0) & 0xffff; }
  psc(k, v) { this.ps(k, (v | 0) & 0xffff); }
  gss(k) { return this.gs(k) | 0; }
  pss(k, v) { this.ps(k, (v << 16) >> 16); }

  /* casts & type tests */
  cc(obj, desc) {
    if (isNullRef(obj)) return obj;
    if (this.io(obj, desc)) {
      if (Array.isArray(obj) && isArrayDesc(desc) && obj[ARR_CLASS] && obj[ARR_CLASS].desc !== desc) {
        obj[ARR_CLASS] = this.klass(desc);   // coerce the generic-array lie once
      }
      return obj;
    }
    // A cast between a shim object and a dex class (or vice versa) usually
    // means our stand-in type doesn't model the real hierarchy. Warn and let
    // execution continue instead of killing the app over VM bookkeeping.
    const src = this.descOf(obj);
    const srcNative = src ? (this.classes.get(src) || { native: false }).native : false;
    const dstNative = (this.classes.get(desc) || { native: false }).native;
    if (desc.charCodeAt(0) === 91 && typeof console !== 'undefined' && globalThis.__D2W_PROBE_CCE) {
      const srcArr = obj && obj[ARR_CLASS];
      console.log('[cce-probe] target=' + desc + ' srcClass=' + (srcArr ? srcArr.desc : src) + ' len=' + (obj && obj.length) + ' elem0=' + (obj && obj[0] ? (obj[0].$c ? obj[0].$c.desc : typeof obj[0]) : 'empty'));
      console.log('[cce-probe] stack=' + (this._callStack || []).slice(-6).join(' <- '));
    }
    if (src && srcNative !== dstNative) {
      if (this.env.onUnresolved) this.env.onUnresolved('soft-cast', `${src} -> ${desc}`, []);
      return obj;
    }
    throw this.newException('Ljava/lang/ClassCastException;', `${src || typeof obj} cannot be cast to ${descToName(desc)}`);
  }
  io(obj, desc) {
    if (isNullRef(obj)) return false;
    if (desc === 'Ljava/lang/Object;') return true;
    const d = this.descOf(obj);
    if (!d) return false;
    if (isArrayDesc(desc)) {
      if (d === desc) return true;
      if (desc === '[Ljava/lang/Object;' && isArrayDesc(d)) return true;
      // Kotlin's generic-array juggling routinely produces Object[] where a
      // typed array is expected; ART rejects incompatible downcasts, but an
      // empty (or element-compatible) Object[] is the same lie the compiler
      // already made, so accept and re-type it.
      if (d === '[Ljava/lang/Object;' && isArrayDesc(desc)) return this._arrayElementsFit(obj, desc);
      return false;
    }
    return this.isAssignable(d, desc);
  }
  _arrayElementsFit(arr, desc) {
    const comp = componentType(desc);
    if (arr.length === 0) return true;
    if (comp && comp.charCodeAt(0) !== 76 && comp.charCodeAt(0) !== 91) return false;
    for (let i = 0; i < Math.min(arr.length, 64); i++) {
      const e = arr[i];
      if (isNullRef(e)) continue;
      if (!this.io(e, comp)) return false;
    }
    return true;
  }

  classObject(desc) {
    const c = this.klass(desc);
    if (c.javaClass) return c.javaClass;
    const cls = this.klass('Ljava/lang/Class;');
    this.initClass(cls);
    const o = { $c: cls };
    o[CLASS_OBJ] = c;
    o['Ljava/lang/Class;->desc:Ljava/lang/String;'] = desc;
    c.javaClass = o;
    return o;
  }

  /* ---------------- class initialisation ---------------- */
  initClass(c) {
    if (!c || c.initialized || c.initializing) return;
    c.initializing = true;
    try {
      const s = this.sup(c);
      if (s) this.initClass(s);
      // A dex <clinit> has no compiled body yet — callMethod compiles it lazily.
      if (c.clinit && !c.clinit.stub) this.callMethod(c.clinit, []);
    } finally {
      c.initializing = false;
      c.initialized = true;
    }
  }

  /* ---------------- method resolution ---------------- */
  _mr(key) {
    let r = this._mref.get(key);
    if (r) return r;
    const a = key.indexOf('->');
    r = { owner: key.slice(0, a), sig: key.slice(a + 2), name: key.slice(a + 2, key.indexOf('(', a)), proto: key.slice(key.indexOf('(', a)) };
    this._mref.set(key, r);
    return r;
  }

  /** Walk `c` and its superclasses looking for name+proto. */
  findMethod(c, sig) {
    let cur = c, guard = 0;
    while (cur && guard++ < 300) {
      const m = cur.methods.get(sig);
      if (m) return m;
      cur = this.sup(cur);
    }
    return null;
  }
  /** Breadth-first over interfaces, then supers (Java interface resolution). */
  findInterfaceMethod(c, sig) {
    const seen = new Set();
    const queue = [c];
    while (queue.length) {
      const cur = queue.shift();
      if (!cur || seen.has(cur.desc)) continue;
      seen.add(cur.desc);
      const m = cur.methods.get(sig);
      if (m) return m;
      for (const i of this.ifaces(cur)) queue.push(i);
      const s = this.sup(cur);
      if (s) queue.push(s);
    }
    return null;
  }

  resolveVirtual(recvClass, sig) {
    const ck = recvClass ? recvClass.desc + '|' + sig : '|' + sig;
    let m = this._vresolve.get(ck);
    if (m !== undefined) return m;
    m = (recvClass && this.findMethod(recvClass, sig)) || null;
    this._vresolve.set(ck, m);
    return m;
  }

  /* ---------------- invocation ---------------- */
  _invoke(kind, key, args) { return this._invokeN(kind, key, args, args.length, 0); }

  /**
   * Core dispatcher. `A` is any array-like (the generated code passes the raw
   * `arguments` object of iv/is/id/iu so no rest array is ever allocated),
   * `n` the argument count and `off` the index of the first real argument
   * (1 when A includes the method key).
   */
  _invokeN(kind, key, A, n, off) {
    this.stats.calls++;
    const ref = this._mr(key);
    const sig = ref.sig;
    if (kind === 'static') {
      let m = ref.sm;
      if (m === undefined) {
        const c = this.klass(ref.owner);
        this.initClass(c);
        m = c.methods.get(sig);
        if (!m) { const su = this.sup(c); m = su ? this.findMethod(su, sig) : null; }
        ref.sm = m || null;
      }
      if (!m) return this._missingN(kind, key, A, n, off);
      return this.callMethodN(m, A, n, off);
    }
    const recv = A[off];
    if (kind === 'super' || kind === 'direct') {
      let m = kind === 'super' ? ref.um : ref.dm;
      if (m === undefined) {
        const c = this.klass(ref.owner);
        this.initClass(c);
        // invoke-super's reference already names the superclass: start there.
        m = this.findMethod(c, sig);
        if (kind === 'super') ref.um = m || null; else ref.dm = m || null;
      }
      if (!m) return this._missingN(kind, key, A, n, off);
      return this.callMethodN(m, A, n, off);
    }
    // Arrays carry a handful of Object methods that ART implements natively.
    if (Array.isArray(recv)) {
      if (sig === 'clone()Ljava/lang/Object;') { const c = recv.slice(); c[ARR_CLASS] = recv[ARR_CLASS]; return c; }
      if (sig === 'toString()Ljava/lang/String;') return this.arrayToString(recv);
      if (sig === 'hashCode()I') return hashCodeOf(recv);
      if (sig === 'equals(Ljava/lang/Object;)Z') return recv === A[off + 1] ? 1 : 0;
      if (sig === 'getClass()Ljava/lang/Class;') return this.classObject((recv[ARR_CLASS] || this.klass('[Ljava/lang/Object;')).desc);
      if (sig === 'notify()V' || sig === 'notifyAll()V' || sig === 'wait()V' || sig === 'wait(J)V' || sig === 'wait(JI)V') return undefined;
    }
    // virtual / interface
    if (isNullRef(recv)) {
      const unbox = UNBOX_DEFAULT[sig];
      if (unbox !== undefined) {
        if (this.env.onUnresolved) this.env.onUnresolved('lenient-unbox', key, []);
        return unbox;
      }
      throw this.npe(`invoke on null: ${key}`);
    }
    let cls;
    if (typeof recv === 'string') cls = this._strCls || (this._strCls = this.klass('Ljava/lang/String;'));
    else if (Array.isArray(recv)) cls = recv[ARR_CLASS] || this.klass('[Ljava/lang/Object;');
    else cls = recv.$c || this.klass(ref.owner);
    if (cls && cls.native && !cls.methods.has(sig)) {
      const nm = this.findNativeBySignature(cls, sig);
      if (nm) return this.callMethodN(nm, A, n, off);
    }
    // 1-entry inline cache per call-site key: hot sites repeat receiver class.
    let m = (ref.lk === cls.desc) ? ref.lm : null;
    if (m === null && ref.lk !== cls.desc) {
      m = this.resolveVirtual(cls, sig);
      if (!m) m = this.findInterfaceMethod(cls, sig);
      if (!m) {
        const dc = this.klass(ref.owner);
        m = this.findMethod(dc, sig) || this.findInterfaceMethod(dc, sig);
      }
      ref.lk = cls.desc; ref.lm = m || null;
    }
    if (!m) return this._missingN(kind, key, A, n, off);
    return this.callMethodN(m, A, n, off);
  }

  findNativeBySignature(cls, sig) {
    let cur = cls, guard = 0;
    while (cur && guard++ < 300) {
      const m = cur.methods.get(sig);
      if (m) return m;
      for (const i of this.ifaces(cur)) { const im = i.methods.get(sig); if (im) return im; }
      cur = this.sup(cur);
    }
    return null;
  }

  _missingN(kind, key, A, n, off) {
    const args = new Array(n);
    for (let i = 0; i < n; i++) args[i] = A[off + i];
    return this._missing(kind, key, args);
  }

  _missing(kind, key, args) {
    const ref = this._mr(key);
    const c = this.stats.unresolvedMethods;
    c.set(key, (c.get(key) || 0) + 1);
    const ret = PROTO_RET(ref.proto);
    if (this.env.onUnresolved) this.env.onUnresolved(kind, key, args);
    // Keep the app alive: return a sensible default instead of aborting.
    return defaultValue(ret);
  }

  callMethod(m, args) { return this.callMethodN(m, args, args.length, 0); }

  callMethodN(m, A, n, off) {
    const st = this._callStack;
    st.push(m.owner.name + '->' + m.name + m.proto);
    if (st.length > this.maxDepth) {
      st.length = 0;
      throw this.newException('Ljava/lang/StackOverflowError;', 'stack depth exceeded');
    }
    try { return this._dispatchN(m, A, n, off); }
    catch (e) {
      // Stamp the Java-level stack onto the first error that escapes, so the
      // deepest frames survive the JS unwinding.
      if (e && typeof e === 'object' && !e.$stack) { try { e.$stack = st.slice(-30); } catch {} }
      throw e;
    }
    finally { st.pop(); }
  }

  /** Fast path: call compiled/native bodies without materialising an array. */
  _dispatchN(m, A, n, off) {
    const f = m.fn || m.nativeFn;
    if (f) {
      let out;
      switch (n) {
        case 0: out = f(); break;
        case 1: out = f(A[off]); break;
        case 2: out = f(A[off], A[off + 1]); break;
        case 3: out = f(A[off], A[off + 1], A[off + 2]); break;
        case 4: out = f(A[off], A[off + 1], A[off + 2], A[off + 3]); break;
        case 5: out = f(A[off], A[off + 1], A[off + 2], A[off + 3], A[off + 4]); break;
        case 6: out = f(A[off], A[off + 1], A[off + 2], A[off + 3], A[off + 4], A[off + 5]); break;
        default: {
          const args = new Array(n);
          for (let i = 0; i < n; i++) args[i] = A[off + i];
          out = f.apply(null, args);
        }
      }
      return this.refNull(out, m.retType);
    }
    const args = new Array(n);
    for (let i = 0; i < n; i++) args[i] = A[off + i];
    return this._dispatchSlow(m, args);
  }

  _dispatch(m, args) { return this._dispatchSlow(m, args); }

  _dispatchSlow(m, args) {
    if (m.stub === 'abstract' || m.isAbstract()) {
      throw this.newException('Ljava/lang/AbstractMethodError;', `${m.owner.desc}->${m.key}`);
    }
    if (m.stub === 'native' || m.isNative()) {
      if (this.env.onUnresolved) this.env.onUnresolved('native', `${m.owner.desc}->${m.key}`, args);
      return defaultValue(m.retType);
    }
    // dex method whose body has not been compiled yet — ask the transpiler
    if (this.transpiler) {
      const fn = this.transpiler.getMethodFn(m.owner.desc, m.name, m.proto);
      if (fn) { m.fn = fn; return this.refNull(fn.apply(null, args), m.retType); }
    }
    if (this.env.onUnresolved) this.env.onUnresolved('missing', `${m.owner.desc}->${m.key}`, args);
    return defaultValue(m.retType);
  }

  /* Hot entry points: explicit parameters keep the generated-code path free
   * of rest-array allocations; the raw `arguments` object is forwarded. */
  iv(key, a0, a1, a2, a3, a4, a5) { return this._invokeN('virtual', key, arguments, arguments.length - 1, 1); }
  iu(key, a0, a1, a2, a3, a4, a5) { return this._invokeN('super', key, arguments, arguments.length - 1, 1); }
  id(key, a0, a1, a2, a3, a4, a5) { return this._invokeN('direct', key, arguments, arguments.length - 1, 1); }
  is(key, a0, a1, a2, a3, a4, a5) { return this._invokeN('static', key, arguments, arguments.length - 1, 1); }
  /** Rare >6-argument invoke-range calls keep the array path. */
  ivA(key, args) { return this._invokeN('virtual', key, args, args.length, 0); }
  isA(key, args) { return this._invokeN('static', key, args, args.length, 0); }

  /* ---------------- reference/null normalisation ----------------
   * Dalvik keeps a null reference as the integer constant 0 in a register.
   * Any boundary that produces or stores a *reference-typed* value must turn a
   * bare 0/false back into null, otherwise `getString(k, null)`-style calls
   * hand the caller the number 0 dressed up as an object. */
  refNull(v, typeDesc) {
    if ((v === 0 || v === false) && typeDesc) {
      const c = typeDesc.charCodeAt(0);
      if (c === 76 /* L */ || c === 91 /* [ */) {
        // A boxed primitive is a real object; a bare 0 there means 0, not null.
        if (BOXED.has(typeDesc)) return v;
        return null;
      }
    }
    return v;
  }

  /* ---------------- numeric semantics ---------------- */
  divI(a, b) { b = b | 0; if (b === 0) throw this.newException('Ljava/lang/ArithmeticException;', 'divide by zero'); return (a | 0) / b | 0; }
  remI(a, b) { b = b | 0; if (b === 0) throw this.newException('Ljava/lang/ArithmeticException;', 'divide by zero'); return (a | 0) % b; }
  f2i(x) { if (isNaN(x)) return 0; if (x <= -2147483648) return -2147483648; if (x >= 2147483647) return 2147483647; return Math.trunc(x) | 0; }
  d2i(x) { return this.f2i(x); }
  f2l(x) { if (isNaN(x)) return 0; return Math.trunc(x); }
  d2l(x) { return this.f2i(x); }
  l2f(x) { return Math.fround(x); }
  l2d(x) { return x; }
  _bi(x) { try { return BigInt(Math.trunc(Number(x) || 0)); } catch { return 0n; } }
  _wrap64(b) { b &= 0xffffffffffffffffn; return b > 0x7fffffffffffffffn ? Number(b - 0x10000000000000000n) : Number(b); }
  addL(a, b) { return a + b; }
  subL(a, b) { return a - b; }
  negL(a) { return -a; }
  notL(a) { return -a - 1; }
  mulL(a, b) { return this._wrap64(this._bi(a) * this._bi(b)); }
  divL(a, b) { const bb = this._bi(b); if (bb === 0n) throw this.newException('Ljava/lang/ArithmeticException;', 'divide by zero'); return this._wrap64(this._bi(a) / bb); }
  remL(a, b) { const bb = this._bi(b); if (bb === 0n) throw this.newException('Ljava/lang/ArithmeticException;', 'divide by zero'); return this._wrap64(this._bi(a) % bb); }
  andL(a, b) { return this._wrap64(this._bi(a) & this._bi(b)); }
  orL(a, b) { return this._wrap64(this._bi(a) | this._bi(b)); }
  xorL(a, b) { return this._wrap64(this._bi(a) ^ this._bi(b)); }
  shlL(a, b) { return this._wrap64(this._bi(a) << (BigInt(b) & 63n)); }
  shrL(a, b) { return this._wrap64(this._bi(a) >> (BigInt(b) & 63n)); }
  ushrL(a, b) { return this._wrap64((this._bi(a) & 0xffffffffffffffffn) >> (BigInt(b) & 63n)); }
  cmpL(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  cmplF(a, b) { if (isNaN(a) || isNaN(b)) return -1; return a < b ? -1 : a > b ? 1 : 0; }
  cmpgF(a, b) { if (isNaN(a) || isNaN(b)) return 1; return a < b ? -1 : a > b ? 1 : 0; }
  cmplD(a, b) { return this.cmplF(a, b); }
  cmpgD(a, b) { return this.cmpgF(a, b); }

  /* comparisons used by if-eq / if-eqz (Dalvik treats null, false and 0 alike) */
  z(x) { return x === 0 || x === null || x === undefined || x === false; }
  eq(a, b) { return a === b || (this.z(a) && this.z(b)); }

  /* ---------------- exceptions ---------------- */
  npe(msg) { return this.newException('Ljava/lang/NullPointerException;', msg); }
  newException(desc, msg) {
    const c = this.klass(desc);
    this.initClass(c);
    let o;
    if (c.hooks.create) o = c.hooks.create(this, c);
    else { o = this.newInstanceObj(c); }
    o['Ljava/lang/Throwable;->detailMessage:Ljava/lang/String;'] = msg == null ? null : String(msg);
    o.$message = msg == null ? descToName(desc) : String(msg);
    o.$javaException = true;
    if (this._callStack) o.$stack = this._callStack.slice(-24);
    return o;
  }
  /** Ensure a thrown value is a Java throwable; wrap bare JS errors. */
  toJavaThrowable(e) {
    if (e && typeof e === 'object' && (e.$javaException || e.$c)) {
      if (!e.$stack && e.$stack) e.$stack = e.$stack;
      return e;
    }
    const t = this.newException('Ljava/lang/RuntimeException;', (e && e.message) ? e.message : String(e));
    if (e && e.$stack) t.$stack = e.$stack;
    t.$nativeError = e;
    return t;
  }
  messageOf(t) {
    if (t == null) return 'null';
    if (typeof t === 'string') return t;
    if (t instanceof Error) return t.message;
    if (t.$message) return t.$message;
    return t['Ljava/lang/Throwable;->detailMessage:Ljava/lang/String;'] || this.descOf(t) || String(t);
  }
  classNameOf(t) {
    const c = this.classOf(t);
    return c ? c.name : (t instanceof Error ? (t.name || 'Error') : typeof t);
  }

  /** Look up the handler block for `addr` in this method's dex try table. */
  catchAt(TT, addr, e) {
    const t = this.toJavaThrowable(e);
    this.exc = t;
    if (!TT) return null;
    for (let i = 0; i < TT.length; i++) {
      const item = TT[i];
      if (addr >= item.start && addr < item.end) {
        for (const h of item.handlers) {
          if (h.catchAll || h.type === null) return h.bb;
          const cd = this.classOf(t);
          if (cd && this.isAssignable(cd.desc, h.type)) return h.bb;
        }
      }
    }
    return null;
  }

  /* ---------------- misc ---------------- */
  noop() {}
  methodHandle() { return null; }
  fieldRef(k) { return { $fieldRef: k }; }
  methodRef(k) { return { $methodRef: k }; }
  annot(t, els) { return { $annotation: t, $elements: els }; }

  /* ---------------- strings ---------------- */
  str(o) {
    if (o === null || o === undefined) return 'null';
    if (typeof o === 'string') return o;
    if (typeof o === 'number') return javaNumberToString(o);
    if (typeof o === 'boolean') return o ? 'true' : 'false';
    if (Array.isArray(o)) return this.arrayToString(o);
    return this.invokeToString(o);
  }
  invokeToString(o) {
    try {
      const v = this._invoke('virtual', 'Ljava/lang/Object;->toString()Ljava/lang/String;', [o]);
      if (typeof v === 'string') return v;
    } catch (e) { /* fall through */ }
    const c = this.classOf(o);
    return `${c ? c.name : 'Object'}@${(hashCodeOf(o) >>> 0).toString(16)}`;
  }
  arrayToString(a) {
    const c = a[ARR_CLASS];
    const comp = c ? componentType(c.desc) : null;
    if (comp && comp[0] === 'B') {
      // byte[] -> String uses the platform charset in Java; show as latin1 text
      let s = '';
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i] & 0xff);
      return s;
    }
    if (comp && comp[0] === 'C') { let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i] & 0xffff); return s; }
    return '[' + a.map((x) => this.str(x)).join(', ') + ']';
  }
}

export function javaNumberToString(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  if (isNaN(n)) return 'NaN';
  if (!isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  return String(n);
}
export function hashCodeOf(o) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'number') return o | 0;
  if (typeof o === 'string') { let h = 0; for (let i = 0; i < o.length; i++) h = (Math.imul(31, h) + o.charCodeAt(i)) | 0; return h; }
  if (o.$hash === undefined) o.$hash = (Math.random() * 0x7fffffff) | 0;
  return o.$hash;
}
export function javaStringHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }
