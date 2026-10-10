/* zip.js — dependency-free ZIP/APK reader.
 * Uses the platform's DecompressionStream('deflate-raw') when available and
 * falls back to the pure-JS inflater in binary.js otherwise. */

import { BR, inflateRawSync, decodeUtf8 } from './binary.js';

const EOCD_SIG = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const LOC64_SIG = 0x07064b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

export class ZipEntry {
  constructor(o) { Object.assign(this, o); }
  get isDir() { return this.name.endsWith('/'); }
}

export class ZipArchive {
  constructor(bytes) {
    this.bytes_ = bytes;
    this.entries = new Map();
    this.order = [];
    this.comment = '';
    this._parse();
  }

  static open(u8) {
    if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
    return new ZipArchive(u8);
  }

  _findEocd() {
    const b = this.bytes_;
    const min = Math.max(0, b.length - 22 - 65536);
    for (let i = b.length - 22; i >= min; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) return i;
    }
    throw new Error('Not a ZIP/APK file (no End Of Central Directory record found).');
  }

  _parse() {
    const b = this.bytes_;
    const eocdOff = this._findEocd();
    let r = new BR(b, eocdOff);
    r.skip(4);
    const diskNum = r.u16();
    const diskCd = r.u16();
    let entriesDisk = r.u16();
    let entriesTotal = r.u16();
    let cdSize = r.u32();
    let cdOffset = r.u32();
    const commentLen = r.u16();
    if (commentLen > 0 && eocdOff + 22 + commentLen <= b.length) {
      this.comment = decodeUtf8(b.subarray(eocdOff + 22, eocdOff + 22 + commentLen));
    }

    // ZIP64
    if (cdOffset === 0xffffffff || entriesTotal === 0xffff || cdSize === 0xffffffff) {
      const locOff = eocdOff - 20;
      if (locOff >= 0) {
        const lr = new BR(b, locOff);
        if (lr.u32() === LOC64_SIG) {
          const eocd64Off = lr.u64();
          const zr = new BR(b, Number(eocd64Off));
          if (zr.u32() === EOCD64_SIG) {
            zr.skip(4 + 8 + 2 + 2); // size of record, version made by, version needed
            zr.u32(); zr.u32();       // this disk, disk with CD
            entriesDisk = Number(zr.u64());
            entriesTotal = Number(zr.u64());
            cdSize = Number(zr.u64());
            cdOffset = Number(zr.u64());
          }
        }
      }
    }
    this.diskNum = diskNum; this.diskCd = diskCd;
    this.entryCount = entriesTotal;
    this.cdSize = cdSize; this.cdOffset = cdOffset;

    // Central directory
    r = new BR(b, cdOffset);
    for (let i = 0; i < entriesTotal; i++) {
      if (r.u32() !== CD_SIG) break;
      const versionMadeBy = r.u16();
      const versionNeeded = r.u16();
      const flags = r.u16();
      const method = r.u16();
      const modTime = r.u16();
      const modDate = r.u16();
      const crc = r.u32();
      let compSize = r.u32();
      let uncompSize = r.u32();
      const nameLen = r.u16();
      const extraLen = r.u16();
      const commentLen2 = r.u16();
      const diskStart = r.u16();
      const intAttr = r.u16();
      const extAttr = r.u32();
      let localOffset = r.u32();
      const name = decodeUtf8(r.bytes(nameLen));
      const extra = r.bytes(extraLen);
      r.skip(commentLen2);

      // ZIP64 extra field
      if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
        const er = new BR(extra, 0);
        while (er.remaining >= 4) {
          const hid = er.u16(); const hsz = er.u16();
          if (hid === 0x0001) {
            const end = er.pos + hsz;
            if (uncompSize === 0xffffffff) uncompSize = Number(er.u64());
            if (compSize === 0xffffffff) compSize = Number(er.u64());
            if (localOffset === 0xffffffff) localOffset = Number(er.u64());
            er.seek(end);
          } else er.skip(hsz);
        }
      }

      const e = new ZipEntry({
        name, method, flags, crc, compSize, uncompSize, localOffset,
        versionMadeBy, versionNeeded, extAttr, diskStart,
        mtime: dosTime(modDate, modTime),
      });
      if (!this.entries.has(name)) { this.entries.set(name, e); this.order.push(name); }
    }
  }

  get names() { return this.order.slice(); }
  has(name) { return this.entries.has(name); }
  get(name) { return this.entries.get(name); }
  list(prefix) { return this.order.filter((n) => !prefix || n.startsWith(prefix)); }
  get size() { return this.bytes_.length; }

  /** Raw compressed slice for an entry. */
  _rawSlice(e) {
    const b = this.bytes_;
    const r = new BR(b, e.localOffset);
    if (r.u32() !== LFH_SIG) throw new Error(`Bad local header for ${e.name}`);
    // local file header: version(2) flags(2) method(2) modTime(2) modDate(2) crc(4) csize(4) usize(4)
    r.skip(2); // version needed
    r.skip(2); // general purpose bit flag
    r.skip(2); // compression method
    r.skip(2); // last mod file time
    r.skip(2); // last mod file date
    r.skip(4); // crc-32
    r.skip(4); // compressed size
    r.skip(4); // uncompressed size
    const nameLen = r.u16();
    const extraLen = r.u16();
    const start = e.localOffset + 30 + nameLen + extraLen;
    return b.subarray(start, start + e.compSize);
  }

  /** Decompressed bytes (async — uses the streaming decompressor when present). */
  async data(name) {
    const e = typeof name === 'string' ? this.entries.get(name) : name;
    if (!e) throw new Error(`ZIP entry not found: ${name}`);
    if (e.isDir) return new Uint8Array(0);
    const raw = this._rawSlice(e);
    if (e.method === 0) return raw.slice();
    if (e.method !== 8) throw new Error(`Unsupported compression method ${e.method} for ${e.name}`);
    if (typeof DecompressionStream === 'function') {
      try { return await inflateDeflateRaw(raw); } catch (_) { /* fall through */ }
    }
    return inflateRawSync(raw);
  }

  dataSync(name) {
    const e = typeof name === 'string' ? this.entries.get(name) : name;
    if (!e) throw new Error(`ZIP entry not found: ${name}`);
    const raw = this._rawSlice(e);
    if (e.method === 0) return raw.slice();
    return inflateRawSync(raw);
  }

  async text(name) { return decodeUtf8(await this.data(name)); }
}

async function inflateDeflateRaw(raw) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([raw]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function dosTime(date, time) {
  const y = ((date >> 9) & 0x7f) + 1980, mo = (date >> 5) & 0x0f, d = date & 0x1f;
  const h = (time >> 11) & 0x1f, mi = (time >> 5) & 0x3f, s = (time & 0x1f) * 2;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
}
