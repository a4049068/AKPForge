/* arsc.js — parser for Android's compiled resource table (resources.arsc). */

import { BR, decodeUtf8 } from './binary.js';
import { ResStringPool, TYPE, formatTypedValue, argbToCss } from './axml.js';

const NO_ENTRY = 0xffffffff;

export class ResConfig {
  constructor(r, size) {
    const start = r.pos;
    this.size = r.u32();
    this.mcc = r.u16(); this.mnc = r.u16();
    this.language = r.u16(); this.country = r.u16();
    this.orientation = r.u8v(); this.touchscreen = r.u8v();
    this.density = r.u16();
    this.keyboard = r.u8v(); this.navigation = r.u8v();
    this.inputFlags = r.u8v(); r.u8v();
    this.screenWidth = r.u16(); this.screenHeight = r.u16();
    this.sdkVersion = r.u16(); this.minorVersion = r.u16();
    if (this.size >= 32) {
      this.screenLayout = r.u8v(); this.uiMode = r.u8v();
      this.smallestScreenWidthDp = r.u16();
    }
    if (this.size >= 36) { this.screenWidthDp = r.u16(); this.screenHeightDp = r.u16(); }
    if (this.size >= 48) {
      this.localeScript = latin4(r.bytes(4));
      this.localeVariant = latin8(r.bytes(8));
    }
    if (this.size >= 52) { this.screenLayout2 = r.u8v(); r.u8v(); r.u16(); }
    r.seek(start + (this.size || size));
  }
  get lang() {
    if (!this.language) return '';
    const a = String.fromCharCode(this.language & 0xff, (this.language >> 8) & 0xff);
    return a;
  }
  get region() { return this.country ? String.fromCharCode(this.country & 0xff, (this.country >> 8) & 0xff) : ''; }
  isDefault() {
    return !this.mcc && !this.mnc && !this.language && !this.country && !this.orientation &&
      !this.touchscreen && !this.density && !this.keyboard && !this.navigation && !this.inputFlags &&
      !this.screenWidth && !this.screenHeight && !this.sdkVersion && !(this.screenLayout || 0) &&
      !(this.uiMode || 0) && !(this.smallestScreenWidthDp || 0) && !(this.screenWidthDp || 0) && !(this.screenHeightDp || 0);
  }
  label() {
    const p = [];
    if (this.lang) p.push(this.lang + (this.region ? '-r' + this.region : ''));
    if (this.density) p.push(DENSITY_NAMES[this.density] || `${this.density}dpi`);
    if (this.sdkVersion) p.push(`v${this.sdkVersion}`);
    if (this.smallestScreenWidthDp) p.push(`sw${this.smallestScreenWidthDp}dp`);
    if (this.screenWidthDp) p.push(`w${this.screenWidthDp}dp`);
    if (this.orientation) p.push(['port', 'land', 'square'][this.orientation - 1] || `or${this.orientation}`);
    if (this.uiMode) p.push(UI_MODE[(this.uiMode & 0x0f)] || `ui${this.uiMode}`);
    if (this.screenLayout) p.push(SCREEN_SIZE[(this.screenLayout & 0x0f)] || '');
    return p.filter(Boolean).join('-') || 'default';
  }
}
const DENSITY_NAMES = { 0: 'anydpi', 120: 'ldpi', 160: 'mdpi', 213: 'tvdpi', 240: 'hdpi', 260: 'hdpi', 280: 'hdpi', 300: 'hdpi', 320: 'xhdpi', 360: 'xhdpi', 400: 'xxhdpi', 420: 'xxhdpi', 440: 'xxhdpi', 480: 'xxhdpi', 560: 'xxxhdpi', 640: 'xxxhdpi' };
const UI_MODE = { 1: 'car', 2: 'desk', 3: 'television', 4: 'appliance', 5: 'watch', 6: 'vr' };
const SCREEN_SIZE = { 1: 'small', 2: 'normal', 3: 'large', 4: 'xlarge' };
function latin4(b) { let s = ''; for (const c of b) if (c) s += String.fromCharCode(c); return s; }
function latin8(b) { return latin4(b); }

export class ResourceTable {
  constructor(u8) {
    this.raw = u8;
    this.valuePool = null;
    this.packages = [];
    this.byPackage = new Map();
    /** resId -> [{config, typeId, entryId, pkgId, ...}] */
    this.byId = new Map();
    this.entryList = [];
    this._getCache = new Map();
    this._resolveCache = new Map();
    this._parse();
  }

  _parse() {
    const u8 = this.raw;
    const r = new BR(u8, 0);
    const type = r.u16(); const headerSize = r.u16(); const size = r.u32();
    if (type !== 0x0002) throw new Error(`Not a resources.arsc table (chunk 0x${type.toString(16)})`);
    const packageCount = r.u32();

    let p = headerSize;
    for (let i = 0; i < packageCount + 8 && p + 8 <= u8.length; i++) {
      const cr = new BR(u8, p);
      const cType = cr.u16(); const cHeader = cr.u16(); const cSize = cr.u32();
      if (cSize < 8 || p + cSize > u8.length) break;
      if (cType === 0x0001) {
        this.valuePool = new ResStringPool(u8, p);
      } else if (cType === 0x0200) {
        this._parsePackage(u8, p, cHeader, cSize);
      }
      p += cSize;
    }
  }

  _parsePackage(u8, pkgStart, headerSize, pkgSize) {
    const r = new BR(u8, pkgStart + 8);
    const id = r.u32();
    let name = '';
    for (let i = 0; i < 128; i++) { const c = r.u16(); if (c) name += String.fromCharCode(c); }
    const typeStringsOff = r.u32();
    const lastPublicType = r.u32();
    const keyStringsOff = r.u32();
    const lastPublicKey = r.u32();
    let typeIdOffset = 0;
    if (headerSize >= 288) typeIdOffset = r.u32();

    const typeStrings = new ResStringPool(u8, pkgStart + typeStringsOff);
    const keyStrings = new ResStringPool(u8, pkgStart + keyStringsOff);

    const pkg = { id, name, typeStrings, keyStrings, typeIdOffset, types: new Map(), typeOrder: [] };
    this.packages.push(pkg);
    this.byPackage.set(id, pkg);

    let p = pkgStart + headerSize;
    const pkgEnd = pkgStart + pkgSize;
    while (p + 8 <= pkgEnd && p + 8 <= u8.length) {
      const cr = new BR(u8, p);
      const cType = cr.u16(); const cHeader = cr.u16(); const cSize = cr.u32();
      if (cSize < 8 || p + cSize > u8.length) break;

      if (cType === 0x0201) { // ResTable_type
        const b = new BR(u8, p + 8);
        const typeIdRaw = b.u8v();
        const flags = b.u8v();
        b.u16();                       // reserved
        const entryCount = b.u32();
        const entriesStart = b.u32();
        const config = new ResConfig(b, cHeader - 20);
        const typeId = typeIdRaw + typeIdOffset;
        const typeName = typeStrings.get(typeId - 1) || `type${typeId}`;

        const isSparse = !!(flags & 0x01);
        const offsets = [];
        if (isSparse) {
          for (let i = 0; i < entryCount; i++) {
            const idx = b.u16(); const off = b.u32();
            offsets.push({ index: idx, offset: off });
          }
        } else {
          for (let i = 0; i < entryCount; i++) offsets.push({ index: i, offset: b.u32() });
        }

        let bucket = pkg.types.get(typeName);
        if (!bucket) { bucket = { name: typeName, typeId, configs: [] }; pkg.types.set(typeName, bucket); pkg.typeOrder.push(typeName); }
        const entries = [];
        const dataBase = p + entriesStart;
        for (const o of offsets) {
          if (o.offset === NO_ENTRY) continue;
          const ent = this._readEntry(u8, dataBase + o.offset, id, typeId, typeName, o.index, config, keyStrings);
          if (ent) entries.push(ent);
        }
        bucket.configs.push({ config, label: config.label(), entries, count: entryCount, sparse: isSparse });
      } else if (cType === 0x0202) { // ResTable_type_spec — flags only, not needed for resolution
        /* skip */
      }
      p += cSize;
    }
  }

  _readEntry(u8, off, pkgId, typeId, typeName, entryIndex, config, keyStrings) {
    if (off + 8 > u8.length) return null;
    const r = new BR(u8, off);
    const size = r.u16();
    const flags = r.u16();
    const keyIdx = r.u32();
    const key = keyStrings.get(keyIdx) || `#${keyIdx}`;
    const resId = ((pkgId << 24) | (typeId << 16) | entryIndex) >>> 0;
    const ent = { resId, pkgId, typeId, typeName, entryIndex, key, config, configLabel: config.label(), idHex: `0x${resId.toString(16).padStart(8, '0')}` };

    if (flags & 0x0001) { // FLAG_COMPLEX — a bag (style / array / plurals / attr)
      const parent = r.u32();
      const count = r.u32();
      ent.complex = true;
      ent.parent = parent;
      ent.values = [];
      for (let i = 0; i < count && r.pos + 12 <= u8.length; i++) {
        const name = r.u32();
        const v = this._readValue(r);
        ent.values.push({ name, ...v });
      }
    } else {
      ent.complex = false;
      Object.assign(ent, this._readValue(r));
    }

    const list = this.byId.get(resId);
    if (list) list.push(ent); else this.byId.set(resId, [ent]);
    this.entryList.push(ent);
    return ent;
  }

  _readValue(r) {
    const size = r.u16();
    r.u8v();                        // res0
    const dataType = r.u8v();
    const data = r.u32();
    const out = { dataType, data: data >>> 0, size };
    out.value = formatTypedValue({ dataType, data }, this.valuePool);
    if (dataType === TYPE.STRING) out.str = this.valuePool ? this.valuePool.get(data) : null;
    if (dataType >= TYPE.INT_COLOR_ARGB8 && dataType <= TYPE.INT_COLOR_RGB4) out.css = argbToCss(data, dataType);
    return out;
  }

  /* ---------------- lookup helpers ---------------- */

  /** Best-matching entry for a resource id (default config preferred). */
  get(resId) {
    resId >>>= 0;
    const cacheKey = this.prefer ? resId + '|' + (this.prefer.lang || '') + (this.prefer.dark ? 'd' : '') : resId;
    const hit = this._getCache.get(cacheKey);
    if (hit !== undefined) return hit;
    const list = this.byId.get(resId);
    let v = null;
    if (list && list.length) {
      if (this.prefer) {
        let best = -1;
        for (const e of list) {
          let score = 0;
          const lang = e.config.lang;
          if (this.prefer.lang && lang === this.prefer.lang) score += 4;
          else if (lang) score -= 2;
          const uiDark = /night|dark/.test(e.config.label || '');
          if (this.prefer.dark && uiDark) score += 3;
          else if (uiDark) score -= 1;
          if (e.config.isDefault()) score += 1;
          if (score > best) { best = score; v = e; }
        }
      } else {
        v = list.find((e) => e.config.isDefault()) || list[0];
      }
    }
    this._getCache.set(cacheKey, v);
    return v;
  }
  getAll(resId) { return this.byId.get(resId >>> 0) || []; }

  /** Resolve a value, following @references up to `depth` hops. */
  resolveValue(resId, depth = 8) {
    const memo = depth === 8 ? this._resolveCache : null;
    if (memo) { const h = memo.get(resId >>> 0); if (h !== undefined) return h; }
    const out = this._resolveValue(resId, depth);
    if (memo) memo.set(resId >>> 0, out);
    return out;
  }
  _resolveValue(resId, depth) {
    let id = resId >>> 0;
    for (let i = 0; i < depth; i++) {
      const e = this.get(id);
      if (!e) return null;
      if (e.dataType === TYPE.REFERENCE || e.dataType === TYPE.DYNAMIC_REFERENCE) { id = e.data >>> 0; continue; }
      return e;
    }
    return null;
  }

  string(resId) {
    const e = this.resolveValue(resId);
    if (!e) return null;
    if (e.dataType === TYPE.STRING) return e.str;
    if (typeof e.value === 'number' || typeof e.value === 'boolean') return String(e.value);
    if (e.value && typeof e.value === 'object' && e.value.text) return e.value.text;
    return e.str ?? null;
  }

  /** Find an entry by type+name, e.g. find('string','app_name'). */
  find(typeName, key) {
    for (const pkg of this.packages) {
      const bucket = pkg.types.get(typeName);
      if (!bucket) continue;
      for (const cfg of bucket.configs) for (const e of cfg.entries) if (e.key === key) return e;
    }
    return null;
  }
  findAll(typeName, key) {
    const out = [];
    for (const pkg of this.packages) {
      const bucket = pkg.types.get(typeName);
      if (!bucket) continue;
      for (const cfg of bucket.configs) for (const e of cfg.entries) if (e.key === key) out.push(e);
    }
    return out;
  }

  /** Human-readable rendering of a typed value, resolving references. */
  describe(e, depth = 0) {
    if (!e) return 'null';
    if (e.complex) return `{bag:${e.values.length}}`;
    switch (e.dataType) {
      case TYPE.STRING: return JSON.stringify(e.str);
      case TYPE.REFERENCE:
      case TYPE.DYNAMIC_REFERENCE: {
        const t = this.get(e.data >>> 0);
        return t ? `@${t.typeName}/${t.key}` : `@0x${(e.data >>> 0).toString(16)}`;
      }
      case TYPE.INT_BOOLEAN: return e.data !== 0 ? 'true' : 'false';
      case TYPE.INT_DEC: return String(e.data | 0);
      case TYPE.INT_HEX: return `0x${(e.data >>> 0).toString(16)}`;
      case TYPE.FLOAT: { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, e.data >>> 0); return String(b.getFloat32(0)); }
      default: {
        const v = e.value;
        return (v && typeof v === 'object' && v.text) ? v.text : String(v);
      }
    }
  }

  get stats() {
    const byType = {};
    for (const pkg of this.packages) for (const [n, b] of pkg.types) {
      byType[n] = (byType[n] || 0) + b.configs.reduce((s, c) => s + c.entries.length, 0);
    }
    return { packages: this.packages.length, ids: this.byId.size, entries: this.entryList.length, byType };
  }
}
