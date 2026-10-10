/* axml.js — parser for Android's compiled binary XML (AXML), used for
 * AndroidManifest.xml, res/layout/*.xml, res/xml/*.xml, drawable vectors, etc. */

import { BR, decodeUtf8 } from './binary.js';

/* ------------------------------------------------------------------ */
/* ResStringPool — shared by AXML and resources.arsc                   */
/* ------------------------------------------------------------------ */
export class ResStringPool {
  constructor(u8, chunkOffset) {
    this.strings = [];
    this.styles = [];
    this.utf8 = false;
    if (!u8) return;
    const r = new BR(u8, chunkOffset);
    const type = r.u16();
    const headerSize = r.u16();
    const size = r.u32();
    if (type !== 0x0001) throw new Error(`ResStringPool: unexpected chunk type 0x${type.toString(16)}`);
    const stringCount = r.u32();
    const styleCount = r.u32();
    const flags = r.u32();
    const stringsStart = r.u32();
    const stylesStart = r.u32();
    this.utf8 = !!(flags & (1 << 8));
    this.sorted = !!(flags & 1);

    const offs = new Uint32Array(stringCount);
    for (let i = 0; i < stringCount; i++) offs[i] = r.u32();
    const styleOffs = new Uint32Array(styleCount);
    for (let i = 0; i < styleCount; i++) styleOffs[i] = r.u32();

    const base = chunkOffset + stringsStart;
    for (let i = 0; i < stringCount; i++) {
      this.strings.push(this._readAt(u8, base + offs[i]));
    }
    this.chunkSize = size;
    this.headerSize = headerSize;
  }

  _readAt(u8, p) {
    if (p < 0 || p >= u8.length) return '';
    if (this.utf8) {
      const chars = readLen16(u8, p); p += chars.size;      // UTF-16 char count (advisory)
      const blen = readLen16(u8, p); p += blen.size;        // byte length
      const end = Math.min(u8.length, p + blen.value);
      return decodeUtf8(u8.subarray(p, end));
    } else {
      let n = u8[p] | (u8[p + 1] << 8); p += 2;
      if (n & 0x8000) { n = ((n & 0x7fff) << 16) | (u8[p] | (u8[p + 1] << 8)); p += 2; }
      const parts = [];
      for (let i = 0; i < n && p + 1 < u8.length; i++) { parts.push(String.fromCharCode(u8[p] | (u8[p + 1] << 8))); p += 2; }
      return parts.join('');
    }
  }

  get(i) { return (i === 0xffffffff || i == null || i < 0 || i >= this.strings.length) ? null : this.strings[i]; }
  get size() { return this.strings.length; }
}

/** ResStringPool length prefix: 1 or 2 bytes, high bit means "two-byte form". */
function readLen16(u8, p) {
  const b0 = u8[p];
  if (b0 & 0x80) return { value: ((b0 & 0x7f) << 8) | u8[p + 1], size: 2 };
  return { value: b0, size: 1 };
}

/* ------------------------------------------------------------------ */
/* Typed values                                                          */
/* ------------------------------------------------------------------ */
export const TYPE = {
  NULL: 0x00, REFERENCE: 0x01, ATTRIBUTE: 0x02, STRING: 0x03, FLOAT: 0x04,
  DIMENSION: 0x05, FRACTION: 0x06, DYNAMIC_REFERENCE: 0x07, DYNAMIC_ATTRIBUTE: 0x08,
  INT_DEC: 0x10, INT_HEX: 0x11, INT_BOOLEAN: 0x12,
  INT_COLOR_ARGB8: 0x1c, INT_COLOR_RGB8: 0x1d, INT_COLOR_ARGB4: 0x1e, INT_COLOR_RGB4: 0x1f,
};

const DIM_UNITS = ['px', 'dip', 'sp', 'pt', 'in', 'mm'];
const FRACTION_UNITS = ['%', '%p'];

export function formatTypedValue(tv, pool) {
  switch (tv.dataType) {
    case TYPE.NULL: return null;
    case TYPE.REFERENCE: return { ref: tv.data, text: `@0x${tv.data.toString(16)}` };
    case TYPE.DYNAMIC_REFERENCE: return { ref: tv.data, text: `@0x${tv.data.toString(16)}` };
    case TYPE.STRING: { const s = pool ? pool.get(tv.data) : null; return s; }
    case TYPE.FLOAT: { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, tv.data >>> 0); return b.getFloat32(0); }
    case TYPE.DIMENSION: {
      const v = tv.data; const unit = DIM_UNITS[v & 0xf];
      const raw = (v & 0xffffff00) >> 8;
      const val = (v & 0xff000000) ? (raw | 0) / 256 : raw;
      return { dim: val, unit, text: `${val}${unit}` };
    }
    case TYPE.FRACTION: {
      const v = tv.data; const unit = FRACTION_UNITS[(v & 0xf) >> 0] || '%';
      const val = ((v >> 4) & 0xffffff) / 16384;
      return { fraction: val, unit, text: `${val.toFixed(2)}${unit}` };
    }
    case TYPE.INT_DEC: return tv.data | 0;
    case TYPE.INT_HEX: return tv.data >>> 0;
    case TYPE.INT_BOOLEAN: return tv.data !== 0;
    case TYPE.INT_COLOR_ARGB8:
    case TYPE.INT_COLOR_RGB8:
    case TYPE.INT_COLOR_ARGB4:
    case TYPE.INT_COLOR_RGB4: return { color: argbToCss(tv.data, tv.dataType), text: `#${(tv.data >>> 0).toString(16).padStart(8, '0')}` };
    default: return tv.data >>> 0;
  }
}

export function argbToCss(data, dataType) {
  let a = 255, r = 0, g = 0, b = 0;
  if (dataType === TYPE.INT_COLOR_ARGB8) { a = (data >>> 24) & 0xff; r = (data >>> 16) & 0xff; g = (data >>> 8) & 0xff; b = data & 0xff; }
  else if (dataType === TYPE.INT_COLOR_RGB8) { r = (data >>> 16) & 0xff; g = (data >>> 8) & 0xff; b = data & 0xff; }
  else if (dataType === TYPE.INT_COLOR_ARGB4) { a = ((data >>> 12) & 0xf) * 17; r = ((data >>> 8) & 0xf) * 17; g = ((data >>> 4) & 0xf) * 17; b = (data & 0xf) * 17; }
  else { r = ((data >>> 8) & 0xf) * 17; g = ((data >>> 4) & 0xf) * 17; b = (data & 0xf) * 17; }
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/* ------------------------------------------------------------------ */
/* AXML document parser                                                  */
/* ------------------------------------------------------------------ */
export const NODE = {
  START_NS: 0x0100, END_NS: 0x0101, START_ELEMENT: 0x0102,
  END_ELEMENT: 0x0103, CDATA: 0x0104,
};

/**
 * Parse an AXML blob into a plain tree:
 *   { tag, ns, attrs:[{name, ns, value, rawValue, dataType, data, resourceId}], children:[] }
 */
export function parseAxml(u8) {
  const r = new BR(u8, 0);
  const rootType = r.u16();
  const rootHeaderSize = r.u16();
  const rootSize = r.u32();
  if (rootType !== 0x0003) throw new Error(`Not an AXML file (chunk type 0x${rootType.toString(16)}, expected 0x0003)`);

  let pool = null;
  let resourceMap = null;
  const root = { tag: '#document', ns: null, attrs: [], children: [] };
  const stack = [root];
  const prefixes = [];

  const end = Math.min(rootSize, u8.length);
  while (r.pos + 8 <= end) {
    const cStart = r.pos;
    const type = r.u16();
    const headerSize = r.u16();
    const size = r.u32();
    if (size < 8 || cStart + size > u8.length) break;
    const body = cStart + headerSize;

    switch (type) {
      case 0x0001:
        pool = new ResStringPool(u8, cStart);
        break;

      case 0x0180: { // resource map
        const n = Math.floor((size - headerSize) / 4);
        resourceMap = new Uint32Array(n);
        const rr = new BR(u8, body);
        for (let i = 0; i < n; i++) resourceMap[i] = rr.u32();
        break;
      }

      case NODE.START_NS: {
        const rr = new BR(u8, cStart + 8);
        rr.u32(); rr.u32(); // lineNumber, comment
        const prefix = pool ? pool.get(rr.u32()) : null;
        const uri = pool ? pool.get(rr.u32()) : null;
        prefixes.push({ prefix, uri });
        break;
      }
      case NODE.END_NS:
        prefixes.pop();
        break;

      case NODE.START_ELEMENT: {
        // ResXMLTree_node header (16 bytes) = ResChunk_header(8) + lineNumber(4) + comment(4);
        // the body therefore starts at ResXMLTree_attrExt.
        const rr = new BR(u8, cStart + 8);
        const lineNumber = rr.u32();
        const commentIdx = rr.u32();
        const nsIdx = rr.u32();
        const nameIdx = rr.u32();
        const attributeStart = rr.u16();
        const attributeSize = rr.u16();
        const attributeCount = rr.u16();
        rr.u16(); rr.u16(); rr.u16(); // idIndex, classIndex, styleIndex
        const el = {
          tag: pool ? pool.get(nameIdx) : `#${nameIdx}`,
          ns: pool ? pool.get(nsIdx) : null,
          attrs: [],
          children: [],
          lineNumber,
          comment: pool && commentIdx !== 0xffffffff ? pool.get(commentIdx) : null,
        };
        const attrBase = body + (attributeStart || 20);
        const aSize = attributeSize || 20;
        for (let i = 0; i < attributeCount; i++) {
          const off = attrBase + i * aSize;
          if (off + 20 > u8.length) break;
          const a = new BR(u8, off);
          const aNs = a.u32();
          const aName = a.u32();
          const aRaw = a.u32();
          const tvSize = a.u16();
          a.u8v();                       // res0
          const dataType = a.u8v();
          const data = a.u32();
          const name = pool ? pool.get(aName) : `#${aName}`;
          const attr = {
            name,
            ns: pool ? pool.get(aNs) : null,
            rawValue: pool && aRaw !== 0xffffffff ? pool.get(aRaw) : null,
            dataType, data: data >>> 0,
            value: formatTypedValue({ dataType, data }, pool),
            resourceId: (resourceMap && aName < resourceMap.length) ? resourceMap[aName] : 0,
          };
          el.attrs.push(attr);
        }
        stack[stack.length - 1].children.push(el);
        stack.push(el);
        break;
      }

      case NODE.END_ELEMENT:
        if (stack.length > 1) stack.pop();
        break;

      case NODE.CDATA: {
        const rr = new BR(u8, body);
        const idx = rr.u32();
        const txt = pool ? pool.get(idx) : '';
        if (txt) stack[stack.length - 1].children.push({ tag: '#text', text: txt, attrs: [], children: [] });
        break;
      }
      default: break;
    }
    r.seek(cStart + size);
  }

  return { root, pool, resourceMap, prefixes, size: rootSize };
}

/* --- convenience ------------------------------------------------- */
export function findAll(node, tag, out = []) {
  if (!node) return out;
  if (node.tag === tag) out.push(node);
  for (const c of node.children || []) findAll(c, tag, out);
  return out;
}
export function findFirst(node, tag) {
  if (!node) return null;
  if (node.tag === tag) return node;
  for (const c of node.children || []) { const f = findFirst(c, tag); if (f) return f; }
  return null;
}
export function attr(node, name) {
  if (!node) return null;
  for (const a of node.attrs) if (a.name === name) return a;
  return null;
}
export function attrVal(node, name) {
  const a = attr(node, name);
  if (!a) return undefined;
  return typeof a.value === 'object' && a.value !== null ? a.value : a.value;
}

/* Serialize back to readable XML (for the source viewer). */
export function axmlToXml(node, indent = 0, isRoot = true) {
  const pad = '  '.repeat(indent);
  if (node.tag === '#document') return node.children.map((c) => axmlToXml(c, indent, false)).join('\n');
  if (node.tag === '#text') return pad + escapeXml(node.text || '');
  let s = `${pad}<${node.tag}`;
  for (const a of node.attrs) {
    s += ` ${a.name}="${escapeXml(stringifyValue(a))}"`;
  }
  if (!node.children.length) return s + ' />';
  s += '>\n';
  for (const c of node.children) s += axmlToXml(c, indent + 1, false) + '\n';
  s += `${pad}</${node.tag}>`;
  return s;
}
function stringifyValue(a) {
  const v = a.value;
  if (v === null || v === undefined) return a.rawValue ?? '';
  if (typeof v === 'object') return v.text !== undefined ? v.text : JSON.stringify(v);
  return String(v);
}
function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}
