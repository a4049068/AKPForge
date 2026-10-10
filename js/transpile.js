/* transpile.js — turns Dalvik bytecode into executable JavaScript.
 *
 * Strategy
 * --------
 * Every dex method becomes a real JS closure. Dalvik's register file becomes
 * local variables (v0..vN); its arbitrary control flow (gotos, switches,
 * try/catch) becomes a trampoline over basic blocks:
 *
 *     var bb = 0, rv;
 *     for (;;) { try { switch (bb) { case 0: ...; bb = 3; break; ... }
 *                            if (bb < 0) return rv;
 *                      } catch (e) { ...consult the dex try table... } }
 *
 * That is a faithful, structure-preserving transpilation: no control-flow
 * guessing, no SSA, and Java exception semantics fall straight out of JS ones.
 *
 * Method bodies are compiled lazily (on first invocation), so a 2500-class APK
 * loads instantly and only the code the app actually touches gets generated.
 */

import { OPCODES, decodeInsn, decodePayload } from './dexops.js';

/* ---------------- expression templates for binary ops ---------------- */
const BIN = {
  'add-int': '({a} + {b}) | 0', 'sub-int': '({a} - {b}) | 0', 'mul-int': 'Math.imul({a}, {b})',
  'div-int': 'R.divI({a}, {b})', 'rem-int': 'R.remI({a}, {b})',
  'and-int': '({a} & {b})', 'or-int': '({a} | {b})', 'xor-int': '({a} ^ {b})',
  'shl-int': '({a} << ({b} & 31))', 'shr-int': '({a} >> ({b} & 31))', 'ushr-int': '({a} >>> ({b} & 31))',
  'add-long': 'R.addL({a}, {b})', 'sub-long': 'R.subL({a}, {b})', 'mul-long': 'R.mulL({a}, {b})',
  'div-long': 'R.divL({a}, {b})', 'rem-long': 'R.remL({a}, {b})',
  'and-long': 'R.andL({a}, {b})', 'or-long': 'R.orL({a}, {b})', 'xor-long': 'R.xorL({a}, {b})',
  'shl-long': 'R.shlL({a}, {b})', 'shr-long': 'R.shrL({a}, {b})', 'ushr-long': 'R.ushrL({a}, {b})',
  'add-float': 'Math.fround({a} + {b})', 'sub-float': 'Math.fround({a} - {b})',
  'mul-float': 'Math.fround({a} * {b})', 'div-float': 'Math.fround({a} / {b})',
  'rem-float': 'Math.fround({a} % {b})',
  'add-double': '({a} + {b})', 'sub-double': '({a} - {b})', 'mul-double': '({a} * {b})',
  'div-double': '({a} / {b})', 'rem-double': '({a} % {b})',
};
const UN = {
  'neg-int': '-{a} | 0', 'not-int': '~{a}',
  'neg-long': 'R.negL({a})', 'not-long': 'R.notL({a})',
  'neg-float': 'Math.fround(-{a})', 'neg-double': '(-{a})',
  'int-to-long': '({a} | 0)', 'long-to-int': '({a} | 0)',
  'int-to-float': 'Math.fround({a})', 'float-to-int': 'R.f2i({a})',
  'int-to-double': '({a})', 'double-to-int': 'R.d2i({a})',
  'long-to-float': 'R.l2f({a})', 'float-to-long': 'R.f2l({a})',
  'long-to-double': 'R.l2d({a})', 'double-to-long': 'R.d2l({a})',
  'float-to-double': '({a})', 'double-to-float': 'Math.fround({a})',
  'int-to-byte': '({a} << 24 >> 24)', 'int-to-char': '({a} & 0xffff)', 'int-to-short': '({a} << 16 >> 16)',
};
const CMP = {
  'cmpl-float': 'R.cmplF', 'cmpg-float': 'R.cmpgF', 'cmpl-double': 'R.cmplD',
  'cmpg-double': 'R.cmpgD', 'cmp-long': 'R.cmpL',
};
const INVOKE_HELPER = { virtual: 'iv', super: 'iu', direct: 'id', static: 'is', interface: 'iv', polymorphic: 'iv', custom: 'iv' };

/* Typed accessors so byte/char/short/boolean keep Java's narrowing rules. */
const AGET = { 'aget': null, 'aget-wide': null, 'aget-object': 'o', 'aget-boolean': 'b', 'aget-byte': 'y', 'aget-char': 'c', 'aget-short': 's' };
const APUT = { 'aput': null, 'aput-wide': null, 'aput-object': 'o', 'aput-boolean': 'b', 'aput-byte': 'y', 'aput-char': 'c', 'aput-short': 's' };
const IGET = { 'iget': null, 'iget-wide': null, 'iget-object': null, 'iget-boolean': 'b', 'iget-byte': 'y', 'iget-char': 'c', 'iget-short': 's' };
const IPUT = { 'iput': null, 'iput-wide': null, 'iput-object': null, 'iput-boolean': 'b', 'iput-byte': 'y', 'iput-char': 'c', 'iput-short': 's' };
const SGET = { 'sget': null, 'sget-wide': null, 'sget-object': null, 'sget-boolean': 'b', 'sget-byte': 'y', 'sget-char': 'c', 'sget-short': 's' };
const SPUT = { 'sput': null, 'sput-wide': null, 'sput-object': null, 'sput-boolean': 'b', 'sput-byte': 'y', 'sput-char': 'c', 'sput-short': 's' };

export function jsStr(s) {
  let out = JSON.stringify(String(s));
  return out.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
    .replace(/[\ud800-\udfff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function num(n) {
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (Object.is(n, -0)) return '-0';
  return String(n);
}

/** Convert a 64-bit pair into the closest JS number (documented fidelity limit). */
function longFrom(lo, hi) {
  const v = (hi >>> 0) * 4294967296 + (lo >>> 0);
  return v >= 9223372036854775808 ? v - 18446744073709551616 : v;
}

const RETURN_OF = (proto) => proto.slice(proto.indexOf(')') + 1);

/* ================================================================== */
export class Transpiler {
  /**
   * @param {object} runtime  the Dex2Web runtime (R)
   * @param {Array}  dexes    [{name, dex}]
   */
  constructor(runtime, dexes, opts = {}) {
    this.R = runtime;
    this.dexes = dexes;
    this.opts = opts;
    this.stats = { classes: 0, methods: 0, compiled: 0, instructions: 0, bytes: 0, unsupported: new Map(), native: 0, abstractMethods: 0 };
    this.warnings = [];
    this._byDesc = new Map();     // descriptor -> {dex, cd}
    this._compiled = new Map();   // "owner->name+proto" -> fn
    this._sourceCache = new Map();
    this.opcodeHistogram = new Map();
  }

  index() {
    for (const { dex } of this.dexes) {
      this.stats.classes += dex.classDefsSize;
      for (const cd of dex.classDefs) {
        const prev = this._byDesc.get(cd.descriptor);
        if (prev && this.opts.onDuplicate) this.opts.onDuplicate(cd.descriptor);
        if (!prev) this._byDesc.set(cd.descriptor, { dex, cd });
      }
    }
    return this;
  }

  lookup(desc) { return this._byDesc.get(desc); }

  /* ---------- eager phase: declare every class + field layout ---------- */
  declareClasses() {
    for (const [desc, { dex, cd }] of this._byDesc) {
      const statics = cd.staticFields.map((f) => ({ name: f.name, type: f.type, flags: f.accessFlags, key: `${desc}->${f.name}:${f.type}` }));
      const instances = cd.instanceFields.map((f) => ({ name: f.name, type: f.type, flags: f.accessFlags, key: `${desc}->${f.name}:${f.type}` }));
      let initValues = null;
      if (cd.staticValues && cd.staticValues.length) {
        initValues = cd.staticValues.slice(0, statics.length).map((ev) => this._evToRuntime(ev));
      }
      this.R.declareClass({
        desc, name: desc.slice(1, -1).replace(/\//g, '.'),
        superDesc: cd.superDescriptor, interfaces: cd.interfaces,
        accessFlags: cd.accessFlags, statics, instances, initValues,
        sourceFile: cd.sourceFile, fromDex: dex.name,
      });
      // register method *slots* so resolution works before bodies are compiled
      for (const list of [cd.directMethods, cd.virtualMethods]) {
        for (const m of list) {
          this.stats.methods++;
          this.R.declareMethod(desc, m.name, m.proto, m.accessFlags, m.codeOff ? null : (m.accessFlags & 0x100 ? 'native' : 'abstract'));
        }
      }
    }
    return this;
  }

  /** Convert a dex encoded_value into something the runtime understands. */
  _evToRuntime(ev) {
    if (!ev) return null;
    switch (ev.t) {
      case 'byte': case 'short': case 'int': case 'char': case 'boolean': return ev.v;
      case 'long': return typeof ev.v === 'number' ? ev.v : ev.v.number;
      case 'float': case 'double': return ev.v;
      case 'string': return ev.v;
      case 'null': return null;
      case 'type': return { $class: ev.v };
      case 'field': return { $fieldRef: ev.v };
      case 'method': return { $methodRef: ev.v };
      case 'method-type': return { $methodType: ev.v };
      case 'array': return ev.v.map((x) => this._evToRuntime(x));
      case 'annotation': return { $annotation: ev.v.type, elements: (ev.v.elements || []).map((e) => [e.name, this._evToRuntime(e.value)]) };
      default: return null;
    }
  }

  /* ---------- lazy phase: compile a method body on demand ---------- */
  getMethodFn(ownerDesc, name, proto) {
    const key = `${ownerDesc}->${name}${proto}`;
    const hit = this._compiled.get(key);
    if (hit !== undefined) return hit;
    const src = this.methodSource(ownerDesc, name, proto);
    if (src === null) { this._compiled.set(key, null); return null; }
    let fn;
    try {
      fn = new Function('R', `"use strict"; return (${src});`)(this.R);
    } catch (e) {
      this.warn(`codegen failed for ${key}: ${e.message}`);
      fn = null;
    }
    this._compiled.set(key, fn);
    return fn;
  }

  /** Generate the JS source for one method. Returns null if there is no code. */
  methodSource(ownerDesc, name, proto) {
    const ck = `${ownerDesc}->${name}${proto}`;
    if (this._sourceCache.has(ck)) return this._sourceCache.get(ck);
    const found = this._byDesc.get(ownerDesc);
    let src = null;
    if (found) {
      const { dex, cd } = found;
      const lists = [cd.directMethods, cd.virtualMethods];
      for (const list of lists) {
        for (const m of list) {
          if (m.name === name && m.proto === proto) {
            const code = dex.code(cd, m);
            if (code) src = this._emitMethod(dex, cd, m, code);
            break;
          }
        }
        if (src !== null) break;
      }
    }
    this._sourceCache.set(ck, src);
    return src;
  }

  /* -------------------------------------------------------------- */
  _emitMethod(dex, cd, m, code) {
    const N = code.registersSize;
    const INS = code.insSize;
    const useLocals = N <= 160;
    const v = (n) => (useLocals ? `v${n}` : `r[${n}]`);

    /* --- decode all instructions -------------------------------------
     * Two linear sweeps: the first records the address ranges occupied by
     * inline switch / fill-array-data payloads, the second decodes for real
     * while stepping over those ranges so payload bytes are never mistaken
     * for opcodes. */
    const payloadSpans = [];
    {
      let p = 0;
      while (p < code.insnsSize) {
        const ins = decodeInsn(code.code, p, dex);
        if ((ins.kind === 'switch' || ins.kind === 'fillarray') && ins.target >= 0 && ins.target < code.insnsSize) {
          const pl = decodePayload(code.code, ins.target);
          payloadSpans.push([ins.target, ins.target + Math.max(1, pl.width)]);
        }
        p += Math.max(1, ins.width);
      }
      payloadSpans.sort((a, b) => a[0] - b[0]);
    }
    const inPayload = (addr) => {
      for (const [a, b] of payloadSpans) { if (addr >= a && addr < b) return true; if (a > addr) break; }
      return false;
    };
    const insns = [];
    const byAddr = new Map();
    {
      let p = 0;
      while (p < code.insnsSize) {
        if (inPayload(p)) {
          let jump = p + 1;
          for (const [a, b] of payloadSpans) if (p >= a && p < b) { jump = b; break; }
          p = jump;
          continue;
        }
        const ins = decodeInsn(code.code, p, dex);
        if (ins.kind === 'switch' || ins.kind === 'fillarray') {
          const tgt = ins.target;
          if (tgt >= 0 && tgt < code.insnsSize) {
            const pl = decodePayload(code.code, tgt);
            ins.payload = pl; ins.payloadAddr = tgt;
            if (pl.type === 'fill-array') ins.data = readFillArray(code.code, pl);
          }
        }
        if (ins.kind === 'invoke') ins.invokeKind = invokeKindOf(ins.op);
        ins.index_ = insns.length;
        insns.push(ins);
        this.opcodeHistogram.set(ins.name, (this.opcodeHistogram.get(ins.name) || 0) + 1);
        byAddr.set(p, ins);
        p += Math.max(1, ins.width);
      }
    }
    this.stats.instructions += insns.length;
    this.stats.compiled++;

    /* --- basic block leaders (by code address) --- */
    const leaders = new Set([0]);
    for (const i of insns) {
      const end = i.addr + i.width;
      const terminator = i.kind === 'branch' || i.kind === 'return' || i.kind === 'throw' || i.kind === 'switch';
      if (terminator && end < code.insnsSize) leaders.add(end);
      if (i.kind === 'branch' && i.target !== undefined) leaders.add(i.target);
      if (i.kind === 'switch' && i.payload) {
        leaders.add(i.payloadAddr + i.payload.width);           // instruction after the payload
        const ts = i.payload.targets || [];
        for (const t of ts) leaders.add(i.addr + t);
      }
      if (i.kind === 'fillarray' && i.payload) leaders.add(i.payloadAddr + i.payload.width);
    }
    for (const t of code.tries) {
      leaders.add(t.startAddr);
      leaders.add(t.startAddr + t.insnCount);
      for (const h of (t.handlers || [])) leaders.add(h.addr);
    }

    /* --- group instructions into blocks --- */
    const blocks = [];
    const addrToBlock = new Map();
    let cur = null;
    for (let k = 0; k < insns.length; k++) {
      const ins = insns[k];
      if (k === 0 || leaders.has(ins.addr) || !cur) {
        cur = { id: blocks.length, start: ins.addr, end: ins.addr, insns: [], next: -1 };
        blocks.push(cur);
      }
      cur.insns.push(ins);
      addrToBlock.set(ins.addr, cur.id);
      cur.end = ins.addr + ins.width;
    }
    for (let i = 0; i < blocks.length; i++) blocks[i].next = i + 1 < blocks.length ? i + 1 : -1;
    const blockAt = (addr) => {
      const b = addrToBlock.get(addr);
      if (b !== undefined) return b;
      for (const blk of blocks) if (addr >= blk.start && addr < blk.end) return blk.id;
      return -1;
    };

    /* --- try tables, expressed in code addresses --- */
    const hasTries = code.tries.length > 0;
    let TT = null, BA = null;
    if (hasTries) {
      BA = blocks.map((b) => b.start);
      TT = code.tries.map((t) => {
        const handlers = (t.handlers || []).map((h) => {
          const hb = blockAt(h.addr);
          // The register that receives the exception is the operand of the
          // move-exception at the handler entry.
          let reg = null;
          const hi = byAddr.get(h.addr);
          if (hi && hi.op === 0x0d) reg = hi.regs.A;
          return { bb: hb, reg, type: h.type, catchAll: h.catchAll };
        }).filter((h) => h.bb >= 0);
        return { start: t.startAddr, end: t.startAddr + t.insnCount, handlers };
      });
    }

    /* --- emit --- */
    const L = [];
    const ind = '    ';
    L.push(`function () {`);
    L.push(`  /* ${cd.descriptor.slice(1, -1).replace(/\//g, '.')}.${m.name}${m.proto}`);
    L.push(`     registers=${N} ins=${INS} outs=${code.outsSize} units=${code.insnsSize} tries=${code.triesSize} */`);
    if (useLocals) {
      for (let i = 0; i < N; i += 12) L.push(`  var ${Array.from({ length: Math.min(12, N - i) }, (_, k) => `v${i + k}`).join(', ')};`);
    } else {
      L.push(`  var r = new Array(${N});`);
    }
    L.push(`  var _rv, _e;`);
    for (let i = 0; i < INS; i++) L.push(`  ${v(N - INS + i)} = arguments[${i}];`);
    if (hasTries) {
      L.push(`  var BA = ${JSON.stringify(BA)};`);
      L.push(`  var TT = ${JSON.stringify(TT)};`);
    }
    L.push(`  var bb = 0, _steps = 0;`);
    L.push(`  for (;;) {`);
    L.push(`    if (++_steps > R.maxSteps || (R.globalSteps += 1) > R.globalStepLimit) throw new R.VMError("basic-block budget exhausted (infinite loop?)");`);
    L.push(`    try {`);
    L.push(`      switch (bb) {`);

    const dbg = dex.debugInfo(code, m);
    const localName = (reg, addr) => {
      let best = null;
      for (const l of dbg.locals) if (l.reg === reg && addr >= l.start && addr < l.end) best = l;
      return best ? best.name : null;
    };

    for (const b of blocks) {
      L.push(`      case ${b.id}: {`);
      for (let k = 0; k < b.insns.length; k++) {
        const ins = b.insns[k];
        const isLast = k === b.insns.length - 1;
        const line = dbg.lines.get(ins.addr);
        const cmt = [];
        if (line) cmt.push(`L${line}`);
        const ln = localName(ins.regs && ins.regs.A !== undefined ? ins.regs.A : -1, ins.addr);
        if (ln && (ins.kind === 'move' || ins.kind === 'const' || ins.kind === 'field-get' || ins.kind === 'array-get')) cmt.push(`${ln}=v${ins.regs.A}`);
        const stmts = this._emitInsn(ins, dex, code, v, b, blockAt, isLast);
        const head = cmt.length ? `  /* @${ins.addr}${cmt.length ? ' ' + cmt.join(' ') : ''} ${ins.name} */` : `  /* @${ins.addr} ${ins.name} */`;
        if (!stmts.length) { L.push(`        ${head}`); continue; }
        if (stmts.length === 1) L.push(`        ${head} ${stmts[0]}`);
        else { L.push(`        ${head}`); for (const s of stmts) L.push(`          ${s}`); }
      }
      if (!b.insns.length) L.push(`        /* empty block @${b.start} */`);
      // A block that does not end in an explicit terminator must still record
      // its successor in `bb`, otherwise a throw inside the *next* block would
      // report the wrong code address to the dex exception table.
      const lastKind = b.insns.length ? b.insns[b.insns.length - 1].kind : null;
      const selfTerminating = lastKind === 'return' || lastKind === 'throw' || lastKind === 'branch' || lastKind === 'switch';
      if (!selfTerminating) L.push(`        bb = ${b.next}; break;`);
      L.push(`      }`);
    }
    L.push(`      default: throw new R.VMError("bad block " + bb);`);
    L.push(`      }`);
    L.push(`      if (bb < 0) return _rv;`);
    L.push(`    } catch (e) {`);
    if (hasTries) {
      L.push(`      var h = R.catchAt(TT, BA[bb], e);`);
      L.push(`      if (h === null) throw e;`);
      L.push(`      _e = R.exc;`);
      L.push(`      bb = h;`);
    } else {
      L.push(`      throw e;`);
    }
    L.push(`    }`);
    L.push(`  }`);
    L.push(`}`);
    return L.join('\n');
  }

  /** Emit the JS statements for a single decoded instruction. */
  _emitInsn(ins, dex, code, v, block, blockAt, isLast) {
    const R = 'R';
    const A = ins.regs ? ins.regs.A : undefined;
    const B = ins.regs ? ins.regs.B : undefined;
    const C = ins.regs ? ins.regs.C : undefined;
    const out = [];
    const go = (target) => `bb = ${target}; break;`;
    const fall = block.next;
    const finish = (target) => (isLast ? [go(target)] : []);

    switch (ins.kind) {
      case 'nop': return [];

      case 'move':
        if (ins.op === 0x0d) { out.push(`${v(A)} = _e;`); return out; }   // move-exception
        if (ins.op >= 0x0a && ins.op <= 0x0c) { out.push(`${v(A)} = _rv;`); return out; } // move-result*
        out.push(`${v(A)} = ${v(B)};`);
        return out;

      case 'const': {
        switch (ins.op) {
          case 0x12: out.push(`${v(A)} = ${ins.imm};`); break;                       // const/4
          case 0x13: out.push(`${v(A)} = ${ins.imm};`); break;                       // const/16
          case 0x14: out.push(`${v(A)} = ${ins.imm};`); break;                       // const
          case 0x15: out.push(`${v(A)} = ${num(ins.rawImm << 16)};`); break;         // const/high16
          case 0x16: out.push(`${v(A)} = ${ins.imm};`); break;                       // const-wide/16
          case 0x17: out.push(`${v(A)} = ${ins.imm};`); break;                       // const-wide/32
          case 0x18: out.push(`${v(A)} = ${num(longFrom(ins.lo, ins.hi))};`); break; // const-wide
          case 0x19: out.push(`${v(A)} = ${num(ins.rawImm * 281474976710656)};`); break; // const-wide/high16
          case 0x1a: case 0x1b: out.push(`${v(A)} = ${jsStr(dex.string(ins.index) ?? '')};`); break;
          case 0x1c: out.push(`${v(A)} = ${R}.classObject(${jsStr(dex.typeName(ins.index))});`); break;   // const-class yields the java.lang.Class mirror
          case 0xfe: out.push(`${v(A)} = ${R}.methodHandle(${ins.index});`); break;
          case 0xff: out.push(`${v(A)} = ${R}.klass(${jsStr(dex.protoDescriptor(ins.index))});`); break;
          default: out.push(`${v(A)} = undefined; /* unsupported const */`);
        }
        return out;
      }

      case 'monitor': return [`${R}.noop(${v(A)});`];

      case 'cast-check': out.push(`${R}.cc(${v(A)}, ${jsStr(dex.typeName(ins.index))});`); return out;
      case 'instanceof': out.push(`${v(A)} = ${R}.io(${v(B)}, ${jsStr(dex.typeName(ins.index))}) ? 1 : 0;`); return out;
      case 'length': out.push(`${v(A)} = ${R}.al(${v(B)});`); return out;
      case 'new': out.push(`${v(A)} = ${R}.ni(${jsStr(dex.typeName(ins.index))});`); return out;

      case 'newarray':
        if (ins.op === 0x23) out.push(`${v(A)} = ${R}.na(${jsStr(dex.typeName(ins.index))}, ${v(B)});`);
        else {
          const args = ins.args.map((a) => v(a)).join(', ');
          out.push(`_rv = ${R}.fna(${jsStr(dex.typeName(ins.index))}${args ? ', ' + args : ''});`);
        }
        return out;

      case 'fillarray':
        out.push(`${R}.fad(${v(A)}, ${JSON.stringify(ins.data || [])});`);
        return out;

      case 'throw': out.push(`throw ${v(A)};`); return out;

      case 'return':
        if (ins.op === 0x0e) out.push(`_rv = undefined; bb = -1; break;`);
        else out.push(`_rv = ${v(A)}; bb = -1; break;`);
        return out;

      case 'branch': {
        if (ins.op === 0x28 || ins.op === 0x29 || ins.op === 0x2a) {  // goto
          const t = blockAt(ins.target);
          return [go(t >= 0 ? t : fall)];
        }
        if (ins.kind === 'switch') break;
        const t = blockAt(ins.target);
        const f = fall;
        let cond;
        switch (ins.op) {
          case 0x32: cond = `${R}.eq(${v(A)}, ${v(B)})`; break;
          case 0x33: cond = `!${R}.eq(${v(A)}, ${v(B)})`; break;
          case 0x34: cond = `${v(A)} < ${v(B)}`; break;
          case 0x35: cond = `${v(A)} >= ${v(B)}`; break;
          case 0x36: cond = `${v(A)} > ${v(B)}`; break;
          case 0x37: cond = `${v(A)} <= ${v(B)}`; break;
          case 0x38: cond = `${R}.z(${v(A)})`; break;
          case 0x39: cond = `!${R}.z(${v(A)})`; break;
          case 0x3a: cond = `${v(A)} < 0`; break;
          case 0x3b: cond = `${v(A)} >= 0`; break;
          case 0x3c: cond = `${v(A)} > 0`; break;
          case 0x3d: cond = `${v(A)} <= 0`; break;
          default: cond = `false`;
        }
        return [`if (${cond}) { ${go(t >= 0 ? t : f)} }`, go(f)];
      }

      case 'switch': {
        const pl = ins.payload;
        const t = blockAt(ins.addr + ins.width);
        if (!pl) return [go(t)];
        if (pl.type === 'packed') {
          const targets = pl.targets.map((x) => blockAt(ins.addr + x));
          out.push(`{ var _k = (${v(A)} - ${pl.firstKey}) | 0; bb = (_k >= 0 && _k < ${targets.length}) ? ${JSON.stringify(targets)}[_k] : ${t}; }`);
          out.push(`break;`);
          return out;
        }
        if (pl.type === 'sparse') {
          const pairs = pl.keys.map((k, i) => [k, blockAt(ins.addr + pl.targets[i])]);
          out.push(`{ var _k = ${v(A)} | 0, _t = ${t}; var _sp = ${JSON.stringify(pairs)};`);
          out.push(`  for (var _i = 0; _i < _sp.length; _i++) if (_sp[_i][0] === _k) { _t = _sp[_i][1]; break; }`);
          out.push(`  bb = _t; }`);
          out.push(`break;`);
          return out;
        }
        return [go(t)];
      }

      case 'array-get': {
        const t = AGET[ins.name];
        out.push(`${v(A)} = ${t ? `${R}.ag${t}(${v(B)}, ${v(C)})` : `${R}.ag(${v(B)}, ${v(C)})`};`);
        return out;
      }
      case 'array-set': {
        // aput vAA, vBB, vCC  →  array[vCC] = vAA   (A=value, B=array, C=index)
        const t = APUT[ins.name];
        out.push(`${t ? `${R}.ap${t}(${v(B)}, ${v(C)}, ${v(A)})` : `${R}.ap(${v(B)}, ${v(C)}, ${v(A)})`};`);
        return out;
      }

      case 'field-get': {
        if (ins.op >= 0x60) {  // sget
          const t = SGET[ins.name];
          const key = jsStr(dex.fieldKey(ins.index));
          out.push(`${v(A)} = ${t ? `${R}.gs${t}(${key})` : `${R}.gs(${key})`};`);
        } else {
          const t = IGET[ins.name];
          const key = jsStr(dex.fieldKey(ins.index));
          out.push(`${v(A)} = ${t ? `${R}.gf${t}(${v(B)}, ${key})` : `${R}.gf(${v(B)}, ${key})`};`);
        }
        return out;
      }
      case 'field-set': {
        if (ins.op >= 0x67) {  // sput
          const t = SPUT[ins.name];
          const key = jsStr(dex.fieldKey(ins.index));
          out.push(`${t ? `${R}.ps${t}(${key}, ${v(A)})` : `${R}.ps(${key}, ${v(A)})`};`);
        } else {
          const t = IPUT[ins.name];
          const key = jsStr(dex.fieldKey(ins.index));
          out.push(`${t ? `${R}.pf${t}(${v(B)}, ${key}, ${v(A)})` : `${R}.pf(${v(B)}, ${key}, ${v(A)})`};`);
        }
        return out;
      }

      case 'invoke': {
        const helper = INVOKE_HELPER[ins.invokeKind] || 'iv';
        const key = jsStr(dex.methodKey(ins.index));
        const args = ins.args.map((a) => v(a)).join(', ');
        const ret = RETURN_OF(dex.protoDescriptor(dex.methodProtoIdx[ins.index]));
        const call = `${R}.${helper}(${key}${args ? ', ' + args : ''})`;
        if (ret === 'V') out.push(`${call};`);
        else out.push(`_rv = ${call};`);
        return out;
      }

      case 'cmp': {
        const fn = CMP[ins.name];
        out.push(`${v(A)} = ${fn}(${v(B)}, ${v(C)});`);
        return out;
      }

      case 'unop': {
        const tpl = UN[ins.name];
        out.push(tpl ? `${v(A)} = ${tpl.replace(/\{a\}/g, v(B))};` : `${v(A)} = ${v(B)}; /* unsupported ${ins.name} */`);
        return out;
      }
      case 'cast': {
        const tpl = UN[ins.name];
        out.push(tpl ? `${v(A)} = ${tpl.replace(/\{a\}/g, v(B))};` : `${v(A)} = ${v(B)};`);
        return out;
      }

      case 'binop': {
        const tpl = BIN[ins.name];
        out.push(tpl ? `${v(A)} = ${tpl.replace(/\{a\}/g, v(B)).replace(/\{b\}/g, v(C))};` : `${v(A)} = ${v(B)}; /* unsupported ${ins.name} */`);
        return out;
      }
      case 'binop2addr': {
        const base = ins.name.replace('/2addr', '');
        const tpl = BIN[base];
        out.push(tpl ? `${v(A)} = ${tpl.replace(/\{a\}/g, v(A)).replace(/\{b\}/g, v(B))};` : `${v(A)} = ${v(A)};`);
        return out;
      }
      case 'binoplit': {
        let base = ins.name.replace(/\/lit(8|16)/, '');
        if (base === 'rsub-int') {
          out.push(`${v(A)} = (${ins.imm} - ${v(B)}) | 0;`);
          return out;
        }
        const tpl = BIN[base];
        out.push(tpl ? `${v(A)} = ${tpl.replace(/\{a\}/g, v(B)).replace(/\{b\}/g, String(ins.imm))};` : `${v(A)} = ${v(B)};`);
        return out;
      }

      default:
        this.stats.unsupported.set(ins.name, (this.stats.unsupported.get(ins.name) || 0) + 1);
        out.push(`/* unsupported ${ins.name} @${ins.addr} */`);
        return out;
    }
    return out;
  }

  warn(msg) { if (this.warnings.length < 500) this.warnings.push(msg); }

  /* -------------------------------------------------------------- */
  /** Full transpiled source for one class (used by the code viewer). */
  classSource(desc) {
    const found = this._byDesc.get(desc);
    if (!found) return `// ${desc} is not defined in this APK (framework/external class)`;
    const { dex, cd } = found;
    const lines = [];
    lines.push(`/* ══════════ ${desc.slice(1, -1).replace(/\//g, '.')} ══════════`);
    lines.push(`   extends ${cd.superDescriptor || '—'}${cd.interfaces.length ? '\n   implements ' + cd.interfaces.join(', ') : ''}`);
    lines.push(`   source: ${cd.sourceFile || '—'}   access: ${cd.flags || '—'} */`);
    lines.push('');
    if (cd.staticFields.length) lines.push(`/* static fields */`);
    for (const f of cd.staticFields) lines.push(`//   ${f.flags} ${f.name}: ${f.type}`);
    if (cd.instanceFields.length) lines.push(`/* instance fields */`);
    for (const f of cd.instanceFields) lines.push(`//   ${f.flags} ${f.name}: ${f.type}`);
    if (cd.staticFields.length || cd.instanceFields.length) lines.push('');
    for (const list of [cd.directMethods, cd.virtualMethods]) {
      for (const m of list) {
        const code = dex.code(cd, m);
        lines.push(`/* ${m.flags} */`);
        if (!code) { lines.push(`// ${m.name}${m.proto}  — ${(m.accessFlags & 0x100) ? 'native' : 'abstract'}, no bytecode`); lines.push(''); continue; }
        const src = this._emitMethod(dex, cd, m, code);
        lines.push(`R.M(${jsStr(desc)}, ${jsStr(m.name)}, ${jsStr(m.proto)}, ${m.accessFlags},`);
        lines.push(src.split('\n').map((l, i) => (i === 0 ? '  ' + l : l)).join('\n'));
        lines.push(');');
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  /** AOT bundle: everything in one downloadable file. */
  fullSource(onProgress) {
    const parts = [];
    parts.push(`/* =====================================================================`);
    parts.push(` *  Generated by Dex2Web — Dalvik (DEX) → JavaScript transpiler`);
    parts.push(` *  ${new Date().toISOString()}`);
    for (const { name, dex } of this.dexes) {
      const s = dex.stats;
      parts.push(` *  ${name}: dex v${s.version}, ${s.classes} classes, ${s.methods} methods, ${s.insns} instructions`);
    }
    parts.push(` * ===================================================================== */`);
    parts.push(`(function (R) {`);
    parts.push(`"use strict";`);
    parts.push(``);
    const descs = [...this._byDesc.keys()];
    for (let i = 0; i < descs.length; i++) {
      const desc = descs[i];
      const found = this._byDesc.get(desc);
      const cd = found.cd;
      parts.push(`/* ── ${desc.slice(1, -1).replace(/\//g, '.')} ── */`);
      const statics = cd.staticFields.map((f) => [f.name, f.type, f.accessFlags]);
      const instances = cd.instanceFields.map((f) => [f.name, f.type, f.accessFlags]);
      const init = cd.staticValues ? cd.staticValues.slice(0, statics.length).map((ev) => this._evLiteral(ev)) : null;
      parts.push(`R.C(${jsStr(desc)}, ${jsStr(cd.superDescriptor || '')}, ${JSON.stringify(cd.interfaces)}, ${cd.accessFlags},`);
      parts.push(`    ${JSON.stringify(statics)}, ${JSON.stringify(instances)}${init ? ', ' + init : ', null'});`);
      for (const list of [cd.directMethods, cd.virtualMethods]) {
        for (const m of list) {
          const code = found.dex.code(cd, m);
          if (!code) continue;
          const src = this._emitMethod(found.dex, cd, m, code);
          parts.push(`R.M(${jsStr(desc)}, ${jsStr(m.name)}, ${jsStr(m.proto)}, ${m.accessFlags},`);
          parts.push(src.split('\n').map((l) => '    ' + l).join('\n'));
          parts.push(`);`);
        }
      }
      parts.push('');
      if (onProgress && (i % 64) === 0) onProgress(i / descs.length);
    }
    parts.push(`})(typeof Dex2Web !== "undefined" ? Dex2Web.runtime : R);`);
    return parts.join('\n');
  }

  _evLiteral(ev) {
    if (!ev) return 'null';
    switch (ev.t) {
      case 'byte': case 'short': case 'int': case 'char': return String(ev.v);
      case 'boolean': return ev.v ? 'true' : 'false';
      case 'long': return String(typeof ev.v === 'number' ? ev.v : ev.v.number);
      case 'float': case 'double': return String(ev.v);
      case 'string': return jsStr(ev.v);
      case 'null': return 'null';
      case 'type': return `R.klass(${jsStr(ev.v)})`;
      case 'field': return `R.fieldRef(${jsStr(ev.v)})`;
      case 'method': return `R.methodRef(${jsStr(ev.v)})`;
      case 'array': return `[${ev.v.map((x) => this._evLiteral(x)).join(', ')}]`;
      case 'annotation': return `R.annot(${jsStr(ev.v.type)}, [${(ev.v.elements || []).map((e) => `[${jsStr(e.name)}, ${this._evLiteral(e.value)}]`).join(', ')}])`;
      default: return 'null';
    }
  }
}

function invokeKindOf(op) {
  switch (op) {
    case 0x6e: case 0x74: return 'virtual';
    case 0x6f: case 0x75: return 'super';
    case 0x70: case 0x76: return 'direct';
    case 0x71: case 0x77: return 'static';
    case 0x72: case 0x78: return 'interface';
    case 0xfa: case 0xfb: return 'polymorphic';
    case 0xfc: case 0xfd: return 'custom';
    default: return 'virtual';
  }
}

/** Materialise a fill-array-data payload into a JS array of numbers. */
function readFillArray(code, pl) {
  const out = [];
  const dv = new DataView(code.buffer, code.byteOffset, code.byteLength);
  const base = pl.dataStart * 2;
  for (let i = 0; i < pl.size; i++) {
    const off = base + i * pl.elemWidth;
    try {
      if (pl.elemWidth === 1) out.push(dv.getInt8(off));
      else if (pl.elemWidth === 2) out.push(dv.getInt16(off, true));
      else if (pl.elemWidth === 4) out.push(dv.getInt32(off, true));
      else out.push(Number(dv.getBigInt64(off, true)));
    } catch { break; }
  }
  return out;
}

export { invokeKindOf };
