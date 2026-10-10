/* dex.js — a full reader for the Dalvik Executable (DEX) container format. */

import { BR, decodeMutf8 } from './binary.js';
import { decodeInsn, insnWidth, decodePayload, OPCODES, INVOKE_KIND } from './dexops.js';

export const ACC = {
  PUBLIC: 0x1, PRIVATE: 0x2, PROTECTED: 0x4, STATIC: 0x8, FINAL: 0x10,
  SYNCHRONIZED: 0x20, VOLATILE: 0x40, BRIDGE: 0x40, TRANSIENT: 0x80, VARARGS: 0x80,
  NATIVE: 0x100, INTERFACE: 0x200, ABSTRACT: 0x400, STRICTFP: 0x800,
  SYNTHETIC: 0x1000, ANNOTATION: 0x2000, ENUM: 0x4000, CONSTRUCTOR: 0x10000,
  DECLARED_SYNCHRONIZED: 0x20000,
};

const CLASS_FLAGS = [
  [0x1, 'public'], [0x2, 'private'], [0x4, 'protected'], [0x8, 'static'], [0x10, 'final'],
  [0x200, 'interface'], [0x400, 'abstract'], [0x1000, 'synthetic'], [0x2000, 'annotation'], [0x4000, 'enum'],
];
const MEMBER_FLAGS = [
  [0x1, 'public'], [0x2, 'private'], [0x4, 'protected'], [0x8, 'static'], [0x10, 'final'],
  [0x20, 'synchronized'], [0x40, 'volatile/bridge'], [0x80, 'transient/varargs'],
  [0x100, 'native'], [0x400, 'abstract'], [0x800, 'strictfp'], [0x1000, 'synthetic'],
  [0x10000, 'constructor'],
];
export function flagsToString(f, isClass) {
  const t = isClass ? CLASS_FLAGS : MEMBER_FLAGS;
  const out = [];
  for (const [bit, name] of t) if (f & bit) out.push(name);
  return out.join(' ');
}

const MAGIC = new Uint8Array([0x64, 0x65, 0x78, 0x0a]); // "dex\n" + 3 version digits + NUL

export class DexFile {
  /** @param {Uint8Array} u8 raw classesN.dex bytes */
  constructor(u8, name = 'classes.dex') {
    this.raw = u8;
    this.name = name;
    this._strCache = new Array(0);
    this._parse();
  }

  _parse() {
    const r = new BR(this.raw, 0);
    const magic = r.bytes(8);
    for (let i = 0; i < 4; i++) if (magic[i] !== MAGIC[i]) throw new Error(`Not a DEX file (bad magic in ${this.name})`);
    this.version = decodeMutf8(magic, 4).replace(/\0.*$/, '');
    this.checksum = r.u32();
    this.signature = Array.from(r.bytes(20)).map((b) => b.toString(16).padStart(2, '0')).join('');
    this.fileSize = r.u32();
    this.headerSize = r.u32();
    this.endianTag = r.u32();
    this.linkSize = r.u32(); this.linkOff = r.u32();
    this.mapOff = r.u32();
    this.stringIdsSize = r.u32(); this.stringIdsOff = r.u32();
    this.typeIdsSize = r.u32(); this.typeIdsOff = r.u32();
    this.protoIdsSize = r.u32(); this.protoIdsOff = r.u32();
    this.fieldIdsSize = r.u32(); this.fieldIdsOff = r.u32();
    this.methodIdsSize = r.u32(); this.methodIdsOff = r.u32();
    this.classDefsSize = r.u32(); this.classDefsOff = r.u32();
    this.dataSize = r.u32(); this.dataOff = r.u32();

    // string_id_item[] -> data offsets
    this.stringDataOff = new Uint32Array(this.stringIdsSize);
    r.seek(this.stringIdsOff);
    for (let i = 0; i < this.stringIdsSize; i++) this.stringDataOff[i] = r.u32();
    this._strCache = new Array(this.stringIdsSize);

    // type_id_item[] -> descriptor string index
    r.seek(this.typeIdsOff);
    this.typeDescIdx = new Uint32Array(this.typeIdsSize);
    for (let i = 0; i < this.typeIdsSize; i++) this.typeDescIdx[i] = r.u32();

    // proto_id_item[]
    this.protos = new Array(this.protoIdsSize);
    r.seek(this.protoIdsOff);
    for (let i = 0; i < this.protoIdsSize; i++) {
      this.protos[i] = { shortyIdx: r.u32(), returnTypeIdx: r.u32(), parametersOff: r.u32() };
    }
    // materialise parameter type lists
    for (let i = 0; i < this.protoIdsSize; i++) {
      const p = this.protos[i];
      if (p.parametersOff === 0) { p.params = []; continue; }
      const pr = new BR(this.raw, p.parametersOff);
      const n = pr.u32();
      const arr = new Uint16Array(n);
      for (let k = 0; k < n; k++) arr[k] = pr.u16();
      p.params = arr;
    }

    // field_id_item[]
    r.seek(this.fieldIdsOff);
    this.fieldClassIdx = new Uint16Array(this.fieldIdsSize);
    this.fieldTypeIdx = new Uint16Array(this.fieldIdsSize);
    this.fieldNameIdx = new Uint32Array(this.fieldIdsSize);
    for (let i = 0; i < this.fieldIdsSize; i++) {
      this.fieldClassIdx[i] = r.u16(); this.fieldTypeIdx[i] = r.u16(); this.fieldNameIdx[i] = r.u32();
    }

    // method_id_item[]
    r.seek(this.methodIdsOff);
    this.methodClassIdx = new Uint16Array(this.methodIdsSize);
    this.methodProtoIdx = new Uint16Array(this.methodIdsSize);
    this.methodNameIdx = new Uint32Array(this.methodIdsSize);
    for (let i = 0; i < this.methodIdsSize; i++) {
      this.methodClassIdx[i] = r.u16(); this.methodProtoIdx[i] = r.u16(); this.methodNameIdx[i] = r.u32();
    }

    // class_def_item[]
    r.seek(this.classDefsOff);
    this.classDefs = new Array(this.classDefsSize);
    for (let i = 0; i < this.classDefsSize; i++) {
      const cd = {
        index: i,
        classIdx: r.u32(),
        accessFlags: r.u32(),
        superclassIdx: r.u32(),
        interfacesOff: r.u32(),
        sourceFileIdx: r.u32(),
        annotationsOff: r.u32(),
        classDataOff: r.u32(),
        staticValuesOff: r.u32(),
      };
      cd.descriptor = this.typeName(cd.classIdx);
      cd.superDescriptor = cd.superclassIdx === 0xffffffff ? null : this.typeName(cd.superclassIdx);
      cd.sourceFile = cd.sourceFileIdx === 0xffffffff ? null : this.string(cd.sourceFileIdx);
      cd.interfaces = [];
      if (cd.interfacesOff) {
        const ir = new BR(this.raw, cd.interfacesOff);
        const n = ir.u32();
        for (let k = 0; k < n; k++) cd.interfaces.push(this.typeName(ir.u16()));
      }
      cd.flags = flagsToString(cd.accessFlags, true);
      if (cd.classDataOff) this._parseClassData(cd);
      else { cd.staticFields = []; cd.instanceFields = []; cd.directMethods = []; cd.virtualMethods = []; }
      if (cd.staticValuesOff) cd.staticValues = this._parseEncodedArray(cd.staticValuesOff);
      this.classDefs[i] = cd;
    }

    this.byDescriptor = new Map();
    for (const cd of this.classDefs) this.byDescriptor.set(cd.descriptor, cd);

    this._parseMapList();
  }

  /* ---------------- strings ---------------- */
  string(i) {
    if (i === 0xffffffff || i == null || i < 0 || i >= this.stringIdsSize) return null;
    let s = this._strCache[i];
    if (s === undefined) {
      const r = new BR(this.raw, this.stringDataOff[i]);
      r.uleb128();                       // utf16 length (advisory)
      s = decodeMutf8(this.raw, r.pos);
      this._strCache[i] = s;
    }
    return s;
  }
  typeName(typeIdx) {
    if (typeIdx === 0xffffffff || typeIdx == null || typeIdx >= this.typeIdsSize) return null;
    return this.string(this.typeDescIdx[typeIdx]);
  }
  typeIdxForDescriptor(desc) {
    if (!this._typeMap) {
      this._typeMap = new Map();
      for (let i = 0; i < this.typeIdsSize; i++) this._typeMap.set(this.string(this.typeDescIdx[i]), i);
    }
    const v = this._typeMap.get(desc);
    return v === undefined ? -1 : v;
  }
  fieldName(fieldIdx) { return this.string(this.fieldNameIdx[fieldIdx]); }
  fieldDescriptor(fieldIdx) { return this.typeName(this.fieldTypeIdx[fieldIdx]); }
  fieldOwner(fieldIdx) { return this.typeName(this.fieldClassIdx[fieldIdx]); }
  methodName(methodIdx) { return this.string(this.methodNameIdx[methodIdx]); }
  methodOwner(methodIdx) { return this.typeName(this.methodClassIdx[methodIdx]); }
  protoDescriptor(protoIdx) {
    const p = this.protos[protoIdx];
    if (!p) return '()V';
    const ret = this.typeName(p.returnTypeIdx) || 'V';
    const ps = Array.from(p.params || []).map((t) => this.typeName(t) || '?').join('');
    return `(${ps})${ret}`;
  }
  methodSignature(methodIdx) {
    return `${this.methodName(methodIdx)}${this.protoDescriptor(this.methodProtoIdx[methodIdx])}`;
  }
  methodKey(methodIdx) {
    return `${this.methodOwner(methodIdx)}->${this.methodSignature(methodIdx)}`;
  }
  fieldKey(fieldIdx) {
    return `${this.fieldOwner(fieldIdx)}->${this.fieldName(fieldIdx)}:${this.fieldDescriptor(fieldIdx)}`;
  }

  /* ---------------- class data ---------------- */
  _parseClassData(cd) {
    const r = new BR(this.raw, cd.classDataOff);
    const sf = r.uleb128(), inf = r.uleb128(), dm = r.uleb128(), vm = r.uleb128();
    const readFields = (n) => {
      const out = []; let idx = 0;
      for (let i = 0; i < n; i++) {
        idx += r.uleb128();
        const flags = r.uleb128();
        out.push({ fieldIdx: idx, accessFlags: flags, flags: flagsToString(flags, false), name: this.fieldName(idx), type: this.fieldDescriptor(idx), owner: this.fieldOwner(idx) });
      }
      return out;
    };
    const readMethods = (n) => {
      const out = []; let idx = 0;
      for (let i = 0; i < n; i++) {
        idx += r.uleb128();
        const flags = r.uleb128();
        const codeOff = r.uleb128();
        out.push({
          methodIdx: idx, accessFlags: flags, codeOff,
          flags: flagsToString(flags, false),
          name: this.methodName(idx),
          proto: this.protoDescriptor(this.methodProtoIdx[idx]),
          owner: this.methodOwner(idx),
          code: null,
        });
      }
      return out;
    };
    cd.staticFields = readFields(sf);
    cd.instanceFields = readFields(inf);
    cd.directMethods = readMethods(dm);
    cd.virtualMethods = readMethods(vm);
  }

  /** Lazily decode (and cache) the code_item for an encoded method. */
  code(cd, m) {
    if (m.code) return m.code;
    if (!m.codeOff) return null;
    m.code = this._parseCode(m.codeOff);
    return m.code;
  }

  _parseCode(off) {
    const r = new BR(this.raw, off);
    const registersSize = r.u16();
    const insSize = r.u16();
    const outsSize = r.u16();
    const triesSize = r.u16();
    const debugInfoOff = r.u32();
    const insnsSize = r.u32();
    if (insnsSize > 0x4000000 || off + 16 + insnsSize * 2 > this.raw.length) {
      throw new Error(`code_item at 0x${off.toString(16)} claims ${insnsSize} code units (out of range)`);
    }
    const code = new Uint16Array(insnsSize);
    for (let i = 0; i < insnsSize; i++) code[i] = r.u16();
    if (triesSize > 0 && (insnsSize & 1)) r.skip(2); // alignment padding
    const tries = [];
    for (let i = 0; i < triesSize; i++) {
      const startAddr = r.u32(), insnCount = r.u16(), handlerOff = r.u16();
      tries.push({ startAddr, insnCount, handlerOff, handlers: null });
    }
    if (triesSize > 0) {
      const handlersBase = r.pos; // handler offsets are relative to the start of the handler list
      const list = this._parseCatchHandlers(handlersBase);
      for (const t of tries) t.handlers = list.get(t.handlerOff) || [];
    }
    return { registersSize, insSize, outsSize, triesSize, debugInfoOff, insnsSize, code, tries, off };
  }

  _parseCatchHandlers(base) {
    const map = new Map();
    const r = new BR(this.raw, base);
    const count = r.uleb128();
    if (count > 1000000) return map;
    for (let i = 0; i < count; i++) {
      const here = r.pos - base;
      const size = r.sleb128();
      const handlers = [];
      const n = Math.min(Math.abs(size), 65536);
      for (let k = 0; k < n; k++) {
        const typeIdx = r.uleb128();
        const addr = r.uleb128();
        handlers.push({ type: this.typeName(typeIdx), addr, catchAll: false });
      }
      if (size <= 0) handlers.push({ type: null, addr: r.uleb128(), catchAll: true });
      map.set(here, handlers);
      if (r.eof) break;
    }
    return map;
  }

  /* ---------------- encoded values ---------------- */
  _parseEncodedValue(r) {
    const b = r.u8v();
    const type = b & 0x1f;
    const arg = (b >> 5) & 0x7;
    const readN = (n, signed) => {
      let lo = 0, hi = 0;
      const bytes = [];
      for (let i = 0; i < n; i++) bytes.push(r.u8v());
      if (n <= 4) {
        for (let i = n - 1; i >= 0; i--) lo = (lo << 8) | bytes[i];
        return signed ? (lo << (32 - n * 8)) >> (32 - n * 8) : lo >>> 0;
      }
      for (let i = 0; i < 4; i++) lo |= bytes[i] << (i * 8);
      for (let i = 4; i < 8; i++) hi |= bytes[i] << ((i - 4) * 8);
      return { lo: lo >>> 0, hi: hi >>> 0, number: (lo >>> 0) + (hi >>> 0) * 4294967296 };
    };
    switch (type) {
      case 0x00: return { t: 'byte', v: readN(arg + 1, true) };
      case 0x02: return { t: 'short', v: readN(arg + 1, true) };
      case 0x03: return { t: 'char', v: readN(arg + 1, false) };
      case 0x04: return { t: 'int', v: readN(arg + 1, true) };
      case 0x06: return { t: 'long', v: readN(arg + 1, true) };
      case 0x10: {
        // The stored bytes are the HIGH bytes of the IEEE-754 value, big-endian.
        const n = arg + 1; let u = 0;
        for (let i = 0; i < n; i++) u = u * 256 + r.u8v();
        const dv = new DataView(new ArrayBuffer(4));
        dv.setUint32(0, (u * Math.pow(2, 8 * (4 - n))) >>> 0);
        return { t: 'float', v: dv.getFloat32(0) };
      }
      case 0x11: {
        const n = arg + 1; let u = 0n;
        for (let i = 0; i < n; i++) u = (u << 8n) | BigInt(r.u8v());
        u = u << BigInt(8 * (8 - n));
        const dv = new DataView(new ArrayBuffer(8));
        dv.setBigUint64(0, u & 0xffffffffffffffffn);
        return { t: 'double', v: dv.getFloat64(0) };
      }
      case 0x15: return { t: 'method-type', v: this.protoDescriptor(r.u32() & 0xffff) };
      case 0x17: return { t: 'string', v: this.string(r.uleb128()) };
      case 0x18: return { t: 'type', v: this.typeName(r.uleb128()) };
      case 0x19: case 0x1b: return { t: 'field', v: this.fieldKey(r.uleb128()) };
      case 0x1a: return { t: 'method', v: this.methodKey(r.uleb128()) };
      case 0x1c: return { t: 'array', v: this._parseEncodedArray(r.pos, r) };
      case 0x1d: return { t: 'annotation', v: this._parseAnnotation(r) };
      case 0x1e: return { t: 'null', v: null };
      case 0x1f: return { t: 'boolean', v: arg !== 0 };
      default: return { t: `unknown(0x${type.toString(16)})`, v: null };
    }
  }

  _parseEncodedArray(off, reader) {
    const r = reader || new BR(this.raw, off);
    const n = r.uleb128();
    const out = [];
    for (let i = 0; i < n; i++) out.push(this._parseEncodedValue(r));
    return out;
  }

  _parseAnnotation(r) {
    const visibility = r.u8v();
    const typeIdx = r.uleb128();
    const n = r.uleb128();
    const elems = [];
    for (let i = 0; i < n; i++) {
      const nameIdx = r.uleb128();
      elems.push({ name: this.string(nameIdx), value: this._parseEncodedValue(r) });
    }
    return { visibility, type: this.typeName(typeIdx), elements: elems };
  }

  /* ---------------- debug info ---------------- */
  /**
   * Run the debug_info state machine. Returns
   *   { lineStart, params:[names], locals:[{reg,name,type,start,end}], lines:Map<addr,line>, file }
   */
  debugInfo(code, m) {
    const empty = { lineStart: 0, params: [], locals: [], lines: new Map(), file: null };
    if (!code || !code.debugInfoOff) return empty;
    const r = new BR(this.raw, code.debugInfoOff);
    let line = r.uleb128();
    const paramCount = r.uleb128();
    const params = [];
    for (let i = 0; i < paramCount; i++) { const idx = r.uleb128p1(); params.push(idx === -1 ? null : this.string(idx)); }
    const locals = [];
    const lines = new Map();
    let addr = 0;
    let file = null;
    let guard = 0;
    while (!r.eof && guard++ < 4000000) {
      const opcode = r.u8v();
      if (opcode === 0x00) break;
      else if (opcode === 0x01) addr += r.uleb128();
      else if (opcode === 0x02) line += r.sleb128();
      else if (opcode === 0x03) {
        const reg = r.uleb128(); const n = r.uleb128p1(); const t = r.uleb128p1();
        locals.push({ reg, name: n === -1 ? null : this.string(n), type: t === -1 ? null : this.typeName(t), start: addr, end: Infinity });
      } else if (opcode === 0x04) {
        const reg = r.uleb128(); const n = r.uleb128p1(); const t = r.uleb128p1(); r.uleb128p1();
        locals.push({ reg, name: n === -1 ? null : this.string(n), type: t === -1 ? null : this.typeName(t), start: addr, end: Infinity });
      } else if (opcode === 0x05) {
        const reg = r.uleb128();
        for (let i = locals.length - 1; i >= 0; i--) if (locals[i].reg === reg && locals[i].end === Infinity) { locals[i].end = addr; break; }
      } else if (opcode === 0x06) {
        const reg = r.uleb128();
        for (let i = locals.length - 1; i >= 0; i--) if (locals[i].reg === reg && locals[i].end !== Infinity) { locals[i].start = addr; locals[i].end = Infinity; break; }
      } else if (opcode === 0x07 || opcode === 0x08) { /* prologue end / epilogue begin */ }
      else if (opcode === 0x09) { const n = r.uleb128p1(); file = n === -1 ? null : this.string(n); }
      else if (opcode >= 0x0a) {
        const adj = opcode - 0x0b;
        line += (adj % 15) - 4;
        addr += Math.floor(adj / 15);
        lines.set(addr, line);
      } else break;
    }
    return { lineStart: line, params, locals, lines, file };
  }

  /* ---------------- map list ---------------- */
  _parseMapList() {
    this.map = [];
    if (!this.mapOff) return;
    const r = new BR(this.raw, this.mapOff);
    const n = r.u32();
    for (let i = 0; i < n; i++) {
      const type = r.u16(); r.u16();
      const size = r.u32(); const off = r.u32();
      this.map.push({ type, size, off, name: MAP_NAMES[type] || `0x${type.toString(16)}` });
    }
  }

  /* ---------------- disassembly ---------------- */
  /** Decode every instruction of a method into a flat list. */
  disassemble(cd, m) {
    const code = this.code(cd, m);
    if (!code) return [];
    const out = [];
    let pc = 0;
    while (pc < code.insnsSize) {
      const ins = decodeInsn(code.code, pc, this);
      if (ins.kind === 'switch' || ins.kind === 'fillarray') {
        const tgt = ins.target;
        if (tgt >= 0 && tgt < code.insnsSize) {
          ins.payload = decodePayload(code.code, tgt);
          ins.payloadAddr = tgt;
        }
      }
      if (ins.kind === 'invoke') ins.invokeKind = INVOKE_KIND[ins.op] || 'virtual';
      out.push(ins);
      pc += Math.max(1, ins.width);
    }
    return out;
  }

  get stats() {
    let methods = 0, codeBytes = 0, insns = 0;
    for (const cd of this.classDefs) {
      for (const list of [cd.directMethods, cd.virtualMethods]) {
        for (const m of list) {
          methods++;
          const c = this.code(cd, m);
          if (c) { codeBytes += c.insnsSize * 2; insns += c.insnsSize; }
        }
      }
    }
    return { classes: this.classDefsSize, strings: this.stringIdsSize, types: this.typeIdsSize, methods, fields: this.fieldIdsSize, protos: this.protoIdsSize, codeBytes, insns, version: this.version, fileSize: this.fileSize };
  }
}

const MAP_NAMES = {
  0x0000: 'HEADER_ITEM', 0x0001: 'STRING_ID_ITEM', 0x0002: 'TYPE_ID_ITEM', 0x0003: 'PROTO_ID_ITEM',
  0x0004: 'FIELD_ID_ITEM', 0x0005: 'METHOD_ID_ITEM', 0x0006: 'CLASS_DEF_ITEM', 0x1000: 'MAP_LIST',
  0x2000: 'TYPE_LIST', 0x2001: 'ANNOTATION_SET_REF_LIST', 0x2002: 'ANNOTATION_SET_ITEM',
  0x2003: 'CLASS_DATA_ITEM', 0x2004: 'CODE_ITEM', 0x2005: 'STRING_DATA_ITEM', 0x2006: 'DEBUG_INFO_ITEM',
  0x2007: 'ANNOTATION_ITEM', 0x2008: 'ENCODED_ARRAY_ITEM', 0x2009: 'ANNOTATIONS_DIRECTORY_ITEM',
};
