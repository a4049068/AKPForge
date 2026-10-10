/* dexops.js — the complete Dalvik opcode table plus instruction decoding. */

/* Instruction format identifiers (see the Dalvik bytecode reference). */
export const FMT = {
  '10x': 1, '12x': 1, '11n': 1, '11x': 1, '10t': 1,
  '20t': 2, '20bc': 2, '21t': 2, '21s': 2, '21h': 2, '21c': 2,
  '22x': 2, '22t': 2, '22s': 2, '22b': 2, '22c': 2, '22cs': 2, '23x': 2,
  '30t': 3, '31i': 3, '31t': 3, '31c': 3, '32x': 3,
  '35c': 3, '35ms': 3, '35mi': 3, '3rc': 3, '3rms': 3, '3rmi': 3,
  '45cc': 4, '4rcc': 4, '51l': 5,
};

function o(name, fmt, kind) { return { name, fmt, kind }; }

const U = o('unused', '10x', 'nop');

/* kind values:
 *   nop, move, const, branch, return, invoke, field-get, field-set,
 *   array-get, array-set, unop, binop, binop2addr, binoplit, cmp, cast,
 *   new, newarray, fillarray, switch, throw, monitor, cast-check, instanceof,
 *   length, switchdata, other
 */
export const OPCODES = (() => {
  const t = new Array(256).fill(null);
  const set = (i, name, fmt, kind) => { t[i] = o(name, fmt, kind); };

  set(0x00, 'nop', '10x', 'nop');
  set(0x01, 'move', '12x', 'move');
  set(0x02, 'move/from16', '22x', 'move');
  set(0x03, 'move/16', '32x', 'move');
  set(0x04, 'move-wide', '12x', 'move');
  set(0x05, 'move-wide/from16', '22x', 'move');
  set(0x06, 'move-wide/16', '32x', 'move');
  set(0x07, 'move-object', '12x', 'move');
  set(0x08, 'move-object/from16', '22x', 'move');
  set(0x09, 'move-object/16', '32x', 'move');
  set(0x0a, 'move-result', '11x', 'move');
  set(0x0b, 'move-result-wide', '11x', 'move');
  set(0x0c, 'move-result-object', '11x', 'move');
  set(0x0d, 'move-exception', '11x', 'move');
  set(0x0e, 'return-void', '10x', 'return');
  set(0x0f, 'return', '11x', 'return');
  set(0x10, 'return-wide', '11x', 'return');
  set(0x11, 'return-object', '11x', 'return');
  set(0x12, 'const/4', '11n', 'const');
  set(0x13, 'const/16', '21s', 'const');
  set(0x14, 'const', '31i', 'const');
  set(0x15, 'const/high16', '21h', 'const');
  set(0x16, 'const-wide/16', '21s', 'const');
  set(0x17, 'const-wide/32', '31i', 'const');
  set(0x18, 'const-wide', '51l', 'const');
  set(0x19, 'const-wide/high16', '21h', 'const');
  set(0x1a, 'const-string', '21c', 'const');
  set(0x1b, 'const-string/jumbo', '31c', 'const');
  set(0x1c, 'const-class', '21c', 'const');
  set(0x1d, 'monitor-enter', '11x', 'monitor');
  set(0x1e, 'monitor-exit', '11x', 'monitor');
  set(0x1f, 'check-cast', '21c', 'cast-check');
  set(0x20, 'instance-of', '22c', 'instanceof');
  set(0x21, 'array-length', '12x', 'length');
  set(0x22, 'new-instance', '21c', 'new');
  set(0x23, 'new-array', '22c', 'newarray');
  set(0x24, 'filled-new-array', '35c', 'newarray');
  set(0x25, 'filled-new-array/range', '3rc', 'newarray');
  set(0x26, 'fill-array-data', '31t', 'fillarray');
  set(0x27, 'throw', '11x', 'throw');
  set(0x28, 'goto', '10t', 'branch');
  set(0x29, 'goto/16', '20t', 'branch');
  set(0x2a, 'goto/32', '30t', 'branch');
  set(0x2b, 'packed-switch', '31t', 'switch');
  set(0x2c, 'sparse-switch', '31t', 'switch');
  set(0x2d, 'cmpl-float', '23x', 'cmp');
  set(0x2e, 'cmpg-float', '23x', 'cmp');
  set(0x2f, 'cmpl-double', '23x', 'cmp');
  set(0x30, 'cmpg-double', '23x', 'cmp');
  set(0x31, 'cmp-long', '23x', 'other');
  set(0x32, 'if-eq', '22t', 'branch');
  set(0x33, 'if-ne', '22t', 'branch');
  set(0x34, 'if-lt', '22t', 'branch');
  set(0x35, 'if-ge', '22t', 'branch');
  set(0x36, 'if-gt', '22t', 'branch');
  set(0x37, 'if-le', '22t', 'branch');
  set(0x38, 'if-eqz', '21t', 'branch');
  set(0x39, 'if-nez', '21t', 'branch');
  set(0x3a, 'if-ltz', '21t', 'branch');
  set(0x3b, 'if-gez', '21t', 'branch');
  set(0x3c, 'if-gtz', '21t', 'branch');
  set(0x3d, 'if-lez', '21t', 'branch');
  t[0x3e] = U;
  t[0x3f] = U;
  t[0x40] = U;
  t[0x41] = U;
  t[0x42] = U;
  t[0x43] = U;
  set(0x44, 'aget', '23x', 'array-get');
  set(0x45, 'aget-wide', '23x', 'array-get');
  set(0x46, 'aget-object', '23x', 'array-get');
  set(0x47, 'aget-boolean', '23x', 'array-get');
  set(0x48, 'aget-byte', '23x', 'array-get');
  set(0x49, 'aget-char', '23x', 'array-get');
  set(0x4a, 'aget-short', '23x', 'array-get');
  set(0x4b, 'aput', '23x', 'array-set');
  set(0x4c, 'aput-wide', '23x', 'array-set');
  set(0x4d, 'aput-object', '23x', 'array-set');
  set(0x4e, 'aput-boolean', '23x', 'array-set');
  set(0x4f, 'aput-byte', '23x', 'array-set');
  set(0x50, 'aput-char', '23x', 'array-set');
  set(0x51, 'aput-short', '23x', 'array-set');
  set(0x52, 'iget', '22c', 'field-get');
  set(0x53, 'iget-wide', '22c', 'field-get');
  set(0x54, 'iget-object', '22c', 'field-get');
  set(0x55, 'iget-boolean', '22c', 'field-get');
  set(0x56, 'iget-byte', '22c', 'field-get');
  set(0x57, 'iget-char', '22c', 'field-get');
  set(0x58, 'iget-short', '22c', 'field-get');
  set(0x59, 'iput', '22c', 'field-set');
  set(0x5a, 'iput-wide', '22c', 'field-set');
  set(0x5b, 'iput-object', '22c', 'field-set');
  set(0x5c, 'iput-boolean', '22c', 'field-set');
  set(0x5d, 'iput-byte', '22c', 'field-set');
  set(0x5e, 'iput-char', '22c', 'field-set');
  set(0x5f, 'iput-short', '22c', 'field-set');
  set(0x60, 'sget', '21c', 'field-get');
  set(0x61, 'sget-wide', '21c', 'field-get');
  set(0x62, 'sget-object', '21c', 'field-get');
  set(0x63, 'sget-boolean', '21c', 'field-get');
  set(0x64, 'sget-byte', '21c', 'field-get');
  set(0x65, 'sget-char', '21c', 'field-get');
  set(0x66, 'sget-short', '21c', 'field-get');
  set(0x67, 'sput', '21c', 'field-set');
  set(0x68, 'sput-wide', '21c', 'field-set');
  set(0x69, 'sput-object', '21c', 'field-set');
  set(0x6a, 'sput-boolean', '21c', 'field-set');
  set(0x6b, 'sput-byte', '21c', 'field-set');
  set(0x6c, 'sput-char', '21c', 'field-set');
  set(0x6d, 'sput-short', '21c', 'field-set');
  set(0x6e, 'invoke-virtual', '35c', 'invoke');
  set(0x6f, 'invoke-super', '35c', 'invoke');
  set(0x70, 'invoke-direct', '35c', 'invoke');
  set(0x71, 'invoke-static', '35c', 'invoke');
  set(0x72, 'invoke-interface', '35c', 'invoke');
  t[0x73] = U;
  set(0x74, 'invoke-virtual/range', '3rc', 'invoke');
  set(0x75, 'invoke-super/range', '3rc', 'invoke');
  set(0x76, 'invoke-direct/range', '3rc', 'invoke');
  set(0x77, 'invoke-static/range', '3rc', 'invoke');
  set(0x78, 'invoke-interface/range', '3rc', 'invoke');
  t[0x79] = U;
  t[0x7a] = U;
  set(0x7b, 'neg-int', '12x', 'other');
  set(0x7c, 'not-int', '12x', 'other');
  set(0x7d, 'neg-long', '12x', 'other');
  set(0x7e, 'not-long', '12x', 'other');
  set(0x7f, 'neg-float', '12x', 'other');
  set(0x80, 'neg-double', '12x', 'other');
  set(0x81, 'int-to-long', '12x', 'cast');
  set(0x82, 'int-to-float', '12x', 'cast');
  set(0x83, 'int-to-double', '12x', 'cast');
  set(0x84, 'long-to-int', '12x', 'cast');
  set(0x85, 'long-to-float', '12x', 'cast');
  set(0x86, 'long-to-double', '12x', 'cast');
  set(0x87, 'float-to-int', '12x', 'cast');
  set(0x88, 'float-to-long', '12x', 'cast');
  set(0x89, 'float-to-double', '12x', 'cast');
  set(0x8a, 'double-to-int', '12x', 'cast');
  set(0x8b, 'double-to-long', '12x', 'cast');
  set(0x8c, 'double-to-float', '12x', 'cast');
  set(0x8d, 'int-to-byte', '12x', 'cast');
  set(0x8e, 'int-to-char', '12x', 'cast');
  set(0x8f, 'int-to-short', '12x', 'cast');
  set(0x90, 'add-int', '23x', 'binop');
  set(0x91, 'sub-int', '23x', 'binop');
  set(0x92, 'mul-int', '23x', 'binop');
  set(0x93, 'div-int', '23x', 'binop');
  set(0x94, 'rem-int', '23x', 'binop');
  set(0x95, 'and-int', '23x', 'binop');
  set(0x96, 'or-int', '23x', 'binop');
  set(0x97, 'xor-int', '23x', 'binop');
  set(0x98, 'shl-int', '23x', 'binop');
  set(0x99, 'shr-int', '23x', 'binop');
  set(0x9a, 'ushr-int', '23x', 'binop');
  set(0x9b, 'add-long', '23x', 'binop');
  set(0x9c, 'sub-long', '23x', 'binop');
  set(0x9d, 'mul-long', '23x', 'binop');
  set(0x9e, 'div-long', '23x', 'binop');
  set(0x9f, 'rem-long', '23x', 'binop');
  set(0xa0, 'and-long', '23x', 'binop');
  set(0xa1, 'or-long', '23x', 'binop');
  set(0xa2, 'xor-long', '23x', 'binop');
  set(0xa3, 'shl-long', '23x', 'binop');
  set(0xa4, 'shr-long', '23x', 'binop');
  set(0xa5, 'ushr-long', '23x', 'binop');
  set(0xa6, 'add-float', '23x', 'binop');
  set(0xa7, 'sub-float', '23x', 'binop');
  set(0xa8, 'mul-float', '23x', 'binop');
  set(0xa9, 'div-float', '23x', 'binop');
  set(0xaa, 'rem-float', '23x', 'binop');
  set(0xab, 'add-double', '23x', 'binop');
  set(0xac, 'sub-double', '23x', 'binop');
  set(0xad, 'mul-double', '23x', 'binop');
  set(0xae, 'div-double', '23x', 'binop');
  set(0xaf, 'rem-double', '23x', 'binop');
  set(0xb0, 'add-int/2addr', '12x', 'binop2addr');
  set(0xb1, 'sub-int/2addr', '12x', 'binop2addr');
  set(0xb2, 'mul-int/2addr', '12x', 'binop2addr');
  set(0xb3, 'div-int/2addr', '12x', 'binop2addr');
  set(0xb4, 'rem-int/2addr', '12x', 'binop2addr');
  set(0xb5, 'and-int/2addr', '12x', 'binop2addr');
  set(0xb6, 'or-int/2addr', '12x', 'binop2addr');
  set(0xb7, 'xor-int/2addr', '12x', 'binop2addr');
  set(0xb8, 'shl-int/2addr', '12x', 'binop2addr');
  set(0xb9, 'shr-int/2addr', '12x', 'binop2addr');
  set(0xba, 'ushr-int/2addr', '12x', 'binop2addr');
  set(0xbb, 'add-long/2addr', '12x', 'binop2addr');
  set(0xbc, 'sub-long/2addr', '12x', 'binop2addr');
  set(0xbd, 'mul-long/2addr', '12x', 'binop2addr');
  set(0xbe, 'div-long/2addr', '12x', 'binop2addr');
  set(0xbf, 'rem-long/2addr', '12x', 'binop2addr');
  set(0xc0, 'and-long/2addr', '12x', 'binop2addr');
  set(0xc1, 'or-long/2addr', '12x', 'binop2addr');
  set(0xc2, 'xor-long/2addr', '12x', 'binop2addr');
  set(0xc3, 'shl-long/2addr', '12x', 'binop2addr');
  set(0xc4, 'shr-long/2addr', '12x', 'binop2addr');
  set(0xc5, 'ushr-long/2addr', '12x', 'binop2addr');
  set(0xc6, 'add-float/2addr', '12x', 'binop2addr');
  set(0xc7, 'sub-float/2addr', '12x', 'binop2addr');
  set(0xc8, 'mul-float/2addr', '12x', 'binop2addr');
  set(0xc9, 'div-float/2addr', '12x', 'binop2addr');
  set(0xca, 'rem-float/2addr', '12x', 'binop2addr');
  set(0xcb, 'add-double/2addr', '12x', 'binop2addr');
  set(0xcc, 'sub-double/2addr', '12x', 'binop2addr');
  set(0xcd, 'mul-double/2addr', '12x', 'binop2addr');
  set(0xce, 'div-double/2addr', '12x', 'binop2addr');
  set(0xcf, 'rem-double/2addr', '12x', 'binop2addr');
  set(0xd0, 'add-int/lit16', '22s', 'binoplit');
  set(0xd1, 'rsub-int', '22s', 'other');
  set(0xd2, 'mul-int/lit16', '22s', 'binoplit');
  set(0xd3, 'div-int/lit16', '22s', 'binoplit');
  set(0xd4, 'rem-int/lit16', '22s', 'binoplit');
  set(0xd5, 'and-int/lit16', '22s', 'binoplit');
  set(0xd6, 'or-int/lit16', '22s', 'binoplit');
  set(0xd7, 'xor-int/lit16', '22s', 'binoplit');
  set(0xd8, 'add-int/lit8', '22b', 'binoplit');
  set(0xd9, 'rsub-int/lit8', '22b', 'other');
  set(0xda, 'mul-int/lit8', '22b', 'binoplit');
  set(0xdb, 'div-int/lit8', '22b', 'binoplit');
  set(0xdc, 'rem-int/lit8', '22b', 'binoplit');
  set(0xdd, 'and-int/lit8', '22b', 'binoplit');
  set(0xde, 'or-int/lit8', '22b', 'binoplit');
  set(0xdf, 'xor-int/lit8', '22b', 'binoplit');
  set(0xe0, 'shl-int/lit8', '22b', 'binoplit');
  set(0xe1, 'shr-int/lit8', '22b', 'binoplit');
  set(0xe2, 'ushr-int/lit8', '22b', 'binoplit');
  t[0xe3] = U;
  t[0xe4] = U;
  t[0xe5] = U;
  t[0xe6] = U;
  t[0xe7] = U;
  t[0xe8] = U;
  t[0xe9] = U;
  t[0xea] = U;
  t[0xeb] = U;
  t[0xec] = U;
  t[0xed] = U;
  t[0xee] = U;
  t[0xef] = U;
  t[0xf0] = U;
  t[0xf1] = U;
  t[0xf2] = U;
  t[0xf3] = U;
  t[0xf4] = U;
  t[0xf5] = U;
  t[0xf6] = U;
  t[0xf7] = U;
  t[0xf8] = U;
  t[0xf9] = U;
  set(0xfa, 'invoke-polymorphic', '45cc', 'invoke');
  set(0xfb, 'invoke-polymorphic/range', '4rcc', 'invoke');
  set(0xfc, 'invoke-custom', '35c', 'invoke');
  set(0xfd, 'invoke-custom/range', '3rc', 'invoke');
  set(0xfe, 'const-method-handle', '21c', 'const');
  set(0xff, 'const-method-type', '21c', 'const');
  // normalise kinds that the generated table could not infer from name alone
  for (const op of t) {
    if (!op || op.name === 'unused') continue;
    const n = op.name;
    if (/^(cmpl-|cmpg-|cmp-)/.test(n)) op.kind = 'cmp';
    else if (/^(neg-|not-)/.test(n)) op.kind = 'unop';
    else if (n === 'rsub-int' || n === 'rsub-int/lit8') op.kind = 'binoplit';
    else if (/-to-/.test(n) && op.kind === 'other') op.kind = 'cast';
  }
  for (let i = 0; i < 256; i++) if (!t[i]) t[i] = U;
  return t;
})();

export const INVOKE_KIND = {
  0x6e: 'virtual', 0x6f: 'super', 0x70: 'direct', 0x71: 'static', 0x72: 'interface',
  0x74: 'virtual', 0x75: 'super', 0x76: 'direct', 0x77: 'static', 0x78: 'interface',
  0xfa: 'polymorphic', 0xfb: 'polymorphic', 0xfc: 'custom', 0xfd: 'custom',
};

/** Width, in 16-bit code units, of the instruction starting at `pc`. */
export function insnWidth(code, pc) {
  const op = code[pc] & 0xff;
  const fmt = OPCODES[op].fmt;
  if (fmt === '10x' || fmt === '12x' || fmt === '11n' || fmt === '11x' || fmt === '10t') return 1;
  if (fmt === '20t' || fmt === '20bc' || fmt === '21t' || fmt === '21s' || fmt === '21h' || fmt === '21c' ||
      fmt === '22x' || fmt === '22t' || fmt === '22s' || fmt === '22b' || fmt === '22c' || fmt === '22cs' || fmt === '23x') return 2;
  if (fmt === '30t' || fmt === '31i' || fmt === '31t' || fmt === '31c' || fmt === '32x' ||
      fmt === '35c' || fmt === '35ms' || fmt === '35mi' || fmt === '3rc' || fmt === '3rms' || fmt === '3rmi') return 3;
  if (fmt === '45cc' || fmt === '4rcc') return 4;
  if (fmt === '51l') return 5;
  return 1;
}

/**
 * Decode a single instruction into a structured record.
 *  { addr, op, opcode, name, fmt, kind, width, regs:{}, imm, target, index, args:[], size16 }
 */
export function decodeInsn(code, pc, dex) {
  const u0 = code[pc];
  const op = u0 & 0xff;
  const spec = OPCODES[op];
  const hi = (u0 >> 8) & 0xff;
  const A = hi & 0x0f, B = (hi >> 4) & 0x0f;
  const AA = hi;
  const r = { addr: pc, op, opcode: op, name: spec.name, fmt: spec.fmt, kind: spec.kind };
  const u = (k) => code[pc + k];
  const i16 = (v) => (v << 16) >> 16;

  switch (spec.fmt) {
    case '10x': r.regs = {}; r.imm = AA; break;
    case '12x': r.regs = { A, B }; break;
    case '11n': r.regs = { A }; r.imm = (B < 8) ? B : B - 16; break;
    case '11x': r.regs = { A: AA }; break;
    case '10t': r.imm = (AA << 24) >> 24; r.target = pc + r.imm; break;
    case '20t': r.imm = i16(u(1)); r.target = pc + r.imm; break;
    case '20bc': r.regs = { A: AA }; r.imm = u(1); break;
    case '21t': r.regs = { A: AA }; r.imm = i16(u(1)); r.target = pc + r.imm; break;
    case '21s': r.regs = { A: AA }; r.imm = i16(u(1)); break;
    case '21h': {
      r.regs = { A: AA };
      const v = u(1);
      r.imm = (op === 0x15) ? (v << 16) : (v << 16) >>> 0;
      r.rawImm = v;
      break;
    }
    case '21c': r.regs = { A: AA }; r.index = u(1); break;
    case '22x': r.regs = { A: AA, B: u(1) }; break;
    case '22t': r.regs = { A, B }; r.imm = i16(u(1)); r.target = pc + r.imm; break;
    case '22s': r.regs = { A, B }; r.imm = i16(u(1)); break;
    case '22b': r.regs = { A: AA, B: u(1) & 0xff }; r.imm = (u(1) >> 8) << 24 >> 24; break;
    case '22c': case '22cs': r.regs = { A, B }; r.index = u(1); break;
    case '23x': r.regs = { A: AA, B: u(1) & 0xff, C: (u(1) >> 8) & 0xff }; break;
    case '30t': r.imm = (u(1) | (u(2) << 16)) | 0; r.target = pc + r.imm; break;
    case '31i': r.regs = { A: AA }; r.imm = (u(1) | (u(2) << 16)) | 0; r.rawU32 = (u(1) | (u(2) << 16)) >>> 0; break;
    case '31t': r.regs = { A: AA }; r.imm = (u(1) | (u(2) << 16)) | 0; r.target = pc + r.imm; break;
    case '31c': r.regs = { A: AA }; r.index = (u(1) | (u(2) << 16)) >>> 0; break;
    case '32x': r.regs = { A: u(1), B: u(2) }; break;
    case '35c': case '35ms': case '35mi': {
      // layout is  A|G|op  BBBB  F|E|D|C  — A (arg count) is the HIGH nibble of unit 0.
      const count = B;
      r.index = u(1);
      const g = A, c = u(2) & 0xf, d = (u(2) >> 4) & 0xf, e = (u(2) >> 8) & 0xf, f = (u(2) >> 12) & 0xf;
      r.args = count <= 0 ? [] : count === 1 ? [c] : count === 2 ? [c, d] : count === 3 ? [c, d, e] : count === 4 ? [c, d, e, f] : [c, d, e, f, g];
      r.count = count; r.regs = { A: count };
      break;
    }
    case '3rc': case '3rms': case '3rmi': {
      r.count = AA; r.index = u(1);
      const base = u(2);
      r.args = []; for (let i = 0; i < AA; i++) r.args.push((base + i) & 0xffff);
      r.rangeBase = base;
      break;
    }
    case '45cc': {
      const count = B;
      r.index = u(1);
      r.index2 = u(3);
      const g = A, c = u(2) & 0xf, d = (u(2) >> 4) & 0xf, e = (u(2) >> 8) & 0xf, f = (u(2) >> 12) & 0xf;
      const args = count === 5 ? [c, d, e, f, g] : [c, d, e, f].slice(0, count);
      r.args = args; r.count = count;
      break;
    }
    case '4rcc': {
      r.count = AA; r.index = u(1); r.index2 = u(3);
      const base = u(2);
      r.args = []; for (let i = 0; i < AA; i++) r.args.push((base + i) & 0xffff);
      break;
    }
    case '51l': {
      r.regs = { A: AA };
      const lo = (u(1) | (u(2) << 16)) >>> 0;
      const hi32 = (u(3) | (u(4) << 16)) >>> 0;
      r.imm = lo + hi32 * 4294967296;
      r.lo = lo; r.hi = hi32;
      break;
    }
  }
  r.width = insnWidth(code, pc);
  return r;
}

/** Read a switch / fill-array-data payload located at `addr`. */
export function decodePayload(code, addr) {
  const ident = code[addr];
  if (ident === 0x0100) {
    const size = code[addr + 1];
    const firstKey = (code[addr + 2] | (code[addr + 3] << 16)) | 0;
    const targets = [];
    for (let i = 0; i < size; i++) targets.push((code[addr + 4 + i * 2] | (code[addr + 5 + i * 2] << 16)) | 0);
    return { type: 'packed', size, firstKey, targets, width: 4 + size * 2 };
  }
  if (ident === 0x0200) {
    const size = code[addr + 1];
    const keys = [], targets = [];
    for (let i = 0; i < size; i++) keys.push((code[addr + 2 + i * 2] | (code[addr + 3 + i * 2] << 16)) | 0);
    for (let i = 0; i < size; i++) targets.push((code[addr + 2 + size * 2 + i * 2] | (code[addr + 3 + size * 2 + i * 2] << 16)) | 0);
    return { type: 'sparse', size, keys, targets, width: 2 + size * 4 };
  }
  if (ident === 0x0300) {
    const elemWidth = code[addr + 1];
    const size = (code[addr + 2] | (code[addr + 3] << 16)) >>> 0;
    const dataStart = addr + 4;
    return { type: 'fill-array', elemWidth, size, dataStart, width: 4 + Math.ceil(size * elemWidth / 2) };
  }
  return { type: 'unknown', width: 1 };
}
