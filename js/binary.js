/* binary.js — low-level binary primitives shared by every parser.
 * No dependencies. Works on a Uint8Array view of an APK entry. */

export class BR {
  constructor(u8, pos = 0) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.pos = pos;
  }
  get remaining() { return this.u8.length - this.pos; }
  get eof() { return this.pos >= this.u8.length; }
  seek(p) { this.pos = p; return this; }
  skip(n) { this.pos += n; return this; }
  tell() { return this.pos; }

  u8v() { return this.u8[this.pos++]; }
  i8v() { return this.dv.getInt8(this.pos++); }
  u16() { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  i16() { const v = this.dv.getInt16(this.pos, true); this.pos += 2; return v; }
  u32() { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  i32() { const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
  /* low 32 bits of a u64 — enough for ZIP64 sizes we will ever see in an APK */
  u64() { const lo = this.dv.getUint32(this.pos, true); const hi = this.dv.getUint32(this.pos + 4, true); this.pos += 8; return hi === 0 ? lo : lo + hi * 4294967296; }

  bytes(n) { const s = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  sub(len) { const s = this.u8.subarray(this.pos, this.pos + len); this.pos += len; return s; }

  latin1(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8[this.pos++]);
    return s;
  }
  nulTerminatedLatin1() {
    let s = '';
    for (;;) { const c = this.u8[this.pos++]; if (c === 0 || c === undefined) break; s += String.fromCharCode(c); }
    return s;
  }
  utf16le(codeUnits) {
    let s = '';
    for (let i = 0; i < codeUnits; i++) { const c = this.dv.getUint16(this.pos, true); this.pos += 2; if (c) s += String.fromCharCode(c); }
    return s;
  }

  uleb128() {
    let result = 0, shift = 0, b;
    do { b = this.u8[this.pos++]; result |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    return result >>> 0;
  }
  uleb128p1() { return (this.uleb128() - 1) | 0; }
  sleb128() {
    let result = 0, shift = 0, b;
    do { b = this.u8[this.pos++]; result |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    if (shift < 32 && (b & 0x40)) result |= -(1 << shift);
    return result | 0;
  }
}

/* --- MUTF-8 (modified UTF-8 as used by DEX string_data_item) --- */
export function decodeMutf8(u8, start) {
  const parts = [];
  let i = start;
  const lim = u8.length;
  while (i < lim) {
    const a = u8[i++];
    if (a === 0) break;
    if (a < 0x80) { parts.push(String.fromCharCode(a)); }
    else if ((a & 0xe0) === 0xc0) {
      const b = u8[i++] & 0x3f;
      parts.push(String.fromCharCode(((a & 0x1f) << 6) | b));
    } else if ((a & 0xf0) === 0xe0) {
      const b = u8[i++] & 0x3f, c = u8[i++] & 0x3f;
      parts.push(String.fromCharCode(((a & 0x0f) << 12) | (b << 6) | c));
    } else {
      const b = u8[i++] & 0x3f, c = u8[i++] & 0x3f, d = u8[i++] & 0x3f;
      parts.push(String.fromCodePoint(((a & 0x07) << 18) | (b << 12) | (c << 6) | d));
    }
  }
  return parts.join('');
}

/* Scan forward for the terminating NUL of a MUTF-8 string (needed to size slices). */
export function mutf8Length(u8, start) {
  let i = start;
  while (i < u8.length && u8[i] !== 0) i++;
  return i - start + 1;
}

/* --- Pure-JS raw DEFLATE (RFC 1951). Only used when DecompressionStream is absent. --- */
export function inflateRawSync(src, maxSize = 512 * 1024 * 1024) {
  let srcPos = 0, bitBuf = 0, bitCnt = 0;
  let out = new Uint8Array(Math.max(1024, Math.min(src.length * 3, 1 << 22)));
  let outLen = 0;
  const grow = (need) => {
    if (outLen + need <= out.length) return;
    let cap = out.length;
    while (cap < outLen + need) cap *= 2;
    if (cap > maxSize) throw new Error('inflate: output exceeds size limit');
    const g = new Uint8Array(cap); g.set(out.subarray(0, outLen)); out = g;
  };
  const push = (b) => { grow(1); out[outLen++] = b; };

  const bits = (n) => {
    while (bitCnt < n) {
      if (srcPos >= src.length) throw new Error('inflate: unexpected end of input');
      bitBuf |= src[srcPos++] << bitCnt; bitCnt += 8;
    }
    const v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n; bitCnt -= n;
    return v;
  };

  function buildHuffman(lengths) {
    const maxBits = 15;
    const blCount = new Int32Array(maxBits + 1);
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) blCount[lengths[i]]++;
    blCount[0] = 0;
    const nextCode = new Int32Array(maxBits + 2);
    let code = 0;
    for (let b = 1; b <= maxBits; b++) { code = (code + blCount[b - 1]) << 1; nextCode[b] = code; }
    const codes = new Int32Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) codes[i] = nextCode[lengths[i]]++;
    const table = new Int32Array(1 << maxBits);
    const size = new Uint8Array(1 << maxBits);
    for (let i = 0; i < lengths.length; i++) {
      const len = lengths[i];
      if (!len) continue;
      let c = codes[i], rev = 0;
      for (let b = 0; b < len; b++) { rev = (rev << 1) | (c & 1); c >>>= 1; }
      // `rev` occupies the low `len` bits of the index; the remaining high bits are
      // the next (unconsumed) stream bits, so stride by 2**len.
      const step = 1 << len;
      for (let k = rev; k < (1 << maxBits); k += step) { table[k] = i; size[k] = len; }
    }
    return { table, size, maxBits };
  }

  const decode = (h) => {
    while (bitCnt < h.maxBits) {
      if (srcPos >= src.length) break;
      bitBuf |= src[srcPos++] << bitCnt; bitCnt += 8;
    }
    const idx = bitBuf & ((1 << h.maxBits) - 1);
    const len = h.size[idx];
    if (!len) throw new Error('inflate: invalid Huffman code');
    bitBuf >>>= len; bitCnt -= len;
    return h.table[idx];
  };

  const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  let fixedLit = null, fixedDist = null;
  const getFixed = () => {
    if (!fixedLit) {
      const l = new Uint8Array(288);
      for (let i = 0; i < 144; i++) l[i] = 8;
      for (let i = 144; i < 256; i++) l[i] = 9;
      for (let i = 256; i < 280; i++) l[i] = 7;
      for (let i = 280; i < 288; i++) l[i] = 8;
      fixedLit = buildHuffman(l);
      fixedDist = buildHuffman(new Uint8Array(30).fill(5));
    }
    return [fixedLit, fixedDist];
  };

  let blocks = 0;
  for (;;) {
    if (++blocks > 1000000) throw new Error('inflate: too many blocks');
    const last = bits(1), type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;                       // align to byte boundary
      if (srcPos + 4 > src.length) throw new Error('inflate: truncated stored block');
      const len = src[srcPos] | (src[srcPos + 1] << 8);
      const nlen = src[srcPos + 2] | (src[srcPos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error('inflate: bad stored block lengths');
      srcPos += 4;
      if (srcPos + len > src.length) throw new Error('inflate: truncated stored data');
      grow(len); out.set(src.subarray(srcPos, srcPos + len), outLen); outLen += len; srcPos += len;
    } else if (type === 1 || type === 2) {
      let litH, distH;
      if (type === 1) { [litH, distH] = getFixed(); }
      else {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3);
        const clH = buildHuffman(cl);
        const lengths = new Uint8Array(hlit + hdist);
        let n = 0;
        while (n < lengths.length) {
          const sym = decode(clH);
          if (sym < 16) { lengths[n++] = sym; }
          else if (sym === 16) { const prev = lengths[n - 1] || 0; let c = 3 + bits(2); while (c--) lengths[n++] = prev; }
          else if (sym === 17) { let c = 3 + bits(3); while (c--) lengths[n++] = 0; }
          else { let c = 11 + bits(7); while (c--) lengths[n++] = 0; }
        }
        litH = buildHuffman(lengths.subarray(0, hlit));
        distH = buildHuffman(lengths.subarray(hlit));
      }
      for (;;) {
        const sym = decode(litH);
        if (sym < 256) { push(sym); }
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          if (li >= LEN_BASE.length) throw new Error('inflate: invalid length symbol');
          const length = LEN_BASE[li] + bits(LEN_EXTRA[li]);
          const dsym = decode(distH);
          if (dsym >= DIST_BASE.length) throw new Error('inflate: invalid distance symbol');
          const dist = DIST_BASE[dsym] + bits(DIST_EXTRA[dsym]);
          if (dist > outLen) throw new Error('inflate: distance beyond start of output');
          grow(length);
          const start = outLen - dist;
          for (let i = 0; i < length; i++) out[outLen++] = out[start + i];
        }
      }
    } else throw new Error('inflate: reserved block type');
    if (last) break;
  }
  const result = new Uint8Array(outLen);
  result.set(out.subarray(0, outLen));
  return result;
}

/* --- misc helpers --- */
export const utf8 = new TextDecoder('utf-8');
export function decodeUtf8(u8) { return utf8.decode(u8); }
export function crc32(u8) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  }
  let crc = -1;
  for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ table[(crc ^ u8[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
