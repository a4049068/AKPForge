/* framework.js — a browser implementation of the slice of the Java + Android
 * standard library that real APKs actually call. Every entry is a native JS
 * function registered against the VM's class registry, so transpiled Dalvik
 * `invoke-*` instructions land here exactly like they would land in ART. */

import { ARR_CLASS, hashCodeOf, javaStringHash, javaNumberToString } from './runtime.js';
import { installExtras } from './framework2.js';

const S = 'Ljava/lang/String;';
const O = 'Ljava/lang/Object;';
const Z = 'Z', I = 'I', J = 'J', F = 'F', D = 'D', V = 'V', C = 'C', B = 'B', S2 = 'S';
const BOOL = (b) => (b ? 1 : 0);

function arr(R, desc, items) {
  const a = items.slice();
  a[ARR_CLASS] = R.klass(desc);
  return a;
}
function bytesFromString(R, s) {
  const out = [];
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out.push(c > 127 ? ((c << 24) >> 24) : c); }
  return arr(R, '[B', out);
}
function bytesToString(a) {
  if (!a) return '';
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i] & 0xff);
  return s;
}
function charsToString(a) {
  if (!a) return '';
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i] & 0xffff);
  return s;
}
const isStr = (x) => typeof x === 'string';
const toStr = (R, x) => R.str(x);

/* java.lang.String.format — a practical subset of the format grammar. */
function javaFormat(fmt, args) {
  let i = 0;
  return String(fmt).replace(/%(\d+\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (m, idx, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    let a;
    if (idx) a = args[(parseInt(idx, 10) - 1) | 0];
    else a = args[i++];
    let out;
    switch (conv) {
      case 's': out = (a === null || a === undefined) ? 'null' : String(typeof a === 'object' && a.$str !== undefined ? a.$str : (typeof a === 'object' && a.$v !== undefined ? a.$v : a)); break;
      case 'd': out = String(Math.trunc(Number(a && a.$v !== undefined ? a.$v : a) || 0)); break;
      case 'f': out = Number(a && a.$v !== undefined ? a.$v : a || 0).toFixed(prec === undefined ? 6 : Number(prec)); break;
      case 'e': out = Number(a || 0).toExponential(prec === undefined ? 6 : Number(prec)); break;
      case 'x': out = (Math.trunc(Number(a && a.$v !== undefined ? a.$v : a) || 0) >>> 0).toString(16); break;
      case 'o': out = (Math.trunc(Number(a || 0) >>> 0)).toString(8); break;
      case 'b': out = String(!!a); break;
      case 'c': out = String.fromCharCode(Number(a && a.$v !== undefined ? a.$v : a) || 0); break;
      case 'h': out = (hashCodeOf(a) >>> 0).toString(16); break;
      default: out = m;
    }
    const w = width ? Number(width) : 0;
    if (w > out.length) {
      const pad = flags.includes('0') && /[dofxeE]/.test(conv) ? '0' : ' ';
      out = flags.includes('-') ? out + pad.repeat(w - out.length) : pad.repeat(w - out.length) + out;
    }
    return out;
  });
}

/* regex translation: Java and JS agree on almost everything we care about. */
function toRe(pattern, flags = '') {
  try { return new RegExp(pattern.replace(/\{\{|\}\}/g, (m) => m), flags.includes('g') ? flags : flags); }
  catch { return null; }
}

export function installFramework(R, host) {
  const H = host;
  const L = (level, tag, msg, tr) => H.log(level, tag, msg, tr);

  /* ===================================================== java.lang ==== */
  R.def('Ljava/lang/Object;', {
    access: 0x1,
    m: {
      [`<init>()${V}`]: () => {},
      [`toString()${S}`]: (self) => R.invokeToString(self),
      [`equals(${O})${Z}`]: (self, o) => BOOL(self === o),
      [`hashCode()${I}`]: (self) => hashCodeOf(self),
      [`getClass()Ljava/lang/Class;`]: (self) => R.classObject(R.descOf(self) || 'Ljava/lang/Object;'),
      [`notify()${V}`]: () => {}, [`notifyAll()${V}`]: () => {},
      [`wait()${V}`]: () => {}, [`wait(${J})${V}`]: () => {}, [`wait(${J}${I})${V}`]: () => {},
      [`clone()${O}`]: (self) => (self && typeof self === 'object' ? Object.assign(Object.create(Object.getPrototypeOf(self)), self) : self),
      [`finalize()${V}`]: () => {},
    },
  });

  R.def('Ljava/lang/String;', {
    access: 0x31, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/io/Serializable;', 'Ljava/lang/CharSequence;', 'Ljava/lang/Comparable;'],
    hooks: { create: () => ({ $c: R.klass('Ljava/lang/String;'), $str: '' }) },
    m: {
      [`<init>()${V}`]: (self) => { self.$str = ''; },
      [`<init>(${S})${V}`]: (self, s) => { self.$str = isStr(s) ? s : R.str(s); },
      ['<init>([B)V']: (self, b) => { self.$str = bytesToString(b); },
      ['<init>([BII)V']: (self, b, o, l) => { self.$str = bytesToString((b || []).slice(o, o + l)); },
      ['<init>([BIILjava/lang/String;)V']: (self, b, o, l) => { self.$str = bytesToString((b || []).slice(o, o + l)); },
      ['<init>([BIILjava/nio/charset/Charset;)V']: (self, b, o, l) => { self.$str = bytesToString((b || []).slice(o, o + l)); },
      ['<init>([C)V']: (self, c) => { self.$str = charsToString(c); },
      ['<init>([CII)V']: (self, c, o, l) => { self.$str = charsToString((c || []).slice(o, o + l)); },
      ['<init>([III)V']: (self, c, o, l) => { self.$str = charsToString((c || []).slice(o, o + l)); },
      ['<init>(Ljava/lang/StringBuilder;)V']: (self, sb) => { self.$str = sb ? sb.$s.join('') : ''; },
      [`length()${I}`]: (s) => (isStr(s) ? s.length : (s && s.$str ? s.$str.length : 0)),
      [`charAt(${I})C`]: (s, i) => (s.charCodeAt(i) | 0) & 0xffff,
      [`codePointAt(${I})${I}`]: (s, i) => s.codePointAt(i) | 0,
      [`isEmpty()${Z}`]: (s) => BOOL(s.length === 0),
      [`equals(${O})${Z}`]: (s, o) => BOOL(isStr(o) && o === s),
      [`equalsIgnoreCase(${S})${Z}`]: (s, o) => BOOL(isStr(o) && o.toLowerCase() === s.toLowerCase()),
      [`contentEquals(Ljava/lang/CharSequence;)${Z}`]: (s, o) => BOOL(R.str(o) === s),
      [`compareTo(${S})${I}`]: (s, o) => (s < o ? -1 : s > o ? 1 : 0),
      [`compareToIgnoreCase(${S})${I}`]: (s, o) => { const a = s.toLowerCase(), b = String(o).toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; },
      [`indexOf(${I})${I}`]: (s, c) => s.indexOf(String.fromCharCode(c & 0xffff)),
      [`indexOf(${I}${I})${I}`]: (s, c, f) => s.indexOf(String.fromCharCode(c & 0xffff), f),
      [`indexOf(${S})${I}`]: (s, o) => s.indexOf(o),
      [`indexOf(${S}${I})${I}`]: (s, o, f) => s.indexOf(o, f),
      [`lastIndexOf(${I})${I}`]: (s, c) => s.lastIndexOf(String.fromCharCode(c & 0xffff)),
      [`lastIndexOf(${S})${I}`]: (s, o) => s.lastIndexOf(o),
      [`lastIndexOf(${S}${I})${I}`]: (s, o, f) => s.lastIndexOf(o, f),
      [`contains(Ljava/lang/CharSequence;)${Z}`]: (s, o) => BOOL(s.includes(R.str(o))),
      [`startsWith(${S})${Z}`]: (s, o) => BOOL(s.startsWith(o)),
      [`startsWith(${S}${I})${Z}`]: (s, o, f) => BOOL(s.startsWith(o, f)),
      [`endsWith(${S})${Z}`]: (s, o) => BOOL(s.endsWith(o)),
      [`substring(${I})${S}`]: (s, a) => s.substring(a),
      [`substring(${I}${I})${S}`]: (s, a, b) => s.substring(a, b),
      [`subSequence(${I}${I})Ljava/lang/CharSequence;`]: (s, a, b) => s.substring(a, b),
      [`concat(${S})${S}`]: (s, o) => s + o,
      [`replace(CC)${S}`]: (s, a, b) => s.split(String.fromCharCode(a & 0xffff)).join(String.fromCharCode(b & 0xffff)),
      [`replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)${S}`]: (s, a, b) => s.split(R.str(a)).join(R.str(b)),
      [`replaceAll(${S}${S})${S}`]: (s, p, r) => { const re = toRe(p, 'g'); return re ? s.replace(re, javaReplacement(r)) : s; },
      [`replaceFirst(${S}${S})${S}`]: (s, p, r) => { const re = toRe(p, ''); return re ? s.replace(re, javaReplacement(r)) : s; },
      [`matches(${S})${Z}`]: (s, p) => { const re = toRe(p, ''); return BOOL(re ? re.test(s) : false); },
      [`split(${S})[Ljava/lang/String;`]: (s, p) => arr(R, '[Ljava/lang/String;', splitJava(s, p, 0)),
      [`split(${S}${I})[Ljava/lang/String;`]: (s, p, lim) => arr(R, '[Ljava/lang/String;', splitJava(s, p, lim | 0)),
      [`trim()${S}`]: (s) => s.replace(/^[\s\u0000-\u0020]+|[\s\u0000-\u0020]+$/g, ''),
      [`strip()${S}`]: (s) => s.trim(),
      [`toLowerCase()${S}`]: (s) => s.toLowerCase(),
      [`toUpperCase()${S}`]: (s) => s.toUpperCase(),
      ['toLowerCase(Ljava/util/Locale;)' + S]: (s) => s.toLowerCase(),
      ['toUpperCase(Ljava/util/Locale;)' + S]: (s) => s.toUpperCase(),
      [`toCharArray()[C`]: (s) => arr(R, '[C', Array.from(s).map((c) => c.charCodeAt(0) & 0xffff)),
      [`getBytes()[B`]: (s) => bytesFromString(R, s),
      [`getBytes(${S})[B`]: (s) => bytesFromString(R, s),
      [`getBytes(Ljava/nio/charset/Charset;)[B`]: (s) => bytesFromString(R, s),
      [`intern()${S}`]: (s) => s,
      [`hashCode()${I}`]: (s) => javaStringHash(s),
      [`toString()${S}`]: (s) => s,
      [`compareTo(${O})${I}`]: (s, o) => (s < o ? -1 : s > o ? 1 : 0),
    },
    sm: {
      [`valueOf(${I})${S}`]: (n) => String(n | 0),
      [`valueOf(${J})${S}`]: (n) => String(n),
      [`valueOf(${F})${S}`]: (n) => javaNumberToString(Math.fround(n)),
      [`valueOf(${D})${S}`]: (n) => javaNumberToString(n),
      [`valueOf(${Z})${S}`]: (b) => (b ? 'true' : 'false'),
      [`valueOf(C)${S}`]: (c) => String.fromCharCode(c & 0xffff),
      [`valueOf([C)${S}`]: (c) => charsToString(c),
      [`valueOf([CII)${S}`]: (c, o, l) => charsToString((c || []).slice(o, o + l)),
      [`valueOf(${O})${S}`]: (o) => (o === null || o === undefined ? 'null' : R.str(o)),
      [`format(${S}[Ljava/lang/Object;)${S}`]: (f, a) => javaFormat(f, a || []),
      [`format(Ljava/util/Locale;${S}[Ljava/lang/Object;)${S}`]: (l, f, a) => javaFormat(f, a || []),
      [`join(Ljava/lang/CharSequence;[Ljava/lang/CharSequence;)${S}`]: (sep, parts) => (parts || []).map((p) => R.str(p)).join(R.str(sep)),
      [`join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)${S}`]: (sep, it) => (it && it.$a ? it.$a : []).map((p) => R.str(p)).join(R.str(sep)),
      [`copyValueOf([C)${S}`]: (c) => charsToString(c),
      [`copyValueOf([CII)${S}`]: (c, o, l) => charsToString((c || []).slice(o, o + l)),
    },
  });

  function javaReplacement(r) {
    return (m, ...groups) => String(r).replace(/\$(\d)/g, (_, n) => (groups[Number(n) - 1] !== undefined ? groups[Number(n) - 1] : ''));
  }
  function splitJava(s, pattern, limit) {
    // Java treats a single non-regex char specially, but semantics match for the common cases.
    let parts;
    const re = toRe(pattern, 'g');
    if (re && re.source !== pattern) parts = s.split(new RegExp(pattern));
    else parts = s.split(re || pattern);
    if (limit > 0) parts = parts.slice(0, limit);
    else if (limit === 0) while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  /* ---- CharSequence / Comparable interfaces ---- */
  R.def('Ljava/lang/CharSequence;', { access: 0x201, m: { [`length()${I}`]: (s) => (isStr(s) ? s.length : 0), [`toString()${S}`]: (s) => R.str(s) } });
  R.def('Ljava/lang/Comparable;', { access: 0x201 });
  R.def('Ljava/lang/Iterable;', { access: 0x201 });
  R.def('Ljava/io/Serializable;', { access: 0x201 });
  R.def('Ljava/lang/Cloneable;', { access: 0x201 });
  R.def('Ljava/lang/Runnable;', { access: 0x201 });
  R.def('Ljava/lang/AutoCloseable;', { access: 0x201 });

  /* ---- StringBuilder / StringBuffer ---- */
  const sbMethods = (mutable) => ({
    [`<init>()${V}`]: (s) => { s.$s = []; },
    [`<init>(${S})${V}`]: (s, x) => { s.$s = [isStr(x) ? x : R.str(x)]; },
    [`<init>(${I})${V}`]: (s) => { s.$s = []; },
    [`<init>(Ljava/lang/CharSequence;)${V}`]: (s, x) => { s.$s = [R.str(x)]; },
    [`append(${S})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(x === null || x === undefined ? 'null' : (isStr(x) ? x : R.str(x))); return s; },
    [`append(Ljava/lang/Object;)Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(x === null || x === undefined ? 'null' : R.str(x)); return s; },
    [`append(Ljava/lang/CharSequence;)Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(x === null || x === undefined ? 'null' : R.str(x)); return s; },
    [`append(Ljava/lang/StringBuffer;)Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(x ? x.$s.join('') : 'null'); return s; },
    [`append(${I})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(String(x | 0)); return s; },
    [`append(${J})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(String(x)); return s; },
    [`append(${F})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(javaNumberToString(Math.fround(x))); return s; },
    [`append(${D})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(javaNumberToString(x)); return s; },
    [`append(${Z})Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(x ? 'true' : 'false'); return s; },
    [`append(C)Ljava/lang/StringBuilder;`]: (s, x) => { s.$s.push(String.fromCharCode(x & 0xffff)); return s; },
    ['append([C)Ljava/lang/StringBuilder;']: (s, x) => { s.$s.push(charsToString(x)); return s; },
    [`insert(${I}${S})Ljava/lang/StringBuilder;`]: (s, off, x) => { s.$s.splice(off, 0, isStr(x) ? x : R.str(x)); return s; },
    [`insert(${I}${I})Ljava/lang/StringBuilder;`]: (s, off, x) => { s.$s.splice(off, 0, String(x | 0)); return s; },
    [`insert(${I}${O})Ljava/lang/StringBuilder;`]: (s, off, x) => { s.$s.splice(off, 0, R.str(x)); return s; },
    [`delete(${I}${I})Ljava/lang/StringBuilder;`]: (s, a, b) => { const cur = s.$s.join(''); s.$s = [cur.slice(0, a) + cur.slice(b)]; return s; },
    [`deleteCharAt(${I})Ljava/lang/StringBuilder;`]: (s, a) => { const cur = s.$s.join(''); s.$s = [cur.slice(0, a) + cur.slice(a + 1)]; return s; },
    [`reverse()Ljava/lang/StringBuilder;`]: (s) => { s.$s = [s.$s.join('').split('').reverse().join('')]; return s; },
    [`setLength(${I})${V}`]: (s, n) => { const cur = s.$s.join(''); s.$s = [cur.slice(0, n).padEnd(Math.max(0, n), '\0')]; },
    [`setCharAt(${I}C)${V}`]: (s, i, c) => { const cur = s.$s.join('').split(''); cur[i] = String.fromCharCode(c & 0xffff); s.$s = [cur.join('')]; },
    [`length()${I}`]: (s) => s.$s.join('').length,
    [`charAt(${I})C`]: (s, i) => (s.$s.join('').charCodeAt(i) | 0) & 0xffff,
    [`toString()${S}`]: (s) => s.$s.join(''),
  });
  R.def('Ljava/lang/StringBuilder;', { access: 0x11, sup: 'Ljava/lang/Object;', m: sbMethods(true) });
  R.def('Ljava/lang/StringBuffer;', { access: 0x31, sup: 'Ljava/lang/Object;', m: sbMethods(true) });

  /* ---- boxed primitives ---- */
  const boxed = (desc, short, parse) => {
    const m = {
      [`<init>(${short})${V}`]: (s, v) => { s.$v = v; },
      [`<init>(${S})${V}`]: (s, v) => { s.$v = parse(v); },
      [`intValue()${I}`]: (s) => (typeof s === 'number' ? s | 0 : s.$v | 0),
      [`longValue()${J}`]: (s) => (typeof s === 'number' ? s : s.$v),
      [`floatValue()${F}`]: (s) => Math.fround(typeof s === 'number' ? s : s.$v),
      [`doubleValue()${D}`]: (s) => (typeof s === 'number' ? s : s.$v),
      [`byteValue()B`]: (s) => ((typeof s === 'number' ? s : s.$v) << 24) >> 24,
      [`shortValue()S`]: (s) => ((typeof s === 'number' ? s : s.$v) << 16) >> 16,
      [`toString()${S}`]: (s) => javaNumberToString(typeof s === 'number' ? s : s.$v),
      [`hashCode()${I}`]: (s) => (typeof s === 'number' ? s | 0 : s.$v | 0),
      [`equals(${O})${Z}`]: (s, o) => BOOL(o && (o.$v !== undefined ? o.$v : o) === (typeof s === 'number' ? s : s.$v)),
      [`compareTo(${desc})${I}`]: (s, o) => { const a = typeof s === 'number' ? s : s.$v, b = o.$v; return a < b ? -1 : a > b ? 1 : 0; },
    };
    const sm = {
      [`valueOf(${short})${desc}`]: (v) => box(R, desc, v),
      [`toString(${short})${S}`]: (v) => javaNumberToString(v),
      [`parse${shortName(desc)}(${S})${short}`]: (v) => parse(v),
      [`parse${shortName(desc)}(${S}${I})${short}`]: (v, radix) => parseInt(v, radix),
    };
    const numeric = ['Ljava/lang/Integer;', 'Ljava/lang/Long;', 'Ljava/lang/Float;', 'Ljava/lang/Double;', 'Ljava/lang/Short;', 'Ljava/lang/Byte;'].includes(desc);
    R.def(desc, { access: 0x31, sup: numeric ? 'Ljava/lang/Number;' : 'Ljava/lang/Object;', ifaces: ['Ljava/lang/Comparable;'], m, sm });
  };
  const shortName = (d) => d.slice(1, -1).split('/').pop();
  function box(R, desc, v) {
    const c = R.klass(desc);
    R.initClass(c);
    const o = { $c: c, $v: v };
    return o;
  }
  R.box = (desc, v) => box(R, desc, v);
  boxed('Ljava/lang/Integer;', 'I', (v) => (isStr(v) ? (parseInt(v, 10) | 0) : v | 0));
  boxed('Ljava/lang/Long;', 'J', (v) => (isStr(v) ? Number(parseInt(v, 10)) : Number(v)));
  boxed('Ljava/lang/Float;', 'F', (v) => Math.fround(isStr(v) ? parseFloat(v) : v));
  boxed('Ljava/lang/Double;', 'D', (v) => (isStr(v) ? parseFloat(v) : Number(v)));
  boxed('Ljava/lang/Short;', 'S', (v) => ((isStr(v) ? parseInt(v, 10) : v) << 16) >> 16);
  boxed('Ljava/lang/Byte;', 'B', (v) => ((isStr(v) ? parseInt(v, 10) : v) << 24) >> 24);
  R.def('Ljava/lang/Integer;', {
    access: 0x31, sup: 'Ljava/lang/Number;',
    statics: {
      'Ljava/lang/Integer;->MAX_VALUE:I': 2147483647, 'Ljava/lang/Integer;->MIN_VALUE:I': -2147483648,
      'Ljava/lang/Integer;->SIZE:I': 32, 'Ljava/lang/Integer;->TYPE:Ljava/lang/Class;': null,
    },
    m: {
      [`<init>(${I})${V}`]: (s, v) => { s.$v = v | 0; },
      [`intValue()${I}`]: (s) => s.$v | 0,
      [`toString()${S}`]: (s) => String(s.$v | 0),
    },
    sm: {
      [`valueOf(${I})Ljava/lang/Integer;`]: (v) => box(R, 'Ljava/lang/Integer;', v | 0),
      [`valueOf(${S})Ljava/lang/Integer;`]: (v) => box(R, 'Ljava/lang/Integer;', parseInt(v, 10) | 0),
      [`valueOf(${S}${I})Ljava/lang/Integer;`]: (v, r) => box(R, 'Ljava/lang/Integer;', parseInt(v, r) | 0),
      [`parseInt(${S})${I}`]: (v) => { const n = parseInt(v, 10); if (isNaN(n)) throw R.newException('Ljava/lang/NumberFormatException;', v); return n | 0; },
      [`parseInt(${S}${I})${I}`]: (v, r) => { const n = parseInt(v, r); if (isNaN(n)) throw R.newException('Ljava/lang/NumberFormatException;', v); return n | 0; },
      [`toString(${I})${S}`]: (v) => String(v | 0),
      [`toString(${I}${I})${S}`]: (v, r) => (v | 0).toString(r),
      [`toHexString(${I})${S}`]: (v) => (v >>> 0).toString(16),
      [`toBinaryString(${I})${S}`]: (v) => (v >>> 0).toString(2),
      [`max(${I}${I})${I}`]: (a, b) => Math.max(a | 0, b | 0),
      [`min(${I}${I})${I}`]: (a, b) => Math.min(a | 0, b | 0),
      [`numberOfLeadingZeros(${I})${I}`]: (v) => { if (v === 0) return 32; let n = 0; let x = v >>> 0; while (!(x & 0x80000000)) { n++; x <<= 1; } return n; },
      [`numberOfTrailingZeros(${I})${I}`]: (v) => { if (v === 0) return 32; let n = 0; while (!(v & 1)) { n++; v >>>= 1; } return n; },
      [`bitCount(${I})${I}`]: (v) => { let n = 0, x = v >>> 0; while (x) { n += x & 1; x >>>= 1; } return n; },
      [`signum(${I})${I}`]: (v) => (v > 0 ? 1 : v < 0 ? -1 : 0),
      [`reverse(${I})${I}`]: (v) => { let x = v >>> 0, r = 0; for (let i = 0; i < 32; i++) { r = (r << 1) | (x & 1); x >>>= 1; } return r | 0; },
    },
  });
  R.def('Ljava/lang/Long;', {
    access: 0x31, sup: 'Ljava/lang/Number;',
    statics: { 'Ljava/lang/Long;->MAX_VALUE:J': 9223372036854775807, 'Ljava/lang/Long;->MIN_VALUE:J': -9223372036854775808 },
    sm: {
      [`valueOf(${J})Ljava/lang/Long;`]: (v) => box(R, 'Ljava/lang/Long;', v),
      [`parseLong(${S})${J}`]: (v) => Number(parseInt(v, 10)),
      [`currentTimeMillis()${J}`]: () => Date.now(),
      [`toString(${J})${S}`]: (v) => String(v),
      [`max(${J}${J})${J}`]: (a, b) => Math.max(a, b),
      [`min(${J}${J})${J}`]: (a, b) => Math.min(a, b),
    },
  });
  R.def('Ljava/lang/Boolean;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>(${Z})${V}`]: (s, v) => { s.$v = v ? 1 : 0; },
      [`booleanValue()${Z}`]: (s) => (s.$v ? 1 : 0),
      [`toString()${S}`]: (s) => (s.$v ? 'true' : 'false'),
    },
    sm: {
      [`valueOf(${Z})Ljava/lang/Boolean;`]: (v) => box(R, 'Ljava/lang/Boolean;', v ? 1 : 0),
      [`valueOf(${S})Ljava/lang/Boolean;`]: (v) => box(R, 'Ljava/lang/Boolean;', v === 'true' ? 1 : 0),
      [`parseBoolean(${S})${Z}`]: (v) => BOOL(v === 'true'),
      [`toString(${Z})${S}`]: (v) => (v ? 'true' : 'false'),
      [`logicalAnd(${Z}${Z})${Z}`]: (a, b) => BOOL(a && b),
      [`logicalOr(${Z}${Z})${Z}`]: (a, b) => BOOL(a || b),
    },
  });
  R.def('Ljava/lang/Character;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: { [`<init>(C)${V}`]: (s, v) => { s.$v = v & 0xffff; }, [`charValue()C`]: (s) => s.$v & 0xffff },
    sm: {
      [`valueOf(C)Ljava/lang/Character;`]: (v) => box(R, 'Ljava/lang/Character;', v & 0xffff),
      [`isDigit(C)${Z}`]: (c) => BOOL(c >= 48 && c <= 57),
      [`isLetter(C)${Z}`]: (c) => BOOL((c >= 65 && c <= 90) || (c >= 97 && c <= 122)),
      [`isLetterOrDigit(C)${Z}`]: (c) => BOOL((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)),
      [`isWhitespace(C)${Z}`]: (c) => BOOL(/\s/.test(String.fromCharCode(c))),
      [`isUpperCase(C)${Z}`]: (c) => BOOL(String.fromCharCode(c) === String.fromCharCode(c).toUpperCase()),
      [`isLowerCase(C)${Z}`]: (c) => BOOL(String.fromCharCode(c) === String.fromCharCode(c).toLowerCase()),
      [`toUpperCase(C)C`]: (c) => String.fromCharCode(c).toUpperCase().charCodeAt(0) & 0xffff,
      [`toLowerCase(C)C`]: (c) => String.fromCharCode(c).toLowerCase().charCodeAt(0) & 0xffff,
      [`toString(C)${S}`]: (c) => String.fromCharCode(c & 0xffff),
    },
  });
  /* ---- java.lang.Enum: every dex enum constant calls <init>(String,int) ---- */
  R.def('Ljava/lang/Enum;', {
    access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/Comparable;', 'Ljava/io/Serializable;'],
    fields: [['name', 'Ljava/lang/String;'], ['ordinal', 'I']],
    m: {
      ['<init>(Ljava/lang/String;I)' + V]: (s, n, o) => { s[ENAME] = n; s[EORD] = o | 0; },
      ['name()' + S]: (s) => (s[ENAME] === undefined ? null : s[ENAME]),
      ['ordinal()' + I]: (s) => (s[EORD] === undefined ? 0 : s[EORD] | 0),
      ['toString()' + S]: (s) => (s[ENAME] === undefined ? R.classNameOf(s) : s[ENAME]),
      ['compareTo(Ljava/lang/Enum;)' + I]: (s, o) => ((s[EORD] || 0) - (o[EORD] || 0)) | 0,
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(s === o),
      ['hashCode()' + I]: (s) => hashCodeOf(s),
      ['getDeclaringClass()Ljava/lang/Class;']: (s) => R.classObject(R.descOf(s)),
      ['clone()' + O]: () => { throw R.newException('Ljava/lang/CloneNotSupportedException;', 'enums cannot be cloned'); },
      ['finalize()' + V]: () => {},
    },
    sm: {
      ['valueOf(Ljava/lang/Class;Ljava/lang/String;)Ljava/lang/Enum;']: (c, n) => {
        const cls = c && c['Ljava/lang/Class;->desc:Ljava/lang/String;'];
        if (cls) { const kc = R.klass(cls); for (const k in kc.statics) if (kc.statics[k] && kc.statics[k].$c === kc && kc.statics[k][ENAME] === n) return kc.statics[k]; }
        throw R.newException('Ljava/lang/IllegalArgumentException;', `No enum constant ${n}`);
      },
      ['valueOf(Ljava/lang/String;)Ljava/lang/Enum;']: () => null,
    },
  });
  const ENAME = 'Ljava/lang/Enum;->name:Ljava/lang/String;';
  const EORD = 'Ljava/lang/Enum;->ordinal:I';
  R.enumName = (o) => (o && o[ENAME] !== undefined ? o[ENAME] : null);
  R.enumOrdinal = (o) => (o && o[EORD] !== undefined ? o[EORD] : 0);
  R.def('Ljava/lang/Number;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/lang/Double;', { access: 0x31, sup: 'Ljava/lang/Object;', statics: { 'Ljava/lang/Double;->NaN:D': NaN, 'Ljava/lang/Double;->POSITIVE_INFINITY:D': Infinity, 'Ljava/lang/Double;->NEGATIVE_INFINITY:D': -Infinity, 'Ljava/lang/Double;->MAX_VALUE:D': Number.MAX_VALUE, 'Ljava/lang/Double;->MIN_VALUE:D': Number.MIN_VALUE }, sm: { [`isNaN(${D})${Z}`]: (v) => BOOL(isNaN(v)), [`parseDouble(${S})${D}`]: (v) => parseFloat(v) } });
  R.def('Ljava/lang/Float;', { access: 0x31, sup: 'Ljava/lang/Object;', statics: { 'Ljava/lang/Float;->NaN:F': NaN, 'Ljava/lang/Float;->POSITIVE_INFINITY:F': Infinity, 'Ljava/lang/Float;->NEGATIVE_INFINITY:F': -Infinity }, sm: { [`isNaN(${F})${Z}`]: (v) => BOOL(isNaN(v)), [`parseFloat(${S})${F}`]: (v) => Math.fround(parseFloat(v)) } });

  /* ---- Math ---- */
  R.def('Ljava/lang/Math;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    statics: { 'Ljava/lang/Math;->PI:D': Math.PI, 'Ljava/lang/Math;->E:D': Math.E },
    sm: {
      [`abs(${I})${I}`]: (a) => Math.abs(a | 0), [`abs(${J})${J}`]: (a) => Math.abs(a),
      [`abs(${F})${F}`]: (a) => Math.fround(Math.abs(a)), [`abs(${D})${D}`]: (a) => Math.abs(a),
      [`min(${I}${I})${I}`]: (a, b) => Math.min(a | 0, b | 0), [`min(${J}${J})${J}`]: (a, b) => Math.min(a, b),
      [`min(${F}${F})${F}`]: (a, b) => Math.fround(Math.min(a, b)), [`min(${D}${D})${D}`]: (a, b) => Math.min(a, b),
      [`max(${I}${I})${I}`]: (a, b) => Math.max(a | 0, b | 0), [`max(${J}${J})${J}`]: (a, b) => Math.max(a, b),
      [`max(${F}${F})${F}`]: (a, b) => Math.fround(Math.max(a, b)), [`max(${D}${D})${D}`]: (a, b) => Math.max(a, b),
      [`sqrt(${D})${D}`]: (a) => Math.sqrt(a), [`cbrt(${D})${D}`]: (a) => Math.cbrt(a),
      [`pow(${D}${D})${D}`]: (a, b) => Math.pow(a, b), [`exp(${D})${D}`]: (a) => Math.exp(a),
      [`log(${D})${D}`]: (a) => Math.log(a), [`log10(${D})${D}`]: (a) => Math.log10(a),
      [`sin(${D})${D}`]: Math.sin, [`cos(${D})${D}`]: Math.cos, [`tan(${D})${D}`]: Math.tan,
      [`asin(${D})${D}`]: Math.asin, [`acos(${D})${D}`]: Math.acos, [`atan(${D})${D}`]: Math.atan,
      [`atan2(${D}${D})${D}`]: Math.atan2, [`sinh(${D})${D}`]: Math.sinh, [`cosh(${D})${D}`]: Math.cosh, [`tanh(${D})${D}`]: Math.tanh,
      [`floor(${D})${D}`]: Math.floor, [`ceil(${D})${D}`]: Math.ceil, [`round(${F})${I}`]: (a) => Math.round(a) | 0,
      [`round(${D})${J}`]: (a) => Math.round(a), [`rint(${D})${D}`]: (a) => { const f = Math.floor(a); return a - f < 0.5 ? f : a - f > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1); },
      [`random()${D}`]: () => Math.random(), [`hypot(${D}${D})${D}`]: Math.hypot,
      [`toDegrees(${D})${D}`]: (a) => a * 180 / Math.PI, [`toRadians(${D})${D}`]: (a) => a * Math.PI / 180,
      [`signum(${D})${D}`]: Math.sign, [`IEEEremainder(${D}${D})${D}`]: (a, b) => a - b * Math.round(a / b),
    },
  });
  R.def('Ljava/lang/StrictMath;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: { [`abs(${I})${I}`]: (a) => Math.abs(a | 0), [`sqrt(${D})${D}`]: Math.sqrt, [`random()${D}`]: Math.random } });

  /* ---- System ---- */
  R.def('Ljava/lang/System;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {},
    sm: {
      [`currentTimeMillis()${J}`]: () => Date.now(),
      [`nanoTime()${J}`]: () => (typeof performance !== 'undefined' ? Math.floor(performance.now() * 1e6) : Date.now() * 1e6),
      ['arraycopy(Ljava/lang/Object;' + I + 'Ljava/lang/Object;' + I + I + ')' + V]: (src, so, dst, dpos, len) => {
        // Must be overlap-safe (memmove semantics): collection code shifts
        // elements inside a single array all the time.
        const tmp = new Array(len);
        for (let i = 0; i < len; i++) tmp[i] = src[so + i];
        for (let i = 0; i < len; i++) dst[dpos + i] = tmp[i];
      },
      [`exit(${I})${V}`]: (code) => { L('W', 'System', `System.exit(${code})`); if (H.onExit) H.onExit(code); },
      [`gc()${V}`]: () => {},
      [`getenv(${S})${S}`]: () => null,
      [`getProperty(${S})${S}`]: (k) => { const v = SYS_PROPS[k]; if (v === undefined) H.log('W', 'System', `getProperty("${k}") → null (unknown key)`); return v === undefined ? null : v; },
      [`getProperty(${S}${S})${S}`]: (k, d) => SYS_PROPS[k] ?? d,
      [`setProperty(${S}${S})${S}`]: (k, v) => { SYS_PROPS[k] = v; return v; },
      [`lineSeparator()${S}`]: () => '\n',
      [`identityHashCode(${O})${I}`]: (o) => hashCodeOf(o),
      [`getSecurityManager()Ljava/lang/SecurityManager;`]: () => null,
    },
    statics: {},
  });
  const SYS_PROPS = {
    'os.name': 'Linux', 'os.version': '4.19.191', 'os.arch': 'aarch64',
    'line.separator': '\n', 'file.separator': '/', 'path.separator': ':',
    'user.dir': '/', 'user.home': '/data', 'user.language': 'en', 'user.region': 'US',
    'java.vm.name': 'Dex2Web', 'java.vm.version': '2.1.0', 'java.vm.vendor': 'Dex2Web',
    'java.vendor': 'Dex2Web', 'java.version': '17', 'java.specification.version': '17',
    'java.io.tmpdir': '/data/local/tmp', 'file.encoding': 'UTF-8',
    'http.agent': 'Dalvik/2.1.0 (Linux; U; Android 13; Dex2Web)',
    'http.maxConnections': '8', 'javax.net.ssl.trustStoreType': 'AndroidCAStore',
    'java.net.preferIPv6Addresses': 'false', 'socksProxyHost': '', 'http.proxyHost': '',
    'persist.sys.timezone': 'UTC', 'ro.build.version.sdk': '33',
    'java.class.version': '61.0', 'java.home': '/system', 'android.icu.library.version': '70.1',
  };
  // System.out / err — populated after PrintStream exists
  R.afterPrintStream = () => {
    const ps = makePrintStream('System.out');
    R.klass('Ljava/lang/System;').statics['Ljava/lang/System;->out:Ljava/io/PrintStream;'] = ps;
    R.klass('Ljava/lang/System;').statics['Ljava/lang/System;->err:Ljava/io/PrintStream;'] = makePrintStream('System.err');
    R.klass('Ljava/lang/System;').statics['Ljava/lang/System;->in:Ljava/io/InputStream;'] = { $c: R.klass('Ljava/io/InputStream;') };
  };

  R.def('Ljava/io/PrintStream;', {
    access: 0x31, sup: 'Ljava/io/FilterOutputStream;', ifaces: ['Ljava/lang/AutoCloseable;'],
    m: {
      [`println(${S})${V}`]: (s, x) => L('I', s.$tag || 'System.out', R.str(x)),
      [`println(${I})${V}`]: (s, x) => L('I', s.$tag || 'System.out', String(x | 0)),
      [`println(${J})${V}`]: (s, x) => L('I', s.$tag || 'System.out', String(x)),
      [`println(${O})${V}`]: (s, x) => L('I', s.$tag || 'System.out', x === null ? 'null' : R.str(x)),
      [`println()${V}`]: (s) => L('I', s.$tag || 'System.out', ''),
      [`print(${S})${V}`]: (s, x) => L('I', s.$tag || 'System.out', R.str(x)),
      [`print(${I})${V}`]: (s, x) => L('I', s.$tag || 'System.out', String(x | 0)),
      [`print(${O})${V}`]: (s, x) => L('I', s.$tag || 'System.out', x === null ? 'null' : R.str(x)),
      [`printf(${S}[Ljava/lang/Object;)Ljava/io/PrintStream;`]: (s, f, a) => { L('I', s.$tag || 'System.out', javaFormat(f, a || [])); return s; },
      [`format(${S}[Ljava/lang/Object;)Ljava/io/PrintStream;`]: (s, f, a) => { L('I', s.$tag || 'System.out', javaFormat(f, a || [])); return s; },
      [`flush()${V}`]: () => {}, [`close()${V}`]: () => {},
      [`checkError()${Z}`]: () => 0,
    },
  });
  function makePrintStream(tag) { const c = R.klass('Ljava/io/PrintStream;'); R.initClass(c); return { $c: c, $tag: tag }; }

  /* ---- Throwable family ---- */
  const throwables = ['Throwable', 'Error', 'Exception', 'RuntimeException', 'IllegalStateException', 'IllegalArgumentException',
    'NullPointerException', 'ArithmeticException', 'ArrayIndexOutOfBoundsException', 'IndexOutOfBoundsException',
    'ClassCastException', 'NumberFormatException', 'UnsupportedOperationException', 'ClassNotFoundException',
    'NoSuchMethodError', 'NoSuchFieldError', 'AbstractMethodError', 'StackOverflowError', 'OutOfMemoryError',
    'NegativeArraySizeException', 'ConcurrentModificationException', 'StringIndexOutOfBoundsException',
    'SecurityException', 'InterruptedException', 'CloneNotSupportedException', 'RuntimeException',
    'VerifyError', 'IncompatibleClassChangeError', 'LinkageError', 'UnsatisfiedLinkError', 'NoClassDefFoundError',
    'IllegalMonitorStateException', 'AssertionError', 'EnumConstantNotPresentException', 'IllegalAccessError'];
  for (const t of throwables) {
    const RUNTIME = ['RuntimeException', 'IllegalStateException', 'IllegalArgumentException', 'NullPointerException',
      'ArithmeticException', 'ArrayIndexOutOfBoundsException', 'ClassCastException', 'NumberFormatException',
      'UnsupportedOperationException', 'IndexOutOfBoundsException', 'ConcurrentModificationException',
      'StringIndexOutOfBoundsException', 'SecurityException', 'NegativeArraySizeException'];
    const sup = t === 'Throwable' ? 'Ljava/lang/Object;'
      : t === 'Exception' ? 'Ljava/lang/Throwable;'
      : t === 'Error' ? 'Ljava/lang/Throwable;'
      : t === 'AssertionError' ? 'Ljava/lang/Error;'
      : t === 'RuntimeException' ? 'Ljava/lang/Exception;'
      : RUNTIME.includes(t) ? 'Ljava/lang/RuntimeException;'
      : 'Ljava/lang/Exception;';
    R.def(`Ljava/lang/${t};`, {
      access: 0x21, sup,
      m: {
        [`<init>()${V}`]: (s) => { s.$message = null; },
        [`<init>(${S})${V}`]: (s, m) => { s.$message = m; s['Ljava/lang/Throwable;->detailMessage:Ljava/lang/String;'] = m; },
        [`<init>(${S}Ljava/lang/Throwable;)${V}`]: (s, m, c) => { s.$message = m; s.$cause = c; },
        ['<init>(Ljava/lang/Throwable;)V']: (s, c) => { s.$message = c ? R.messageOf(c) : null; s.$cause = c; },
        [`getMessage()${S}`]: (s) => (s.$message === undefined ? R.messageOf(s) : s.$message),
        [`getLocalizedMessage()${S}`]: (s) => (s.$message === undefined ? R.messageOf(s) : s.$message),
        [`getCause()Ljava/lang/Throwable;`]: (s) => s.$cause || null,
        ['initCause(Ljava/lang/Throwable;)Ljava/lang/Throwable;']: (s, c) => { s.$cause = c; return s; },
        [`toString()${S}`]: (s) => { const n = R.classNameOf(s); const m = s.$message; return m ? `${n}: ${m}` : n; },
        [`printStackTrace()${V}`]: (s) => { L('E', R.classNameOf(s), R.messageOf(s)); if (s.$stack) for (const f of s.$stack.slice(0, 24)) L('E', '', '    at ' + f); },
        ['printStackTrace(Ljava/io/PrintStream;)' + V]: (s) => { L('E', R.classNameOf(s), R.messageOf(s)); },
        ['getStackTrace()[Ljava/lang/StackTraceElement;']: () => arr(R, '[Ljava/lang/StackTraceElement;', []),
        [`fillInStackTrace()Ljava/lang/Throwable;`]: (s) => s,
        [`addSuppressed(Ljava/lang/Throwable;)${V}`]: () => {},
      },
    });
  }
  R.def('Ljava/lang/StackTraceElement;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { [`toString()${S}`]: (s) => s.$name || '' } });

  /* ---- Class ---- */
  R.def('Ljava/lang/Class;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      [`getName()${S}`]: (s) => (s[Object.getOwnPropertySymbols(s).includes(0) ? '' : '$c'] && R.classOf(s) ? (s.$desc || '') : '') || (s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || ''),
      [`getSimpleName()${S}`]: (s) => { const d = s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || ''; return d.split('/').pop().replace(';', ''); },
      [`getCanonicalName()${S}`]: (s) => (s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || '').slice(1, -1).replace(/\//g, '.'),
      [`toString()${S}`]: (s) => 'class ' + ((s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || '').slice(1, -1).replace(/\//g, '.')),
      [`isInstance(${O})${Z}`]: (s, o) => BOOL(R.io(o, s['Ljava/lang/Class;->desc:Ljava/lang/String;'])),
      ['isArray()' + Z]: (s) => BOOL(String(s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || '').startsWith('[')),
      ['isInterface()' + Z]: (s) => { const c = R.classes.get(s['Ljava/lang/Class;->desc:Ljava/lang/String;']); return BOOL(c && c.isInterface()); },
      ['isPrimitive()' + Z]: () => 0,
      ['isEnum()' + Z]: (s) => { const c = R.classes.get(s['Ljava/lang/Class;->desc:Ljava/lang/String;']); return BOOL(c && c.isEnum()); },
      ['isAnnotation()' + Z]: () => 0,
      ['getSuperclass()Ljava/lang/Class;']: (s) => { const c = R.classes.get(s['Ljava/lang/Class;->desc:Ljava/lang/String;']); return c && c.superDesc ? R.classObject(c.superDesc) : null; },
      ['getInterfaces()[Ljava/lang/Class;']: (s) => { const c = R.classes.get(s['Ljava/lang/Class;->desc:Ljava/lang/String;']); return arr(R, '[Ljava/lang/Class;', (c ? c.interfaces : []).map((d) => R.classObject(d))); },
      ['getModifiers()' + I]: (s) => { const c = R.classes.get(s['Ljava/lang/Class;->desc:Ljava/lang/String;']); return c ? c.accessFlags : 0; },
      ['getPackage()Ljava/lang/Package;']: () => null,
      ['getClassLoader()Ljava/lang/ClassLoader;']: () => null,
      ['newInstance()' + O]: (s) => R.ni(s['Ljava/lang/Class;->desc:Ljava/lang/String;']),
      ['getDeclaredFields()[Ljava/lang/reflect/Field;']: () => arr(R, '[Ljava/lang/reflect/Field;', []),
      ['getDeclaredMethods()[Ljava/lang/reflect/Method;']: () => arr(R, '[Ljava/lang/reflect/Method;', []),
      ['getMethods()[Ljava/lang/reflect/Method;']: () => arr(R, '[Ljava/lang/reflect/Method;', []),
      ['getFields()[Ljava/lang/reflect/Field;']: () => arr(R, '[Ljava/lang/reflect/Field;', []),
      ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []),
      ['isAssignableFrom(Ljava/lang/Class;)' + Z]: (s, o) => BOOL(R.isAssignable(o['Ljava/lang/Class;->desc:Ljava/lang/String;'], s['Ljava/lang/Class;->desc:Ljava/lang/String;'])),
      ['getEnumConstants()[Ljava/lang/Object;']: () => null,
      ['desiredAssertionStatus()' + Z]: () => 0,
    },
    sm: {
      [`forName(${S})Ljava/lang/Class;`]: (n) => { const d = 'L' + n.replace(/\./g, '/') + ';'; if (!R.classes.has(d)) throw R.newException('Ljava/lang/ClassNotFoundException;', n); return R.classObject(d); },
      [`forName(${S}${Z}Ljava/lang/ClassLoader;)Ljava/lang/Class;`]: (n) => R.classObject('L' + n.replace(/\./g, '/') + ';'),
    },
  });
  for (const n of ['Ljava/lang/reflect/Field;', 'Ljava/lang/reflect/Method;', 'Ljava/lang/reflect/Constructor;', 'Ljava/lang/annotation/Annotation;', 'Ljava/lang/ClassLoader;', 'Ljava/lang/Package;', 'Ljava/lang/SecurityManager;', 'Ljava/lang/Thread;', 'Ljava/lang/ThreadGroup;', 'Ljava/lang/Enum;']) {
    R.def(n, { access: 0x21, sup: 'Ljava/lang/Object;' });
  }
  R.def('Ljava/lang/Thread;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>()${V}`]: () => {}, [`<init>(Ljava/lang/Runnable;)${V}`]: (s, r) => { s.$r = r; },
      [`<init>(Ljava/lang/Runnable;${S})${V}`]: (s, r) => { s.$r = r; },
      [`start()${V}`]: (s) => { if (s.$r) setTimeout(() => { try { R.iv('Ljava/lang/Runnable;->run()V', s.$r); } catch (e) { L('E', 'Thread', R.messageOf(e), e); } }, 0); },
      [`run()${V}`]: (s) => { if (s.$r) R.iv('Ljava/lang/Runnable;->run()V', s.$r); },
      [`join()${V}`]: () => {}, [`join(${J})${V}`]: () => {}, [`interrupt()${V}`]: () => {}, [`isAlive()${Z}`]: () => 0,
      [`setName(${S})${V}`]: () => {}, [`getName()${S}`]: () => 'main', [`setPriority(${I})${V}`]: () => {},
    },
    sm: {
      [`sleep(${J})${V}`]: () => {}, [`sleep(${J}${I})${V}`]: () => {},
      [`currentThread()Ljava/lang/Thread;`]: () => ({ $c: R.klass('Ljava/lang/Thread;') }),
      [`yield()${V}`]: () => {},
    },
  });

  /* ===================================================== java.util ==== */
  R.def('Ljava/util/Collection;', { access: 0x201, sup: 'Ljava/lang/Iterable;', m: { [`size()${I}`]: (s) => (s.$a ? s.$a.length : 0), [`isEmpty()${Z}`]: (s) => BOOL(!s.$a || s.$a.length === 0) } });
  R.def('Ljava/util/List;', { access: 0x201, sup: 'Ljava/util/Collection;' });
  R.def('Ljava/util/Set;', { access: 0x201, sup: 'Ljava/util/Collection;' });
  R.def('Ljava/util/Map;', { access: 0x201, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/Iterator;', {
    access: 0x201, sup: 'Ljava/lang/Object;',
    m: {
      [`hasNext()${Z}`]: (s) => BOOL(s.$i < s.$list.length),
      [`next()${O}`]: (s) => { if (s.$i >= s.$list.length) throw R.newException('Ljava/util/NoSuchElementException;', 'iterator'); return s.$list[s.$i++]; },
      [`remove()${V}`]: (s) => { s.$list.splice(s.$i - 1, 1); s.$i--; },
    },
  });
  R.def('Ljava/util/NoSuchElementException;', { access: 0x21, sup: 'Ljava/lang/RuntimeException;', m: { [`<init>()${V}`]: () => {}, [`<init>(${S})${V}`]: (s, m) => { s.$message = m; } } });
  R.def('Ljava/util/ListIterator;', { access: 0x201, sup: 'Ljava/util/Iterator;' });

  const listMethods = {
    [`<init>()${V}`]: (s) => { s.$a = []; },
    [`<init>(${I})${V}`]: (s) => { s.$a = []; },
    ['<init>(Ljava/util/Collection;)' + V]: (s, c) => { s.$a = (c && c.$a ? c.$a.slice() : []); },
    [`add(${O})${Z}`]: (s, o) => { s.$a.push(o); return 1; },
    [`add(${I}${O})${V}`]: (s, i, o) => { s.$a.splice(i, 0, o); },
    [`addAll(Ljava/util/Collection;)${Z}`]: (s, c) => { for (const x of (c && c.$a) || []) s.$a.push(x); return 1; },
    [`addAll(${I}Ljava/util/Collection;)${Z}`]: (s, i, c) => { s.$a.splice(i, 0, ...((c && c.$a) || [])); return 1; },
    [`remove(${I})${O}`]: (s, i) => s.$a.splice(i, 1)[0],
    [`remove(${O})${Z}`]: (s, o) => { const i = s.$a.indexOf(o); if (i < 0) return 0; s.$a.splice(i, 1); return 1; },
    [`removeAll(Ljava/util/Collection;)${Z}`]: (s, c) => { const set = new Set((c && c.$a) || []); const n = s.$a.length; s.$a = s.$a.filter((x) => !set.has(x)); return BOOL(n !== s.$a.length); },
    [`clear()${V}`]: (s) => { s.$a.length = 0; },
    [`size()${I}`]: (s) => s.$a.length,
    [`isEmpty()${Z}`]: (s) => BOOL(s.$a.length === 0),
    [`contains(${O})${Z}`]: (s, o) => BOOL(s.$a.includes(o)),
    [`indexOf(${O})${I}`]: (s, o) => s.$a.indexOf(o),
    [`lastIndexOf(${O})${I}`]: (s, o) => s.$a.lastIndexOf(o),
    [`get(${I})${O}`]: (s, i) => { if (i < 0 || i >= s.$a.length) throw R.newException('Ljava/lang/IndexOutOfBoundsException;', `${i}`); return s.$a[i]; },
    [`set(${I}${O})${O}`]: (s, i, o) => { const old = s.$a[i]; s.$a[i] = o; return old; },
    [`iterator()Ljava/util/Iterator;`]: (s) => makeIterator(R, s.$a),
    [`listIterator()Ljava/util/ListIterator;`]: (s) => makeIterator(R, s.$a),
    [`listIterator(${I})Ljava/util/ListIterator;`]: (s, i) => makeIterator(R, s.$a, i),
    [`toArray()[Ljava/lang/Object;`]: (s) => arr(R, '[Ljava/lang/Object;', s.$a),
    ['toArray([Ljava/lang/Object;)' + O]: (s, target) => { for (let i = 0; i < s.$a.length; i++) target[i] = s.$a[i]; return target; },
    [`subList(${I}${I})Ljava/util/List;`]: (s, a, b) => { const o = { $c: R.klass('Ljava/util/ArrayList;'), $a: s.$a.slice(a, b) }; return o; },
    [`sort(Ljava/util/Comparator;)${V}`]: (s, cmp) => { s.$a.sort((a, b) => (cmp ? R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', cmp, a, b) : 0)); },
    [`toString()${S}`]: (s) => '[' + s.$a.map((x) => R.str(x)).join(', ') + ']',
    [`clone()${O}`]: (s) => ({ $c: s.$c, $a: s.$a.slice() }),
  };
  function makeIterator(R, list, start = 0) { const c = R.klass('Ljava/util/Iterator;'); return { $c: c, $list: list, $i: start }; }
  R.def('Ljava/util/ArrayList;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/List;', 'Ljava/lang/Cloneable;', 'Ljava/io/Serializable;'], m: listMethods });
  R.def('Ljava/util/LinkedList;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/List;'], m: Object.assign({}, listMethods, {
    [`addFirst(${O})${V}`]: (s, o) => { s.$a.unshift(o); }, [`addLast(${O})${V}`]: (s, o) => { s.$a.push(o); },
    [`getFirst()${O}`]: (s) => s.$a[0], [`getLast()${O}`]: (s) => s.$a[s.$a.length - 1],
    [`removeFirst()${O}`]: (s) => s.$a.shift(), [`removeLast()${O}`]: (s) => s.$a.pop(),
    [`push(${O})${V}`]: (s, o) => { s.$a.unshift(o); }, [`pop()${O}`]: (s) => s.$a.shift(), [`peek()${O}`]: (s) => (s.$a.length ? s.$a[0] : null),
  }) });
  R.def('Ljava/util/Vector;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/List;'], m: listMethods });
  R.def('Ljava/util/HashSet;', {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Set;'],
    m: {
      [`<init>()${V}`]: (s) => { s.$a = []; },
      ['<init>(Ljava/util/Collection;)' + V]: (s, c) => { s.$a = ((c && c.$a) || []).slice(); },
      [`<init>(${I})${V}`]: (s) => { s.$a = []; },
      [`add(${O})${Z}`]: (s, o) => { if (s.$a.includes(o)) return 0; s.$a.push(o); return 1; },
      [`remove(${O})${Z}`]: (s, o) => { const i = s.$a.indexOf(o); if (i < 0) return 0; s.$a.splice(i, 1); return 1; },
      [`contains(${O})${Z}`]: (s, o) => BOOL(s.$a.includes(o)),
      [`clear()${V}`]: (s) => { s.$a.length = 0; },
      [`size()${I}`]: (s) => s.$a.length,
      [`isEmpty()${Z}`]: (s) => BOOL(!s.$a.length),
      [`iterator()Ljava/util/Iterator;`]: (s) => makeIterator(R, s.$a),
      ['toArray()[Ljava/lang/Object;']: (s) => arr(R, '[Ljava/lang/Object;', s.$a),
      [`toString()${S}`]: (s) => '[' + s.$a.map((x) => R.str(x)).join(', ') + ']',
    },
  });
  R.def('Ljava/util/LinkedHashSet;', { access: 0x21, sup: 'Ljava/util/HashSet;' });
  R.def('Ljava/util/TreeSet;', { access: 0x21, sup: 'Ljava/util/HashSet;' });
  const mapMethods = {
    [`<init>()${V}`]: (s) => { s.$m = new Map(); },
    [`<init>(${I})${V}`]: (s) => { s.$m = new Map(); },
    [`<init>(Ljava/util/Map;)${V}`]: (s, m) => { s.$m = new Map(m && m.$m ? m.$m : []); },
    [`<init>(${I}${F})${V}`]: (s) => { s.$m = new Map(); },
    [`put(${O}${O})${O}`]: (s, k, v) => { const key = normKey(k); const old = s.$m.has(key) ? s.$m.get(key).v : null; s.$m.set(key, { k, v }); return old; },
    [`get(${O})${O}`]: (s, k) => { const e = s.$m.get(normKey(k)); return e ? e.v : null; },
    [`remove(${O})${O}`]: (s, k) => { const key = normKey(k); const e = s.$m.get(key); s.$m.delete(key); return e ? e.v : null; },
    [`containsKey(${O})${Z}`]: (s, k) => BOOL(s.$m.has(normKey(k))),
    [`containsValue(${O})${Z}`]: (s, v) => BOOL([...s.$m.values()].some((e) => e.v === v)),
    [`putAll(Ljava/util/Map;)${V}`]: (s, m) => { if (m && m.$m) for (const [k, e] of m.$m) s.$m.set(k, { k: e.k, v: e.v }); },
    [`clear()${V}`]: (s) => { s.$m.clear(); },
    [`size()${I}`]: (s) => s.$m.size,
    [`isEmpty()${Z}`]: (s) => BOOL(s.$m.size === 0),
    [`keySet()Ljava/util/Set;`]: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [...s.$m.values()].map((e) => e.k) }),
    [`values()Ljava/util/Collection;`]: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [...s.$m.values()].map((e) => e.v) }),
    [`entrySet()Ljava/util/Set;`]: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [...s.$m.values()].map((e) => makeEntry(R, e.k, e.v)) }),
    [`toString()${S}`]: (s) => '{' + [...s.$m.values()].map((e) => `${R.str(e.k)}=${R.str(e.v)}`).join(', ') + '}',
    [`getOrDefault(${O}${O})${O}`]: (s, k, d) => { const e = s.$m.get(normKey(k)); return e ? e.v : d; },
    [`putIfAbsent(${O}${O})${O}`]: (s, k, v) => { const key = normKey(k); if (s.$m.has(key)) return s.$m.get(key).v; s.$m.set(key, { k, v }); return null; },
  };
  function normKey(k) { return isStr(k) ? 's:' + k : (typeof k === 'number' ? 'n:' + k : (k === null || k === undefined ? 'null' : 'o:' + hashCodeOf(k))); }
  function makeEntry(R, k, v) {
    const c = R.klass('Ljava/util/Map$Entry;');
    return { $c: c, $k: k, $v: v, 'Ljava/util/Map$Entry;->k:Ljava/lang/Object;': k };
  }
  R.def('Ljava/util/Map$Entry;', {
    access: 0x601, sup: 'Ljava/lang/Object;',
    m: { [`getKey()${O}`]: (s) => s.$k, [`getValue()${O}`]: (s) => s.$v, [`setValue(${O})${O}`]: (s, v) => { const o = s.$v; s.$v = v; return o; }, [`toString()${S}`]: (s) => `${R.str(s.$k)}=${R.str(s.$v)}` },
  });
  R.def('Ljava/util/HashMap;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;', 'Ljava/lang/Cloneable;', 'Ljava/io/Serializable;'], m: mapMethods });
  R.def('Ljava/util/LinkedHashMap;', { access: 0x21, sup: 'Ljava/util/HashMap;' });
  R.def('Ljava/util/TreeMap;', { access: 0x21, sup: 'Ljava/util/HashMap;' });
  R.def('Ljava/util/Hashtable;', { access: 0x21, sup: 'Ljava/util/HashMap;' });
  R.def('Ljava/util/Comparator;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  R.def('Ljava/util/Collections;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['sort(Ljava/util/List;)' + V]: (l) => { if (l && l.$a) l.$a.sort(cmpDefault(R)); },
      ['sort(Ljava/util/List;Ljava/util/Comparator;)' + V]: (l, c) => { if (l && l.$a) l.$a.sort((a, b) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', c, a, b)); },
      ['reverse(Ljava/util/List;)' + V]: (l) => { if (l && l.$a) l.$a.reverse(); },
      ['emptyList()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['emptyMap()Ljava/util/Map;']: () => ({ $c: R.klass('Ljava/util/HashMap;'), $m: new Map() }),
      ['emptySet()Ljava/util/Set;']: () => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [] }),
      [`singletonList(${O})Ljava/util/List;`]: (o) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [o] }),
      [`singleton(${O})Ljava/util/Set;`]: (o) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [o] }),
      [`singletonMap(${O}${O})Ljava/util/Map;`]: (k, v) => { const m = new Map(); m.set(normKey(k), { k, v }); return { $c: R.klass('Ljava/util/HashMap;'), $m: m }; },
      ['unmodifiableList(Ljava/util/List;)Ljava/util/List;']: (l) => l,
      ['unmodifiableMap(Ljava/util/Map;)Ljava/util/Map;']: (m) => m,
      ['unmodifiableSet(Ljava/util/Set;)Ljava/util/Set;']: (s) => s,
      ['synchronizedList(Ljava/util/List;)Ljava/util/List;']: (l) => l,
      ['synchronizedMap(Ljava/util/Map;)Ljava/util/Map;']: (m) => m,
      ['max(Ljava/util/Collection;)' + O]: (c) => (c.$a || []).reduce((a, b) => (compareVals(R, b, a) > 0 ? b : a), null),
      ['min(Ljava/util/Collection;)' + O]: (c) => (c.$a || []).reduce((a, b) => (compareVals(R, b, a) < 0 ? b : a), null),
      ['shuffle(Ljava/util/List;)' + V]: (l) => { const a = l.$a || []; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } },
      ['addAll(Ljava/util/Collection;[Ljava/lang/Object;)' + Z]: (c, a) => { for (const x of a || []) c.$a.push(x); return 1; },
      ['frequency(Ljava/util/Collection;' + O + ')' + I]: (c, o) => (c.$a || []).filter((x) => x === o).length,
    },
  });
  function compareVals(R, a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (isStr(a) && isStr(b)) return a < b ? -1 : a > b ? 1 : 0;
    try { return R.iv('Ljava/lang/Comparable;->compareTo(Ljava/lang/Object;)I', a, b) | 0; } catch { return 0; }
  }
  function cmpDefault(R) { return (a, b) => compareVals(R, a, b); }

  R.def('Ljava/util/Arrays;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['asList([Ljava/lang/Object;)Ljava/util/List;']: (a) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: (a || []).slice() }),
      ['sort([I)' + V]: (a) => a.sort((x, y) => x - y),
      ['sort([J)' + V]: (a) => a.sort((x, y) => x - y),
      ['sort([D)' + V]: (a) => a.sort((x, y) => x - y),
      ['sort([F)' + V]: (a) => a.sort((x, y) => x - y),
      ['sort([Ljava/lang/Object;)' + V]: (a) => a.sort(cmpDefault(R)),
      ['sort([Ljava/lang/Object;Ljava/util/Comparator;)' + V]: (a, c) => a.sort((x, y) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', c, x, y)),
      ['sort([III)' + V]: (a, from, to) => { const seg = a.slice(from, to).sort((x, y) => x - y); for (let i = 0; i < seg.length; i++) a[from + i] = seg[i]; },
      ['toString([I)' + S]: (a) => '[' + (a || []).join(', ') + ']',
      ['toString([Ljava/lang/Object;)' + S]: (a) => '[' + (a || []).map((x) => R.str(x)).join(', ') + ']',
      ['toString([[I)' + S]: (a) => '[' + (a || []).map((x) => '[' + x.join(', ') + ']').join(', ') + ']',
      ['copyOf([II)[I']: (a, n) => { const o = new Array(n).fill(0); for (let i = 0; i < Math.min(n, a.length); i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[I'); return o; },
      ['copyOf([Ljava/lang/Object;I)[Ljava/lang/Object;']: (a, n) => { const o = new Array(n).fill(null); for (let i = 0; i < Math.min(n, a.length); i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[Ljava/lang/Object;'); return o; },
      ['copyOfRange([III)[I']: (a, f, t) => { const o = new Array(Math.max(0, t - f)).fill(0); for (let i = f; i < Math.min(t, a.length); i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[I'); return o; },
      ['copyOfRange([Ljava/lang/Object;II)[Ljava/lang/Object;']: (a, f, t) => { const o = new Array(Math.max(0, t - f)).fill(null); for (let i = f; i < Math.min(t, a.length); i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[Ljava/lang/Object;'); return o; },
      ['fill([II)' + V]: (a, v) => a.fill(v),
      ['fill([Ljava/lang/Object;' + O + ')' + V]: (a, v) => a.fill(v),
      ['equals([B[B)' + Z]: (a, b) => BOOL(a && b && a.length === b.length && a.every((x, i) => x === b[i])),
      ['equals([Ljava/lang/Object;[Ljava/lang/Object;)' + Z]: (a, b) => BOOL(a && b && a.length === b.length && a.every((x, i) => x === b[i])),
      ['equals([I[I)' + Z]: (a, b) => BOOL(a && b && a.length === b.length && a.every((x, i) => x === b[i])),
      ['binarySearch([II)' + I]: (a, k) => { let lo = 0, hi = a.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === k) return m; if (a[m] < k) lo = m + 1; else hi = m - 1; } return -lo - 1; },
      ['hashCode([I)' + I]: (a) => { let h = 1; for (const x of a || []) h = (31 * h + x) | 0; return h; },
      ['hashCode([Ljava/lang/Object;)' + I]: (a) => { let h = 1; for (const x of a || []) h = (31 * h + hashCodeOf(x)) | 0; return h; },
      ['stream([I)Ljava/util/stream/IntStream;']: () => null,
    },
  });

  R.def('Ljava/util/Random;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>()${V}`]: () => {}, [`<init>(${J})${V}`]: () => {},
      [`nextInt()${I}`]: () => (Math.random() * 4294967296 - 2147483648) | 0,
      [`nextInt(${I})${I}`]: (n) => ((Math.random() * (n | 0)) | 0),
      [`nextLong()${J}`]: () => Math.floor(Math.random() * 9e15),
      [`nextFloat()${F}`]: () => Math.fround(Math.random()),
      [`nextDouble()${D}`]: () => Math.random(),
      [`nextBoolean()${Z}`]: () => (Math.random() < 0.5 ? 1 : 0),
      ['nextBytes([B)' + V]: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256 - 128) | 0; },
      [`setSeed(${J})${V}`]: () => {},
    },
  });
  R.def('Ljava/util/Date;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>()${V}`]: (s) => { s.$t = Date.now(); },
      [`<init>(${J})${V}`]: (s, t) => { s.$t = Number(t); },
      [`getTime()${J}`]: (s) => s.$t === undefined ? Date.now() : s.$t,
      [`setTime(${J})${V}`]: (s, t) => { s.$t = Number(t); },
      [`toString()${S}`]: (s) => new Date(s.$t === undefined ? Date.now() : s.$t).toString(),
      [`before(Ljava/util/Date;)${Z}`]: (s, o) => BOOL(s.$t < o.$t),
      [`after(Ljava/util/Date;)${Z}`]: (s, o) => BOOL(s.$t > o.$t),
      [`compareTo(Ljava/util/Date;)${I}`]: (s, o) => (s.$t < o.$t ? -1 : s.$t > o.$t ? 1 : 0),
      [`hashCode()${I}`]: (s) => s.$t | 0,
    },
  });
  R.def('Ljava/util/Calendar;', { access: 0x421, sup: 'Ljava/lang/Object;', sm: { ['getInstance()Ljava/util/Calendar;']: () => ({ $c: R.klass('Ljava/util/GregorianCalendar;'), $t: Date.now() }), [`getTimeInMillis()${J}`]: () => Date.now() }, m: { [`getTimeInMillis()${J}`]: (s) => (s.$t || Date.now()), [`getTime()Ljava/util/Date;`]: (s) => ({ $c: R.klass('Ljava/util/Date;'), $t: s.$t || Date.now() }), [`get(${I})${I}`]: (s, f) => { const d = new Date(s.$t || Date.now()); return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()][f] || 0; } } });
  R.def('Ljava/util/GregorianCalendar;', { access: 0x21, sup: 'Ljava/util/Calendar;' });
  R.def('Ljava/util/TimeZone;', { access: 0x421, sup: 'Ljava/lang/Object;', sm: { ['getDefault()Ljava/util/TimeZone;']: () => ({ $c: R.klass('Ljava/util/TimeZone;') }), [`getTimeZone(${S})Ljava/util/TimeZone;`]: () => ({ $c: R.klass('Ljava/util/TimeZone;') }) } });
  R.def('Ljava/util/Locale;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: { [`<init>(${S})${V}`]: (s, l) => { s.$lang = l; }, [`getLanguage()${S}`]: (s) => s.$lang || 'en', [`getCountry()${S}`]: (s) => s.$country || '', [`toString()${S}`]: (s) => s.$lang || 'en' },
    sm: {
      ['getDefault()Ljava/util/Locale;']: () => ({ $c: R.klass('Ljava/util/Locale;'), $lang: (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2) }),
      ['getAvailableLocales()[Ljava/util/Locale;']: () => arr(R, '[Ljava/util/Locale;', []),
    },
  });
  R.def('Ljava/util/UUID;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: { [`toString()${S}`]: (s) => s.$id },
    sm: {
      ['randomUUID()Ljava/util/UUID;']: () => {
        const c = R.klass('Ljava/util/UUID;');
        const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
        return { $c: c, $id: `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}` };
      },
      [`fromString(${S})Ljava/util/UUID;`]: (s) => ({ $c: R.klass('Ljava/util/UUID;'), $id: s }),
    },
  });
  R.def('Ljava/util/concurrent/TimeUnit;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Ljava/util/concurrent/atomic/AtomicInteger;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>()${V}`]: (s) => { s.$v = 0; }, [`<init>(${I})${V}`]: (s, v) => { s.$v = v; }, [`get()${I}`]: (s) => s.$v, [`set(${I})${V}`]: (s, v) => { s.$v = v; }, [`incrementAndGet()${I}`]: (s) => ++s.$v, [`getAndIncrement()${I}`]: (s) => s.$v++, [`decrementAndGet()${I}`]: (s) => --s.$v, [`addAndGet(${I})${I}`]: (s, v) => (s.$v += v), [`compareAndSet(${I}${I})${Z}`]: (s, e, n) => { if (s.$v === e) { s.$v = n; return 1; } return 0; } } });
  R.def('Ljava/util/concurrent/atomic/AtomicBoolean;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>()${V}`]: (s) => { s.$v = 0; }, [`<init>(${Z})${V}`]: (s, v) => { s.$v = v ? 1 : 0; }, [`get()${Z}`]: (s) => s.$v, [`set(${Z})${V}`]: (s, v) => { s.$v = v ? 1 : 0; } } });
  R.def('Ljava/util/concurrent/ConcurrentHashMap;', { access: 0x21, sup: 'Ljava/util/HashMap;' });
  R.def('Ljava/util/concurrent/CopyOnWriteArrayList;', { access: 0x21, sup: 'Ljava/util/ArrayList;' });
  R.def('Ljava/util/concurrent/Executor;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/Executors;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/Future;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/Callable;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/CountDownLatch;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>(${I})${V}`]: () => {}, [`countDown()${V}`]: () => {}, [`await()${V}`]: () => {} } });
  R.def('Ljava/lang/ref/WeakReference;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/Object;)' + V]: (s, o) => { s.$o = o; }, ['get()' + O]: (s) => s.$o } });
  R.def('Ljava/lang/ref/SoftReference;', { access: 0x21, sup: 'Ljava/lang/ref/WeakReference;' });

  /* ---- java.text / java.io ---- */
  R.def('Ljava/text/DecimalFormat;', { access: 0x21, sup: 'Ljava/text/NumberFormat;', m: { [`<init>()${V}`]: () => {}, [`<init>(${S})${V}`]: (s, p) => { s.$p = p; }, [`format(${D})${S}`]: (s, v) => (s.$p ? javaFormat(s.$p.replace(/#/g, '%s').replace(/0\.0*/g, '%.1f'), [v]) : String(v)), [`format(${O})${S}`]: (s, v) => String(v) } });
  R.def('Ljava/text/NumberFormat;', { access: 0x421, sup: 'Ljava/text/Format;', sm: { ['getInstance()Ljava/text/NumberFormat;']: () => ({ $c: R.klass('Ljava/text/DecimalFormat;') }) }, m: { [`format(${D})${S}`]: (s, v) => String(v), [`format(${J})${S}`]: (s, v) => String(v) } });
  R.def('Ljava/text/Format;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/text/SimpleDateFormat;', { access: 0x21, sup: 'Ljava/text/DateFormat;', m: { [`<init>()${V}`]: () => {}, [`<init>(${S})${V}`]: (s, p) => { s.$p = p; }, [`<init>(${S}Ljava/util/Locale;)${V}`]: (s, p) => { s.$p = p; }, ['format(Ljava/util/Date;)' + S]: (s, d) => formatDate(s.$p, d && d.$t !== undefined ? d.$t : Date.now()), [`format(${J})${S}`]: (s, t) => formatDate(s.$p, Number(t)), ['parse(Ljava/lang/String;)Ljava/util/Date;']: (s, str) => ({ $c: R.klass('Ljava/util/Date;'), $t: Date.parse(str) || Date.now() }) } });
  R.def('Ljava/text/DateFormat;', { access: 0x421, sup: 'Ljava/text/Format;', sm: { ['getDateInstance()Ljava/text/DateFormat;']: () => ({ $c: R.klass('Ljava/text/SimpleDateFormat;'), $p: 'yyyy-MM-dd' }), ['getDateTimeInstance()Ljava/text/DateFormat;']: () => ({ $c: R.klass('Ljava/text/SimpleDateFormat;'), $p: 'yyyy-MM-dd HH:mm' }) } });
  function formatDate(pattern, t) {
    const d = new Date(t);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return String(pattern || 'yyyy-MM-dd HH:mm:ss')
      .replace(/yyyy/g, d.getFullYear()).replace(/yy/g, p(d.getFullYear() % 100))
      .replace(/MM/g, p(d.getMonth() + 1)).replace(/dd/g, p(d.getDate()))
      .replace(/HH/g, p(d.getHours())).replace(/hh/g, p(d.getHours() % 12 || 12))
      .replace(/mm/g, p(d.getMinutes())).replace(/ss/g, p(d.getSeconds()))
      .replace(/SSS/g, p(d.getMilliseconds(), 3)).replace(/a/g, d.getHours() < 12 ? 'AM' : 'PM');
  }
  R.def('Ljava/io/InputStream;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { [`read()${I}`]: () => -1, ['read([B)' + I]: () => -1, ['read([BII)' + I]: () => -1, ['close()' + V]: () => {}, ['available()' + I]: () => 0 } });
  R.def('Ljava/io/OutputStream;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/ByteArrayInputStream;', { access: 0x21, sup: 'Ljava/io/InputStream;', m: { ['<init>([B)' + V]: (s, b) => { s.$b = b; s.$p = 0; }, ['read()' + I]: (s) => (s.$p < s.$b.length ? s.$b[s.$p++] & 0xff : -1), ['read([BII)' + I]: (s, arr2, off, len) => { let n = 0; while (n < len && s.$p < s.$b.length) { arr2[off + n] = s.$b[s.$p++]; n++; } return n || -1; }, ['available()' + I]: (s) => s.$b.length - s.$p } });
  R.def('Ljava/io/ByteArrayOutputStream;', { access: 0x21, sup: 'Ljava/io/OutputStream;', m: { ['<init>()' + V]: (s) => { s.$b = []; }, ['write(I)' + V]: (s, v) => { s.$b.push(v & 0xff); }, ['write([BII)' + V]: (s, a, o, l) => { for (let i = 0; i < l; i++) s.$b.push(a[o + i] & 0xff); }, ['toByteArray()[B']: (s) => arr(R, '[B', s.$b), ['toString()' + S]: (s) => bytesToString(s.$b), ['size()' + I]: (s) => s.$b.length } });
  R.def('Ljava/io/File;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>(${S})${V}`]: (s, p) => { s.$p = p; }, [`getAbsolutePath()${S}`]: (s) => s.$p, [`getPath()${S}`]: (s) => s.$p, [`getName()${S}`]: (s) => String(s.$p).split('/').pop(), [`exists()${Z}`]: () => 0, [`toString()${S}`]: (s) => s.$p } });
  R.def('Ljava/io/IOException;', { access: 0x21, sup: 'Ljava/lang/Exception;', m: { [`<init>()${V}`]: () => {}, [`<init>(${S})${V}`]: (s, m) => { s.$message = m; } } });
  R.def('Ljava/io/Closeable;', { access: 0x601, sup: 'Ljava/lang/AutoCloseable;' });
  R.def('Ljava/net/URI;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>(${S})${V}`]: (s, u) => { s.$u = u; }, [`toString()${S}`]: (s) => s.$u } });
  R.def('Ljava/net/URL;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { [`<init>(${S})${V}`]: (s, u) => { s.$u = u; }, [`toString()${S}`]: (s) => s.$u, [`toURI()Ljava/net/URI;`]: (s) => ({ $c: R.klass('Ljava/net/URI;'), $u: s.$u }) } });
  R.def('Ljava/net/URLEncoder;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { [`encode(${S})${S}`]: (s) => encodeURIComponent(s), [`encode(${S}${S})${S}`]: (s) => encodeURIComponent(s) } });
  R.def('Ljava/net/URLDecoder;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { [`decode(${S})${S}`]: (s) => { try { return decodeURIComponent(s); } catch { return s; } }, [`decode(${S}${S})${S}`]: (s) => { try { return decodeURIComponent(s); } catch { return s; } } } });

  /* ===================================================== android.* ==== */
  R.def('Landroid/util/Log;', {
    access: 0x11, sup: 'Ljava/lang/Object;',
    sm: {
      [`v(${S}${S})${I}`]: (t, m) => { L('V', t, m); return 0; },
      [`v(${S}${S}Ljava/lang/Throwable;)${I}`]: (t, m, tr) => { L('V', t, m, tr); return 0; },
      [`d(${S}${S})${I}`]: (t, m) => { L('D', t, m); return 0; },
      [`d(${S}${S}Ljava/lang/Throwable;)${I}`]: (t, m, tr) => { L('D', t, m, tr); return 0; },
      [`i(${S}${S})${I}`]: (t, m) => { L('I', t, m); return 0; },
      [`i(${S}${S}Ljava/lang/Throwable;)${I}`]: (t, m, tr) => { L('I', t, m, tr); return 0; },
      [`w(${S}${S})${I}`]: (t, m) => { L('W', t, m); return 0; },
      [`w(${S}${S}Ljava/lang/Throwable;)${I}`]: (t, m, tr) => { L('W', t, m, tr); return 0; },
      [`w(${S}Ljava/lang/Throwable;)${I}`]: (t, tr) => { L('W', t, tr ? R.messageOf(tr) : '', tr); return 0; },
      [`e(${S}${S})${I}`]: (t, m) => { L('E', t, m); return 0; },
      [`e(${S}${S}Ljava/lang/Throwable;)${I}`]: (t, m, tr) => { L('E', t, m, tr); return 0; },
      [`wtf(${S}${S})${I}`]: (t, m) => { L('E', t, 'WTF: ' + m); return 0; },
      [`println(${I}${S}${S})${I}`]: (p, t, m) => { L(['V', 'D', 'I', 'W', 'E', 'A'][p] || 'I', t, m); return 0; },
      [`isLoggable(${S}${I})${Z}`]: () => 1,
      [`getStackTraceString(Ljava/lang/Throwable;)${S}`]: (tr) => (tr ? `${R.classNameOf(tr)}: ${R.messageOf(tr)}` : ''),
    },
  });
  R.def('Landroid/util/TypedValue;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/util/TypedValue;->COMPLEX_UNIT_DIP:I': 1, 'Landroid/util/TypedValue;->COMPLEX_UNIT_PX:I': 0, 'Landroid/util/TypedValue;->COMPLEX_UNIT_SP:I': 2 }, sm: { [`applyDimension(${I}${F}Landroid/util/DisplayMetrics;)${F}`]: (u, v) => Math.fround(u === 0 ? v : v * 1) } });
  R.def('Landroid/util/DisplayMetrics;', { access: 0x11, sup: 'Ljava/lang/Object;', m: {}, fields: [['widthPixels', 'I'], ['heightPixels', 'I'], ['density', 'F'], ['densityDpi', 'I'], ['scaledDensity', 'F']] });
  R.def('Landroid/util/SparseArray;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>()${V}`]: (s) => { s.$m = new Map(); }, [`put(${I}${O})${V}`]: (s, k, v) => { s.$m.set(k | 0, v); }, [`get(${I})${O}`]: (s, k) => (s.$m.has(k | 0) ? s.$m.get(k | 0) : null), [`get(${I}${O})${O}`]: (s, k, d) => (s.$m.has(k | 0) ? s.$m.get(k | 0) : d), [`remove(${I})${V}`]: (s, k) => { s.$m.delete(k | 0); }, [`size()${I}`]: (s) => s.$m.size, [`keyAt(${I})${I}`]: (s, i) => [...s.$m.keys()][i], [`valueAt(${I})${O}`]: (s, i) => [...s.$m.values()][i], [`clear()${V}`]: (s) => s.$m.clear() } });
  R.def('Landroid/util/Pair;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/Object;Ljava/lang/Object;)' + V]: (s, a, b) => { s.$first = a; s.$second = b; } } });

  /* ---- android.os ---- */
  R.def('Landroid/os/Bundle;', {
    access: 0x31, sup: 'Landroid/os/BaseBundle;', ifaces: ['Ljava/lang/Cloneable;'],
    m: {
      [`<init>()${V}`]: (s) => { s.$m = new Map(); },
      ['<init>(Landroid/os/Bundle;)' + V]: (s, o) => { s.$m = new Map(o && o.$m ? o.$m : []); },
      [`<init>(${I})${V}`]: (s) => { s.$m = new Map(); },
      [`putString(${S}${S})${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`getString(${S})${S}`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : null),
      [`getString(${S}${S})${S}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) : d),
      [`putInt(${S}${I})${V}`]: (s, k, v) => { s.$m.set(k, v | 0); },
      [`getInt(${S})${I}`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) | 0 : 0),
      [`getInt(${S}${I})${I}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) | 0 : d),
      [`putBoolean(${S}${Z})${V}`]: (s, k, v) => { s.$m.set(k, v ? 1 : 0); },
      [`getBoolean(${S})${Z}`]: (s, k) => (s.$m.get(k) ? 1 : 0),
      [`putLong(${S}${J})${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`getLong(${S})${J}`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : 0),
      [`putFloat(${S}${F})${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`putDouble(${S}${D})${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`putSerializable(${S}Ljava/io/Serializable;)${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`getSerializable(${S})Ljava/io/Serializable;`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : null),
      [`putBundle(${S}Landroid/os/Bundle;)${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`getBundle(${S})Landroid/os/Bundle;`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : null),
      [`putStringArrayList(${S}Ljava/util/ArrayList;)${V}`]: (s, k, v) => { s.$m.set(k, v); },
      [`getStringArrayList(${S})Ljava/util/ArrayList;`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : null),
      ['putAll(Landroid/os/Bundle;)' + V]: (s, o) => { if (o && o.$m) for (const [k, v] of o.$m) s.$m.set(k, v); },
      [`containsKey(${S})${Z}`]: (s, k) => BOOL(s.$m.has(k)),
      [`remove(${S})${V}`]: (s, k) => { s.$m.delete(k); },
      [`clear()${V}`]: (s) => s.$m.clear(),
      [`size()${I}`]: (s) => s.$m.size,
      [`isEmpty()${Z}`]: (s) => BOOL(s.$m.size === 0),
      [`keySet()Ljava/util/Set;`]: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [...s.$m.keys()] }),
      [`toString()${S}`]: (s) => `Bundle{${[...s.$m.keys()].join(', ')}}`,
    },
  });
  R.def('Landroid/os/BaseBundle;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Parcelable;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Handler;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>()${V}`]: () => {},
      ['<init>(Landroid/os/Looper;)' + V]: () => {},
      ['<init>(Landroid/os/Handler$Callback;)' + V]: () => {},
      ['post(Ljava/lang/Runnable;)' + Z]: (s, r) => { H.post(() => safeRun(R, r)); return 1; },
      ['postDelayed(Ljava/lang/Runnable;' + J + ')' + Z]: (s, r, d) => { H.postDelayed(() => safeRun(R, r), Number(d)); return 1; },
      ['postAtTime(Ljava/lang/Runnable;' + J + ')' + Z]: (s, r) => { H.post(() => safeRun(R, r)); return 1; },
      ['sendMessage(Landroid/os/Message;)' + Z]: (s, m) => { H.post(() => { if (m && m.$target) safeRun(R, m.$target); }); return 1; },
      ['sendMessageDelayed(Landroid/os/Message;' + J + ')' + Z]: (s, m, d) => { H.postDelayed(() => { if (m && m.$callback) safeRun(R, m.$callback); }, Number(d)); return 1; },
      ['sendEmptyMessage(I)' + Z]: () => 1,
      ['sendEmptyMessageDelayed(I' + J + ')' + Z]: () => 1,
      ['removeCallbacks(Ljava/lang/Runnable;)' + V]: () => {},
      ['removeCallbacksAndMessages(' + O + ')' + V]: () => {},
      ['hasMessages(I)' + Z]: () => 0,
      ['getLooper()Landroid/os/Looper;']: () => ({ $c: R.klass('Landroid/os/Looper;') }),
    },
  });
  function safeRun(R, r) { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { L('E', 'Runnable', R.messageOf(e), e); if (H.onCrash) H.onCrash(e); } }
  R.def('Landroid/os/Looper;', { access: 0x31, sup: 'Ljava/lang/Object;', m: {}, sm: { ['getMainLooper()Landroid/os/Looper;']: () => ({ $c: R.klass('Landroid/os/Looper;') }), ['myLooper()Landroid/os/Looper;']: () => ({ $c: R.klass('Landroid/os/Looper;') }), ['prepare()' + V]: () => {}, ['loop()' + V]: () => {} } });
  R.def('Landroid/os/Message;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {}, sm: { ['obtain()Landroid/os/Message;']: () => ({ $c: R.klass('Landroid/os/Message;') }) } });
  R.def('Landroid/os/SystemClock;', { access: 0x11, sup: 'Ljava/lang/Object;', sm: { [`currentTimeMillis()${J}`]: () => Date.now(), [`uptimeMillis()${J}`]: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), [`elapsedRealtime()${J}`]: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), [`sleep(${J})${V}`]: () => {} } });
  R.def('Landroid/os/Build;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/os/Build;->MODEL:Ljava/lang/String;': 'Dex2Web', 'Landroid/os/Build;->MANUFACTURER:Ljava/lang/String;': 'Dex2Web', 'Landroid/os/Build;->BRAND:Ljava/lang/String;': 'generic', 'Landroid/os/Build;->DEVICE:Ljava/lang/String;': 'browser', 'Landroid/os/Build;->PRODUCT:Ljava/lang/String;': 'dex2web', 'Landroid/os/Build;->HARDWARE:Ljava/lang/String;': 'wasm', 'Landroid/os/Build;->FINGERPRINT:Ljava/lang/String;': 'dex2web/generic:13/TQ3A.230901.001/1:user/release-keys', 'Landroid/os/Build;->ID:Ljava/lang/String;': 'TQ3A.230901.001', 'Landroid/os/Build;->HOST:Ljava/lang/String;': 'dex2web', [`Landroid/os/Build;->SERIAL:${S}`]: 'unknown' } });
  R.def('Landroid/os/Build$VERSION;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/os/Build$VERSION;->SDK_INT:I': 33, 'Landroid/os/Build$VERSION;->RELEASE:Ljava/lang/String;': '13', 'Landroid/os/Build$VERSION;->CODENAME:Ljava/lang/String;': 'REL', 'Landroid/os/Build$VERSION;->INCREMENTAL:Ljava/lang/String;': '1' } });
  R.def('Landroid/os/Build$VERSION_CODES;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: Object.fromEntries([['BASE', 1], ['CUPCAKE', 3], ['DONUT', 4], ['ECLAIR', 5], ['FROYO', 8], ['GINGERBREAD', 9], ['HONEYCOMB', 11], ['ICE_CREAM_SANDWICH', 14], ['JELLY_BEAN', 16], ['KITKAT', 19], ['LOLLIPOP', 21], ['MARSHMALLOW', 23], ['NOUGAT', 24], ['OREO', 26], ['PIE', 28], ['Q', 29], ['R', 30], ['S', 31], ['TIRAMISU', 33]].map(([k, v]) => [`Landroid/os/Build$VERSION_CODES;->${k}:I`, v])) });
  R.def('Landroid/os/AsyncTask;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {} }, sm: { ['execute([Ljava/lang/Object;)Landroid/os/AsyncTask;']: () => null } });
  R.def('Landroid/os/Vibrator;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['vibrate(' + J + ')' + V]: () => {}, ['hasVibrator()' + Z]: () => 0 } });
  R.def('Landroid/os/Environment;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getExternalStorageDirectory()Ljava/io/File;']: () => ({ $c: R.klass('Ljava/io/File;'), $p: '/sdcard' }) } });

  /* ---- android.content ---- */
  R.def('Landroid/net/Uri;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      [`toString()${S}`]: (s) => s.$u || '',
      [`getScheme()${S}`]: (s) => { const m = /^([a-zA-Z][\w+.-]*):/.exec(s.$u || ''); return m ? m[1] : null; },
      [`getHost()${S}`]: (s) => { try { return new URL(s.$u).hostname; } catch { return null; } },
      [`getPath()${S}`]: (s) => { try { return new URL(s.$u).pathname; } catch { return null; } },
      [`getLastPathSegment()${S}`]: (s) => { const p = (s.$u || '').split('/').filter(Boolean); return p.length ? p[p.length - 1] : null; },
      [`getQueryParameter(${S})${S}`]: (s, k) => { try { return new URL(s.$u).searchParams.get(k); } catch { return null; } },
      ['buildUpon()Landroid/net/Uri$Builder;']: (s) => ({ $c: R.klass('Landroid/net/Uri$Builder;'), $u: s.$u }),
    },
    sm: {
      [`parse(${S})Landroid/net/Uri;`]: (u) => ({ $c: R.klass('Landroid/net/Uri;'), $u: u }),
      [`fromFile(Ljava/io/File;)Landroid/net/Uri;`]: (f) => ({ $c: R.klass('Landroid/net/Uri;'), $u: 'file://' + (f ? f.$p : '') }),
      },
  });
  R.klass('Landroid/net/Uri;').statics['Landroid/net/Uri;->EMPTY:Landroid/net/Uri;'] = null;
  R.def('Landroid/net/Uri$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`toString()${S}`]: (s) => s.$u || '', [`build()Landroid/net/Uri;`]: (s) => ({ $c: R.klass('Landroid/net/Uri;'), $u: s.$u || '' }), [`appendPath(${S})Landroid/net/Uri$Builder;`]: (s, p) => { s.$u = (s.$u || '') + '/' + p; return s; }, [`appendQueryParameter(${S}${S})Landroid/net/Uri$Builder;`]: (s, k, v) => { s.$u = (s.$u || '') + (s.$u.includes('?') ? '&' : '?') + `${k}=${v}`; return s; }, [`scheme(${S})Landroid/net/Uri$Builder;`]: (s, sc) => { s.$u = sc + ':' + String(s.$u || '').replace(/^[^:]*:/, ''); return s; } } });
  R.def('Landroid/content/Intent;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`<init>()${V}`]: (s) => { s.$extras = new Map(); },
      [`<init>(${S})${V}`]: (s, a) => { s.$action = a; s.$extras = new Map(); },
      [`<init>(${S}Landroid/net/Uri;)${V}`]: (s, a, u) => { s.$action = a; s.$data = u; s.$extras = new Map(); },
      ['<init>(Landroid/content/Context;Ljava/lang/Class;)' + V]: (s, ctx, cls) => { s.$cls = cls; s.$extras = new Map(); },
      [`<init>(Landroid/content/Intent;)${V}`]: (s, o) => { s.$action = o.$action; s.$data = o.$data; s.$extras = new Map(o.$extras); },
      [`setAction(${S})Landroid/content/Intent;`]: (s, a) => { s.$action = a; return s; },
      [`getAction()${S}`]: (s) => s.$action || null,
      ['setData(Landroid/net/Uri;)Landroid/content/Intent;']: (s, u) => { s.$data = u; return s; },
      ['getData()Landroid/net/Uri;']: (s) => s.$data || null,
      ['getDataString()' + S]: (s) => (s.$data ? s.$data.$u : null),
      ['putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; },
      ['putExtra(Ljava/lang/String;I)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v | 0); return s; },
      ['putExtra(Ljava/lang/String;Z)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v ? 1 : 0); return s; },
      ['putExtra(Ljava/lang/String;J)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; },
      ['putExtra(Ljava/lang/String;Landroid/os/Parcelable;)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; },
      ['getStringExtra(Ljava/lang/String;)' + S]: (s, k) => (s.$extras.has(k) ? s.$extras.get(k) : null),
      ['getIntExtra(Ljava/lang/String;I)' + I]: (s, k, d) => (s.$extras.has(k) ? s.$extras.get(k) | 0 : d),
      ['getBooleanExtra(Ljava/lang/String;Z)' + Z]: (s, k, d) => (s.$extras.has(k) ? s.$extras.get(k) : d),
      ['getLongExtra(Ljava/lang/String;J)' + J]: (s, k, d) => (s.$extras.has(k) ? s.$extras.get(k) : d),
      ['getExtras()Landroid/os/Bundle;']: (s) => { const b = { $c: R.klass('Landroid/os/Bundle;'), $m: new Map(s.$extras) }; return b; },
      ['hasExtra(Ljava/lang/String;)' + Z]: (s, k) => BOOL(s.$extras.has(k)),
      ['addFlags(I)Landroid/content/Intent;']: (s, f) => { s.$flags = (s.$flags || 0) | f; return s; },
      ['setFlags(I)Landroid/content/Intent;']: (s, f) => { s.$flags = f; return s; },
      ['getFlags()' + I]: (s) => s.$flags || 0,
      ['setClass(Landroid/content/Context;Ljava/lang/Class;)Landroid/content/Intent;']: (s, c, cls) => { s.$cls = cls; return s; },
      ['setClassName(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;']: (s, p, n) => { s.$clsName = n; return s; },
      ['getComponent()Landroid/content/ComponentName;']: (s) => s.$component || (s.$clsName ? { $c: R.klass('Landroid/content/ComponentName;'), $n: s.$clsName } : null),
      ['getCategories()Ljava/util/Set;']: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: (s.$categories || []).slice() }),
      ['hasCategory(Ljava/lang/String;)' + Z]: (s, c) => BOOL((s.$categories || []).includes(String(c))),
      ['getStringExtra(Ljava/lang/String;)' + S]: (s, k) => (s.$extras && s.$extras.has(k) ? s.$extras.get(k) : null),
      ['setType(Ljava/lang/String;)Landroid/content/Intent;']: (s, t) => { s.$type = t; return s; },
      ['getType()' + S]: (s) => s.$type || null,
      ['addCategory(Ljava/lang/String;)Landroid/content/Intent;']: (s) => s,
      ['putExtras(Landroid/os/Bundle;)Landroid/content/Intent;']: (s, b) => { if (b && b.$m) for (const [k, v] of b.$m) s.$extras.set(k, v); return s; },
      ['resolveActivity(Landroid/content/pm/PackageManager;)Landroid/content/ComponentName;']: () => null,
      ['toString()' + S]: (s) => `Intent{${s.$action || ''} ${s.$data ? s.$data.$u : ''}}`,
    },
    sm: {
      [`createChooser(Landroid/content/Intent;${S})Landroid/content/Intent;`]: (i) => i,
    },
  });
  R.def('Landroid/content/ComponentName;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { [`<init>(${S}${S})${V}`]: (s, p, n) => { s.$p = p; s.$n = n; }, [`getClassName()${S}`]: (s) => s.$n, [`getPackageName()${S}`]: (s) => s.$p, [`toString()${S}`]: (s) => `${s.$p}/${s.$n}` } });
  R.def('Landroid/content/ContentValues;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { [`<init>()${V}`]: (s) => { s.$m = new Map(); }, [`put(${S}${S})${V}`]: (s, k, v) => { s.$m.set(k, v); }, [`put(${S}${I})${V}`]: (s, k, v) => { s.$m.set(k, v); }, [`getAsString(${S})${S}`]: (s, k) => (s.$m.has(k) ? s.$m.get(k) : null), [`size()${I}`]: (s) => s.$m.size, [`clear()${V}`]: (s) => s.$m.clear() } });
  R.def('Landroid/content/SharedPreferences;', {
    access: 0x601, sup: 'Ljava/lang/Object;',
    m: {
      [`getString(${S}${S})${S}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) : d),
      [`getInt(${S}${I})${I}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) | 0 : d),
      [`getBoolean(${S}${Z})${Z}`]: (s, k, d) => (s.$m.has(k) ? (s.$m.get(k) ? 1 : 0) : d),
      [`getFloat(${S}${F})${F}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) : d),
      [`getLong(${S}${J})${J}`]: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) : d),
      [`contains(${S})${Z}`]: (s, k) => BOOL(s.$m.has(k)),
      ['getAll()Ljava/util/Map;']: (s) => { const m = new Map(); for (const [k, v] of s.$m) m.set(normKey(k), { k, v }); return { $c: R.klass('Ljava/util/HashMap;'), $m: m }; },
      ['edit()Landroid/content/SharedPreferences$Editor;']: (s) => ({ $c: R.klass('Landroid/content/SharedPreferences$Editor;'), $sp: s, $pend: new Map(), $del: new Set() }),
      ['getStringSet(Ljava/lang/String;Ljava/util/Set;)Ljava/util/Set;']: (s, k, d) => (s.$m.has(k) ? s.$m.get(k) : d),
    },
  });
  R.def('Landroid/content/SharedPreferences$Editor;', {
    access: 0x601, sup: 'Ljava/lang/Object;',
    m: {
      ['putString(Ljava/lang/String;Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;']: (s, k, v) => { s.$pend.set(k, v); return s; },
      ['putInt(Ljava/lang/String;I)Landroid/content/SharedPreferences$Editor;']: (s, k, v) => { s.$pend.set(k, v | 0); return s; },
      ['putBoolean(Ljava/lang/String;Z)Landroid/content/SharedPreferences$Editor;']: (s, k, v) => { s.$pend.set(k, !!v); return s; },
      ['putFloat(Ljava/lang/String;F)Landroid/content/SharedPreferences$Editor;']: (s, k, v) => { s.$pend.set(k, v); return s; },
      ['putLong(Ljava/lang/String;J)Landroid/content/SharedPreferences$Editor;']: (s, k, v) => { s.$pend.set(k, v); return s; },
      ['remove(Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;']: (s, k) => { s.$del.add(k); return s; },
      ['clear()Landroid/content/SharedPreferences$Editor;']: (s) => { s.$clear = true; return s; },
      ['apply()' + V]: (s) => commitPrefs(s),
      ['commit()' + Z]: (s) => { commitPrefs(s); return 1; },
    },
  });
  function commitPrefs(s) {
    const sp = s.$sp;
    if (s.$clear) sp.$m.clear();
    for (const k of s.$del) sp.$m.delete(k);
    for (const [k, v] of s.$pend) sp.$m.set(k, v);
    H.persistPrefs(sp.$name, sp.$m);
  }
  R.def('Landroid/content/pm/PackageManager;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;']: () => null, ['resolveActivity(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;']: () => null } });
  R.def('Landroid/content/pm/PackageInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/ResolveInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/ApplicationInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/ServiceConnection;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/BroadcastReceiver;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {} } });
  R.def('Landroid/content/ContextWrapper;', { access: 0x21, sup: 'Landroid/content/Context;' });
  R.def('Landroid/content/res/AssetManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['open(Ljava/lang/String;)Ljava/io/InputStream;']: (s, n) => H.openAsset(n) } });
  R.def('Landroid/content/res/Resources;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      [`getString(${I})${S}`]: (s, id) => H.resString(id),
      [`getString(${I}[Ljava/lang/Object;)${S}`]: (s, id, args) => javaFormat(H.resString(id) || '', (args || []).map((a) => a)),
      [`getText(${I})Ljava/lang/CharSequence;`]: (s, id) => H.resString(id),
      [`getColor(${I})${I}`]: (s, id) => H.resColor(id),
      ['getColor(ILandroid/content/res/Resources$Theme;)' + I]: (s, id) => H.resColor(id),
      [`getDimension(${I})${F}`]: (s, id) => Math.fround(H.resDimen(id)),
      [`getDimensionPixelSize(${I})${I}`]: (s, id) => Math.round(H.resDimen(id)),
      [`getDimensionPixelOffset(${I})${I}`]: (s, id) => Math.floor(H.resDimen(id)),
      ['getDrawable(I)Landroid/graphics/drawable/Drawable;']: (s, id) => H.resDrawable(id),
      ['getDrawable(ILandroid/content/res/Resources$Theme;)Landroid/graphics/drawable/Drawable;']: (s, id) => H.resDrawable(id),
      ['getStringArray(I)[Ljava/lang/String;']: (s, id) => arr(R, '[Ljava/lang/String;', H.resStringArray(id) || []),
      ['getIntArray(I)[I']: (s, id) => arr(R, '[I', H.resIntArray(id) || []),
      ['getIdentifier(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)' + I]: (s, n, t, p) => H.resIdentifier(n, t),
      ['getDisplayMetrics()Landroid/util/DisplayMetrics;']: () => H.displayMetrics(),
      ['getAssets()Landroid/content/res/AssetManager;']: () => ({ $c: R.klass('Landroid/content/res/AssetManager;') }),
      ['getConfiguration()Landroid/content/res/Configuration;']: () => ({ $c: R.klass('Landroid/content/res/Configuration;') }),
      ['openRawResource(I)Ljava/io/InputStream;']: (s, id) => H.openRawResource(id),
      ['getBoolean(I)' + Z]: (s, id) => BOOL(H.resBoolean(id)),
      ['getInteger(I)' + I]: (s, id) => H.resInt(id),
      ['getLayout(I)Landroid/content/res/XmlResourceParser;']: (s, id) => H.resLayoutParser(id),
      ['getAnimation(I)Landroid/content/res/XmlResourceParser;']: () => null,
      ['obtainTypedArray(I)Landroid/content/res/TypedArray;']: (s, id) => H.typedArray(id),
      ['newTheme()Landroid/content/res/Resources$Theme;']: () => ({ $c: R.klass('Landroid/content/res/Resources$Theme;') }),
    },
  });
  R.def('Landroid/content/res/Resources$Theme;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['applyStyle(IZ)' + V]: () => {} } });
  R.def('Landroid/content/res/Configuration;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {}, fields: [['orientation', 'I'], ['screenWidthDp', 'I'], ['screenHeightDp', 'I']] });
  R.def('Landroid/content/res/XmlResourceParser;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/res/TypedArray;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getString(I)' + S]: (s, i) => (s.$vals && i < s.$vals.length ? R.str(s.$vals[i]) : null),
      ['getColor(II)' + I]: (s, i, d) => (s.$vals && i < s.$vals.length ? s.$vals[i] : d),
      ['getDimension(IF)' + F]: (s, i, d) => Math.fround(s.$vals && i < s.$vals.length ? s.$vals[i] : d),
      ['getDimensionPixelSize(II)' + I]: (s, i, d) => Math.round(s.$vals && i < s.$vals.length ? s.$vals[i] : d),
      ['getInt(II)' + I]: (s, i, d) => (s.$vals && i < s.$vals.length ? s.$vals[i] : d),
      ['getBoolean(IZ)' + Z]: (s, i, d) => (s.$vals && i < s.$vals.length ? BOOL(s.$vals[i]) : d),
      ['getDrawable(I)Landroid/graphics/drawable/Drawable;']: (s, i) => (s.$vals && i < s.$vals.length ? s.$vals[i] : null),
      ['hasValue(I)' + Z]: (s, i) => BOOL(s.$vals && i < s.$vals.length && s.$vals[i] !== null && s.$vals[i] !== undefined),
      ['recycle()' + V]: () => {},
      ['length()' + I]: (s) => (s.$vals ? s.$vals.length : 0),
      ['getResourceId(II)' + I]: (s, i, d) => d,
      ['getText(I)Ljava/lang/CharSequence;']: (s, i) => (s.$vals && i < s.$vals.length ? R.str(s.$vals[i]) : null),
    },
  });
  R.def('Landroid/content/res/ColorStateList;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['valueOf(I)Landroid/content/res/ColorStateList;']: (c) => ({ $c: R.klass('Landroid/content/res/ColorStateList;'), $color: c }) }, m: { ['getDefaultColor(I)' + I]: (s, d) => (s.$color === undefined ? d : s.$color) } });

  R.def('Landroid/content/Context;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      [`getPackageName()${S}`]: (s) => H.packageName,
      [`getResources()Landroid/content/res/Resources;`]: () => H.resources(),
      ['getAssets()Landroid/content/res/AssetManager;']: () => ({ $c: R.klass('Landroid/content/res/AssetManager;') }),
      [`getString(${I})${S}`]: (s, id) => H.resString(id),
      [`getString(${I}[Ljava/lang/Object;)${S}`]: (s, id, args) => javaFormat(H.resString(id) || '', args || []),
      [`getText(${I})Ljava/lang/CharSequence;`]: (s, id) => H.resString(id),
      [`getColor(${I})${I}`]: (s, id) => H.resColor(id),
      ['getApplicationContext()Landroid/content/Context;']: (s) => s,
      ['getSystemService(Ljava/lang/String;)' + O]: (s, name) => H.systemService(name),
      ['getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;']: (s, name) => H.prefs(name),
      ['getSharedPreferences(Ljava/io/File;I)Landroid/content/SharedPreferences;']: (s, f) => H.prefs(f ? f.$p : 'default'),
      ['startActivity(Landroid/content/Intent;)' + V]: (s, i) => H.startActivity(i),
      ['startActivityForResult(Landroid/content/Intent;I)' + V]: (s, i, rc) => H.startActivity(i),
      ['startService(Landroid/content/Intent;)Landroid/content/ComponentName;']: (s, i) => { L('I', 'Context', `startService(${i ? R.str(i) : 'null'}) — not supported in browser`); return null; },
      ['stopService(Landroid/content/Intent;)' + Z]: () => 0,
      ['bindService(Landroid/content/Intent;Landroid/content/ServiceConnection;I)' + Z]: () => 0,
      ['sendBroadcast(Landroid/content/Intent;)' + V]: (s, i) => { L('I', 'Context', `sendBroadcast(${i ? i.$action : ''}) — no-op`); },
      ['getPackageManager()Landroid/content/pm/PackageManager;']: () => ({ $c: R.klass('Landroid/content/pm/PackageManager;') }),
      ['getContentResolver()Landroid/content/ContentResolver;']: () => ({ $c: R.klass('Landroid/content/ContentResolver;') }),
      ['getMainExecutor()Ljava/util/concurrent/Executor;']: () => ({ $c: R.klass('Ljava/util/concurrent/Executor;') }),
      ['getSystemServiceName(Ljava/lang/Class;)' + S]: () => null,
      ['obtainStyledAttributes([I)Landroid/content/res/TypedArray;']: () => ({ $c: R.klass('Landroid/content/res/TypedArray;'), $vals: [] }),
      ['obtainStyledAttributes(Landroid/util/AttributeSet;[I)Landroid/content/res/TypedArray;']: () => ({ $c: R.klass('Landroid/content/res/TypedArray;'), $vals: [] }),
      ['getFilesDir()Ljava/io/File;']: () => ({ $c: R.klass('Ljava/io/File;'), $p: '/data/files' }),
      ['getCacheDir()Ljava/io/File;']: () => ({ $c: R.klass('Ljava/io/File;'), $p: '/data/cache' }),
      ['getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;']: () => ({ $c: R.klass('Ljava/io/File;'), $p: '/sdcard' }),
      ['getTheme()Landroid/content/res/Resources$Theme;']: () => ({ $c: R.klass('Landroid/content/res/Resources$Theme;') }),
      ['registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;)Landroid/content/Intent;']: () => null,
      ['unregisterReceiver(Landroid/content/BroadcastReceiver;)' + V]: () => {},
      ['checkSelfPermission(Ljava/lang/String;)' + I]: () => 0,
      ['getPackageName()' + S]: () => H.packageName,
    },
    statics: {
      'Landroid/content/Context;->LAYOUT_INFLATER_SERVICE:Ljava/lang/String;': 'layout_inflater',
      'Landroid/content/Context;->WINDOW_SERVICE:Ljava/lang/String;': 'window',
      'Landroid/content/Context;->ALARM_SERVICE:Ljava/lang/String;': 'alarm',
      'Landroid/content/Context;->VIBRATOR_SERVICE:Ljava/lang/String;': 'vibrator',
      'Landroid/content/Context;->ACTIVITY_SERVICE:Ljava/lang/String;': 'activity',
      'Landroid/content/Context;->KEYGUARD_SERVICE:Ljava/lang/String;': 'keyguard',
      'Landroid/content/Context;->NOTIFICATION_SERVICE:Ljava/lang/String;': 'notification',
      'Landroid/content/Context;->AUDIO_SERVICE:Ljava/lang/String;': 'audio',
      'Landroid/content/Context;->CLIPBOARD_SERVICE:Ljava/lang/String;': 'clipboard',
      'Landroid/content/Context;->LOCATION_SERVICE:Ljava/lang/String;': 'location',
      'Landroid/content/Context;->CONNECTIVITY_SERVICE:Ljava/lang/String;': 'connectivity',
      'Landroid/content/Context;->POWER_SERVICE:Ljava/lang/String;': 'power',
      'Landroid/content/Context;->INPUT_METHOD_SERVICE:Ljava/lang/String;': 'input_method',
      'Landroid/content/Context;->SENSOR_SERVICE:Ljava/lang/String;': 'sensor',
      'Landroid/content/Context;->WIFI_SERVICE:Ljava/lang/String;': 'wifi',
      'Landroid/content/Context;->MODE_PRIVATE:I': 0,
    },
  });
  R.def('Landroid/content/ContentResolver;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/IntentFilter;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { [`<init>()${V}`]: () => {}, [`<init>(${S})${V}`]: () => {}, [`addAction(${S})${V}`]: () => {} } });
  R.def('Landroid/content/ContextCompat;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getColor(Landroid/content/Context;I)' + I]: (c, id) => H.resColor(id), ['getDrawable(Landroid/content/Context;I)Landroid/graphics/drawable/Drawable;']: (c, id) => H.resDrawable(id), ['startActivity(Landroid/content/Context;Landroid/content/Intent;Landroid/os/Bundle;)' + V]: (c, i) => H.startActivity(i), ['checkSelfPermission(Landroid/content/Context;Ljava/lang/String;)' + I]: () => 0 } });
  R.def('Landroidx/core/content/ContextCompat;', { access: 0x21, sup: 'Landroid/content/ContextCompat;' });
  R.def('Landroid/app/Service;', { access: 0x21, sup: 'Landroid/content/ContextWrapper;', m: { ['<init>()' + V]: () => {} } });
  R.def('Landroid/app/Application;', { access: 0x21, sup: 'Landroid/content/ContextWrapper;', m: { ['<init>()' + V]: () => {}, ['onCreate()' + V]: () => {}, ['onTerminate()' + V]: () => {} } });

  /* ---- android.graphics ---- */
  R.def('Landroid/graphics/Color;', {
    access: 0x11, sup: 'Ljava/lang/Object;',
    sm: {
      [`parseColor(${S})${I}`]: (s) => parseColor(s),
      [`rgb(${I}${I}${I})${I}`]: (r, g, b) => (0xff000000 | (r << 16) | (g << 8) | b) | 0,
      [`argb(${I}${I}${I}${I})${I}`]: (a, r, g, b) => ((a << 24) | (r << 16) | (g << 8) | b) | 0,
      [`red(${I})${I}`]: (c) => (c >>> 16) & 0xff,
      [`green(${I})${I}`]: (c) => (c >>> 8) & 0xff,
      [`blue(${I})${I}`]: (c) => c & 0xff,
      [`alpha(${I})${I}`]: (c) => (c >>> 24) & 0xff,
      [`toArgb(${I})${I}`]: (c) => c | 0,
      [`HSVToColor([F)${I}`]: (hsv) => hsvToArgb(hsv),
      [`HSVToColor(${I}[F)${I}`]: (a, hsv) => hsvToArgb(hsv, a),
      [`colorToHSV(${I}[F)${V}`]: () => {},
      [`luminance(${I})${F}`]: (c) => Math.fround((((c >>> 16) & 0xff) * 0.2126 + ((c >>> 8) & 0xff) * 0.7152 + (c & 0xff) * 0.0722) / 255),
    },
  });
  function parseColor(s) {
    if (s == null) throw R.newException('Ljava/lang/IllegalArgumentException;', 'null color');
    s = String(s).trim();
    const named = { red: 0xffff0000, green: 0xff00ff00, blue: 0xff0000ff, black: 0xff000000, white: 0xffffffff, gray: 0xff888888, grey: 0xff888888, cyan: 0xff00ffff, magenta: 0xffff00ff, yellow: 0xffffff00, aqua: 0xff00ffff, fuchsia: 0xffff00ff, darkgray: 0xff444444, darkgrey: 0xff444444, lightgray: 0xffcccccc, lightgrey: 0xffcccccc, ltgray: 0xffcccccc, dkgray: 0xff444444, transparent: 0 };
    if (named[s.toLowerCase()] !== undefined) return named[s.toLowerCase()] | 0;
    if (s[0] === '#') {
      const h = s.slice(1);
      if (h.length === 6) return (0xff000000 | parseInt(h, 16)) | 0;
      if (h.length === 8) return parseInt(h, 16) | 0;
      if (h.length === 3) return (0xff000000 | parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16)) | 0;
    }
    throw R.newException('Ljava/lang/IllegalArgumentException;', `Unknown color: ${s}`);
  }
  function hsvToArgb(hsv, alpha = 255) {
    const h = hsv[0], s = hsv[1], v = hsv[2];
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return ((alpha << 24) | (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)) | 0;
  }
  R.def('Landroid/graphics/Paint;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$color = 0xff000000 | 0; s.$size = 12; }, ['<init>(I)' + V]: (s) => { s.$color = 0xff000000 | 0; s.$size = 12; }, ['setColor(I)' + V]: (s, c) => { s.$color = c | 0; }, ['getColor()' + I]: (s) => s.$color | 0, ['setTextSize(F)' + V]: (s, v) => { s.$size = v; }, ['getTextSize()' + F]: (s) => Math.fround(s.$size), ['setAntiAlias(Z)' + V]: () => {}, ['setStyle(Landroid/graphics/Paint$Style;)' + V]: (s, st) => { s.$style = st; }, ['setStrokeWidth(F)' + V]: (s, w) => { s.$w = w; }, ['measureText(Ljava/lang/String;)' + F]: (s, t) => Math.fround(String(t).length * (s.$size || 12) * 0.55), ['measureText(Ljava/lang/String;II)' + F]: (s, t, a, b) => Math.fround(String(t).slice(a, b).length * (s.$size || 12) * 0.55), ['setARGB(IIII)' + V]: (s, a, r, g, b) => { s.$color = ((a << 24) | (r << 16) | (g << 8) | b) | 0; }, ['setAlpha(I)' + V]: (s, a) => { s.$color = ((a << 24) | (s.$color & 0xffffff)) | 0; }, ['getAlpha()' + I]: (s) => (s.$color >>> 24) & 0xff, ['setTypeface(Landroid/graphics/Typeface;)Landroid/graphics/Typeface;']: (s, t) => t, ['setTextAlign(Landroid/graphics/Paint$Align;)' + V]: () => {}, ['descent()' + F]: (s) => Math.fround((s.$size || 12) * 0.25), ['ascent()' + F]: (s) => Math.fround(-(s.$size || 12) * 0.8), ['getFontMetrics(Landroid/graphics/Paint$FontMetrics;)' + F]: () => Math.fround(14) } });
  R.def('Landroid/graphics/Paint$Style;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/Paint$Align;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/Paint$FontMetrics;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/Typeface;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['create(Ljava/lang/String;I)Landroid/graphics/Typeface;']: () => ({ $c: R.klass('Landroid/graphics/Typeface;') }), ['defaultFromStyle(I)Landroid/graphics/Typeface;']: () => ({ $c: R.klass('Landroid/graphics/Typeface;') }), ['createFromAsset(Landroid/content/res/AssetManager;Ljava/lang/String;)Landroid/graphics/Typeface;']: () => ({ $c: R.klass('Landroid/graphics/Typeface;') }) } });
  R.def('Landroid/graphics/Rect;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$l = 0; s.$t = 0; s.$r = 0; s.$b = 0; }, ['<init>(IIII)' + V]: (s, l, t, r, b) => { s.$l = l; s.$t = t; s.$r = r; s.$b = b; }, ['width()' + I]: (s) => s.$r - s.$l, ['height()' + I]: (s) => s.$b - s.$t, ['set(IIII)' + V]: (s, l, t, r, b) => { s.$l = l; s.$t = t; s.$r = r; s.$b = b; }, ['contains(II)' + Z]: (s, x, y) => BOOL(x >= s.$l && x < s.$r && y >= s.$t && y < s.$b), ['toString()' + S]: (s) => `Rect(${s.$l}, ${s.$t} - ${s.$r}, ${s.$b})` }, fields: [['left', 'I'], ['top', 'I'], ['right', 'I'], ['bottom', 'I']] });
  R.def('Landroid/graphics/RectF;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$l = 0; s.$t = 0; s.$r = 0; s.$b = 0; }, ['<init>(FFFF)' + V]: (s, l, t, r, b) => { s.$l = l; s.$t = t; s.$r = r; s.$b = b; }, ['width()' + F]: (s) => Math.fround(s.$r - s.$l), ['height()' + F]: (s) => Math.fround(s.$b - s.$t) } });
  R.def('Landroid/graphics/Point;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$x = 0; s.$y = 0; }, ['<init>(II)' + V]: (s, x, y) => { s.$x = x; s.$y = y; } }, fields: [['x', 'I'], ['y', 'I']] });
  R.def('Landroid/graphics/PointF;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['<init>(FF)' + V]: (s, x, y) => { s.$x = x; s.$y = y; } } });
  R.def('Landroid/graphics/Bitmap;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: { ['getWidth()' + I]: (s) => s.$w | 0, ['getHeight()' + I]: (s) => s.$h | 0, ['recycle()' + V]: () => {}, ['isRecycled()' + Z]: () => 0, ['getPixel(II)' + I]: () => 0, ['setPixel(III)' + V]: () => {}, ['copy(Landroid/graphics/Bitmap$Config;Z)Landroid/graphics/Bitmap;']: (s) => s, ['eraseColor(I)' + V]: () => {} },
    sm: { ['createBitmap(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;']: (w, h) => ({ $c: R.klass('Landroid/graphics/Bitmap;'), $w: w, $h: h }), ['createBitmap(Landroid/graphics/Bitmap;)Landroid/graphics/Bitmap;']: (b) => b, ['createBitmap(Landroid/graphics/Bitmap;IIII)Landroid/graphics/Bitmap;']: (b, x, y, w, h) => ({ $c: R.klass('Landroid/graphics/Bitmap;'), $w: w, $h: h }), ['createScaledBitmap(Landroid/graphics/Bitmap;IIZ)Landroid/graphics/Bitmap;']: (b, w, h) => ({ $c: R.klass('Landroid/graphics/Bitmap;'), $w: w, $h: h }) },
  });
  R.def('Landroid/graphics/Bitmap$Config;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/BitmapFactory;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['decodeByteArray([BII)Landroid/graphics/Bitmap;']: (b, o, l) => ({ $c: R.klass('Landroid/graphics/Bitmap;'), $w: 1, $h: 1 }), ['decodeStream(Ljava/io/InputStream;)Landroid/graphics/Bitmap;']: () => null, ['decodeResource(Landroid/content/res/Resources;I)Landroid/graphics/Bitmap;']: (r, id) => H.resDrawable(id) } });
  R.def('Landroid/graphics/Canvas;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$ctx = H.makeCanvas(); },
      ['<init>(Landroid/graphics/Bitmap;)' + V]: (s, b) => { s.$ctx = H.makeCanvas(b); s.$bmp = b; },
      ['getWidth()' + I]: (s) => (s.$ctx ? s.$ctx.canvas.width : 0),
      ['getHeight()' + I]: (s) => (s.$ctx ? s.$ctx.canvas.height : 0),
      ['drawColor(I)' + V]: (s, c) => { const x = s.$ctx; if (!x) return; x.fillStyle = argbCss(c); x.fillRect(0, 0, x.canvas.width, x.canvas.height); },
      ['drawColor(ILandroid/graphics/PorterDuff$Mode;)' + V]: (s, c) => { const x = s.$ctx; if (!x) return; x.fillStyle = argbCss(c); x.fillRect(0, 0, x.canvas.width, x.canvas.height); },
      ['drawRect(FFFFLandroid/graphics/Paint;)' + V]: (s, l, t, r, b, p) => { const x = s.$ctx; if (!x) return; applyPaint(x, p); if (p && p.$style && p.$style.$name === 'STROKE') x.strokeRect(l, t, r - l, b - t); else x.fillRect(l, t, r - l, b - t); },
      ['drawRect(Landroid/graphics/RectF;Landroid/graphics/Paint;)' + V]: (s, rf, p) => { const x = s.$ctx; if (!x || !rf) return; applyPaint(x, p); x.fillRect(rf.$l, rf.$t, rf.$r - rf.$l, rf.$b - rf.$t); },
      ['drawCircle(FFFLandroid/graphics/Paint;)' + V]: (s, cx, cy, rad, p) => { const x = s.$ctx; if (!x) return; applyPaint(x, p); x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); p && p.$style && p.$style.$name === 'STROKE' ? x.stroke() : x.fill(); },
      ['drawLine(FFFFLandroid/graphics/Paint;)' + V]: (s, x1, y1, x2, y2, p) => { const x = s.$ctx; if (!x) return; applyPaint(x, p); x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); },
      ['drawText(Ljava/lang/String;FFLandroid/graphics/Paint;)' + V]: (s, t, x, y, p) => { const c = s.$ctx; if (!c) return; applyPaint(c, p); c.fillText(String(t), x, y); },
      ['drawText([CIIFFLandroid/graphics/Paint;)' + V]: (s, ch, st, en, x, y, p) => { const c = s.$ctx; if (!c) return; applyPaint(c, p); c.fillText(charsToString(Array.prototype.slice.call(ch, st, en)), x, y); },
      ['drawBitmap(Landroid/graphics/Bitmap;FFLandroid/graphics/Paint;)' + V]: (s, b, x, y) => { const c = s.$ctx; if (!c || !b || !b.$img) return; c.drawImage(b.$img, x, y); },
      ['drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/Rect;Landroid/graphics/Paint;)' + V]: () => {},
      ['drawRoundRect(FFFFFFLandroid/graphics/Paint;)' + V]: (s, l, t, r, b, rx, ry, p) => { const c = s.$ctx; if (!c) return; applyPaint(c, p); c.beginPath(); if (c.roundRect) c.roundRect(l, t, r - l, b - t, rx); else c.rect(l, t, r - l, b - t); c.fill(); },
      ['drawArc(FFFFFFZLandroid/graphics/Paint;)' + V]: () => {},
      ['drawPath(Landroid/graphics/Path;Landroid/graphics/Paint;)' + V]: () => {},
      ['drawOval(Landroid/graphics/RectF;Landroid/graphics/Paint;)' + V]: (s, rf, p) => { const c = s.$ctx; if (!c || !rf) return; applyPaint(c, p); c.beginPath(); c.ellipse((rf.$l + rf.$r) / 2, (rf.$t + rf.$b) / 2, (rf.$r - rf.$l) / 2, (rf.$b - rf.$t) / 2, 0, 0, Math.PI * 2); c.fill(); },
      ['save()' + I]: (s) => { if (s.$ctx) s.$ctx.save(); return 1; },
      ['restore()' + V]: (s) => { if (s.$ctx) s.$ctx.restore(); },
      ['translate(FF)' + V]: (s, x, y) => { if (s.$ctx) s.$ctx.translate(x, y); },
      ['scale(FF)' + V]: (s, x, y) => { if (s.$ctx) s.$ctx.scale(x, y); },
      ['rotate(F)' + V]: (s, a) => { if (s.$ctx) s.$ctx.rotate(a * Math.PI / 180); },
      ['rotate(FFF)' + V]: (s, a, px, py) => { if (s.$ctx) { s.$ctx.translate(px, py); s.$ctx.rotate(a * Math.PI / 180); s.$ctx.translate(-px, -py); } },
      ['clipRect(FFFF)' + Z]: () => 1,
      ['clipRect(Landroid/graphics/RectF;)' + Z]: () => 1,
      ['drawARGB(IIII)' + V]: (s, a, r, g, b) => { const c = s.$ctx; if (!c) return; c.fillStyle = `rgba(${r},${g},${b},${a / 255})`; c.fillRect(0, 0, c.canvas.width, c.canvas.height); },
      ['getClipBounds(Landroid/graphics/Rect;)' + Z]: () => 0,
      ['concat(Landroid/graphics/Matrix;)' + V]: () => {},
      ['setBitmap(Landroid/graphics/Bitmap;)' + V]: (s, b) => { s.$ctx = H.makeCanvas(b); },
    },
  });
  function applyPaint(ctx, p) {
    if (!p) { ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; return; }
    const css = argbCss(p.$color === undefined ? 0xff000000 : p.$color);
    ctx.fillStyle = css; ctx.strokeStyle = css;
    ctx.lineWidth = p.$w === undefined ? 1 : p.$w;
    ctx.font = `${p.$size === undefined ? 12 : p.$size}px system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
  }
  function argbCss(c) {
    const a = (c >>> 24) & 0xff, r = (c >>> 16) & 0xff, g = (c >>> 8) & 0xff, b = c & 0xff;
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  }
  R.argbCss = argbCss;
  R.def('Landroid/graphics/Path;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['moveTo(FF)' + V]: () => {}, ['lineTo(FF)' + V]: () => {}, ['close()' + V]: () => {}, ['addCircle(FFFLandroid/graphics/Path$Direction;)' + V]: () => {}, ['addRect(FFFFLandroid/graphics/Path$Direction;)' + V]: () => {}, ['reset()' + V]: () => {} } });
  R.def('Landroid/graphics/Path$Direction;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/Matrix;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['postTranslate(FF)' + Z]: () => 1, ['postScale(FF)' + Z]: () => 1, ['postRotate(F)' + Z]: () => 1, ['reset()' + V]: () => {} } });
  R.def('Landroid/graphics/PorterDuff$Mode;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/drawable/Drawable;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['setBounds(IIII)' + V]: (s, l, t, r, b) => { s.$bounds = [l, t, r, b]; }, ['getIntrinsicWidth()' + I]: (s) => (s.$w || -1), ['getIntrinsicHeight()' + I]: (s) => (s.$h || -1), ['draw(Landroid/graphics/Canvas;)' + V]: () => {}, ['setAlpha(I)' + V]: (s, a) => { s.$alpha = a; }, ['getOpacity()' + I]: () => -1, ['setCallback(Landroid/graphics/drawable/Drawable$Callback;)' + V]: () => {} } });
  R.def('Landroid/graphics/drawable/Drawable$Callback;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/drawable/BitmapDrawable;', { access: 0x21, sup: 'Landroid/graphics/drawable/Drawable;' });
  R.def('Landroid/graphics/drawable/ColorDrawable;', { access: 0x21, sup: 'Landroid/graphics/drawable/Drawable;', m: { ['<init>()' + V]: (s) => { s.$color = 0; }, ['<init>(I)' + V]: (s, c) => { s.$color = c; }, ['getColor()' + I]: (s) => s.$color } });
  R.def('Landroid/graphics/drawable/GradientDrawable;', { access: 0x21, sup: 'Landroid/graphics/drawable/Drawable;', m: { ['<init>()' + V]: () => {}, ['setColor(I)' + V]: (s, c) => { s.$color = c; }, ['setCornerRadius(F)' + V]: (s, r) => { s.$radius = r; }, ['setStroke(IILandroid/graphics/Paint$Style;)' + V]: () => {} } });
  R.def('Landroid/graphics/drawable/LayerDrawable;', { access: 0x21, sup: 'Landroid/graphics/drawable/Drawable;' });
  R.def('Landroid/graphics/drawable/ShapeDrawable;', { access: 0x21, sup: 'Landroid/graphics/drawable/Drawable;' });
  R.def('Landroid/graphics/Shader;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/LinearGradient;', { access: 0x21, sup: 'Landroid/graphics/Shader;' });
  R.def('Landroid/graphics/Typeface;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ---- android.text ---- */
  R.def('Landroid/text/TextUtils;', {
    access: 0x11, sup: 'Ljava/lang/Object;',
    sm: {
      ['isEmpty(Ljava/lang/CharSequence;)' + Z]: (s) => BOOL(s === null || s === undefined || s === ''),
      ['equals(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)' + Z]: (a, b) => BOOL(R.str(a) === R.str(b) || (a === null && b === null)),
      ['join(Ljava/lang/CharSequence;[Ljava/lang/Object;)' + S]: (sep, a) => (a || []).map((x) => R.str(x)).join(R.str(sep)),
      ['join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)' + S]: (sep, it) => ((it && it.$a) || []).map((x) => R.str(x)).join(R.str(sep)),
      ['split(Ljava/lang/String;Ljava/lang/String;)[Ljava/lang/String;']: (s, re) => arr(R, '[Ljava/lang/String;', String(s).split(re)),
      ['isDigitsOnly(Ljava/lang/CharSequence;)' + Z]: (s) => BOOL(/^\d+$/.test(String(s))),
      ['getTrimmedLength(Ljava/lang/CharSequence;)' + I]: (s) => String(s).trim().length,
      ['concat(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)' + S]: (a, b) => R.str(a) + R.str(b),
      ['htmlEncode(Ljava/lang/String;)' + S]: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      ['capitalize(Ljava/lang/String;Ljava/util/Locale;)' + S]: (s) => s,
      ['indexOf(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)' + I]: (a, b) => R.str(a).indexOf(R.str(b)),
      ['substring(Ljava/lang/Spannable;II)' + S]: (s, a, b) => R.str(s).slice(a, b),
    },
  });
  R.def('Landroid/text/Spannable;', { access: 0x601, sup: 'Ljava/lang/CharSequence;' });
  R.def('Landroid/text/SpannableString;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/CharSequence;'], m: { ['<init>(Ljava/lang/CharSequence;)' + V]: (s, c) => { s.$t = R.str(c); }, ['length()' + I]: (s) => s.$t.length, ['toString()' + S]: (s) => s.$t, ['charAt(I)' + C]: (s, i) => s.$t.charCodeAt(i) & 0xffff, ['setSpan(Ljava/lang/Object;III)' + V]: () => {}, ['subSequence(II)Ljava/lang/CharSequence;']: (s, a, b) => s.$t.slice(a, b) } });
  R.def('Landroid/text/SpannableStringBuilder;', { access: 0x31, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/CharSequence;'], m: { ['<init>()' + V]: (s) => { s.$t = ''; }, ['<init>(Ljava/lang/CharSequence;)' + V]: (s, c) => { s.$t = R.str(c); }, ['append(Ljava/lang/CharSequence;)Landroid/text/SpannableStringBuilder;']: (s, c) => { s.$t += R.str(c); return s; }, ['toString()' + S]: (s) => s.$t, ['length()' + I]: (s) => s.$t.length, ['insert(ILjava/lang/CharSequence;)Landroid/text/SpannableStringBuilder;']: (s, i, c) => { s.$t = s.$t.slice(0, i) + R.str(c) + s.$t.slice(i); return s; }, ['delete(II)Landroid/text/SpannableStringBuilder;']: (s, a, b) => { s.$t = s.$t.slice(0, a) + s.$t.slice(b); return s; }, ['setSpan(Ljava/lang/Object;III)' + V]: () => {}, ['clear()' + V]: (s) => { s.$t = ''; } } });
  R.def('Landroid/text/Html;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['fromHtml(Ljava/lang/String;)' + S]: (s) => s, ['fromHtml(Ljava/lang/String;I)' + S]: (s) => s, ['toHtml(Landroid/text/Spanned;)' + S]: (s) => R.str(s) } });
  R.def('Landroid/text/Spanned;', { access: 0x601, sup: 'Ljava/lang/CharSequence;' });
  R.def('Landroid/text/InputType;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/text/InputType;->TYPE_CLASS_TEXT:I': 1, 'Landroid/text/InputType;->TYPE_CLASS_NUMBER:I': 2, 'Landroid/text/InputType;->TYPE_TEXT_VARIATION_PASSWORD:I': 129, 'Landroid/text/InputType;->TYPE_NUMBER_FLAG_DECIMAL:I': 8192 } });
  R.def('Landroid/text/Editable;', { access: 0x601, sup: 'Ljava/lang/CharSequence;' });
  R.def('Landroid/text/TextWatcher;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---- android.app / activity ---- */
  R.def('Landroid/app/Activity;', {
    access: 0x21, sup: 'Landroid/content/Context;', ifaces: ['Landroid/view/ViewTreeObserver;', 'Landroid/view/Window$Callback;'],
    m: {
      ['<init>()' + V]: (s) => { s.$finished = false; },
      ['onCreate(Landroid/os/Bundle;)' + V]: () => {},
      ['onStart()' + V]: () => {}, ['onResume()' + V]: () => {}, ['onPause()' + V]: () => {},
      ['onStop()' + V]: () => {}, ['onDestroy()' + V]: () => {}, ['onRestart()' + V]: () => {},
      ['onSaveInstanceState(Landroid/os/Bundle;)' + V]: () => {},
      ['onRestoreInstanceState(Landroid/os/Bundle;)' + V]: () => {},
      ['onNewIntent(Landroid/content/Intent;)' + V]: () => {},
      ['onBackPressed()' + V]: () => {},
      ['onActivityResult(IILandroid/content/Intent;)' + V]: () => {},
      ['onRequestPermissionsResult(I[Ljava/lang/String;[I)' + V]: () => {},
      ['onOptionsItemSelected(Landroid/view/MenuItem;)' + Z]: () => 0,
      ['onCreateOptionsMenu(Landroid/view/Menu;)' + Z]: () => 1,
      ['onPrepareOptionsMenu(Landroid/view/Menu;)' + Z]: () => 1,
      ['onContextItemSelected(Landroid/view/MenuItem;)' + Z]: () => 0,
      ['onCreateContextMenu(Landroid/view/ContextMenu;Landroid/view/View;Landroid/view/ContextMenu$ContextMenuInfo;)' + V]: () => {},
      ['onTouchEvent(Landroid/view/MotionEvent;)' + Z]: () => 0,
      ['onKeyDown(ILandroid/view/KeyEvent;)' + Z]: () => 0,
      ['onKeyUp(ILandroid/view/KeyEvent;)' + Z]: () => 0,
      ['setContentView(I)' + V]: (s, id) => H.setContentView(s, id, null),
      ['setContentView(Landroid/view/View;)' + V]: (s, v) => H.setContentView(s, null, v),
      ['setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)' + V]: (s, v) => H.setContentView(s, null, v),
      ['findViewById(I)Landroid/view/View;']: (s, id) => H.findViewById(s, id),
      ['findViewById(ILandroid/view/View;)Landroid/view/View;']: (s, id) => H.findViewById(s, id),
      ['finish()' + V]: (s) => { s.$finished = true; H.finish(s); },
      ['isFinishing()' + Z]: (s) => BOOL(s.$finished),
      ['runOnUiThread(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => safeRun(R, r)),
      ['startActivity(Landroid/content/Intent;)' + V]: (s, i) => H.startActivity(i, s),
      ['startActivityForResult(Landroid/content/Intent;I)' + V]: (s, i) => H.startActivity(i, s),
      ['getIntent()Landroid/content/Intent;']: (s) => s.$intent || (s.$intent = { $c: R.klass('Landroid/content/Intent;'), $extras: new Map() }),
      ['setIntent(Landroid/content/Intent;)' + V]: (s, i) => { s.$intent = i; },
      ['getLayoutInflater()Landroid/view/LayoutInflater;']: (s) => H.layoutInflater(s),
      ['getWindow()Landroid/view/Window;']: (s) => s.$window || (s.$window = makeWindow(R, s)),
      ['getWindowManager()Landroid/view/WindowManager;']: () => ({ $c: R.klass('Landroid/view/WindowManager;') }),
      ['getFragmentManager()Landroid/app/FragmentManager;']: () => ({ $c: R.klass('Landroid/app/FragmentManager;') }),
      ['getSupportFragmentManager()Landroidx/fragment/app/FragmentManager;']: () => ({ $c: R.klass('Landroidx/fragment/app/FragmentManager;') }),
      ['getMenuInflater()Landroid/view/MenuInflater;']: () => ({ $c: R.klass('Landroid/view/MenuInflater;') }),
      ['setTitle(Ljava/lang/CharSequence;)' + V]: (s, t) => H.setTitle(s, R.str(t)),
      ['setTitle(I)' + V]: (s, id) => H.setTitle(s, H.resString(id)),
      ['getTitle()' + S]: (s) => s.$title || '',
      ['getActionBar()Landroid/app/ActionBar;']: () => null,
      ['getSupportActionBar()Landroidx/appcompat/app/ActionBar;']: (s) => makeActionBar(R, s),
      ['setSupportActionBar(Landroidx/appcompat/widget/Toolbar;)' + V]: () => {},
      ['invalidateOptionsMenu()' + V]: () => {},
      ['requestWindowFeature(I)' + Z]: () => 1,
      ['setRequestedOrientation(I)' + V]: () => {},
      ['getSystemService(Ljava/lang/String;)' + O]: (s, n) => H.systemService(n),
      ['getApplicationContext()Landroid/content/Context;']: (s) => H.applicationContext(),
      ['getResources()Landroid/content/res/Resources;']: () => H.resources(),
      ['getPackageName()' + S]: () => H.packageName,
      ['getString(I)' + S]: (s, id) => H.resString(id),
      ['getString(I[Ljava/lang/Object;)' + S]: (s, id, a) => javaFormat(H.resString(id) || '', a || []),
      ['getText(I)' + S]: (s, id) => H.resString(id),
      ['getColor(I)' + I]: (s, id) => H.resColor(id),
      ['getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;']: (s, n) => H.prefs(n),
      ['openFileOutput(Ljava/lang/String;I)Ljava/io/FileOutputStream;']: () => null,
      ['getCallingActivity()Landroid/content/ComponentName;']: () => null,
      ['setResult(I)' + V]: () => {}, ['setResult(ILandroid/content/Intent;)' + V]: () => {},
      ['requestPermissions([Ljava/lang/String;I)' + V]: (s, perms, code) => { L('I', 'Activity', `requestPermissions(${(perms || []).join(', ')}) → auto-granted`); H.post(() => { try { R.iv('Landroid/app/Activity;->onRequestPermissionsResult(I[Ljava/lang/String;[I)V', s, code, perms, arr(R, '[I', (perms || []).map(() => 0))); } catch (e) { /* not overridden */ } }); },
      ['checkSelfPermission(Ljava/lang/String;)' + I]: () => 0,
      ['recreate()' + V]: (s) => H.recreate(s),
      ['moveTaskToBack(Z)' + Z]: () => 0,
      ['getApplicationContext()' + O]: (s) => H.applicationContext(),
      ['getLifecycle()Landroidx/lifecycle/Lifecycle;']: () => ({ $c: R.klass('Landroidx/lifecycle/Lifecycle;') }),
      ['getViewModelStore()Landroidx/lifecycle/ViewModelStore;']: () => ({ $c: R.klass('Landroidx/lifecycle/ViewModelStore;') }),
      ['getOnBackPressedDispatcher()Landroidx/activity/OnBackPressedDispatcher;']: () => ({ $c: R.klass('Landroidx/activity/OnBackPressedDispatcher;') }),
      ['registerForActivityResult(Landroidx/activity/result/contract/ActivityResultContract;Landroidx/activity/result/ActivityResultCallback;)Landroidx/activity/result/ActivityResultLauncher;']: () => ({ $c: R.klass('Landroidx/activity/result/ActivityResultLauncher;') }),
    },
  });
  function makeWindow(R, activity) {
    const c = R.klass('Landroid/view/Window;');
    return {
      $c: c, $activity: activity,
      'Landroid/view/Window;->decor:Landroid/view/View;': null,
    };
  }
  function makeActionBar(R, activity) {
    const c = R.klass('Landroidx/appcompat/app/ActionBar;');
    const o = { $c: c };
    o.__setTitle = (t) => H.setTitle(activity, R.str(t));
    return o;
  }
  R.def('Landroid/view/Window;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['getDecorView()' + O]: (s) => s.$decor || null, ['setContentView(Landroid/view/View;)' + V]: (s, v) => H.setContentView(s.$activity, null, v), ['setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)' + V]: () => {}, ['addFlags(I)' + V]: () => {}, ['setFlags(II)' + V]: () => {}, ['clearFlags(I)' + V]: () => {}, ['requestFeature(I)' + Z]: () => 1, ['getAttributes()Landroid/view/WindowManager$LayoutParams;']: () => ({ $c: R.klass('Landroid/view/WindowManager$LayoutParams;') }), ['setStatusBarColor(I)' + V]: (s, c) => H.setStatusBarColor(c), ['setNavigationBarColor(I)' + V]: (s, c) => H.setNavBarColor(c), ['getCallback()Landroid/view/Window$Callback;']: () => null } });
  R.def('Landroid/view/Window$Callback;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/WindowManager;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/WindowManager$LayoutParams;', { access: 0x21, sup: 'Landroid/view/ViewGroup$LayoutParams;' });
  R.def('Landroid/view/WindowManagerImpl;', { access: 0x21, sup: 'Landroid/view/WindowManager;' });
  R.def('Landroid/app/ActionBar;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['setTitle(Ljava/lang/CharSequence;)' + V]: (s, t) => { if (s.__setTitle) s.__setTitle(t); }, ['setTitle(I)' + V]: (s, id) => { if (s.__setTitle) s.__setTitle(H.resString(id)); }, ['setSubtitle(Ljava/lang/CharSequence;)' + V]: (s, t) => H.setSubtitle(R.str(t)), ['setDisplayHomeAsUpEnabled(Z)' + V]: () => {}, ['setDisplayShowHomeEnabled(Z)' + V]: () => {}, ['setHomeButtonEnabled(Z)' + V]: () => {}, ['hide()' + V]: () => {}, ['show()' + V]: () => {}, ['setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)' + V]: () => {} } });
  R.def('Landroidx/appcompat/app/ActionBar;', { access: 0x421, sup: 'Landroid/app/ActionBar;' });
  R.def('Landroidx/appcompat/widget/Toolbar;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'Toolbar'), ['setTitle(Ljava/lang/CharSequence;)' + V]: (s, t) => H.setSubtitle(R.str(t)) } });
  R.def('Landroid/app/FragmentManager;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['beginTransaction()Landroid/app/FragmentTransaction;']: () => null, ['findFragmentById(I)Landroid/app/Fragment;']: () => null } });
  R.def('Landroid/app/FragmentTransaction;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/fragment/app/FragmentActivity;', { access: 0x21, sup: 'Landroid/app/Activity;' });
  R.def('Landroidx/fragment/app/FragmentManager;', { access: 0x421, sup: 'Landroid/app/FragmentManager;', m: { ['beginTransaction()Landroidx/fragment/app/FragmentTransaction;']: () => makeFragTx(R), ['findFragmentById(I)Landroidx/fragment/app/Fragment;']: () => null } });
  R.def('Landroidx/fragment/app/FragmentTransaction;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  function makeFragTx(R) {
    const c = R.klass('Landroidx/fragment/app/FragmentTransaction;');
    const o = { $c: c };
    for (const sig of ['replace(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;', 'add(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;', 'remove(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;', 'addToBackStack(Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;', 'setCustomAnimations(IIII)Landroidx/fragment/app/FragmentTransaction;']) {
      // registered natively below
    }
    return o;
  }
  R.def('Landroidx/fragment/app/FragmentTransaction;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['replace(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
      ['add(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
      ['remove(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
      ['addToBackStack(Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
      ['commit()' + I]: (s) => { L('W', 'Fragment', 'fragment transactions are not rendered in Dex2Web'); return 0; },
      ['commitNow()' + V]: () => {}, ['commitAllowingStateLoss()' + I]: () => 0,
    },
  });
  R.def('Landroidx/appcompat/app/AppCompatActivity;', { access: 0x21, sup: 'Landroidx/fragment/app/FragmentActivity;', m: { ['<init>()' + V]: () => {}, ['setSupportActionBar(Landroidx/appcompat/widget/Toolbar;)' + V]: () => {}, ['getSupportActionBar()Landroidx/appcompat/app/ActionBar;']: (s) => makeActionBar(R, s), ['getDelegate()Landroidx/appcompat/app/AppCompatDelegate;']: () => ({ $c: R.klass('Landroidx/appcompat/app/AppCompatDelegate;') }) } });
  R.def('Landroidx/appcompat/app/AppCompatDelegate;', { access: 0x421, sup: 'Ljava/lang/Object;', sm: { ['setDefaultNightMode(I)' + V]: () => {} } });
  R.def('Landroid/app/AlertDialog;', { access: 0x21, sup: 'Landroid/app/Dialog;', m: { ['show()' + V]: (s) => H.showDialog(s), ['getMessage()' + S]: (s) => s.$msg } });
  R.def('Landroid/app/AlertDialog$Builder;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Landroid/content/Context;)' + V]: (s) => { s.$ctx = null; },
      ['<init>(Landroid/content/Context;I)' + V]: (s) => {},
      ['setTitle(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;']: (s, t) => { s.$title = R.str(t); return s; },
      ['setTitle(I)Landroid/app/AlertDialog$Builder;']: (s, id) => { s.$title = H.resString(id); return s; },
      ['setMessage(Ljava/lang/CharSequence;)Landroid/app/AlertDialog$Builder;']: (s, t) => { s.$msg = R.str(t); return s; },
      ['setMessage(I)Landroid/app/AlertDialog$Builder;']: (s, id) => { s.$msg = H.resString(id); return s; },
      ['setPositiveButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;']: (s, t, l) => { s.$pos = [R.str(t), l]; return s; },
      ['setPositiveButton(ILandroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;']: (s, id, l) => { s.$pos = [H.resString(id), l]; return s; },
      ['setNegativeButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;']: (s, t, l) => { s.$neg = [R.str(t), l]; return s; },
      ['setNegativeButton(ILandroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;']: (s, id, l) => { s.$neg = [H.resString(id), l]; return s; },
      ['setNeutralButton(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;']: (s, t, l) => { s.$neu = [R.str(t), l]; return s; },
      ['setCancelable(Z)Landroid/app/AlertDialog$Builder;']: (s) => s,
      ['setView(Landroid/view/View;)Landroid/app/AlertDialog$Builder;']: (s, v) => { s.$view = v; return s; },
      ['setIcon(I)Landroid/app/AlertDialog$Builder;']: (s) => s,
      ['create()Landroid/app/AlertDialog;']: (s) => buildDialog(R, s),
      ['show()Landroid/app/AlertDialog;']: (s) => { const d = buildDialog(R, s); H.showDialog(d); return d; },
    },
  });
  function buildDialog(R, b) {
    const c = R.klass('Landroid/app/AlertDialog;');
    return { $c: c, $title: b.$title || '', $msg: b.$msg || '', $pos: b.$pos, $neg: b.$neg, $neu: b.$neu, $view: b.$view, $kind: 'alert' };
  }
  R.def('Landroid/app/Dialog;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['show()' + V]: (s) => H.showDialog(s), ['dismiss()' + V]: (s) => H.dismissDialog(s), ['hide()' + V]: (s) => H.dismissDialog(s), ['isShowing()' + Z]: (s) => BOOL(s.$showing), ['setCancelable(Z)' + V]: () => {}, ['setTitle(Ljava/lang/CharSequence;)' + V]: (s, t) => { s.$title = R.str(t); }, ['getWindow()Landroid/view/Window;']: () => null, ['getContext()Landroid/content/Context;']: (s) => s.$ctx || null } });
  R.def('Landroid/content/DialogInterface;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/DialogInterface$OnClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/appcompat/app/AlertDialog;', { access: 0x21, sup: 'Landroid/app/AlertDialog;' });
  R.def('Landroidx/appcompat/app/AlertDialog$Builder;', { access: 0x21, sup: 'Landroid/app/AlertDialog$Builder;', m: { ['<init>(Landroid/content/Context;)' + V]: () => {} } });
  R.def('Landroid/app/ProgressDialog;', { access: 0x21, sup: 'Landroid/app/Dialog;', m: { ['setMessage(Ljava/lang/CharSequence;)' + V]: (s, m) => { s.$msg = R.str(m); } }, sm: { ['show(Landroid/content/Context;Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Landroid/app/ProgressDialog;']: (c, t, m) => { const d = { $c: R.klass('Landroid/app/ProgressDialog;'), $title: R.str(t), $msg: R.str(m), $kind: 'progress' }; H.showDialog(d); return d; } } });
  R.def('Landroid/app/NotificationManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['notify(ILandroid/app/Notification;)' + V]: (s, id, n) => L('I', 'Notification', `#${id}: ${n && n.$title ? n.$title : ''}`) } });
  R.def('Landroid/app/Notification;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/Notification$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/content/Context;)' + V]: (s) => { s.$n = { $c: R.klass('Landroid/app/Notification;') }; }, ['setContentTitle(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;']: (s, t) => { s.$n.$title = R.str(t); return s; }, ['setContentText(Ljava/lang/CharSequence;)Landroid/app/Notification$Builder;']: (s, t) => { s.$n.$text = R.str(t); return s; }, ['setSmallIcon(I)Landroid/app/Notification$Builder;']: (s) => s, ['build()Landroid/app/Notification;']: (s) => s.$n } });
  R.def('Landroidx/core/app/NotificationCompat;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/core/app/NotificationCompat$Builder;', { access: 0x21, sup: 'Landroid/app/Notification$Builder;' });
  R.def('Landroid/app/PendingIntent;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: () => ({ $c: R.klass('Landroid/app/PendingIntent;') }), ['getBroadcast(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: () => ({ $c: R.klass('Landroid/app/PendingIntent;') }) } });
  R.def('Landroidx/lifecycle/Lifecycle;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/lifecycle/LifecycleOwner;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/lifecycle/ViewModelStore;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/lifecycle/ViewModel;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['onCleared()' + V]: () => {} } });
  R.def('Landroidx/lifecycle/LiveData;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getValue()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['setValue(Ljava/lang/Object;)' + V]: (s, v) => { s.$v = v; }, ['postValue(Ljava/lang/Object;)' + V]: (s, v) => { s.$v = v; }, ['observe(Landroidx/lifecycle/LifecycleOwner;Landroidx/lifecycle/Observer;)' + V]: (s, o, obs) => { s.$obs = obs; } } });
  R.def('Landroidx/lifecycle/MutableLiveData;', { access: 0x21, sup: 'Landroidx/lifecycle/LiveData;', m: { ['<init>()' + V]: (s) => { s.$v = null; } } });
  R.def('Landroidx/lifecycle/Observer;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/activity/OnBackPressedDispatcher;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/activity/result/ActivityResultLauncher;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['launch(Ljava/lang/Object;)' + V]: () => {} } });
  R.def('Landroidx/activity/result/contract/ActivityResultContract;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/activity/result/ActivityResultCallback;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---- android.widget.Toast / menus ---- */
  R.def('Landroid/widget/Toast;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: { ['show()' + V]: (s) => H.toast(s.$text, s.$dur), ['setDuration(I)' + V]: (s, d) => { s.$dur = d; }, ['setText(Ljava/lang/CharSequence;)' + V]: (s, t) => { s.$text = R.str(t); }, ['cancel()' + V]: () => {} },
    sm: {
      ['makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;']: (c, t, d) => ({ $c: R.klass('Landroid/widget/Toast;'), $text: R.str(t), $dur: d }),
      ['makeText(Landroid/content/Context;II)Landroid/widget/Toast;']: (c, id, d) => ({ $c: R.klass('Landroid/widget/Toast;'), $text: H.resString(id), $dur: d }),
    },
  });
  R.def('Landroid/view/Menu;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['add(Ljava/lang/CharSequence;)Landroid/view/MenuItem;']: () => ({ $c: R.klass('Landroid/view/MenuItem;') }), ['add(IIILjava/lang/CharSequence;)Landroid/view/MenuItem;']: () => ({ $c: R.klass('Landroid/view/MenuItem;') }), ['findItem(I)Landroid/view/MenuItem;']: () => null, ['clear()' + V]: () => {}, ['size()' + I]: () => 0, ['removeItem(I)' + V]: () => {}, ['setGroupVisible(IZ)' + V]: () => {} } });
  R.def('Landroid/view/MenuItem;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['getItemId()' + I]: () => 0, ['getTitle()' + S]: () => '', ['setVisible(Z)' + Z]: () => 1, ['setEnabled(Z)' + Z]: () => 1, ['setOnMenuItemClickListener(Landroid/view/MenuItem$OnMenuItemClickListener;)' + Z]: () => 1, ['setIcon(I)' + Z]: () => 1 } });
  R.def('Landroid/view/MenuItem$OnMenuItemClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/MenuInflater;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['inflate(ILandroid/view/Menu;)' + V]: (s, id, menu) => H.inflateMenu(id, menu) } });
  R.def('Landroid/view/ContextMenu;', { access: 0x601, sup: 'Landroid/view/Menu;' });
  R.def('Landroid/view/ContextMenu$ContextMenuInfo;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---- misc android.* stubs that real apps poke at ---- */
  R.def('Landroid/provider/Settings$Secure;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: (r, k) => (k === 'android_id' ? 'dex2web0000000000' : null) } });
  R.def('Landroid/provider/Settings$System;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/provider/Settings;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaPlayer;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$url = null; },
      ['setDataSource(Landroid/content/Context;Landroid/net/Uri;)' + V]: (s, c, u) => { s.$url = u && u.$u; },
      ['setDataSource(Ljava/lang/String;)' + V]: (s, u) => { s.$url = u; },
      ['setDataSource(Ljava/io/FileDescriptor;)' + V]: (s) => {},
      ['prepare()' + V]: (s) => H.mediaPrepare(s),
      ['prepareAsync()' + V]: (s) => H.mediaPrepare(s, true),
      ['start()' + V]: (s) => { H.mediaPlay(s); },
      ['pause()' + V]: (s) => H.mediaPause(s),
      ['stop()' + V]: (s) => H.mediaPause(s),
      ['release()' + V]: (s) => H.mediaRelease(s),
      ['reset()' + V]: (s) => H.mediaRelease(s),
      ['isPlaying()' + Z]: (s) => BOOL(H.mediaPlaying(s)),
      ['setLooping(Z)' + V]: (s, l) => { s.$loop = !!l; if (s.$el) s.$el.loop = !!l; },
      ['setScreenOnWhilePlaying(Z)' + V]: () => {},
      ['seekTo(I)' + V]: (s, p) => H.mediaSeek(s, p),
      ['getDuration()' + I]: (s) => H.mediaDuration(s),
      ['getCurrentPosition()' + I]: (s) => H.mediaPosition(s),
      ['setVolume(FF)' + V]: (s, l, r) => { if (s.$el) s.$el.volume = Math.max(0, Math.min(1, l)); },
      ['setAudioStreamType(I)' + V]: () => {},
      ['setVideoSurfaceView(Landroid/view/SurfaceView;)' + V]: (s, v) => H.attachMediaSurface(s, v),
      ['setSurface(Landroid/view/Surface;)' + V]: (s, sf) => H.attachMediaSurface(s, sf && sf.$view),
      ['setDisplay(Landroid/view/SurfaceHolder;)' + V]: (s, h) => H.attachMediaSurface(s, h && h.$view),
      ['setOnCompletionListener(Landroid/media/MediaPlayer$OnCompletionListener;)' + V]: (s, l) => { s.$onComplete = l; },
      ['setOnPreparedListener(Landroid/media/MediaPlayer$OnPreparedListener;)' + V]: (s, l) => { s.$onPrepared = l; },
      ['setOnErrorListener(Landroid/media/MediaPlayer$OnErrorListener;)' + V]: (s, l) => { s.$onError = l; },
      ['setOnBufferingUpdateListener(Landroid/media/MediaPlayer$OnBufferingUpdateListener;)' + V]: (s, l) => { s.$onBuffer = l; },
      ['setOnVideoSizeChangedListener(Landroid/media/MediaPlayer$OnVideoSizeChangedListener;)' + V]: (s, l) => { s.$onSize = l; },
      ['getVideoWidth()' + I]: (s) => (s.$el ? s.$el.videoWidth | 0 : 0),
      ['getVideoHeight()' + I]: (s) => (s.$el ? s.$el.videoHeight | 0 : 0),
      ['setWakeMode(Landroid/content/Context;I)' + V]: () => {},
    },
  });
  R.def('Landroid/media/MediaPlayer$OnErrorListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaPlayer$OnBufferingUpdateListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaPlayer$OnVideoSizeChangedListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaPlayer$OnCompletionListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaPlayer$OnPreparedListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/AudioManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getStreamVolume(I)' + I]: () => 7, ['getStreamMaxVolume(I)' + I]: () => 15, ['setStreamVolume(III)' + V]: () => {}, ['isMusicActive()' + Z]: () => 0, ['requestAudioFocus(Landroid/media/AudioManager$OnAudioFocusChangeListener;II)' + I]: () => 1, ['abandonAudioFocus(Landroid/media/AudioManager$OnAudioFocusChangeListener;)' + I]: () => 1 } });
  R.def('Landroid/media/AudioManager$OnAudioFocusChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/MediaRecorder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['setAudioSource(I)' + V]: () => {}, ['setOutputFormat(I)' + V]: () => {}, ['setAudioEncoder(I)' + V]: () => {}, ['setOutputFile(Ljava/lang/String;)' + V]: () => {}, ['prepare()' + V]: () => {}, ['start()' + V]: () => L('W', 'MediaRecorder', 'recording is not available in the browser sandbox'), ['stop()' + V]: () => {}, ['release()' + V]: () => {} } });
  R.def('Landroid/media/SoundPool;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['play(IFFIIF)' + I]: () => 0, ['load(Landroid/content/Context;II)' + I]: () => 0, ['release()' + V]: () => {}, ['stop(I)' + V]: () => {} } });
  R.def('Landroid/hardware/SensorManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getDefaultSensor(I)Landroid/hardware/Sensor;']: () => null, ['registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;I)' + Z]: () => 1, ['unregisterListener(Landroid/hardware/SensorEventListener;)' + V]: () => {} } });
  R.def('Landroid/hardware/Sensor;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/hardware/SensorEvent;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/hardware/SensorEventListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/location/LocationManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getLastKnownLocation(Ljava/lang/String;)Landroid/location/Location;']: () => null, ['isProviderEnabled(Ljava/lang/String;)' + Z]: () => 0, ['requestLocationUpdates(Ljava/lang/String;JFLandroid/location/LocationListener;)' + V]: () => L('W', 'Location', 'location updates unavailable in the browser sandbox') } });
  R.def('Landroid/location/Location;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/String;)' + V]: () => {}, ['getLatitude()' + D]: () => 0, ['getLongitude()' + D]: () => 0, ['getAccuracy()' + F]: () => Math.fround(0) } });
  R.def('Landroid/location/LocationListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/net/ConnectivityManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getActiveNetworkInfo()Landroid/net/NetworkInfo;']: () => ({ $c: R.klass('Landroid/net/NetworkInfo;'), $connected: true }), ['isActiveNetworkMetered()' + Z]: () => 0 } });
  R.def('Landroid/net/NetworkInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['isConnected()' + Z]: (s) => BOOL(s.$connected), ['isAvailable()' + Z]: (s) => BOOL(s.$connected), ['getType()' + I]: () => 1, ['getTypeName()' + S]: () => 'WIFI' } });
  R.def('Landroid/net/NetworkCapabilities;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/inputmethod/InputMethodManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['hideSoftInputFromWindow(Landroid/os/IBinder;I)' + Z]: () => 1, ['showSoftInput(Landroid/view/View;I)' + Z]: (s, v) => { if (v && v.$el && v.$el.focus) v.$el.focus(); return 1; } } });
  R.def('Landroid/os/IBinder;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/PowerManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['isInteractive()' + Z]: () => 1, ['newWakeLock(ILjava/lang/String;)Landroid/os/PowerManager$WakeLock;']: () => ({ $c: R.klass('Landroid/os/PowerManager$WakeLock;') }) } });
  R.def('Landroid/os/PowerManager$WakeLock;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['acquire()' + V]: () => {}, ['acquire(J)' + V]: () => {}, ['release()' + V]: () => {}, ['isHeld()' + Z]: () => 0 } });
  R.def('Landroid/os/BatteryManager;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/telephony/TelephonyManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getDeviceId()' + S]: () => null, ['getNetworkOperatorName()' + S]: () => 'Dex2Web', ['getSimOperatorName()' + S]: () => '' } });
  R.def('Landroid/clipboard/ClipboardManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setPrimaryClip(Landroid/content/ClipData;)' + V]: (s, d) => H.clipboardWrite(d && d.$text) } });
  R.def('Landroid/content/ClipData;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getItemAt(I)Landroid/content/ClipData$Item;']: (s, i) => null }, sm: { ['newPlainText(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Landroid/content/ClipData;']: (l, t) => ({ $c: R.klass('Landroid/content/ClipData;'), $text: R.str(t) }) } });
  R.def('Landroid/content/ClipData$Item;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getText()' + S]: () => null } });
  R.def('Landroid/view/animation/Animation;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/animation/AlphaAnimation;', { access: 0x21, sup: 'Landroid/view/animation/Animation;', m: { ['<init>(FF)' + V]: () => {} } });
  R.def('Landroid/view/animation/AnimationUtils;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['loadAnimation(Landroid/content/Context;I)Landroid/view/animation/Animation;']: () => ({ $c: R.klass('Landroid/view/animation/AlphaAnimation;') }) } });
  R.def('Landroid/database/Cursor;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['moveToFirst()' + Z]: () => 0, ['moveToNext()' + Z]: () => 0, ['close()' + V]: () => {}, ['getCount()' + I]: () => 0, ['getColumnIndex(Ljava/lang/String;)' + I]: () => -1, ['getString(I)' + S]: () => null, ['getInt(I)' + I]: () => 0 } });
  R.def('Landroid/database/sqlite/SQLiteDatabase;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/database/sqlite/SQLiteOpenHelper;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['getWritableDatabase()Landroid/database/sqlite/SQLiteDatabase;']: () => null, ['getReadableDatabase()Landroid/database/sqlite/SQLiteDatabase;']: () => null, ['close()' + V]: () => {} } });
  R.def('Landroid/appwidget/AppWidgetManager;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getInstance(Landroid/content/Context;)Landroid/appwidget/AppWidgetManager;']: () => ({ $c: R.klass('Landroid/appwidget/AppWidgetManager;') }) }, m: { ['updateAppWidget(ILandroid/widget/RemoteViews;)' + V]: () => {} } });
  R.def('Landroid/appwidget/AppWidgetProvider;', { access: 0x21, sup: 'Landroid/content/BroadcastReceiver;' });
  R.def('Landroid/widget/RemoteViews;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/String;I)' + V]: () => {}, ['setTextViewText(ILjava/lang/CharSequence;)' + V]: () => {}, ['setOnClickPendingIntent(ILandroid/app/PendingIntent;)' + V]: () => {} } });
  R.def('Landroid/preference/PreferenceManager;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getDefaultSharedPreferences(Landroid/content/Context;)Landroid/content/SharedPreferences;']: (c) => H.prefs('default') } });
  R.def('Landroidx/preference/PreferenceManager;', { access: 0x21, sup: 'Landroid/preference/PreferenceManager;' });
  R.def('Lcom/google/android/material/snackbar/Snackbar;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['show()' + V]: (s) => H.toast(s.$text, 0), ['setAction(Ljava/lang/CharSequence;Landroid/view/View$OnClickListener;)Lcom/google/android/material/snackbar/Snackbar;']: (s) => s }, sm: { ['make(Landroid/view/View;Ljava/lang/CharSequence;I)Lcom/google/android/material/snackbar/Snackbar;']: (v, t) => ({ $c: R.klass('Lcom/google/android/material/snackbar/Snackbar;'), $text: R.str(t) }), ['make(Landroid/view/View;II)Lcom/google/android/material/snackbar/Snackbar;']: (v, id) => ({ $c: R.klass('Lcom/google/android/material/snackbar/Snackbar;'), $text: H.resString(id) }) } });
  R.def('Lcom/google/android/material/floatingactionbutton/FloatingActionButton;', { access: 0x21, sup: 'Landroid/widget/ImageButton;' });
  R.def('Lcom/google/android/material/button/MaterialButton;', { access: 0x21, sup: 'Landroid/widget/Button;' });
  R.def('Lcom/google/android/material/textfield/TextInputLayout;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;' });
  R.def('Lcom/google/android/material/textfield/TextInputEditText;', { access: 0x21, sup: 'Landroid/widget/EditText;' });
  R.def('Lcom/google/android/material/card/MaterialCardView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;' });
  R.def('Landroidx/cardview/widget/CardView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;' });
  R.def('Landroidx/recyclerview/widget/RecyclerView;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'RecyclerView'), ['setAdapter(Landroidx/recyclerview/widget/RecyclerView$Adapter;)' + V]: (s, a) => H.setRecyclerAdapter(s, a), ['setLayoutManager(Landroidx/recyclerview/widget/RecyclerView$LayoutManager;)' + V]: (s, lm) => { s.$lm = lm; }, ['getAdapter()Landroidx/recyclerview/widget/RecyclerView$Adapter;']: (s) => s.$adapter || null, ['notifyDataSetChanged()' + V]: (s) => H.setRecyclerAdapter(s, s.$adapter), ['setHasFixedSize(Z)' + V]: () => {}, ['getItemAnimator()Landroidx/recyclerview/widget/RecyclerView$ItemAnimator;']: () => null, ['setItemAnimator(Landroidx/recyclerview/widget/RecyclerView$ItemAnimator;)' + V]: () => {}, ['addOnScrollListener(Landroidx/recyclerview/widget/RecyclerView$OnScrollListener;)' + V]: () => {}, ['scrollToPosition(I)' + V]: () => {}, ['smoothScrollToPosition(I)' + V]: () => {} } });
  R.def('Landroidx/recyclerview/widget/RecyclerView$Adapter;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['notifyDataSetChanged()' + V]: (s) => { if (s.$bound) H.setRecyclerAdapter(s.$bound, s); }, ['notifyItemChanged(I)' + V]: (s) => { if (s.$bound) H.setRecyclerAdapter(s.$bound, s); }, ['notifyItemInserted(I)' + V]: (s) => { if (s.$bound) H.setRecyclerAdapter(s.$bound, s); }, ['notifyItemRemoved(I)' + V]: (s) => { if (s.$bound) H.setRecyclerAdapter(s.$bound, s); }, ['getItemCount()' + I]: () => 0, ['setHasStableIds(Z)' + V]: () => {} } });
  R.def('Landroidx/recyclerview/widget/RecyclerView$ViewHolder;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/view/View;)' + V]: (s, v) => { s['Landroidx/recyclerview/widget/RecyclerView$ViewHolder;->itemView:Landroid/view/View;'] = v; s.$itemView = v; }, ['getAdapterPosition()' + I]: (s) => (s.$pos === undefined ? -1 : s.$pos), ['getBindingAdapterPosition()' + I]: (s) => (s.$pos === undefined ? -1 : s.$pos), ['getItemId()' + J]: () => -1 } });
  R.def('Landroidx/recyclerview/widget/RecyclerView$LayoutManager;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/recyclerview/widget/LinearLayoutManager;', { access: 0x21, sup: 'Landroidx/recyclerview/widget/RecyclerView$LayoutManager;', m: { ['<init>(Landroid/content/Context;)' + V]: () => {}, ['<init>(Landroid/content/Context;IZ)' + V]: () => {}, ['scrollToPosition(I)' + V]: () => {} } });
  R.def('Landroidx/recyclerview/widget/GridLayoutManager;', { access: 0x21, sup: 'Landroidx/recyclerview/widget/LinearLayoutManager;', m: { ['<init>(Landroid/content/Context;I)' + V]: () => {} } });
  R.def('Landroidx/recyclerview/widget/RecyclerView$ItemAnimator;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/recyclerview/widget/RecyclerView$OnScrollListener;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/viewpager/widget/ViewPager;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'ViewPager'), ['setAdapter(Landroidx/viewpager/widget/PagerAdapter;)' + V]: () => {}, ['setCurrentItem(I)' + V]: () => {}, ['getCurrentItem()' + I]: () => 0, ['addOnPageChangeListener(Landroidx/viewpager/widget/ViewPager$OnPageChangeListener;)' + V]: () => {} } });
  R.def('Landroidx/viewpager/widget/PagerAdapter;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/viewpager2/widget/ViewPager2;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'ViewPager2'), ['setAdapter(Landroidx/recyclerview/widget/RecyclerView$Adapter;)' + V]: () => {}, ['setCurrentItem(I)' + V]: () => {}, ['getCurrentItem()' + I]: () => 0 } });
  R.def('Lcom/google/android/material/tabs/TabLayout;', { access: 0x21, sup: 'Landroid/widget/HorizontalScrollView;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'TabLayout'), ['addTab(Lcom/google/android/material/tabs/TabLayout$Tab;)' + V]: () => {}, ['newTab()Lcom/google/android/material/tabs/TabLayout$Tab;']: () => ({ $c: R.klass('Lcom/google/android/material/tabs/TabLayout$Tab;') }), ['setupWithViewPager(Landroidx/viewpager/widget/ViewPager;)' + V]: () => {} } });
  R.def('Lcom/google/android/material/tabs/TabLayout$Tab;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setText(Ljava/lang/CharSequence;)Lcom/google/android/material/tabs/TabLayout$Tab;']: (s) => s, ['setText(I)Lcom/google/android/material/tabs/TabLayout$Tab;']: (s) => s } });
  R.def('Lcom/google/android/material/appbar/AppBarLayout;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'LinearLayout') } });
  R.def('Lcom/google/android/material/navigation/NavigationView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'FrameLayout'), ['setNavigationItemSelectedListener(Lcom/google/android/material/navigation/NavigationView$OnNavigationItemSelectedListener;)' + V]: () => {}, ['getMenu()Landroid/view/Menu;']: () => ({ $c: R.klass('Landroid/view/Menu;') }) } });
  R.def('Lcom/google/android/material/navigation/NavigationView$OnNavigationItemSelectedListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/drawerlayout/widget/DrawerLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'FrameLayout'), ['openDrawer(I)' + V]: () => {}, ['closeDrawer(I)' + V]: () => {}, ['closeDrawers()' + V]: () => {}, ['isDrawerOpen(I)' + Z]: () => 0, ['addDrawerListener(Landroidx/drawerlayout/widget/DrawerLayout$DrawerListener;)' + V]: () => {} } });
  R.def('Landroidx/drawerlayout/widget/DrawerLayout$DrawerListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/swiperefreshlayout/widget/SwipeRefreshLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'FrameLayout'), ['setOnRefreshListener(Landroidx/swiperefreshlayout/widget/SwipeRefreshLayout$OnRefreshListener;)' + V]: (s, l) => { s.$onRefresh = l; }, ['setRefreshing(Z)' + V]: () => {}, ['isRefreshing()' + Z]: () => 0 } });
  R.def('Landroidx/swiperefreshlayout/widget/SwipeRefreshLayout$OnRefreshListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/constraintlayout/widget/ConstraintLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'ConstraintLayout'), ['<init>(Landroid/content/Context;Landroid/util/AttributeSet;)' + V]: (s, c) => H.initView(s, 'ConstraintLayout') } });
  R.def('Landroidx/constraintlayout/widget/ConstraintSet;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/coordinatorlayout/widget/CoordinatorLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'FrameLayout') } });
  R.def('Landroidx/core/widget/NestedScrollView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: { ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'ScrollView') } });
  R.def('Landroid/webkit/WebView;', {
    access: 0x21, sup: 'Landroid/view/ViewGroup;',
    m: {
      ['<init>(Landroid/content/Context;)' + V]: (s, c) => H.initView(s, 'WebView'),
      ['<init>(Landroid/content/Context;Landroid/util/AttributeSet;)' + V]: (s, c) => H.initView(s, 'WebView'),
      ['loadUrl(Ljava/lang/String;)' + V]: (s, u) => H.webviewLoad(s, u),
      ['loadUrl(Ljava/lang/String;Ljava/util/Map;)' + V]: (s, u) => H.webviewLoad(s, u),
      ['loadData(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)' + V]: (s, d) => H.webviewData(s, d),
      ['loadDataWithBaseURL(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)' + V]: (s, b, d) => H.webviewData(s, d),
      ['getSettings()Landroid/webkit/WebSettings;']: (s) => s.$settings || (s.$settings = { $c: R.klass('Landroid/webkit/WebSettings;') }),
      ['setWebViewClient(Landroid/webkit/WebViewClient;)' + V]: (s, c) => { s.$client = c; },
      ['setWebChromeClient(Landroid/webkit/WebChromeClient;)' + V]: () => {},
      ['setBackgroundColor(I)' + V]: (s, c) => H.viewSetBackground(s, c),
      ['canGoBack()' + Z]: () => 0, ['canGoForward()' + Z]: () => 0,
      ['goBack()' + V]: () => {}, ['goForward()' + V]: () => {}, ['reload()' + V]: (s) => H.webviewLoad(s, s.$url),
      ['getUrl()' + S]: (s) => s.$url || null,
      ['getTitle()' + S]: () => '',
      ['evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)' + V]: () => {},
      ['addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)' + V]: (s, o, n) => { L('I', 'WebView', `JS bridge "${n}" registered`); },
      ['destroy()' + V]: () => {}, ['clearCache(Z)' + V]: () => {}, ['clearHistory()' + V]: () => {},
      ['setPadding(IIII)' + V]: (s, l, t, r, b) => H.viewSetPadding(s, l, t, r, b),
      ['stopLoading()' + V]: () => {},
    },
  });
  R.def('Landroid/webkit/WebSettings;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setJavaScriptEnabled(Z)' + V]: () => {}, ['setDomStorageEnabled(Z)' + V]: () => {}, ['setBuiltInZoomControls(Z)' + V]: () => {}, ['setDisplayZoomControls(Z)' + V]: () => {}, ['setUseWideViewPort(Z)' + V]: () => {}, ['setLoadWithOverviewMode(Z)' + V]: () => {}, ['setSupportZoom(Z)' + V]: () => {}, ['setAllowFileAccess(Z)' + V]: () => {}, ['setCacheMode(I)' + V]: () => {}, ['setJavaScriptCanOpenWindowsAutomatically(Z)' + V]: () => {}, ['setMediaPlaybackRequiresUserGesture(Z)' + V]: () => {}, ['setTextZoom(I)' + V]: () => {}, ['setUserAgentString(Ljava/lang/String;)' + V]: () => {}, ['getUserAgentString()' + S]: () => (typeof navigator !== 'undefined' ? navigator.userAgent : 'Dex2Web'), ['setDatabaseEnabled(Z)' + V]: () => {}, ['setAppCacheEnabled(Z)' + V]: () => {}, ['setMixedContentMode(I)' + V]: () => {} } });
  R.def('Landroid/webkit/WebViewClient;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)' + Z]: () => 0, ['onPageFinished(Landroid/webkit/WebView;Ljava/lang/String;)' + V]: () => {}, ['onPageStarted(Landroid/webkit/WebView;Ljava/lang/String;Landroid/graphics/Bitmap;)' + V]: () => {}, ['onReceivedError(Landroid/webkit/WebView;ILjava/lang/String;Ljava/lang/String;)' + V]: () => {} } });
  R.def('Landroid/webkit/WebChromeClient;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {} } });
  R.def('Landroid/webkit/ValueCallback;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/webkit/WebResourceRequest;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/opengl/GLES20;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/opengl/GLSurfaceView$Renderer;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/Timer;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['schedule(Ljava/util/TimerTask;' + J + ')' + V]: (s, t, d) => { s.$h = setTimeout(() => safeRun(R, t), Number(d)); }, ['schedule(Ljava/util/TimerTask;' + J + J + ')' + V]: (s, t, delay, period) => { s.$h = setInterval(() => safeRun(R, t), Number(period)); }, ['cancel()' + V]: (s) => { clearTimeout(s.$h); clearInterval(s.$h); } } });
  R.def('Ljava/util/TimerTask;', { access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/Runnable;'], m: { ['<init>()' + V]: () => {}, ['run()' + V]: () => {}, ['cancel()' + Z]: () => 1 } });

  /* R$layout-style framework resources */
  R.def('Landroid/R;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/R$id;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/R$id;->content:I': 0x01020002, 'Landroid/R$id;->home:I': 0x0102002c, 'Landroid/R$id;->title:I': 0x01020037 } });
  R.def('Landroid/R$layout;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/R$string;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/R$string;->ok:I': 0x0104000a, 'Landroid/R$string;->cancel:I': 0x01040000, 'Landroid/R$string;->yes:I': 0x01040013, 'Landroid/R$string;->no:I': 0x01040009 } });
  R.def('Landroid/R$drawable;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/R$attr;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/R$style;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/R$color;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: { 'Landroid/R$color;->white:I': 0x0106000b, 'Landroid/R$color;->black:I': 0x0106000c, 'Landroid/R$color;->transparent:I': 0x01060000, 'Landroid/R$color;->holo_blue_light:I': 0x01060012 } });

  installExtras(R, H, {
    safeRun: (r) => safeRun(R, r),
    arr: (desc, items) => arr(R, desc, items),
    formatDate,
    javaFormat,
    BOOL: (b) => (b ? 1 : 0),
  });

  R.afterPrintStream();

  /* The widget/view layer lives in ui.js so that rendering and shim stay together. */
  return R;
}
