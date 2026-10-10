/* sqlite.js — an in-browser SQLite *subset* good enough for app databases.
 *
 * Parses the statements Android apps issue through SQLiteDatabase
 * (CREATE/DROP TABLE, INSERT, UPDATE, DELETE, SELECT with WHERE / ORDER BY /
 * LIMIT, plus SQLiteStatement binds) and executes them over in-memory tables
 * persisted as JSON in the host's virtual /data filesystem. Statements outside
 * the subset log a warning instead of silently returning nothing.
 */

import { ARR_CLASS } from './runtime.js';

const S = 'Ljava/lang/String;', O = 'Ljava/lang/Object;', Z = 'Z', I = 'I', J = 'J', F = 'F', D = 'D', V = 'V';
const BOOL = (b) => (b ? 1 : 0);
const CURSOR = 'Landroid/database/sqlite/SQLiteCursor;';

export function installSqlite(R, H) {
  const dbs = new Map();
  const ident = (t) => String(t).replace(/[`[\]"]/g, '');
  const cvEntries = (cv) => {
    if (!cv) return [];
    const m = cv.$m || {};
    return m instanceof Map ? [...m.entries()] : Object.entries(m);
  };

  /* ---------------- lexer ---------------- */
  function tokenize(sql) {
    const out = [];
    const re = /\s+|'([^']*(?:''[^']*)*)'|"([^"]*)"|([A-Za-z_][A-Za-z0-9_.]*)|(-?\d+(?:\.\d+)?)|(\?)|([(),;=<>!]+|.)/g;
    let m;
    while ((m = re.exec(sql))) {
      if (m[1] !== undefined) out.push({ t: 'str', v: m[1].replace(/''/g, "'") });
      else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
      else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
      else if (m[4] !== undefined) out.push({ t: 'num', v: parseFloat(m[4]) });
      else if (m[5] !== undefined) out.push({ t: 'arg' });
      else if (m[6] !== undefined) out.push({ t: 'p', v: m[6] });
    }
    return out;
  }

  /* ---------------- WHERE parsing ---------------- */
  function parseWhere(tokens, i, args, argi) {
    const terms = [];
    let joiner = 'AND';
    while (i < tokens.length) {
      const tk = tokens[i];
      if (tk.t === 'id' && /^and$/i.test(tk.v)) { joiner = 'AND'; i++; continue; }
      if (tk.t === 'id' && /^or$/i.test(tk.v)) { joiner = 'OR'; i++; continue; }
      if (tk.t === 'id' && /^(order|group|limit|having)$/i.test(tk.v)) break;
      if (tk.t === 'p' && tk.v === ')') break;
      const col = tk.t === 'id' ? ident(tk.v) : null;
      if (!col) { i++; continue; }
      i++;
      let op = '';
      while (i < tokens.length && tokens[i].t === 'p' && /^[=<>!]+$/.test(tokens[i].v)) { op += tokens[i].v; i++; }
      if (i < tokens.length && tokens[i].t === 'id' && /^(is|like|glob|in|not|between)$/i.test(tokens[i].v)) {
        const kw = tokens[i].v.toLowerCase(); i++;
        if (kw === 'is') {
          let neg = false;
          if (tokens[i] && tokens[i].t === 'id' && tokens[i].v.toLowerCase() === 'not') { neg = true; i++; }
          if (tokens[i] && tokens[i].t === 'id' && tokens[i].v.toLowerCase() === 'null') { terms.push({ col, op: neg ? 'NOTNULL' : 'NULL', joiner }); i++; }
          continue;
        }
        if (kw === 'not' && tokens[i] && /like/i.test(tokens[i].v)) { op = 'NOTLIKE'; i++; }
        else if (kw === 'like' || kw === 'glob') op = 'LIKE';
        else op = kw.toUpperCase();
      }
      if (!op) continue;
      const vt = tokens[i];
      if (!vt) break;
      let val;
      if (vt.t === 'arg') val = args && args.length ? args[argi.v++] : null;
      else if (vt.t === 'str') val = vt.v;
      else if (vt.t === 'num') val = vt.v;
      else if (vt.t === 'id' && vt.v.toLowerCase() === 'null') val = null;
      else val = String(vt.v);
      i++;
      terms.push({ col, op, val, joiner });
    }
    return { terms, i, argi };
  }

  function looseEq(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return a == null && b == null;
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
  }
  function like(v, pattern) {
    const src = String(pattern)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '[\\s\\S]*')
      .replace(/_/g, '[\\s\\S]');
    return new RegExp('^' + src + '$', 'i').test(v === null || v === undefined ? '' : String(v));
  }
  function matchRow(cols, row, terms) {
    let result = true;
    terms.forEach((t, idx) => {
      const ci = cols.indexOf(t.col.toLowerCase());
      const rv = ci >= 0 ? row[ci] : undefined;
      let ok;
      const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
      switch (t.op) {
        case 'NULL': ok = rv === null || rv === undefined; break;
        case 'NOTNULL': ok = rv !== null && rv !== undefined; break;
        case '=': case '==': ok = looseEq(rv, t.val); break;
        case '!=': case '<>': ok = !looseEq(rv, t.val); break;
        case '<': ok = num(rv) < num(t.val); break;
        case '<=': ok = num(rv) <= num(t.val); break;
        case '>': ok = num(rv) > num(t.val); break;
        case '>=': ok = num(rv) >= num(t.val); break;
        case 'LIKE': ok = like(rv, t.val); break;
        case 'NOTLIKE': ok = !like(rv, t.val); break;
        default: ok = true;
      }
      result = idx === 0 ? ok : (t.joiner === 'OR' ? result || ok : result && ok);
    });
    return result;
  }

  function splitTop(s) {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  const sqlErr = (msg) => R.newException('Landroid/database/sqlite/SQLiteException;', msg);

  function cursorOver(cols, rows) {
    const c = R.newInstanceObj(R.klass(CURSOR));
    c.$cols = cols; c.$rows = rows; c.$i = -1;
    return c;
  }

  /* ---------------- persistence ---------------- */
  function persist(db) {
    if (!db.name) return;
    const obj = { version: db.version || 0, tables: {} };
    for (const [n, t] of db.tables) obj.tables[n] = { cols: t.cols, rows: t.rows, seq: t.seq, autoinc: t.autoinc };
    try { H.vfs.set(db.name + '.json', Array.from(new TextEncoder().encode(JSON.stringify(obj)))); } catch { /* full */ }
  }
  function openDb(name) {
    if (dbs.has(name)) return dbs.get(name);
    const db = { name, tables: new Map(), version: 0 };
    const raw = H.vfs.get(name + '.json');
    if (raw) {
      try {
        const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(raw)));
        db.version = obj.version || 0;
        for (const n of Object.keys(obj.tables || {})) db.tables.set(n, obj.tables[n]);
      } catch { /* corrupt — start fresh */ }
    }
    dbs.set(name, db);
    return db;
  }

  /* ---------------- statement execution ---------------- */
  function exec(db, sql, bindArgs) {
    const tokens = tokenize(sql);
    const head = tokens[0] && tokens[0].v ? tokens[0].v.toUpperCase() : '';
    const argi = { v: 0 };
    const args = bindArgs || [];

    if (head === 'CREATE' && /table/i.test(sql.slice(0, 40))) {
      const m = /create\s+table\s+(if\s+not\s+exists\s+)?["`[]?(\w+)["`\]]?\s*\(([\s\S]*)\)\s*$/i.exec(sql);
      if (!m) { H.log('W', 'SQLite', `unsupported DDL: ${sql.slice(0, 80)}`); return null; }
      const name = m[2].toLowerCase();
      if (db.tables.has(name)) { if (/if\s+not\s+exists/i.test(m[1] || '')) return null; }
      const cols = []; let autoinc = -1;
      for (const cd of splitTop(m[3])) {
        const cm = /^\s*["`[]?(\w+)["`\]]?\s*([^,]*)$/i.exec(cd);
        if (!cm) continue;
        if (/^(primary|foreign|unique|check|constraint)\s/i.test(cd) && !/^\w+\s+(integer|int|text|real|blob|boolean|varchar|char|datetime|timestamp|numeric)/i.test(cd)) continue;
        cols.push(cm[1].toLowerCase());
        if (/integer\s+primary\s+key/i.test(cd)) autoinc = cols.length - 1;
      }
      db.tables.set(name, { cols, rows: [], autoinc, seq: 0 });
      persist(db);
      return null;
    }
    if (head === 'CREATE') return null;   // indexes / triggers: accepted, ignored
    if (head === 'DROP') {
      const m = /drop\s+table\s+(if\s+exists\s+)?["`[]?(\w+)["`\]]?/i.exec(sql);
      if (m) db.tables.delete(m[2].toLowerCase());
      persist(db);
      return null;
    }
    if (head === 'INSERT' || head === 'REPLACE') {
      const m = /insert\s+(?:or\s+\w+\s+)?into\s+["`[]?(\w+)["`\]]?\s*(\(([^)]*)\))?\s*values\s*\(([\s\S]*)\)\s*$/i.exec(sql);
      if (!m) { H.log('W', 'SQLite', `unsupported INSERT: ${sql.slice(0, 80)}`); return null; }
      const table = db.tables.get(m[1].toLowerCase());
      if (!table) throw sqlErr(`no such table: ${m[1]}`);
      const cols = m[3] ? m[3].split(',').map((x) => ident(x.trim()).toLowerCase()) : table.cols.slice();
      const vals = [];
      for (const tk of tokenize('(' + m[4] + ')')) {
        if (tk.t === 'arg') vals.push(args[argi.v++] ?? null);
        else if (tk.t === 'str') vals.push(tk.v);
        else if (tk.t === 'num') vals.push(tk.v);
        else if (tk.t === 'id' && tk.v.toLowerCase() === 'null') vals.push(null);
        else if (tk.t === 'id') vals.push(String(tk.v));
      }
      const row = new Array(table.cols.length).fill(null);
      cols.forEach((c, i) => { const ci = table.cols.indexOf(c); if (ci >= 0) row[ci] = vals[i] === undefined ? null : vals[i]; });
      if (table.autoinc >= 0) {
        if (row[table.autoinc] === null || row[table.autoinc] === undefined) row[table.autoinc] = ++table.seq;
        else table.seq = Math.max(table.seq, Number(row[table.autoinc]) || 0);
      }
      table.rows.push(row);
      persist(db);
      return { rowid: table.autoinc >= 0 ? row[table.autoinc] : table.rows.length };
    }
    if (head === 'DELETE') {
      const m = /delete\s+from\s+["`[]?(\w+)["`\]]?([\s\S]*)$/i.exec(sql);
      if (!m) return null;
      const table = db.tables.get(m[1].toLowerCase());
      if (!table) throw sqlErr(`no such table: ${m[1]}`);
      const hasWhere = /where/i.test(m[2]);
      const rest = tokenize(m[2].replace(/^\s*where\s+/i, ''));
      const { terms } = hasWhere ? parseWhere(rest, 0, args, argi) : { terms: [] };
      const before = table.rows.length;
      table.rows = table.rows.filter((r) => !matchRow(table.cols, r, terms));
      persist(db);
      return { changed: before - table.rows.length };
    }
    if (head === 'UPDATE') {
      const m = /update\s+(?:or\s+\w+\s+)?["`[]?(\w+)["`\]]?\s+set\s+([\s\S]+?)\s+where\s+([\s\S]+)$/i.exec(sql) ||
                /update\s+(?:or\s+\w+\s+)?["`[]?(\w+)["`\]]?\s+set\s+([\s\S]+)$/i.exec(sql);
      if (!m) { H.log('W', 'SQLite', `unsupported UPDATE: ${sql.slice(0, 80)}`); return null; }
      const table = db.tables.get(m[1].toLowerCase());
      if (!table) throw sqlErr(`no such table: ${m[1]}`);
      const sets = [];
      const setTokens = tokenize(m[2]);
      for (let i = 0; i < setTokens.length; i++) {
        if (setTokens[i].t !== 'id') continue;
        const col = ident(setTokens[i].v).toLowerCase();
        i++;
        while (i < setTokens.length && setTokens[i].t === 'p' && setTokens[i].v === '=') i++;
        const vt = setTokens[i];
        let val;
        if (vt && vt.t === 'arg') val = args[argi.v++] ?? null;
        else if (vt && vt.t === 'str') val = vt.v;
        else if (vt && vt.t === 'num') val = vt.v;
        else if (vt && vt.t === 'id' && vt.v.toLowerCase() === 'null') val = null;
        else val = null;
        sets.push([col, val]);
      }
      const { terms } = m[3] ? parseWhere(tokenize(m[3]), 0, args, argi) : { terms: [] };
      let changed = 0;
      for (const row of table.rows) {
        if (m[3] && !matchRow(table.cols, row, terms)) continue;
        for (const [col, val] of sets) { const ci = table.cols.indexOf(col); if (ci >= 0) row[ci] = val; }
        changed++;
      }
      persist(db);
      return { changed };
    }
    if (head === 'SELECT') {
      const m = /select\s+(distinct\s+)?([\s\S]+?)\s+from\s+["`[]?(\w+)["`\]]?([\s\S]*)$/i.exec(sql);
      if (!m) {
        const bare = /select\s+(\d+|'[^']*'|null)\s*$/i.exec(sql);
        if (bare) return cursorOver(['value'], [[bare[1].startsWith("'") ? bare[1].slice(1, -1) : bare[1].toLowerCase() === 'null' ? null : Number(bare[1])]]);
        return cursorOver([], []);
      }
      const table = db.tables.get(m[3].toLowerCase());
      if (!table) throw sqlErr(`no such table: ${m[3]}`);
      const tail = m[4] || '';
      let rows = table.rows.slice();
      const widx = tail.search(/\bwhere\b/i);
      let restForOrder = tail;
      if (widx >= 0) {
        const wsql = tail.slice(widx + 5);
        const cut = wsql.search(/\b(order|group)\s+by\b|\blimit\b/i);
        const condSql = cut >= 0 ? wsql.slice(0, cut) : wsql;
        const { terms } = parseWhere(tokenize(condSql), 0, args, argi);
        rows = rows.filter((r) => matchRow(table.cols, r, terms));
        restForOrder = cut >= 0 ? wsql.slice(cut) : '';
      }
      const om = /order\s+by\s+["`[]?(\w+)["`\]]?(\s+(asc|desc))?/i.exec(restForOrder);
      if (om) {
        const ci = table.cols.indexOf(om[1].toLowerCase());
        const dir = /desc/i.test(om[3] || '') ? -1 : 1;
        rows.sort((a, b) => {
          const x = a[ci], y = b[ci];
          if (x === y) return 0;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : 1) * dir;
        });
      }
      const lm = /limit\s+(\d+)(?:\s*(?:offset|,)\s*(\d+))?/i.exec(restForOrder);
      if (lm) {
        const off = lm[2] !== undefined ? parseInt(lm[2], 10) : 0;
        rows = rows.slice(off, off + parseInt(lm[1], 10));
      }
      const projRaw = m[2].trim();
      let cols, projIdx;
      if (projRaw === '*') { cols = table.cols.slice(); projIdx = table.cols.map((_, i) => i); }
      else {
        cols = []; projIdx = [];
        for (const part of projRaw.split(',')) {
          const aggr = /^\s*(count|sum|max|min|avg)\s*\(\s*(\*|\w+)\s*\)\s*(?:as\s+(\w+))?$/i.exec(part);
          if (aggr) {
            const fn = aggr[1].toLowerCase();
            const ci = aggr[2] === '*' ? -1 : table.cols.indexOf(aggr[2].toLowerCase());
            const vals = rows.map((r) => (ci >= 0 ? r[ci] : 1)).filter((x) => x !== null && x !== undefined);
            let out = 0;
            if (fn === 'count') out = vals.length;
            else if (fn === 'sum') out = vals.reduce((a, b) => a + Number(b), 0);
            else if (fn === 'max') out = vals.reduce((a, b) => (Number(b) > Number(a) ? b : a), vals[0] ?? 0);
            else if (fn === 'min') out = vals.reduce((a, b) => (Number(b) < Number(a) ? b : a), vals[0] ?? 0);
            else out = vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : 0;
            cols.push((aggr[3] || `${fn}_${aggr[2]}`).toLowerCase());
            projIdx.push({ agg: out });
            continue;
          }
          const mm = /(\w+)\s*(?:as\s+(\w+))?$/i.exec(part.trim());
          const srcName = mm ? mm[1] : part.trim();
          cols.push(((mm && mm[2]) || srcName).toLowerCase());
          projIdx.push(table.cols.indexOf(srcName.toLowerCase()));
        }
      }
      const outRows = rows.map((r) => projIdx.map((pi) => (typeof pi === 'object' ? pi.agg : pi >= 0 ? r[pi] : null)));
      return cursorOver(cols, outRows);
    }
    if (head === 'PRAGMA') {
      const setm = /user_version\s*=\s*(\d+)/i.exec(sql);
      if (setm) { db.version = parseInt(setm[1], 10); persist(db); return null; }
      const getm = /user_version\s*$/i.exec(sql);
      if (getm) return cursorOver(['user_version'], [[db.version || 0]]);
      return cursorOver([], []);
    }
    if (head === 'BEGIN' || head === 'COMMIT' || head === 'END' || head === 'ROLLBACK' || head === 'ALTER' || head === 'VACUUM' || head === 'ANALYZE' || head === 'REINDEX') return null;
    H.log('W', 'SQLite', `unsupported SQL: ${sql.slice(0, 100)}`);
    return null;
  }

  /* ---------------- shim classes ---------------- */
  R.def(CURSOR, {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/database/Cursor;'],
    m: {
      ['getCount()' + I]: (s) => (s.$rows || []).length,
      ['getPosition()' + I]: (s) => s.$i | 0,
      ['moveToFirst()' + Z]: (s) => { s.$i = 0; return BOOL((s.$rows || []).length > 0); },
      ['moveToLast()' + Z]: (s) => { s.$i = (s.$rows || []).length - 1; return BOOL(s.$i >= 0); },
      ['moveToNext()' + Z]: (s) => { s.$i = (s.$i === undefined ? -1 : s.$i) + 1; return BOOL(s.$i < (s.$rows || []).length); },
      ['moveToPrevious()' + Z]: (s) => { s.$i = (s.$i || 0) - 1; return BOOL(s.$i >= 0); },
      ['moveToPosition(I)' + Z]: (s, i) => { s.$i = i | 0; return BOOL(s.$i >= 0 && s.$i < (s.$rows || []).length); },
      ['isFirst()' + Z]: (s) => BOOL(s.$i === 0),
      ['isLast()' + Z]: (s) => BOOL(s.$i === (s.$rows || []).length - 1),
      ['isBeforeFirst()' + Z]: (s) => BOOL((s.$i | 0) < 0),
      ['isAfterLast()' + Z]: (s) => BOOL(s.$i >= (s.$rows || []).length),
      ['getColumnCount()' + I]: (s) => (s.$cols || []).length,
      ['getColumnNames()[Ljava/lang/String;']: (s) => { const a = (s.$cols || []).slice(); a[ARR_CLASS] = R.klass('[Ljava/lang/String;'); return a; },
      ['getColumnName(I)Ljava/lang/String;']: (s, i) => (s.$cols || [])[i | 0] || null,
      ['getColumnIndex(Ljava/lang/String;)' + I]: (s, n) => (s.$cols || []).indexOf(String(n).toLowerCase()),
      ['getColumnIndexOrThrow(Ljava/lang/String;)' + I]: (s, n) => { const i = (s.$cols || []).indexOf(String(n).toLowerCase()); if (i < 0) throw R.newException('Ljava/lang/IllegalArgumentException;', `column '${n}' does not exist`); return i; },
      ['getString(I)Ljava/lang/String;']: (s, i) => cell(s, i, (x) => (x === null || x === undefined ? null : String(x))),
      ['getInt(I)' + I]: (s, i) => cell(s, i, (x) => (x === null || x === undefined ? 0 : parseInt(x, 10) | 0)),
      ['getLong(I)' + J]: (s, i) => cell(s, i, (x) => (x === null || x === undefined ? 0 : Number(x))),
      ['getShort(I)' + I]: (s, i) => cell(s, i, (x) => (x === null || x === undefined ? 0 : parseInt(x, 10) | 0)),
      ['getFloat(I)' + F]: (s, i) => cell(s, i, (x) => Math.fround(x === null || x === undefined ? 0 : parseFloat(x) || 0)),
      ['getDouble(I)' + D]: (s, i) => cell(s, i, (x) => (x === null || x === undefined ? 0 : parseFloat(x) || 0)),
      ['getBlob(I)[B']: (s, i) => cell(s, i, (x) => x || null),
      ['isNull(I)' + Z]: (s, i) => { const x = cell(s, i, (y) => y); return BOOL(x === null || x === undefined); },
      ['getType(I)' + I]: (s, i) => { const x = cell(s, i, (y) => y); return x === null || x === undefined ? 0 : typeof x === 'number' ? 1 : 3; },
      ['close()' + V]: () => {},
      ['isClosed()' + Z]: () => 0,
      ['setNotificationUri(Landroid/content/ContentResolver;Landroid/net/Uri;)' + V]: () => {},
      ['registerContentObserver(Landroid/database/ContentObserver;)' + V]: () => {},
    },
  });
  function cell(s, i, f) { const row = (s.$rows || [])[s.$i | 0]; return f(row ? row[i | 0] : null); }

  R.def('Landroid/database/sqlite/SQLiteDatabase;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['execSQL(Ljava/lang/String;)' + V]: (s, sql) => { exec(s.$db, String(sql), null); },
      ['execSQL(Ljava/lang/String;[Ljava/lang/Object;)' + V]: (s, sql, a) => { exec(s.$db, String(sql), a || []); },
      ['rawQuery(Ljava/lang/String;[Ljava/lang/String;)Landroid/database/Cursor;']: (s, sql, a) => exec(s.$db, String(sql), a || []) || cursorOver([], []),
      ['rawQueryWithFactory(Landroid/database/sqlite/SQLiteDatabase$CursorFactory;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, f, sql, a) => exec(s.$db, String(sql), a || []) || cursorOver([], []),
      ['insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)' + J]: (s, t, nc, cv) => {
        const ent = cvEntries(cv);
        const r = exec(s.$db, `INSERT INTO ${t} (${ent.map(([k]) => k).join(',')}) VALUES (${ent.map(() => '?').join(',')})`, ent.map(([, v]) => v));
        return r && r.rowid !== undefined ? Number(r.rowid) : -1;
      },
      ['insertOrThrow(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)' + J]: (s, t, nc, cv) => R.iv('Landroid/database/sqlite/SQLiteDatabase;->insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)J', s, t, nc, cv),
      ['insertWithOnConflict(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;I)' + J]: (s, t, nc, cv) => R.iv('Landroid/database/sqlite/SQLiteDatabase;->insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)J', s, t, nc, cv),
      ['replace(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)' + J]: (s, t, nc, cv) => R.iv('Landroid/database/sqlite/SQLiteDatabase;->insert(Ljava/lang/String;Ljava/lang/String;Landroid/content/ContentValues;)J', s, t, nc, cv),
      ['update(Ljava/lang/String;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)' + I]: (s, t, cv, where, wargs) => {
        const ent = cvEntries(cv);
        const r = exec(s.$db, `UPDATE ${t} SET ${ent.map(([k]) => `${k}=?`).join(',')}${where ? ' WHERE ' + where : ''}`, ent.map(([, v]) => v).concat(wargs || []));
        return r ? (r.changed | 0) : 0;
      },
      ['updateWithOnConflict(Ljava/lang/String;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;I)' + I]: (s, t, cv, where, wargs) => R.iv('Landroid/database/sqlite/SQLiteDatabase;->update(Ljava/lang/String;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I', s, t, cv, where, wargs),
      ['delete(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;)' + I]: (s, t, where, wargs) => {
        const r = exec(s.$db, `DELETE FROM ${t}${where ? ' WHERE ' + where : ''}`, wargs || []);
        return r ? (r.changed | 0) : 0;
      },
      ['query(Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, t, cols, where, wargs, group, having, order) => buildQuery(s, t, cols, where, wargs, order, null),
      ['query(Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, t, cols, where, wargs, group, having, order, limit) => buildQuery(s, t, cols, where, wargs, order, limit),
      ['query(ZLjava/lang/String;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, d, t, cols, where, wargs, group, having, order, limit) => buildQuery(s, t, cols, where, wargs, order, limit),
      ['queryWithFactory(Landroid/database/sqlite/SQLiteDatabase$CursorFactory;ZLjava/lang/String;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, f, d, t, cols, where, wargs, group, having, order, limit) => buildQuery(s, t, cols, where, wargs, order, limit),
      ['beginTransaction()' + V]: (s) => { s.$tx = true; },
      ['setTransactionSuccessful()' + V]: (s) => { s.$txOk = true; },
      ['endTransaction()' + V]: (s) => { s.$tx = false; persist(s.$db); },
      ['inTransaction()' + Z]: (s) => BOOL(!!s.$tx),
      ['compileStatement(Ljava/lang/String;)Landroid/database/sqlite/SQLiteStatement;']: (s, sql) => { const o = R.newInstanceObj(R.klass('Landroid/database/sqlite/SQLiteStatement;')); o.$db = s.$db; o.$sql = String(sql); o.$bind = []; return o; },
      ['getVersion()' + I]: (s) => s.$db.version | 0,
      ['setVersion(I)' + V]: (s, v) => { s.$db.version = v | 0; persist(s.$db); },
      ['isOpen()' + Z]: () => 1,
      ['isReadOnly()' + Z]: () => 0,
      ['isDatabaseIntegrityOk()' + Z]: () => 1,
      ['isWriteAheadLoggingEnabled()' + Z]: () => 0,
      ['needUpgrade(I)' + Z]: (s, v) => BOOL((s.$db.version | 0) < (v | 0)),
      ['close()' + V]: (s) => { persist(s.$db); },
      ['getPath()' + S]: (s) => '/data/data/' + H.packageName + '/databases/' + s.$db.name,
      ['enableWriteAheadLogging()' + Z]: () => 1,
      ['getPageSize()' + J]: () => 4096,
    },
    sm: {
      ['openOrCreateDatabase(Ljava/lang/String;Landroid/database/sqlite/SQLiteDatabase$CursorFactory;)Landroid/database/sqlite/SQLiteDatabase;']: (n) => dbObj(String(n)),
      ['openOrCreateDatabase(Ljava/lang/String;ILandroid/database/sqlite/SQLiteDatabase$CursorFactory;)Landroid/database/sqlite/SQLiteDatabase;']: (n) => dbObj(String(n)),
      ['create(Landroid/database/sqlite/SQLiteDatabase$CursorFactory;)Landroid/database/sqlite/SQLiteDatabase;']: () => dbObj('memory'),
      ['openDatabase(Ljava/lang/String;Landroid/database/sqlite/SQLiteDatabase$CursorFactory;I)Landroid/database/sqlite/SQLiteDatabase;']: (n) => dbObj(String(n)),
    },
  });
  function buildQuery(s, t, cols, where, wargs, order, limit) {
    let sql = `SELECT ${cols && cols.length ? cols.join(',') : '*'} FROM ${t}`;
    if (where) sql += ` WHERE ${where}`;
    if (order) sql += ` ORDER BY ${order}`;
    if (limit) sql += ` LIMIT ${limit}`;
    return exec(s.$db, sql, wargs || []) || cursorOver([], []);
  }
  function dbObj(name) {
    const o = R.newInstanceObj(R.klass('Landroid/database/sqlite/SQLiteDatabase;'));
    o.$db = openDb(name);
    return o;
  }
  R.def('Landroid/database/sqlite/SQLiteDatabase$CursorFactory;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/database/sqlite/SQLiteStatement;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['bindString(I Ljava/lang/String;)'.replace(' ', '') + V]: (s, i, v) => { s.$bind[(i | 0) - 1] = v; },
      ['bindLong(IJ)' + V]: (s, i, v) => { s.$bind[(i | 0) - 1] = Number(v); },
      ['bindDouble(ID)' + V]: (s, i, v) => { s.$bind[(i | 0) - 1] = v; },
      ['bindNull(I)' + V]: (s, i) => { s.$bind[(i | 0) - 1] = null; },
      ['bindBlob(I[B)' + V]: (s, i, v) => { s.$bind[(i | 0) - 1] = v; },
      ['clearBindings()' + V]: (s) => { s.$bind = []; },
      ['execute()' + V]: (s) => { exec(s.$db, s.$sql, s.$bind); },
      ['executeInsert()' + J]: (s) => { const r = exec(s.$db, s.$sql, s.$bind); return r && r.rowid !== undefined ? Number(r.rowid) : -1; },
      ['executeUpdateDelete()' + I]: (s) => { const r = exec(s.$db, s.$sql, s.$bind); return r ? (r.changed | 0) : 0; },
      ['executeRead()Landroid/database/Cursor;']: (s) => exec(s.$db, s.$sql, s.$bind) || cursorOver([], []),
      ['simpleQueryForLong()' + J]: (s) => { const c = exec(s.$db, s.$sql, s.$bind); return c && c.$rows && c.$rows[0] ? Number(c.$rows[0][0] || 0) : 0; },
      ['simpleQueryForString()' + S]: (s) => { const c = exec(s.$db, s.$sql, s.$bind); return c && c.$rows && c.$rows[0] ? String(c.$rows[0][0] ?? '') : null; },
      ['close()' + V]: () => {},
    },
  });
  R.def('Landroid/database/sqlite/SQLiteOpenHelper;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Landroid/content/Context;Ljava/lang/String;Landroid/database/sqlite/SQLiteDatabase$CursorFactory;I)' + V]: (s, ctx, name, f, ver) => { s.$name = name ? String(name) : 'main'; s.$ver = ver | 0; s.$ctx = ctx; },
      ['<init>(Landroid/content/Context;Ljava/lang/String;Landroid/database/sqlite/SQLiteDatabase$CursorFactory;ILandroid/database/sqlite/SQLiteDatabase$OpenParams;)' + V]: (s, ctx, name, f, ver) => { s.$name = name ? String(name) : 'main'; s.$ver = ver | 0; },
      ['getWritableDatabase()Landroid/database/sqlite/SQLiteDatabase;']: (s) => openHelperDb(s),
      ['getReadableDatabase()Landroid/database/sqlite/SQLiteDatabase;']: (s) => openHelperDb(s),
      ['close()' + V]: (s) => { if (s.$dbObj) R.iv('Landroid/database/sqlite/SQLiteDatabase;->close()V', s.$dbObj); s.$dbObj = null; },
      ['getDatabaseName()' + S]: (s) => s.$name,
      ['setWriteAheadLoggingEnabled(Z)' + V]: () => {},
    },
  });
  R.def('Landroid/database/sqlite/SQLiteDatabase$OpenParams;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  function openHelperDb(s) {
    if (s.$dbObj) return s.$dbObj;
    const db = dbObj(s.$name);
    s.$dbObj = db;
    const stored = H.vfs.has(s.$name + '.json');
    try {
      if (!stored && db.$db.tables.size === 0) R.iv('Landroid/database/sqlite/SQLiteOpenHelper;->onCreate(Landroid/database/sqlite/SQLiteDatabase;)V', s, db);
      else if ((db.$db.version | 0) < (s.$ver | 0)) R.iv('Landroid/database/sqlite/SQLiteOpenHelper;->onUpgrade(Landroid/database/sqlite/SQLiteDatabase;II)V', s, db, db.$db.version | 0, s.$ver | 0);
      db.$db.version = s.$ver | 0;
      persist(db.$db);
    } catch (e) { H.crash(e); }
    return db;
  }
  R.def('Landroid/database/sqlite/SQLiteException;', { access: 0x21, sup: 'Ljava/lang/RuntimeException;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; } } });
  R.def('Landroid/database/sqlite/SQLiteDatabaseLockedException;', { access: 0x21, sup: 'Landroid/database/sqlite/SQLiteException;' });
  R.def('Landroid/database/sqlite/SQLiteConstraintException;', { access: 0x21, sup: 'Landroid/database/sqlite/SQLiteException;' });
  R.def('Landroid/database/sqlite/SQLiteCantOpenDatabaseException;', { access: 0x21, sup: 'Landroid/database/sqlite/SQLiteException;' });
  R.def('Landroid/database/sqlite/SQLiteFullException;', { access: 0x21, sup: 'Landroid/database/sqlite/SQLiteException;' });
  R.def('Landroid/database/SQLException;', { access: 0x21, sup: 'Ljava/lang/RuntimeException;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; } } });
  R.def('Landroid/database/MatrixCursor;', {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/database/Cursor;'],
    m: {
      ['<init>([Ljava/lang/String;)' + V]: (s, cols) => { s.$cols = (cols || []).map((x) => String(x).toLowerCase()); s.$rows = []; s.$i = -1; },
      ['<init>([Ljava/lang/String;I)' + V]: (s, cols) => { s.$cols = (cols || []).map((x) => String(x).toLowerCase()); s.$rows = []; s.$i = -1; },
      ['addRow([Ljava/lang/Object;)' + V]: (s, r) => { s.$rows.push((r || []).slice()); },
      ['newRow()Landroid/database/MatrixCursor$RowBuilder;']: (s) => ({ $c: R.klass('Landroid/database/MatrixCursor$RowBuilder;'), $cur: s, $row: [] }),
    },
  });
  R.def('Landroid/database/MatrixCursor$RowBuilder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['add(Ljava/lang/Object;)Landroid/database/MatrixCursor$RowBuilder;']: (s, v) => { s.$row.push(v); if (s.$cur) { if (s.$row.length === (s.$cur.$cols || []).length) { s.$cur.$rows.push(s.$row); s.$row = []; } } return s; },
  } });
  R.def('Landroid/database/ContentObserver;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/os/Handler;)' + V]: () => {}, ['onChange(Z)' + V]: () => {}, ['onChange(ZLandroid/net/Uri;)' + V]: () => {} } });

  return { openDb, exec, cursorOver };
}
