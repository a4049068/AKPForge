import { ARR_CLASS } from './runtime.js';

/* framework2.js — the second half of the standard-library shim:
 * threading/executors, java.time, java.io, and the modern Android surface
 * (window insets, package manager, activity manager, files). */

const S = 'Ljava/lang/String;';
const O = 'Ljava/lang/Object;';
const Z = 'Z', I = 'I', J = 'J', F = 'F', D = 'D', V = 'V', C = 'C', B = 'B';
const BOOL = (b) => (b ? 1 : 0);

export function installExtras(R, H, U) {
  const { safeRun, arr, formatDate } = U;
  const mkSimple = (desc) => { const c = R.klass(desc); R.initClass(c); return R.newInstanceObj(c); };
  R.mkSimple = mkSimple;

  /* ---- a single canonical "main thread" so androidx thread checks pass ---- */
  const mainThread = () => {
    if (!H.$mainThread) { H.$mainThread = mkSimple('Ljava/lang/Thread;'); H.$mainThread.$name = 'main'; }
    return H.$mainThread;
  };
  R.def('Ljava/lang/Thread;', {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/Runnable;'],
    m: {
      [`getName()${S}`]: (s) => s.$name || 'main',
      [`setName(${S})${V}`]: (s, n) => { s.$name = n; },
      [`getId()${J}`]: () => 1,
      [`isDaemon()${Z}`]: () => 0, [`setDaemon(${Z})${V}`]: () => {},
      ['getState()Ljava/lang/Thread$State;']: () => mkSimple('Ljava/lang/Thread$State;'),
      [`toString()${S}`]: (s) => `Thread[${s.$name || 'main'}]`,
      [`start()${V}`]: (s) => { if (s.$r) H.post(() => safeRun(s.$r)); },
      [`join()${V}`]: () => {}, [`join(${J})${V}`]: () => {}, [`interrupt()${V}`]: () => {}, [`isAlive()${Z}`]: () => 0,
      [`setPriority(${I})${V}`]: () => {}, [`getPriority()${I}`]: () => 5,
      ['setUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)' + V]: () => {},
    },
    sm: {
      [`currentThread()Ljava/lang/Thread;`]: () => mainThread(),
      [`sleep(${J})${V}`]: () => {}, [`sleep(${J}${I})${V}`]: () => {}, [`yield()${V}`]: () => {},
    },
  });
  R.def('Ljava/lang/Thread$State;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Ljava/lang/Thread$UncaughtExceptionHandler;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Looper;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['getThread()Ljava/lang/Thread;']: () => mainThread(),
      ['getQueue()Landroid/os/MessageQueue;']: () => mkSimple('Landroid/os/MessageQueue;'),
      [`isCurrentThread()${Z}`]: () => 1, [`quit()${V}`]: () => {}, [`quitSafely()${V}`]: () => {},
    },
    sm: {
      ['getMainLooper()Landroid/os/Looper;']: () => H.$mainLooper || (H.$mainLooper = mkSimple('Landroid/os/Looper;')),
      ['myLooper()Landroid/os/Looper;']: () => H.$mainLooper || (H.$mainLooper = mkSimple('Landroid/os/Looper;')),
      ['myQueue()Landroid/os/MessageQueue;']: () => mkSimple('Landroid/os/MessageQueue;'),
      [`prepare()${V}`]: () => {}, [`prepareMainLooper()${V}`]: () => {}, [`loop()${V}`]: () => {},
    },
  });
  R.def('Landroid/os/MessageQueue;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/HandlerThread;', { access: 0x21, sup: 'Ljava/lang/Thread;' });

  /* ---- executors: tasks run on the browser event loop ---- */
  const exec = {
    ['execute(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => safeRun(r)),
    ['submit(Ljava/lang/Runnable;)Ljava/util/concurrent/Future;']: (s, r) => { H.post(() => safeRun(r)); return mkSimple('Ljava/util/concurrent/FutureTask;'); },
    ['submit(Ljava/util/concurrent/Callable;)Ljava/util/concurrent/Future;']: (s, c) => {
      const f = mkSimple('Ljava/util/concurrent/FutureTask;');
      H.post(() => { try { f.$v = R.iv('Ljava/util/concurrent/Callable;->call()Ljava/lang/Object;', c); } catch (e) { H.crash(e); } });
      return f;
    },
    ['submit(Ljava/lang/Runnable;' + O + ')Ljava/util/concurrent/Future;']: (s, r) => { H.post(() => safeRun(r)); return mkSimple('Ljava/util/concurrent/FutureTask;'); },
    ['shutdown()' + V]: () => {}, ['shutdownNow()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['isShutdown()' + Z]: () => 0, ['isTerminated()' + Z]: () => 0,
    ['awaitTermination(' + J + 'Ljava/util/concurrent/TimeUnit;)' + Z]: () => 1,
    ['invokeAll(Ljava/util/Collection;)Ljava/util/List;']: (s, c) => { for (const t of ((c && c.$a) || [])) safeRun(t); return { $c: R.klass('Ljava/util/ArrayList;'), $a: [] }; },
  };
  R.def('Ljava/util/concurrent/Executor;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['execute(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => safeRun(r)) } });
  R.def('Ljava/util/concurrent/ExecutorService;', { access: 0x601, sup: 'Ljava/util/concurrent/Executor;', m: exec });
  R.def('Ljava/util/concurrent/AbstractExecutorService;', { access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/concurrent/ExecutorService;'], m: exec });
  R.def('Ljava/util/concurrent/ThreadPoolExecutor;', { access: 0x21, sup: 'Ljava/util/concurrent/AbstractExecutorService;', m: exec });
  R.def('Ljava/util/concurrent/ScheduledExecutorService;', { access: 0x601, sup: 'Ljava/util/concurrent/ExecutorService;' });
  R.def('Ljava/util/concurrent/ScheduledThreadPoolExecutor;', {
    access: 0x21, sup: 'Ljava/util/concurrent/ThreadPoolExecutor;',
    m: Object.assign({}, exec, {
      ['schedule(Ljava/lang/Runnable;' + J + 'Ljava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;']: (s, r, d) => { H.postDelayed(() => safeRun(r), Number(d)); return mkSimple('Ljava/util/concurrent/FutureTask;'); },
      ['scheduleAtFixedRate(Ljava/lang/Runnable;' + J + J + 'Ljava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;']: (s, r, i, p) => { const h = setInterval(() => safeRun(r), Math.max(1, Number(p))); H.timers.add(h); return mkSimple('Ljava/util/concurrent/FutureTask;'); },
      ['scheduleWithFixedDelay(Ljava/lang/Runnable;' + J + J + 'Ljava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;']: (s, r, i, p) => { const h = setInterval(() => safeRun(r), Math.max(1, Number(p))); H.timers.add(h); return mkSimple('Ljava/util/concurrent/FutureTask;'); },
    }),
  });
  R.def('Ljava/util/concurrent/ScheduledFuture;', { access: 0x601, sup: 'Ljava/util/concurrent/Future;' });
  R.def('Ljava/util/concurrent/FutureTask;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/concurrent/Future;'], m: { ['get()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['isDone()' + Z]: (s) => BOOL(s.$v !== undefined), ['cancel(Z)' + Z]: () => 0, ['isCancelled()' + Z]: () => 0 } });
  R.def('Ljava/util/concurrent/Future;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['get()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['isDone()' + Z]: () => 1, ['cancel(Z)' + Z]: () => 0, ['isCancelled()' + Z]: () => 0 } });
  R.def('Ljava/util/concurrent/ThreadFactory;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/Executors;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['newFixedThreadPool(I)Ljava/util/concurrent/ExecutorService;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['newFixedThreadPool(ILjava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ExecutorService;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['newSingleThreadExecutor()Ljava/util/concurrent/ExecutorService;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['newSingleThreadExecutor(Ljava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ExecutorService;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['newCachedThreadPool()Ljava/util/concurrent/ExecutorService;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['newScheduledThreadPool(I)Ljava/util/concurrent/ScheduledExecutorService;']: () => mkSimple('Ljava/util/concurrent/ScheduledThreadPoolExecutor;'),
      ['newSingleThreadScheduledExecutor()Ljava/util/concurrent/ScheduledExecutorService;']: () => mkSimple('Ljava/util/concurrent/ScheduledThreadPoolExecutor;'),
      ['defaultThreadFactory()Ljava/util/concurrent/ThreadFactory;']: () => mkSimple('Ljava/util/concurrent/ThreadFactory;'),
      ['callable(Ljava/lang/Runnable;)Ljava/util/concurrent/Callable;']: (r) => r,
    },
  });
  R.def('Ljava/util/concurrent/atomic/AtomicReference;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$v = null; }, ['<init>(' + O + ')' + V]: (s, v) => { s.$v = v; }, ['get()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['set(' + O + ')' + V]: (s, v) => { s.$v = v; }, ['getAndSet(' + O + ')' + O]: (s, v) => { const o = s.$v; s.$v = v; return o; }, ['compareAndSet(' + O + O + ')' + Z]: (s, e, n) => { if (s.$v === e) { s.$v = n; return 1; } return 0; }, ['lazySet(' + O + ')' + V]: (s, v) => { s.$v = v; }, ['toString()' + S]: (s) => R.str(s.$v) } });
  R.def('Ljava/util/concurrent/atomic/AtomicLong;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$v = 0; }, ['<init>(' + J + ')' + V]: (s, v) => { s.$v = Number(v); }, ['get()' + J]: (s) => s.$v, ['set(' + J + ')' + V]: (s, v) => { s.$v = Number(v); }, ['incrementAndGet()' + J]: (s) => ++s.$v, ['getAndIncrement()' + J]: (s) => s.$v++, ['decrementAndGet()' + J]: (s) => --s.$v, ['addAndGet(' + J + ')' + J]: (s, v) => (s.$v += Number(v)), ['compareAndSet(' + J + J + ')' + Z]: (s, e, n) => { if (s.$v === e) { s.$v = Number(n); return 1; } return 0; } } });
  R.def('Ljava/util/concurrent/atomic/AtomicReferenceFieldUpdater;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['get(' + O + ')' + O]: (s, obj) => (obj && s.$key && obj[s.$key] !== undefined ? obj[s.$key] : null),
      ['set(' + O + O + ')' + V]: (s, obj, v) => { if (obj && s.$key) obj[s.$key] = v; },
      ['lazySet(' + O + O + ')' + V]: (s, obj, v) => { if (obj && s.$key) obj[s.$key] = v; },
      ['getAndSet(' + O + O + ')' + O]: (s, obj, v) => { const o = obj && s.$key ? obj[s.$key] : null; if (obj && s.$key) obj[s.$key] = v; return o; },
      ['compareAndSet(' + O + O + O + ')' + Z]: (s, obj, e, n) => { if (!obj || !s.$key) return 0; if (obj[s.$key] === e) { obj[s.$key] = n; return 1; } return 0; },
      ['weakCompareAndSet(' + O + O + O + ')' + Z]: (s, obj, e, n) => { if (!obj || !s.$key) return 0; if (obj[s.$key] === e) { obj[s.$key] = n; return 1; } return 0; },
    },
    sm: {
      ['newUpdater(Ljava/lang/Class;Ljava/lang/Class;Ljava/lang/String;)Ljava/util/concurrent/atomic/AtomicReferenceFieldUpdater;']: (base, cls, name) => {
        const o = mkSimple('Ljava/util/concurrent/atomic/AtomicReferenceFieldUpdater;');
        // Field names survive R8 renaming, so probe a couple of plausible keys.
        o.$key = null; o.$name = String(name);
        const bc = base && base['Ljava/lang/Class;->desc:Ljava/lang/String;'];
        if (bc) { const c = R.klass(bc); const hit = (c.instanceFields || []).find((f) => f.name === String(name)); o.$key = hit ? hit.key : null; }
        if (!o.$key) o.$resolve = (obj) => { if (obj && obj.$c) { const hit = (obj.$c.instanceFields || []).find((f) => f.name === String(name)); return hit ? hit.key : null; } return null; };
        const origGet = o.$c.methods.get('get(Ljava/lang/Object;)Ljava/lang/Object;');
        return o;
      },
    },
  });
  R.def('Ljava/util/concurrent/atomic/AtomicIntegerFieldUpdater;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['get(' + O + ')' + I]: () => 0, ['set(' + O + I + ')' + V]: () => {}, ['compareAndSet(' + O + I + I + ')' + Z]: () => 0, ['incrementAndGet(' + O + ')' + I]: () => 0 }, sm: { ['newUpdater(Ljava/lang/Class;Ljava/lang/String;)Ljava/util/concurrent/atomic/AtomicIntegerFieldUpdater;']: () => mkSimple('Ljava/util/concurrent/atomic/AtomicIntegerFieldUpdater;') } });
  R.def('Ljava/util/concurrent/atomic/AtomicLongFieldUpdater;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['get(' + O + ')' + J]: (s, o) => (o && s.$key ? Number(o[s.$key] || 0) : 0), ['set(' + O + J + ')' + V]: (s, o, v) => { if (o && s.$key) o[s.$key] = Number(v); }, ['compareAndSet(' + O + J + J + ')' + Z]: (s, o, e, n) => { if (!o || !s.$key) return 0; if (Number(o[s.$key] || 0) === Number(e)) { o[s.$key] = Number(n); return 1; } return 0; }, ['weakCompareAndSet(' + O + J + J + ')' + Z]: (s, o, e, n) => { if (!o || !s.$key) return 0; if (Number(o[s.$key] || 0) === Number(e)) { o[s.$key] = Number(n); return 1; } return 0; }, ['incrementAndGet(' + O + ')' + J]: (s, o) => (o && s.$key ? ++o[s.$key] : 0), ['getAndIncrement(' + O + ')' + J]: (s, o) => (o && s.$key ? o[s.$key]++ : 0), ['addAndGet(' + O + J + ')' + J]: (s, o, d) => (o && s.$key ? (o[s.$key] = Number(o[s.$key] || 0) + Number(d)) : 0) }, sm: { ['newUpdater(Ljava/lang/Class;Ljava/lang/String;)Ljava/util/concurrent/atomic/AtomicLongFieldUpdater;']: (c, n) => { const o = mkSimple('Ljava/util/concurrent/atomic/AtomicLongFieldUpdater;'); const desc = c && c['Ljava/lang/Class;->desc:Ljava/lang/String;']; const cls = desc ? R.klass(desc) : null; const hit = cls && (cls.instanceFields || []).find((f) => f.name === String(n)); o.$key = hit ? hit.key : null; return o; } } });
  R.def('Ljava/util/concurrent/ConcurrentLinkedQueue;', { access: 0x21, sup: 'Ljava/util/ArrayList;' });
  R.def('Ljava/util/concurrent/BlockingQueue;', { access: 0x601, sup: 'Ljava/util/Collection;' });
  R.def('Ljava/util/concurrent/ArrayBlockingQueue;', { access: 0x21, sup: 'Ljava/util/ArrayList;' });
  R.def('Ljava/util/concurrent/LinkedBlockingQueue;', { access: 0x21, sup: 'Ljava/util/ArrayList;' });
  R.def('Ljava/util/concurrent/Semaphore;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(I)' + V]: () => {}, ['acquire()' + V]: () => {}, ['release()' + V]: () => {}, ['tryAcquire()' + Z]: () => 1 } });
  R.def('Ljava/util/concurrent/locks/ReentrantLock;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['lock()' + V]: () => {}, ['unlock()' + V]: () => {}, ['tryLock()' + Z]: () => 1 } });
  R.def('Ljava/util/concurrent/locks/Lock;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/concurrent/TimeUnit;', {
    access: 0x4011, sup: 'Ljava/lang/Enum;',
    m: {
      ['toMillis(' + J + ')' + J]: (s, v) => Number(v) * unitMs(s),
      ['toSeconds(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs(s) / 1000),
      ['toMinutes(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs(s) / 60000),
      ['convert(' + J + 'Ljava/util/concurrent/TimeUnit;)' + J]: (s, v, src) => Math.floor(Number(v) * unitMs(src) / unitMs(s)),
      ['sleep(' + J + ')' + V]: () => {},
    },
  });
  function unitMs(u) {
    const n = u && (u.$name || u['Ljava/lang/Enum;->name:Ljava/lang/String;']);
    return { NANOSECONDS: 1e-6, MICROSECONDS: 1e-3, MILLISECONDS: 1, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000, DAYS: 86400000 }[n] ?? 1;
  }
  for (const [n, i] of [['NANOSECONDS', 0], ['MICROSECONDS', 1], ['MILLISECONDS', 2], ['SECONDS', 3], ['MINUTES', 4], ['HOURS', 5], ['DAYS', 6]]) {
    R.klass('Ljava/util/concurrent/TimeUnit;').statics[`Ljava/util/concurrent/TimeUnit;->${n}:Ljava/util/concurrent/TimeUnit;`] = { $c: R.klass('Ljava/util/concurrent/TimeUnit;'), $name: n, $ordinal: i };
  }

  /* ================= java.time ================= */
  const nowMs = () => Date.now();
  const parts = (ms) => { const x = new Date(ms); return [x.getFullYear(), x.getMonth() + 1, x.getDate(), x.getHours(), x.getMinutes(), x.getSeconds(), x.getMilliseconds()]; };
  const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  const instant = (ms) => { const o = mkSimple('Ljava/time/Instant;'); o.$ms = ms; return o; };
  const zoneId = (id) => { const o = mkSimple('Ljava/time/ZoneId;'); o.$id = id; return o; };
  const ld = (y, mo, d) => { const o = mkSimple('Ljava/time/LocalDate;'); o.$y = y; o.$m = mo; o.$d = d; return o; };
  const ldt = (y, mo, d, h, mi, s) => { const o = mkSimple('Ljava/time/LocalDateTime;'); Object.assign(o, { $y: y, $m: mo, $d: d, $h: h, $mi: mi, $s: s, $n: 0 }); return o; };
  const ltime = (h, mi, s) => { const o = mkSimple('Ljava/time/LocalTime;'); Object.assign(o, { $h: h, $mi: mi, $s: s || 0 }); return o; };
  const zoned = (ms, z) => { const o = mkSimple('Ljava/time/ZonedDateTime;'); o.$ms = ms; o.$z = z; return o; };
  const duration = (ms) => { const o = mkSimple('Ljava/time/Duration;'); o.$ms = ms; return o; };
  const utc = (o) => Date.UTC(o.$y, o.$m - 1, o.$d, o.$h || 0, o.$mi || 0, o.$s || 0);
  const epochDay = (o) => Math.floor(Date.UTC(o.$y, o.$m - 1, o.$d) / 86400000);
  const fromEpochDay = (n) => { const d = new Date(Math.floor(n) * 86400000); return ld(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const fromMs = (ms) => { const [y, m, d, h, mi, s] = parts(ms); return ldt(y, m, d, h, mi, s); };

  R.def('Ljava/time/Instant;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['toEpochMilli()' + J]: (s) => s.$ms,
      ['getEpochSecond()' + J]: (s) => Math.floor(s.$ms / 1000),
      ['getNano()' + I]: (s) => (s.$ms % 1000) * 1e6,
      ['plusSeconds(' + J + ')Ljava/time/Instant;']: (s, n) => instant(s.$ms + Number(n) * 1000),
      ['minusSeconds(' + J + ')Ljava/time/Instant;']: (s, n) => instant(s.$ms - Number(n) * 1000),
      ['plusMillis(' + J + ')Ljava/time/Instant;']: (s, n) => instant(s.$ms + Number(n)),
      ['plus(Ljava/time/temporal/TemporalAmount;)Ljava/time/Instant;']: (s, d) => instant(s.$ms + (d.$ms || 0)),
      ['isBefore(Ljava/time/Instant;)' + Z]: (s, o) => BOOL(s.$ms < o.$ms),
      ['isAfter(Ljava/time/Instant;)' + Z]: (s, o) => BOOL(s.$ms > o.$ms),
      ['compareTo(Ljava/time/Instant;)' + I]: (s, o) => (s.$ms < o.$ms ? -1 : s.$ms > o.$ms ? 1 : 0),
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && o.$ms === s.$ms),
      ['toString()' + S]: (s) => new Date(s.$ms).toISOString(),
      ['atZone(Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (s, z) => zoned(s.$ms, z),
    },
    sm: { ['now()Ljava/time/Instant;']: () => instant(nowMs()), ['ofEpochMilli(' + J + ')Ljava/time/Instant;']: (n) => instant(Number(n)), ['ofEpochSecond(' + J + ')Ljava/time/Instant;']: (n) => instant(Number(n) * 1000) },
  });
  R.def('Ljava/time/Clock;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: { ['millis()' + J]: () => nowMs(), ['instant()Ljava/time/Instant;']: () => instant(nowMs()), ['getZone()Ljava/time/ZoneId;']: () => zoneId(localZone()) },
    sm: { ['systemDefaultZone()Ljava/time/Clock;']: () => mkSimple('Ljava/time/Clock;'), ['systemUTC()Ljava/time/Clock;']: () => mkSimple('Ljava/time/Clock;'), ['system(Ljava/time/ZoneId;)Ljava/time/Clock;']: () => mkSimple('Ljava/time/Clock;') },
  });
  R.def('Ljava/time/ZoneId;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['getId()' + S]: (s) => s.$id || 'UTC', ['toString()' + S]: (s) => s.$id || 'UTC' }, sm: { ['systemDefault()Ljava/time/ZoneId;']: () => zoneId(localZone()), ['of(Ljava/lang/String;)Ljava/time/ZoneId;']: (s) => zoneId(String(s)), ['of(Ljava/lang/String;Ljava/util/Map;)Ljava/time/ZoneId;']: (s) => zoneId(String(s)) } });
  R.def('Ljava/time/ZoneOffset;', { access: 0x31, sup: 'Ljava/time/ZoneId;', sm: { ['of(Ljava/lang/String;)Ljava/time/ZoneOffset;']: (s) => zoneId(String(s)), ['ofHours(I)Ljava/time/ZoneOffset;']: () => zoneId('UTC'), ['ofTotalSeconds(I)Ljava/time/ZoneOffset;']: () => zoneId('UTC') } });
  R.def('Ljava/time/LocalDate;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['getYear()' + I]: (s) => s.$y, ['getMonthValue()' + I]: (s) => s.$m, ['getDayOfMonth()' + I]: (s) => s.$d,
      ['getMonth()Ljava/time/Month;']: (s) => { const o = mkSimple('Ljava/time/Month;'); o.$name = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'][s.$m - 1]; o.$v = s.$m; return o; },
      ['getDayOfWeek()Ljava/time/DayOfWeek;']: (s) => { const o = mkSimple('Ljava/time/DayOfWeek;'); o.$v = new Date(s.$y, s.$m - 1, s.$d).getDay() || 7; o.$name = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'][o.$v - 1]; return o; },
      ['getDayOfYear()' + I]: (s) => Math.ceil((Date.UTC(s.$y, s.$m - 1, s.$d) - Date.UTC(s.$y, 0, 1)) / 86400000) + 1,
      ['toEpochDay()' + J]: (s) => epochDay(s),
      ['plusDays(' + J + ')Ljava/time/LocalDate;']: (s, n) => fromEpochDay(epochDay(s) + Number(n)),
      ['minusDays(' + J + ')Ljava/time/LocalDate;']: (s, n) => fromEpochDay(epochDay(s) - Number(n)),
      ['plusWeeks(' + J + ')Ljava/time/LocalDate;']: (s, n) => fromEpochDay(epochDay(s) + Number(n) * 7),
      ['plusMonths(' + J + ')Ljava/time/LocalDate;']: (s, n) => { const d = new Date(s.$y, s.$m - 1 + Number(n), s.$d); return ld(d.getFullYear(), d.getMonth() + 1, d.getDate()); },
      ['minusMonths(' + J + ')Ljava/time/LocalDate;']: (s, n) => { const d = new Date(s.$y, s.$m - 1 - Number(n), s.$d); return ld(d.getFullYear(), d.getMonth() + 1, d.getDate()); },
      ['plusYears(' + J + ')Ljava/time/LocalDate;']: (s, n) => ld(s.$y + Number(n), s.$m, s.$d),
      ['withYear(I)Ljava/time/LocalDate;']: (s, y) => ld(y | 0, s.$m, s.$d),
      ['withMonth(I)Ljava/time/LocalDate;']: (s, m) => ld(s.$y, m | 0, s.$d),
      ['withDayOfMonth(I)Ljava/time/LocalDate;']: (s, d) => ld(s.$y, s.$m, d | 0),
      ['atStartOfDay()Ljava/time/LocalDateTime;']: (s) => ldt(s.$y, s.$m, s.$d, 0, 0, 0),
      ['atStartOfDay(Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (s, z) => zoned(Date.UTC(s.$y, s.$m - 1, s.$d), z),
      ['atTime(Ljava/time/LocalTime;)Ljava/time/LocalDateTime;']: (s, t) => ldt(s.$y, s.$m, s.$d, t.$h, t.$mi, t.$s),
      ['atTime(II)Ljava/time/LocalDateTime;']: (s, h, mi) => ldt(s.$y, s.$m, s.$d, h, mi, 0),
      ['atTime(IIII)Ljava/time/LocalDateTime;']: (s, h, mi, sec, n) => ldt(s.$y, s.$m, s.$d, h, mi, sec),
      ['isBefore(Ljava/time/chrono/ChronoLocalDate;)' + Z]: (s, o) => BOOL(epochDay(s) < epochDay(o)),
      ['isAfter(Ljava/time/chrono/ChronoLocalDate;)' + Z]: (s, o) => BOOL(epochDay(s) > epochDay(o)),
      ['isEqual(Ljava/time/chrono/ChronoLocalDate;)' + Z]: (s, o) => BOOL(epochDay(s) === epochDay(o)),
      ['compareTo(Ljava/time/chrono/ChronoLocalDate;)' + I]: (s, o) => (epochDay(s) < epochDay(o) ? -1 : epochDay(s) > epochDay(o) ? 1 : 0),
      ['format(Ljava/time/format/DateTimeFormatter;)' + S]: (s, f) => formatDate(f && f.$p ? f.$p : 'yyyy-MM-dd', Date.UTC(s.$y, s.$m - 1, s.$d)),
      ['toString()' + S]: (s) => `${String(s.$y).padStart(4, '0')}-${String(s.$m).padStart(2, '0')}-${String(s.$d).padStart(2, '0')}`,
      ['hashCode()' + I]: (s) => ((s.$y * 32 + s.$m) * 32 + s.$d) | 0,
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && o.$y === s.$y && o.$m === s.$m && o.$d === s.$d),
      ['lengthOfMonth()' + I]: (s) => new Date(s.$y, s.$m, 0).getDate(),
      ['isLeapYear()' + Z]: (s) => BOOL(((s.$y % 4 === 0 && s.$y % 100 !== 0) || s.$y % 400 === 0)),
    },
    sm: {
      ['now()Ljava/time/LocalDate;']: () => { const [y, m, d] = parts(nowMs()); return ld(y, m, d); },
      ['now(Ljava/time/ZoneId;)Ljava/time/LocalDate;']: () => { const [y, m, d] = parts(nowMs()); return ld(y, m, d); },
      ['now(Ljava/time/Clock;)Ljava/time/LocalDate;']: () => { const [y, m, d] = parts(nowMs()); return ld(y, m, d); },
      ['of(III)Ljava/time/LocalDate;']: (y, m, d) => ld(y | 0, m | 0, d | 0),
      ['ofEpochDay(' + J + ')Ljava/time/LocalDate;']: (n) => fromEpochDay(Number(n)),
      ['ofInstant(Ljava/time/Instant;Ljava/time/ZoneId;)Ljava/time/LocalDate;']: (i) => { const [y, m, d] = parts(i.$ms); return ld(y, m, d); },
      ['ofYearDay(II)Ljava/time/LocalDate;']: (y, doy) => { const d = new Date(Date.UTC(y, 0, doy)); return ld(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); },
      ['parse(Ljava/lang/CharSequence;)Ljava/time/LocalDate;']: (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? ld(+m[1], +m[2], +m[3]) : ld(1970, 1, 1); },
      ['parse(Ljava/lang/CharSequence;Ljava/time/format/DateTimeFormatter;)Ljava/time/LocalDate;']: (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)); return m ? ld(+m[1], +m[2], +m[3]) : ld(1970, 1, 1); },
    },
  });
  R.def('Ljava/time/LocalDateTime;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['toLocalDate()Ljava/time/LocalDate;']: (s) => ld(s.$y, s.$m, s.$d),
      ['toLocalTime()Ljava/time/LocalTime;']: (s) => ltime(s.$h, s.$mi, s.$s),
      ['getYear()' + I]: (s) => s.$y, ['getMonthValue()' + I]: (s) => s.$m, ['getDayOfMonth()' + I]: (s) => s.$d,
      ['getHour()' + I]: (s) => s.$h, ['getMinute()' + I]: (s) => s.$mi, ['getSecond()' + I]: (s) => s.$s, ['getNano()' + I]: (s) => s.$n || 0,
      ['plusSeconds(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) + Number(n) * 1000),
      ['plusMinutes(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) + Number(n) * 60000),
      ['plusHours(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) + Number(n) * 3600000),
      ['plusDays(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) + Number(n) * 86400000),
      ['minusSeconds(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) - Number(n) * 1000),
      ['minusMinutes(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) - Number(n) * 60000),
      ['minusHours(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) - Number(n) * 3600000),
      ['minusDays(' + J + ')Ljava/time/LocalDateTime;']: (s, n) => fromMs(utc(s) - Number(n) * 86400000),
      ['atZone(Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (s, z) => zoned(utc(s), z),
      ['toInstant(Ljava/time/ZoneOffset;)Ljava/time/Instant;']: (s) => instant(utc(s)),
      ['toEpochSecond(Ljava/time/ZoneOffset;)' + J]: (s) => Math.floor(utc(s) / 1000),
      ['format(Ljava/time/format/DateTimeFormatter;)' + S]: (s, f) => formatDate(f && f.$p ? f.$p : 'yyyy-MM-dd HH:mm:ss', utc(s)),
      ['isBefore(Ljava/time/chrono/ChronoLocalDateTime;)' + Z]: (s, o) => BOOL(utc(s) < utc(o)),
      ['isAfter(Ljava/time/chrono/ChronoLocalDateTime;)' + Z]: (s, o) => BOOL(utc(s) > utc(o)),
      ['isEqual(Ljava/time/chrono/ChronoLocalDateTime;)' + Z]: (s, o) => BOOL(utc(s) === utc(o)),
      ['compareTo(Ljava/time/chrono/ChronoLocalDateTime;)' + I]: (s, o) => (utc(s) < utc(o) ? -1 : utc(s) > utc(o) ? 1 : 0),
      ['withHour(I)Ljava/time/LocalDateTime;']: (s, h) => ldt(s.$y, s.$m, s.$d, h | 0, s.$mi, s.$s),
      ['withMinute(I)Ljava/time/LocalDateTime;']: (s, m) => ldt(s.$y, s.$m, s.$d, s.$h, m | 0, s.$s),
      ['toString()' + S]: (s) => `${s.$y}-${String(s.$m).padStart(2, '0')}-${String(s.$d).padStart(2, '0')}T${String(s.$h).padStart(2, '0')}:${String(s.$mi).padStart(2, '0')}:${String(s.$s).padStart(2, '0')}`,
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && utc(o) === utc(s)),
    },
    sm: {
      ['now()Ljava/time/LocalDateTime;']: () => { const [y, m, d, h, mi, s] = parts(nowMs()); return ldt(y, m, d, h, mi, s); },
      ['now(Ljava/time/ZoneId;)Ljava/time/LocalDateTime;']: () => { const [y, m, d, h, mi, s] = parts(nowMs()); return ldt(y, m, d, h, mi, s); },
      ['now(Ljava/time/Clock;)Ljava/time/LocalDateTime;']: () => { const [y, m, d, h, mi, s] = parts(nowMs()); return ldt(y, m, d, h, mi, s); },
      ['of(IIIII)Ljava/time/LocalDateTime;']: (y, m, d, h, mi) => ldt(y, m, d, h, mi, 0),
      ['of(IIIIII)Ljava/time/LocalDateTime;']: (y, m, d, h, mi, s) => ldt(y, m, d, h, mi, s),
      ['of(IIIIIIII)Ljava/time/LocalDateTime;']: (y, m, d, h, mi, s, n) => { const o = ldt(y, m, d, h, mi, s); o.$n = n; return o; },
      ['of(Ljava/time/LocalDate;Ljava/time/LocalTime;)Ljava/time/LocalDateTime;']: (d, t) => ldt(d.$y, d.$m, d.$d, t.$h, t.$mi, t.$s),
      ['ofEpochSecond(' + J + I + 'Ljava/time/ZoneOffset;)Ljava/time/LocalDateTime;']: (sec) => fromMs(Number(sec) * 1000),
      ['ofEpochSecond(' + J + J + 'Ljava/time/ZoneOffset;)Ljava/time/LocalDateTime;']: (sec) => fromMs(Number(sec) * 1000),
      ['ofInstant(Ljava/time/Instant;Ljava/time/ZoneId;)Ljava/time/LocalDateTime;']: (i) => fromMs(i.$ms),
      ['parse(Ljava/lang/CharSequence;)Ljava/time/LocalDateTime;']: (s) => fromMs(Date.parse(String(s)) || nowMs()),
      ['parse(Ljava/lang/CharSequence;Ljava/time/format/DateTimeFormatter;)Ljava/time/LocalDateTime;']: (s) => fromMs(Date.parse(String(s)) || nowMs()),
    },
  });
  R.def('Ljava/time/LocalTime;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['getHour()' + I]: (s) => s.$h, ['getMinute()' + I]: (s) => s.$mi, ['getSecond()' + I]: (s) => s.$s,
      ['toSecondOfDay()' + I]: (s) => s.$h * 3600 + s.$mi * 60 + s.$s,
      ['toNanoOfDay()' + J]: (s) => (s.$h * 3600 + s.$mi * 60 + s.$s) * 1e9,
      ['plusMinutes(' + J + ')Ljava/time/LocalTime;']: (s, n) => { const t = ((s.$h * 3600 + s.$mi * 60 + s.$s + Number(n) * 60) % 86400 + 86400) % 86400; return ltime(Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60); },
      ['plusHours(' + J + ')Ljava/time/LocalTime;']: (s, n) => ltime(((s.$h + Number(n)) % 24 + 24) % 24, s.$mi, s.$s),
      ['minusMinutes(' + J + ')Ljava/time/LocalTime;']: (s, n) => { const t = ((s.$h * 3600 + s.$mi * 60 + s.$s - Number(n) * 60) % 86400 + 86400) % 86400; return ltime(Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60); },
      ['isBefore(Ljava/time/LocalTime;)' + Z]: (s, o) => BOOL(s.$h * 3600 + s.$mi * 60 + s.$s < o.$h * 3600 + o.$mi * 60 + o.$s),
      ['isAfter(Ljava/time/LocalTime;)' + Z]: (s, o) => BOOL(s.$h * 3600 + s.$mi * 60 + s.$s > o.$h * 3600 + o.$mi * 60 + o.$s),
      ['compareTo(Ljava/time/LocalTime;)' + I]: (s, o) => (s.$h * 3600 + s.$mi * 60 + s.$s) - (o.$h * 3600 + o.$mi * 60 + o.$s),
      ['atDate(Ljava/time/LocalDate;)Ljava/time/LocalDateTime;']: (s, d) => ldt(d.$y, d.$m, d.$d, s.$h, s.$mi, s.$s),
      ['toString()' + S]: (s) => `${String(s.$h).padStart(2, '0')}:${String(s.$mi).padStart(2, '0')}`,
      ['format(Ljava/time/format/DateTimeFormatter;)' + S]: (s) => `${String(s.$h).padStart(2, '0')}:${String(s.$mi).padStart(2, '0')}:${String(s.$s).padStart(2, '0')}`,
    },
    sm: {
      ['now()Ljava/time/LocalTime;']: () => { const [, , , h, mi, s] = parts(nowMs()); return ltime(h, mi, s); },
      ['now(Ljava/time/ZoneId;)Ljava/time/LocalTime;']: () => { const [, , , h, mi, s] = parts(nowMs()); return ltime(h, mi, s); },
      ['of(II)Ljava/time/LocalTime;']: (h, mi) => ltime(h | 0, mi | 0, 0),
      ['of(III)Ljava/time/LocalTime;']: (h, mi, s) => ltime(h | 0, mi | 0, s | 0),
      ['ofSecondOfDay(' + J + ')Ljava/time/LocalTime;']: (n) => ltime(Math.floor(n / 3600), Math.floor((n % 3600) / 60), n % 60),
      ['parse(Ljava/lang/CharSequence;)Ljava/time/LocalTime;']: (s) => { const [h, mi] = String(s).split(':').map(Number); return ltime(h || 0, mi || 0, 0); },
    },
  });
  R.def('Ljava/time/ZonedDateTime;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['toLocalDate()Ljava/time/LocalDate;']: (s) => { const [y, m, d] = parts(s.$ms); return ld(y, m, d); },
      ['toLocalDateTime()Ljava/time/LocalDateTime;']: (s) => fromMs(s.$ms),
      ['toLocalTime()Ljava/time/LocalTime;']: (s) => { const [, , , h, mi, sec] = parts(s.$ms); return ltime(h, mi, sec); },
      ['toInstant()Ljava/time/Instant;']: (s) => instant(s.$ms),
      ['toEpochSecond()' + J]: (s) => Math.floor(s.$ms / 1000),
      ['getZone()Ljava/time/ZoneId;']: (s) => s.$z,
      ['plusDays(' + J + ')Ljava/time/ZonedDateTime;']: (s, n) => zoned(s.$ms + Number(n) * 86400000, s.$z),
      ['plusHours(' + J + ')Ljava/time/ZonedDateTime;']: (s, n) => zoned(s.$ms + Number(n) * 3600000, s.$z),
      ['plusSeconds(' + J + ')Ljava/time/ZonedDateTime;']: (s, n) => zoned(s.$ms + Number(n) * 1000, s.$z),
      ['minusDays(' + J + ')Ljava/time/ZonedDateTime;']: (s, n) => zoned(s.$ms - Number(n) * 86400000, s.$z),
      ['withZoneSameInstant(Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (s, z) => zoned(s.$ms, z),
      ['format(Ljava/time/format/DateTimeFormatter;)' + S]: (s, f) => formatDate(f && f.$p ? f.$p : 'yyyy-MM-dd HH:mm:ss', s.$ms),
      ['toString()' + S]: (s) => new Date(s.$ms).toISOString(),
      ['compareTo(Ljava/time/chrono/ChronoZonedDateTime;)' + I]: (s, o) => (s.$ms < o.$ms ? -1 : s.$ms > o.$ms ? 1 : 0),
    },
    sm: {
      ['now()Ljava/time/ZonedDateTime;']: () => zoned(nowMs(), zoneId(localZone())),
      ['now(Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (z) => zoned(nowMs(), z),
      ['now(Ljava/time/Clock;)Ljava/time/ZonedDateTime;']: () => zoned(nowMs(), zoneId(localZone())),
      ['now(Ljava/time/temporal/TemporalQuery;)Ljava/lang/Object;']: () => null,
      ['of(Ljava/time/LocalDateTime;Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (dt, z) => zoned(utc(dt), z),
      ['of(IIIIIII Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;'.replace(' ', '')]: (y, m, d, h, mi, sec, n, z) => zoned(Date.UTC(y, m - 1, d, h, mi, sec), z),
      ['ofInstant(Ljava/time/Instant;Ljava/time/ZoneId;)Ljava/time/ZonedDateTime;']: (i, z) => zoned(i.$ms, z),
      ['ofEpochSecond(' + J + I + 'Ljava/time/ZoneOffset;)Ljava/time/ZonedDateTime;']: (sec, n, z) => zoned(Number(sec) * 1000, z),
      ['parse(Ljava/lang/CharSequence;)Ljava/time/ZonedDateTime;']: (s) => zoned(Date.parse(String(s)) || nowMs(), zoneId(localZone())),
    },
  });
  R.def('Ljava/time/Duration;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['toMillis()' + J]: (s) => s.$ms, ['getSeconds()' + J]: (s) => Math.floor(s.$ms / 1000), ['getNano()' + I]: (s) => (s.$ms % 1000) * 1e6,
      ['toMinutes()' + J]: (s) => Math.floor(s.$ms / 60000), ['toHours()' + J]: (s) => Math.floor(s.$ms / 3600000), ['toDays()' + J]: (s) => Math.floor(s.$ms / 86400000),
      ['plus(Ljava/time/Duration;)Ljava/time/Duration;']: (s, o) => duration(s.$ms + o.$ms),
      ['minus(Ljava/time/Duration;)Ljava/time/Duration;']: (s, o) => duration(s.$ms - o.$ms),
      ['plusSeconds(' + J + ')Ljava/time/Duration;']: (s, n) => duration(s.$ms + Number(n) * 1000),
      ['plusMillis(' + J + ')Ljava/time/Duration;']: (s, n) => duration(s.$ms + Number(n)),
      ['multipliedBy(I)Ljava/time/Duration;']: (s, n) => duration(s.$ms * n),
      ['dividedBy(I)Ljava/time/Duration;']: (s, n) => duration(s.$ms / n),
      ['isZero()' + Z]: (s) => BOOL(s.$ms === 0), ['isNegative()' + Z]: (s) => BOOL(s.$ms < 0),
      ['abs()Ljava/time/Duration;']: (s) => duration(Math.abs(s.$ms)), ['negated()Ljava/time/Duration;']: (s) => duration(-s.$ms),
      ['compareTo(Ljava/time/Duration;)' + I]: (s, o) => (s.$ms < o.$ms ? -1 : s.$ms > o.$ms ? 1 : 0),
      ['toString()' + S]: (s) => `PT${(s.$ms / 1000).toFixed(3)}S`,
    },
    sm: {
      ['ofMillis(' + J + ')Ljava/time/Duration;']: (n) => duration(Number(n)),
      ['ofSeconds(' + J + ')Ljava/time/Duration;']: (n) => duration(Number(n) * 1000),
      ['ofSeconds(' + J + J + ')Ljava/time/Duration;']: (n) => duration(Number(n) * 1000),
      ['ofMinutes(' + J + ')Ljava/time/Duration;']: (n) => duration(Number(n) * 60000),
      ['ofHours(' + J + ')Ljava/time/Duration;']: (n) => duration(Number(n) * 3600000),
      ['ofDays(' + J + ')Ljava/time/Duration;']: (n) => duration(Number(n) * 86400000),
      ['between(Ljava/time/temporal/Temporal;Ljava/time/temporal/Temporal;)Ljava/time/Duration;']: (a, b) => duration((b.$ms || 0) - (a.$ms || 0)),
    },
  });
  R.def('Ljava/time/Period;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['getYears()' + I]: (s) => s.$y || 0, ['getMonths()' + I]: (s) => s.$m || 0, ['getDays()' + I]: (s) => s.$d || 0,
      ['toTotalMonths()' + J]: (s) => (s.$y || 0) * 12 + (s.$m || 0),
      ['isZero()' + Z]: (s) => BOOL(!(s.$y || s.$m || s.$d)),
      ['isNegative()' + Z]: (s) => BOOL((s.$y || 0) < 0),
      ['plusDays(I)Ljava/time/Period;']: (s, n) => { const o = mkSimple('Ljava/time/Period;'); o.$y = s.$y; o.$m = s.$m; o.$d = (s.$d || 0) + n; return o; },
      ['toString()' + S]: (s) => `P${s.$y || 0}Y${s.$m || 0}M${s.$d || 0}D`,
    },
    sm: {
      ['of(III)Ljava/time/Period;']: (y, m, d) => { const o = mkSimple('Ljava/time/Period;'); o.$y = y; o.$m = m; o.$d = d; return o; },
      ['ofDays(I)Ljava/time/Period;']: (d) => { const o = mkSimple('Ljava/time/Period;'); o.$d = d; return o; },
      ['ofMonths(I)Ljava/time/Period;']: (m) => { const o = mkSimple('Ljava/time/Period;'); o.$m = m; return o; },
      ['ofYears(I)Ljava/time/Period;']: (y) => { const o = mkSimple('Ljava/time/Period;'); o.$y = y; return o; },
      ['between(Ljava/time/LocalDate;Ljava/time/LocalDate;)Ljava/time/Period;']: (a, b) => {
        const o = mkSimple('Ljava/time/Period;');
        let y = b.$y - a.$y, m = b.$m - a.$m, d = b.$d - a.$d;
        if (d < 0) { m--; d += new Date(a.$y, a.$m, 0).getDate(); }
        if (m < 0) { y--; m += 12; }
        o.$y = y; o.$m = m; o.$d = d; return o;
      },
      ['parse(Ljava/lang/CharSequence;)Ljava/time/Period;']: (s) => { const o = mkSimple('Ljava/time/Period;'); const m = /P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/.exec(String(s)); if (m) { o.$y = +(m[1] || 0); o.$m = +(m[2] || 0); o.$d = +(m[3] || 0); } return o; },
    },
  });
  R.def('Ljava/time/format/DateTimeFormatter;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: { ['format(Ljava/time/temporal/TemporalAccessor;)' + S]: (s, t) => (t && t.$ms !== undefined ? formatDate(s.$p || 'yyyy-MM-dd HH:mm:ss', t.$ms) : formatDate(s.$p || 'yyyy-MM-dd HH:mm:ss', utc(t) || nowMs())) },
    sm: {
      ['ofPattern(Ljava/lang/String;)Ljava/time/format/DateTimeFormatter;']: (p) => { const o = mkSimple('Ljava/time/format/DateTimeFormatter;'); o.$p = String(p); return o; },
      ['ofPattern(Ljava/lang/String;Ljava/util/Locale;)Ljava/time/format/DateTimeFormatter;']: (p) => { const o = mkSimple('Ljava/time/format/DateTimeFormatter;'); o.$p = String(p); return o; },
      ['ofLocalizedDate(Ljava/time/format/FormatStyle;)Ljava/time/format/DateTimeFormatter;']: () => { const o = mkSimple('Ljava/time/format/DateTimeFormatter;'); o.$p = 'yyyy-MM-dd'; return o; },
      ['ofLocalizedDateTime(Ljava/time/format/FormatStyle;)Ljava/time/format/DateTimeFormatter;']: () => { const o = mkSimple('Ljava/time/format/DateTimeFormatter;'); o.$p = 'yyyy-MM-dd HH:mm'; return o; },
    },
  });
  R.def('Ljava/time/format/FormatStyle;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Ljava/time/format/DateTimeParseException;', { access: 0x21, sup: 'Ljava/lang/RuntimeException;' });
  for (const n of ['Ljava/time/Month;', 'Ljava/time/DayOfWeek;', 'Ljava/time/Year;', 'Ljava/time/YearMonth;', 'Ljava/time/OffsetDateTime;', 'Ljava/time/MonthDay;']) {
    R.def(n, { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getValue()' + I]: (s) => s.$v || 0, ['name()' + S]: (s) => s.$name || '', ['toString()' + S]: (s) => s.$name || String(s.$v || ''), ['getYear()' + I]: (s) => s.$y || new Date().getFullYear(), ['getMonthValue()' + I]: (s) => s.$v || 0 } });
  }
  for (const n of ['Ljava/time/temporal/Temporal;', 'Ljava/time/temporal/TemporalAccessor;', 'Ljava/time/temporal/TemporalAdjuster;', 'Ljava/time/temporal/TemporalAmount;', 'Ljava/time/temporal/TemporalField;', 'Ljava/time/chrono/ChronoLocalDate;', 'Ljava/time/chrono/ChronoLocalDateTime;', 'Ljava/time/chrono/ChronoZonedDateTime;']) {
    R.def(n, { access: 0x601, sup: 'Ljava/lang/Object;' });
  }
  R.def('Ljava/time/temporal/ChronoUnit;', {
    access: 0x4011, sup: 'Ljava/lang/Enum;',
    m: { ['between(Ljava/time/temporal/Temporal;Ljava/time/temporal/Temporal;)' + J]: (s, a, b) => Math.floor(((b.$ms || 0) - (a.$ms || 0)) / chronoMs(s)), ['getDuration()Ljava/time/Duration;']: (s) => duration(chronoMs(s)), ['name()' + S]: (s) => s.$name || '' },
  });
  function chronoMs(u) { const n = u && u.$name; return { NANOS: 1e-6, MICROS: 1e-3, MILLIS: 1, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000, HALF_DAYS: 43200000, DAYS: 86400000, WEEKS: 604800000 }[n] ?? 1; }
  for (const n of ['NANOS', 'MICROS', 'MILLIS', 'SECONDS', 'MINUTES', 'HOURS', 'HALF_DAYS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS', 'DECADES', 'CENTURIES', 'MILLENNIA', 'ERAS', 'FOREVER']) {
    R.klass('Ljava/time/temporal/ChronoUnit;').statics[`Ljava/time/temporal/ChronoUnit;->${n}:Ljava/time/temporal/ChronoUnit;`] = { $c: R.klass('Ljava/time/temporal/ChronoUnit;'), $name: n };
  }

  /* ================= java.io / nio ================= */
  const baseName = (p) => String(p).split('/').filter(Boolean).pop() || String(p);
  const joinPath = (a, b) => { a = String(a || ''); b = String(b || ''); return a.endsWith('/') ? a + b : a + '/' + b; };
  R.def('Ljava/io/File;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/lang/String;)' + V]: (s, p) => { s.$p = String(p); },
      ['<init>(Ljava/lang/String;Ljava/lang/String;)' + V]: (s, a, b) => { s.$p = joinPath(a, b); },
      ['<init>(Ljava/io/File;Ljava/lang/String;)' + V]: (s, f, b) => { s.$p = joinPath(f ? f.$p : '', b); },
      ['<init>(Ljava/net/URI;)' + V]: (s, u) => { s.$p = String((u && u.$u) || '').replace('file://', ''); },
      ['getPath()' + S]: (s) => s.$p, ['getAbsolutePath()' + S]: (s) => s.$p, ['getCanonicalPath()' + S]: (s) => s.$p,
      ['getName()' + S]: (s) => baseName(s.$p),
      ['getParent()' + S]: (s) => { const p = String(s.$p).split('/'); p.pop(); return p.join('/') || null; },
      ['getParentFile()Ljava/io/File;']: (s) => { const f = mkSimple('Ljava/io/File;'); f.$p = String(s.$p).split('/').slice(0, -1).join('/'); return f; },
      ['exists()' + Z]: (s) => BOOL(H.vfs.has(baseName(s.$p))),
      ['isFile()' + Z]: (s) => BOOL(H.vfs.has(baseName(s.$p))),
      ['isDirectory()' + Z]: (s) => BOOL(!H.vfs.has(baseName(s.$p)) && String(s.$p).length > 0),
      ['isAbsolute()' + Z]: (s) => BOOL(String(s.$p).startsWith('/')),
      ['canRead()' + Z]: () => 1, ['canWrite()' + Z]: () => 1, ['canExecute()' + Z]: () => 0,
      ['isHidden()' + Z]: (s) => BOOL(baseName(s.$p).startsWith('.')),
      ['length()' + J]: (s) => { const b = H.vfs.get(baseName(s.$p)); return b ? b.length : 0; },
      ['lastModified()' + J]: () => Date.now(),
      ['mkdirs()' + Z]: () => 1, ['mkdir()' + Z]: () => 1,
      ['delete()' + Z]: (s) => BOOL(H.vfs.delete(baseName(s.$p))),
      ['createNewFile()' + Z]: (s) => { const n = baseName(s.$p); if (H.vfs.has(n)) return 0; H.vfs.set(n, []); return 1; },
      ['listFiles()[Ljava/io/File;']: () => arr(R, '[Ljava/io/File;', [...H.vfs.keys()].map((n) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/files/' + n; return f; })),
      ['listFiles(Ljava/io/FilenameFilter;)[Ljava/io/File;']: () => arr(R, '[Ljava/io/File;', []),
      ['list()[Ljava/lang/String;']: () => arr(R, '[Ljava/lang/String;', [...H.vfs.keys()]),
      ['toString()' + S]: (s) => s.$p,
      ['hashCode()' + I]: (s) => { let h = 0; for (const ch of String(s.$p)) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0; return h; },
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && o.$p === s.$p),
      ['compareTo(Ljava/io/File;)' + I]: (s, o) => (s.$p < o.$p ? -1 : s.$p > o.$p ? 1 : 0),
      ['getTotalSpace()' + J]: () => 1073741824, ['getFreeSpace()' + J]: () => 536870912, ['getUsableSpace()' + J]: () => 536870912,
      ['toURI()Ljava/net/URI;']: (s) => ({ $c: R.klass('Ljava/net/URI;'), $u: 'file://' + s.$p }),
      ['toPath()Ljava/nio/file/Path;']: (s) => ({ $c: R.klass('Ljava/nio/file/Path;'), $p: s.$p, toString: () => s.$p }),
    },
    sm: {
      ['createTempFile(Ljava/lang/String;Ljava/lang/String;)Ljava/io/File;']: (a) => { const f = mkSimple('Ljava/io/File;'); f.$p = 'tmp_' + a + Math.random().toString(36).slice(2, 8); return f; },
      ['createTempFile(Ljava/lang/String;Ljava/lang/String;Ljava/io/File;)Ljava/io/File;']: (a) => { const f = mkSimple('Ljava/io/File;'); f.$p = 'tmp_' + a + Math.random().toString(36).slice(2, 8); return f; },
    },
  });
  R.klass('Ljava/io/File;').statics['Ljava/io/File;->separator:Ljava/lang/String;'] = '/';
  R.klass('Ljava/io/File;').statics['Ljava/io/File;->separatorChar:C'] = 47;
  R.klass('Ljava/io/File;').statics['Ljava/io/File;->pathSeparator:Ljava/lang/String;'] = ':';
  R.def('Ljava/io/FilenameFilter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/nio/file/Path;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/nio/file/Paths;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: { ['get(Ljava/lang/String;[Ljava/lang/String;)Ljava/nio/file/Path;']: (s) => ({ $c: R.klass('Ljava/nio/file/Path;'), $p: String(s) }) } });
  R.def('Ljava/io/FileInputStream;', {
    access: 0x21, sup: 'Ljava/io/InputStream;',
    m: {
      ['<init>(Ljava/io/File;)' + V]: (s, f) => { s.$b = (H.vfs.get(baseName(f ? f.$p : '')) || []).slice(); s.$p = 0; },
      ['<init>(Ljava/lang/String;)' + V]: (s, n) => { s.$b = (H.vfs.get(baseName(n)) || []).slice(); s.$p = 0; },
      ['read()' + I]: (s) => (s.$p < s.$b.length ? s.$b[s.$p++] & 0xff : -1),
      ['read([B)' + I]: (s, a) => { let n = 0; while (n < a.length && s.$p < s.$b.length) a[n++] = s.$b[s.$p++]; return n || -1; },
      ['read([BII)' + I]: (s, a, o, l) => { let n = 0; while (n < l && s.$p < s.$b.length) { a[o + n] = s.$b[s.$p++]; n++; } return n || -1; },
      ['skip(' + J + ')' + J]: (s, n) => { const k = Math.min(Number(n), s.$b.length - s.$p); s.$p += k; return k; },
      ['available()' + I]: (s) => s.$b.length - s.$p,
      ['close()' + V]: () => {},
    },
  });
  R.def('Ljava/io/FileOutputStream;', {
    access: 0x21, sup: 'Ljava/io/OutputStream;',
    m: {
      ['<init>(Ljava/io/File;)' + V]: (s, f) => { s.$b = []; s.$name = baseName(f ? f.$p : ''); },
      ['<init>(Ljava/io/File;Z)' + V]: (s, f, app) => { const n = baseName(f ? f.$p : ''); s.$b = app ? (H.vfs.get(n) || []).slice() : []; s.$name = n; },
      ['<init>(Ljava/lang/String;)' + V]: (s, n) => { s.$b = []; s.$name = baseName(n); },
      ['<init>(Ljava/lang/String;Z)' + V]: (s, n, app) => { s.$b = app ? (H.vfs.get(baseName(n)) || []).slice() : []; s.$name = baseName(n); },
      ['write(I)' + V]: (s, v) => { s.$b.push(v & 0xff); },
      ['write([B)' + V]: (s, a) => { for (const x of a || []) s.$b.push(x & 0xff); },
      ['write([BII)' + V]: (s, a, o, l) => { for (let i = 0; i < l; i++) s.$b.push(a[o + i] & 0xff); },
      ['flush()' + V]: (s) => { if (s.$name) H.vfs.set(s.$name, s.$b.slice()); },
      ['close()' + V]: (s) => { if (s.$name) H.vfs.set(s.$name, s.$b.slice()); },
      ['getFD()Ljava/io/FileDescriptor;']: () => mkSimple('Ljava/io/FileDescriptor;'),
    },
  });
  R.def('Ljava/io/FileDescriptor;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/ByteArrayOutputStream;', {
    access: 0x21, sup: 'Ljava/io/OutputStream;',
    m: {
      ['close()' + V]: (s) => { if (s.$onClose) s.$onClose(); },
      ['toString(Ljava/lang/String;)' + S]: (s) => bytesToStr(s.$b),
    },
  });
  function makeIter(R, list, start = 0) {
    const c = R.klass('Ljava/util/Iterator;');
    return { $c: c, $list: list, $i: start };
  }
  function listShim(R) {
    return {
      ['<init>()' + V]: (s) => { s.$a = []; },
      ['<init>(' + I + ')' + V]: (s) => { s.$a = []; },
      ['<init>(Ljava/util/Collection;)' + V]: (s, c) => { s.$a = ((c && c.$a) || []).slice(); },
      ['add(' + O + ')' + Z]: (s, o) => { (s.$a = s.$a || []).push(o); return 1; },
      ['add(I' + O + ')' + V]: (s, i, o) => { s.$a.splice(i | 0, 0, o); },
      ['addAll(Ljava/util/Collection;)' + Z]: (s, c) => { for (const x of ((c && c.$a) || [])) s.$a.push(x); return 1; },
      ['remove(' + O + ')' + Z]: (s, o) => { const i = s.$a.indexOf(o); if (i < 0) return 0; s.$a.splice(i, 1); return 1; },
      ['remove(I)' + O]: (s, i) => s.$a.splice(i | 0, 1)[0],
      ['removeAll(Ljava/util/Collection;)' + Z]: (s, c) => { const set = new Set((c && c.$a) || []); const n = s.$a.length; s.$a = s.$a.filter((x) => !set.has(x)); return BOOL(n !== s.$a.length); },
      ['retainAll(Ljava/util/Collection;)' + Z]: (s, c) => { const set = new Set((c && c.$a) || []); const n = s.$a.length; s.$a = s.$a.filter((x) => set.has(x)); return BOOL(n !== s.$a.length); },
      ['clear()' + V]: (s) => { s.$a.length = 0; },
      ['size()' + I]: (s) => (s.$a = s.$a || []).length,
      ['isEmpty()' + Z]: (s) => BOOL(!(s.$a = s.$a || []).length),
      ['contains(' + O + ')' + Z]: (s, o) => BOOL(s.$a.includes(o)),
      ['indexOf(' + O + ')' + I]: (s, o) => s.$a.indexOf(o),
      ['get(I)' + O]: (s, i) => (s.$a[i | 0] === undefined ? null : s.$a[i | 0]),
      ['set(I' + O + ')' + O]: (s, i, o) => { const old = s.$a[i | 0]; s.$a[i | 0] = o; return old === undefined ? null : old; },
      ['iterator()Ljava/util/Iterator;']: (s) => makeIter(R, (s.$a = s.$a || [])),
      ['listIterator()Ljava/util/ListIterator;']: (s) => makeIter(R, s.$a),
      ['listIterator(I)Ljava/util/ListIterator;']: (s, i) => makeIter(R, s.$a, i | 0),
      ['toArray()[Ljava/lang/Object;']: (s) => arr(R, '[Ljava/lang/Object;', s.$a),
      ['subList(II)Ljava/util/List;']: (s, a, b) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: s.$a.slice(a | 0, b | 0) }),
      ['sort(Ljava/util/Comparator;)' + V]: (s, c) => { s.$a.sort(c ? (x, y) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', c, x, y) : compareValsLocal); },
      ['toString()' + S]: (s) => '[' + s.$a.map((x) => R.str(x)).join(', ') + ']',
      ['hashCode()' + I]: (s) => { let h = 1; for (const x of s.$a) h = (Math.imul(31, h) + hashCodeOfLocal(x)) | 0; return h; },
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && o.$a && o.$a.length === s.$a.length && o.$a.every((x, i) => x === s.$a[i])),
    };
  }
  function hashCodeOfLocal(x) { if (x === null || x === undefined) return 0; if (typeof x === 'number') return x | 0; if (typeof x === 'string') { let h = 0; for (let i = 0; i < x.length; i++) h = (Math.imul(31, h) + x.charCodeAt(i)) | 0; return h; } return x.$hash || (x.$hash = (Math.random() * 0x7fffffff) | 0); }
  function setShim(R) {
    const L = listShim(R);
    return Object.assign({}, L, {
      ['add(' + O + ')' + Z]: (s, o) => { if (s.$a.includes(o)) return 0; s.$a.push(o); return 1; },
      ['addAll(Ljava/util/Collection;)' + Z]: (s, c) => { let ch = 0; for (const x of ((c && c.$a) || [])) if (!s.$a.includes(x)) { s.$a.push(x); ch = 1; } return ch; },
    });
  }
  function mapShim(R) {
    const nk = (k) => (typeof k === 'string' ? 's:' + k : typeof k === 'number' ? 'n:' + k : (k === null || k === undefined ? 'null' : 'o:' + hashCodeOfLocal(k)));
    return {
      ['<init>()' + V]: (s) => { s.$m = new Map(); },
      ['<init>(' + I + ')' + V]: (s) => { s.$m = new Map(); },
      ['<init>(Ljava/util/Map;)' + V]: (s, m) => { s.$m = new Map(m && m.$m ? m.$m : []); },
      ['put(' + O + O + ')' + O]: (s, k, v) => { s.$m = s.$m || new Map(); const key = nk(k); const e = s.$m.get(key); s.$m.set(key, { k, v }); return e ? e.v : null; },
      ['get(' + O + ')' + O]: (s, k) => { s.$m = s.$m || new Map(); const e = s.$m.get(nk(k)); return e ? e.v : null; },
      ['remove(' + O + ')' + O]: (s, k) => { const key = nk(k); const e = s.$m.get(key); s.$m.delete(key); return e ? e.v : null; },
      ['containsKey(' + O + ')' + Z]: (s, k) => BOOL(s.$m.has(nk(k))),
      ['containsValue(' + O + ')' + Z]: (s, v) => BOOL([...s.$m.values()].some((e) => e.v === v)),
      ['putAll(Ljava/util/Map;)' + V]: (s, m) => { if (m && m.$m) for (const [k, e] of m.$m) s.$m.set(k, { k: e.k, v: e.v }); },
      ['clear()' + V]: (s) => { (s.$m = s.$m || new Map()).clear(); },
      ['size()' + I]: (s) => (s.$m || (s.$m = new Map())).size,
      ['isEmpty()' + Z]: (s) => BOOL(!(s.$m = s.$m || new Map()).size),
      ['keySet()Ljava/util/Set;']: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [...s.$m.values()].map((e) => e.k) }),
      ['values()Ljava/util/Collection;']: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [...s.$m.values()].map((e) => e.v) }),
      ['entrySet()Ljava/util/Set;']: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: [...s.$m.values()].map((e) => ({ $c: R.klass('Ljava/util/Map$Entry;'), $k: e.k, $v: e.v })) }),
      ['getOrDefault(' + O + O + ')' + O]: (s, k, d) => { const e = s.$m.get(nk(k)); return e ? e.v : d; },
      ['putIfAbsent(' + O + O + ')' + O]: (s, k, v) => { const key = nk(k); if (s.$m.has(key)) return s.$m.get(key).v; s.$m.set(key, { k, v }); return null; },
      ['toString()' + S]: (s) => '{' + [...s.$m.values()].map((e) => R.str(e.k) + '=' + R.str(e.v)).join(', ') + '}',
    };
  }
  function bytesToStr(b) { let x = ''; for (const v of (b || [])) x += String.fromCharCode(v & 0xff); return x; }
  R.def('Ljava/io/FileReader;', { access: 0x21, sup: 'Ljava/io/InputStream;', m: { ['<init>(Ljava/io/File;)' + V]: (s, f) => { s.$t = bytesToStr(H.vfs.get(baseName(f ? f.$p : '')) || []); s.$p = 0; }, ['read()' + I]: (s) => (s.$p < s.$t.length ? s.$t.charCodeAt(s.$p++) : -1) } });
  R.def('Ljava/io/FileWriter;', { access: 0x21, sup: 'Ljava/io/OutputStream;', m: { ['<init>(Ljava/io/File;)' + V]: (s, f) => { s.$name = baseName(f ? f.$p : ''); s.$t = ''; }, ['<init>(Ljava/io/File;Z)' + V]: (s, f) => { s.$name = baseName(f ? f.$p : ''); s.$t = ''; }, ['write(I)' + V]: (s, c) => { s.$t += String.fromCharCode(c & 0xffff); }, ['write(Ljava/lang/String;)' + V]: (s, t) => { s.$t += t; }, ['close()' + V]: (s) => { if (s.$name) H.vfs.set(s.$name, Array.from(s.$t).map((c) => c.charCodeAt(0) & 0xff)); } } });
  R.def('Ljava/io/BufferedReader;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/io/Reader;)' + V]: (s, r) => { s.$r = r; s.$lines = (r && r.$t ? String(r.$t).split('\n') : []); s.$i = 0; }, ['readLine()' + S]: (s) => (s.$i < s.$lines.length ? s.$lines[s.$i++] : null), ['close()' + V]: () => {}, ['lines()Ljava/util/stream/Stream;']: () => null } });
  R.def('Ljava/io/BufferedWriter;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/io/Writer;)' + V]: (s, w) => { s.$w = w; }, ['write(Ljava/lang/String;)' + V]: (s, t) => { if (s.$w && s.$w.$t !== undefined) s.$w.$t += t; }, ['write(Ljava/lang/String;II)' + V]: (s, t) => { if (s.$w && s.$w.$t !== undefined) s.$w.$t += t; }, ['newLine()' + V]: (s) => { if (s.$w && s.$w.$t !== undefined) s.$w.$t += '\n'; }, ['flush()' + V]: () => {}, ['close()' + V]: (s) => { if (s.$w && s.$w.$name) H.vfs.set(s.$w.$name, Array.from(s.$w.$t).map((c) => c.charCodeAt(0) & 0xff)); } } });
  R.def('Ljava/io/Reader;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/Writer;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/StringReader;', { access: 0x21, sup: 'Ljava/io/Reader;', m: { ['<init>(Ljava/lang/String;)' + V]: (s, t) => { s.$t = String(t); } } });
  R.def('Ljava/io/StringWriter;', { access: 0x21, sup: 'Ljava/io/Writer;', m: { ['<init>()' + V]: (s) => { s.$t = ''; }, ['write(Ljava/lang/String;)' + V]: (s, x) => { s.$t += x; }, ['write(I)' + V]: (s, c) => { s.$t += String.fromCharCode(c & 0xffff); }, ['toString()' + S]: (s) => s.$t, ['getBuffer()Ljava/lang/StringBuffer;']: (s) => ({ $c: R.klass('Ljava/lang/StringBuffer;'), $s: [s.$t] }) } });
  R.def('Ljava/io/InputStreamReader;', { access: 0x21, sup: 'Ljava/io/Reader;', m: { ['<init>(Ljava/io/InputStream;)' + V]: (s, i) => { s.$t = bytesToStr(i && i.$b ? i.$b.slice(i.$p || 0) : []); } } });
  R.def('Ljava/io/OutputStreamWriter;', { access: 0x21, sup: 'Ljava/io/Writer;' });
  R.def('Ljava/io/FilterOutputStream;', { access: 0x21, sup: 'Ljava/io/OutputStream;' });
  R.def('Ljava/io/DataInputStream;', { access: 0x21, sup: 'Ljava/io/InputStream;' });
  R.def('Ljava/io/DataOutputStream;', { access: 0x21, sup: 'Ljava/io/OutputStream;' });
  R.def('Ljava/io/ObjectInputStream;', { access: 0x21, sup: 'Ljava/io/InputStream;' });
  R.def('Ljava/io/ObjectOutputStream;', { access: 0x21, sup: 'Ljava/io/OutputStream;' });
  R.def('Ljava/util/Scanner;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/io/InputStream;)' + V]: (s, i) => { s.$lines = (i && i.$b ? bytesToStr(i.$b).split('\n') : []); s.$i = 0; }, ['<init>(Ljava/lang/String;)' + V]: (s, t) => { s.$lines = String(t).split('\n'); s.$i = 0; }, ['hasNextLine()' + Z]: (s) => BOOL(s.$i < s.$lines.length), ['nextLine()' + S]: (s) => (s.$i < s.$lines.length ? s.$lines[s.$i++] : ''), ['hasNext()' + Z]: (s) => BOOL(s.$i < s.$lines.length), ['next()' + S]: (s) => (s.$i < s.$lines.length ? s.$lines[s.$i++].split(' ')[0] : ''), ['close()' + V]: () => {} } });
  R.def('Ljava/nio/charset/Charset;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['name()' + S]: () => 'UTF-8' }, sm: { ['forName(Ljava/lang/String;)Ljava/nio/charset/Charset;']: () => mkSimple('Ljava/nio/charset/Charset;'), ['defaultCharset()Ljava/nio/charset/Charset;']: () => mkSimple('Ljava/nio/charset/Charset;') } });
  R.def('Ljava/nio/charset/StandardCharsets;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/nio/ByteBuffer;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['array()[B']: (s) => s.$a, ['remaining()' + I]: (s) => (s.$a ? s.$a.length : 0), ['position()' + I]: (s) => s.$pos || 0, ['put([B)Ljava/nio/ByteBuffer;']: (s) => s, ['get([B)Ljava/nio/ByteBuffer;']: (s) => s, ['clear()Ljava/nio/ByteBuffer;']: (s) => s, ['flip()Ljava/nio/ByteBuffer;']: (s) => s }, sm: { ['allocate(I)Ljava/nio/ByteBuffer;']: (n) => { const b = mkSimple('Ljava/nio/ByteBuffer;'); b.$a = new Array(n | 0).fill(0); b.$a[ARR_CLASS] = R.klass('[B'); return b; }, ['wrap([B)Ljava/nio/ByteBuffer;']: (a) => { const b = mkSimple('Ljava/nio/ByteBuffer;'); b.$a = a; return b; } } });
  R.def('Ljava/util/Base64;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getEncoder()Ljava/util/Base64$Encoder;']: () => mkSimple('Ljava/util/Base64$Encoder;'), ['getDecoder()Ljava/util/Base64$Decoder;']: () => mkSimple('Ljava/util/Base64$Decoder;') } });
  R.def('Ljava/util/Base64$Encoder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['encodeToString([B)' + S]: (s, b) => { let bin = ''; for (const x of b || []) bin += String.fromCharCode(x & 0xff); return btoa(bin); } } });
  R.def('Ljava/util/Base64$Decoder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['decode(Ljava/lang/String;)[B']: (s, t) => { const bin = atob(String(t)); const out = new Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); out[ARR_CLASS] = R.klass('[B'); return out; } } });
  /* ---- abstract collection bases: subclasses override size()/get()/entrySet()
         and everything else must call back through virtual dispatch ---- */
  function itrOver(R, list) {
    const c = R.klass('Ljava/util/Iterator;');
    return { $c: c, $list: null, $i: 0, $of: list };
  }
  R.def('Ljava/util/AbstractCollection;', {
    access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Collection;'],
    m: {
      ['size()' + I]: () => 0,
      ['isEmpty()' + Z]: (s) => BOOL((R.iv('Ljava/util/Collection;->size()I', s) | 0) === 0),
      ['iterator()Ljava/util/Iterator;']: (s) => ({ $c: R.klass('Ljava/util/AbstractCollection$D2WItr;'), $host: s, $i: 0 }),
      ['contains(' + O + ')' + Z]: (s, o) => {
        const it = R.iv('Ljava/util/Collection;->iterator()Ljava/util/Iterator;', s);
        while (R.iv('Ljava/util/Iterator;->hasNext()Z', it)) if (R.iv('Ljava/util/Iterator;->next()Ljava/lang/Object;', it) === o) return 1;
        return 0;
      },
      ['toArray()[Ljava/lang/Object;']: (s) => {
        const out = []; const it = R.iv('Ljava/util/Collection;->iterator()Ljava/util/Iterator;', s);
        while (R.iv('Ljava/util/Iterator;->hasNext()Z', it)) out.push(R.iv('Ljava/util/Iterator;->next()Ljava/lang/Object;', it));
        out[ARR_CLASS] = R.klass('[Ljava/lang/Object;'); return out;
      },
      ['add(' + O + ')' + Z]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'add'); },
      ['remove(' + O + ')' + Z]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'remove'); },
      ['containsAll(Ljava/util/Collection;)' + Z]: (s, c) => { for (const x of ((c && c.$a) || [])) if (!R.iv('Ljava/util/Collection;->contains(Ljava/lang/Object;)Z', s, x)) return 0; return 1; },
      ['addAll(Ljava/util/Collection;)' + Z]: (s, c) => { let ch = 0; for (const x of ((c && c.$a) || [])) ch |= R.iv('Ljava/util/Collection;->add(Ljava/lang/Object;)Z', s, x); return ch; },
      ['clear()' + V]: (s) => { const it = R.iv('Ljava/util/Collection;->iterator()Ljava/util/Iterator;', s); while (R.iv('Ljava/util/Iterator;->hasNext()Z', it)) { R.iv('Ljava/util/Iterator;->next()Ljava/lang/Object;', it); R.iv('Ljava/util/Iterator;->remove()V', it); } },
      ['toString()' + S]: (s) => '[' + (R.iv('Ljava/util/Collection;->toArray()[Ljava/lang/Object;', s) || []).map((x) => R.str(x)).join(', ') + ']',
    },
  });
  R.def('Ljava/util/AbstractCollection$D2WItr;', {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Iterator;'],
    m: {
      ['hasNext()' + Z]: (s) => BOOL(s.$i < (R.iv('Ljava/util/Collection;->size()I', s.$host) | 0)),
      ['next()' + O]: (s) => { const v = R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s.$host, s.$i++); return v; },
      ['remove()' + V]: (s) => { R.iv('Ljava/util/List;->remove(I)Ljava/lang/Object;', s.$host, --s.$i); },
    },
  });
  R.def('Ljava/util/AbstractList;', {
    access: 0x421, sup: 'Ljava/util/AbstractCollection;', ifaces: ['Ljava/util/List;'],
    m: {
      ['get(I)' + O]: () => { throw R.newException('Ljava/lang/IndexOutOfBoundsException;', 'get'); },
      ['set(I' + O + ')' + O]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'set'); },
      ['add(' + O + ')' + Z]: (s, o) => { R.iv('Ljava/util/List;->add(ILjava/lang/Object;)V', s, R.iv('Ljava/util/List;->size()I', s) | 0, o); return 1; },
      ['add(I' + O + ')' + V]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'add(I,E)'); },
      ['remove(I)' + O]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'remove(I)'); },
      ['indexOf(' + O + ')' + I]: (s, o) => { const n = R.iv('Ljava/util/List;->size()I', s) | 0; for (let i = 0; i < n; i++) { if (R.eq(R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s, i), o)) return i; } return -1; },
      ['lastIndexOf(' + O + ')' + I]: (s, o) => { const n = R.iv('Ljava/util/List;->size()I', s) | 0; for (let i = n - 1; i >= 0; i--) { if (R.eq(R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s, i), o)) return i; } return -1; },
      ['clear()' + V]: (s) => { const n = R.iv('Ljava/util/List;->size()I', s) | 0; for (let i = n - 1; i >= 0; i--) R.iv('Ljava/util/List;->remove(I)Ljava/lang/Object;', s, i); },
      ['iterator()Ljava/util/Iterator;']: (s) => R.iv('Ljava/util/List;->listIterator()Ljava/util/ListIterator;', s),
      ['listIterator()Ljava/util/ListIterator;']: (s) => R.iv('Ljava/util/List;->listIterator(I)Ljava/util/ListIterator;', s, 0),
      ['listIterator(I)Ljava/util/ListIterator;']: (s, i) => ({ $c: R.klass('Ljava/util/AbstractList$D2WListItr;'), $host: s, $i: i | 0, $last: -1 }),
      ['subList(II)Ljava/util/List;']: (s, a, b) => ({ $c: R.klass('Ljava/util/AbstractList$D2WSub;'), $host: s, $a: a | 0, $b: b | 0 }),
    },
  });
  R.def('Ljava/util/AbstractList$D2WListItr;', {
    access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/ListIterator;', 'Ljava/util/Iterator;'],
    m: {
      ['hasNext()' + Z]: (s) => BOOL(s.$i < (R.iv('Ljava/util/List;->size()I', s.$host) | 0)),
      ['next()' + O]: (s) => { s.$last = s.$i; return R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s.$host, s.$i++); },
      ['hasPrevious()' + Z]: (s) => BOOL(s.$i > 0),
      ['previous()' + O]: (s) => { s.$i--; s.$last = s.$i; return R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s.$host, s.$i); },
      ['nextIndex()' + I]: (s) => s.$i,
      ['previousIndex()' + I]: (s) => s.$i - 1,
      ['remove()' + V]: (s) => { R.iv('Ljava/util/List;->remove(I)Ljava/lang/Object;', s.$host, s.$last); s.$i = s.$last; },
      ['set(' + O + ')' + V]: (s, o) => { R.iv('Ljava/util/List;->set(I' + O + ')' + O, s.$host, s.$last, o); },
      ['add(' + O + ')' + V]: (s, o) => { R.iv('Ljava/util/List;->add(I' + O + ')' + V, s.$host, s.$i++, o); },
    },
  });
  R.def('Ljava/util/AbstractList$D2WSub;', {
    access: 0x21, sup: 'Ljava/util/AbstractList;',
    m: {
      ['size()' + I]: (s) => (s.$b - s.$a) | 0,
      ['get(I)' + O]: (s, i) => R.iv('Ljava/util/List;->get(I)Ljava/lang/Object;', s.$host, s.$a + (i | 0)),
    },
  });
  R.def('Ljava/util/AbstractSequentialList;', { access: 0x421, sup: 'Ljava/util/AbstractList;' });
  R.def('Ljava/util/AbstractSet;', { access: 0x421, sup: 'Ljava/util/AbstractCollection;', ifaces: ['Ljava/util/Set;'], m: { ['equals(' + O + ')' + Z]: (s, o) => BOOL(s === o), ['remove(' + O + ')' + Z]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'remove'); } } });
  R.def('Ljava/util/AbstractMap;', {
    access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;'],
    m: {
      ['size()' + I]: (s) => (R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s).$a || []).length,
      ['isEmpty()' + Z]: (s) => BOOL((R.iv('Ljava/util/Map;->size()I', s) | 0) === 0),
      ['get(' + O + ')' + O]: (s, k) => { const es = R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s); for (const e of (es.$a || [])) if (R.eq(e.$k !== undefined ? e.$k : R.iv('Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;', e), k)) return e.$v !== undefined ? e.$v : R.iv('Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;', e); return null; },
      ['containsKey(' + O + ')' + Z]: (s, k) => { const es = R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s); for (const e of (es.$a || [])) if (R.eq(e.$k !== undefined ? e.$k : R.iv('Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;', e), k)) return 1; return 0; },
      ['containsValue(' + O + ')' + Z]: (s, v) => { const es = R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s); for (const e of (es.$a || [])) if (R.eq(e.$v !== undefined ? e.$v : R.iv('Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;', e), v)) return 1; return 0; },
      ['put(' + O + O + ')' + O]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'put'); },
      ['remove(' + O + ')' + O]: () => { throw R.newException('Ljava/lang/UnsupportedOperationException;', 'remove'); },
      ['putAll(Ljava/util/Map;)' + V]: (s, m) => { const es = R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', m); for (const e of (es.$a || [])) R.iv('Ljava/util/Map;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', s, e.$k, e.$v); },
      ['clear()' + V]: (s) => { R.iv('Ljava/util/Set;->clear()V', R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s)); },
      ['keySet()Ljava/util/Set;']: (s) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: (R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s).$a || []).map((e) => (e.$k !== undefined ? e.$k : R.iv('Ljava/util/Map$Entry;->getKey()Ljava/lang/Object;', e))) }),
      ['values()Ljava/util/Collection;']: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: (R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s).$a || []).map((e) => (e.$v !== undefined ? e.$v : R.iv('Ljava/util/Map$Entry;->getValue()Ljava/lang/Object;', e))) }),
      ['toString()' + S]: (s) => '{' + (R.iv('Ljava/util/Map;->entrySet()Ljava/util/Set;', s).$a || []).map((e) => R.str(e.$k) + '=' + R.str(e.$v)).join(', ') + '}',
    },
  });
  R.def('Ljava/util/stream/Stream;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/stream/IntStream;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/stream/Collectors;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/Optional;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['isPresent()' + Z]: (s) => BOOL(s.$v !== null && s.$v !== undefined), ['get()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['orElse(' + O + ')' + O]: (s, d) => (s.$v === null || s.$v === undefined ? d : s.$v) }, sm: { ['of(' + O + ')Ljava/util/Optional;']: (v) => { const o = mkSimple('Ljava/util/Optional;'); o.$v = v; return o; }, ['ofNullable(' + O + ')Ljava/util/Optional;']: (v) => { const o = mkSimple('Ljava/util/Optional;'); o.$v = v; return o; }, ['empty()Ljava/util/Optional;']: () => { const o = mkSimple('Ljava/util/Optional;'); o.$v = null; return o; } } });

  /* ================= android extras ================= */
  function haversine(la1, lo1, la2, lo2) {
    const Rr = 6371000, toRad = (x) => x * Math.PI / 180;
    const dLa = toRad((la2 || 0) - (la1 || 0)), dLo = toRad((lo2 || 0) - (lo1 || 0));
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1 || 0)) * Math.cos(toRad(la2 || 0)) * Math.sin(dLo / 2) ** 2;
    return Rr * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  R.def('Landroid/location/Location;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/lang/String;)' + V]: (s, p) => { s.$provider = p; s.$lat = 0; s.$lon = 0; s.$time = Date.now(); },
      ['<init>(Landroid/location/Location;)' + V]: (s, o) => Object.assign(s, { $provider: o.$provider, $lat: o.$lat, $lon: o.$lon, $time: o.$time, $acc: o.$acc }),
      ['getLatitude()' + D]: (s) => s.$lat || 0, ['setLatitude(D)' + V]: (s, v) => { s.$lat = v; },
      ['getLongitude()' + D]: (s) => s.$lon || 0, ['setLongitude(D)' + V]: (s, v) => { s.$lon = v; },
      ['getTime()' + J]: (s) => s.$time || Date.now(), ['setTime(' + J + ')' + V]: (s, v) => { s.$time = Number(v); },
      ['getAccuracy()' + F]: (s) => Math.fround(s.$acc || 0), ['setAccuracy(F)' + V]: (s, v) => { s.$acc = v; },
      ['getAltitude()' + D]: (s) => s.$alt || 0, ['setAltitude(D)' + V]: (s, v) => { s.$alt = v; },
      ['getBearing()' + F]: (s) => Math.fround(s.$bearing || 0), ['setBearing(F)' + V]: (s, v) => { s.$bearing = v; },
      ['getSpeed()' + F]: (s) => Math.fround(s.$speed || 0), ['setSpeed(F)' + V]: (s, v) => { s.$speed = v; },
      ['getProvider()' + S]: (s) => s.$provider || 'network', ['setProvider(Ljava/lang/String;)' + V]: (s, p) => { s.$provider = p; },
      ['hasAccuracy()' + Z]: (s) => BOOL(!!s.$acc), ['hasAltitude()' + Z]: () => 0, ['hasBearing()' + Z]: () => 0, ['hasSpeed()' + Z]: () => 0,
      ['distanceTo(Landroid/location/Location;)' + F]: (s, o) => Math.fround(haversine(s.$lat, s.$lon, o && o.$lat, o && o.$lon)),
      ['distanceBetween(DDDD[F)' + V]: (s, la1, lo1, la2, lo2, out) => { if (out) out[0] = haversine(la1, lo1, la2, lo2); },
      ['getElapsedRealtimeNanos()' + J]: () => Date.now() * 1e6,
      ['toString()' + S]: (s) => `Location[${s.$provider || ''} ${s.$lat},${s.$lon}]`,
    },
  });
  R.def('Landroid/app/ActivityManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getRunningServices(I)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }), ['getRunningAppProcesses()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }), ['getMemoryInfo(Landroid/app/ActivityManager$MemoryInfo;)' + V]: (s, o) => { if (o) { o['Landroid/app/ActivityManager$MemoryInfo;->availMem:J'] = 536870912; o['Landroid/app/ActivityManager$MemoryInfo;->totalMem:J'] = 1073741824; o['Landroid/app/ActivityManager$MemoryInfo;->lowMemory:Z'] = 0; } }, ['killBackgroundProcesses(Ljava/lang/String;)' + V]: () => {}, ['getMemoryClass()' + I]: () => 256 } });
  R.def('Landroid/app/ActivityManager$MemoryInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['availMem', 'J'], ['lowMemory', 'Z'], ['threshold', 'J'], ['totalMem', 'J']] });
  R.def('Landroid/app/ActivityManager$RunningServiceInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/PackageInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['versionName', 'Ljava/lang/String;'], ['versionCode', 'I'], ['packageName', 'Ljava/lang/String;'], ['firstInstallTime', 'J'], ['lastUpdateTime', 'J'], ['longVersionCode', 'J']] });
  R.def('Landroid/content/pm/PackageManager;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;']: () => packageInfo(R, H),
      ['getPackageInfo(Landroid/content/pm/VersionedPackage;I)Landroid/content/pm/PackageInfo;']: () => packageInfo(R, H),
      ['getApplicationInfo(Ljava/lang/String;I)Landroid/content/pm/ApplicationInfo;']: () => mkSimple('Landroid/content/pm/ApplicationInfo;'),
      ['getApplicationLabel(Landroid/content/pm/ApplicationInfo;)Ljava/lang/CharSequence;']: () => String((H.manifest && H.manifest.label) || ''),
      ['getApplicationIcon(Ljava/lang/String;)Landroid/graphics/drawable/Drawable;']: () => H.resDrawable(H.manifest ? H.manifest.iconResId : 0),
      ['getInstalledPackages(I)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['getInstalledApplications(I)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['queryIntentActivities(Landroid/content/Intent;I)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['resolveActivity(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;']: () => null,
      ['hasSystemFeature(Ljava/lang/String;)' + Z]: (s, f) => BOOL(H.manifest && (H.manifest.features || []).includes(String(f))),
      ['getLaunchIntentForPackage(Ljava/lang/String;)Landroid/content/Intent;']: () => null,
      ['checkPermission(Ljava/lang/String;Ljava/lang/String;)' + I]: () => 0,
    },
  });
  function applicationInfo(R, H) {
    const o = mkSimple('Landroid/content/pm/ApplicationInfo;');
    const K = 'Landroid/content/pm/ApplicationInfo;->';
    o[K + 'packageName:Ljava/lang/String;'] = H.packageName;
    o[K + 'flags:I'] = 0;   // not FLAG_DEBUGGABLE
    o[K + 'targetSdkVersion:I'] = H.manifest && H.manifest.targetSdk ? (H.manifest.targetSdk | 0) : 33;
    o[K + 'labelRes:I'] = 0;
    o[K + 'sourceDir:Ljava/lang/String;'] = '/base.apk';
    o[K + 'dataDir:Ljava/lang/String;'] = '/data/data/' + H.packageName;
    return o;
  }
  R.def('Landroid/content/pm/ApplicationInfo;', { access: 0x21, sup: 'Landroid/content/pm/PackageItemInfo;', fields: [['packageName', 'Ljava/lang/String;'], ['flags', 'I'], ['targetSdkVersion', 'I'], ['labelRes', 'I'], ['sourceDir', 'Ljava/lang/String;'], ['dataDir', 'Ljava/lang/String;'], ['uid', 'I'], ['processName', 'Ljava/lang/String;'], ['className', 'Ljava/lang/String;'], ['theme', 'I'], ['descriptionRes', 'I'], ['enabled', 'Z'], ['nativeLibraryDir', 'Ljava/lang/String;']] });
  R.def('Landroid/content/pm/PackageItemInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['name', 'Ljava/lang/String;'], ['packageName', 'Ljava/lang/String;'], ['labelRes', 'I'], ['nonLocalizedLabel', 'Ljava/lang/CharSequence;'], ['icon', 'I'], ['logo', 'I'], ['banner', 'I'], ['metaData', 'Landroid/os/Bundle;']] });
  R.klass('Landroid/content/pm/ApplicationInfo;').statics['Landroid/content/pm/ApplicationInfo;->FLAG_DEBUGGABLE:I'] = 2;
  R.klass('Landroid/content/pm/ApplicationInfo;').statics['Landroid/content/pm/ApplicationInfo;->FLAG_HAS_CODE:I'] = 4;
  R.klass('Landroid/content/pm/ApplicationInfo;').statics['Landroid/content/pm/ApplicationInfo;->FLAG_SYSTEM:I'] = 1;
  R.klass('Landroid/content/pm/ApplicationInfo;').statics['Landroid/content/pm/ApplicationInfo;->FLAG_INSTALLED:I'] = 128;
  function packageInfo(R, H) {
    const o = mkSimple('Landroid/content/pm/PackageInfo;');
    const K = 'Landroid/content/pm/PackageInfo;->';
    o[K + 'versionName:Ljava/lang/String;'] = H.manifest ? String(H.manifest.versionName || '') : '';
    o[K + 'versionCode:I'] = H.manifest ? (H.manifest.versionCode | 0) : 0;
    o[K + 'longVersionCode:J'] = H.manifest ? (H.manifest.versionCode | 0) : 0;
    o[K + 'packageName:Ljava/lang/String;'] = H.packageName;
    o[K + 'firstInstallTime:J'] = Date.now();
    o[K + 'lastUpdateTime:J'] = Date.now();
    return o;
  }
  R.def('Landroid/content/pm/VersionedPackage;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/ActivityInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/ServiceInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/PermissionInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/Signature;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/pm/SigningInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  R.def('Landroid/view/Window;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['getDecorView()Landroid/view/View;']: (s) => (s.$activity && s.$activity.$contentView) || s.$decor || null,
      ['setContentView(Landroid/view/View;)' + V]: (s, v) => H.setContentView(s.$activity, null, v),
      ['setContentView(I)' + V]: (s, id) => H.setContentView(s.$activity, id | 0, null),
      ['setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)' + V]: (s, v) => H.setContentView(s.$activity, null, v),
      ['setSoftInputMode(I)' + V]: () => {},
      ['getAttributes()Landroid/view/WindowManager$LayoutParams;']: (s) => s.$attrs || (s.$attrs = mkSimple('Landroid/view/WindowManager$LayoutParams;')),
      ['setAttributes(Landroid/view/WindowManager$LayoutParams;)' + V]: (s, a) => { s.$attrs = a; },
      ['addContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)' + V]: (s, v) => { if (s.$activity) H.setContentView(s.$activity, null, v); },
      ['getInsetsController()Landroid/view/WindowInsetsController;']: () => mkSimple('Landroid/view/WindowInsetsController;'),
      ['setDecorFitsSystemWindows(Z)' + V]: () => {},
      ['findViewById(I)Landroid/view/View;']: (s, id) => H.findViewById(s.$activity, id | 0),
      ['setFeatureDrawableResource(II)' + V]: () => {},
      ['peekDecorView()Landroid/view/View;']: (s) => (s.$activity && s.$activity.$contentView) || null,
      ['getLayoutInflater()Landroid/view/LayoutInflater;']: () => H.layoutInflater(H.currentActivity()),
    },
  });
  R.def('Landroid/view/WindowManager$LayoutParams;', { access: 0x29, sup: 'Landroid/view/ViewGroup$MarginLayoutParams;', fields: [['screenBrightness', 'F'], ['type', 'I'], ['flags', 'I'], ['format', 'I'], ['softInputMode', 'I'], ['alpha', 'F'], ['dimAmount', 'F'], ['gravity', 'I'], ['x', 'I'], ['y', 'I']] });
  R.def('Landroid/view/WindowInsets;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getSystemWindowInsetTop()' + I]: () => 0, ['getSystemWindowInsetBottom()' + I]: () => 0, ['getSystemWindowInsetLeft()' + I]: () => 0, ['getSystemWindowInsetRight()' + I]: () => 0, ['getStableInsetTop()' + I]: () => 0, ['consumeSystemWindowInsets()Landroid/view/WindowInsets;']: (s) => s, ['getDisplayCutout()Landroid/view/DisplayCutout;']: () => null, ['isVisible(I)' + Z]: () => 1, ['getInsets(I)Landroid/graphics/Insets;']: () => mkSimple('Landroid/graphics/Insets;') } });
  R.def('Landroid/graphics/Insets;', { access: 0x31, sup: 'Ljava/lang/Object;', fields: [['left', 'I'], ['top', 'I'], ['right', 'I'], ['bottom', 'I']] });
  R.def('Landroid/view/WindowInsetsController;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['hide(I)' + V]: () => {}, ['show(I)' + V]: () => {}, ['setSystemBarsBehavior(I)' + V]: () => {}, ['setSystemBarsAppearance(II)' + V]: () => {} } });
  R.def('Landroid/view/DisplayCutout;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnApplyWindowInsetsListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/core/view/WindowInsetsCompat;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getInsets(I)Landroidx/core/graphics/Insets;']: () => mkSimple('Landroidx/core/graphics/Insets;'), ['getSystemWindowInsetTop()' + I]: () => 0, ['getSystemWindowInsetBottom()' + I]: () => 0, ['consumeSystemWindowInsets()Landroidx/core/view/WindowInsetsCompat;']: (s) => s, ['isVisible(I)' + Z]: () => 1, ['getInsetsIgnoringVisibility(I)Landroidx/core/graphics/Insets;']: () => mkSimple('Landroidx/core/graphics/Insets;') }, sm: { ['toWindowInsetsCompat(Landroid/view/WindowInsets;)Landroidx/core/view/WindowInsetsCompat;']: () => mkSimple('Landroidx/core/view/WindowInsetsCompat;'), ['toWindowInsetsCompat(Landroid/view/WindowInsets;Landroid/view/View;)Landroidx/core/view/WindowInsetsCompat;']: () => mkSimple('Landroidx/core/view/WindowInsetsCompat;'), ['getInsets(I)Landroidx/core/graphics/Insets;']: () => mkSimple('Landroidx/core/graphics/Insets;') } });
  R.def('Landroidx/core/graphics/Insets;', { access: 0x31, sup: 'Ljava/lang/Object;', fields: [['left', 'I'], ['top', 'I'], ['right', 'I'], ['bottom', 'I']], sm: { ['of(IIII)Landroidx/core/graphics/Insets;']: () => mkSimple('Landroidx/core/graphics/Insets;') } });
  R.def('Landroidx/core/view/ViewCompat;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['setOnApplyWindowInsetsListener(Landroid/view/View;Landroidx/core/view/OnApplyWindowInsetsListener;)' + V]: (v, l) => { if (v) v.$insetsListenerCompat = l; },
      ['requestApplyInsets(Landroid/view/View;)' + V]: (v) => {
        if (v && v.$insetsListenerCompat) { try { R.iv('Landroidx/core/view/OnApplyWindowInsetsListener;->onApplyWindowInsets(Landroid/view/View;Landroidx/core/view/WindowInsetsCompat;)Landroidx/core/view/WindowInsetsCompat;', v.$insetsListenerCompat, v, mkSimple('Landroidx/core/view/WindowInsetsCompat;')); } catch (e) { H.crash(e); } }
      },
      ['setElevation(Landroid/view/View;F)' + V]: () => {},
      ['setPaddingRelative(Landroid/view/View;IIII)' + V]: (v, l, t, r, b) => H.viewSetPadding(v, l, t, r, b),
      ['getMinimumHeight(Landroid/view/View;)' + I]: () => 0,
      ['postOnAnimation(Landroid/view/View;Ljava/lang/Runnable;)' + V]: (v, r) => H.post(() => safeRun(r)),
      ['postOnAnimationDelayed(Landroid/view/View;Ljava/lang/Runnable;J)' + V]: (v, r, d) => H.postDelayed(() => safeRun(r), Number(d)),
      ['setTransitionName(Landroid/view/View;Ljava/lang/String;)' + V]: () => {},
      ['setBackground(Landroid/view/View;Landroid/graphics/drawable/Drawable;)' + V]: (v, d) => { if (v) { v.$bgDrawable = d; H.renderer.applyDrawableBg(v); } },
      ['getScrollY(Landroid/view/View;)' + I]: () => 0,
      ['isLaidOut(Landroid/view/View;)' + Z]: () => 1,
      ['setAccessibilityDelegate(Landroid/view/View;Landroidx/core/view/AccessibilityDelegateCompat;)' + V]: () => {},
    },
  });
  R.def('Landroidx/core/view/OnApplyWindowInsetsListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/core/view/AccessibilityDelegateCompat;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/core/view/WindowCompat;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['setDecorFitsSystemWindows(Landroid/view/Window;Z)' + V]: () => {}, ['getInsetsController(Landroid/view/Window;Landroid/view/View;)Landroidx/core/view/WindowInsetsControllerCompat;']: () => mkSimple('Landroidx/core/view/WindowInsetsControllerCompat;') } });
  R.def('Landroidx/core/view/WindowInsetsControllerCompat;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['hide(I)' + V]: () => {}, ['show(I)' + V]: () => {}, ['setSystemBarsBehavior(I)' + V]: () => {}, ['setAppearanceLightStatusBars(Z)' + V]: () => {}, ['setAppearanceLightNavigationBars(Z)' + V]: () => {} } });
  R.def('Landroid/view/View;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['setOnApplyWindowInsetsListener(Landroid/view/View$OnApplyWindowInsetsListener;)' + V]: (s, l) => { s.$insetsListener = l; },
      ['requestApplyInsets()' + V]: (s) => { if (s && s.$insetsListener) { try { R.iv('Landroid/view/View$OnApplyWindowInsetsListener;->onApplyWindowInsets(Landroid/view/View;Landroid/view/WindowInsets;)Landroid/view/WindowInsets;', s.$insetsListener, s, mkSimple('Landroid/view/WindowInsets;')); } catch (e) { H.crash(e); } } },
      ['setOnScrollChangeListener(Landroid/view/View$OnScrollChangeListener;)' + V]: (s, l) => { s.$onScroll = l; },
      ['getWindowInsetsController()Landroid/view/WindowInsetsController;']: () => mkSimple('Landroid/view/WindowInsetsController;'),
      ['getWindowInsets()Landroid/view/WindowInsets;']: () => mkSimple('Landroid/view/WindowInsets;'),
      ['getRootWindowInsets()Landroid/view/WindowInsets;']: () => mkSimple('Landroid/view/WindowInsets;'),
      ['setSystemGestureExclusionRects(Ljava/util/List;)' + V]: () => {},
      ['addOnLayoutChangeListener(Landroid/view/View$OnLayoutChangeListener;)' + V]: () => {},
      ['getResources()Landroid/content/res/Resources;']: () => H.resources(),
      ['getDisplay()Landroid/view/Display;']: () => mkSimple('Landroid/view/Display;'),
      ['getClipBounds(Landroid/graphics/Rect;)' + Z]: () => 0,
      ['isLaidOut()' + Z]: () => 1,
      ['getTransitionName()' + S]: () => null,
      ['setLayerType(ILandroid/graphics/Paint;)' + V]: () => {},
      ['setBackgroundColor(I)' + V]: (s, c) => H.viewSetBackground(s, c | 0),
    },
  });
  R.def('Landroid/view/View$OnLayoutChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnScrollChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnFocusChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/Display;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getWidth()' + I]: () => H.screenWidth(), ['getHeight()' + I]: () => H.screenHeight(), ['getMetrics(Landroid/util/DisplayMetrics;)' + V]: (s, m) => { if (m) { m['Landroid/util/DisplayMetrics;->widthPixels:I'] = H.screenWidth(); m['Landroid/util/DisplayMetrics;->heightPixels:I'] = H.screenHeight(); m['Landroid/util/DisplayMetrics;->density:F'] = 1; m['Landroid/util/DisplayMetrics;->densityDpi:I'] = 160; } }, ['getRealMetrics(Landroid/util/DisplayMetrics;)' + V]: (s, m) => { if (m) { m['Landroid/util/DisplayMetrics;->widthPixels:I'] = H.screenWidth(); m['Landroid/util/DisplayMetrics;->heightPixels:I'] = H.screenHeight(); } }, ['getRealSize(Landroid/graphics/Point;)' + V]: (s, p) => { if (p) { p.$x = H.screenWidth(); p.$y = H.screenHeight(); } }, ['getRotation()' + I]: () => 0, ['getSize(Landroid/graphics/Point;)' + V]: (s, p) => { if (p) { p.$x = H.screenWidth(); p.$y = H.screenHeight(); } } } });
  R.def('Landroid/util/DisplayMetrics;', { access: 0x11, sup: 'Ljava/lang/Object;', fields: [['widthPixels', 'I'], ['heightPixels', 'I'], ['density', 'F'], ['densityDpi', 'I'], ['scaledDensity', 'F'], ['xdpi', 'F'], ['ydpi', 'F']] });
  R.def('Landroid/util/AtomicFile;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/io/File;)' + V]: (s, f) => { s.$f = f; },
      ['getBaseFile()Ljava/io/File;']: (s) => s.$f,
      ['startWrite()Ljava/io/FileOutputStream;']: (s) => { const o = mkSimple('Ljava/io/FileOutputStream;'); o.$b = []; o.$name = baseName(s.$f ? s.$f.$p : 'atomic'); return o; },
      ['finishWrite(Ljava/io/FileOutputStream;)' + V]: (s, o) => { if (o && o.$name) H.vfs.set(o.$name, o.$b.slice()); },
      ['failWrite(Ljava/io/FileOutputStream;)' + V]: () => {},
      ['readFully()Ljava/io/FileInputStream;']: (s) => { const o = mkSimple('Ljava/io/FileInputStream;'); o.$b = (H.vfs.get(baseName(s.$f ? s.$f.$p : '')) || []).slice(); o.$p = 0; return o; },
      ['delete()' + V]: (s) => { H.vfs.delete(baseName(s.$f ? s.$f.$p : '')); },
      ['exists()' + Z]: (s) => BOOL(H.vfs.has(baseName(s.$f ? s.$f.$p : ''))),
    },
  });
  R.def('Landroid/content/Context;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['openFileInput(Ljava/lang/String;)Ljava/io/FileInputStream;']: (s, n) => H.openFileInput(String(n)),
      ['openFileOutput(Ljava/lang/String;I)Ljava/io/FileOutputStream;']: (s, n) => H.openFileOutput(String(n)),
      ['deleteFile(Ljava/lang/String;)' + Z]: (s, n) => BOOL(H.vfs.delete(String(n))),
      ['fileList()[Ljava/lang/String;']: () => arr(R, '[Ljava/lang/String;', [...H.vfs.keys()]),
      ['getDir(Ljava/lang/String;I)Ljava/io/File;']: (s, n) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/app_' + n; return f; },
      ['getDatabasePath(Ljava/lang/String;)Ljava/io/File;']: (s, n) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/databases/' + n; return f; },
      ['getNoBackupFilesDir()Ljava/io/File;']: (s) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/no_backup'; return f; },
      ['getPackageCodePath()' + S]: () => '/base.apk', ['getPackageResourcePath()' + S]: () => '/base.apk',
      ['getMainExecutor()Ljava/util/concurrent/Executor;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['isRestricted()' + Z]: () => 0,
      ['getFilesDir()Ljava/io/File;']: (s) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/files'; return f; },
      ['getCacheDir()Ljava/io/File;']: (s) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/cache'; return f; },
      ['getCodeCacheDir()Ljava/io/File;']: (s) => { const f = mkSimple('Ljava/io/File;'); f.$p = '/data/data/' + H.packageName + '/code_cache'; return f; },
      ['getPackageInfo()Landroid/content/pm/PackageInfo;']: () => packageInfo(R, H),
      ['getApplicationInfo()Landroid/content/pm/ApplicationInfo;']: () => applicationInfo(R, H),
      ['getPackageManager()Landroid/content/pm/PackageManager;']: () => mkSimple('Landroid/content/pm/PackageManager;'),
      ['getUser()Landroid/os/UserHandle;']: () => mkSimple('Landroid/os/UserHandle;'),
      ['createConfigurationContext(Landroid/content/res/Configuration;)Landroid/content/Context;']: (s) => s,
      ['createPackageContext(Ljava/lang/String;I)Landroid/content/Context;']: (s) => s,
    },
  });
  R.def('Landroid/app/Activity;', {
    access: 0x21, sup: 'Landroid/content/Context;',
    m: {
      ['startActivityForResult(Landroid/content/Intent;I)' + V]: (s, i, rc) => H.startActivity(i, s, rc | 0),
      ['startActivityForResult(Landroid/content/Intent;ILandroid/os/Bundle;)' + V]: (s, i, rc) => H.startActivity(i, s, rc | 0),
      ['startActivity(Landroid/content/Intent;Landroid/os/Bundle;)' + V]: (s, i) => H.startActivity(i, s),
      ['startActivities([Landroid/content/Intent;)' + V]: (s, is) => { for (const i of is || []) H.startActivity(i, s); },
      ['setResult(I)' + V]: (s, c) => { s.$resultCode = c | 0; },
      ['setResult(ILandroid/content/Intent;)' + V]: (s, c, d) => { s.$resultCode = c | 0; s.$resultData = d; },
      ['getResultCode()' + I]: (s) => (s.$resultCode === undefined ? 0 : s.$resultCode),
      ['onBackPressed()' + V]: (s) => H.finish(s),
      ['isFinishing()' + Z]: (s) => BOOL(!!s.$finishing),
      ['getCallingActivity()Landroid/content/ComponentName;']: (s) => (s.$caller ? { $c: R.klass('Landroid/content/ComponentName;'), $p: H.packageName, $n: R.classNameOf(s.$caller) } : null),
      ['openFileInput(Ljava/lang/String;)Ljava/io/FileInputStream;']: (s, n) => H.openFileInput(String(n)),
      ['openFileOutput(Ljava/lang/String;I)Ljava/io/FileOutputStream;']: (s, n) => H.openFileOutput(String(n)),
      ['deleteFile(Ljava/lang/String;)' + Z]: (s, n) => BOOL(H.vfs.delete(String(n))),
      ['fileList()[Ljava/lang/String;']: () => arr(R, '[Ljava/lang/String;', [...H.vfs.keys()]),
      ['getMainExecutor()Ljava/util/concurrent/Executor;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'),
      ['isDestroyed()' + Z]: (s) => BOOL(s.$finished),
      ['getLocalClassName()' + S]: () => '',
      ['setEnterSharedElementCallback(Landroid/app/SharedElementCallback;)' + V]: () => {},
      ['overridePendingTransition(II)' + V]: () => {},
      ['onUserLeaveHint()' + V]: () => {},
      ['getPackageInfo()Landroid/content/pm/PackageInfo;']: () => packageInfo(R, H),
      ['reportFullyDrawn()' + V]: () => {},
      ['isTaskRoot()' + Z]: () => 1,
      ['getLoaderManager()Landroid/app/LoaderManager;']: () => mkSimple('Landroid/app/LoaderManager;'),
      ['getSupportFragmentManager()Landroidx/fragment/app/FragmentManager;']: () => mkSimple('Landroidx/fragment/app/FragmentManager;'),
      ['dismissKeyboardShortcutsHelper()' + V]: () => {},
      ['getApplicationInfo()Landroid/content/pm/ApplicationInfo;']: () => applicationInfo(R, H),
      ['getApplication()Landroid/app/Application;']: () => H.applicationContext(),
    },
  });
  R.def('Landroid/app/SharedElementCallback;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/LoaderManager;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/UserHandle;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['myUserId()' + I]: () => 0 } });
  R.def('Landroid/os/UserManager;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Process;', { access: 0x11, sup: 'Ljava/lang/Object;', sm: { ['myPid()' + I]: () => 1, ['myUid()' + I]: () => 1000, ['killProcess(I)' + V]: (p) => H.onExit(p), ['getElapsedCpuTime()' + J]: () => Date.now() } });
  R.def('Landroid/content/res/Configuration;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['orientation', 'I'], ['uiMode', 'I'], ['densityDpi', 'I'], ['fontScale', 'F'], ['screenWidthDp', 'I'], ['screenHeightDp', 'I'], ['locale', 'Ljava/util/Locale;']] });
  R.def('Landroid/content/res/Resources;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getConfiguration()Landroid/content/res/Configuration;']: () => { const c = mkSimple('Landroid/content/res/Configuration;'); const K = 'Landroid/content/res/Configuration;->'; c[K + 'orientation:I'] = 1; c[K + 'densityDpi:I'] = 160; c[K + 'fontScale:F'] = 1; c[K + 'screenWidthDp:I'] = H.screenWidth(); c[K + 'screenHeightDp:I'] = H.screenHeight(); return c; },
      ['updateConfiguration(Landroid/content/res/Configuration;Landroid/util/DisplayMetrics;)' + V]: () => {},
    },
  });
  R.def('Landroidx/core/content/FileProvider;', { access: 0x21, sup: 'Landroid/content/ContentProvider;', sm: { ['getUriForFile(Landroid/content/Context;Ljava/lang/String;Ljava/io/File;)Landroid/net/Uri;']: (c, auth, f) => ({ $c: R.klass('Landroid/net/Uri;'), $u: 'file://' + (f ? f.$p : '') }) } });
  R.def('Landroid/content/ContentProvider;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {} } });
  R.def('Landroidx/lifecycle/ProcessLifecycleOwner;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['get()Landroidx/lifecycle/LifecycleOwner;']: () => mkSimple('Landroidx/lifecycle/ProcessLifecycleOwner;') }, m: { ['getLifecycle()Landroidx/lifecycle/Lifecycle;']: () => mkSimple('Landroidx/lifecycle/Lifecycle;') } });
  R.def('Landroidx/lifecycle/LifecycleRegistry;', { access: 0x21, sup: 'Landroidx/lifecycle/Lifecycle;', m: { ['<init>(Landroidx/lifecycle/LifecycleOwner;)' + V]: () => {}, ['handleLifecycleEvent(Landroidx/lifecycle/Lifecycle$Event;)' + V]: () => {}, ['setCurrentState(Landroidx/lifecycle/Lifecycle$State;)' + V]: () => {}, ['getCurrentState()Landroidx/lifecycle/Lifecycle$State;']: () => mkSimple('Landroidx/lifecycle/Lifecycle$State;'), ['addObserver(Landroidx/lifecycle/LifecycleObserver;)' + V]: () => {}, ['removeObserver(Landroidx/lifecycle/LifecycleObserver;)' + V]: () => {} } });
  R.def('Landroidx/lifecycle/LifecycleObserver;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/lifecycle/Lifecycle$Event;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroidx/lifecycle/Lifecycle$State;', { access: 0x4011, sup: 'Ljava/lang/Enum;', m: { ['isAtLeast(Landroidx/lifecycle/Lifecycle$State;)' + Z]: () => 1 } });
  R.def('Landroidx/lifecycle/Lifecycle;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['addObserver(Landroidx/lifecycle/LifecycleObserver;)' + V]: () => {}, ['removeObserver(Landroidx/lifecycle/LifecycleObserver;)' + V]: () => {}, ['getCurrentState()Landroidx/lifecycle/Lifecycle$State;']: () => mkSimple('Landroidx/lifecycle/Lifecycle$State;') } });
  R.def('Landroidx/arch/core/executor/ArchTaskExecutor;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['isMainThread()' + Z]: () => 1, ['postToMainThread(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => safeRun(r)), ['executeOnDiskIO(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => safeRun(r)) }, sm: { ['getInstance()Landroidx/arch/core/executor/ArchTaskExecutor;']: () => mkSimple('Landroidx/arch/core/executor/ArchTaskExecutor;'), ['getMainThreadExecutor()Ljava/util/concurrent/Executor;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;'), ['getIOThreadExecutor()Ljava/util/concurrent/Executor;']: () => mkSimple('Ljava/util/concurrent/ThreadPoolExecutor;') } });
  R.def('Landroidx/arch/core/executor/TaskExecutor;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['isMainThread()' + Z]: () => 1 } });
  R.def('Landroidx/core/app/ActivityCompat;', { access: 0x21, sup: 'Landroidx/core/content/ContextCompat;', sm: { ['requestPermissions(Landroid/app/Activity;[Ljava/lang/String;I)' + V]: (a, p, c) => { H.log('I', 'Permissions', `requestPermissions(${(p || []).join(', ')}) → granted`); }, ['finishAfterTransition(Landroid/app/Activity;)' + V]: (a) => H.finish(a), ['startActivity(Landroid/content/Context;Landroid/content/Intent;Landroid/os/Bundle;)' + V]: (c, i) => H.startActivity(i) } });
  R.def('Landroidx/core/app/NotificationManagerCompat;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['notify(ILandroid/app/Notification;)' + V]: (s, id, n) => H.log('I', 'Notification', `#${id}`), ['cancel(I)' + V]: () => {}, ['areNotificationsEnabled()' + Z]: () => 1 }, sm: { ['from(Landroid/content/Context;)Landroidx/core/app/NotificationManagerCompat;']: () => mkSimple('Landroidx/core/app/NotificationManagerCompat;') } });
  R.def('Landroidx/core/app/NotificationChannelCompat;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/NotificationChannel;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/String;Ljava/lang/CharSequence;I)' + V]: (s, id, name, imp) => { s.$id = id; s.$name = R.str(name); }, ['setDescription(Ljava/lang/String;)' + V]: () => {} } });
  R.def('Landroid/app/NotificationManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['notify(ILandroid/app/Notification;)' + V]: (s, id, n) => H.log('I', 'Notification', `#${id} ${n && n.$title ? n.$title : ''}`), ['cancel(I)' + V]: () => {}, ['cancelAll()' + V]: () => {}, ['createNotificationChannel(Landroid/app/NotificationChannel;)' + V]: () => {}, ['createNotificationChannelGroup(Landroid/app/NotificationChannelGroup;)' + V]: () => {}, ['areNotificationsEnabled()' + Z]: () => 1 } });
  R.def('Landroid/app/NotificationChannelGroup;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/WorkManager;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['enqueue(Landroidx/work/WorkRequest;)Landroidx/work/Operation;']: (s, w) => { H.enqueueWork(w); return mkSimple('Landroidx/work/Operation;'); },
      ['cancelAll()' + V]: () => {}, ['cancelUniqueWork(Ljava/lang/String;)' + V]: () => {},
      ['getWorkInfosByTagLiveData(Ljava/lang/String;)Landroidx/lifecycle/LiveData;']: () => mkSimple('Landroidx/lifecycle/MutableLiveData;'),
      ['pruneWork()' + V]: () => {},
    },
    sm: { ['getInstance(Landroid/content/Context;)Landroidx/work/WorkManager;']: () => mkSimple('Landroidx/work/WorkManager;'), ['getInstance()Landroidx/work/WorkManager;']: () => mkSimple('Landroidx/work/WorkManager;') },
  });
  R.def('Landroidx/work/Operation;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/WorkRequest;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/OneTimeWorkRequest;', { access: 0x21, sup: 'Landroidx/work/WorkRequest;' });
  R.def('Landroidx/work/PeriodicWorkRequest;', { access: 0x21, sup: 'Landroidx/work/WorkRequest;' });
  R.def('Landroidx/work/OneTimeWorkRequest$Builder;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/lang/Class;)' + V]: (s, c) => { s.$workerCls = c && c['Ljava/lang/Class;->desc:Ljava/lang/String;']; },
      ['setInitialDelay(JLjava/util/concurrent/TimeUnit;)Landroidx/work/WorkRequest$Builder;']: (s, d, u) => { s.$delay = Number(d); return s; },
      ['setConstraints(Landroidx/work/Constraints;)Landroidx/work/WorkRequest$Builder;']: (s) => s,
      ['addTag(Ljava/lang/String;)Landroidx/work/WorkRequest$Builder;']: (s) => s,
      ['setBackoffCriteria(Landroidx/work/BackoffPolicy;JLjava/util/concurrent/TimeUnit;)Landroidx/work/WorkRequest$Builder;']: (s) => s,
      ['build()Landroidx/work/OneTimeWorkRequest;']: (s) => { const o = mkSimple('Landroidx/work/OneTimeWorkRequest;'); o.$workerCls = s.$workerCls; o.$delay = s.$delay || 0; return o; },
    },
  });
  R.def('Landroidx/work/PeriodicWorkRequest$Builder;', { access: 0x21, sup: 'Landroidx/work/OneTimeWorkRequest$Builder;' });
  R.def('Landroidx/work/Constraints;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/Constraints$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['setRequiredNetworkType(Landroidx/work/NetworkType;)Landroidx/work/Constraints$Builder;']: (s) => s, ['setRequiresCharging(Z)Landroidx/work/Constraints$Builder;']: (s) => s, ['build()Landroidx/work/Constraints;']: () => mkSimple('Landroidx/work/Constraints;') } });
  R.def('Landroidx/work/NetworkType;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroidx/work/BackoffPolicy;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroidx/work/Worker;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/content/Context;Landroidx/work/WorkerParameters;)' + V]: () => {}, ['onStopped()' + V]: () => {}, ['isStopped()' + Z]: () => 0, ['getApplicationContext()Landroid/content/Context;']: () => H.applicationContext() } });
  R.def('Landroidx/work/ListenableWorker;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/ListenableWorker$Result;', { access: 0x421, sup: 'Ljava/lang/Object;', sm: { ['success()Landroidx/work/ListenableWorker$Result;']: () => mkSimple('Landroidx/work/ListenableWorker$Result;'), ['failure()Landroidx/work/ListenableWorker$Result;']: () => mkSimple('Landroidx/work/ListenableWorker$Result;'), ['retry()Landroidx/work/ListenableWorker$Result;']: () => mkSimple('Landroidx/work/ListenableWorker$Result;') } });
  R.def('Landroidx/work/WorkerParameters;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/work/Data;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getString(Ljava/lang/String;)' + S]: (s, k) => (s.$m && s.$m[k]) || null, ['getInt(Ljava/lang/String;I)' + I]: (s, k, d) => (s.$m && s.$m[k]) || d }, sm: { ['EMPTY:Landroidx/work/Data;']: null } });
  R.def('Landroid/content/Intent;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/content/Context;Ljava/lang/Class;)' + V]: (s, ctx, cls) => { s.$cls = cls; s.$extras = new Map(); }, ['addFlags(I)Landroid/content/Intent;']: (s, f) => { s.$flags = (s.$flags || 0) | (f | 0); return s; }, ['setFlags(I)Landroid/content/Intent;']: (s, f) => { s.$flags = f | 0; return s; }, ['setClassName(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;']: (s, p, n) => { s.$clsName = String(n); return s; }, ['putExtra(Ljava/lang/String;Landroid/os/Parcelable;)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['putExtra(Ljava/lang/String;[Ljava/lang/String;)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['putExtra(Ljava/lang/String;F)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['putExtra(Ljava/lang/String;D)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['putExtra(Ljava/lang/String;J)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['putExtra(Ljava/lang/String;Landroid/os/Bundle;)Landroid/content/Intent;']: (s, k, v) => { s.$extras.set(k, v); return s; }, ['setPackage(Ljava/lang/String;)Landroid/content/Intent;']: (s, p) => { s.$pkg = p; return s; }, ['putExtras(Landroid/os/Bundle;)Landroid/content/Intent;']: (s, b) => { if (b && b.$m) for (const [k, v] of b.$m) s.$extras.set(k, v); return s; }, ['hasCategory(Ljava/lang/String;)' + Z]: () => 0, ['setClassName(Landroid/content/Context;Ljava/lang/String;)Landroid/content/Intent;']: (s, c, n) => { s.$clsName = String(n); return s; }, ['cloneFilter()Landroid/content/Intent;']: (s) => s }, sm: { ['createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;']: (i) => i, ['createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;Landroid/content/IntentSender;)Landroid/content/Intent;']: (i) => i } });
  const IC = 'Landroid/content/Intent;->';
  Object.assign(R.klass('Landroid/content/Intent;').statics, {
    [IC + 'ACTION_VIEW:Ljava/lang/String;']: 'android.intent.action.VIEW',
    [IC + 'ACTION_SEND:Ljava/lang/String;']: 'android.intent.action.SEND',
    [IC + 'ACTION_SENDTO:Ljava/lang/String;']: 'android.intent.action.SENDTO',
    [IC + 'ACTION_MAIN:Ljava/lang/String;']: 'android.intent.action.MAIN',
    [IC + 'ACTION_EDIT:Ljava/lang/String;']: 'android.intent.action.EDIT',
    [IC + 'ACTION_DIAL:Ljava/lang/String;']: 'android.intent.action.DIAL',
    [IC + 'ACTION_CALL:Ljava/lang/String;']: 'android.intent.action.CALL',
    [IC + 'ACTION_GET_CONTENT:Ljava/lang/String;']: 'android.intent.action.GET_CONTENT',
    [IC + 'ACTION_PICK:Ljava/lang/String;']: 'android.intent.action.PICK',
    [IC + 'ACTION_OPEN_DOCUMENT:Ljava/lang/String;']: 'android.intent.action.OPEN_DOCUMENT',
    [IC + 'ACTION_SETTINGS:Ljava/lang/String;']: 'android.settings.SETTINGS',
    [IC + 'ACTION_APPLICATION_DETAILS_SETTINGS:Ljava/lang/String;']: 'android.settings.APPLICATION_DETAILS_SETTINGS',
    [IC + 'ACTION_BATTERY_CHANGED:Ljava/lang/String;']: 'android.intent.action.BATTERY_CHANGED',
    [IC + 'ACTION_BOOT_COMPLETED:Ljava/lang/String;']: 'android.intent.action.BOOT_COMPLETED',
    [IC + 'ACTION_POWER_CONNECTED:Ljava/lang/String;']: 'android.intent.action.ACTION_POWER_CONNECTED',
    [IC + 'ACTION_POWER_DISCONNECTED:Ljava/lang/String;']: 'android.intent.action.ACTION_POWER_DISCONNECTED',
    [IC + 'ACTION_SCREEN_ON:Ljava/lang/String;']: 'android.intent.action.SCREEN_ON',
    [IC + 'ACTION_SCREEN_OFF:Ljava/lang/String;']: 'android.intent.action.SCREEN_OFF',
    [IC + 'FLAG_ACTIVITY_NEW_TASK:I']: 0x10000000,
    [IC + 'FLAG_ACTIVITY_CLEAR_TOP:I']: 0x04000000,
    [IC + 'FLAG_ACTIVITY_SINGLE_TOP:I']: 0x20000000,
    [IC + 'FLAG_ACTIVITY_CLEAR_TASK:I']: 0x00008000,
    [IC + 'FLAG_ACTIVITY_BROUGHT_TO_FRONT:I']: 0x00400000,
    [IC + 'FLAG_GRANT_READ_URI_PERMISSION:I']: 1,
    [IC + 'FLAG_GRANT_WRITE_URI_PERMISSION:I']: 2,
    [IC + 'EXTRA_TEXT:Ljava/lang/String;']: 'android.intent.extra.TEXT',
    [IC + 'EXTRA_SUBJECT:Ljava/lang/String;']: 'android.intent.extra.SUBJECT',
    [IC + 'EXTRA_TITLE:Ljava/lang/String;']: 'android.intent.extra.TITLE',
    [IC + 'EXTRA_EMAIL:[Ljava/lang/String;']: 'android.intent.extra.EMAIL',
    [IC + 'EXTRA_STREAM:Landroid/net/Uri;']: 'android.intent.extra.STREAM',
    [IC + 'CATEGORY_LAUNCHER:Ljava/lang/String;']: 'android.intent.category.LAUNCHER',
    [IC + 'CATEGORY_DEFAULT:Ljava/lang/String;']: 'android.intent.category.DEFAULT',
  });
  R.def('Landroid/os/Parcelable;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Parcel;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/FrameLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: { ['setMeasureAllChildren(Z)' + V]: () => {} } });
  R.def('Landroid/provider/Settings$Global;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['getInt(Landroid/content/ContentResolver;Ljava/lang/String;I)' + I]: (r, k, d) => d, ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: () => null } });
  R.def('Landroid/provider/MediaStore;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/hardware/display/DisplayManager;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Lorg/json/JSONObject;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$o = {}; },
      ['<init>(Ljava/lang/String;)' + V]: (s, t) => { try { s.$o = JSON.parse(String(t)); } catch { s.$o = {}; throw R.newException('Lorg/json/JSONException;', 'parse error'); } },
      ['<init>(Ljava/util/Map;)' + V]: (s, m) => { s.$o = {}; if (m && m.$m) for (const [, e] of m.$m) s.$o[e.k] = jsonOut(e.v); },
      ['put(Ljava/lang/String;' + O + ')Lorg/json/JSONObject;']: (s, k, v) => { s.$o[k] = jsonOut(v); return s; },
      ['put(Ljava/lang/String;I)Lorg/json/JSONObject;']: (s, k, v) => { s.$o[k] = v | 0; return s; },
      ['put(Ljava/lang/String;J)Lorg/json/JSONObject;']: (s, k, v) => { s.$o[k] = Number(v); return s; },
      ['put(Ljava/lang/String;D)Lorg/json/JSONObject;']: (s, k, v) => { s.$o[k] = Number(v); return s; },
      ['put(Ljava/lang/String;Z)Lorg/json/JSONObject;']: (s, k, v) => { s.$o[k] = !!v; return s; },
      ['get(Ljava/lang/String;)' + O]: (s, k) => jsonIn(R, s.$o[k]),
      ['getString(Ljava/lang/String;)' + S]: (s, k) => { if (!(k in s.$o)) throw R.newException('Lorg/json/JSONException;', k); return String(s.$o[k]); },
      ['optString(Ljava/lang/String;)' + S]: (s, k) => (k in s.$o ? String(s.$o[k]) : ''),
      ['optString(Ljava/lang/String;' + S + ')' + S]: (s, k, d) => (k in s.$o ? String(s.$o[k]) : d),
      ['getInt(Ljava/lang/String;)' + I]: (s, k) => { if (!(k in s.$o)) throw R.newException('Lorg/json/JSONException;', k); return parseInt(s.$o[k], 10) | 0; },
      ['optInt(Ljava/lang/String;)' + I]: (s, k) => (k in s.$o ? (parseInt(s.$o[k], 10) | 0) : 0),
      ['optInt(Ljava/lang/String;' + I + ')' + I]: (s, k, d) => (k in s.$o ? (parseInt(s.$o[k], 10) | 0) : d),
      ['getLong(Ljava/lang/String;)' + J]: (s, k) => Number(s.$o[k] || 0),
      ['optLong(Ljava/lang/String;)' + J]: (s, k) => Number(s.$o[k] || 0),
      ['getDouble(Ljava/lang/String;)' + D]: (s, k) => Number(s.$o[k] || 0),
      ['optDouble(Ljava/lang/String;)' + D]: (s, k) => Number(s.$o[k] || 0),
      ['getBoolean(Ljava/lang/String;)' + Z]: (s, k) => BOOL(!!s.$o[k]),
      ['optBoolean(Ljava/lang/String;)' + Z]: (s, k) => BOOL(!!s.$o[k]),
      ['getJSONObject(Ljava/lang/String;)Lorg/json/JSONObject;']: (s, k) => jsonIn(R, s.$o[k]),
      ['optJSONObject(Ljava/lang/String;)Lorg/json/JSONObject;']: (s, k) => (s.$o[k] && typeof s.$o[k] === 'object' && !Array.isArray(s.$o[k]) ? jsonIn(R, s.$o[k]) : null),
      ['getJSONArray(Ljava/lang/String;)Lorg/json/JSONArray;']: (s, k) => jsonIn(R, s.$o[k]),
      ['optJSONArray(Ljava/lang/String;)Lorg/json/JSONArray;']: (s, k) => (Array.isArray(s.$o[k]) ? jsonIn(R, s.$o[k]) : null),
      ['has(Ljava/lang/String;)' + Z]: (s, k) => BOOL(k in s.$o),
      ['remove(Ljava/lang/String;)' + O]: (s, k) => { const o = s.$o[k]; delete s.$o[k]; return jsonIn(R, o); },
      ['length()' + I]: (s) => Object.keys(s.$o).length,
      ['keys()Ljava/util/Iterator;']: (s) => ({ $c: R.klass('Ljava/util/Iterator;'), $list: Object.keys(s.$o), $i: 0 }),
      ['names()Lorg/json/JSONArray;']: (s) => jsonIn(R, Object.keys(s.$o)),
      ['toString()' + S]: (s) => JSON.stringify(s.$o),
      ['toString(I)' + S]: (s) => JSON.stringify(s.$o, null, 2),
      ['names()Ljava/util/Iterator;']: (s) => ({ $c: R.klass('Ljava/util/Iterator;'), $list: Object.keys(s.$o), $i: 0 }),
    },
  });
  R.def('Lorg/json/JSONArray;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$a = []; },
      ['<init>(Ljava/lang/String;)' + V]: (s, t) => { try { s.$a = JSON.parse(String(t)); } catch { s.$a = []; } },
      ['put(' + O + ')Lorg/json/JSONArray;']: (s, v) => { s.$a.push(jsonOut(v)); return s; },
      ['put(I)Lorg/json/JSONArray;']: (s, v) => { s.$a.push(v | 0); return s; },
      ['put(D)Lorg/json/JSONArray;']: (s, v) => { s.$a.push(Number(v)); return s; },
      ['get(I)' + O]: (s, i) => jsonIn(R, s.$a[i]),
      ['getString(I)' + S]: (s, i) => String(s.$a[i]),
      ['optString(I)' + S]: (s, i) => (i < s.$a.length ? String(s.$a[i]) : ''),
      ['getInt(I)' + I]: (s, i) => parseInt(s.$a[i], 10) | 0,
      ['optInt(I)' + I]: (s, i) => (i < s.$a.length ? (parseInt(s.$a[i], 10) | 0) : 0),
      ['getJSONObject(I)Lorg/json/JSONObject;']: (s, i) => jsonIn(R, s.$a[i]),
      ['optJSONObject(I)Lorg/json/JSONObject;']: (s, i) => (s.$a[i] && typeof s.$a[i] === 'object' ? jsonIn(R, s.$a[i]) : null),
      ['getJSONArray(I)Lorg/json/JSONArray;']: (s, i) => jsonIn(R, s.$a[i]),
      ['length()' + I]: (s) => s.$a.length,
      ['remove(I)' + O]: (s, i) => jsonIn(R, s.$a.splice(i, 1)[0]),
      ['toString()' + S]: (s) => JSON.stringify(s.$a),
      ['toString(I)' + S]: (s) => JSON.stringify(s.$a, null, 2),
    },
  });
  R.def('Lorg/json/JSONException;', { access: 0x21, sup: 'Ljava/lang/Exception;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; } } });
  R.def('Lorg/json/JSONTokener;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  function jsonOut(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && v.$o !== undefined) return v.$o;
    if (typeof v === 'object' && v.$a !== undefined) return v.$a;
    if (typeof v === 'object' && v.$v !== undefined) return v.$v;
    if (typeof v === 'object' && v.$c) { const s = R.str(v); return s; }
    return v;
  }
  function jsonIn(R, v) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) { const o = mkSimple('Lorg/json/JSONArray;'); o.$a = v; return o; }
    if (typeof v === 'object') { const o = mkSimple('Lorg/json/JSONObject;'); o.$o = v; return o; }
    if (typeof v === 'number') return R.box(Number.isInteger(v) ? 'Ljava/lang/Integer;' : 'Ljava/lang/Double;', v);
    if (typeof v === 'boolean') return R.box('Ljava/lang/Boolean;', v ? 1 : 0);
    return String(v);
  }

  /* ---- networking: real fetch(), bridged to Java-style callbacks ---- */
  R.def('Ljava/net/URL;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/lang/String;)' + V]: (s, u) => { s.$u = String(u); },
      ['<init>(Ljava/net/URL;Ljava/lang/String;)' + V]: (s, base, rel) => { try { s.$u = new URL(String(rel), base ? base.$u : undefined).href; } catch { s.$u = String(rel); } },
      ['openConnection()Ljava/net/URLConnection;']: (s) => { const c = mkSimple('Ljava/net/HttpURLConnection;'); c.$u = s.$u; c.$headers = {}; c.$method = 'GET'; return c; },
      ['openStream()Ljava/io/InputStream;']: (s) => { H.log('W', 'URL', 'openStream() is synchronous in Java but not in the browser — returning an empty stream'); const o = mkSimple('Ljava/io/ByteArrayInputStream;'); o.$b = []; o.$p = 0; return o; },
      ['toString()' + S]: (s) => s.$u,
      ['getHost()' + S]: (s) => { try { return new URL(s.$u).hostname; } catch { return null; } },
      ['getPath()' + S]: (s) => { try { return new URL(s.$u).pathname; } catch { return null; } },
      ['getProtocol()' + S]: (s) => { try { return new URL(s.$u).protocol.replace(':', ''); } catch { return null; } },
      ['toURI()Ljava/net/URI;']: (s) => ({ $c: R.klass('Ljava/net/URI;'), $u: s.$u }),
      ['toExternalForm()' + S]: (s) => s.$u,
    },
  });
  R.def('Ljava/net/URLConnection;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setRequestProperty(Ljava/lang/String;Ljava/lang/String;)' + V]: (s, k, v) => { s.$headers = s.$headers || {}; s.$headers[k] = v; }, ['setConnectTimeout(I)' + V]: () => {}, ['setReadTimeout(I)' + V]: () => {}, ['connect()' + V]: () => {}, ['getInputStream()Ljava/io/InputStream;']: () => { const o = mkSimple('Ljava/io/ByteArrayInputStream;'); o.$b = []; o.$p = 0; return o; }, ['getContentType()' + S]: () => null } });
  R.def('Ljava/net/HttpURLConnection;', {
    access: 0x21, sup: 'Ljava/net/URLConnection;',
    m: {
      ['setRequestMethod(Ljava/lang/String;)' + V]: (s, m) => { s.$method = String(m); },
      ['getResponseCode()' + I]: (s) => (s.$code === undefined ? 0 : s.$code),
      ['getResponseMessage()' + S]: (s) => s.$msg || null,
      ['getInputStream()Ljava/io/InputStream;']: (s) => { const o = mkSimple('Ljava/io/ByteArrayInputStream;'); o.$b = (s.$body || []).slice(); o.$p = 0; return o; },
      ['getErrorStream()Ljava/io/InputStream;']: (s) => { const o = mkSimple('Ljava/io/ByteArrayInputStream;'); o.$b = (s.$body || []).slice(); o.$p = 0; return o; },
      ['disconnect()' + V]: () => {},
      ['setDoOutput(Z)' + V]: (s, b) => { s.$doOut = !!b; },
      ['setDoInput(Z)' + V]: () => {},
      ['getOutputStream()Ljava/io/OutputStream;']: (s) => { const o = mkSimple('Ljava/io/ByteArrayOutputStream;'); o.$b = []; o.$sink = s; return o; },
      ['setInstanceFollowRedirects(Z)' + V]: () => {},
      ['setUseCaches(Z)' + V]: () => {},
    },
  });
  R.def('Ljava/net/SocketTimeoutException;', { access: 0x21, sup: 'Ljava/io/IOException;' });
  R.def('Ljava/net/MalformedURLException;', { access: 0x21, sup: 'Ljava/io/IOException;' });
  R.def('Ljava/net/UnknownHostException;', { access: 0x21, sup: 'Ljava/io/IOException;' });
  R.def('Ljava/security/MessageDigest;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['update([B)' + V]: (s, b) => { s.$buf = (s.$buf || []).concat(Array.from(b || [])); },
      ['update([BII)' + V]: (s, b, o, l) => { for (let i = 0; i < l; i++) (s.$buf = s.$buf || []).push(b[o + i]); },
      ['digest()[B']: (s) => digestBytes(R, s.$algo, s.$buf || []),
      ['digest([B)[B']: (s, b) => digestBytes(R, s.$algo, Array.from(b || [])),
      ['reset()' + V]: (s) => { s.$buf = []; },
    },
    sm: {
      ['getInstance(Ljava/lang/String;)Ljava/security/MessageDigest;']: (a) => { const o = mkSimple('Ljava/security/MessageDigest;'); o.$algo = String(a).toUpperCase(); o.$buf = []; return o; },
    },
  });
  function digestBytes(R, algo, bytes) {
    // SHA via SubtleCrypto is async; MD5/SHA-1 of small inputs are handled with
    // a compact synchronous implementation so callers keep Java's blocking API.
    const out = algo === 'MD5' ? md5(bytes) : algo === 'SHA-1' ? sha1(bytes) : algo === 'SHA-256' ? sha256(bytes) : md5(bytes);
    out[ARR_CLASS] = R.klass('[B');
    return out;
  }
  R.def('Ljava/security/SecureRandom;', { access: 0x31, sup: 'Ljava/util/Random;' });
  R.def('Ljava/security/NoSuchAlgorithmException;', { access: 0x21, sup: 'Ljava/lang/Exception;' });
  R.def('Ljava/util/Locale;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['toLanguageTag()' + S]: (s) => (s.$lang || 'en') + (s.$country ? '-' + s.$country : ''), ['getDisplayName()' + S]: (s) => s.$lang || 'English', ['getDisplayLanguage()' + S]: (s) => s.$lang || 'English', ['getDisplayCountry()' + S]: (s) => s.$country || '' } });
  R.def('Landroid/os/LocaleList;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['get(I)Ljava/util/Locale;']: (s, i) => (s.$l && s.$l[i | 0]) || defaultLocale(R),
      ['size()' + I]: (s) => (s.$l ? s.$l.length : 1),
      ['isEmpty()' + Z]: () => 0,
      ['getFirstMatch([Ljava/lang/String;)Ljava/util/Locale;']: () => defaultLocale(R),
      ['toLanguageTags()' + S]: () => (typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
      ['indexOf(Ljava/util/Locale;)' + I]: () => 0,
      ['toString()' + S]: () => '[en-US]',
    },
    sm: {
      ['getEmptyLocaleList()Landroid/os/LocaleList;']: () => localeList(R, []),
      ['getAdjustedDefault()Landroid/os/LocaleList;']: () => localeList(R, [defaultLocale(R)]),
      ['wrap(Ljava/util/Locale;)Landroid/os/LocaleList;']: (l) => localeList(R, [l]),
      ['createFromStringWithNormalizer(Ljava/lang/String;)Landroid/os/LocaleList;']: (s) => localeList(R, [defaultLocale(R)]),
    },
  });
  function defaultLocale(R) {
    const c = R.klass('Ljava/util/Locale;'); R.initClass(c);
    const o = R.newInstanceObj(c);
    const tag = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    o.$lang = tag.slice(0, 2); o.$country = tag.slice(3, 5).toUpperCase();
    return o;
  }
  function localeList(R, list) { const o = mkSimple('Landroid/os/LocaleList;'); o.$l = list.length ? list : [defaultLocale(R)]; return o; }
  R.def('Landroid/content/res/Configuration;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getLocales()Landroid/os/LocaleList;']: () => localeList(R, [defaultLocale(R)]),
      ['setLocales(Landroid/os/LocaleList;)' + V]: () => {},
      ['setToDefaults()' + V]: () => {},
      ['updateFrom(Landroid/content/res/Configuration;)' + I]: () => 0,
      ['toString()' + S]: () => 'Configuration{dex2web}',
    },
  });
  R.def('Landroid/content/res/Configuration;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    fields: [['locale', 'Ljava/util/Locale;'], ['orientation', 'I'], ['uiMode', 'I'], ['densityDpi', 'I'], ['fontScale', 'F'], ['screenWidthDp', 'I'], ['screenHeightDp', 'I'], ['smallestScreenWidthDp', 'I'], ['screenLayout', 'I'], ['keyboardHidden', 'I'], ['navigationHidden', 'I'], ['touchscreen', 'I'], ['keyboard', 'I'], ['hardKeyboardHidden', 'I'], ['navigation', 'I'], ['screenWidthPx', 'I'], ['screenHeightPx', 'I'], ['density', 'F'], ['scaledDensity', 'F'], ['weight', 'I'], ['heightDp', 'I'], ['widthDp', 'I']],
    hooks: {
      // A bare `new Configuration()` must still carry sane display metrics:
      // Compose validates fontScale and refuses 0.
      create: (R, c) => {
        const o = R.newInstanceObj(c);
        const K = 'Landroid/content/res/Configuration;->';
        o[K + 'fontScale:F'] = 1; o[K + 'density:F'] = 1; o[K + 'scaledDensity:F'] = 1;
        o[K + 'densityDpi:I'] = 160; o[K + 'orientation:I'] = 1;
        o[K + 'screenWidthDp:I'] = H.screenWidth(); o[K + 'screenHeightDp:I'] = H.screenHeight();
        o[K + 'screenWidthPx:I'] = H.screenWidth(); o[K + 'screenHeightPx:I'] = H.screenHeight();
        o[K + 'smallestScreenWidthDp:I'] = Math.min(H.screenWidth(), H.screenHeight());
        o[K + 'locale:Ljava/util/Locale;'] = defaultLocale(R);
        return o;
      },
    },
    m: {
      ['<init>()' + V]: () => {},
      ['<init>(Landroid/content/res/Configuration;)' + V]: (s, o) => { if (o) for (const k in o) if (k.startsWith('Landroid/content/res/Configuration;->')) s[k] = o[k]; },
      ['setTo(Landroid/content/res/Configuration;)' + V]: (s, o) => { if (o) for (const k in o) if (k.startsWith('Landroid/content/res/Configuration;->')) s[k] = o[k]; },
      ['setToDefaults()' + V]: (s) => { const K = 'Landroid/content/res/Configuration;->'; s[K + 'fontScale:F'] = 1; s[K + 'density:F'] = 1; s[K + 'densityDpi:I'] = 160; },
      ['updateFrom(Landroid/content/res/Configuration;)' + I]: () => 0,
      ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && s['Landroid/content/res/Configuration;->fontScale:F'] === o['Landroid/content/res/Configuration;->fontScale:F']),
      ['toString()' + S]: () => 'Configuration{dex2web}',
    },
  });
  R.def('Landroid/util/AtomicFile;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['openRead()Ljava/io/FileInputStream;']: (s) => { const o = mkSimple('Ljava/io/FileInputStream;'); o.$b = (H.vfs.get(baseName(s.$f ? s.$f.$p : '')) || []).slice(); o.$p = 0; return o; }, ['openWrite()Ljava/io/FileOutputStream;']: (s) => { const o = mkSimple('Ljava/io/FileOutputStream;'); o.$b = []; o.$name = baseName(s.$f ? s.$f.$p : ''); return o; } } });
  R.def('Landroid/content/ComponentName;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/content/Context;Ljava/lang/Class;)' + V]: (s, ctx, cls) => { s.$p = ctx ? R.iv('Landroid/content/Context;->getPackageName()Ljava/lang/String;', ctx) : H.packageName; s.$n = cls && cls['Ljava/lang/Class;->desc:Ljava/lang/String;'] ? cls['Ljava/lang/Class;->desc:Ljava/lang/String;'].slice(1, -1).replace(/\//g, '.') : ''; }, ['<init>(Landroid/content/Context;Ljava/lang/String;)' + V]: (s, ctx, n) => { s.$p = H.packageName; s.$n = String(n); }, ['flattenToString()' + S]: (s) => s.$p + '/' + s.$n, ['getShortClassName()' + S]: (s) => '.' + String(s.$n || '').split('.').pop(), ['equals(' + O + ')' + Z]: (s, o) => BOOL(o && o.$p === s.$p && o.$n === s.$n) } });
  R.def('Landroid/appwidget/AppWidgetManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getAppWidgetIds(Landroid/content/ComponentName;)[I']: () => { const a = []; a[ARR_CLASS] = R.klass('[I'); return a; }, ['updateAppWidget([ILandroid/widget/RemoteViews;)' + V]: () => {}, ['notifyAppWidgetViewDataChanged([II)' + V]: () => {}, ['getInstalledProviders()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }) }, sm: { ['getInstance(Landroid/content/Context;)Landroid/appwidget/AppWidgetManager;']: () => mkSimple('Landroid/appwidget/AppWidgetManager;'), ['ACTION_APPWIDGET_UPDATE:Ljava/lang/String;']: 'android.appwidget.action.APPWIDGET_UPDATE' } });
  R.def('Landroid/app/AlarmManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['set(IJLandroid/app/PendingIntent;)' + V]: () => {}, ['setExact(IJLandroid/app/PendingIntent;)' + V]: () => {}, ['setExactAndAllowWhileIdle(IJLandroid/app/PendingIntent;)' + V]: () => {}, ['setRepeating(IJJLandroid/app/PendingIntent;)' + V]: () => {}, ['cancel(Landroid/app/PendingIntent;)' + V]: () => {}, ['setCanScheduleExactAlarms(Z)' + V]: () => {}, ['canScheduleExactAlarms()' + Z]: () => 1 } });
  R.def('Landroid/app/JobScheduler;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['schedule(Landroid/app/job/JobInfo;)' + I]: () => 1, ['cancel(I)' + V]: () => {}, ['cancelAll()' + V]: () => {} } });
  R.def('Landroid/app/job/JobInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/job/JobInfo$Builder;', { access: 0x29, sup: 'Ljava/lang/Object;', m: { ['<init>(ILandroid/content/ComponentName;)' + V]: () => {}, ['setRequiredNetworkType(I)Landroid/app/job/JobInfo$Builder;']: (s) => s, ['setMinimumLatency(J)Landroid/app/job/JobInfo$Builder;']: (s) => s, ['setPersisted(Z)Landroid/app/job/JobInfo$Builder;']: (s) => s, ['build()Landroid/app/job/JobInfo;']: () => mkSimple('Landroid/app/job/JobInfo;') } });
  R.def('Landroid/app/job/JobService;', { access: 0x421, sup: 'Landroid/app/Service;' });
  R.def('Landroid/service/quicksettings/TileService;', { access: 0x21, sup: 'Landroid/service/quicksettings/TileServiceBase;' });
  R.def('Landroid/service/quicksettings/TileServiceBase;', { access: 0x421, sup: 'Landroid/app/Service;' });
  R.def('Landroid/service/quicksettings/Tile;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setLabel(Ljava/lang/CharSequence;)' + V]: () => {}, ['setState(I)' + V]: () => {}, ['updateTile()' + V]: () => {} } });
  R.def('Landroid/graphics/drawable/Icon;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { ['createWithResource(Landroid/content/Context;I)Landroid/graphics/drawable/Icon;']: () => mkSimple('Landroid/graphics/drawable/Icon;'), ['createWithBitmap(Landroid/graphics/Bitmap;)Landroid/graphics/drawable/Icon;']: () => mkSimple('Landroid/graphics/drawable/Icon;') } });
  /* ---- more java.util collections ---- */
  R.def('Ljava/util/WeakHashMap;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;'], m: mapShim(R) });
  R.def('Ljava/util/IdentityHashMap;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;'], m: mapShim(R) });
  R.def('Ljava/util/EnumMap;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;'], m: Object.assign(mapShim(R), { ['<init>(Ljava/lang/Class;)' + V]: (s) => { s.$m = new Map(); } }) });
  R.def('Ljava/util/EnumSet;', { access: 0x31, sup: 'Ljava/util/AbstractSet;', sm: { ['noneOf(Ljava/lang/Class;)Ljava/util/EnumSet;']: () => ({ $c: R.klass('Ljava/util/EnumSet;'), $a: [] }), ['allOf(Ljava/lang/Class;)Ljava/util/EnumSet;']: () => ({ $c: R.klass('Ljava/util/EnumSet;'), $a: [] }), ['of(Ljava/lang/Enum;[Ljava/lang/Enum;)Ljava/util/EnumSet;']: (e, rest) => { const a = [e].concat(rest || []); return { $c: R.klass('Ljava/util/EnumSet;'), $a: a }; }, ['copyOf(Ljava/util/Collection;)Ljava/util/EnumSet;']: (c) => ({ $c: R.klass('Ljava/util/EnumSet;'), $a: ((c && c.$a) || []).slice() }) }, m: setShim(R) });
  R.def('Ljava/util/concurrent/CopyOnWriteArraySet;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Set;'], m: setShim(R) });
  R.def('Ljava/util/concurrent/CopyOnWriteArrayList;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/List;'], m: listShim(R) });
  R.def('Ljava/util/ArrayDeque;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Deque;'], m: Object.assign(listShim(R), { ['push(' + O + ')' + V]: (s, o) => { s.$a.unshift(o); }, ['pop()' + O]: (s) => s.$a.shift(), ['peek()' + O]: (s) => (s.$a.length ? s.$a[0] : null), ['offer(' + O + ')' + Z]: (s, o) => { s.$a.push(o); return 1; }, ['poll()' + O]: (s) => (s.$a.length ? s.$a.shift() : null), ['offerFirst(' + O + ')' + Z]: (s, o) => { s.$a.unshift(o); return 1; }, ['offerLast(' + O + ')' + Z]: (s, o) => { s.$a.push(o); return 1; }, ['peekFirst()' + O]: (s) => (s.$a[0] === undefined ? null : s.$a[0]), ['peekLast()' + O]: (s) => (s.$a.length ? s.$a[s.$a.length - 1] : null), ['pollFirst()' + O]: (s) => (s.$a.length ? s.$a.shift() : null), ['pollLast()' + O]: (s) => (s.$a.length ? s.$a.pop() : null), ['getFirst()' + O]: (s) => s.$a[0], ['getLast()' + O]: (s) => s.$a[s.$a.length - 1], ['descendingIterator()Ljava/util/Iterator;']: (s) => makeIter(R, s.$a.slice().reverse()) }) });
  R.def('Ljava/util/Deque;', { access: 0x601, sup: 'Ljava/util/Queue;' });
  R.def('Ljava/util/Queue;', { access: 0x601, sup: 'Ljava/util/Collection;' });
  R.def('Ljava/util/PriorityQueue;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Queue;'], m: Object.assign(listShim(R), { ['<init>(ILjava/util/Comparator;)' + V]: (s, n, c) => { s.$a = []; s.$cmp = c; }, ['offer(' + O + ')' + Z]: (s, o) => { s.$a.push(o); sortPq(s, R); return 1; }, ['poll()' + O]: (s) => (s.$a.length ? s.$a.shift() : null), ['peek()' + O]: (s) => (s.$a.length ? s.$a[0] : null), ['add(' + O + ')' + Z]: (s, o) => { s.$a.push(o); sortPq(s, R); return 1; }, ['remove()' + O]: (s) => { if (!s.$a.length) throw R.newException('Ljava/util/NoSuchElementException;', 'empty'); return s.$a.shift(); }, ['element()' + O]: (s) => s.$a[0] }) });
  function sortPq(s, R) { s.$a.sort(s.$cmp ? (a, b) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', s.$cmp, a, b) : (a, b) => compareValsLocal(a, b)); }
  function compareValsLocal(a, b) { if (typeof a === 'number' && typeof b === 'number') return a - b; if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0; return 0; }
  R.def('Ljava/util/Stack;', { access: 0x21, sup: 'Ljava/util/ArrayList;' });
  R.def('Ljava/util/SortedMap;', { access: 0x601, sup: 'Ljava/util/Map;' });
  R.def('Ljava/util/NavigableMap;', { access: 0x601, sup: 'Ljava/util/SortedMap;' });
  R.def('Ljava/util/SortedSet;', { access: 0x601, sup: 'Ljava/util/Set;' });
  R.def('Ljava/util/NavigableSet;', { access: 0x601, sup: 'Ljava/util/SortedSet;' });
  R.def('Ljava/util/Dictionary;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/BitSet;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$b = new Set(); }, ['<init>(I)' + V]: (s) => { s.$b = new Set(); }, ['set(I)' + V]: (s, i) => s.$b.add(i | 0), ['set(IZ)' + V]: (s, i, v) => { v ? s.$b.add(i | 0) : s.$b.delete(i | 0); }, ['clear(I)' + V]: (s, i) => s.$b.delete(i | 0), ['get(I)' + Z]: (s, i) => BOOL(s.$b.has(i | 0)), ['length()' + I]: (s) => (s.$b.size ? Math.max(...s.$b) + 1 : 0), ['cardinality()' + I]: (s) => s.$b.size, ['clear()' + V]: (s) => s.$b.clear() } });
  R.def('Ljava/util/StringTokenizer;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Ljava/lang/String;)' + V]: (s, t) => { s.$tok = String(t).split(/\s+/).filter(Boolean); s.$i = 0; }, ['<init>(Ljava/lang/String;Ljava/lang/String;)' + V]: (s, t, d) => { s.$tok = String(t).split(new RegExp('[' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']')).filter(Boolean); s.$i = 0; }, ['hasMoreTokens()' + Z]: (s) => BOOL(s.$i < s.$tok.length), ['nextToken()' + S]: (s) => s.$tok[s.$i++], ['countTokens()' + I]: (s) => (s.$tok.length - s.$i) } });
  R.def('Ljava/util/Properties;', { access: 0x21, sup: 'Ljava/util/Hashtable;', m: { ['getProperty(Ljava/lang/String;)' + S]: (s, k) => (s.$m && s.$m.has('s:' + k) ? s.$m.get('s:' + k).v : null), ['getProperty(Ljava/lang/String;Ljava/lang/String;)' + S]: (s, k, d) => (s.$m && s.$m.has('s:' + k) ? s.$m.get('s:' + k).v : d), ['setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;']: (s, k, v) => { s.$m = s.$m || new Map(); s.$m.set('s:' + k, { k, v }); return v; } } });
  R.def('Ljava/util/Hashtable;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/util/Map;'], m: mapShim(R) });
  R.def('Ljava/util/ResourceBundle;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/MissingResourceException;', { access: 0x21, sup: 'Ljava/lang/RuntimeException;' });
  R.def('Ljava/util/Comparator;', { access: 0x601, sup: 'Ljava/lang/Object;', sm: { ['naturalOrder()Ljava/util/Comparator;']: () => ({ $c: R.klass('Ljava/util/Comparator;'), $nat: 1 }), ['reverseOrder()Ljava/util/Comparator;']: () => ({ $c: R.klass('Ljava/util/Comparator;'), $rev: 1 }) }, m: { ['reversed()Ljava/util/Comparator;']: (s) => ({ $c: R.klass('Ljava/util/Comparator;'), $rev: 1, $base: s }), ['thenComparing(Ljava/util/Comparator;)Ljava/util/Comparator;']: (s) => s } });

  /* ---- typed-value / theme attribute resolution ---- */
  R.def('Landroid/util/TypedValue;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    fields: [['type', 'I'], ['data', 'I'], ['resourceId', 'I'], ['density', 'I'], ['string', 'Ljava/lang/CharSequence;'], ['assetCookie', 'I'], ['changingConfigurations', 'I']],
    m: {
      ['<init>()' + V]: () => {},
      ['getFloat()' + F]: (s) => Math.fround(tvData(s)),
      ['getDimension()' + F]: (s) => Math.fround(tvDim(s)),
      ['getComplexUnit()' + I]: (s) => (tvData(s) | 0) & 0xf,
      ['coerceToString()Ljava/lang/CharSequence;']: (s) => String(tvData(s)),
    },
    sm: {
      ['applyDimension(IF Landroid/util/DisplayMetrics;)' + F]: (u, v) => Math.fround(v),
      ['complexToDimension(IF Landroid/util/DisplayMetrics;)' + F]: (s, d) => Math.fround(tvDimRaw(s | 0)),
      ['complexToDimensionPixelSize(IF Landroid/util/DisplayMetrics;)' + I]: (s, d) => Math.round(tvDimRaw(s | 0)),
      ['complexToFloat(I)' + F]: (s) => Math.fround(tvDimRaw(s | 0)),
      ['complexToDimensionPixelOffset(IF Landroid/util/DisplayMetrics;)' + I]: (s, d) => Math.floor(tvDimRaw(s | 0)),
    },
  });
  const TV = 'Landroid/util/TypedValue;->';
  function tvData(s) { return s && s[TV + 'data:I'] !== undefined ? s[TV + 'data:I'] : 0; }
  function tvDim(s) { return tvDimRaw(tvData(s)); }
  function tvDimRaw(data) { const u = data & 0xf; const radix = (data >> 4) & 3; let m = (data >> 8) & 0xffffff; if (m & 0x800000) m -= 0x1000000; const mult = [1, 1 / 128, 1 / 16384, 1 / (1 << 24)][radix]; return m * mult * (u === 0 ? 1 : 1); }
  R.def('Landroid/content/res/Resources$Theme;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['applyStyle(IZ)' + V]: (s, id, force) => { s.$styles = (s.$styles || []).concat([id | 0]); },
      ['resolveAttribute(ILandroid/util/TypedValue;Z)' + Z]: (s, attrId, out, resolveRefs) => BOOL(H.resolveThemeAttribute(attrId | 0, out, !!resolveRefs, s)),
      ['obtainStyledAttributes([I)Landroid/content/res/TypedArray;']: (s, ids) => H.obtainStyledAttributes(null, ids, s),
      ['obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;']: (s, aset, ids, a, b) => H.obtainStyledAttributes(aset, ids, s),
      ['obtainStyledAttributes(ILandroid/content/res/XmlResourceParser;[III)Landroid/content/res/TypedArray;']: () => ({ $c: R.klass('Landroid/content/res/TypedArray;'), $vals: [] }),
      ['getResources()Landroid/content/res/Resources;']: () => H.resources(),
      ['setTo(Landroid/content/res/Resources$Theme;)' + V]: (s, o) => { s.$styles = (o && o.$styles || []).slice(); },
      ['newTheme()Landroid/content/res/Resources$Theme;']: () => mkSimple('Landroid/content/res/Resources$Theme;'),
      ['toString()' + S]: () => 'Theme{dex2web}',
    },
  });
  R.def('Landroid/content/res/Resources;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['newTheme()Landroid/content/res/Resources$Theme;']: () => mkSimple('Landroid/content/res/Resources$Theme;'),
      ['obtainStyledAttributes([I)Landroid/content/res/TypedArray;']: (s, ids) => H.obtainStyledAttributes(null, ids, null),
      ['getSystem()Landroid/content/res/Resources;']: () => H.resources(),
    },
    sm: { ['getSystem()Landroid/content/res/Resources;']: () => null },
  });
  R.def('Landroid/view/ContextThemeWrapper;', { access: 0x21, sup: 'Landroid/content/ContextWrapper;', m: { ['<init>(Landroid/content/Context;I)' + V]: (s, c) => { s.$ctx = c; }, ['<init>()' + V]: () => {}, ['getTheme()Landroid/content/res/Resources$Theme;']: () => mkSimple('Landroid/content/res/Resources$Theme;'), ['setTheme(I)' + V]: (s, id) => { s.$themeId = id | 0; } } });
  R.def('Landroid/content/Context;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['getTheme()Landroid/content/res/Resources$Theme;']: (s) => s.$theme || (s.$theme = mkSimple('Landroid/content/res/Resources$Theme;')), ['setTheme(I)' + V]: (s, id) => { s.$themeId = id | 0; }, ['obtainStyledAttributes([I)Landroid/content/res/TypedArray;']: (s, ids) => H.obtainStyledAttributes(null, ids, s.$theme || null), ['obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;']: (s, aset, ids, a, b) => H.obtainStyledAttributes(aset, ids, s.$theme || null) } });
  R.def('Landroid/app/Activity;', { access: 0x21, sup: 'Landroid/content/Context;', m: { ['getTheme()Landroid/content/res/Resources$Theme;']: (s) => s.$theme || (s.$theme = mkSimple('Landroid/content/res/Resources$Theme;')), ['setTheme(I)' + V]: (s, id) => { s.$themeId = id | 0; } } });

  /* ---- a few odds and ends real apps reach for ---- */
  R.def('Ljava/lang/Runnable;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['run()' + V]: () => {} } });
  R.def('Ljava/lang/Iterable;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['iterator()Ljava/util/Iterator;']: (s) => (s && s.$a ? makeIter(R, s.$a) : makeIter(R, [])) } });
  R.def('Ljava/util/Collection;', { access: 0x601, sup: 'Ljava/lang/Iterable;', m: { ['iterator()Ljava/util/Iterator;']: (s) => makeIter(R, (s && s.$a) || []), ['stream()Ljava/util/stream/Stream;']: () => null, ['parallelStream()Ljava/util/stream/Stream;']: () => null } });
  R.def('Ljava/util/List;', { access: 0x601, sup: 'Ljava/util/Collection;', m: { ['sort(Ljava/util/Comparator;)' + V]: (s, c) => { if (s && s.$a) s.$a.sort(c ? (a, b) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', c, a, b) : compareValsLocal); }, ['replaceAll(Ljava/util/function/UnaryOperator;)' + V]: () => {}, ['removeIf(Ljava/util/function/Predicate;)' + Z]: () => 0 } });
  R.def('Ljava/util/function/UnaryOperator;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/function/Predicate;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/function/Function;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/function/Consumer;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/function/Supplier;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/lang/reflect/Method;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getName()' + S]: (s) => s.$name || '', ['invoke(' + O + '[Ljava/lang/Object;)' + O]: () => null, ['setAccessible(Z)' + V]: () => {}, ['getReturnType()Ljava/lang/Class;']: () => R.classObject('Ljava/lang/Object;'), ['getParameterTypes()[Ljava/lang/Class;']: () => arr(R, '[Ljava/lang/Class;', []), ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []), ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0 } });
  R.def('Ljava/lang/reflect/Field;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getName()' + S]: (s) => s.$name || '', ['get(' + O + ')' + O]: () => null, ['set(' + O + O + ')' + V]: () => {}, ['setAccessible(Z)' + V]: () => {}, ['getType()Ljava/lang/Class;']: () => R.classObject('Ljava/lang/Object;'), ['getInt(' + O + ')' + I]: () => 0, ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []), ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0 } });
  R.def('Ljava/lang/Class;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;']: (s, n) => { const o = mkSimple('Ljava/lang/reflect/Method;'); o.$name = String(n); return o; }, ['getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;']: (s, n) => { const o = mkSimple('Ljava/lang/reflect/Method;'); o.$name = String(n); return o; }, ['getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;']: (s, n) => { const o = mkSimple('Ljava/lang/reflect/Field;'); o.$name = String(n); return o; }, ['getField(Ljava/lang/String;)Ljava/lang/reflect/Field;']: (s, n) => { const o = mkSimple('Ljava/lang/reflect/Field;'); o.$name = String(n); return o; }, ['getDeclaredMethods()[Ljava/lang/reflect/Method;']: () => arr(R, '[Ljava/lang/reflect/Method;', []), ['getMethods()[Ljava/lang/reflect/Method;']: () => arr(R, '[Ljava/lang/reflect/Method;', []), ['getDeclaredFields()[Ljava/lang/reflect/Field;']: (s) => arr(R, '[Ljava/lang/reflect/Field;', classFields(R, s)), ['getFields()[Ljava/lang/reflect/Field;']: (s) => arr(R, '[Ljava/lang/reflect/Field;', classFields(R, s)), ['getDeclaredConstructors()[Ljava/lang/reflect/Constructor;']: () => arr(R, '[Ljava/lang/reflect/Constructor;', []), ['getConstructors()[Ljava/lang/reflect/Constructor;']: () => arr(R, '[Ljava/lang/reflect/Constructor;', []), ['getAnnotation(Ljava/lang/Class;)Ljava/lang/annotation/Annotation;']: () => null, ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0, ['getClassLoader()Ljava/lang/ClassLoader;']: () => null, ['cast(' + O + ')' + O]: (s, o) => o, ['isAssignableFrom(Ljava/lang/Class;)' + Z]: (s, o) => BOOL(o && R.isAssignable(String(o['Ljava/lang/Class;->desc:Ljava/lang/String;'] || ''), String(s['Ljava/lang/Class;->desc:Ljava/lang/String;'] || ''))), ['desiredAssertionStatus()' + Z]: () => 0,
    },
  });
  function classFields(R, clsObj) {
    const desc = clsObj && clsObj['Ljava/lang/Class;->desc:Ljava/lang/String;'];
    const c = desc ? R.classes.get(desc) : null;
    if (!c) return [];
    return (c.instanceFields || []).map((f) => { const o = mkSimple('Ljava/lang/reflect/Field;'); o.$name = f.name; return o; });
  }
  R.def('Ljava/lang/reflect/Constructor;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['newInstance([Ljava/lang/Object;)' + O]: (s, args) => null, ['setAccessible(Z)' + V]: () => {}, ['getParameterTypes()[Ljava/lang/Class;']: () => arr(R, '[Ljava/lang/Class;', []), ['getAnnotation(Ljava/lang/Class;)Ljava/lang/annotation/Annotation;']: () => null } });
  R.def('Ljava/lang/annotation/Annotation;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { ['annotationType()Ljava/lang/Class;']: () => R.classObject('Ljava/lang/annotation/Annotation;') } });
  R.def('Ljava/lang/reflect/InvocationTargetException;', { access: 0x21, sup: 'Ljava/lang/ReflectiveOperationException;' });
  R.def('Ljava/lang/ReflectiveOperationException;', { access: 0x21, sup: 'Ljava/lang/Exception;' });
  R.def('Ljava/lang/IllegalAccessException;', { access: 0x21, sup: 'Ljava/lang/ReflectiveOperationException;' });
  R.def('Ljava/lang/InstantiationException;', { access: 0x21, sup: 'Ljava/lang/ReflectiveOperationException;' });
  R.def('Ljava/lang/NoSuchMethodException;', { access: 0x21, sup: 'Ljava/lang/ReflectiveOperationException;' });
  R.def('Ljava/lang/NoSuchFieldException;', { access: 0x21, sup: 'Ljava/lang/ReflectiveOperationException;' });



  /* ---- a working FragmentManager / FragmentTransaction ---- */
  const txMethods = {
    ['add(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, id, f) => { s.$ops.push({ kind: 'add', containerId: id | 0, frag: f }); return s; },
    ['add(ILandroidx/fragment/app/Fragment;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s, id, f, tag) => { s.$ops.push({ kind: 'add', containerId: id | 0, frag: f, tag: String(tag) }); return s; },
    ['add(Landroidx/fragment/app/Fragment;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s, f, tag) => { s.$ops.push({ kind: 'add', containerId: 0, frag: f, tag: String(tag) }); return s; },
    ['add(Landroid/view/ViewGroup;Landroidx/fragment/app/Fragment;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s, vg, f, tag) => { s.$ops.push({ kind: 'add', containerId: vg && vg.$id, frag: f, tag: String(tag) }); return s; },
    ['replace(ILandroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, id, f) => { s.$ops.push({ kind: 'replace', containerId: id | 0, frag: f }); return s; },
    ['replace(ILandroidx/fragment/app/Fragment;Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s, id, f, tag) => { s.$ops.push({ kind: 'replace', containerId: id | 0, frag: f, tag: String(tag) }); return s; },
    ['remove(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => { s.$ops.push({ kind: 'remove', frag: f }); return s; },
    ['hide(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => { s.$ops.push({ kind: 'hide', frag: f }); return s; },
    ['show(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => { s.$ops.push({ kind: 'show', frag: f }); return s; },
    ['detach(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => { s.$ops.push({ kind: 'remove', frag: f }); return s; },
    ['attach(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => { s.$ops.push({ kind: 'add', containerId: f.$containerId || 0, frag: f }); return s; },
    ['addToBackStack(Ljava/lang/String;)Landroidx/fragment/app/FragmentTransaction;']: (s, n) => { s.$back = String(n); return s; },
    ['setCustomAnimations(II)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
    ['setCustomAnimations(IIII)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
    ['setTransition(I)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
    ['setReorderingAllowed(Z)Landroidx/fragment/app/FragmentTransaction;']: (s) => s,
    ['setPrimaryNavigationFragment(Landroidx/fragment/app/Fragment;)Landroidx/fragment/app/FragmentTransaction;']: (s, f) => s,
    ['isEmpty()' + Z]: (s) => BOOL(!s.$ops.length),
    ['commit()' + I]: (s) => { H.post(() => H.fragCommit(s)); return 0; },
    ['commitNow()' + V]: (s) => { H.fragCommit(s); },
    ['commitAllowingStateLoss()' + I]: (s) => { H.post(() => H.fragCommit(s)); return 0; },
    ['commitNowAllowingStateLoss()' + V]: (s) => { H.fragCommit(s); },
  };
  const fmMethods = {
    ['beginTransaction()Landroidx/fragment/app/FragmentTransaction;']: () => H.fragBeginTransaction(),
    ['beginTransaction()Landroid/app/FragmentTransaction;']: () => H.fragBeginTransaction(),
    ['findFragmentByTag(Ljava/lang/String;)Landroidx/fragment/app/Fragment;']: (s, tag) => H.fragFind(H.currentActivity(), String(tag), null),
    ['findFragmentById(I)Landroidx/fragment/app/Fragment;']: (s, id) => H.fragFind(H.currentActivity(), null, id | 0),
    ['getFragments()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: ((H.currentActivity() || {}).$fragments || []).slice() }),
    ['executePendingTransactions()' + Z]: () => 1,
    ['popBackStack()' + V]: () => {},
    ['popBackStack(Ljava/lang/String;I)' + Z]: () => 0,
    ['popBackStack(II)' + Z]: () => 0,
    ['getBackStackEntryCount()' + I]: () => 0,
    ['isStateSaved()' + Z]: () => 0,
    ['isDestroyed()' + Z]: () => 0,
    ['putFragment(Landroid/os/Bundle;Ljava/lang/String;Landroidx/fragment/app/Fragment;)' + V]: (s, b, k, f) => { if (b && b.$m) b.$m.set(String(k), f); },
    ['getFragment(Landroid/os/Bundle;Ljava/lang/String;)Landroidx/fragment/app/Fragment;']: (s, b, k) => (b && b.$m && b.$m.has(String(k)) ? b.$m.get(String(k)) : null),
    ['registerFragmentLifecycleCallbacks(Landroidx/fragment/app/FragmentManager$FragmentLifecycleCallbacks;Z)' + V]: () => {},
  };
  // The platform android.app.Fragment* APIs take/return platform Fragment types,
  // while androidx takes its own — register both spellings of every signature.
  const variant = (map, from, to) => {
    const out = {};
    for (const k in map) out[k.split(from).join(to)] = map[k];
    return out;
  };
  const APP_F = 'Landroid/app/Fragment;', X_F = 'Landroidx/fragment/app/Fragment;';
  const APP_T = 'Landroid/app/FragmentTransaction;', X_T = 'Landroidx/fragment/app/FragmentTransaction;';
  const APP_M = 'Landroid/app/FragmentManager;', X_M = 'Landroidx/fragment/app/FragmentManager;';
  const txApp = variant(variant(txMethods, X_F, APP_F), X_T, APP_T);
  const fmApp = variant(variant(fmMethods, X_F, APP_F), X_M, APP_M);
  R.def('Landroidx/fragment/app/FragmentTransaction;', { access: 0x21, sup: 'Ljava/lang/Object;', m: Object.assign({}, txApp, txMethods) });
  R.def('Landroid/app/FragmentTransaction;', { access: 0x421, sup: 'Ljava/lang/Object;', m: Object.assign({}, txMethods, txApp) });
  R.def('Landroidx/fragment/app/FragmentManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: Object.assign({}, fmApp, fmMethods) });
  R.def('Landroid/app/FragmentManager;', { access: 0x421, sup: 'Ljava/lang/Object;', m: Object.assign({}, fmMethods, fmApp) });
  R.def('Landroidx/fragment/app/FragmentManager$FragmentLifecycleCallbacks;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/res/Resources$Theme;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getDrawable(I)Landroid/graphics/drawable/Drawable;']: (s, id) => H.resDrawable(id | 0) } });

  R.def('Ljava/lang/Runtime;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['availableProcessors()' + I]: () => (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
      ['maxMemory()' + J]: () => 268435456,
      ['totalMemory()' + J]: () => 67108864,
      ['freeMemory()' + J]: () => 33554432,
      ['gc()' + V]: () => {},
      ['addShutdownHook(Ljava/lang/Thread;)' + V]: () => {},
      ['exit(I)' + V]: (c) => { H.log('W', 'Runtime', 'exit(' + c + ') ignored'); },
      ['halt(I)' + V]: () => {},
      ['load(Ljava/lang/String;)' + V]: (n) => H.log('W', 'Runtime', 'System.load(' + n + ') — native libraries cannot be loaded in the browser'),
      ['loadLibrary(Ljava/lang/String;)' + V]: (n) => H.log('W', 'Runtime', 'System.loadLibrary(' + n + ') — native libraries cannot be loaded in the browser'),
    },
    sm: { ['getRuntime()Ljava/lang/Runtime;']: () => mkSimple('Ljava/lang/Runtime;') },
  });
  R.def('Ljava/lang/Long;', { access: 0x31, sup: 'Ljava/lang/Number;', sm: {
    ['numberOfTrailingZeros(' + J + ')' + I]: (v) => { let x = Math.trunc(Number(v)); if (x === 0) return 64; let n = 0; while ((x & 1) === 0 && n < 63) { n++; x = Math.floor(x / 2); } return n; },
    ['numberOfLeadingZeros(' + J + ')' + I]: (v) => { let x = Math.trunc(Number(v)); if (x === 0) return 64; let n = 0; const B = [32, 16, 8, 4, 2, 1]; let t = 0; for (const b of B) { if (x < Math.pow(2, 64 - b - t) - 1 && x < Math.pow(2, 63 - t)) {} } let y = x; n = 0; while (y < 9223372036854775807 / 2 && n < 63) { n++; y *= 2; } return n; },
    ['bitCount(' + J + ')' + I]: (v) => { let x = Math.trunc(Math.abs(Number(v))); let n = 0; while (x) { n += x & 1; x = Math.floor(x / 2); } return n; },
    ['highestOneBit(' + J + ')' + J]: (v) => { let x = Math.trunc(Number(v)); if (x <= 0) return 0; let p = 1; while (p * 2 <= x) p *= 2; return p; },
    ['lowestOneBit(' + J + ')' + J]: (v) => { const x = Math.trunc(Number(v)); return x === 0 ? 0 : (x & -x); },
    ['compare(' + J + J + ')' + I]: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    ['sum(' + J + J + ')' + J]: (a, b) => a + b,
    ['max(' + J + J + ')' + J]: (a, b) => Math.max(a, b),
    ['min(' + J + J + ')' + J]: (a, b) => Math.min(a, b),
    ['toUnsignedString(' + J + ')' + S]: (v) => String(v >>> 0),
    ['parseLong(Ljava/lang/String;I)' + J]: (v, r) => Number(parseInt(v, r)),
  } });
  R.def('Ljava/lang/Integer;', { access: 0x31, sup: 'Ljava/lang/Number;', sm: {
    ['numberOfTrailingZeros(I)' + I]: (v) => { v |= 0; if (v === 0) return 32; let n = 0; while ((v & 1) === 0) { n++; v >>= 1; } return n; },
    ['numberOfLeadingZeros(I)' + I]: (v) => { v |= 0; if (v === 0) return 32; let n = 0; let x = v >>> 0; while (!(x & 0x80000000)) { n++; x <<= 1; } return n; },
    ['highestOneBit(I)' + I]: (v) => { v |= 0; if (v === 0) return 0; let p = 1; while (p * 2 <= Math.abs(v)) p *= 2; return v < 0 ? -p : p; },
    ['lowestOneBit(I)' + I]: (v) => v & -v,
    ['compare(II)' + I]: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    ['compareUnsigned(II)' + I]: (a, b) => { const x = a >>> 0, y = b >>> 0; return x < y ? -1 : x > y ? 1 : 0; },
    ['sum(II)' + I]: (a, b) => (a + b) | 0,
    ['max(II)' + I]: (a, b) => Math.max(a | 0, b | 0),
    ['min(II)' + I]: (a, b) => Math.min(a | 0, b | 0),
  } });
  R.def('Landroid/app/Activity;', { access: 0x21, sup: 'Landroid/content/Context;', m: {
    ['getLastNonConfigurationInstance()' + O]: (s) => (s && s.$lastNonConfig === undefined ? null : s.$lastNonConfig),
    ['onRetainNonConfigurationInstance()' + O]: (s) => null,
    ['retainComponent()' + O]: () => null,
  } });
  R.def('Ljava/lang/System;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: {
    ['currentTimeMillis()' + J]: () => Date.now(),
    ['nanoTime()' + J]: () => Math.floor((typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1e6),
  } });
  R.def('Ljava/lang/Class;', { access: 0x31, sup: 'Ljava/lang/Object;', m: {
    ['newInstance()' + O]: (s) => {
      const desc = s && s['Ljava/lang/Class;->desc:Ljava/lang/String;'];
      if (!desc) throw R.newException('Ljava/lang/InstantiationException;', 'no class');
      if (!R.classes.has(desc)) throw R.newException('Ljava/lang/InstantiationException;', desc);
      const c = R.klass(desc); R.initClass(c);
      const ci = R.findMethod(c, '<init>()V');
      const o = c.hooks.create ? c.hooks.create(R, c) : R.newInstanceObj(c);
      if (ci) R.callMethod(ci, [o]);
      return o;
    },
  } });

  R.def('Ljava/util/concurrent/TimeUnit;', { access: 0x4011, sup: 'Ljava/lang/Enum;', m: {
    ['toNanos(' + J + ')' + J]: (s, v) => Math.round(Number(v) * unitMs2(s) * 1e6),
    ['toMicros(' + J + ')' + J]: (s, v) => Math.round(Number(v) * unitMs2(s) * 1e3),
    ['toMillis(' + J + ')' + J]: (s, v) => Math.round(Number(v) * unitMs2(s)),
    ['toSeconds(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs2(s) / 1000),
    ['toMinutes(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs2(s) / 60000),
    ['toHours(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs2(s) / 3600000),
    ['toDays(' + J + ')' + J]: (s, v) => Math.floor(Number(v) * unitMs2(s) / 86400000),
    ['convert(' + J + 'Ljava/util/concurrent/TimeUnit;)' + J]: (s, v, src) => Math.round(Number(v) * unitMs2(src) / unitMs2(s)),
    ['sleep(' + J + ')' + V]: () => {},
    ['timedWait(' + O + J + ')' + V]: () => {},
    ['timedJoin(' + O + J + ')' + V]: () => {},
  } });
  function unitMs2(u) {
    const n = u && (u.$name || u['Ljava/lang/Enum;->name:Ljava/lang/String;']);
    return { NANOSECONDS: 1e-6, MICROSECONDS: 1e-3, MILLISECONDS: 1, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000, DAYS: 86400000 }[n] ?? 1;
  }
  R.def('Ljava/util/concurrent/atomic/AtomicReferenceArray;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(I)' + V]: (s, n) => { s.$a = new Array(Math.max(0, n | 0)).fill(null); },
      ['<init>([Ljava/lang/Object;)' + V]: (s, a) => { s.$a = (a || []).slice(); },
      ['length()' + I]: (s) => s.$a.length,
      ['get(I)' + O]: (s, i) => (s.$a[i | 0] === undefined ? null : s.$a[i | 0]),
      ['set(I' + O + ')' + V]: (s, i, v) => { s.$a[i | 0] = v; },
      ['lazySet(I' + O + ')' + V]: (s, i, v) => { s.$a[i | 0] = v; },
      ['getAndSet(I' + O + ')' + O]: (s, i, v) => { const o = s.$a[i | 0]; s.$a[i | 0] = v; return o === undefined ? null : o; },
      ['compareAndSet(I' + O + O + ')' + Z]: (s, i, e, n) => { if (s.$a[i | 0] === e) { s.$a[i | 0] = n; return 1; } return 0; },
      ['weakCompareAndSet(I' + O + O + ')' + Z]: (s, i, e, n) => { if (s.$a[i | 0] === e) { s.$a[i | 0] = n; return 1; } return 0; },
      ['toString()' + S]: (s) => '[' + s.$a.map((x) => R.str(x)).join(', ') + ']',
    },
  });
  R.def('Ljava/util/concurrent/atomic/AtomicIntegerArray;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(I)' + V]: (s, n) => { s.$a = new Array(Math.max(0, n | 0)).fill(0); },
      ['<init>([I)' + V]: (s, a) => { s.$a = (a || []).slice(); },
      ['length()' + I]: (s) => s.$a.length,
      ['get(I)' + I]: (s, i) => s.$a[i | 0] | 0,
      ['set(I' + I + ')' + V]: (s, i, v) => { s.$a[i | 0] = v | 0; },
      ['getAndSet(I' + I + ')' + I]: (s, i, v) => { const o = s.$a[i | 0]; s.$a[i | 0] = v | 0; return o; },
      ['compareAndSet(III)' + Z]: (s, i, e, n) => { if ((s.$a[i | 0] | 0) === (e | 0)) { s.$a[i | 0] = n | 0; return 1; } return 0; },
      ['weakCompareAndSet(III)' + Z]: (s, i, e, n) => { if ((s.$a[i | 0] | 0) === (e | 0)) { s.$a[i | 0] = n | 0; return 1; } return 0; },
      ['incrementAndGet(I)' + I]: (s, i) => ++s.$a[i | 0],
      ['decrementAndGet(I)' + I]: (s, i) => --s.$a[i | 0],
      ['getAndIncrement(I)' + I]: (s, i) => s.$a[i | 0]++,
      ['getAndAdd(II)' + I]: (s, i, d) => { const o = s.$a[i | 0]; s.$a[i | 0] = o + d; return o; },
      ['addAndGet(II)' + I]: (s, i, d) => (s.$a[i | 0] += d),
    },
  });
  R.def('Ljava/util/concurrent/atomic/AtomicLongArray;', { access: 0x21, sup: 'Ljava/util/concurrent/atomic/AtomicIntegerArray;' });
  R.def('Ljava/lang/Long;', { access: 0x31, sup: 'Ljava/lang/Number;', sm: {
    ['getLong(Ljava/lang/String;)Ljava/lang/Long;']: (k) => null,
    ['getLong(Ljava/lang/String;' + O + ')' + O]: (k, d) => d,
    ['getLong(Ljava/lang/String;J)Ljava/lang/Long;']: (k, d) => R.box('Ljava/lang/Long;', Number(d)),
    ['getLong(Ljava/lang/String;Ljava/lang/Long;)Ljava/lang/Long;']: (k, d) => d,
    ['getInteger(Ljava/lang/String;)Ljava/lang/Integer;']: (k) => null,
    ['getInteger(Ljava/lang/String;Ljava/lang/Integer;)Ljava/lang/Integer;']: (k, d) => d,
    ['getInteger(Ljava/lang/String;I)Ljava/lang/Integer;']: (k, d) => R.box('Ljava/lang/Integer;', d | 0),
  } });
  R.def('Ljava/lang/Boolean;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: {
    ['getBoolean(Ljava/lang/String;)' + Z]: () => 0,
    ['getProperty(Ljava/lang/String;)Ljava/lang/String;']: () => null,
    ['logicalXor(ZZ)' + Z]: (a, b) => BOOL((!!a) !== (!!b)),
    ['logicalNot(Z)' + Z]: (a) => BOOL(!a),
    ['compare(ZZ)' + I]: (a, b) => ((a ? 1 : 0) - (b ? 1 : 0)) | 0,
  } });
  R.def('Ljava/lang/Thread;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['holdsLock(' + O + ')' + Z]: () => 1,
    ['isInterrupted()' + Z]: () => 0,
    ['interrupted()' + Z]: () => 0,
  } });
  R.def('Ljava/lang/Thread;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['holdsLock(' + O + ')' + Z]: () => 1,
    ['interrupted()' + Z]: () => 0,
    ['activeCount()' + I]: () => 1,
    ['getAllStackTraces()Ljava/util/Map;']: () => ({ $c: R.klass('Ljava/util/HashMap;'), $m: new Map() }),
  } });
  R.def('Ljava/util/concurrent/locks/LockSupport;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['park()' + V]: () => {}, ['parkNanos(' + J + ')' + V]: () => {}, ['parkUntil(' + J + ')' + V]: () => {},
    ['unpark(Ljava/lang/Thread;)' + V]: () => {}, ['getBlockedOn()' + O]: () => null,
  } });
  R.def('Ljava/lang/management/ManagementFactory;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ================= working java.lang.reflect =================
   * Enough reflection for real code paths: Class.getConstructor(...).newInstance(...),
   * Class.getMethod(...).invoke(...), parameter types, annotations lookup. */
  const CD = 'Ljava/lang/Class;->desc:Ljava/lang/String;';
  const descOfCls = (o) => (o && o[CD]) || null;
  function protoFromParams(params) {
    let p = '(';
    for (const c of (params || [])) p += descOfCls(c) || 'Ljava/lang/Object;';
    return p + ')V';
  }
  function mkCtor(R, ownerDesc, proto) {
    const o = mkSimple('Ljava/lang/reflect/Constructor;');
    o.$owner = ownerDesc; o.$proto = proto; o.$name = '<init>';
    return o;
  }
  function mkMethod(R, ownerDesc, name, proto, ret) {
    const o = mkSimple('Ljava/lang/reflect/Method;');
    o.$owner = ownerDesc; o.$name = name; o.$proto = proto; o.$ret = ret || 'V';
    return o;
  }
  function findCtor(R, ownerDesc, proto) {
    const c = R.classes.get(ownerDesc);
    if (!c) return null;
    let cur = c, guard = 0;
    while (cur && guard++ < 60) {
      for (const [sig, m] of cur.methods) if (m.name === '<init>' && m.proto === proto) return m;
      cur = R.sup(cur);
    }
    return null;
  }
  R.def('Ljava/lang/Class;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['getConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;']: (s, params) => {
        const d = descOfCls(s); const proto = protoFromParams(params);
        if (!d || !findCtor(R, d, proto)) throw R.newException('Ljava/lang/NoSuchMethodException;', (d || '?') + '.<init>' + proto);
        return mkCtor(R, d, proto);
      },
      ['getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;']: (s, params) => {
        const d = descOfCls(s); const proto = protoFromParams(params);
        if (!d || !findCtor(R, d, proto)) throw R.newException('Ljava/lang/NoSuchMethodException;', (d || '?') + '.<init>' + proto);
        return mkCtor(R, d, proto);
      },
      ['getConstructors()[Ljava/lang/reflect/Constructor;']: (s) => {
        const d = descOfCls(s); const c = d ? R.classes.get(d) : null;
        const out = [];
        if (c) for (const m of [...c.methods.values()]) if (m.name === '<init>') out.push(mkCtor(R, d, m.proto));
        return arr(R, '[Ljava/lang/reflect/Constructor;', out);
      },
      ['getDeclaredConstructors()[Ljava/lang/reflect/Constructor;']: (s) => R.iv('Ljava/lang/Class;->getConstructors()[Ljava/lang/reflect/Constructor;', s),
      ['getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;']: (s, name, params) => {
        const d = descOfCls(s);
        const proto = '(' + (params || []).map((c) => descOfCls(c) || 'Ljava/lang/Object;').join('') + ')';
        const c = d ? R.classes.get(d) : null;
        if (c) {
          let cur = c, guard = 0;
          while (cur && guard++ < 60) {
            for (const [sig, m] of cur.methods) {
              if (m.name === String(name) && sig.startsWith(String(name) + proto)) {
                return mkMethod(R, d, String(name), sig.slice(String(name).length), m.retType);
              }
            }
            cur = R.sup(cur);
          }
        }
        throw R.newException('Ljava/lang/NoSuchMethodException;', `${d}->${name}${proto}`);
      },
      ['getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;']: (s, name, params) => R.iv('Ljava/lang/Class;->getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;', s, name, params),
      ['getDeclaredMethods()[Ljava/lang/reflect/Method;']: (s) => {
        const d = descOfCls(s); const c = d ? R.classes.get(d) : null; const out = [];
        if (c) for (const m of c.methods.values()) if (m.name !== '<init>' && m.name !== '<clinit>') out.push(mkMethod(R, d, m.name, m.proto, m.retType));
        return arr(R, '[Ljava/lang/reflect/Method;', out);
      },
      ['getMethods()[Ljava/lang/reflect/Method;']: (s) => R.iv('Ljava/lang/Class;->getDeclaredMethods()[Ljava/lang/reflect/Method;', s),
      ['getDeclaredFields()[Ljava/lang/reflect/Field;']: (s) => arr(R, '[Ljava/lang/reflect/Field;', classFields(R, s)),
      ['getFields()[Ljava/lang/reflect/Field;']: (s) => arr(R, '[Ljava/lang/reflect/Field;', classFields(R, s)),
      ['getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;']: (s, n) => { const o = mkSimple('Ljava/lang/reflect/Field;'); o.$name = String(n); o.$owner = descOfCls(s); return o; },
      ['getField(Ljava/lang/String;)Ljava/lang/reflect/Field;']: (s, n) => R.iv('Ljava/lang/Class;->getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;', s, n),
      ['getComponentType()Ljava/lang/Class;']: (s) => { const d = descOfCls(s) || ''; return d.startsWith('[') ? R.classObject(d.slice(1)) : null; },
      ['isArray()' + Z]: (s) => BOOL(String(descOfCls(s) || '').startsWith('[')),
      ['isPrimitive()' + Z]: (s) => BOOL(!String(descOfCls(s) || '').startsWith('L')),
      ['getSimpleName()' + S]: (s) => { const d = descOfCls(s) || ''; return d.split('/').pop().replace(';', '').replace('[', ''); },
      ['getName()' + S]: (s) => { const d = descOfCls(s) || ''; return d.startsWith('L') ? d.slice(1, -1).replace(/\//g, '.') : d; },
      ['getCanonicalName()' + S]: (s) => { const d = descOfCls(s) || ''; return d.slice(1, -1).replace(/\//g, '.'); },
      ['toString()' + S]: (s) => 'class ' + R.iv('Ljava/lang/Class;->getName()Ljava/lang/String;', s),
      ['forName(Ljava/lang/String;)Ljava/lang/Class;']: (n) => {
        const d = 'L' + String(n).replace(/\./g, '/') + ';';
        if (!R.classes.has(d)) throw R.newException('Ljava/lang/ClassNotFoundException;', String(n));
        return R.classObject(d);
      },
    },
  });
  R.def('Ljava/lang/reflect/Constructor;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['newInstance([Ljava/lang/Object;)' + O]: (s, args) => {
        const owner = s.$owner; const proto = s.$proto;
        const c = R.klass(owner); R.initClass(c);
        const obj = c.hooks.create ? c.hooks.create(R, c) : R.newInstanceObj(c);
        const m = findCtor(R, owner, proto);
        if (m) R.callMethod(m, [obj, ...(args || [])]);
        return obj;
      },
      ['getParameterTypes()[Ljava/lang/Class;']: (s) => {
        const ps = (s.$proto || '()V').slice(1, (s.$proto || '()V').indexOf(')'));
        const out = []; let i = 0;
        while (i < ps.length) {
          if (ps[i] === 'L') { const e = ps.indexOf(';', i); out.push(R.classObject(ps.slice(i, e + 1))); i = e + 1; }
          else if (ps[i] === '[') { let e = i + 1; while (ps[e] === '[') e++; if (ps[e] === 'L') { e = ps.indexOf(';', e); } out.push(R.classObject(ps.slice(i, e + 1))); i = e + 1; }
          else { out.push(R.classObject(primitiveName(ps[i]))); i++; }
        }
        return arr(R, '[Ljava/lang/Class;', out);
      },
      ['getParameterCount()' + I]: (s) => R.iv('Ljava/lang/reflect/Constructor;->getParameterTypes()[Ljava/lang/Class;', s).length,
      ['setAccessible(Z)' + V]: () => {},
      ['isAccessible()' + Z]: () => 1,
      ['getDeclaringClass()Ljava/lang/Class;']: (s) => R.classObject(s.$owner),
      ['getName()' + S]: (s) => R.iv('Ljava/lang/Class;->getName()Ljava/lang/String;', R.classObject(s.$owner)),
      ['getModifiers()' + I]: () => 1,
      ['getAnnotation(Ljava/lang/Class;)Ljava/lang/annotation/Annotation;']: () => null,
      ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []),
      ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0,
      ['toString()' + S]: (s) => `${s.$owner}.<init>${s.$proto}`,
    },
  });
  function primitiveName(c) { return { I: 'int', J: 'long', F: 'float', D: 'double', Z: 'boolean', B: 'byte', C: 'char', S: 'short', V: 'void' }[c] || 'int'; }
  R.def('Ljava/lang/reflect/Method;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['invoke(' + O + '[Ljava/lang/Object;)' + O]: (s, recv, args) => {
        const owner = s.$owner; const sig = s.$name + s.$proto;
        const c = R.klass(owner);
        let m = c.methods.get(sig);
        if (!m) m = R.findMethod(c, sig) || R.findInterfaceMethod(c, sig);
        if (!m) throw R.newException('Ljava/lang/NoSuchMethodException;', `${owner}->${sig}`);
        if (m.isStatic()) return R.callMethod(m, args || []);
        return R.callMethod(m, [recv, ...(args || [])]);
      },
      ['getName()' + S]: (s) => s.$name,
      ['getReturnType()Ljava/lang/Class;']: (s) => R.classObject(retOf(s.$proto)),
      ['getParameterTypes()[Ljava/lang/Class;']: (s) => R.iv('Ljava/lang/reflect/Constructor;->getParameterTypes()[Ljava/lang/Class;', { $c: R.klass('Ljava/lang/reflect/Constructor;'), $proto: s.$proto }),
      ['getParameterCount()' + I]: (s) => R.iv('Ljava/lang/reflect/Constructor;->getParameterTypes()[Ljava/lang/Class;', { $c: R.klass('Ljava/lang/reflect/Constructor;'), $proto: s.$proto }).length,
      ['setAccessible(Z)' + V]: () => {},
      ['getDeclaringClass()Ljava/lang/Class;']: (s) => R.classObject(s.$owner),
      ['getModifiers()' + I]: () => 1,
      ['getAnnotation(Ljava/lang/Class;)Ljava/lang/annotation/Annotation;']: () => null,
      ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []),
      ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0,
      ['toString()' + S]: (s) => `${s.$owner}->${s.$name}${s.$proto}`,
    },
  });
  function retOf(proto) { const r = (proto || '()V').slice((proto || '()V').indexOf(')') + 1); return r.length === 1 && 'IJFDZBCSV'.includes(r) ? primitiveName(r) : r; }
  R.def('Ljava/lang/reflect/Field;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['get(' + O + ')' + O]: (s, o) => { const key = fieldKeyOf(R, s, o); return key && o ? o[key] : null; },
      ['set(' + O + O + ')' + V]: (s, o, v) => { const key = fieldKeyOf(R, s, o); if (key && o) o[key] = v; },
      ['getInt(' + O + ')' + I]: (s, o) => { const key = fieldKeyOf(R, s, o); return (key && o ? o[key] : 0) | 0; },
      ['getBoolean(' + O + ')' + Z]: (s, o) => { const key = fieldKeyOf(R, s, o); return (key && o && o[key]) ? 1 : 0; },
      ['setAccessible(Z)' + V]: () => {},
      ['getName()' + S]: (s) => s.$name || '',
      ['getType()Ljava/lang/Class;']: (s) => R.classObject(s.$type || 'Ljava/lang/Object;'),
      ['getDeclaringClass()Ljava/lang/Class;']: (s) => R.classObject(s.$owner),
      ['getModifiers()' + I]: () => 1,
      ['getAnnotation(Ljava/lang/Class;)Ljava/lang/annotation/Annotation;']: () => null,
      ['getAnnotations()[Ljava/lang/annotation/Annotation;']: () => arr(R, '[Ljava/lang/annotation/Annotation;', []),
      ['isAnnotationPresent(Ljava/lang/Class;)' + Z]: () => 0,
    },
  });
  function fieldKeyOf(R, f, obj) {
    const name = f.$name;
    const owners = [];
    if (f.$owner) owners.push(f.$owner);
    if (obj && obj.$c) { let c = obj.$c, g = 0; while (c && g++ < 60) { owners.push(c.desc); c = R.sup(c); } }
    for (const od of owners) {
      const c = R.classes.get(od);
      if (!c) continue;
      const hit = (c.instanceFields || []).find((x) => x.name === name) || (c.staticFields || []).find((x) => x.name === name);
      if (hit) return hit.key;
    }
    return null;
  }
  function classFields(R, clsObj) {
    const desc = descOfCls(clsObj);
    const c = desc ? R.classes.get(desc) : null;
    if (!c) return [];
    return (c.instanceFields || []).concat(c.staticFields || []).map((fl) => {
      const o = mkSimple('Ljava/lang/reflect/Field;');
      o.$name = fl.name; o.$type = fl.type; o.$owner = desc;
      return o;
    });
  }

  /* ---- decor view, ViewTreeObserver and crash handlers ---- */
  R.def('Landroid/view/Window;', { access: 0x421, sup: 'Ljava/lang/Object;', m: {
    ['getDecorView()Landroid/view/View;']: (s) => H.ensureDecor(s.$activity),
    ['peekDecorView()Landroid/view/View;']: (s) => H.ensureDecor(s.$activity),
  } });
  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getViewTreeObserver()Landroid/view/ViewTreeObserver;']: (s) => s.$vto || (s.$vto = makeVto(R, s)),
  } });
  function makeVto(R, view) {
    const o = mkSimple('Landroid/view/ViewTreeObserver;');
    o.$view = view; o.$global = []; o.$preDraw = []; o.$layout = [];
    return o;
  }
  R.def('Landroid/view/ViewTreeObserver;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['addOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)' + V]: (s, l) => {
        s.$global = s.$global || []; s.$global.push(l);
        // The next frame is our "global layout" pass.
        H.post(() => {
          for (const li of s.$global.slice()) { try { R.iv('Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;->onGlobalLayout()V', li); } catch (e) { H.crash(e); } }
        });
      },
      ['removeOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)' + V]: (s, l) => { s.$global = (s.$global || []).filter((x) => x !== l); },
      ['removeGlobalOnLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)' + V]: (s, l) => { s.$global = (s.$global || []).filter((x) => x !== l); },
      ['addOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)' + V]: (s, l) => { s.$preDraw = (s.$preDraw || []).concat([l]); H.post(() => { try { R.iv('Landroid/view/ViewTreeObserver$OnPreDrawListener;->onPreDraw()Z', l); } catch (e) { H.crash(e); } }); },
      ['removeOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)' + V]: (s, l) => { s.$preDraw = (s.$preDraw || []).filter((x) => x !== l); },
      ['addOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)' + V]: () => {},
      ['removeOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)' + V]: () => {},
      ['addOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)' + V]: (s, l) => { s.$scroll = (s.$scroll || []).concat([l]); },
      ['removeOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)' + V]: (s, l) => { s.$scroll = (s.$scroll || []).filter((x) => x !== l); },
      ['addOnTouchModeChangeListener(Landroid/view/ViewTreeObserver$OnTouchModeChangeListener;)' + V]: () => {},
      ['dispatchOnPreDraw()' + Z]: () => 1,
      ['isAlive()' + Z]: () => 1,
    },
  });
  for (const n of ['OnGlobalLayoutListener', 'OnPreDrawListener', 'OnDrawListener', 'OnScrollChangedListener', 'OnTouchModeChangeListener', 'OnWindowAttachListener', 'OnWindowFocusChangeListener']) {
    R.def('Landroid/view/ViewTreeObserver$' + n + ';', { access: 0x601, sup: 'Ljava/lang/Object;' });
  }
  R.def('Ljava/lang/Thread;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getUncaughtExceptionHandler()Ljava/lang/Thread$UncaughtExceptionHandler;']: (s) => s.$ueh || (s.$ueh = defaultUeh(R)),
    ['setUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)' + V]: (s, h) => { s.$ueh = h; },
  } });
  R.def('Ljava/lang/Thread;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['getDefaultUncaughtExceptionHandler()Ljava/lang/Thread$UncaughtExceptionHandler;']: () => defaultUeh(R),
    ['setDefaultUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)' + V]: (h) => { R.klass('Ljava/lang/Thread;').statics['Ljava/lang/Thread;->$d2wUeh:Ljava/lang/Thread$UncaughtExceptionHandler;'] = h; },
  } });
  R.def('Ljava/lang/Thread$UncaughtExceptionHandler;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  function defaultUeh(R) {
    const c = R.klass('Ljava/lang/Thread$UncaughtExceptionHandler;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    o.__d2wDefault = true;
    return o;
  }

  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['addOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)' + V]: (s, l) => {
      s.$attach = (s.$attach || []).concat([l]);
      // Views in our DOM are attached as soon as they exist.
      H.post(() => { try { R.iv('Landroid/view/View$OnAttachStateChangeListener;->onViewAttachedToWindow(Landroid/view/View;)V', l, s); } catch (e) { H.crash(e); } });
    },
    ['removeOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)' + V]: (s, l) => { s.$attach = (s.$attach || []).filter((x) => x !== l); },
    ['isAttachedToWindow()' + Z]: (s) => BOOL(!!(s && s.$el)),
    ['getWindowVisibility()' + I]: () => 0,
    ['hasWindowFocus()' + Z]: () => 1,
    ['isShown()' + Z]: (s) => BOOL(!!(s && s.$el)),
    ['getHandler()Landroid/os/Handler;']: () => mkSimple('Landroid/os/Handler;'),
  } });
  R.def('Landroid/view/View$OnAttachStateChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['post(Ljava/lang/Runnable;)' + Z]: (s, r) => { H.post(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }); return 1; },
    ['postDelayed(Ljava/lang/Runnable;J)' + Z]: (s, r, d) => { H.postDelayed(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }, Number(d)); return 1; },
    ['postOnAnimation(Ljava/lang/Runnable;)' + V]: (s, r) => H.post(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }),
    ['removeCallbacks(Ljava/lang/Runnable;)' + V]: () => {},
  } });

  /* ---- last-mile shims seen in the wild ---- */
  R.def('Ljava/lang/ThreadLocal;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$v = null; }, ['get()' + O]: (s) => (s.$v === undefined ? null : s.$v), ['set(' + O + ')' + V]: (s, v) => { s.$v = v; }, ['remove()' + V]: (s) => { s.$v = null; }, ['initialValue()' + O]: () => null }, sm: { ['withInitial(Ljava/util/function/Supplier;)Ljava/lang/ThreadLocal;']: (sup) => { const o = mkSimple('Ljava/lang/ThreadLocal;'); o.$v = sup ? R.iv('Ljava/util/function/Supplier;->get()Ljava/lang/Object;', sup) : null; return o; } } });
  R.def('Ljava/util/function/Supplier;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/Choreographer;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['postFrameCallback(Landroid/view/Choreographer$FrameCallback;)' + V]: (s, cb) => { H.post(() => { try { R.iv('Landroid/view/Choreographer$FrameCallback;->doFrame(J)V', cb, Date.now() * 1e6); } catch (e) { H.crash(e); } }); }, ['postCallback(ILjava/lang/Runnable;)' + V]: (s, t, r) => H.post(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }), ['postCallbackDelayed(ILjava/lang/Runnable;J)' + V]: (s, t, r, d) => H.postDelayed(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }, Number(d)), ['getFrameTimeNanos()' + J]: () => Date.now() * 1e6 }, sm: { ['getInstance()Landroid/view/Choreographer;']: () => mkSimple('Landroid/view/Choreographer;') } });
  R.def('Landroid/view/Choreographer$FrameCallback;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/Arrays;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['fill([JIIJ)' + V]: (a, f, t, v) => { for (let i = f | 0; i < (t | 0) && i < a.length; i++) a[i] = Number(v); },
    ['fill([III)' + V]: (a, f, t, v) => { for (let i = f | 0; i < (t | 0) && i < a.length; i++) a[i] = v | 0; },
    ['fill([BII B)' .replace(' ', '') + V]: (a, f, t, v) => { for (let i = f | 0; i < (t | 0) && i < a.length; i++) a[i] = (v << 24) >> 24; },
    ['fill([Ljava/lang/Object;II Ljava/lang/Object;)'.replace(' ', '') + V]: (a, f, t, v) => { for (let i = f | 0; i < (t | 0) && i < a.length; i++) a[i] = v; },
    ['fill([FF)' + V]: (a, v) => a.fill(v), ['fill([DD)' + V]: (a, v) => a.fill(v), ['fill([II)' + V]: (a, v) => a.fill(v | 0), ['fill([JJ)' + V]: (a, v) => a.fill(Number(v)),
    ['fill([Ljava/lang/Object;' + O + ')' + V]: (a, v) => a.fill(v), ['fill([BB)' + V]: (a, v) => a.fill((v << 24) >> 24), ['fill([CC)' + V]: (a, v) => a.fill((v | 0) & 0xffff), ['fill([ZZ)' + V]: (a, v) => a.fill(v ? 1 : 0),
    ['copyOf([BII)[B']: (a, f, t) => { const o = new Array(Math.max(0, (t | 0) - (f | 0))).fill(0); for (let i = f | 0; i < (t | 0) && i < a.length; i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[B'); return o; },
    ['copyOf([JII)[J']: (a, f, t) => { const o = new Array(Math.max(0, (t | 0) - (f | 0))).fill(0); for (let i = f | 0; i < (t | 0) && i < a.length; i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[J'); return o; },
    ['copyOf([FI)[F']: (a, n) => { const o = new Array(n | 0).fill(0); for (let i = 0; i < (n | 0) && i < a.length; i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[F'); return o; },
    ['copyOf([JI)[J']: (a, n) => { const o = new Array(n | 0).fill(0); for (let i = 0; i < (n | 0) && i < a.length; i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[J'); return o; },
    ['copyOf([DI)[D']: (a, n) => { const o = new Array(n | 0).fill(0); for (let i = 0; i < (n | 0) && i < a.length; i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[D'); return o; },
    ['copyOf([ZI)[Z']: (a, n) => { const o = new Array(n | 0).fill(0); for (let i = 0; i < (n | 0) && i < a.length; i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[Z'); return o; },
    ['copyOf([CI)[C']: (a, n) => { const o = new Array(n | 0).fill(0); for (let i = 0; i < (n | 0) && i < a.length; i++) o[i] = a[i]; o[ARR_CLASS] = R.klass('[C'); return o; },
    ['copyOfRange([Ljava/lang/Object;II)[Ljava/lang/Object;']: (a, f, t) => { const o = new Array(Math.max(0, (t | 0) - (f | 0))).fill(null); for (let i = f | 0; i < (t | 0) && i < a.length; i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[Ljava/lang/Object;'); return o; },
    ['copyOfRange([JII)[J']: (a, f, t) => { const o = new Array(Math.max(0, (t | 0) - (f | 0))).fill(0); for (let i = f | 0; i < (t | 0) && i < a.length; i++) o[i - f] = a[i]; o[ARR_CLASS] = R.klass('[J'); return o; },
    ['sort([J)' + V]: (a) => a.sort((x, y) => x - y),
    ['sort([F)' + V]: (a) => a.sort((x, y) => x - y),
    ['sort([D)' + V]: (a) => a.sort((x, y) => x - y),
    ['sort([B)' + V]: (a) => a.sort((x, y) => x - y),
    ['sort([JII)' + V]: (a, f, t) => { const seg = a.slice(f, t).sort((x, y) => x - y); for (let i = 0; i < seg.length; i++) a[f + i] = seg[i]; },
    ['sort([III)' + V]: (a, f, t) => { const seg = a.slice(f, t).sort((x, y) => x - y); for (let i = 0; i < seg.length; i++) a[f + i] = seg[i]; },
    ['binarySearch([JJ)' + I]: (a, k) => { let lo = 0, hi = a.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === k) return m; if (a[m] < k) lo = m + 1; else hi = m - 1; } return -lo - 1; },
    ['deepEquals([Ljava/lang/Object;[Ljava/lang/Object;)' + Z]: (a, b) => BOOL(a && b && a.length === b.length && a.every((x, i) => x === b[i])),
    ['deepHashCode([Ljava/lang/Object;)' + I]: (a) => { let h = 1; for (const x of a || []) h = (Math.imul(31, h) + hashCodeOfLocal(x)) | 0; return h; },
    ['asList([I)Ljava/util/List;']: (a) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: (a || []).slice() }),
    ['spliterator([Ljava/lang/Object;)Ljava/util/Spliterator;']: () => null,
  } });
  R.def('Ljava/util/Spliterator;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Handler;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['<init>(Landroid/os/Looper;Landroid/os/Handler$Callback;Z)' + V]: () => {},
    ['<init>(Landroid/os/Looper;Landroid/os/Handler$Callback;Ljava/lang/Object;)' + V]: () => {},
    ['<init>(Landroid/os/Looper;Landroid/os/Handler$Callback;ZZ)' + V]: () => {},
    ['getLooper()Landroid/os/Looper;']: () => mkSimple('Landroid/os/Looper;'),
    ['getCallback()Landroid/os/Handler$Callback;']: () => null,
    ['sendEmptyMessageAtTime(IJ)' + Z]: () => 1,
    ['postAtFrontOfQueue(Ljava/lang/Runnable;)' + Z]: (s, r) => { H.post(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }); return 1; },
    ['postDelayed(Ljava/lang/Runnable;' + O + J + ')' + Z]: (s, r, tok, d) => { H.postDelayed(() => { try { R.iv('Ljava/lang/Runnable;->run()V', r); } catch (e) { H.crash(e); } }, Number(d)); return 1; },
  } });
  R.def('Landroid/os/Handler$Callback;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Looper;', { access: 0x31, sup: 'Ljava/lang/Object;', m: { ['getQueue()Landroid/os/MessageQueue;']: () => mkSimple('Landroid/os/MessageQueue;'), ['prepare()' + V]: () => {} } });

  /* ---- charsets: decode/encode against UTF-8 (the browser's native) ---- */
  R.def('Ljava/nio/charset/Charset;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['newDecoder()Ljava/nio/charset/CharsetDecoder;']: (s) => ({ $c: R.klass('Ljava/nio/charset/CharsetDecoder;'), $cs: s }),
      ['newEncoder()Ljava/nio/charset/CharsetEncoder;']: (s) => ({ $c: R.klass('Ljava/nio/charset/CharsetEncoder;'), $cs: s }),
      ['name()' + S]: (s) => s.$name || 'UTF-8',
      ['decode(Ljava/nio/ByteBuffer;)Ljava/nio/CharBuffer;']: (s, bb) => charBuffer(R, bytesToUtf8(bb && bb.$a)),
      ['encode(Ljava/lang/CharSequence;)Ljava/nio/ByteBuffer;']: (s, cs) => { const str = R.str(cs); const out = utf8Bytes(str); out[ARR_CLASS] = R.klass('[B'); const b = mkSimple('Ljava/nio/ByteBuffer;'); b.$a = out; return b; },
      ['canEncode()' + Z]: () => 1,
      ['displayName()' + S]: (s) => s.$name || 'UTF-8',
    },
    sm: {
      ['forName(Ljava/lang/String;)Ljava/nio/charset/Charset;']: (n) => { const o = mkSimple('Ljava/nio/charset/Charset;'); o.$name = String(n || 'UTF-8').toUpperCase(); return o; },
      ['defaultCharset()Ljava/nio/charset/Charset;']: () => { const o = mkSimple('Ljava/nio/charset/Charset;'); o.$name = 'UTF-8'; return o; },
      ['isSupported(Ljava/lang/String;)' + Z]: () => 1,
      ['availableCharsets()Ljava/util/SortedMap;']: () => ({ $c: R.klass('Ljava/util/TreeMap;'), $m: new Map() }),
    },
  });
  function bytesToUtf8(a) {
    const u8 = Uint8Array.from((a || []).map((x) => x & 0xff));
    try { return new TextDecoder('utf-8').decode(u8); } catch { return ''; }
  }
  function utf8Bytes(str) {
    const u8 = new TextEncoder().encode(String(str));
    return Array.from(u8);
  }
  function charBuffer(R, str) {
    const o = mkSimple('Ljava/nio/CharBuffer;');
    o.$s = String(str); o.$pos = 0;
    return o;
  }
  R.def('Ljava/nio/CharBuffer;', {
    access: 0x31, sup: 'Ljava/lang/Object;', ifaces: ['Ljava/lang/CharSequence;'],
    m: {
      ['toString()' + S]: (s) => s.$s || '',
      ['length()' + I]: (s) => (s.$s || '').length,
      ['charAt(I)' + C]: (s, i) => ((s.$s || '').charCodeAt(i | 0) || 0) & 0xffff,
      ['subSequence(II)Ljava/lang/CharSequence;']: (s, a, b) => charBuffer(R, (s.$s || '').slice(a | 0, b | 0)),
      ['remaining()' + I]: (s) => (s.$s || '').length - (s.$pos || 0),
      ['array()[C']: (s) => { const a = Array.from(s.$s || '').map((c) => c.charCodeAt(0) & 0xffff); a[ARR_CLASS] = R.klass('[C'); return a; },
      ['hasArray()' + Z]: () => 1,
    },
    sm: { ['wrap(Ljava/lang/CharSequence;)Ljava/nio/CharBuffer;']: (cs) => charBuffer(R, R.str(cs)), ['allocate(I)Ljava/nio/CharBuffer;']: (n) => charBuffer(R, '') },
  });
  R.def('Ljava/nio/charset/CharsetDecoder;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['decode(Ljava/nio/ByteBuffer;)Ljava/nio/CharBuffer;']: (s, bb) => charBuffer(R, bytesToUtf8(bb && bb.$a)),
      ['onMalformedInput(Ljava/nio/charset/CodingErrorAction;)Ljava/nio/charset/CharsetDecoder;']: (s) => s,
      ['onUnmappableCharacter(Ljava/nio/charset/CodingErrorAction;)Ljava/nio/charset/CharsetDecoder;']: (s) => s,
      ['charset()Ljava/nio/charset/Charset;']: (s) => s.$cs || mkSimple('Ljava/nio/charset/Charset;'),
    },
  });
  R.def('Ljava/nio/charset/CharsetEncoder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['encode(Ljava/nio/CharBuffer;)Ljava/nio/ByteBuffer;']: (s, cb) => { const out = utf8Bytes(cb && cb.$s); out[ARR_CLASS] = R.klass('[B'); const b = mkSimple('Ljava/nio/ByteBuffer;'); b.$a = out; return b; }, ['onMalformedInput(Ljava/nio/charset/CodingErrorAction;)Ljava/nio/charset/CharsetEncoder;']: (s) => s, ['onUnmappableCharacter(Ljava/nio/charset/CodingErrorAction;)Ljava/nio/charset/CharsetEncoder;']: (s) => s } });
  R.def('Ljava/nio/charset/CodingErrorAction;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Ljava/nio/charset/StandardCharsets;', { access: 0x31, sup: 'Ljava/lang/Object;' });
  for (const n of ['UTF_8', 'UTF_16', 'ISO_8859_1', 'US_ASCII']) {
    R.klass('Ljava/nio/charset/StandardCharsets;').statics['Ljava/nio/charset/StandardCharsets;->' + n + ':Ljava/nio/charset/Charset;'] = (() => { const o = mkSimple('Ljava/nio/charset/Charset;'); o.$name = n.replace('_', '-'); return o; })();
  }
  R.def('Ljava/lang/String;', { access: 0x31, sup: 'Ljava/lang/Object;', m: {
    ['getBytes(Ljava/nio/charset/Charset;)[B']: (s, cs) => { const out = utf8Bytes(s); out[ARR_CLASS] = R.klass('[B'); return out; },
  } });

  /* ---- getSystemService(Class) overload ---- */
  const CLASS_SERVICE = {
    'Landroid/app/ActivityManager;': 'activity', 'Landroid/os/Vibrator;': 'vibrator', 'Landroid/os/PowerManager;': 'power',
    'Landroid/net/ConnectivityManager;': 'connectivity', 'Landroid/location/LocationManager;': 'location',
    'Landroid/media/AudioManager;': 'audio', 'Landroid/view/WindowManager;': 'window', 'Landroid/view/inputmethod/InputMethodManager;': 'input_method',
    'Landroid/hardware/SensorManager;': 'sensor', 'Landroid/telephony/TelephonyManager;': 'telephony',
    'Landroid/app/NotificationManager;': 'notification', 'Landroid/content/ClipboardManager;': 'clipboard',
    'Landroid/os/UserManager;': 'user', 'Landroid/app/AlarmManager;': 'alarm', 'Landroid/app/job/JobScheduler;': 'jobscheduler',
    'Landroid/hardware/display/DisplayManager;': 'display', 'Landroid/os/storage/StorageManager;': 'storage',
  };
  R.def('Landroid/content/Context;', { access: 0x421, sup: 'Ljava/lang/Object;', m: {
    ['getSystemService(Ljava/lang/Class;)' + O]: (s, cls) => {
      const desc = cls && cls['Ljava/lang/Class;->desc:Ljava/lang/String;'];
      const name = CLASS_SERVICE[desc];
      return name ? R.iv('Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;', s, name) : null;
    },
  } });
  R.def('Landroid/app/Activity;', { access: 0x21, sup: 'Landroid/content/Context;', m: {
    ['getSystemService(Ljava/lang/Class;)' + O]: (s, cls) => R.iv('Landroid/content/Context;->getSystemService(Ljava/lang/Class;)Ljava/lang/Object;', s, cls),
  } });
  R.def('Landroid/os/storage/StorageManager;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ---- writers / crash-report path ---- */
  R.def('Ljava/io/Writer;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$t = ''; }, ['write(Ljava/lang/String;)' + V]: (s, x) => { s.$t = (s.$t || '') + x; }, ['write(I)' + V]: (s, c) => { s.$t = (s.$t || '') + String.fromCharCode(c & 0xffff); }, ['write([CII)' + V]: (s, a, o, l) => { s.$t = (s.$t || '') + charsToStrLocal(Array.prototype.slice.call(a || [], o, o + l)); }, ['append(Ljava/lang/CharSequence;)Ljava/io/Writer;']: (s, x) => { s.$t = (s.$t || '') + R.str(x); return s; }, ['append(C)Ljava/io/Writer;']: (s, c) => { s.$t = (s.$t || '') + String.fromCharCode(c & 0xffff); return s; }, ['flush()' + V]: () => {}, ['close()' + V]: (s) => { if (s.$sink) s.$sink(s.$t); } } });
  function charsToStrLocal(a) { let x = ''; for (const c of a) x += String.fromCharCode(c & 0xffff); return x; }
  R.def('Ljava/io/OutputStreamWriter;', { access: 0x21, sup: 'Ljava/io/Writer;', m: { ['<init>(Ljava/io/OutputStream;)' + V]: (s, o) => { s.$t = ''; s.$out = o; s.$sink = (t) => { if (o && o.$b) for (let i = 0; i < t.length; i++) o.$b.push(t.charCodeAt(i) & 0xff); if (o && o.$name) H.vfs.set(o.$name, (o.$b || []).slice()); }; }, ['<init>(Ljava/io/OutputStream;Ljava/lang/String;)' + V]: (s, o) => { R.id('Ljava/io/OutputStreamWriter;-><init>(Ljava/io/OutputStream;)V', s, o); }, ['<init>(Ljava/io/OutputStream;Ljava/nio/charset/Charset;)' + V]: (s, o) => { R.id('Ljava/io/OutputStreamWriter;-><init>(Ljava/io/OutputStream;)V', s, o); } } });
  R.def('Ljava/io/BufferedWriter;', { access: 0x21, sup: 'Ljava/io/Writer;', m: { ['<init>(Ljava/io/Writer;)' + V]: (s, w) => { s.$t = ''; s.$w = w; s.$sink = (t) => { if (w && w.$t !== undefined) w.$t += t; else if (w) R.iv('Ljava/io/Writer;->write(Ljava/lang/String;)V', w, t); }; }, ['<init>(Ljava/io/Writer;I)' + V]: (s, w) => { R.id('Ljava/io/BufferedWriter;-><init>(Ljava/io/Writer;)V', s, w); }, ['newLine()' + V]: (s) => { s.$t = (s.$t || '') + '\n'; } } });
  R.def('Ljava/io/PrintWriter;', {
    access: 0x21, sup: 'Ljava/io/Writer;',
    m: {
      ['<init>(Ljava/io/Writer;)' + V]: (s, w) => { s.$t = ''; s.$w = w; },
      ['<init>(Ljava/io/Writer;Z)' + V]: (s, w) => { s.$t = ''; s.$w = w; },
      ['<init>(Ljava/io/OutputStream;)' + V]: (s, o) => { s.$t = ''; s.$w = o; },
      ['<init>(Ljava/io/OutputStream;Z)' + V]: (s, o) => { s.$t = ''; s.$w = o; },
      ['<init>(Ljava/lang/String;)' + V]: (s, n) => { s.$t = ''; s.$name = String(n); },
      ['print(Ljava/lang/String;)' + V]: (s, x) => { s.$t = (s.$t || '') + R.str(x); },
      ['print(I)' + V]: (s, x) => { s.$t = (s.$t || '') + (x | 0); },
      ['print(J)' + V]: (s, x) => { s.$t = (s.$t || '') + x; },
      ['print(D)' + V]: (s, x) => { s.$t = (s.$t || '') + x; },
      ['print(F)' + V]: (s, x) => { s.$t = (s.$t || '') + x; },
      ['print(Z)' + V]: (s, x) => { s.$t = (s.$t || '') + (x ? 'true' : 'false'); },
      ['print(C)' + V]: (s, x) => { s.$t = (s.$t || '') + String.fromCharCode(x & 0xffff); },
      ['print(Ljava/lang/Object;)' + V]: (s, x) => { s.$t = (s.$t || '') + (x === null ? 'null' : R.str(x)); },
      ['println(Ljava/lang/String;)' + V]: (s, x) => { s.$t = (s.$t || '') + R.str(x) + '\n'; },
      ['println()' + V]: (s) => { s.$t = (s.$t || '') + '\n'; },
      ['println(I)' + V]: (s, x) => { s.$t = (s.$t || '') + (x | 0) + '\n'; },
      ['println(J)' + V]: (s, x) => { s.$t = (s.$t || '') + x + '\n'; },
      ['println(D)' + V]: (s, x) => { s.$t = (s.$t || '') + x + '\n'; },
      ['println(F)' + V]: (s, x) => { s.$t = (s.$t || '') + x + '\n'; },
      ['println(Z)' + V]: (s, x) => { s.$t = (s.$t || '') + (x ? 'true' : 'false') + '\n'; },
      ['println(C)' + V]: (s, x) => { s.$t = (s.$t || '') + String.fromCharCode(x & 0xffff) + '\n'; },
      ['println(Ljava/lang/Object;)' + V]: (s, x) => { s.$t = (s.$t || '') + (x === null ? 'null' : R.str(x)) + '\n'; },
      ['printf(Ljava/lang/String;[Ljava/lang/Object;)Ljava/io/PrintWriter;']: (s, f, a) => { s.$t = (s.$t || '') + javaFormatLocal(f, a); return s; },
      ['format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/io/PrintWriter;']: (s, f, a) => { s.$t = (s.$t || '') + javaFormatLocal(f, a); return s; },
      ['write(Ljava/lang/String;)' + V]: (s, x) => { s.$t = (s.$t || '') + x; },
      ['append(Ljava/lang/CharSequence;)Ljava/io/PrintWriter;']: (s, x) => { s.$t = (s.$t || '') + R.str(x); return s; },
      ['checkError()' + Z]: () => 0,
      ['flush()' + V]: (s) => flushWriter(R, s),
      ['close()' + V]: (s) => flushWriter(R, s),
    },
  });
  function flushWriter(R, s) {
    const t = s.$t || '';
    if (!t) return;
    s.$t = '';
    if (s.$name) { const cur = H.vfs.get(s.$name) || []; H.vfs.set(s.$name, cur.concat(Array.from(t).map((c) => c.charCodeAt(0) & 0xff))); return; }
    const w = s.$w;
    if (!w) { for (const line of t.split('\n')) if (line) H.log('I', 'System.out', line); return; }
    if (w.$t !== undefined) { w.$t += t; return; }
    if (w.$b) { for (let i = 0; i < t.length; i++) w.$b.push(t.charCodeAt(i) & 0xff); return; }
    try { R.iv('Ljava/io/Writer;->write(Ljava/lang/String;)V', w, t); } catch { /* ignore */ }
  }
  function javaFormatLocal(f, a) {
    let i = 0;
    return String(f).replace(/%(\d+\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (m, idx, fl, w, pr, cv) => {
      if (cv === '%') return '%';
      const arg = idx ? a[(parseInt(idx, 10) - 1) | 0] : a[i++];
      const val = arg && arg.$v !== undefined ? arg.$v : arg;
      switch (cv) {
        case 's': return val === null || val === undefined ? 'null' : String(typeof val === 'object' ? R.str(val) : val);
        case 'd': return String(Math.trunc(Number(val) || 0));
        case 'f': return Number(val || 0).toFixed(pr === undefined ? 6 : Number(pr));
        case 'e': return Number(val || 0).toExponential(pr === undefined ? 6 : Number(pr));
        case 'x': return (Math.trunc(Number(val) || 0) >>> 0).toString(16);
        case 'b': return String(!!val);
        case 'c': return String.fromCharCode(Number(val) || 0);
        case 'h': return (hashCodeOfLocal(val) >>> 0).toString(16);
        default: return m;
      }
    });
  }
  R.def('Ljava/lang/Throwable;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['printStackTrace(Ljava/io/PrintWriter;)' + V]: (s, pw) => {
      const lines = [`${R.classNameOf(s)}: ${R.messageOf(s)}`].concat((s.$stack || []).map((f) => '\tat ' + f));
      for (const l of lines) R.iv('Ljava/io/PrintWriter;->println(Ljava/lang/String;)V', pw, l);
    },
    ['printStackTrace(Ljava/io/PrintStream;)' + V]: (s, ps) => { R.iv('Ljava/lang/Throwable;->printStackTrace()V', s); },
    ['getStackTrace()[Ljava/lang/StackTraceElement;']: (s) => arr(R, '[Ljava/lang/StackTraceElement;', (s.$stack || []).map((f) => { const o = mkSimple('Ljava/lang/StackTraceElement;'); o.$name = f; return o; })),
    ['setStackTrace([Ljava/lang/StackTraceElement;)' + V]: () => {},
    ['fillInStackTrace()Ljava/lang/Throwable;']: (s) => s,
    ['getSuppressed()[Ljava/lang/Throwable;']: () => arr(R, '[Ljava/lang/Throwable;', []),
  } });
  R.def('Ljava/util/LinkedHashMap;', { access: 0x21, sup: 'Ljava/util/HashMap;', m: {
    ['<init>()' + V]: (s) => { s.$m = new Map(); },
    ['<init>(I)' + V]: (s) => { s.$m = new Map(); },
    ['<init>(IF)' + V]: (s) => { s.$m = new Map(); },
    ['<init>(IFZ)' + V]: (s) => { s.$m = new Map(); },
    ['<init>(Ljava/util/Map;)' + V]: (s, m) => { s.$m = new Map(m && m.$m ? m.$m : []); },
  } });
  R.def('Ljava/io/FileFilter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/FilenameFilter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/io/File;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['listFiles(Ljava/io/FileFilter;)[Ljava/io/File;']: (s, f) => {
      const all = R.iv('Ljava/io/File;->listFiles()[Ljava/io/File;', s) || [];
      if (!f) return all;
      const keep = all.filter((x) => { try { return R.iv('Ljava/io/FileFilter;->accept(Ljava/io/File;)Z', f, x); } catch { return true; } });
      keep[ARR_CLASS] = R.klass('[Ljava/io/File;');
      return keep;
    },
    ['listFiles(Ljava/io/FilenameFilter;)[Ljava/io/File;']: (s, f) => R.iv('Ljava/io/File;->listFiles(Ljava/io/FileFilter;)[Ljava/io/File;', s, f),
    ['list(Ljava/io/FilenameFilter;)[Ljava/lang/String;']: (s, f) => arr(R, '[Ljava/lang/String;', []),
  } });
  R.def('Landroid/app/ActivityManager$MemoryInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { const K = 'Landroid/app/ActivityManager$MemoryInfo;->'; s[K + 'availMem:J'] = 536870912; s[K + 'totalMem:J'] = 1073741824; s[K + 'threshold:J'] = 16777216; s[K + 'lowMemory:Z'] = 0; } } });
  R.def('Landroid/app/ActivityManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['isLowRamDevice()' + Z]: () => 0, ['getLargeMemoryClass()' + I]: () => 256, ['getMemoryClass()' + I]: () => 256, ['isBackgroundRestricted()' + Z]: () => 0 } });
  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getSystemUiVisibility()' + I]: (s) => (s.$sysUi || 0),
    ['setSystemUiVisibility(I)' + V]: (s, v) => { s.$sysUi = v | 0; },
    ['setImportantForAccessibility(I)' + V]: (s, v) => { s.$ifa = v | 0; },
    ['getImportantForAccessibility()' + I]: (s) => (s.$ifa || 0),
    ['setHasTransientState(Z)' + V]: () => {},
    ['hasTransientState()' + Z]: () => 0,
    ['setScrollContainer(Z)' + V]: () => {},
    ['isScrollContainer()' + Z]: () => 0,
    ['setOverScrollMode(I)' + V]: () => {},
    ['getOverScrollMode()' + I]: () => 0,
    ['setAccessibilityDelegate(Landroid/view/View$AccessibilityDelegate;)' + V]: () => {},
    ['announceForAccessibility(Ljava/lang/CharSequence;)' + V]: (s, t) => H.log('I', 'A11y', R.str(t)),
    ['setNextClusterForwardId(I)' + V]: () => {},
    ['addKeyboardNavigationClusters(Ljava/util/List;I)' + V]: () => {},
  } });
  R.def('Landroid/view/View$AccessibilityDelegate;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/os/Trace;', { access: 0x11, sup: 'Ljava/lang/Object;', sm: {
    ['beginSection(Ljava/lang/String;)' + V]: () => {}, ['endSection()' + V]: () => {},
    ['beginAsyncSection(Ljava/lang/String;I)' + V]: () => {}, ['endAsyncSection(Ljava/lang/String;I)' + V]: () => {},
    ['isEnabled()' + Z]: () => 0, ['traceCounter(Ljava/lang/String;I)' + V]: () => {},
  } });
  R.def('Landroid/os/Debug;', { access: 0x11, sup: 'Ljava/lang/Object;', sm: { ['startMethodTracing(Ljava/lang/String;)' + V]: () => {}, ['stopMethodTracing()' + V]: () => {}, ['isMethodTracingEnabled()' + Z]: () => 0, ['getNativeHeapAllocatedSize()' + J]: () => 16777216 } });

  /* ---- class loaders (crash reporters and DI frameworks require non-null) ---- */
  R.def('Ljava/lang/ClassLoader;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['loadClass(Ljava/lang/String;)Ljava/lang/Class;']: (s, n) => {
        const d = 'L' + String(n).replace(/\./g, '/') + ';';
        if (!R.classes.has(d)) throw R.newException('Ljava/lang/ClassNotFoundException;', String(n));
        return R.classObject(d);
      },
      ['getResource(Ljava/lang/String;)Ljava/net/URL;']: (s, n) => (H.zip && H.zip.has(String(n)) ? { $c: R.klass('Ljava/net/URL;'), $u: 'file:///' + n } : null),
      ['getResources(Ljava/lang/String;)Ljava/util/Enumeration;']: () => ({ $c: R.klass('Ljava/util/Enumeration;'), $list: [], $i: 0 }),
      ['getResourceAsStream(Ljava/lang/String;)Ljava/io/InputStream;']: (s, n) => {
        if (H.zip && H.zip.has(String(n))) { const o = mkSimple('Ljava/io/ByteArrayInputStream;'); const b = Array.from(H.zip.dataSync(String(n))); b[ARR_CLASS] = R.klass('[B'); o.$b = b; o.$p = 0; return o; }
        return null;
      },
      ['getParent()Ljava/lang/ClassLoader;']: (s) => s,
      ['getName()' + S]: (s) => s.$name || 'dex2web.PathClassLoader',
      ['toString()' + S]: (s) => (s.$name || 'dalvik.system.PathClassLoader') + '[Dex2Web]',
    },
  });
  R.def('Ljava/lang/Class;', { access: 0x31, sup: 'Ljava/lang/Object;', m: {
    ['getClassLoader()Ljava/lang/ClassLoader;']: (s) => H.classLoader(),
  } });
  R.def('Landroid/content/Context;', { access: 0x421, sup: 'Ljava/lang/Object;', m: {
    ['getClassLoader()Ljava/lang/ClassLoader;']: () => H.classLoader(),
  } });
  R.def('Landroid/app/Activity;', { access: 0x21, sup: 'Landroid/content/Context;', m: {
    ['getClassLoader()Ljava/lang/ClassLoader;']: () => H.classLoader(),
  } });
  R.def('Ljava/util/Enumeration;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ldalvik/system/PathClassLoader;', { access: 0x21, sup: 'Ljava/lang/ClassLoader;' });
  R.def('Ldalvik/system/BaseDexClassLoader;', { access: 0x21, sup: 'Ljava/lang/ClassLoader;' });

  /* ---- java.util.regex over JS RegExp ---- */
  const reOf = (p, flags) => { try { return new RegExp(javaRegexToJs(p), flags || ''); } catch { return null; } };
  function javaRegexToJs(p) {
    return String(p)
      .replace(/\\d\{0,\}/g, '\\d*')
      .replace(/\(\?<([A-Za-z][A-Za-z0-9]*)>/g, '(?$1>')   // named groups: same syntax in JS
      .replace(/\(\?=[^)]*\)/g, (m) => m)                 // lookahead identical
      ;
  }
  R.def('Ljava/util/regex/Pattern;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['matcher(Ljava/lang/CharSequence;)Ljava/util/regex/Matcher;']: (s, cs) => matcher(R, s, R.str(cs)),
      ['pattern()' + S]: (s) => s.$p,
      ['split(Ljava/lang/CharSequence;)[Ljava/lang/String;']: (s, cs) => arr(R, '[Ljava/lang/String;', String(R.str(cs)).split(s.$re || / /)),
      ['split(Ljava/lang/CharSequence;I)[Ljava/lang/String;']: (s, cs, l) => arr(R, '[Ljava/lang/String;', String(R.str(cs)).split(s.$re || / /).slice(0, l | 0 || undefined)),
      ['matches(Ljava/lang/CharSequence;)' + Z]: (s, cs) => BOOL(s.$re ? s.$re.test(R.str(cs)) : false),
      ['toString()' + S]: (s) => s.$p,
      ['flags()' + I]: (s) => s.$f || 0,
    },
    sm: {
      ['compile(Ljava/lang/String;)Ljava/util/regex/Pattern;']: (p) => pattern(R, String(p), 0),
      ['compile(Ljava/lang/String;I)Ljava/util/regex/Pattern;']: (p, f) => pattern(R, String(p), f | 0),
      ['matches(Ljava/lang/String;Ljava/lang/CharSequence;)' + Z]: (p, cs) => { const re = reOf(p, ''); return BOOL(re ? re.test(R.str(cs)) : false); },
      ['quote(Ljava/lang/String;)Ljava/lang/String;']: (p) => String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    },
  });
  function pattern(R, p, f) {
    const o = mkSimple('Ljava/util/regex/Pattern;');
    o.$p = p; o.$f = f;
    const flags = (f & 0x02) ? 'i' : '';
    o.$re = reOf(p, flags);
    o.$g = reOf(p, flags + 'g');
    return o;
  }
  function matcher(R, pat, str) {
    const o = mkSimple('Ljava/util/regex/Matcher;');
    o.$pat = pat; o.$s = str; o.$i = 0; o.$m = null; o.$last = -1;
    return o;
  }
  R.def('Ljava/util/regex/Matcher;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['matches()' + Z]: (s) => { const re = s.$pat.$re; if (!re) return 0; re.lastIndex = 0; const m = re.exec(s.$s); const ok = BOOL(m && m[0] === s.$s); if (ok) s.$m = m; return ok; },
      ['lookingAt()' + Z]: (s) => { const re = new RegExp('^(?:' + (s.$pat.$p || '') + ')', (s.$pat.$f & 0x02) ? 'i' : ''); const m = re.exec(s.$s); s.$m = m; return BOOL(!!m); },
      ['find()' + Z]: (s) => { const g = s.$pat.$g || (s.$pat.$g = reOf(s.$pat.$p, 'g' + ((s.$pat.$f & 0x02) ? 'i' : ''))); if (!g) return 0; if (s.$last === -1) g.lastIndex = 0; else g.lastIndex = s.$last; const m = g.exec(s.$s); if (!m) { s.$m = null; s.$last = -1; return 0; } if (m[0] === '') g.lastIndex++; s.$m = m; s.$last = g.lastIndex; return 1; },
      ['find(I)' + Z]: (s, from) => { const g = s.$pat.$g || (s.$pat.$g = reOf(s.$pat.$p, 'g' + ((s.$pat.$f & 0x02) ? 'i' : ''))); if (!g) return 0; g.lastIndex = from | 0; const m = g.exec(s.$s); if (!m) { s.$m = null; return 0; } if (m[0] === '') g.lastIndex++; s.$m = m; s.$last = g.lastIndex; return 1; },
      ['group()' + S]: (s) => (s.$m ? s.$m[0] : null),
      ['group(I)' + S]: (s, i) => (s.$m && s.$m[i | 0] !== undefined ? s.$m[i | 0] : null),
      ['group(Ljava/lang/String;)' + S]: (s, n) => (s.$m && s.$m.groups ? s.$m.groups[String(n)] : null),
      ['groupCount()' + I]: (s) => (s.$m ? Math.max(0, s.$m.length - 1) : 0),
      ['start()' + I]: (s) => (s.$m ? s.$m.index | 0 : -1),
      ['start(I)' + I]: (s) => (s.$m ? s.$m.index | 0 : -1),
      ['end()' + I]: (s) => (s.$m ? (s.$m.index + s.$m[0].length) | 0 : -1),
      ['end(I)' + I]: (s) => (s.$m ? (s.$m.index + s.$m[0].length) | 0 : -1),
      ['replaceAll(Ljava/lang/String;)' + S]: (s, rep) => { const g = reOf(s.$pat.$p, 'g' + ((s.$pat.$f & 0x02) ? 'i' : '')); return g ? s.$s.replace(g, jsReplacement(rep)) : s.$s; },
      ['replaceFirst(Ljava/lang/String;)' + S]: (s, rep) => { const r = reOf(s.$pat.$p, (s.$pat.$f & 0x02) ? 'i' : ''); return r ? s.$s.replace(r, jsReplacement(rep)) : s.$s; },
      ['reset()' + O]: (s) => { s.$last = -1; s.$m = null; return s; },
      ['reset(Ljava/lang/CharSequence;)' + O]: (s, cs) => { s.$s = R.str(cs); s.$last = -1; s.$m = null; return s; },
      ['usePattern(Ljava/util/regex/Pattern;)Ljava/util/regex/Matcher;']: (s, p) => { s.$pat = p; s.$last = -1; return s; },
      ['pattern()Ljava/util/regex/Pattern;']: (s) => s.$pat,
      ['hasMatch()' + Z]: (s) => R.iv('Ljava/util/regex/Matcher;->find()Z', s),
      ['toMatchResult()Ljava/util/regex/MatchResult;']: (s) => s,
    },
  });
  function jsReplacement(rep) {
    return String(rep).replace(/\$(\d)/g, (m, n) => '$' + n).replace(/\$\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, n) => '$<' + n + '>');
  }
  R.def('Ljava/util/regex/MatchResult;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Ljava/util/regex/PatternSyntaxException;', { access: 0x21, sup: 'Ljava/lang/IllegalArgumentException;' });
  R.def('Ljava/lang/Character;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: {
    ['isSpaceChar(C)' + Z]: (c) => BOOL(/\s/.test(String.fromCharCode(c & 0xffff))),
    ['isWhitespace(C)' + Z]: (c) => BOOL(/\s/.test(String.fromCharCode(c & 0xffff))),
    ['isJavaIdentifierStart(C)' + Z]: (c) => BOOL(/[A-Za-z_$]/.test(String.fromCharCode(c & 0xffff))),
    ['isJavaIdentifierPart(C)' + Z]: (c) => BOOL(/[A-Za-z0-9_$]/.test(String.fromCharCode(c & 0xffff))),
    ['toChars(I)[C']: (cp) => arr(R, '[C', Array.from(String.fromCodePoint(cp >>> 0)).map((x) => x.charCodeAt(0) & 0xffff)),
    ['codePointAt(Ljava/lang/CharSequence;I)' + I]: (cs, i) => (R.str(cs).codePointAt(i | 0) || 0) | 0,
    ['codePointCount(Ljava/lang/CharSequence;II)' + I]: (cs, a, b) => { const t = R.str(cs).slice(a | 0, b | 0); let n = 0; for (const _ of t) n++; return n; },
  } });
  R.def('Ljava/util/Collection;', { access: 0x601, sup: 'Ljava/lang/Iterable;', m: {
    ['toArray([Ljava/lang/Object;)[Ljava/lang/Object;']: (s, target) => {
      const src = (s && s.$a) || (s && s.$m ? [...s.$m.values()].map((e) => e.v) : []);
      const out = target && target.length >= src.length ? target : (() => { const a = new Array(src.length); a[ARR_CLASS] = target ? target[ARR_CLASS] : R.klass('[Ljava/lang/Object;'); return a; })();
      for (let i = 0; i < src.length; i++) out[i] = src[i];
      if (out.length > src.length) out[src.length] = null;
      return out;
    },
  } });

  R.def('Landroid/view/accessibility/AccessibilityManager;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['isEnabled()' + Z]: () => 0,
      ['isTouchExplorationEnabled()' + Z]: () => 0,
      ['addAccessibilityStateChangeListener(Landroid/view/accessibility/AccessibilityManager$AccessibilityStateChangeListener;)' + Z]: () => 1,
      ['removeAccessibilityStateChangeListener(Landroid/view/accessibility/AccessibilityManager$AccessibilityStateChangeListener;)' + Z]: () => 1,
      ['getEnabledAccessibilityServiceList(I)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['getInstalledAccessibilityServiceList()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['sendAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)' + V]: () => {},
    },
    sm: {},
  });
  R.def('Landroid/view/accessibility/AccessibilityManager$AccessibilityStateChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/accessibility/AccessibilityEvent;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/accessibilityservice/AccessibilityService;', { access: 0x421, sup: 'Landroid/app/Service;' });

  R.def('Ljava/util/concurrent/CancellationException;', { access: 0x21, sup: 'Ljava/lang/IllegalStateException;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; }, ['<init>(Ljava/lang/Throwable;)' + V]: (s, t) => { s.$cause = t; } } });
  R.def('Ljava/util/concurrent/TimeoutException;', { access: 0x21, sup: 'Ljava/lang/Exception;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; } } });
  R.def('Ljava/util/concurrent/ExecutionException;', { access: 0x21, sup: 'Ljava/lang/Exception;', m: { ['<init>()' + V]: () => {}, ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; }, ['<init>(Ljava/lang/Throwable;)' + V]: (s, t) => { s.$cause = t; } } });
  R.def('Ljava/lang/Thread;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['setContextClassLoader(Ljava/lang/ClassLoader;)' + V]: (s, c) => { s.$ccl = c; },
    ['getContextClassLoader()Ljava/lang/ClassLoader;']: (s) => s.$ccl || H.classLoader(),
  } });
  R.def('Ljava/util/concurrent/atomic/AtomicIntegerFieldUpdater;', { access: 0x421, sup: 'Ljava/lang/Object;', m: {
    ['decrementAndGet(' + O + ')' + I]: (s, o) => (o && s.$key ? --o[s.$key] : 0),
    ['getAndDecrement(' + O + ')' + I]: (s, o) => (o && s.$key ? o[s.$key]-- : 0),
    ['incrementAndGet(' + O + ')' + I]: (s, o) => (o && s.$key ? ++o[s.$key] : 0),
    ['getAndIncrement(' + O + ')' + I]: (s, o) => (o && s.$key ? o[s.$key]++ : 0),
    ['get(' + O + ')' + I]: (s, o) => (o && s.$key ? o[s.$key] | 0 : 0),
    ['set(' + O + I + ')' + V]: (s, o, v) => { if (o && s.$key) o[s.$key] = v | 0; },
    ['compareAndSet(' + O + I + I + ')' + Z]: (s, o, e, n) => { if (!o || !s.$key) return 0; if ((o[s.$key] | 0) === (e | 0)) { o[s.$key] = n | 0; return 1; } return 0; },
  } });
  R.def('Ljava/util/concurrent/atomic/AtomicBoolean;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['compareAndSet(ZZ)' + Z]: (s, e, n) => { const cur = s.$v ? 1 : 0; if (cur === (e ? 1 : 0)) { s.$v = n ? 1 : 0; return 1; } return 0; },
    ['weakCompareAndSet(ZZ)' + Z]: (s, e, n) => { const cur = s.$v ? 1 : 0; if (cur === (e ? 1 : 0)) { s.$v = n ? 1 : 0; return 1; } return 0; },
    ['getAndSet(Z)' + Z]: (s, n) => { const o = s.$v ? 1 : 0; s.$v = n ? 1 : 0; return o; },
    ['compareAndExchange(ZZ)' + Z]: (s, e, n) => { const cur = s.$v ? 1 : 0; if (cur === (e ? 1 : 0)) s.$v = n ? 1 : 0; return cur; },
  } });
  R.def('Ljava/util/concurrent/atomic/AtomicReference;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getAndUpdate(Ljava/util/function/UnaryOperator;)' + O]: (s, f) => { const o = s.$v; s.$v = R.iv('Ljava/util/function/UnaryOperator;->apply(Ljava/lang/Object;)Ljava/lang/Object;', f, o); return o; },
    ['updateAndGet(Ljava/util/function/UnaryOperator;)' + O]: (s, f) => { s.$v = R.iv('Ljava/util/function/UnaryOperator;->apply(Ljava/lang/Object;)Ljava/lang/Object;', f, s.$v); return s.$v; },
    ['compareAndExchange(' + O + O + ')' + O]: (s, e, n) => { const o = s.$v; if (o === e) s.$v = n; return o; },
  } });
  R.def('Ljava/util/SparseArray;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['<init>()' + V]: (s) => { s.$m = new Map(); }, ['<init>(I)' + V]: (s) => { s.$m = new Map(); },
    ['put(ILjava/lang/Object;)' + V]: (s, k, v) => { s.$m.set(k | 0, v); },
    ['get(I)Ljava/lang/Object;']: (s, k) => (s.$m.has(k | 0) ? s.$m.get(k | 0) : null),
    ['get(ILjava/lang/Object;)Ljava/lang/Object;']: (s, k, d) => (s.$m.has(k | 0) ? s.$m.get(k | 0) : d),
    ['remove(I)' + V]: (s, k) => { s.$m.delete(k | 0); }, ['delete(I)' + V]: (s, k) => { s.$m.delete(k | 0); },
    ['size()' + I]: (s) => s.$m.size, ['keyAt(I)' + I]: (s, i) => [...s.$m.keys()][i | 0] | 0,
    ['valueAt(I)Ljava/lang/Object;']: (s, i) => ([...s.$m.values()][i | 0] || null),
    ['indexOfKey(I)' + I]: (s, k) => [...s.$m.keys()].indexOf(k | 0),
    ['clear()' + V]: (s) => s.$m.clear(),
    ['append(ILjava/lang/Object;)' + V]: (s, k, v) => { s.$m.set(k | 0, v); },
    ['clone()Ljava/lang/Object;']: (s) => { const o = mkSimple('Landroid/util/SparseArray;'); o.$m = new Map(s.$m); return o; },
  } });
  for (const [cls, vt, getter] of [['SparseBooleanArray', 'Z', (v) => (v ? 1 : 0)], ['SparseIntArray', 'I', (v) => v | 0], ['SparseLongArray', 'J', (v) => Number(v)], ['LongSparseArray', 'O', (v) => v]]) {
    R.def('Landroid/util/' + cls + ';', {
      access: 0x21, sup: 'Ljava/lang/Object;',
      m: {
        ['<init>()' + V]: (s) => { s.$m = new Map(); }, ['<init>(I)' + V]: (s) => { s.$m = new Map(); },
        ['put(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt) + ')' + V]: (s, k, v) => { s.$m.set(Number(k), getter(v)); },
        ['get(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ')' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt)]: (s, k) => { const v = s.$m.get(Number(k)); return v === undefined ? (vt === 'Z' || vt === 'I' ? 0 : vt === 'J' ? 0 : null) : v; },
        ['get(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ',' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt) + ')' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt)]: (s, k, d) => { const v = s.$m.get(Number(k)); return v === undefined ? d : v; },
        ['delete(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ')' + V]: (s, k) => { s.$m.delete(Number(k)); },
        ['remove(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ')' + V]: (s, k) => { s.$m.delete(Number(k)); },
        ['size()' + I]: (s) => s.$m.size,
        ['keyAt(I)' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt)]: (s, i) => Number([...s.$m.keys()][i | 0] || 0),
        ['valueAt(' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt) + ')' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt)]: () => 0,
        ['clear()' + V]: (s) => s.$m.clear(),
        ['append(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ',' + (vt === 'O' ? 'Ljava/lang/Object;' : vt === 'Z' ? 'Z' : vt) + ')' + V]: (s, k, v) => { s.$m.set(Number(k), getter(v)); },
        ['indexOfKey(' + (vt === 'O' ? 'J' : vt === 'Z' ? 'I' : vt) + ')' + I]: (s, k) => [...s.$m.keys()].indexOf(Number(k)),
      },
    });
  }
  // fix the valueAt signature for typed variants (generated above with swapped params)
  for (const cls of ['SparseBooleanArray', 'SparseIntArray', 'SparseLongArray', 'LongSparseArray']) {
    const c = R.klass('Landroid/util/' + cls + ';');
    for (const sig of [...c.methods.keys()]) if (sig.startsWith('valueAt(') && sig.includes('Ljava/lang/Object;') === false && sig !== 'valueAt(I)Ljava/lang/Object;') { /* keep */ }
  }

  /* ================= graphics core: RenderNode / Matrix / Path / shaders ====
   * This is the surface Compose (and custom view drawing) terminates in:
   * display-list recording via RenderNode.beginRecording(), 3x3 matrices,
   * vector paths and gradient shaders, all mapped onto Canvas2D. */
  const newCanvas2d = (w, h) => {
    if (typeof document === 'undefined') return { canvas: { width: w, height: h } };
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    return c.getContext('2d');
  };
  R.def('Landroid/graphics/RenderNode;', {
    access: 0x31, sup: 'Ljava/lang/Object;',
    m: {
      ['beginRecording(II)Landroid/graphics/RecordingCanvas;']: (s, w, h) => {
        s.$w = w | 0; s.$h = h | 0;
        s.$ctx = newCanvas2d(w, h);
        const c = mkSimple('Landroid/graphics/RecordingCanvas;');
        c.$ctx = s.$ctx; c.$el = s.$ctx && s.$ctx.canvas; c.$owner = s;
        return c;
      },
      ['beginRecording()Landroid/graphics/RecordingCanvas;']: (s) => R.iv('Landroid/graphics/RenderNode;->beginRecording(II)Landroid/graphics/RecordingCanvas;', s, s.$w || 1, s.$h || 1),
      ['endRecording()' + V]: (s) => { s.$valid = true; },
      ['hasDisplayList()' + Z]: (s) => BOOL(!!s.$valid),
      ['isValid()' + Z]: (s) => BOOL(!!s.$valid),
      ['discardDisplayList()' + Z]: (s) => { s.$valid = false; return 1; },
      ['setBounds(IIII)' + Z]: (s, l, t, r, b) => { s.$l = l; s.$t = t; s.$w = r - l; s.$h = b - t; return 1; },
      ['setLeftTopRightBottom(IIII)' + Z]: (s, l, t, r, b) => R.iv('Landroid/graphics/RenderNode;->setBounds(IIII)Z', s, l, t, r, b),
      ['setPosition(IIII)' + Z]: (s, l, t, r, b) => R.iv('Landroid/graphics/RenderNode;->setBounds(IIII)Z', s, l, t, r, b),
      ['setAlpha(F)' + Z]: (s, a) => { s.$alpha = a; return 1; },
      ['setTranslationX(F)' + Z]: (s, v) => { s.$tx = v; return 1; },
      ['setTranslationY(F)' + Z]: (s, v) => { s.$ty = v; return 1; },
      ['setTranslationX(F)' + Z]: (s, v) => { s.$tx = v; return 1; },
      ['setScaleX(F)' + Z]: (s, v) => { s.$sx = v; return 1; },
      ['setScaleY(F)' + Z]: (s, v) => { s.$sy = v; return 1; },
      ['setRotationX(F)' + Z]: () => 1, ['setRotationY(F)' + Z]: () => 1,
      ['setRotation(F)' + Z]: (s, v) => { s.$rot = v; return 1; },
      ['setCameraDistance(F)' + Z]: () => 1,
      ['setElevation(F)' + Z]: (s, v) => { s.$elev = v; return 1; },
      ['setClipToBounds(Z)' + Z]: (s, v) => { s.$clip = !!v; return 1; },
      ['setOutline(Landroid/graphics/Outline;)' + Z]: () => 1,
      ['setHasOverlappingRendering()' + Z]: () => 1,
      ['getWidth()' + I]: (s) => s.$w || 0, ['getHeight()' + I]: (s) => s.$h || 0,
      ['getLeft()' + I]: (s) => s.$l || 0, ['getTop()' + I]: (s) => s.$t || 0,
    },
    sm: {
      ['create(Ljava/lang/String;)Landroid/graphics/RenderNode;']: (n) => { const o = mkSimple('Landroid/graphics/RenderNode;'); o.$name = n; return o; },
    },
  });
  R.def('Landroid/graphics/RecordingCanvas;', { access: 0x21, sup: 'Landroid/graphics/Canvas;' });
  R.def('Landroid/graphics/Canvas;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['drawRenderNode(Landroid/graphics/RenderNode;)' + V]: (s, rn) => {
        const ctx = s.$ctx; if (!ctx || !rn || !rn.$ctx) return;
        ctx.save();
        ctx.globalAlpha *= (rn.$alpha === undefined ? 1 : rn.$alpha);
        const parts = [];
        if (rn.$tx || rn.$ty) parts.push(`translate(${rn.$tx || 0}px, ${rn.$ty || 0}px)`);
        if (rn.$rot) parts.push(`rotate(${rn.$rot}deg)`);
        if (rn.$sx !== undefined || rn.$sy !== undefined) parts.push(`scale(${rn.$sx === undefined ? 1 : rn.$sx}, ${rn.$sy === undefined ? 1 : rn.$sy})`);
        if (parts.length && ctx.transform) { /* use DOM transform string where supported */ }
        if (rn.$tx || rn.$ty) ctx.translate(rn.$tx || 0, rn.$ty || 0);
        if (rn.$rot) ctx.rotate(rn.$rot * Math.PI / 180);
        if (rn.$sx !== undefined || rn.$sy !== undefined) ctx.scale(rn.$sx === undefined ? 1 : rn.$sx, rn.$sy === undefined ? 1 : rn.$sy);
        if (rn.$clip) ctx.beginPath();
        try { ctx.drawImage(rn.$ctx.canvas, rn.$l || 0, rn.$t || 0); } catch { /* not decoded yet */ }
        ctx.restore();
      },
      ['saveLayer(FFFFLandroid/graphics/Paint;)' + I]: (s) => { if (s.$ctx) s.$ctx.save(); return 1; },
      ['saveLayer(FFFFLandroid/graphics/Paint;I)' + I]: (s) => { if (s.$ctx) s.$ctx.save(); return 1; },
      ['saveLayerAlpha(FFFFI)' + I]: (s) => { if (s.$ctx) s.$ctx.save(); return 1; },
      ['saveLayerAlpha(FFFFII)' + I]: (s) => { if (s.$ctx) s.$ctx.save(); return 1; },
      ['clipRect(FFFF)' + Z]: (s, l, t, r, b) => { const c = s.$ctx; if (c) { c.beginPath(); c.rect(l, t, r - l, b - t); c.clip(); } return 1; },
      ['clipRect(IIII)' + Z]: (s, l, t, r, b) => R.iv('Landroid/graphics/Canvas;->clipRect(FFFF)Z', s, l, t, r, b),
      ['clipRect(Landroid/graphics/Rect;)' + Z]: (s, r) => r ? R.iv('Landroid/graphics/Canvas;->clipRect(FFFF)Z', s, r.$l, r.$t, r.$r, r.$b) : 1,
      ['clipRect(Landroid/graphics/RectF;)' + Z]: (s, r) => r ? R.iv('Landroid/graphics/Canvas;->clipRect(FFFF)Z', s, r.$l, r.$t, r.$r, r.$b) : 1,
      ['clipOutRect(FFFF)' + Z]: () => 1,
      ['clipPath(Landroid/graphics/Path;)' + Z]: (s, p) => { const c = s.$ctx; if (c && p) { c.save(); c.clip(pathToPath2D(p)); } return 1; },
      ['clipOutPath(Landroid/graphics/Path;)' + Z]: () => 1,
      ['setMatrix(Landroid/graphics/Matrix;)' + V]: (s, m) => { const c = s.$ctx; if (c && m && m.$v) c.setTransform(m.$v[0], m.$v[1], m.$v[3], m.$v[4], m.$v[2], m.$v[5]); },
      ['getMatrix(Landroid/graphics/Matrix;)' + V]: (s, m) => { if (m) m.$v = m.$v || [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
      ['concat(Landroid/graphics/Matrix;)' + V]: (s, m) => { const c = s.$ctx; if (c && m && m.$v) c.transform(m.$v[0], m.$v[1], m.$v[3], m.$v[4], m.$v[2], m.$v[5]); },
      ['drawRoundRect(FFFFFFLandroid/graphics/Paint;)' + V]: (s, l, t, r, b, rx, ry, p) => { const c = s.$ctx; if (!c) return; applyPaintLocal(c, p); c.beginPath(); if (c.roundRect) c.roundRect(l, t, r - l, b - t, rx); else c.rect(l, t, r - l, b - t); (p && p.$style && p.$style.$name === 'STROKE') ? c.stroke() : c.fill(); },
      ['drawRoundRect(Landroid/graphics/RectF;FFLandroid/graphics/Paint;)' + V]: (s, rf, rx, ry, p) => rf ? R.iv('Landroid/graphics/Canvas;->drawRoundRect(FFFFFFLandroid/graphics/Paint;)V', s, rf.$l, rf.$t, rf.$r, rf.$b, rx, ry, p) : undefined,
      ['drawArc(FFFFZZLandroid/graphics/Paint;)' + V]: (s, l, t, r, b, sa, sw, uc, p) => { const c = s.$ctx; if (!c) return; applyPaintLocal(c, p); c.beginPath(); c.ellipse((l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2, 0, sa * Math.PI / 180, (sa + sw) * Math.PI / 180, !uc); (p && p.$style && p.$style.$name === 'STROKE') ? c.stroke() : c.fill(); },
      ['drawPath(Landroid/graphics/Path;Landroid/graphics/Paint;)' + V]: (s, p, pt) => { const c = s.$ctx; if (!c || !p) return; applyPaintLocal(c, pt); const p2 = pathToPath2D(p); (pt && pt.$style && pt.$style.$name === 'STROKE') ? c.stroke(p2) : c.fill(p2); },
      ['drawBitmap(Landroid/graphics/Bitmap;FFLandroid/graphics/Paint;)' + V]: (s, b, x, y, p) => { const c = s.$ctx; if (!c || !b || !b.$img) return; c.drawImage(b.$img, x, y); },
      ['drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/RectF;Landroid/graphics/Paint;)' + V]: (s, b, src, dst, p) => { const c = s.$ctx; if (!c || !b || !b.$img || !dst) return; try { c.drawImage(b.$img, src ? src.$l : 0, src ? src.$t : 0, src ? (src.$r - src.$l) : b.$w, src ? (src.$b - src.$t) : b.$h, dst.$l, dst.$t, dst.$r - dst.$l, dst.$b - dst.$t); } catch { /* not decoded */ } },
      ['drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/Rect;Landroid/graphics/Paint;)' + V]: (s, b, src, dst, p) => R.iv('Landroid/graphics/Canvas;->drawBitmap(Landroid/graphics/Bitmap;Landroid/graphics/Rect;Landroid/graphics/RectF;Landroid/graphics/Paint;)V', s, b, src, dst ? rectFOf(dst) : null, p),
      ['drawBitmap([IIII Landroid/graphics/Rect;Landroid/graphics/Rect;ZLandroid/graphics/Paint;)'.replace(' ', '') + V]: () => {},
      ['drawGlyphs([II[Landroid/graphics/Point;ILandroid/graphics/Font;Landroid/graphics/Paint;)' + V]: () => {},
      ['drawTextRun(Ljava/lang/CharSequence;IIIIFFZLandroid/graphics/Paint;)' + V]: (s, t, a, b, c2, d, x, y, h, p) => { const ctx = s.$ctx; if (!ctx) return; applyPaintLocal(ctx, p); ctx.fillText(String(R.str(t)).slice(a, b), x, y); },
      ['drawText([CIIFFLandroid/graphics/Paint;)' + V]: (s, ch, a, b, x, y, p) => { const ctx = s.$ctx; if (!ctx) return; applyPaintLocal(ctx, p); ctx.fillText(charsLocal(ch, a, b), x, y); },
      ['enableZ()' + V]: () => {}, ['disableZ()' + V]: () => {},
      ['isHardwareAccelerated()' + Z]: () => 0,
      ['setBitmap(Landroid/graphics/Bitmap;)' + V]: (s, b) => { s.$ctx = b && b.$ctx ? b.$ctx : s.$ctx; s.$bmp = b; },
      ['getMaximumBitmapWidth()' + I]: (s) => (s.$ctx ? s.$ctx.canvas.width : 4096),
      ['getMaximumBitmapHeight()' + I]: (s) => (s.$ctx ? s.$ctx.canvas.height : 4096),
    },
  });
  function pathToPath2D(p) {
    const P2 = (typeof Path2D !== 'undefined') ? Path2D : null;
    if (!P2) return null;
    const out = new P2();
    for (const op of (p.$ops || [])) {
      switch (op[0]) {
        case 'M': out.moveTo(op[1], op[2]); break;
        case 'L': out.lineTo(op[1], op[2]); break;
        case 'Q': out.quadraticCurveTo(op[1], op[2], op[3], op[4]); break;
        case 'C': out.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]); break;
        case 'Z': out.closePath(); break;
        case 'R': out.rect(op[1], op[2], op[3], op[4]); break;
        case 'RR': if (out.roundRect) out.roundRect(op[1], op[2], op[3], op[4], op[5] || 0); else out.rect(op[1], op[2], op[3], op[4]); break;
        case 'O': out.moveTo(op[1] + op[3], op[2]); out.arc(op[1], op[2], op[3], 0, Math.PI * 2); break;
        case 'E': out.ellipse(op[1] + op[3] / 2, op[2] + op[4] / 2, op[3] / 2, op[4] / 2, 0, 0, Math.PI * 2); break;
        case 'A': {
          const cx = (op[1] + op[3]) / 2, cy = (op[2] + op[4]) / 2;
          const rx = (op[3] - op[1]) / 2, ry = (op[4] - op[2]) / 2;
          const sa = op[5] * Math.PI / 180, sw = op[6] * Math.PI / 180;
          out.ellipse(cx, cy, Math.abs(rx) || 0.01, Math.abs(ry) || 0.01, 0, sa, sa + sw);
          break;
        }
      }
    }
    return out;
  }
  function rectFOf(r) { const o = mkSimple('Landroid/graphics/RectF;'); o.$l = r.$l; o.$t = r.$t; o.$r = r.$r; o.$b = r.$b; return o; }
  function charsLocal(ch, a, b) { let x = ''; for (let i = a; i < b && i < ch.length; i++) x += String.fromCharCode(ch[i] & 0xffff); return x; }
  function applyPaintLocal(ctx, p) {
    if (!p) { ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; return; }
    const col = p.$color === undefined ? 0xff000000 : p.$color;
    const css = argbCssLocal(col);
    ctx.fillStyle = p.$shader ? shaderOf(ctx, p.$shader) || css : css;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = p.$w === undefined ? 1 : p.$w;
    ctx.font = `${p.$style && p.$style.$name === 'BOLD' ? 'bold ' : ''}${p.$size === undefined ? 12 : p.$size}px system-ui, sans-serif`;
    if (p.$pathEffect) { try { ctx.setLineDash(p.$pathEffect.$dash || []); } catch {} }
  }
  function argbCssLocal(c) {
    const a = (c >>> 24) & 0xff, r = (c >>> 16) & 0xff, g = (c >>> 8) & 0xff, b = c & 0xff;
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  }
  function shaderOf(ctx, sh) {
    try {
      if (sh.$kind === 'linear') { const g = ctx.createLinearGradient(sh.$x0, sh.$y0, sh.$x1, sh.$y1); addStops(g, sh.$colors); return g; }
      if (sh.$kind === 'radial') { const g = ctx.createRadialGradient(sh.$x, sh.$y, 0, sh.$x, sh.$y, sh.$r); addStops(g, sh.$colors); return g; }
      if (sh.$kind === 'sweep') { const g = ctx.createConicGradient ? ctx.createConicGradient(0, sh.$x, sh.$y) : null; if (g) addStops(g, sh.$colors); return g; }
      if (sh.$kind === 'bitmap' && sh.$bmp && sh.$bmp.$img) { const p = ctx.createPattern(sh.$bmp.$img, 'repeat'); return p; }
    } catch { /* ignore */ }
    return null;
  }
  function addStops(g, colors) {
    const cs = colors || [0xff000000, 0xffffffff];
    for (let i = 0; i < cs.length; i++) g.addColorStop(cs.length === 1 ? 0 : i / (cs.length - 1), argbCssLocal(cs[i] >>> 0));
  }
  R.def('Landroid/graphics/LinearGradient;', { access: 0x21, sup: 'Landroid/graphics/Shader;', m: { ['<init>(FFFF[I[FLandroid/graphics/Shader$TileMode;)' + V]: (s, x0, y0, x1, y1, colors, pos, tm) => { s.$kind = 'linear'; s.$x0 = x0; s.$y0 = y0; s.$x1 = x1; s.$y1 = y1; s.$colors = colors ? colors.slice() : null; }, ['<init>(FFFFIILandroid/graphics/Shader$TileMode;)' + V]: (s, x0, y0, x1, y1, c0, c1, tm) => { s.$kind = 'linear'; s.$x0 = x0; s.$y0 = y0; s.$x1 = x1; s.$y1 = y1; s.$colors = [c0, c1]; } } });
  R.def('Landroid/graphics/RadialGradient;', { access: 0x21, sup: 'Landroid/graphics/Shader;', m: { ['<init>(FFF[I[FLandroid/graphics/Shader$TileMode;)' + V]: (s, x, y, r, colors, pos, tm) => { s.$kind = 'radial'; s.$x = x; s.$y = y; s.$r = r; s.$colors = colors ? colors.slice() : null; }, ['<init>(FFF IILandroid/graphics/Shader$TileMode;)'.replace(' ', '') + V]: (s, x, y, r, c0, c1, tm) => { s.$kind = 'radial'; s.$x = x; s.$y = y; s.$r = r; s.$colors = [c0, c1]; } } });
  R.def('Landroid/graphics/SweepGradient;', { access: 0x21, sup: 'Landroid/graphics/Shader;', m: { ['<init>(FF[I[F)' + V]: (s, x, y, colors, pos) => { s.$kind = 'sweep'; s.$x = x; s.$y = y; s.$colors = colors ? colors.slice() : null; } } });
  R.def('Landroid/graphics/BitmapShader;', { access: 0x21, sup: 'Landroid/graphics/Shader;', m: { ['<init>(Landroid/graphics/Bitmap;Landroid/graphics/Shader$TileMode;Landroid/graphics/Shader$TileMode;)' + V]: (s, b) => { s.$kind = 'bitmap'; s.$bmp = b; } } });
  R.def('Landroid/graphics/Shader;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setLocalMatrix(Landroid/graphics/Matrix;)' + V]: () => {} } });
  R.def('Landroid/graphics/Shader$TileMode;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });

  /* ---- Matrix: 3x3 row-major floats ---- */
  R.def('Landroid/graphics/Matrix;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$v = [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
      ['<init>(Landroid/graphics/Matrix;)' + V]: (s, o) => { s.$v = (o ? o.$v : [1, 0, 0, 0, 1, 0, 0, 0, 1]).slice(); },
      ['reset()' + V]: (s) => { s.$v = [1, 0, 0, 0, 1, 0, 0, 0, 1]; },
      ['set(Landroid/graphics/Matrix;)' + V]: (s, o) => { s.$v = (o ? o.$v : [1, 0, 0, 0, 1, 0, 0, 0, 1]).slice(); },
      ['setValues([F)' + V]: (s, v) => { s.$v = (v || []).slice(0, 9); while (s.$v.length < 9) s.$v.push(0); },
      ['getValues([F)' + V]: (s, out) => { for (let i = 0; i < 9; i++) out[i] = s.$v[i]; },
      ['setTranslate(FF)' + V]: (s, x, y) => { s.$v = [1, 0, x, 0, 1, y, 0, 0, 1]; },
      ['setScale(FF)' + V]: (s, x, y) => { s.$v = [x, 0, 0, 0, y, 0, 0, 0, 1]; },
      ['setScale(FFFF)' + V]: (s, x, y, px, py) => { s.$v = [x, 0, px - x * px, 0, y, py - y * py, 0, 0, 1]; },
      ['setRotate(F)' + V]: (s, d) => { const r = d * Math.PI / 180, c = Math.cos(r), si = Math.sin(r); s.$v = [c, -si, 0, si, c, 0, 0, 0, 1]; },
      ['setRotate(FFF)' + V]: (s, d, px, py) => { const r = d * Math.PI / 180, c = Math.cos(r), si = Math.sin(r); s.$v = [c, -si, px - c * px + si * py, si, c, py - si * px - c * py, 0, 0, 1]; },
      ['postTranslate(FF)' + Z]: (s, x, y) => { s.$v[2] += x; s.$v[5] += y; return 1; },
      ['postScale(FF)' + Z]: (s, x, y) => { mMul(s, [x, 0, 0, 0, y, 0, 0, 0, 1]); return 1; },
      ['postRotate(F)' + Z]: (s, d) => { const r = d * Math.PI / 180, c = Math.cos(r), si = Math.sin(r); mMul(s, [c, -si, 0, si, c, 0, 0, 0, 1]); return 1; },
      ['postConcat(Landroid/graphics/Matrix;)' + Z]: (s, o) => { if (o) mMul(s, o.$v); return 1; },
      ['preTranslate(FF)' + Z]: (s, x, y) => { mMul(s, [1, 0, x, 0, 1, y, 0, 0, 1], true); return 1; },
      ['preScale(FF)' + Z]: (s, x, y) => { mMul(s, [x, 0, 0, 0, y, 0, 0, 0, 1], true); return 1; },
      ['preConcat(Landroid/graphics/Matrix;)' + Z]: (s, o) => { if (o) mMul(s, o.$v, true); return 1; },
      ['mapPoints([F)' + V]: (s, pts) => { for (let i = 0; i + 1 < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; pts[i] = s.$v[0] * x + s.$v[1] * y + s.$v[2]; pts[i + 1] = s.$v[3] * x + s.$v[4] * y + s.$v[5]; } },
      ['mapPoints([F[F)' + V]: (s, dst, src) => { for (let i = 0; i + 1 < src.length && i + 1 < dst.length; i += 2) { const x = src[i], y = src[i + 1]; dst[i] = s.$v[0] * x + s.$v[1] * y + s.$v[2]; dst[i + 1] = s.$v[3] * x + s.$v[4] * y + s.$v[5]; } },
      ['mapRect(Landroid/graphics/RectF;)' + Z]: (s, r) => { if (!r) return 0; const pts = [r.$l, r.$t, r.$r, r.$b]; R.iv('Landroid/graphics/Matrix;->mapPoints([F)V', s, pts); r.$l = Math.min(pts[0], pts[2]); r.$r = Math.max(pts[0], pts[2]); r.$t = Math.min(pts[1], pts[3]); r.$b = Math.max(pts[1], pts[3]); return 1; },
      ['mapRadius(FFFF)' + V]: () => {},
      ['invert(Landroid/graphics/Matrix;)' + Z]: (s, out) => { const inv = mInvert(s.$v); if (!inv || !out) return 0; out.$v = inv; return 1; },
      ['isIdentity()' + Z]: (s) => BOOL(s.$v[0] === 1 && s.$v[1] === 0 && s.$v[2] === 0 && s.$v[3] === 0 && s.$v[4] === 1 && s.$v[5] === 0),
      ['toString()' + S]: (s) => 'Matrix' + JSON.stringify(s.$v),
    },
  });
  function mMul(s, o, pre) {
    const a = pre ? o : s.$v, b = pre ? s.$v : o;
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    s.$v = r;
  }
  function mInvert(v) {
    const [a, b, c, d, e, f] = v;
    const det = a * e - b * d;
    if (!det) return null;
    return [e / det, -b / det, (b * f - c * e) / det, -d / det, a / det, (c * d - a * f) / det, 0, 0, 1];
  }
  /* ---- Path -> Path2D ---- */
  R.def('Landroid/graphics/Path;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: (s) => { s.$ops = []; },
      ['<init>(Landroid/graphics/Path;)' + V]: (s, o) => { s.$ops = (o ? o.$ops : []).slice(); },
      ['moveTo(FF)' + V]: (s, x, y) => { s.$ops.push(['M', x, y]); },
      ['lineTo(FF)' + V]: (s, x, y) => { s.$ops.push(['L', x, y]); },
      ['quadraticTo(FFFF)' + V]: (s, x1, y1, x, y) => { s.$ops.push(['Q', x1, y1, x, y]); },
      ['cubicTo(FFFFFF)' + V]: (s, x1, y1, x2, y2, x, y) => { s.$ops.push(['C', x1, y1, x2, y2, x, y]); },
      ['arcTo(FFFFFZZ)' + V]: (s, l, t, r, b, sa, sw, force) => { s.$ops.push(['A', l, t, r, b, sa, sw]); },
      ['arcTo(Landroid/graphics/RectF;FFZ)' + V]: (s, rf, sa, sw, f) => { if (rf) s.$ops.push(['A', rf.$l, rf.$t, rf.$r, rf.$b, sa, sw]); },
      ['close()' + V]: (s) => { s.$ops.push(['Z']); },
      ['addRect(FFFFLandroid/graphics/Path$Direction;)' + V]: (s, l, t, r, b) => { s.$ops.push(['R', l, t, r - l, b - t]); },
      ['addRect(Landroid/graphics/RectF;Landroid/graphics/Path$Direction;)' + V]: (s, rf) => { if (rf) s.$ops.push(['R', rf.$l, rf.$t, rf.$r - rf.$l, rf.$b - rf.$t]); },
      ['addRoundRect(FFFF[F Landroid/graphics/Path$Direction;)'.replace(' ', '') + V]: (s, l, t, r, b, rad) => { s.$ops.push(['RR', l, t, r - l, b - t, rad ? rad[0] : 0]); },
      ['addRoundRect(Landroid/graphics/RectF;[FLandroid/graphics/Path$Direction;)' + V]: (s, rf, rad) => { if (rf) s.$ops.push(['RR', rf.$l, rf.$t, rf.$r - rf.$l, rf.$b - rf.$t, rad ? rad[0] : 0]); },
      ['addCircle(FFFLandroid/graphics/Path$Direction;)' + V]: (s, x, y, r) => { s.$ops.push(['O', x, y, r]); },
      ['addOval(FFFFLandroid/graphics/Path$Direction;)' + V]: (s, l, t, r, b) => { s.$ops.push(['E', l, t, r - l, b - t]); },
      ['addPath(Landroid/graphics/Path;)' + V]: (s, o) => { if (o) s.$ops = s.$ops.concat(o.$ops); },
      ['addPath(Landroid/graphics/Path;FF)' + V]: (s, o, dx, dy) => { if (o) s.$ops = s.$ops.concat(o.$ops.map((op) => op.map((v, i) => (i === 1 ? v + dx : i === 2 ? v + dy : v)))); },
      ['rewind()' + V]: (s) => { s.$ops = []; },
      ['reset()' + V]: (s) => { s.$ops = []; },
      ['setLastPoint(FF)' + V]: () => {},
      ['offset(FF)' + V]: (s, dx, dy) => { s.$ops = s.$ops.map((op) => op.map((v, i) => (typeof v === 'number' && i > 0 ? v + (i % 2 === 1 ? dx : dy) : v))); },
      ['isEmpty()' + Z]: (s) => BOOL(!s.$ops.length),
      ['isClosed()' + Z]: (s) => BOOL(s.$ops.some((o) => o[0] === 'Z')),
      ['computeBounds(Landroid/graphics/RectF;Z)' + V]: (s, rf) => { if (rf) { rf.$l = 0; rf.$t = 0; rf.$r = 100; rf.$b = 100; } },
      ['setFillType(Landroid/graphics/Path$FillType;)' + V]: (s, f) => { s.$fill = f; },
      ['getFillType()Landroid/graphics/Path$FillType;']: (s) => s.$fill || null,
      ['transform(Landroid/graphics/Matrix;)' + V]: () => {},
    },
  });
  R.def('Landroid/graphics/Path$FillType;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/PathMeasure;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/graphics/Path;Z)' + V]: () => {}, ['getLength()' + F]: () => Math.fround(0), ['getPosTan(F[F[F)' + Z]: () => 0 } });
  R.def('Landroid/graphics/DashPathEffect;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>([FF)' + V]: (s, iv, phase) => { s.$dash = iv ? iv.slice() : []; } } });
  R.def('Landroid/graphics/CornerPathEffect;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(F)' + V]: () => {} } });
  R.def('Landroid/graphics/Outline;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['setRect(IIII)' + V]: () => {}, ['setRoundRect(IIIIF)' + V]: () => {}, ['setEmpty()' + V]: () => {}, ['setAlpha(F)' + V]: () => {} } });
  R.def('Landroid/graphics/Paint;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['setShader(Landroid/graphics/Shader;)Landroid/graphics/Shader;']: (s, sh) => { s.$shader = sh; return sh; },
    ['getShader()Landroid/graphics/Shader;']: (s) => s.$shader || null,
    ['setPathEffect(Landroid/graphics/PathEffect;)Landroid/graphics/PathEffect;']: (s, pe) => { s.$pathEffect = pe; return pe; },
    ['setColorFilter(Landroid/graphics/ColorFilter;)Landroid/graphics/ColorFilter;']: (s, cf) => { s.$cf = cf; return cf; },
    ['setXfermode(Landroid/graphics/Xfermode;)Landroid/graphics/Xfermode;']: (s, x) => { s.$xm = x; return x; },
    ['setMaskFilter(Landroid/graphics/MaskFilter;)Landroid/graphics/MaskFilter;']: (s, m) => { s.$mf = m; return m; },
    ['setShadowLayer(FFFI)' + V]: () => {},
    ['hasShadowLayer()' + Z]: () => 0,
    ['setFakeBoldText(Z)' + V]: (s, b) => { s.$bold = !!b; },
    ['setUnderlineText(Z)' + V]: () => {},
    ['setStrikeThruText(Z)' + V]: () => {},
    ['setTextSkewX(F)' + V]: () => {},
    ['setTextScaleX(F)' + V]: () => {},
    ['getFontSpacing()' + F]: (s) => Math.fround((s.$size || 12) * 1.2),
    ['getFontMetrics()Landroid/graphics/Paint$FontMetrics;']: (s) => { const o = mkSimple('Landroid/graphics/Paint$FontMetrics;'); const sz = s.$size || 12; o.$top = -sz; o.$ascent = -sz * 0.8; o.$descent = sz * 0.25; o.$bottom = sz * 0.3; return o; },
    ['breakText(Ljava/lang/String;ZFLjava/lang/Float;)' + I]: (s, t) => String(t).length,
  } });
  R.def('Landroid/graphics/Paint$FontMetrics;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['top', 'F'], ['ascent', 'F'], ['descent', 'F'], ['bottom', 'F'], ['leading', 'F']] });
  R.def('Landroid/graphics/ColorFilter;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/PorterDuffColorFilter;', { access: 0x21, sup: 'Landroid/graphics/ColorFilter;', m: { ['<init>(ILandroid/graphics/PorterDuff$Mode;)' + V]: (s, c, m) => { s.$color = c; } } });
  R.def('Landroid/graphics/ColorMatrixColorFilter;', { access: 0x21, sup: 'Landroid/graphics/ColorFilter;', m: { ['<init>([F)' + V]: () => {} } });
  R.def('Landroid/graphics/Xfermode;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/PorterDuffXfermode;', { access: 0x21, sup: 'Landroid/graphics/Xfermode;', m: { ['<init>(Landroid/graphics/PorterDuff$Mode;)' + V]: (s, m) => { s.$mode = m; } } });
  R.def('Landroid/graphics/MaskFilter;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/BlurMaskFilter;', { access: 0x21, sup: 'Landroid/graphics/MaskFilter;', m: { ['<init>(FLandroid/graphics/BlurMaskFilter$Blur;)' + V]: (s, r) => { s.$r = r; } } });
  R.def('Landroid/graphics/BlurMaskFilter$Blur;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/graphics/PathEffect;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/graphics/ColorMatrix;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: (s) => { s.$m = new Array(20).fill(0); s.$m[0] = s.$m[6] = s.$m[12] = s.$m[18] = 1; }, ['setSaturation(F)' + V]: () => {}, ['getArray()[F']: (s) => s.$m } });

  /* ---- Bitmap decoding: real pixels via <img>, async but usable ---- */
  R.def('Landroid/graphics/BitmapFactory;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['decodeByteArray([BII)Landroid/graphics/Bitmap;']: (b, o, l) => bitmapFromBytes(R, (b || []).slice(o | 0, (o | 0) + (l | 0))),
      ['decodeByteArray([BIILandroid/graphics/BitmapFactory$Options;)Landroid/graphics/Bitmap;']: (b, o, l) => bitmapFromBytes(R, (b || []).slice(o | 0, (o | 0) + (l | 0))),
      ['decodeStream(Ljava/io/InputStream;)Landroid/graphics/Bitmap;']: (is) => bitmapFromBytes(R, is && is.$b ? is.$b.slice(is.$p || 0) : []),
      ['decodeStream(Ljava/io/InputStream;Landroid/graphics/Rect;Landroid/graphics/BitmapFactory$Options;)Landroid/graphics/Bitmap;']: (is) => bitmapFromBytes(R, is && is.$b ? is.$b.slice(is.$p || 0) : []),
      ['decodeFile(Ljava/lang/String;)Landroid/graphics/Bitmap;']: (p) => bitmapFromBytes(R, (H.vfs.get(String(p).split('/').pop()) || [])),
      ['decodeFile(Ljava/lang/String;Landroid/graphics/BitmapFactory$Options;)Landroid/graphics/Bitmap;']: (p) => bitmapFromBytes(R, (H.vfs.get(String(p).split('/').pop()) || [])),
      ['decodeResource(Landroid/content/res/Resources;I)Landroid/graphics/Bitmap;']: (r, id) => { const d = H.resDrawable(id | 0); return d && d.$uri ? bitmapFromDataUri(R, d.$uri) : null; },
      ['decodeResource(Landroid/content/res/Resources;ILandroid/graphics/BitmapFactory$Options;)Landroid/graphics/Bitmap;']: (r, id) => { const d = H.resDrawable(id | 0); return d && d.$uri ? bitmapFromDataUri(R, d.$uri) : null; },
    },
  });
  R.def('Landroid/graphics/BitmapFactory$Options;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['inSampleSize', 'I'], ['inJustDecodeBounds', 'Z'], ['outWidth', 'I'], ['outHeight', 'I'], ['inPreferredConfig', 'Landroid/graphics/Bitmap$Config;']] });
  function bitmapFromBytes(R, bytes) {
    if (!bytes || !bytes.length) return null;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.slice(i, i + 0x8000));
    const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : bytes[8] === 0x57 ? 'image/webp' : 'image/png';
    return bitmapFromDataUri(R, `data:${mime};base64,${(typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64'))}`);
  }
  function bitmapFromDataUri(R, uri) {
    const o = mkSimple('Landroid/graphics/Bitmap;');
    o.$w = 0; o.$h = 0; o.$uri = uri;
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { o.$w = img.naturalWidth; o.$h = img.naturalHeight; };
      img.src = uri;
      o.$img = img;
    }
    return o;
  }
  R.def('Landroid/graphics/Bitmap;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getWidth()' + I]: (s) => (s.$img && s.$img.naturalWidth) || s.$w || 0,
      ['getHeight()' + I]: (s) => (s.$img && s.$img.naturalHeight) || s.$h || 0,
      ['getConfig()Landroid/graphics/Bitmap$Config;']: () => mkSimple('Landroid/graphics/Bitmap$Config;'),
      ['getByteCount()' + I]: (s) => ((s.$w || 0) * (s.$h || 0) * 4),
      ['eraseColor(I)' + V]: () => {},
      ['copy(Landroid/graphics/Bitmap$Config;Z)Landroid/graphics/Bitmap;']: (s) => s,
      ['createScaledBitmap? no']: () => {},
    },
  });
  R.def('Landroid/graphics/Bitmap;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['createBitmap(IILandroid/graphics/Bitmap$Config;)Landroid/graphics/Bitmap;']: (w, h) => { const o = mkSimple('Landroid/graphics/Bitmap;'); o.$w = w | 0; o.$h = h | 0; o.$ctx = newCanvas2d(w | 0, h | 0); if (o.$ctx) o.$img = o.$ctx.canvas; return o; },
    ['createBitmap(Landroid/graphics/Bitmap;IIII)Landroid/graphics/Bitmap;']: (b, x, y, w, h) => { const o = mkSimple('Landroid/graphics/Bitmap;'); o.$w = w | 0; o.$h = h | 0; o.$ctx = newCanvas2d(w | 0, h | 0); if (o.$ctx && b && b.$img) { try { o.$ctx.drawImage(b.$img, x, y, w, h, 0, 0, w, h); } catch {} } o.$img = o.$ctx && o.$ctx.canvas; return o; },
    ['createScaledBitmap(Landroid/graphics/Bitmap;IIZ)Landroid/graphics/Bitmap;']: (b, w, h) => R.is('Landroid/graphics/Bitmap;->createBitmap(Landroid/graphics/Bitmap;IIII)Landroid/graphics/Bitmap;', b, 0, 0, w, h),
  } });
  R.def('Landroid/view/ViewConfiguration;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getScaledTouchSlop()' + I]: () => 8, ['getScaledMinimumFlingVelocity()' + I]: () => 50,
      ['getScaledMaximumFlingVelocity()' + I]: () => 8000, ['getScaledPagingTouchSlop()' + I]: () => 16,
      ['getScaledOverscrollDistance()' + I]: () => 0, ['getScaledOverflingDistance()' + I]: () => 0,
      ['getTapTimeout()' + I]: () => 100, ['getLongPressTimeout()' + I]: () => 500,
      ['getScaledScrollBarSize()' + I]: () => 4, ['getScaledEdgeSlop()' + I]: () => 12,
      ['hasPermanentMenuKey()' + Z]: () => 0,
    },
    sm: {
      ['get(Landroid/content/Context;)Landroid/view/ViewConfiguration;']: () => mkSimple('Landroid/view/ViewConfiguration;'),
      ['getTapTimeout()' + I]: () => 100, ['getLongPressTimeout()' + I]: () => 500,
      ['getScaledTouchSlop(Landroid/content/Context;)' + I]: () => 8,
    },
  });
  R.def('Ljava/util/Collections;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['newSetFromMap(Ljava/util/Map;)Ljava/util/Set;']: (m) => ({ $c: R.klass('Ljava/util/HashSet;'), $a: m && m.$m ? [...m.$m.keys()].map((k) => m.$m.get(k).k) : [] }),
  } });
  R.def('Landroid/view/Choreographer;', { access: 0x31, sup: 'Ljava/lang/Object;', m: {
    ['removeFrameCallback(Landroid/view/Choreographer$FrameCallback;)' + V]: () => {},
    ['removeCallbacks(ILjava/lang/Runnable;Ljava/lang/Object;)' + V]: () => {},
    ['postFrameCallbackDelayed(Landroid/view/Choreographer$FrameCallback;J)' + V]: (s, cb, d) => H.postDelayed(() => { try { R.iv('Landroid/view/Choreographer$FrameCallback;->doFrame(J)V', cb, Date.now() * 1e6); } catch (e) { H.crash(e); } }, Number(d)),
  } });

  /* ---- Settings.{System,Global,Secure}: missing keys must THROW or default,
         never silently return 0 (apps branch on the exception) ---- */
  const settingsStore = { system: new Map(), global: new Map(), secure: new Map() };
  const SETTINGS_DEFAULTS = { font_scale: '1.0', transition_animation_scale: '1.0', animator_duration_scale: '1.0', window_animation_scale: '1.0', accelerometer_rotation: '0', screen_brightness: '0.5', screen_off_timeout: '60000', wifi_on: '1', airplane_mode_on: '0', auto_time: '1', auto_time_zone: '1', development_settings_enabled: '0', install_non_market_apps: '0' };
  function settingsDef(name) { const v = SETTINGS_DEFAULTS[String(name)]; return v === undefined ? null : v; }
  function settingsCls(which) {
    const get = (store, name) => { const v = store.get(String(name)); return v === undefined ? settingsDef(name) : v; };
    return {
      access: 0x31, sup: 'Ljava/lang/Object;',
      sm: {
        ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: (r, n) => get(store[which], n),
        ['getInt(Landroid/content/ContentResolver;Ljava/lang/String;)I']: (r, n) => { const v = get(store[which], n); if (v === null) throw R.newException('Landroid/provider/Settings$SettingNotFoundException;', String(n)); return parseInt(v, 10) | 0; },
        ['getInt(Landroid/content/ContentResolver;Ljava/lang/String;I)I']: (r, n, d) => { const v = get(store[which], n); return v === null ? (d | 0) : (parseInt(v, 10) | 0); },
        ['getLong(Landroid/content/ContentResolver;Ljava/lang/String;)J']: (r, n) => { const v = get(store[which], n); if (v === null) throw R.newException('Landroid/provider/Settings$SettingNotFoundException;', String(n)); return Number(v); },
        ['getLong(Landroid/content/ContentResolver;Ljava/lang/String;J)J']: (r, n, d) => { const v = get(store[which], n); return v === null ? Number(d) : Number(v); },
        ['getFloat(Landroid/content/ContentResolver;Ljava/lang/String;)F']: (r, n) => { const v = get(store[which], n); if (v === null) throw R.newException('Landroid/provider/Settings$SettingNotFoundException;', String(n)); return Math.fround(parseFloat(v)); },
        ['getFloat(Landroid/content/ContentResolver;Ljava/lang/String;F)F']: (r, n, d) => { const v = get(store[which], n); return v === null ? Math.fround(d) : Math.fround(parseFloat(v)); },
        ['putString(Landroid/content/ContentResolver;Ljava/lang/String;Ljava/lang/String;)' + Z]: (r, n, v) => { store[which].set(String(n), v === null ? null : String(v)); return 1; },
        ['putInt(Landroid/content/ContentResolver;Ljava/lang/String;I)' + Z]: (r, n, v) => { store[which].set(String(n), String(v | 0)); return 1; },
        ['putLong(Landroid/content/ContentResolver;Ljava/lang/String;J)' + Z]: (r, n, v) => { store[which].set(String(n), String(Number(v))); return 1; },
        ['putFloat(Landroid/content/ContentResolver;Ljava/lang/String;F)' + Z]: (r, n, v) => { store[which].set(String(n), String(v)); return 1; },
      },
    };
  }
  R.def('Landroid/provider/Settings$System;', settingsCls('system'));
  R.def('Landroid/provider/Settings$Global;', settingsCls('global'));
  R.def('Landroid/provider/Settings$Secure;', settingsCls('secure'));
  R.def('Landroid/provider/Settings$SettingNotFoundException;', { access: 0x21, sup: 'Ljava/lang/Exception;', m: { ['<init>(Ljava/lang/String;)' + V]: (s, m) => { s.$message = m; } } });
  R.def('Landroid/provider/Settings;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: (r, n) => settingsDef(n),
    ['putString(Landroid/content/ContentResolver;Ljava/lang/String;Ljava/lang/String;)' + Z]: () => 1,
  } });
  R.def('Landroid/content/ContentResolver;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['acquireProvider(Ljava/lang/String;)Landroid/content/IContentProvider;']: () => null,
    ['registerContentObserver(Landroid/net/Uri;ZLandroid/database/ContentObserver;)' + V]: () => {},
    ['unregisterContentObserver(Landroid/database/ContentObserver;)' + V]: () => {},
    ['notifyChange(Landroid/net/Uri;Landroid/database/ContentObserver;)' + V]: () => {},
    ['query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: () => emptyCursor(R),
  } });
  function emptyCursor(R) { const o = mkSimple('Landroid/database/Cursor;'); o.$rows = []; o.$i = -1; return o; }
  R.def('Landroid/database/Cursor;', { access: 0x601, sup: 'Ljava/lang/Object;', m: {
    ['getCount()' + I]: (s) => (s.$rows || []).length,
    ['moveToFirst()' + Z]: (s) => { s.$i = 0; return BOOL((s.$rows || []).length > 0); },
    ['moveToNext()' + Z]: (s) => { s.$i = (s.$i === undefined ? -1 : s.$i) + 1; return BOOL(s.$i < (s.$rows || []).length); },
    ['moveToPosition(I)' + Z]: (s, i) => { s.$i = i | 0; return BOOL(s.$i >= 0 && s.$i < (s.$rows || []).length); },
    ['getPosition()' + I]: (s) => s.$i || 0,
    ['getColumnIndex(Ljava/lang/String;)' + I]: (s, n) => (s.$cols || []).indexOf(String(n)),
    ['getColumnIndexOrThrow(Ljava/lang/String;)' + I]: (s, n) => { const i = (s.$cols || []).indexOf(String(n)); if (i < 0) throw R.newException('Ljava/lang/IllegalArgumentException;', 'column ' + n); return i; },
    ['getString(I)' + S]: (s, i) => { const r = (s.$rows || [])[s.$i || 0]; return r ? (r[i | 0] === undefined ? null : String(r[i | 0])) : null; },
    ['getInt(I)' + I]: (s, i) => { const r = (s.$rows || [])[s.$i || 0]; return r ? (parseInt(r[i | 0], 10) | 0) : 0; },
    ['getLong(I)' + J]: (s, i) => { const r = (s.$rows || [])[s.$i || 0]; return r ? Number(r[i | 0] || 0) : 0; },
    ['getFloat(I)' + F]: (s, i) => { const r = (s.$rows || [])[s.$i || 0]; return r ? Math.fround(parseFloat(r[i | 0]) || 0) : 0; },
    ['isNull(I)' + Z]: (s, i) => { const r = (s.$rows || [])[s.$i || 0]; return BOOL(!r || r[i | 0] === null || r[i | 0] === undefined); },
    ['close()' + V]: () => {}, ['isClosed()' + Z]: () => 0,
  } });
  R.def('Landroid/database/ContentObserver;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/os/Handler;)' + V]: () => {}, ['onChange(Z)' + V]: () => {} } });
  R.def('Landroid/content/IContentProvider;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ================= animations ================= */
  const animNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function animState(R, o) { o.$start = 0; o.$dur = 300; o.$running = false; o.$vals = [0, 1]; o.$cur = 0; return o; }
  R.def('Landroid/animation/ValueAnimator;', {
    access: 0x21, sup: 'Landroid/animation/Animator;',
    m: {
      ['<init>()' + V]: (s) => { animState(R, s); s.$listeners = []; s.$updaters = []; },
      ['setDuration(J)Landroid/animation/ValueAnimator;']: (s, d) => { s.$dur = Math.max(0, Number(d)); return s; },
      ['getDuration()' + J]: (s) => s.$dur,
      ['setStartDelay(J)' + V]: (s, d) => { s.$delay = Number(d); },
      ['setRepeatCount(I)' + V]: (s, n) => { s.$repeat = n | 0; },
      ['setRepeatMode(I)' + V]: (s, m) => { s.$repeatMode = m | 0; },
      ['setInterpolator(Landroid/animation/TimeInterpolator;)' + V]: (s, i) => { s.$interp = i; },
      ['addUpdateListener(Landroid/animation/ValueAnimator$AnimatorUpdateListener;)' + V]: (s, l) => { s.$updaters.push(l); },
      ['addListener(Landroid/animation/Animator$AnimatorListener;)' + V]: (s, l) => { s.$listeners.push(l); },
      ['removeAllListeners()' + V]: (s) => { s.$listeners = []; },
      ['cancel()' + V]: (s) => { s.$running = false; },
      ['end()' + V]: (s) => { s.$running = false; tick(s, 1); },
      ['isRunning()' + Z]: (s) => BOOL(s.$running),
      ['getAnimatedValue()Ljava/lang/Object;']: (s) => boxAnimValue(R, s),
      ['getAnimatedFraction()' + F]: (s) => Math.fround(s.$frac || 0),
      ['start()' + V]: (s) => runAnim(R, H, s),
    },
    sm: {
      ['ofInt([I)Landroid/animation/ValueAnimator;']: (vals) => { const o = mkSimple('Landroid/animation/ValueAnimator;'); animState(R, o); o.$vals = (vals || [0, 1]).slice(); o.$type = 'I'; o.$updaters = []; o.$listeners = []; return o; },
      ['ofFloat([F)Landroid/animation/ValueAnimator;']: (vals) => { const o = mkSimple('Landroid/animation/ValueAnimator;'); animState(R, o); o.$vals = (vals || [0, 1]).slice(); o.$type = 'F'; o.$updaters = []; o.$listeners = []; return o; },
      ['ofArgb([I)Landroid/animation/ValueAnimator;']: (vals) => { const o = mkSimple('Landroid/animation/ValueAnimator;'); animState(R, o); o.$vals = (vals || [0, 1]).slice(); o.$type = 'C'; o.$updaters = []; o.$listeners = []; return o; },
      ['ofObject([Ljava/lang/Object;)Landroid/animation/ValueAnimator;']: (vals) => { const o = mkSimple('Landroid/animation/ValueAnimator;'); animState(R, o); o.$vals = (vals || [0, 1]).slice(); o.$type = 'O'; o.$updaters = []; o.$listeners = []; return o; },
      ['ofInt(II)Landroid/animation/ValueAnimator;']: (a, b) => R.is('Landroid/animation/ValueAnimator;->ofInt([I)Landroid/animation/ValueAnimator;', arr(R, '[I', [a | 0, b | 0])),
      ['ofFloat(FF)Landroid/animation/ValueAnimator;']: (a, b) => R.is('Landroid/animation/ValueAnimator;->ofFloat([F)Landroid/animation/ValueAnimator;', arr(R, '[F', [a, b])),
    },
  });
  R.def('Landroid/animation/ValueAnimator$AnimatorUpdateListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/animation/Animator$AnimatorListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/animation/TimeInterpolator;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  function boxAnimValue(R, s) {
    const v = s.$cur;
    if (s.$type === 'I') return R.box('Ljava/lang/Integer;', Math.round(v));
    if (s.$type === 'F') return R.box('Ljava/lang/Float;', Math.fround(v));
    if (s.$type === 'C') return R.box('Ljava/lang/Integer;', Math.round(v));
    return v;
  }
  function interp(R, H, s, t) {
    if (s.$interp) { try { return R.iv('Landroid/animation/TimeInterpolator;->getInterpolation(F)F', s.$interp, t); } catch { return t; } }
    // default: accelerate/decelerate (cosine)
    return (1 - Math.cos(t * Math.PI)) / 2;
  }
  function tick(s, frac) {
    s.$frac = frac;
    const v = s.$vals || [0, 1];
    const seg = frac * (v.length - 1);
    const i = Math.min(v.length - 2, Math.floor(seg));
    const lt = seg - i;
    const a = Number(v[i]) || 0, b = Number(v[i + 1]) || 0;
    s.$cur = s.$type === 'C' ? lerpArgb(a, b, lt) : a + (b - a) * lt;
  }
  function lerpArgb(a, b, t) {
    const c = (sh) => Math.round(((a >>> sh) & 0xff) + (((b >>> sh) & 0xff) - ((a >>> sh) & 0xff)) * t);
    return ((c(24) << 24) | (c(16) << 16) | (c(8) << 8) | c(0)) | 0;
  }
  function runAnim(R, H, s) {
    if (s.$running) return;
    s.$running = true;
    s.$start = animNow() + (s.$delay || 0);
    for (const l of (s.$listeners || [])) { try { if (l && l.$nativeEnd) continue; R.iv('Landroid/animation/Animator$AnimatorListener;->onAnimationStart(Landroid/animation/Animator;)V', l, s); } catch (e) { H.crash(e); } }
    const step = () => {
      if (!s.$running) return;
      const t = Math.min(1, Math.max(0, (animNow() - s.$start) / Math.max(1, s.$dur)));
      tick(s, interp(R, H, s, t));
      for (const u of (s.$updaters || [])) {
        try {
          if (u && u.$call) u.$call(s);
          else R.iv('Landroid/animation/ValueAnimator$AnimatorUpdateListener;->onAnimationUpdate(Landroid/animation/ValueAnimator;)V', u, s);
        } catch (e) { H.crash(e); s.$running = false; return; }
      }
      if (t < 1) H.postDelayed(step, 16);
      else {
        s.$running = false;
        for (const l of (s.$listeners || [])) { try { if (l && l.$nativeEnd) { l.$nativeEnd(); continue; } R.iv('Landroid/animation/Animator$AnimatorListener;->onAnimationEnd(Landroid/animation/Animator;)V', l, s); } catch (e) { H.crash(e); } }
      }
    };
    H.postDelayed(step, 16);
  }
  R.def('Landroid/animation/ObjectAnimator;', {
    access: 0x21, sup: 'Landroid/animation/ValueAnimator;',
    m: {
      ['setPropertyName(Ljava/lang/String;)' + V]: (s, n) => { s.$prop = String(n); },
      ['getPropertyName()' + S]: (s) => s.$prop,
    },
    sm: {
      ['ofFloat(Ljava/lang/Object;Ljava/lang/String;[F)Landroid/animation/ObjectAnimator;']: (target, prop, vals) => objAnim(R, target, String(prop), vals, 'F'),
      ['ofFloat(Ljava/lang/Object;Ljava/lang/String;FF)Landroid/animation/ObjectAnimator;']: (target, prop, a, b) => objAnim(R, target, String(prop), [a, b], 'F'),
      ['ofInt(Ljava/lang/Object;Ljava/lang/String;[I)Landroid/animation/ObjectAnimator;']: (target, prop, vals) => objAnim(R, target, String(prop), vals, 'I'),
      ['ofInt(Ljava/lang/Object;Ljava/lang/String;II)Landroid/animation/ObjectAnimator;']: (target, prop, a, b) => objAnim(R, target, String(prop), [a, b], 'I'),
      ['ofArgb(Ljava/lang/Object;Ljava/lang/String;[I)Landroid/animation/ObjectAnimator;']: (target, prop, vals) => objAnim(R, target, String(prop), vals, 'C'),
      ['ofObject(Ljava/lang/Object;Ljava/lang/String;Landroid/animation/TypeEvaluator;[Ljava/lang/Object;)Landroid/animation/ObjectAnimator;']: (target, prop) => objAnim(R, target, String(prop), [0, 1], 'F'),
    },
  });
  function objAnim(R, target, prop, vals, type) {
    const o = mkSimple('Landroid/animation/ObjectAnimator;');
    animState(R, o);
    o.$vals = (vals || [0, 1]).slice(); o.$type = type; o.$target = target; o.$prop = prop;
    o.$updaters = []; o.$listeners = [];
    const setter = 'set' + prop[0].toUpperCase() + prop.slice(1);
    o.$updaters.push({
      $c: R.klass('Landroid/animation/ValueAnimator$AnimatorUpdateListener;'),
      __native: true,
    });
    // drive the property through a native update listener
    const nativeListener = { $c: R.klass('Ljava/lang/Object;') };
    o.$nativeUpdate = (animator) => {
      if (!target) return;
      const v = animator.$cur;
      const cls = target.$c;
      const trySigs = [
        [setter + '(F)V', [v]], [setter + '(I)V', [Math.round(v)]], [setter + '(Ljava/lang/CharSequence;)V', [String(v)]],
      ];
      for (const [sig, args] of trySigs) {
        const m = cls && R.findMethod(cls, sig);
        if (m) { try { R.callMethod(m, [target, ...args]); return; } catch { /* try next */ } }
      }
      // view properties we model directly
      if (target.$el) {
        if (/^(alpha)$/i.test(prop)) { target.$alpha = v; target.$el.style.opacity = String(v); }
        else if (/^translationX$/i.test(prop)) { target.$tx = v; R.env.ui && R.env.ui.applyTransform ? R.env.ui.applyTransform(target) : 0; }
        else if (/^translationY$/i.test(prop)) { target.$ty = v; R.env.ui && R.env.ui.applyTransform ? R.env.ui.applyTransform(target) : 0; }
        else if (/^rotation$/i.test(prop)) { target.$rot = v; R.env.ui && R.env.ui.applyTransform ? R.env.ui.applyTransform(target) : 0; }
        else if (/^backgroundColor$/i.test(prop)) { target.$bg = Math.round(v); R.env.ui && R.env.ui.applyBackground ? R.env.ui.applyBackground(target) : 0; }
      }
    };
    const origRun = runAnim;
    o.$customTick = o.$nativeUpdate;
    return o;
  }
  R.def('Landroid/animation/AnimatorSet;', {
    access: 0x21, sup: 'Landroid/animation/Animator;',
    m: {
      ['<init>()' + V]: (s) => { s.$kids = []; },
      ['playTogether(Ljava/util/Collection;)' + V]: (s, c) => { s.$kids = s.$kids.concat((c && c.$a) || []); },
      ['playTogether([Landroid/animation/Animator;)' + V]: (s, a) => { s.$kids = s.$kids.concat(a || []); },
      ['playSequentially([Landroid/animation/Animator;)' + V]: (s, a) => { s.$seq = (a || []).slice(); },
      ['playSequentially(Ljava/util/Collection;)' + V]: (s, c) => { s.$seq = ((c && c.$a) || []).slice(); },
      ['play(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;']: (s, a) => ({ $c: R.klass('Landroid/animation/AnimatorSet$Builder;'), $set: s, $a: a }),
      ['setDuration(J)Landroid/animation/AnimatorSet;']: (s, d) => { s.$dur = Number(d); for (const k of s.$kids || []) k.$dur = Number(d); return s; },
      ['setStartDelay(J)' + V]: (s, d) => { s.$delay = Number(d); },
      ['setInterpolator(Landroid/animation/TimeInterpolator;)' + V]: (s, i) => { s.$interp = i; },
      ['addListener(Landroid/animation/Animator$AnimatorListener;)' + V]: (s, l) => { (s.$listeners = s.$listeners || []).push(l); },
      ['start()' + V]: (s) => {
        const kids = (s.$seq && s.$seq.length) ? s.$seq : (s.$kids || []);
        if (s.$seq && s.$seq.length) { let i = 0; const next = () => { if (i >= kids.length) return; const k = kids[i++]; wrapEnd(R, k, next); R.iv('Landroid/animation/Animator;->start()V', k); }; next(); }
        else for (const k of kids) { try { R.iv('Landroid/animation/Animator;->start()V', k); } catch (e) { H.crash(e); } }
      },
      ['cancel()' + V]: (s) => { for (const k of (s.$kids || []).concat(s.$seq || [])) { try { R.iv('Landroid/animation/Animator;->cancel()V', k); } catch {} } },
      ['getChildAnimations()Ljava/util/List;']: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: (s.$kids || []).slice() }),
    },
  });
  function wrapEnd(R, animator, cb) {
    const l = { $c: R.klass('Ljava/lang/Object;') };
    const prev = animator.$listeners || [];
    animator.$listeners = prev.concat([{ $c: R.klass('Landroid/animation/Animator$AnimatorListener;'), $nativeEnd: cb }]);
  }
  R.def('Landroid/animation/AnimatorSet$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['with(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;']: (s, a) => { s.$set.$kids.push(a); return s; }, ['after(J)Landroid/animation/AnimatorSet$Builder;']: (s) => s, ['before(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;']: (s, a) => { s.$set.$kids.push(a); return s; } } });
  // hook ObjectAnimator property application + AnimatorSet end callbacks into runAnim
  const origRunAnim = runAnim;
  runAnim = function (R, H, s) {
    if (s.$nativeUpdate) s.$updaters = (s.$updaters || []).concat([{ $c: R.klass('Ljava/lang/Object;'), $call: s.$nativeUpdate }]);
    origRunAnim(R, H, s);
  };
  R.def('Landroid/animation/ValueAnimator;', { access: 0x21, sup: 'Landroid/animation/Animator;', m: {
    ['start()' + V]: (s) => runAnim(R, H, s),
  } });
  R.def('Landroid/animation/ObjectAnimator;', { access: 0x21, sup: 'Landroid/animation/ValueAnimator;', m: {
    ['start()' + V]: (s) => runAnim(R, H, s),
  } });
  // update-loop must call $call listeners
  R.def('Landroid/animation/ValueAnimator$AnimatorUpdateListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---- res/anim tween XML → CSS transitions ---- */
  R.def('Landroid/view/animation/Animation;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['setDuration(J)' + V]: (s, d) => { s.$dur = Number(d); },
      ['getDuration()' + J]: (s) => s.$dur || 0,
      ['setStartOffset(J)' + V]: (s, d) => { s.$off = Number(d); },
      ['setFillAfter(Z)' + V]: (s, b) => { s.$fill = !!b; },
      ['setFillBefore(Z)' + V]: () => {},
      ['setInterpolator(Landroid/view/animation/Interpolator;)' + V]: (s, i) => { s.$interp = i; },
      ['setAnimationListener(Landroid/view/animation/Animation$AnimationListener;)' + V]: (s, l) => { s.$listener = l; },
      ['start()' + V]: (s) => { s.$started = true; },
      ['cancel()' + V]: (s) => { s.$running = false; },
      ['startNow()' + V]: (s) => { s.$started = true; },
      ['hasEnded()' + Z]: (s) => BOOL(!s.$running),
      ['initialize(IIII)' + V]: () => {},
    },
  });
  R.def('Landroid/view/animation/Animation$AnimationListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/animation/AnimationUtils;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    sm: {
      ['loadAnimation(Landroid/content/Context;I)Landroid/view/animation/Animation;']: (c, id) => H.loadAnim(id | 0),
      ['currentAnimationTimeMillis()' + J]: () => Date.now(),
    },
  });
  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['startAnimation(Landroid/view/animation/Animation;)' + V]: (s, a) => H.runViewAnimation(s, a),
    ['clearAnimation()' + V]: (s) => { if (s.$el) { s.$el.style.transition = ''; s.$el.style.transform = ''; s.$el.style.opacity = s.$alpha === undefined ? '' : String(s.$alpha); } },
    ['getAnimation()Landroid/view/animation/Animation;']: (s) => s.$anim || null,
  } });

  /* ---- hardware keyboard → KeyEvent dispatch ---- */
  R.def('Landroid/view/KeyEvent;', {
    access: 0x31, sup: 'Landroid/view/InputEvent;',
    m: {
      ['<init>(II)' + V]: (s, action, code) => { s.$action = action | 0; s.$code = code | 0; },
      ['<init>(JJI)' + V]: (s, a, b, c) => { s.$action = c | 0; },
      ['getKeyCode()' + I]: (s) => s.$code | 0,
      ['getAction()' + I]: (s) => s.$action | 0,
      ['getUnicodeChar()' + I]: (s) => s.$ch || 0,
      ['getCharacters()' + S]: (s) => s.$chars || null,
      ['isShiftPressed()' + Z]: () => 0, ['isCtrlPressed()' + Z]: () => 0, ['isAltPressed()' + Z]: () => 0,
      ['hasModifiers(I)' + Z]: () => 0, ['getModifiers()' + I]: () => 0,
      ['getEventTime()' + J]: () => Date.now(), ['getDownTime()' + J]: () => Date.now(),
      ['getRepeatCount()' + I]: (s) => s.$repeat || 0,
      ['dispatch(Landroid/view/KeyEvent$Callback;)' + Z]: (s, cb) => { try { return s.$action === 0 ? R.iv('Landroid/view/KeyEvent$Callback;->onKeyDown(ILandroid/view/KeyEvent;)Z', cb, s.$code, s) : R.iv('Landroid/view/KeyEvent$Callback;->onKeyUp(ILandroid/view/KeyEvent;)Z', cb, s.$code, s); } catch { return 0; } },
    },
    sm: {
      ['actionToString(I)' + S]: (a) => (a ? 'ACTION_UP' : 'ACTION_DOWN'),
      ['keyCodeToString(I)' + S]: (k) => 'KEYCODE_' + k,
    },
  });
  R.def('Landroid/view/KeyEvent$Callback;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---- sensors → DeviceMotion / DeviceOrientation ---- */
  R.def('Landroid/hardware/Sensor;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getType()' + I]: (s) => s.$type | 0, ['getName()' + S]: (s) => s.$name || 'sensor', ['getVendor()' + S]: () => 'Dex2Web', ['getMaximumRange()' + F]: () => Math.fround(100), ['getResolution()' + F]: () => Math.fround(0.01), ['getPower()' + F]: () => Math.fround(0.1) } });
  R.def('Landroid/hardware/SensorEvent;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['values', '[F'], ['sensor', 'Landroid/hardware/Sensor;'], ['timestamp', 'J'], ['accuracy', 'I']] });
  R.def('Landroid/hardware/SensorManager;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getDefaultSensor(I)Landroid/hardware/Sensor;']: (s, t) => { const o = mkSimple('Landroid/hardware/Sensor;'); o.$type = t | 0; o.$name = 'sensor' + t; return o; },
      ['getSensorList(I)Ljava/util/List;']: (s, t) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
      ['registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;I)' + Z]: (s, l, sen, rate) => { H.registerSensor(l, sen && sen.$type, rate | 0); return 1; },
      ['registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;II)' + Z]: (s, l, sen, rate) => { H.registerSensor(l, sen && sen.$type, rate | 0); return 1; },
      ['unregisterListener(Landroid/hardware/SensorEventListener;)' + V]: (s, l) => H.unregisterSensor(l),
      ['unregisterListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;)' + V]: (s, l) => H.unregisterSensor(l),
      ['getAngleChange(FFFF)' + F]: () => Math.fround(0),
      ['rotationMatrixFromVector([F[F)' + V]: () => {},
    },
    sm: {
      ['getRotationMatrix([F[FI[F)' + Z]: () => 1,
      ['getOrientation([F[F)' + V]: () => {},
      ['gravity([F[F)' + V]: () => {},
      ['SENSOR_DELAY_UI:I']: 2, ['SENSOR_DELAY_GAME:I']: 1, ['SENSOR_DELAY_FASTEST:I']: 0, ['SENSOR_DELAY_NORMAL:I']: 3,
    },
  });
  R.def('Landroid/hardware/SensorManager;', { access: 0x21, sup: 'Ljava/lang/Object;', statics: {
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_FASTEST:I': 0, 'Landroid/hardware/SensorManager;->SENSOR_DELAY_GAME:I': 1,
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_UI:I': 2, 'Landroid/hardware/SensorManager;->SENSOR_DELAY_NORMAL:I': 3,
    'Landroid/hardware/SensorManager;->SENSOR_TYPE_ACCELEROMETER:I': 1, 'Landroid/hardware/SensorManager;->SENSOR_TYPE_GYROSCOPE:I': 4,
    'Landroid/hardware/SensorManager;->SENSOR_TYPE_LIGHT:I': 5, 'Landroid/hardware/SensorManager;->SENSOR_TYPE_MAGNETIC_FIELD:I': 2,
  } });

  /* ---- location → geolocation ---- */
  R.def('Landroid/location/LocationManager;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['getLastKnownLocation(Ljava/lang/String;)Landroid/location/Location;']: () => H.lastLocation(),
      ['isProviderEnabled(Ljava/lang/String;)' + Z]: (s, p) => BOOL(H.geoAvailable()),
      ['getProviders(Z)Ljava/util/List;']: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: H.geoAvailable() ? ['gps', 'network'] : [] }),
      ['getBestProvider(Landroid/location/Criteria;Z)Ljava/lang/String;']: () => (H.geoAvailable() ? 'network' : null),
      ['requestLocationUpdates(Ljava/lang/String;JFLandroid/location/LocationListener;)' + V]: (s, p, t, d, l) => H.watchLocation(l),
      ['requestLocationUpdates(Ljava/lang/String;JFLjava/util/concurrent/Executor;Landroid/location/LocationListener;)' + V]: (s, p, t, d, e, l) => H.watchLocation(l),
      ['requestLocationUpdates(JFLandroid/location/LocationListener;)' + V]: (s, t, d, l) => H.watchLocation(l),
      ['removeUpdates(Landroid/location/LocationListener;)' + V]: (s, l) => H.unwatchLocation(l),
      ['requestSingleUpdate(Ljava/lang/String;Landroid/location/LocationListener;Landroid/os/Looper;)' + V]: (s, p, l) => H.watchLocation(l, true),
    },
    sm: {
      ['GPS_PROVIDER:Ljava/lang/String;']: 'gps', ['NETWORK_PROVIDER:Ljava/lang/String;']: 'network', ['PASSIVE_PROVIDER:Ljava/lang/String;']: 'passive',
      ['KEY_PROVIDER_ENABLED:Ljava/lang/String;']: 'providerEnabled',
    },
  });
  R.def('Landroid/location/Criteria;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {} } });
  R.def('Landroid/location/LocationListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/location/Geocoder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>(Landroid/content/Context;)' + V]: () => {}, ['getFromLocation(DDI)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }) }, sm: { ['isPresent()' + Z]: () => 0 } });
  R.def('Landroid/location/Address;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ---- vibration / sound / clipboard ---- */
  R.def('Landroid/os/Vibrator;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['vibrate(' + J + ')' + V]: (s, ms) => H.vibrate(Number(ms)),
    ['vibrate(' + J + I + ')' + V]: (s, ms) => H.vibrate(Number(ms)),
    ['vibrate([JI)' + V]: (s, pat) => H.vibratePattern(pat || []),
    ['vibrate(Landroid/os/VibrationEffect;)' + V]: (s, e) => H.vibrate(e && e.$ms || 200),
    ['hasVibrator()' + Z]: () => BOOL(H.canVibrate()),
    ['cancel()' + V]: () => {},
  } });
  R.def('Landroid/os/VibrationEffect;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['createOneShot(JI)Landroid/os/VibrationEffect;']: (ms) => { const o = mkSimple('Landroid/os/VibrationEffect;'); o.$ms = Number(ms); return o; },
    ['createWaveform([JI)Landroid/os/VibrationEffect;']: (pat) => { const o = mkSimple('Landroid/os/VibrationEffect;'); o.$pat = pat; return o; },
  } });
  R.def('Landroid/media/SoundPool;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(II)V'.replace('II', 'II') + '']: () => {},
      ['load(Landroid/content/Context;II)' + I]: (s, c, res) => { s.$sounds = s.$sounds || new Map(); const id = (s.$next = (s.$next || 0) + 1); s.$sounds.set(id, H.resRawUri(res | 0)); return id; },
      ['load(Ljava/lang/String;I)' + I]: (s, p) => { s.$sounds = s.$sounds || new Map(); const id = (s.$next = (s.$next || 0) + 1); s.$sounds.set(id, p); return id; },
      ['load(Landroid/content/res/AssetFileDescriptor;I)' + I]: (s) => { s.$sounds = s.$sounds || new Map(); const id = (s.$next = (s.$next || 0) + 1); s.$sounds.set(id, null); return id; },
      ['play(IFFIIF)' + I]: (s, id, lv, rv, pr, loop, rate) => { H.playSound(s.$sounds && s.$sounds.get(id | 0), !!loop); return (id | 0) + 1000; },
      ['stop(I)' + V]: () => H.stopSounds(),
      ['pause(I)' + V]: () => H.stopSounds(),
      ['setVolume(IFF)' + V]: () => {},
      ['release()' + V]: () => H.stopSounds(),
      ['setOnLoadCompleteListener(Landroid/media/SoundPool$OnLoadCompleteListener;)' + V]: (s, l) => { s.$loadListener = l; H.post(() => { try { R.iv('Landroid/media/SoundPool$OnLoadCompleteListener;->onLoadComplete(Landroid/media/SoundPool;II)V', l, s, 1, 0); } catch (e) { H.crash(e); } }); },
      ['autoPause()' + V]: () => H.stopSounds(), ['autoResume()' + V]: () => {},
    },
  });
  R.def('Landroid/media/SoundPool$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['setMaxStreams(I)Landroid/media/SoundPool$Builder;']: (s) => s, ['setAudioAttributes(Landroid/media/AudioAttributes;)Landroid/media/SoundPool$Builder;']: (s) => s, ['build()Landroid/media/SoundPool;']: () => mkSimple('Landroid/media/SoundPool;') } });
  R.def('Landroid/media/SoundPool$OnLoadCompleteListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/AudioAttributes;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/media/AudioAttributes$Builder;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['<init>()' + V]: () => {}, ['setUsage(I)Landroid/media/AudioAttributes$Builder;']: (s) => s, ['setContentType(I)Landroid/media/AudioAttributes$Builder;']: (s) => s, ['build()Landroid/media/AudioAttributes;']: () => mkSimple('Landroid/media/AudioAttributes;') } });
  R.def('Landroid/content/ClipboardManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getPrimaryClip()Landroid/content/ClipData;']: () => H.clipboardRead(),
    ['getPrimaryClipDescription()Landroid/content/ClipDescription;']: () => null,
    ['hasPrimaryClip()' + Z]: () => BOOL(!!H.clipboardText()),
    ['setPrimaryClip(Landroid/content/ClipData;)' + V]: (s, d) => H.clipboardWrite(d && d.$text),
    ['setText(Ljava/lang/CharSequence;)' + V]: (s, t) => H.clipboardWrite(R.str(t)),
    ['getText()' + S]: () => H.clipboardText(),
    ['hasText()' + Z]: () => BOOL(!!H.clipboardText()),
  } });
  R.def('Landroid/content/ClipDescription;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ---- plurals + html ---- */
  R.def('Landroid/content/res/Resources;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getQuantityString(II)Ljava/lang/String;']: (s, id, n) => H.plural(id | 0, n | 0),
    ['getQuantityString(II[Ljava/lang/Object;)Ljava/lang/String;']: (s, id, n, a) => javaFormatLocal2(R, H.plural(id | 0, n | 0), a || []),
    ['getQuantityText(II)Ljava/lang/CharSequence;']: (s, id, n) => H.plural(id | 0, n | 0),
  } });
  R.def('Landroid/text/Html;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['fromHtml(Ljava/lang/String;)' + O]: (h) => htmlSpanned(R, String(h)),
    ['fromHtml(Ljava/lang/String;I)' + O]: (h) => htmlSpanned(R, String(h)),
    ['fromHtml(Ljava/lang/String;ILandroid/text/Html$ImageGetter;Landroid/text/Html$TagHandler;)' + O]: (h) => htmlSpanned(R, String(h)),
    ['toHtml(Landroid/text/Spanned;)' + S]: (s) => R.str(s),
  } });
  R.def('Landroid/text/Html$ImageGetter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/text/Html$TagHandler;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  function htmlSpanned(R, html) {
    const o = mkSimple('Landroid/text/Spanned;');
    o.$html = html;
    o.$t = String(html).replace(/<[^>]+>/g, '');
    return o;
  }
  R.def('Landroid/text/Spanned;', { access: 0x601, sup: 'Ljava/lang/CharSequence;', m: {
    ['toString()' + S]: (s) => s.$t || '',
    ['length()' + I]: (s) => (s.$t || '').length,
    ['charAt(I)' + C]: (s, i) => ((s.$t || '').charCodeAt(i | 0) || 0) & 0xffff,
    ['subSequence(II)Ljava/lang/CharSequence;']: (s, a, b) => (s.$t || '').slice(a | 0, b | 0),
  } });

  /* ---- notifications via toast + Web Notification API (graceful) ---- */
  R.def('Landroid/app/NotificationManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['notify(Ljava/lang/String;ILandroid/app/Notification;)' + V]: (s, tag, id, n) => H.notify(tag, id, n),
    ['createNotificationChannel(Landroid/app/NotificationChannel;)' + V]: (s, ch) => { H.log('I', 'Notification', 'channel ' + (ch && ch.$id)); },
    ['createNotificationChannels(Ljava/util/List;)' + V]: () => {},
    ['deleteNotificationChannel(Ljava/lang/String;)' + V]: () => {},
    ['getNotificationChannel(Ljava/lang/String;)Landroid/app/NotificationChannel;']: (s, id) => { const o = mkSimple('Landroid/app/NotificationChannel;'); o.$id = String(id); return o; },
    ['getNotificationChannels()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['getActiveNotifications()[Landroid/service/notification/StatusBarNotification;']: () => arr(R, '[Landroid/service/notification/StatusBarNotification;', []),
    ['cancel(I)' + V]: () => {}, ['cancel(Ljava/lang/String;I)' + V]: () => {}, ['cancelAll()' + V]: () => {},
    ['areNotificationsEnabled()' + Z]: () => 1,
  } });
  R.def('Landroid/service/notification/StatusBarNotification;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/NotificationChannel;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['<init>(Ljava/lang/String;Ljava/lang/CharSequence;I)' + V]: (s, id, name, imp) => { s.$id = String(id); s.$name = R.str(name); s.$imp = imp | 0; },
    ['setDescription(Ljava/lang/String;)' + V]: (s, d) => { s.$desc = d; },
    ['enableVibration(Z)' + V]: () => {}, ['setShowBadge(Z)' + V]: () => {},
    ['getId()' + S]: (s) => s.$id,
  } });
  R.def('Landroid/app/DownloadManager;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['enqueue(Landroid/app/DownloadManager$Request;)' + J]: (s, req) => H.download(req && req.$uri ? req.$uri.$u : null, req && req.$title),
      ['getUriForDownloadedFile(J)Landroid/net/Uri;']: (s, id) => { const u = H.downloadUri(Number(id)); return u ? { $c: R.klass('Landroid/net/Uri;'), $u: u } : null; },
      ['query(Landroid/app/DownloadManager$Query;)Landroid/database/Cursor;']: () => ({ $c: R.klass('Landroid/database/sqlite/SQLiteCursor;'), $cols: [], $rows: [], $i: -1 }),
      ['getMaxBytesOverMobile()' + J]: () => 0,
    },
    sm: { ['ACTION_DOWNLOAD_COMPLETE:Ljava/lang/String;']: 'android.intent.action.DOWNLOAD_COMPLETE', ['COLUMN_STATUS:Ljava/lang/String;']: 'status', ['STATUS_SUCCESSFUL:I']: 8, ['EXTRA_EXTRA_DOWNLOAD_ID:Ljava/lang/String;']: 'extra_download_id' },
  });
  R.def('Landroid/app/DownloadManager$Request;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['<init>(Landroid/net/Uri;)' + V]: (s, u) => { s.$uri = u; },
    ['setTitle(Ljava/lang/CharSequence;)Landroid/app/DownloadManager$Request;']: (s, t) => { s.$title = R.str(t); return s; },
    ['setDescription(Ljava/lang/CharSequence;)Landroid/app/DownloadManager$Request;']: (s, t) => { s.$desc = R.str(t); return s; },
    ['setDestinationInExternalPublicDir(Ljava/lang/String;Ljava/lang/String;)Landroid/app/DownloadManager$Request;']: (s) => s,
    ['setDestinationUri(Landroid/net/Uri;)Landroid/app/DownloadManager$Request;']: (s) => s,
    ['setNotificationVisibility(I)' + V]: () => {}, ['setMimeType(Ljava/lang/String;)' + V]: (s, m) => { s.$mime = m; },
    ['addRequestHeader(Ljava/lang/String;Ljava/lang/String;)' + V]: () => {},
    ['setAllowedNetworkTypes(I)' + V]: () => {},
  } });
  R.def('Landroid/app/DownloadManager$Query;', { access: 0x21, sup: 'Ljava/lang/Object;' });

  /* ---- connectivity / battery from the browser ---- */
  R.def('Landroid/net/ConnectivityManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getActiveNetworkInfo()Landroid/net/NetworkInfo;']: () => { const o = mkSimple('Landroid/net/NetworkInfo;'); o.$connected = typeof navigator === 'undefined' ? true : navigator.onLine !== false; return o; },
    ['getActiveNetwork()Landroid/net/Network;']: () => mkSimple('Landroid/net/Network;'),
    ['getNetworkCapabilities(Landroid/net/Network;)Landroid/net/NetworkCapabilities;']: () => { const o = mkSimple('Landroid/net/NetworkCapabilities;'); o.$transport = 1; return o; },
    ['registerDefaultNetworkCallback(Landroid/net/ConnectivityManager$NetworkCallback;)' + V]: (s, cb) => {
      if (typeof window === 'undefined') return;
      const net = () => mkSimple('Landroid/net/Network;');
      const on = () => { try { R.iv('Landroid/net/ConnectivityManager$NetworkCallback;->onAvailable(Landroid/net/Network;)V', cb, net()); } catch (e) { H.crash(e); } };
      const off = () => { try { R.iv('Landroid/net/ConnectivityManager$NetworkCallback;->onLost(Landroid/net/Network;)V', cb, net()); } catch (e) { H.crash(e); } };
      window.addEventListener('online', on); window.addEventListener('offline', off);
    },
    ['unregisterNetworkCallback(Landroid/net/ConnectivityManager$NetworkCallback;)' + V]: () => {},
  } });
  R.def('Landroid/net/ConnectivityManager$NetworkCallback;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['onAvailable(Landroid/net/Network;)' + V]: () => {}, ['onLost(Landroid/net/Network;)' + V]: () => {}, ['onCapabilitiesChanged(Landroid/net/Network;Landroid/net/NetworkCapabilities;)' + V]: () => {} } });
  R.def('Landroid/net/Network;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/net/NetworkCapabilities;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['hasTransport(I)' + Z]: (s, t) => BOOL((s.$transport | 0) === (t | 0)), ['hasCapability(I)' + Z]: () => 1 } });
  R.def('Landroid/net/NetworkInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['isConnected()' + Z]: (s) => BOOL(s.$connected !== false && (typeof navigator === 'undefined' || navigator.onLine !== false)), ['isAvailable()' + Z]: (s) => BOOL(s.$connected !== false), ['getType()' + I]: () => 1, ['getTypeName()' + S]: () => 'WIFI', ['getSubtypeName()' + S]: () => '', ['getState()Landroid/net/NetworkInfo$State;']: () => mkSimple('Landroid/net/NetworkInfo$State;'), ['getDetailedState()Landroid/net/NetworkInfo$DetailedState;']: () => mkSimple('Landroid/net/NetworkInfo$DetailedState;') } });
  R.def('Landroid/net/NetworkInfo$State;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/net/NetworkInfo$DetailedState;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/os/BatteryManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getIntProperty(I)' + I]: (s, p) => (p === 4 ? 100 : p === 5 ? 1 : 0),
    ['getLongProperty(I)' + J]: () => 0,
    ['isCharging()' + Z]: () => 0,
  }, statics: {
    'Landroid/os/BatteryManager;->EXTRA_LEVEL:I': 0, 'Landroid/os/BatteryManager;->EXTRA_SCALE:I': 1,
    'Landroid/os/BatteryManager;->EXTRA_STATUS:I': 2, 'Landroid/os/BatteryManager;->EXTRA_PLUGGED:I': 3,
    'Landroid/os/BatteryManager;->BATTERY_STATUS_CHARGING:I': 2, 'Landroid/os/BatteryManager;->BATTERY_STATUS_FULL:I': 5,
    'Landroid/os/BatteryManager;->BATTERY_PROPERTY_CAPACITY:I': 4,
  } });

  /* ---- LoaderManager ---- */
  function loaderRun(mgr, id, args, cb) {
    let loader = null;
    try { loader = R.iv('Landroid/app/LoaderManager$LoaderCallbacks;->onCreateLoader(ILandroid/os/Bundle;)Landroid/content/Loader;', cb, id | 0, args); }
    catch (e) { try { loader = R.iv('Landroidx/loader/app/LoaderManager$LoaderCallbacks;->onCreateLoader(ILandroid/os/Bundle;)Landroidx/loader/content/Loader;', cb, id | 0, args); } catch (e2) { H.crash(e2); return null; } }
    if (!loader) return null;
    loader.$id = id | 0;
    mgr.$loaders = mgr.$loaders || {};
    mgr.$loaders[id | 0] = loader;
    H.post(() => {
      let data = null;
      try { data = R.iv('Landroid/content/AsyncTaskLoader;->loadInBackground()Ljava/lang/Object;', loader); } catch (e) { H.crash(e); }
      loader.$data = data;
      try { R.iv('Landroid/app/LoaderManager$LoaderCallbacks;->onLoadFinished(Landroid/content/Loader;Ljava/lang/Object;)V', cb, loader, data); }
      catch (e) { try { R.iv('Landroidx/loader/app/LoaderManager$LoaderCallbacks;->onLoadFinished(Landroidx/loader/content/Loader;Ljava/lang/Object;)V', cb, loader, data); } catch (e2) { H.crash(e2); } }
    });
    return loader;
  }
  const loaderCallbacks = {
    ['initLoader(ILandroid/os/Bundle;Landroid/app/LoaderManager$LoaderCallbacks;)Landroid/app/Loader;']: (s, id, a, cb) => loaderRun(s, id, a, cb),
    ['initLoader(ILandroid/os/Bundle;Landroidx/loader/app/LoaderManager$LoaderCallbacks;)Landroidx/loader/content/Loader;']: (s, id, a, cb) => loaderRun(s, id, a, cb),
    ['restartLoader(ILandroid/os/Bundle;Landroid/app/LoaderManager$LoaderCallbacks;)Landroid/app/Loader;']: (s, id, a, cb) => loaderRun(s, id, a, cb),
    ['restartLoader(ILandroid/os/Bundle;Landroidx/loader/app/LoaderManager$LoaderCallbacks;)Landroidx/loader/content/Loader;']: (s, id, a, cb) => loaderRun(s, id, a, cb),
    ['destroyLoader(I)' + V]: (s, id) => { if (s.$loaders) delete s.$loaders[id | 0]; },
    ['getLoader(I)Landroid/app/Loader;']: (s, id) => (s.$loaders || {})[id | 0] || null,
    ['hasRunningLoaders()' + Z]: () => 0,
  };
  R.def('Landroid/app/LoaderManager;', { access: 0x421, sup: 'Ljava/lang/Object;', m: loaderCallbacks, sm: { ['getInstance(Landroid/app/Activity;)Landroid/app/LoaderManager;']: (a) => a && a.$loaderMgr ? a.$loaderMgr : (a ? (a.$loaderMgr = mkSimple('Landroid/app/LoaderManager;')) : mkSimple('Landroid/app/LoaderManager;')) } });
  R.def('Landroidx/loader/app/LoaderManager;', { access: 0x421, sup: 'Ljava/lang/Object;', m: loaderCallbacks, sm: { ['getInstance(Landroidx/lifecycle/LifecycleOwner;)Landroidx/loader/app/LoaderManager;']: (o) => (o && o.$loaderMgr) ? o.$loaderMgr : (o ? (o.$loaderMgr = mkSimple('Landroidx/loader/app/LoaderManager;')) : mkSimple('Landroidx/loader/app/LoaderManager;')) } });
  R.def('Landroid/app/LoaderManager$LoaderCallbacks;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroidx/loader/app/LoaderManager$LoaderCallbacks;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/Loader;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['getId()' + I]: (s) => s.$id | 0, ['getData()' + O]: (s) => (s.$data === undefined ? null : s.$data), ['isStarted()' + Z]: () => 1, ['isReset()' + Z]: () => 0, ['registerListener(ILandroid/content/Loader$OnLoadCompleteListener;)' + V]: () => {}, ['unregisterListener(Landroid/content/Loader$OnLoadCompleteListener;)' + V]: () => {}, ['forceLoad()' + V]: () => {}, ['startLoading()' + V]: () => {}, ['stopLoading()' + V]: () => {}, ['reset()' + V]: () => {} } });
  R.def('Landroid/content/Loader$OnLoadCompleteListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/content/AsyncTaskLoader;', { access: 0x421, sup: 'Landroid/content/Loader;', m: { ['<init>(Landroid/content/Context;)' + V]: (s) => { s.$data = null; }, ['loadInBackground()' + O]: () => null, ['deliverResult(' + O + ')' + V]: (s, d) => { s.$data = d; }, ['onForceLoad()' + V]: () => {} } });
  R.def('Landroidx/loader/content/AsyncTaskLoader;', { access: 0x421, sup: 'Landroid/content/AsyncTaskLoader;' });
  R.def('Landroidx/loader/content/Loader;', { access: 0x21, sup: 'Landroid/content/Loader;' });
  R.def('Landroid/content/CursorLoader;', { access: 0x21, sup: 'Landroid/content/AsyncTaskLoader;', m: { ['<init>(Landroid/content/Context;)' + V]: () => {}, ['<init>(Landroid/content/Context;Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)' + V]: (s, c, u, p, sel, sargs, order) => { s.$uri = u; s.$proj = p; s.$sel = sel; s.$sargs = sargs; s.$order = order; }, ['loadInBackground()' + O]: (s) => (s.$uri ? H.providerQuery(s.$uri, s.$proj, s.$sel, s.$sargs, s.$order) : null) } });
  R.def('Landroidx/loader/content/CursorLoader;', { access: 0x21, sup: 'Landroid/content/CursorLoader;' });

  /* ---- in-app ContentProviders ---- */
  R.def('Landroid/content/ContentProvider;', {
    access: 0x421, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>()' + V]: () => {},
      ['getContext()Landroid/content/Context;']: (s) => s.$ctx || H.applicationContext(),
      ['onCreate()' + Z]: () => 1,
      ['query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: () => null,
      ['insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;']: () => null,
      ['update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)' + I]: () => 0,
      ['delete(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)' + I]: () => 0,
      ['getType(Landroid/net/Uri;)' + S]: () => null,
    },
  });
  R.def('Landroid/content/ContentResolver;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, uri, proj, sel, sargs, order) => H.providerQuery(uri, proj, sel, sargs, order),
    ['query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;']: (s, uri, proj, sel, sargs, order, lim) => H.providerQuery(uri, proj, sel, sargs, order),
    ['insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;']: (s, uri, cv) => H.providerInsert(uri, cv),
    ['bulkInsert(Landroid/net/Uri;[Landroid/content/ContentValues;)' + I]: (s, uri, cvs) => { let n = 0; for (const cv of cvs || []) if (H.providerInsert(uri, cv)) n++; return n; },
    ['update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)' + I]: (s, uri, cv, sel, sargs) => H.providerUpdate(uri, cv, sel, sargs),
    ['delete(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)' + I]: (s, uri, sel, sargs) => H.providerDelete(uri, sel, sargs),
    ['getType(Landroid/net/Uri;)' + S]: () => 'vnd.android.cursor.dir/vnd.dex2web.item',
    ['acquireContentProviderClient(Landroid/net/Uri;)Landroid/content/ContentProviderClient;']: () => mkSimple('Landroid/content/ContentProviderClient;'),
  } });
  R.def('Landroid/content/ContentProviderClient;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { ['close()' + V]: () => {} } });
  R.def('Landroid/content/ContentUris;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['appendId(Landroid/net/Uri$Builder;J)Landroid/net/Uri$Builder;']: (b, id) => { b.$u = (b.$u || '') + '/' + id; return b; },
    ['withAppendedId(Landroid/net/Uri;J)Landroid/net/Uri;']: (u, id) => ({ $c: R.klass('Landroid/net/Uri;'), $u: (u ? u.$u : '') + '/' + id }),
    ['parseId(Landroid/net/Uri;)' + J]: (u) => { const p = String(u && u.$u || '').split('/').pop(); const n = parseInt(p, 10); return isNaN(n) ? -1 : n; },
  } });

  /* ---- EditText input filters + ListView choice modes ---- */
  R.def('Landroid/widget/EditText;', { access: 0x21, sup: 'Landroid/widget/TextView;', m: {
    ['setFilters([Landroid/text/InputFilter;)' + V]: (s, f) => {
      s.$filters = f || [];
      let max = -1;
      for (const fl of s.$filters) if (fl && fl.$max !== undefined) max = fl.$max;
      if (s.$el && max >= 0) s.$el.maxLength = max;
    },
    ['getFilters()[Landroid/text/InputFilter;']: (s) => s.$filters || null,
    ['setImeOptions(I)' + V]: (s, o) => { s.$ime = o | 0; },
    ['getImeOptions()' + I]: (s) => s.$ime || 0,
    ['setSelection(II)' + V]: (s, a, b) => { const e = s.$el; if (e && e.setSelectionRange) try { e.setSelectionRange(a | 0, b | 0); } catch {} },
  } });
  R.def('Landroid/text/InputFilter$LengthFilter;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/text/InputFilter;'], m: { ['<init>(I)' + V]: (s, n) => { s.$max = n | 0; }, ['filter(Ljava/lang/CharSequence;IILandroid/text/Spanned;II)Ljava/lang/CharSequence;']: () => null } });
  R.def('Landroid/widget/AbsListView;', { access: 0x421, sup: 'Landroid/widget/AdapterView;', m: {
    ['setChoiceMode(I)' + V]: (s, m) => { s.$choiceMode = m | 0; },
    ['getChoiceMode()' + I]: (s) => s.$choiceMode || 0,
    ['setSelector(I)' + V]: () => {},
    ['setSelector(Landroid/graphics/drawable/Drawable;)' + V]: () => {},
    ['setFastScrollEnabled(Z)' + V]: () => {},
    ['smoothScrollToPosition(I)' + V]: () => {},
  } });
  R.def('Landroid/widget/ListView;', { access: 0x21, sup: 'Landroid/widget/AbsListView;', m: {
    ['getCheckedItemPosition()' + I]: (s) => (s.$checked === undefined ? -1 : s.$checked),
    ['getCheckedItemPositions()Landroid/util/SparseBooleanArray;']: (s) => { const o = mkSimple('Landroid/util/SparseBooleanArray;'); o.$m = new Map(s.$checkedSet || []); return o; },
    ['getCheckedItemIds()[J']: (s) => { const a = [...(s.$checkedSet || new Map()).keys()]; a[ARR_CLASS] = R.klass('[J'); return a; },
    ['setItemChecked(IZ)' + V]: (s, i, on) => { s.$checkedSet = s.$checkedSet || new Map(); if (on) s.$checkedSet.set(i | 0, true); else s.$checkedSet.delete(i | 0); s.$checked = i | 0; H.refreshChoice(s); },
    ['clearChoices()' + V]: (s) => { s.$checkedSet = new Map(); s.$checked = -1; H.refreshChoice(s); },
    ['addHeaderView(Landroid/view/View;)' + V]: (s, v) => { (s.$headers = s.$headers || []).push(v); H.renderer.relayout(s); },
    ['addFooterView(Landroid/view/View;)' + V]: (s, v) => { (s.$footers = s.$footers || []).push(v); H.renderer.relayout(s); },
  } });

  /* ---- RemoteViews + PendingIntent ---- */
  R.def('Landroid/widget/RemoteViews;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      ['<init>(Ljava/lang/String;I)' + V]: (s, pkg, layout) => { s.$pkg = pkg; s.$layout = layout | 0; s.$actions = []; },
      ['<init>(Landroid/content/Context;I)' + V]: (s, c, layout) => { s.$layout = layout | 0; s.$actions = []; },
      ['setTextViewText(ILjava/lang/CharSequence;)' + V]: (s, id, t) => { s.$actions.push(['text', id | 0, R.str(t)]); },
      ['setViewVisibility(II)' + V]: (s, id, v) => { s.$actions.push(['vis', id | 0, v | 0]); },
      ['setOnClickPendingIntent(ILandroid/app/PendingIntent;)' + V]: (s, id, pi) => { s.$actions.push(['click', id | 0, pi]); },
      ['setOnClickFillInIntent(ILandroid/content/Intent;)' + V]: () => {},
      ['setImageViewResource(II)' + V]: (s, id, r) => { s.$actions.push(['img', id | 0, r | 0]); },
      ['setProgressBar(IIIZ)' + V]: (s, id, max, prog) => { s.$actions.push(['prog', id | 0, max | 0, prog | 0]); },
      ['setInt(Ljava/lang/String;Ljava/lang/String;I)' + V]: () => {},
      ['setString(ILjava/lang/String;Ljava/lang/String;)' + V]: (s, id, m, v) => { s.$actions.push(['text', id | 0, String(v)]); },
      ['setBoolean(ILjava/lang/String;Z)' + V]: () => {},
      ['setTextColor(II)' + V]: () => {},
      ['apply(Landroid/content/Context;Landroid/view/ViewGroup;)Landroid/view/View;']: (s, ctx, parent) => H.applyRemoteViews(s, ctx, parent, null),
      ['reapply(Landroid/content/Context;Landroid/view/View;)' + V]: (s, ctx, view) => { H.applyRemoteViews(s, ctx, view && view.$parent, view); },
    },
  });
  R.def('Landroid/app/PendingIntent;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getIntent()Landroid/content/Intent;']: (s) => s.$intent || null,
    ['send()' + V]: (s) => { if (s.$broadcast) H.sendBroadcastInternal(s.$intent); else if (s.$intent) H.startActivity(s.$intent); },
    ['send(I)' + V]: (s) => { if (s.$broadcast) H.sendBroadcastInternal(s.$intent); else if (s.$intent) H.startActivity(s.$intent); },
    ['cancel()' + V]: () => {},
  }, sm: {
    ['getActivity(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: (c, rc, i, f) => { const o = mkSimple('Landroid/app/PendingIntent;'); o.$intent = i; return o; },
    ['getActivities(Landroid/content/Context;I[Landroid/content/Intent;I)Landroid/app/PendingIntent;']: (c, rc, is, f) => { const o = mkSimple('Landroid/app/PendingIntent;'); o.$intent = is && is[0]; return o; },
    ['getBroadcast(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: (c, rc, i, f) => { const o = mkSimple('Landroid/app/PendingIntent;'); o.$intent = i; o.$broadcast = true; return o; },
    ['getService(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: (c, rc, i, f) => { const o = mkSimple('Landroid/app/PendingIntent;'); o.$intent = i; return o; },
    ['getForegroundService(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;']: (c, rc, i, f) => { const o = mkSimple('Landroid/app/PendingIntent;'); o.$intent = i; return o; },
  } });
  R.klass('Landroid/app/PendingIntent;').statics['Landroid/app/PendingIntent;->FLAG_UPDATE_CURRENT:I'] = 134217728;
  R.klass('Landroid/app/PendingIntent;').statics['Landroid/app/PendingIntent;->FLAG_IMMUTABLE:I'] = 67108864;
  R.klass('Landroid/app/PendingIntent;').statics['Landroid/app/PendingIntent;->FLAG_MUTABLE:I'] = 33554432;
  R.klass('Landroid/app/PendingIntent;').statics['Landroid/app/PendingIntent;->FLAG_CANCEL_CURRENT:I'] = 268435456;
}


/* ---------------- digest helpers (synchronous) ---------------- */
function md5(bytes) {
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const len = bytes.length;
  const withOne = bytes.concat([0x80]);
  while (withOne.length % 64 !== 56) withOne.push(0);
  const bits = len * 8;
  for (let i = 0; i < 8; i++) withOne.push((i < 4 ? (bits >>> (i * 8)) : 0) & 0xff);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < withOne.length; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = withOne[off + i * 4] | (withOne[off + i * 4 + 1] << 8) | (withOne[off + i * 4 + 2] << 16) | (withOne[off + i * 4 + 3] << 24);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = [];
  for (const v of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out.push((v >>> (i * 8)) & 0xff);
  return signedBytes(out);
}
function sha1(bytes) {
  const len = bytes.length;
  const msg = bytes.concat([0x80]);
  while (msg.length % 64 !== 56) msg.push(0);
  const bits = len * 8;
  for (let i = 7; i >= 0; i--) msg.push(i < 4 ? (bits >>> (i * 8)) & 0xff : 0);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  const w = new Uint32Array(80);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
    for (let i = 16; i < 80; i++) { const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (v << 1) | (v >>> 31); }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = [];
  for (const v of [h0, h1, h2, h3, h4]) for (let i = 3; i >= 0; i--) out.push((v >>> (i * 8)) & 0xff);
  return signedBytes(out);
}
function sha256(bytes) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = bytes.length;
  const msg = bytes.concat([0x80]);
  while (msg.length % 64 !== 56) msg.push(0);
  const bits = len * 8;
  for (let i = 7; i >= 0; i--) msg.push(i < 4 ? (bits >>> (i * 8)) & 0xff : 0);
  const w = new Uint32Array(64);
  const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) >>> 0);
  }
  const out = [];
  for (const v of H) for (let i = 3; i >= 0; i--) out.push((v >>> (i * 8)) & 0xff);
  return signedBytes(out);
}
function signedBytes(arr) { return arr.map((b) => (b > 127 ? b - 256 : b)); }
