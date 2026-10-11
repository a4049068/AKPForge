/* host.js — the "Android" that a transpiled APK runs on top of.
 *
 * Owns: the ZIP, the resource table, the manifest, the dex files, the VM, the
 * transpiler and the DOM renderer. Implements every service the framework shim
 * in framework.js / ui.js asks for (resources, layout inflation, activities,
 * preferences, media, logcat, dialogs…). */

import { ZipArchive } from './zip.js';
import { parseAxml, axmlToXml, attr, findAll, TYPE, formatTypedValue, argbToCss } from './axml.js';
import { ResourceTable } from './arsc.js';
import { DexFile } from './dex.js';
import { decodeInsn } from './dexops.js';
function decodeInsnAt(dex, code, pc) { try { return decodeInsn(code.code, pc, dex); } catch { return null; } }
import { Transpiler } from './transpile.js';
import { Runtime, ARR_CLASS } from './runtime.js';
import { installFramework } from './framework.js';
import { applyDeviceProfile, isEnabled as spoofEnabled, PROFILES, DEFAULT_PROFILE } from './deviceprofile.js';
import { Renderer, installWidgets, unpackDimension, dimToPx, svgUri, MATCH_PARENT, WRAP_CONTENT, VISIBLE, INVISIBLE, GONE } from './ui.js';
import { installSqlite } from './sqlite.js';

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

const SHORT_VIEWS = {
  View: 'Landroid/view/View;', ViewGroup: 'Landroid/view/ViewGroup;',
  TextView: 'Landroid/widget/TextView;', Button: 'Landroid/widget/Button;',
  EditText: 'Landroid/widget/EditText;', ImageView: 'Landroid/widget/ImageView;',
  ImageButton: 'Landroid/widget/ImageButton;', CheckBox: 'Landroid/widget/CheckBox;',
  RadioButton: 'Landroid/widget/RadioButton;', RadioGroup: 'Landroid/widget/RadioGroup;',
  Switch: 'Landroid/widget/Switch;', ToggleButton: 'Landroid/widget/ToggleButton;',
  LinearLayout: 'Landroid/widget/LinearLayout;', RelativeLayout: 'Landroid/widget/RelativeLayout;',
  FrameLayout: 'Landroid/widget/FrameLayout;', TableLayout: 'Landroid/widget/TableLayout;',
  TableRow: 'Landroid/widget/TableRow;', GridLayout: 'Landroid/widget/GridLayout;',
  ScrollView: 'Landroid/widget/ScrollView;', HorizontalScrollView: 'Landroid/widget/HorizontalScrollView;',
  ProgressBar: 'Landroid/widget/ProgressBar;', SeekBar: 'Landroid/widget/SeekBar;',
  RatingBar: 'Landroid/widget/RatingBar;', Spinner: 'Landroid/widget/Spinner;',
  ListView: 'Landroid/widget/ListView;', GridView: 'Landroid/widget/GridView;',
  Space: 'Landroid/widget/Space;', ViewStub: 'Landroid/widget/ViewStub;',
  VideoView: 'Landroid/widget/VideoView;', SearchView: 'Landroid/widget/SearchView;',
  DatePicker: 'Landroid/widget/DatePicker;', TimePicker: 'Landroid/widget/TimePicker;',
  Chronometer: 'Landroid/widget/Chronometer;', AnalogClock: 'Landroid/widget/AnalogClock;',
  TextClock: 'Landroid/widget/TextClock;', NumberPicker: 'Landroid/widget/NumberPicker;',
  WebView: 'Landroid/webkit/WebView;', SurfaceView: 'Landroid/view/SurfaceView;',
  GLSurfaceView: 'Landroid/opengl/GLSurfaceView;', ExpandableListView: 'Landroid/widget/ExpandableListView;',
  ViewFlipper: 'Landroid/widget/ViewFlipper;', ViewSwitcher: 'Landroid/widget/ViewSwitcher;',
  TabHost: 'Landroid/widget/TabHost;', CalendarView: 'Landroid/widget/CalendarView;',
  AutoCompleteTextView: 'Landroid/widget/AutoCompleteTextView;',
  MultiAutoCompleteTextView: 'Landroid/widget/MultiAutoCompleteTextView;',
};

/* RelativeLayout rule verbs → CSS-ish intent */
const RL_RULES = {
  layout_toLeftOf: 0, layout_toRightOf: 1, layout_above: 2, layout_below: 3,
  alignBaseline: 4, alignLeft: 5, alignTop: 6, alignRight: 7, alignBottom: 8,
  alignStart: 19, alignEnd: 20, alignParentLeft: 9, alignParentTop: 10,
  alignParentRight: 11, alignParentBottom: 12, alignParentStart: 21, alignParentEnd: 22,
  centerHorizontal: 13, centerVertical: 14, centerInParent: 15,
};

export class Host {
  constructor() {
    this.logs = [];
    this.listeners = { log: [], status: [], event: [] };
    this.tasks = [];
    this.timers = new Set();
    this.prefsStore = new Map();
    this.media = null;
    this.activities = [];
    this.dialogEl = null;
    this.toastEl = null;
    this._zipCache = new Map();
    this._drawableCache = new Map();
    this._axmlCache = new Map();
    this.crashes = [];
    this._vfs = new Map();
    this.tagRegistry = new Map();
    this.synthesizeOwners = false;
    this.taskExecutions = 0;
    this.taskBudget = 30000;
    this.queueCap = 20000;
    this._postCounts = new WeakMap();
    this.statusBarColor = null;
    this.navBarColor = null;
    this.startedAt = 0;
  }

  on(ev, fn) { if (this.listeners[ev]) this.listeners[ev].push(fn); }
  emit(ev, ...args) { for (const f of (this.listeners[ev] || [])) { try { f(...args); } catch (e) { console.error(e); } } }

  /* ================================================================== */
  /*  Loading                                                            */
  /* ================================================================== */
  async loadApk(bytes, filename, progress = () => {}) {
    this.filename = filename;
    this.apkBytes = bytes;
    progress('read', 'Opening ZIP container');
    this.zip = ZipArchive.open(bytes);
    this.entries = this.zip.order.map((n) => {
      const e = this.zip.get(n);
      return { name: n, size: e.uncompSize, compSize: e.compSize, method: e.method, dir: e.isDir };
    });

    progress('resources', 'Decoding resources.arsc');
    this.rt = null;
    if (this.zip.has('resources.arsc')) {
      try { this.rt = new ResourceTable(await this.zip.data('resources.arsc')); }
      catch (e) { this.log('E', 'Dex2Web', `resources.arsc: ${e.message}`); this.rt = null; }
    }

    progress('manifest', 'Parsing AndroidManifest.xml');
    const manBytes = await this.zip.data('AndroidManifest.xml');
    this.manifestXml = parseAxml(manBytes);
    this.manifest = this._readManifest(this.manifestXml);

    progress('dex', 'Parsing DEX');
    const dexNames = this.zip.order.filter((n) => /^classes\d*\.dex$/.test(n)).sort((a, b) => {
      const na = a.match(/\d+/), nb = b.match(/\d+/);
      return (na ? Number(na[0]) : 1) - (nb ? Number(nb[0]) : 1);
    });
    this.dexes = [];
    for (let i = 0; i < dexNames.length; i++) {
      progress('dex', `Decoding ${dexNames[i]} (${i + 1}/${dexNames.length})`);
      const data = await this.zip.data(dexNames[i]);
      this.dexes.push({ name: dexNames[i], bytes: data, dex: new DexFile(data, dexNames[i]) });
    }
    this.nativeLibs = this.zip.order.filter((n) => n.endsWith('.so'));
    this.assets = this.zip.order.filter((n) => n.startsWith('assets/'));
    this.resFiles = this.zip.order.filter((n) => n.startsWith('res/'));

    progress('vm', 'Building the JavaScript runtime');
    this.R = new Runtime({
      log: (lvl, tag, msg, tr) => this.log(lvl, tag, msg, tr),
      onUnresolved: (kind, key) => this.onUnresolved(kind, key),
      captureStack: () => this._stack(),
    });
    this.renderer = new Renderer(this.R, this, null);
    installFramework(this.R, this);
    installWidgets(this.R, this);
    installSqlite(this.R, this);
    this.R.env.ui = this.renderer;
    if (this.rt) this.rt.prefer = this.resConfig();

    progress('transpile', 'Indexing classes and transpiling');
    this.transpiler = new Transpiler(this.R, this.dexes);
    this.transpiler.index();
    this.transpiler.declareClasses();
    this.R.transpiler = this.transpiler;

    progress('app', 'Instantiating Application');
    this._instantiateApplication();

    progress('icon', 'Extracting icon');
    this.iconDataUri = await this.appIconDataUri();

    progress('done', 'Ready');
    return this;
  }

  _readManifest(doc) {
    const root = doc.root;
    const man = (root.children || []).find((c) => c.tag === 'manifest') || root;
    const g = (node, name) => { const a = attr(node, name); return a ? a : null; };
    const gv = (node, name) => { const a = g(node, name); return a ? a.value : undefined; };
    const appId = gv(man, 'package');
    const app = findAll(man, 'application')[0] || { attrs: [], children: [] };
    const activities = findAll(app, 'activity').concat(findAll(app, 'activity-alias'));
    let launcher = null;
    for (const a of activities) {
      const filters = (a.children || []).filter((c) => c.tag === 'intent-filter');
      for (const f of filters) {
        const acts = (f.children || []).filter((c) => c.tag === 'action').map((c) => String(gv(c, 'name') ?? ''));
        const cats = (f.children || []).filter((c) => c.tag === 'category').map((c) => String(gv(c, 'name') ?? ''));
        if (acts.includes('android.intent.action.MAIN') &&
            (cats.includes('android.intent.category.LAUNCHER') || cats.includes('android.intent.category.LEANBACK_LAUNCHER'))) {
          launcher = a; break;
        }
      }
      if (launcher) break;
    }
    const resolveName = (n) => {
      if (!n) return n;
      if (n.startsWith('.')) return appId + n;
      if (!n.includes('.')) return appId + '.' + n;
      return n;
    };
    const perms = findAll(man, 'uses-permission').map((p) => String(gv(p, 'name') ?? '')).concat(
      findAll(man, 'uses-permission-sdk-23').map((p) => String(gv(p, 'name') ?? '')));
    const usesSdk = findAll(man, 'uses-sdk')[0];
    const iconAttr = g(app, 'icon');
    const labelAttr = g(app, 'label');
    const appNameAttr = g(app, 'name');
    return {
      doc,
      package: appId,
      applicationName: appNameAttr ? resolveName(String(appNameAttr.value ?? appNameAttr.rawValue ?? '')) : null,
      versionCode: gv(man, 'versionCode'),
      versionName: gv(man, 'versionName'),
      minSdk: usesSdk ? gv(usesSdk, 'minSdkVersion') : undefined,
      targetSdk: usesSdk ? gv(usesSdk, 'targetSdkVersion') : undefined,
      application: app,
      label: labelAttr ? this._attrText(labelAttr) : appId,
      iconResId: iconAttr && (iconAttr.dataType === TYPE.REFERENCE) ? iconAttr.data : null,
      themeResId: (() => { const t = g(app, 'theme'); return t && t.dataType === TYPE.REFERENCE ? t.data : null; })(),
      allowBackup: gv(app, 'allowBackup'),
      debuggable: gv(app, 'debuggable'),
      activities: activities.map((a) => ({
        name: resolveName(String(gv(a, 'name') ?? '')),
        label: (() => { const l = g(a, 'label'); return l ? this._attrText(l) : null; })(),
        exported: gv(a, 'exported'),
        theme: (() => { const t = g(a, 'theme'); return t && t.dataType === TYPE.REFERENCE ? t.data : null; })(),
        screenOrientation: gv(a, 'screenOrientation'),
        configChanges: gv(a, 'configChanges'),
        node: a,
      })),
      launcherName: launcher ? resolveName(String(gv(launcher, 'name') ?? '')) : (activities.length ? resolveName(String(gv(activities[0], 'name') ?? '')) : null),
      services: findAll(app, 'service').map((s) => resolveName(String(gv(s, 'name') ?? ''))),
      receivers: findAll(app, 'receiver').map((s) => resolveName(String(gv(s, 'name') ?? ''))),
      providers: findAll(app, 'provider').map((s) => resolveName(String(gv(s, 'name') ?? ''))),
      permissions: [...new Set(perms)],
      features: findAll(man, 'uses-feature').map((f) => String(gv(f, 'name') ?? '')),
    };
  }

  _attrText(a) {
    if (a.dataType === TYPE.STRING) return a.rawValue !== null ? a.rawValue : a.value;
    if (a.dataType === TYPE.REFERENCE && this.rt) {
      const s = this.rt.string(a.data);
      if (s !== null && s !== undefined) return s;
      const e = this.rt.resolveValue(a.data);
      return e ? this.rt.describe(e) : `@0x${a.data.toString(16)}`;
    }
    if (a.value && typeof a.value === 'object' && a.value.text !== undefined) return a.value.text;
    return a.value === null || a.value === undefined ? a.rawValue : String(a.value);
  }

  /* ================================================================== */
  /*  Resources                                                          */
  /* ================================================================== */
  resources() { return this._resourcesObj || (this._resourcesObj = this._makeResources()); }
  _makeResources() {
    const R = this.R;
    const c = R.klass('Landroid/content/res/Resources;');
    R.initClass(c);
    return R.newInstanceObj(c);
  }
  get packageName() { return this.manifest ? this.manifest.package : 'unknown'; }
  /**
   * Android instantiates the class named by <application android:name="…">
   * before any activity, and getApplicationContext() hands out that instance.
   * Without this, apps that cast the context to their own Application subclass
   * hit a ClassCastException on their very first line.
   */
  _instantiateApplication() {
    const R = this.R;
    const name = this.manifest && this.manifest.applicationName;
    let desc = 'Landroid/app/Application;';
    if (name) {
      const d = 'L' + name.replace(/\./g, '/') + ';';
      if (R.classes.has(d)) desc = d;
      else this.log('W', 'Dex2Web', `manifest application class ${name} not found in DEX — using android.app.Application`);
    }
    const cls = R.klass(desc);
    R.initClass(cls);
    const app = R.newInstanceObj(cls);
    this._appCtx = app;
    try {
      const ci = R.findMethod(cls, '<init>()V');
      if (ci) R.callMethod(ci, [app]);
      this._callLifecycle(cls, app, 'onCreate', '()V', []);
      this.log('I', 'ActivityManager', `Application ${desc.slice(1, -1).replace(/\//g, '.')} created`);
    } catch (e) { this.crash(e); }
    return app;
  }
  applicationContext() {
    if (this._appCtx) return this._appCtx;
    return this._instantiateApplication();
  }
  currentActivity() { return this.activities.length ? this.activities[this.activities.length - 1] : this.applicationContext(); }
  displayMetrics() {
    const R = this.R;
    const c = R.klass('Landroid/util/DisplayMetrics;');
    const o = R.newInstanceObj(c);
    o['Landroid/util/DisplayMetrics;->widthPixels:I'] = this.screenWidth();
    o['Landroid/util/DisplayMetrics;->heightPixels:I'] = this.screenHeight();
    o['Landroid/util/DisplayMetrics;->density:F'] = 1;
    o['Landroid/util/DisplayMetrics;->densityDpi:I'] = 160;
    o['Landroid/util/DisplayMetrics;->scaledDensity:F'] = 1;
    return o;
  }
  screenWidth() { return this.renderer.screen ? this.renderer.screen.clientWidth : 360; }
  screenHeight() { return this.renderer.screen ? this.renderer.screen.clientHeight : 640; }
  systemService(name) {
    const R = this.R;
    const map = {
      layout_inflater: () => this.layoutInflater(this.currentActivity()),
      window: () => ({ $c: R.klass('Landroid/view/WindowManager;') }),
      vibrator: 'Landroid/os/Vibrator;',
      alarm: null, notification: 'Landroid/app/NotificationManager;',
      audio: 'Landroid/media/AudioManager;', clipboard: 'Landroid/clipboard/ClipboardManager;',
      location: 'Landroid/location/LocationManager;', connectivity: 'Landroid/net/ConnectivityManager;',
      activity: 'Landroid/app/ActivityManager;', appops: 'Landroid/app/AppOpsManager;',
      display: null, wallpaper: null, batterymanager: null, storage: null, usb: null, bluetooth: null,
      nfc: null, media_router: null, shortcut: null, jobscheduler: null,
      device_policy: null, fingerprint: null, vibrator_manager: null, uimode: null, search: null,
      camera: null, print: null, restriction: null, usage_stats: null, network_stats: null,
      power: 'Landroid/os/PowerManager;', input_method: 'Landroid/view/inputmethod/InputMethodManager;',
      sensor: 'Landroid/hardware/SensorManager;', wifi: null, keyguard: null, accessibility: 'Landroid/view/accessibility/AccessibilityManager;',
      telephony: 'Landroid/telephony/TelephonyManager;',
    };
    if (!(name in map)) { this.log('W', 'Context', `getSystemService("${name}") → null`); return null; }
    const v = map[name];
    if (typeof v === 'function') return v();
    if (!v) return null;
    const c = R.klass(v); R.initClass(c); return R.newInstanceObj(c);
  }
  layoutInflater(ctx) {
    const R = this.R;
    const c = R.klass('Landroid/view/LayoutInflater;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$ctx = ctx || this.currentActivity();
    return o;
  }
  resString(id) {
    id |= 0;
    const c = this._resStrCache || (this._resStrCache = new Map());
    if (c.has(id)) return c.get(id);
    const v = this._resString(id);
    c.set(id, v);
    return v;
  }
  _resString(id) {
    if (!this.rt) return null;
    const s = this.rt.string(id | 0);
    if (s !== null && s !== undefined) return s;
    const e = this.rt.get(id | 0);
    return e ? this.rt.describe(e) : null;
  }
  resStringArray(id) {
    if (!this.rt) return null;
    const e = this.rt.get(id | 0);
    if (!e || !e.complex) return null;
    return e.values.map((v) => (v.dataType === TYPE.STRING ? this.rt.string(v.data) ?? (this.rt.valuePool ? this.rt.valuePool.get(v.data) : null) : this.rt.describe({ dataType: v.dataType, data: v.data, value: v.value })));
  }
  resIntArray(id) {
    if (!this.rt) return null;
    const e = this.rt.get(id | 0);
    if (!e || !e.complex) return null;
    return e.values.map((v) => v.data | 0);
  }
  resColor(id) {
    id |= 0;
    const c = this._resColCache || (this._resColCache = new Map());
    if (c.has(id)) return c.get(id);
    const v = this._resColor(id);
    c.set(id, v);
    return v;
  }
  _resColor(id) {
    if (!this.rt) return 0xff000000 | 0;
    const e = this.rt.resolveValue(id | 0);
    if (!e) return 0xff000000 | 0;
    if (e.dataType >= TYPE.INT_COLOR_ARGB8 && e.dataType <= TYPE.INT_COLOR_RGB4) return e.data | 0;
    if (e.dataType === TYPE.INT_DEC || e.dataType === TYPE.INT_HEX) return e.data | 0;
    if (e.dataType === TYPE.STRING && typeof e.str === 'string') {
      try { const c = parseCssColor(e.str); if (c !== null) return c; } catch {}
    }
    return 0xff000000 | 0;
  }
  resDimen(id) {
    id |= 0;
    const c = this._resDimCache || (this._resDimCache = new Map());
    if (c.has(id)) return c.get(id);
    const v = this._resDimen(id);
    c.set(id, v);
    return v;
  }
  _resDimen(id) {
    if (!this.rt) return 0;
    const e = this.rt.resolveValue(id | 0);
    if (!e) return 0;
    if (e.dataType === TYPE.DIMENSION) { const d = unpackDimension(e.data); return dimToPx(d.value, d.unit); }
    if (e.dataType === TYPE.FLOAT) return e.value;
    if (e.dataType === TYPE.INT_DEC) return e.data | 0;
    return 0;
  }
  resBoolean(id) { const e = this.rt && this.rt.resolveValue(id | 0); return e && (e.dataType === TYPE.INT_BOOLEAN ? e.data !== 0 : !!e.data); }
  resInt(id) { const e = this.rt && this.rt.resolveValue(id | 0); return e ? (e.data | 0) : 0; }
  resIdentifier(name, type) {
    if (!this.rt) return 0;
    const e = this.rt.find(type, name);
    return e ? e.resId : 0;
  }
  resLayoutParser(id) { return null; }
  typedArray(id) {
    const R = this.R;
    const c = R.klass('Landroid/content/res/TypedArray;');
    const o = R.newInstanceObj(c);
    o.$vals = this.resIntArray(id) || [];
    return o;
  }
  openAsset(name) { return this._streamFromZip('assets/' + name.replace(/^assets\//, '')); }
  openRawResource(id) {
    const e = this.rt && this.rt.get(id | 0);
    if (!e || !e.str) return null;
    return this._streamFromZip(e.str);
  }
  _streamFromZip(path) {
    const R = this.R;
    if (!this.zip.has(path)) { this.log('W', 'Asset', `not found: ${path}`); return null; }
    const data = this.zip.dataSync(path);
    const c = R.klass('Ljava/io/ByteArrayInputStream;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    const b = Array.from(data); b[ARR_CLASS] = R.klass('[B');
    o.$b = b; o.$p = 0;
    return o;
  }

  /** layout resource id → path inside the APK */
  layoutPath(id) {
    const e = this.rt && this.rt.get(id | 0);
    if (!e) return null;
    if (e.str && this.zip.has(e.str)) return e.str;
    // fall back to matching by key
    const cand = this.resFiles.filter((n) => n.endsWith('/' + e.key + '.xml'));
    return cand.length ? cand[0] : null;
  }
  async axml(path) {
    if (this._axmlCache.has(path)) return this._axmlCache.get(path);
    if (!this.zip.has(path)) { this._axmlCache.set(path, null); return null; }
    const doc = parseAxml(await this.zip.data(path));
    this._axmlCache.set(path, doc);
    return doc;
  }

  /* ---- drawables ---- */
  resDrawable(id) {
    if (this._drawableCache.has(id)) return this._drawableCache.get(id);
    const d = this._buildDrawable(id | 0);
    this._drawableCache.set(id | 0, d);
    return d;
  }
  _buildDrawable(id, depth = 0) {
    const R = this.R;
    if (!this.rt || depth > 4) return null;
    const e = this.rt.get(id);
    if (!e) return null;
    const cls = R.klass('Landroid/graphics/drawable/Drawable;');
    R.initClass(cls);
    const mk = (extra) => Object.assign(R.newInstanceObj(cls), { $resId: id }, extra);

    if (e.dataType === TYPE.STRING && e.str) {
      const path = e.str;
      if (/\.(png|jpe?g|webp|gif)$/i.test(path) && this.zip.has(path)) {
        return mk({ $uri: this.dataUri(path), $path: path });
      }
      if (/\.xml$/i.test(path) && this.zip.has(path)) {
        const obj = this._xmlDrawable(path, 0);
        if (obj) return mk(obj);
      }
      if (/\.(9\.png)$/i.test(path) && this.zip.has(path)) return mk({ $uri: this.dataUri(path), $path: path });
      return null;
    }
    if (e.dataType >= TYPE.INT_COLOR_ARGB8 && e.dataType <= TYPE.INT_COLOR_RGB4) {
      const cd = R.klass('Landroid/graphics/drawable/ColorDrawable;'); R.initClass(cd);
      const o = R.newInstanceObj(cd); o.$color = e.data | 0; o.$resId = id; return o;
    }
    if (e.dataType === TYPE.REFERENCE) return this._buildDrawable(e.data, depth + 1);
    return null;
  }
  dataUri(path) {
    if (this._zipCache.has(path)) return this._zipCache.get(path);
    let uri = null;
    try {
      const bytes = this.zip.dataSync(path);
      const ext = path.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      uri = `data:${mime};base64,${btoa(bin)}`;
    } catch (err) { this.log('W', 'Dex2Web', `dataUri(${path}): ${err.message}`); }
    this._zipCache.set(path, uri);
    return uri;
  }

  /** Parse a drawable XML into a drawable object (selector-aware). */
  _xmlDrawable(path, depth) {
    let doc;
    try { doc = parseAxml(this.zip.dataSync(path)); } catch { return null; }
    const root = (doc.root.children || [])[0];
    if (!root) return null;
    if (root.tag === 'selector') {
      const states = [];
      for (const it of (root.children || []).filter((c) => c.tag === 'item')) {
        const st = {};
        for (const a of it.attrs || []) {
          if (!/^state_/.test(a.name)) continue;
          st[a.name.replace('state_', '')] = a.dataType === TYPE.INT_BOOLEAN ? (a.data !== 0) : String(a.rawValue ?? a.value) === 'true';
        }
        let drawable = null;
        const d = attr(it, 'drawable');
        if (d && d.dataType === TYPE.REFERENCE) drawable = this._buildDrawable(d.data, depth + 1);
        else {
          const col = this._colorOfAttr(attr(it, 'color'));
          if (col) drawable = { $color: col | 0 };
        }
        states.push({ st, drawable });
      }
      const fallback = (states.find((x) => Object.keys(x.st).length === 0) || states[states.length - 1] || {});
      const fb = fallback.drawable || null;
      return { $selector: states, $fallback: fb, $color: fb && fb.$color, $uri: fb && fb.$uri, $svg: fb && fb.$svg };
    }
    const svg = this._xmlDrawableToSvg(path, depth);
    return svg ? { $svg: svg, $path: path } : null;
  }

  /** Pick the drawable variant matching a view's current state. */
  selectorFor(d, v) {
    if (!d || !d.$selector) return d;
    const state = {
      pressed: !!(v && v.$pressed),
      enabled: !(v && v.$enabled === 0),
      checked: !!(v && v.$checked),
      selected: !!(v && v.$selected),
      focused: !!(v && v.$focused),
      hovered: false,
      activated: !!(v && v.$activated),
      window_focused: true,
    };
    let best = null, bestScore = -1;
    for (const cand of d.$selector) {
      let score = 0, ok = true;
      for (const k of Object.keys(cand.st)) {
        if (!!state[k] !== !!cand.st[k]) { ok = false; break; }
        score++;
      }
      if (ok && score > bestScore) { best = cand.drawable; bestScore = score; }
    }
    return best || d.$fallback || null;
  }

  /** Compile a drawable XML (vector / shape / layer-list / adaptive-icon) into SVG. */
  _xmlDrawableToSvg(path, depth = 0) {
    let doc;
    try { doc = parseAxml(this.zip.dataSync(path)); } catch { return null; }
    const root = (doc.root.children || [])[0];
    if (!root) return null;
    if (root.tag === 'adaptive-icon' || root.tag === 'adaptive-icon-playstore') {
      const fg = (root.children || []).find((c) => c.tag === 'foreground' || c.tag === 'monochrome');
      const bg = (root.children || []).find((c) => c.tag === 'background');
      let bgCss = '#ffffff';
      if (bg) { const a = attr(bg, 'drawable'); if (a && a.dataType === TYPE.REFERENCE) { const d = this._buildDrawable(a.data); if (d && d.$color !== undefined) bgCss = argbToCss(d.$color, TYPE.INT_COLOR_ARGB8); } }
      let inner = '';
      if (fg) {
        const a = attr(fg, 'drawable');
        if (a && a.dataType === TYPE.REFERENCE) {
          const e = this.rt.get(a.data);
          if (e && e.str && /\.xml$/i.test(e.str)) { const s = this._xmlDrawableToSvg(e.str, depth + 1); if (s) inner = stripSvgWrapper(s); }
          else if (e && e.str) { const u = this.dataUri(e.str); if (u) inner = `<image href="${u}" x="18" y="18" width="72" height="72" preserveAspectRatio="xMidYMid meet"/>`; }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108"><rect width="108" height="108" fill="${bgCss}"/>${inner}</svg>`;
    }
    if (root.tag === 'vector') {
      const g = (n) => (attr(root, n) ? attr(root, n).value : null);
      const vw = Number(g('viewportWidth')) || 24, vh = Number(g('viewportHeight')) || 24;
      const w = dimOf(g('width')) || vw, h = dimOf(g('height')) || vh;
      const paths = [];
      const walk = (node, inherited) => {
        for (const c of node.children || []) {
          if (c.tag === 'path') {
            const d = attr(c, 'pathData');
            const fill = attr(c, 'fillColor');
            const stroke = attr(c, 'strokeColor');
            const sw = attr(c, 'strokeWidth');
            const fillRule = attr(c, 'fillType');
            let fillCss = 'none';
            if (fill) { const cv = this._colorOfAttr(fill); if (cv !== null) fillCss = cv; }
            else if (inherited.fill) fillCss = inherited.fill;
            let s = `<path d="${escXml(d ? String(d.value ?? d.rawValue ?? '') : '')}" fill="${fillCss}"`;
            if (stroke) { const cv = this._colorOfAttr(stroke); if (cv) s += ` stroke="${cv}"`; }
            if (sw) s += ` stroke-width="${Number(sw.value) || 1}"`;
            if (fillRule && String(fillRule.value) === 'evenOdd') s += ` fill-rule="evenodd"`;
            s += '/>';
            paths.push(s);
          } else if (c.tag === 'group') {
            walk(c, inherited);
          } else if (c.tag === 'clip-path') { /* ignored */ }
        }
      };
      walk(root, {});
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">${paths.join('')}</svg>`;
    }
    if (root.tag === 'shape') {
      const solid = (root.children || []).find((c) => c.tag === 'solid');
      const corners = (root.children || []).find((c) => c.tag === 'corners');
      const stroke = (root.children || []).find((c) => c.tag === 'stroke');
      const size = (root.children || []).find((c) => c.tag === 'size');
      const grad = (root.children || []).find((c) => c.tag === 'gradient');
      let fill = '#00000000';
      if (solid) { const c = this._colorOfAttr(attr(solid, 'color')); if (c) fill = c; }
      let fillAttr = `fill="${fill}"`;
      if (grad) {
        const cs = (grad.children || []).filter((c) => c.tag === 'item').map((c) => this._colorOfAttr(attr(c, 'color')) || '#888');
        const startC = this._colorOfAttr(attr(grad, 'startColor'));
        const endC = this._colorOfAttr(attr(grad, 'endColor'));
        const stops = cs.length ? cs : [startC, endC].filter(Boolean);
        if (stops.length) {
          fillAttr = `fill="url(#g)"`;
          const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops.map((s, i) => `<stop offset="${(i / Math.max(1, stops.length - 1)) * 100}%" stop-color="${s}"/>`).join('')}</linearGradient></defs>`;
          return shapeSvg(size, corners, stroke, defs + `<rect ${rectAttrs(size, corners)} ${fillAttr} ${strokeAttrs(stroke)}/>`);
        }
      }
      return shapeSvg(size, corners, stroke, `<rect ${rectAttrs(size, corners)} ${fillAttr} ${strokeAttrs(stroke)}/>`);
    }
    if (root.tag === 'layer-list' || root.tag === 'selector') {
      const items = (root.children || []).filter((c) => c.tag === 'item');
      for (const it of items) {
        const d = attr(it, 'drawable');
        if (d && d.dataType === TYPE.REFERENCE) {
          const e = this.rt.get(d.data);
          if (e && e.str && /\.xml$/i.test(e.str) && depth < 4) { const s = this._xmlDrawableToSvg(e.str, depth + 1); if (s) return s; }
          if (e && e.str) { const u = this.dataUri(e.str); if (u) return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><image href="${u}" width="48" height="48"/></svg>`; }
        }
      }
      return null;
    }
    return null;
  }
  _colorOfAttr(a) {
    if (!a) return null;
    if (a.dataType >= TYPE.INT_COLOR_ARGB8 && a.dataType <= TYPE.INT_COLOR_RGB4) return argbToCss(a.data, a.dataType);
    if (a.dataType === TYPE.INT_HEX || a.dataType === TYPE.INT_DEC) return argbToCss(a.data >>> 0, TYPE.INT_COLOR_ARGB8);
    if (a.dataType === TYPE.REFERENCE && this.rt) { const c = this.resColor(a.data); return argbToCss(c >>> 0, TYPE.INT_COLOR_ARGB8); }
    if (typeof a.value === 'string') return parseCssColor(a.value) !== null ? argbToCss(parseCssColor(a.value) >>> 0, TYPE.INT_COLOR_ARGB8) : null;
    if (a.value && a.value.color) return a.value.color;
    return null;
  }

  async appIconDataUri() {
    if (!this.manifest || !this.manifest.iconResId || !this.rt) return null;
    const id = this.manifest.iconResId;
    const e = this.rt.get(id);
    if (!e) return null;
    if (e.str && /\.(png|jpe?g|webp|gif)$/i.test(e.str) && this.zip.has(e.str)) return this.dataUri(e.str);
    if (e.str && /\.xml$/i.test(e.str)) { const svg = this._xmlDrawableToSvg(e.str); if (svg) return svgUri(svg); }
    // any mipmap/drawable named ic_launcher
    for (const p of this.resFiles) if (/ic_launcher[^/]*\.(png|webp|jpg)$/i.test(p)) return this.dataUri(p);
    for (const p of this.resFiles) if (/\.(png|webp)$/i.test(p)) return this.dataUri(p);
    return null;
  }

  /* ================================================================== */
  /*  Logging & diagnostics                                              */
  /* ================================================================== */
  log(level, tag, msg, tr) {
    const entry = { t: Date.now(), level: level || 'I', tag: tag || '', msg: msg === null || msg === undefined ? '' : String(msg), thr: tr ? `${this.R ? this.R.classNameOf(tr) : ''}: ${tr ? this.R.messageOf(tr) : ''}` : null };
    this.logs.push(entry);
    if (this.logs.length > 4000) this.logs.splice(0, 1000);
    this.emit('log', entry);
    const c = { V: 'debug', D: 'debug', I: 'info', W: 'warn', E: 'error' }[entry.level] || 'log';
    const line = `${entry.tag ? entry.tag + ': ' : ''}${entry.msg}${entry.thr ? '  ⤷ ' + entry.thr : ''}`;
    if (typeof console !== 'undefined' && console[c]) console[c](line);
  }
  crash(e) {
    const t = this.R ? this.R.toJavaThrowable(e) : e;
    this.crashes.push(t);
    // Hand the throwable to the app's own handler first, exactly like ART does.
    try {
      const th = this.R.klass('Ljava/lang/Thread;');
      const ueh = th.statics['Ljava/lang/Thread;->$d2wUeh:Ljava/lang/Thread$UncaughtExceptionHandler;'];
      if (ueh && !ueh.__d2wDefault) this.R.iv('Ljava/lang/Thread$UncaughtExceptionHandler;->uncaughtException(Ljava/lang/Thread;Ljava/lang/Throwable;)V', ueh, this.R.mkSimple ? this.R.mkSimple('Ljava/lang/Thread;') : null, t);
    } catch { /* never let the handler break the host */ }
    this.log('E', 'Dex2Web', 'Uncaught in transpiled code: ' + (this.R ? this.R.messageOf(t) : String(t)), t);
    if (this.R && t && t.$stack) for (const f of t.$stack.slice(0, 12)) this.log('E', '', '    at ' + f);
    this.emit('crash', t);
  }
  _stack() {
    const R = this.R;
    if (!R || !R._callStack) return [];
    return R._callStack.slice(-16);
  }
  onUnresolved(kind, key) {
    this.unresolved = this.unresolved || new Map();
    const n = (this.unresolved.get(key) || 0) + 1;
    this.unresolved.set(key, n);
    // Log the first few occurrences per key, then stay quiet (count keeps
    // accruing for the Transpile Report panel).
    if (n <= 2 && this.unresolved.size <= 400) this.log('W', 'Dex2Web', `unimplemented ${kind} → ${key}`);
  }

  /* ================================================================== */
  /*  Scheduling                                                         */
  /* ================================================================== */
  post(fn) {
    // A Runnable that re-posts itself immediately more than a few hundred
    // times is a polling loop; move it to a coarse timer instead of spinning.
    const n = (this._postCounts.get(fn) || 0) + 1;
    this._postCounts.set(fn, n);
    if (n > 400) {
      const h = setTimeout(() => { this.timers.delete(h); this._guard(fn); }, 16);
      this.timers.add(h);
      return;
    }
    if (this.tasks.length > this.queueCap || this.taskExecutions > this.taskBudget) {
      // A self-reposting loop (polling without a delay) would otherwise spin
      // forever; degrade it to a coarse timer so the tab stays responsive.
      if (!this._budgetWarned) {
        this._budgetWarned = true;
        this.log('W', 'Dex2Web', `task budget exhausted (${this.taskBudget} immediate tasks) — the app is in a hot Handler.post loop; throttling it to timer ticks so the tab stays responsive`);
      }
      const h = setTimeout(() => { this.timers.delete(h); this._guard(fn); }, 32);
      this.timers.add(h);
      return;
    }
    this.tasks.push(fn);
    this._drain();
  }
  postDelayed(fn, ms) { const h = setTimeout(() => { this.timers.delete(h); this._guard(fn); }, Math.max(0, Math.min(ms || 0, 600000))); this.timers.add(h); }
  _guard(fn) { this.taskExecutions++; try { fn(); } catch (e) { this.crash(e); } }
  _drain() {
    if (this._draining) return;
    this._draining = true;
    let guard = 0;
    const step = () => {
      while (this.tasks.length && guard++ < 2000 && this.taskExecutions <= this.taskBudget) {
        const t = this.tasks.shift();
        this.taskExecutions++;
        try { t(); } catch (e) { this.crash(e); }
      }
      this._draining = false;
      if (this.tasks.length) setTimeout(() => { this._draining = false; this._drain(); }, 0);
    };
    setTimeout(step, 0);
  }
  halt() { this.tasks.length = 0; for (const t of this.timers) clearTimeout(t); this.timers.clear(); }

  /* ================================================================== */
  /*  Activities                                                         */
  /* ================================================================== */
  async launch(activityName, intent, from, requestCode) {
    const R = this.R;
    const desc = 'L' + activityName.replace(/\./g, '/') + ';';
    const cls = R.classes.get(desc);
    if (!cls || (!cls.fromDex && cls.native && !cls.methods.size)) {
      this.log('E', 'Dex2Web', `Cannot launch ${activityName}: class not found in this APK`);
      return null;
    }
    R.initClass(cls);
    const previous = this.activities.length ? this.activities[this.activities.length - 1] : null;
    if (previous && !previous.$finished) {
      this._callLifecycle(previous.$c, previous, 'onPause', '()V', []);
      previous.$state = 'paused';
      if (previous.$decor && previous.$decor.$el) previous.$decor.$el.style.display = 'none';
    }
    const activity = R.newInstanceObj(cls);
    activity.$intent = intent || launcherIntent(R, activityName, this.packageName);
    activity.$window = makeWindow(R, activity);
    activity.$decor = this.makeDecor(activity);
    this.plantViewTreeTags(activity.$decor, activity);
    this.attachKeyInput(this.renderer.screen);
    if (requestCode !== undefined) { activity.$caller = from || previous; activity.$requestCode = requestCode; }
    this.activities.push(activity);
    this.emit('status', `Launching ${activityName}`);
    this.log('I', 'ActivityManager', `START ${activityName}${requestCode !== undefined ? ` (forResult ${requestCode})` : ''}`);
    try {
      const ctor = R.findMethod(cls, '<init>()V');
      if (ctor) R.callMethod(ctor, [activity]);
      this._callLifecycle(cls, activity, 'onCreate', '(Landroid/os/Bundle;)V', [null]);
      this._callLifecycle(cls, activity, 'onStart', '()V', []);
      this._callLifecycle(cls, activity, 'onResume', '()V', []);
      activity.$state = 'resumed';
      this.post(() => this.showActivityMenu(activity));
    } catch (e) { this.crash(e); }
    return activity;
  }
  _callLifecycle(cls, obj, name, proto, args) {
    const R = this.R;
    const m = R.findMethod(cls, name + proto);
    if (!m) return false;
    if (!m.fn && !m.nativeFn && m.stub) return false;
    R.callMethod(m, [obj, ...args]);
    return true;
  }
  /* ---- theme / contrast ------------------------------------------------
   * Framework styles (android:TextAppearance etc.) live in the *platform*
   * resources.arsc, which an APK never ships. So after inflating we sample the
   * root background and derive an accessible default text colour plus a status
   * bar tint from it — exactly what a resolved theme would have given us. */
  applyScreenTheme() {
    const screen = this.renderer && this.renderer.screen;
    if (!screen || screen.style === undefined) return;
    const act = this.activities[this.activities.length - 1];
    const root = act && act.$contentView;
    let bg = 0xffffffff;
    if (root) {
      if (root.$bg !== undefined && root.$bg !== null) bg = root.$bg >>> 0;
      else if (root.$bgDrawable && root.$bgDrawable.$color !== undefined) bg = root.$bgDrawable.$color >>> 0;
      else if (root.$bgRes) { const d = this.resDrawable(root.$bgRes); if (d && d.$color !== undefined) bg = d.$color >>> 0; }
    }
    const alpha = (bg >>> 24) & 0xff;
    const eff = alpha < 0x80 ? 0xffffffff : bg;
    const dark = luminance(eff) < 0.5;
    screen.style.backgroundColor = argbToCss(eff, TYPE.INT_COLOR_ARGB8);
    screen.style.color = dark ? '#eef2f8' : '#161b24';
    const sb = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector('.statusbar') : null;
    if (sb) {
      sb.style.background = (this.statusBarColor === null || this.statusBarColor === undefined)
        ? shade(eff, dark ? -0.35 : -0.14)
        : argbToCss(this.statusBarColor >>> 0, TYPE.INT_COLOR_ARGB8);
      sb.style.color = dark ? '#dfe6ee' : '#232833';
    }
    const tb = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector('.titlebar') : null;
    if (tb) {
      tb.style.background = shade(eff, dark ? -0.16 : -0.05);
      tb.style.color = dark ? '#eef2f8' : '#161b24';
    }
  }

  /**
   * Platform-planted view tags: ids that some method reads with getTag but no
   * method ever writes with setTag are the ones androidx/the platform plants
   * on the decor (ViewTree*Owner). When a lookup for such an id misses, the
   * running activity is the only sensible owner — synthesise it.
   */
  synthesizeTag(id) {
    // Disabled by default: androidx/Compose owner tags carry wrapper types we
    // cannot faithfully spoof, so answering with the activity just moves the
    // ClassCastException deeper. Kept behind a flag for experimentation.
    if (!this.synthesizeOwners) return null;
    const k = id | 0;
    if (!this._synTags) {
      const get = new Set(), set = new Set();
      try {
        for (const { dex } of this.dexes) {
          const getIdx = new Set(), setIdx = new Set();
          for (let i = 0; i < dex.methodIdsSize; i++) {
            const nm = dex.methodName(i);
            const pr = dex.protoDescriptor(dex.methodProtoIdx[i]);
            if (nm === 'getTag' && pr === '(I)Ljava/lang/Object;') getIdx.add(i);
            else if (nm === 'setTag' && pr === '(ILjava/lang/Object;)V') setIdx.add(i);
          }
          if (!getIdx.size && !setIdx.size) continue;
          for (const cd of dex.classDefs) {
            for (const list of [cd.directMethods, cd.virtualMethods]) {
              for (const m of list) {
                if (!m.codeOff) continue;
                const code = dex.code(cd, m);
                if (!code || code.insnsSize > 4000) continue;
                let pending = null;
                let pc = 0;
                while (pc < code.insnsSize) {
                  const ins = decodeInsnAt(dex, code, pc);
                  if (!ins) break;
                  if (ins.kind === 'const' && typeof ins.imm === 'number' && (ins.imm >>> 0) > 0x01000000) pending = ins.imm >>> 0;
                  else if (ins.kind === 'invoke' && (getIdx.has(ins.index) || setIdx.has(ins.index))) {
                    if (pending !== null) (getIdx.has(ins.index) ? get : set).add(pending);
                    pending = null;
                  } else if (ins.kind !== 'move' && ins.kind !== 'move-result' && ins.kind !== 'const') pending = null;
                  pc += Math.max(1, ins.width);
                }
              }
            }
          }
        }
      } catch (e) { this.log('W', 'Dex2Web', 'tag scan failed: ' + e.message); }
      this._synTags = new Set([...get].filter((x) => !set.has(x)));
      this.log('I', 'Dex2Web', `identified ${this._synTags.size} platform-planted view tag id(s)`);
    }
    if (!this._synTags || !this._synTags.has(k)) return null;
    const act = this.activities[this.activities.length - 1];
    if (!act) return null;
    if (this.tagRegistry) this.tagRegistry.set(k, act);
    return act;
  }

  /** A single stand-in ClassLoader for the whole package. */
  classLoader() {
    if (this._classLoader) return this._classLoader;
    const R = this.R;
    const c = R.klass('Ldalvik/system/PathClassLoader;');
    R.initClass(c);
    this._classLoader = R.newInstanceObj(c);
    this._classLoader.$name = 'dalvik.system.PathClassLoader';
    return this._classLoader;
  }

  /**
   * androidx plants LifecycleOwner / ViewModelStoreOwner / SavedStateRegistry
   * tags on the window decor; libraries (Compose above all) refuse to start
   * without them. The tag ids live in the APK's own R$id class, so read them
   * out of its static initialiser and plant the tags where the platform would.
   */
  viewTreeTagIds() {
    if (this._vtIds) return this._vtIds;
    const R = this.R;
    const found = [];
    // R8 renames androidx's ViewTree*Owner accessors and inlines the tag ids,
    // but their shape survives: static f(View) -> SomeIface whose body loads a
    // resource-id constant immediately before calling View.getTag(I).
    for (const { dex } of this.dexes) {
      for (const cd of dex.classDefs) {
        for (const list of [cd.directMethods, cd.virtualMethods]) {
          for (const m of list) {
            if (!(m.accessFlags & 0x8)) continue;
            const mp = /^\(Landroid\/view\/View;\)(L[^;]+;)$/.exec(m.proto);
            if (!mp) continue;
            const code = m.codeOff ? dex.code(cd, m) : null;
            if (!code || code.insnsSize > 60) continue;
            const insns = dex.disassemble(cd, m);
            for (let i = 0; i + 1 < insns.length; i++) {
              const a = insns[i], b = insns[i + 1];
              if (b.kind !== 'invoke') continue;
              const bk = dex.methodKey(b.index);
              if (!/->getTag\(I\)Ljava\/lang\/Object;$/.test(bk)) continue;
              let id = null;
              if (a.kind === 'const' && typeof a.imm === 'number' && (a.imm >>> 0) > 0x01000000) id = a.imm >>> 0;
              else if (a.kind === 'field-get') {
                const fk = dex.fieldKey(a.index);
                const fc = R.classes.get(fk.slice(0, fk.indexOf('->')));
                if (fc) { R.initClass(fc); const v = fc.statics[fk]; if (typeof v === 'number') id = v >>> 0; }
              }
              if (id !== null) { found.push({ id, iface: mp[1] }); break; }
            }
          }
        }
      }
    }
    this._vtIds = found;
    return found;
  }
  plantViewTreeTags(view, activity) {
    if (!view || !activity) return;
    view.$tags = view.$tags || new Map();
    const actDesc = this.R.descOf(activity);
    for (const { id, iface } of this.viewTreeTagIds()) {
      // Only plant the activity where the accessor's return interface is one
      // the activity actually implements (LifecycleOwner / ViewModelStoreOwner
      // / SavedStateRegistryOwner), never Compose's private owner tags.
      if (!this.R.isAssignable(actDesc, iface)) continue;
      if (!view.$tags.has(id)) view.$tags.set(id, activity);
    }
  }

  /**
   * The window's decor view. Real Android's decor always contains exactly one
   * child — the content container carrying android.R.id.content — before any
   * setContentView call, and apps do reach for decorView.getChildAt(0).
   */
  makeDecor(activity) {
    const R = this.R;
    const decor = this.createView('Landroid/widget/FrameLayout;', activity, null);
    decor.$isDecor = true;
    const contentRoot = this.createView('Landroid/widget/FrameLayout;', activity, null);
    contentRoot.$id = 0x01020002;                 // android.R.id.content
    if (contentRoot.$el) contentRoot.$el.dataset.id = '16908290';
    const lp = this.renderer.makeLayoutParams(R, MATCH_PARENT, MATCH_PARENT);
    contentRoot.$lp = lp;
    this.renderer.addView(decor, contentRoot, -1);
    if (contentRoot.$el) { contentRoot.$el.style.minHeight = '100%'; }
    activity.$contentRoot = contentRoot;
    if (this.renderer.screen) {
      this.renderer.screen.innerHTML = '';
      this.renderer.screen.appendChild(decor.$el);
      // #screen has a determined height, so a 100% chain keeps percentage
      // layout_params of the app's root view resolvable all the way down.
      decor.$el.style.width = '100%';
      decor.$el.style.height = '100%';
      decor.$el.style.minHeight = '100%';
    }
    return decor;
  }
  ensureDecor(activity) {
    if (!activity) return null;
    if (!activity.$decor) activity.$decor = this.makeDecor(activity);
    return activity.$decor;
  }

  setContentView(activity, layoutId, view) {
    const decor = this.ensureDecor(activity);
    const contentRoot = activity.$contentRoot || decor;
    if (view) {
      if (contentRoot) { this.renderer.removeAllViews(contentRoot); this.renderer.addView(contentRoot, view, -1); }
      view.$el.style.width = '100%';
      view.$el.style.minHeight = '100%';
      activity.$contentView = view;
      this.applyScreenTheme();
      return;
    }
    if (layoutId == null) return;
    // Android inflates into the window's content FrameLayout, which is what
    // makes a root <merge> tag legal — mirror that by always supplying one.
    const container = this.createView('Landroid/widget/FrameLayout;', activity, null);
    const inflated = this.inflateSync(layoutId, container, false);
    const content = inflated || container;
    this.plantViewTreeTags(content, activity);
    if (!content || !content.$el) { this.log('E', 'Dex2Web', `setContentView(0x${(layoutId >>> 0).toString(16)}) produced no view`); return; }
    if (contentRoot) { this.renderer.removeAllViews(contentRoot); this.renderer.addView(contentRoot, content, -1); }
    content.$el.style.width = '100%';
    content.$el.style.minHeight = '100%';
    activity.$contentView = content;
    this.applyScreenTheme();
    this.emit('status', 'Content view attached');
  }
  findViewById(activity, id) {
    if (!activity) return null;
    // android.R.id.content always resolves to the window's content container.
    if ((id >>> 0) === 0x01020002) return activity.$contentRoot || this.ensureDecor(activity);
    const root = activity.$contentView;
    if (root) { const hit = this.renderer.findViewById(root, id | 0); if (hit) return hit; }
    const decor = activity.$decor;
    if (decor) return this.renderer.findViewById(decor, id | 0);
    return null;
  }
  finish(activity) {
    if (!activity || activity.$finishing) return;
    activity.$finishing = true;
    const R = this.R;
    this.log('I', 'ActivityManager', `FINISH ${R.classNameOf(activity)}`);
    const i = this.activities.indexOf(activity);
    if (i >= 0) this.activities.splice(i, 1);
    try {
      this._callLifecycle(activity.$c, activity, 'onPause', '()V', []);
      this._callLifecycle(activity.$c, activity, 'onStop', '()V', []);
      this._callLifecycle(activity.$c, activity, 'onDestroy', '()V', []);
    } catch (e) { this.crash(e); }
    if (activity.$decor && activity.$decor.$el && activity.$decor.$el.parentNode) {
      activity.$decor.$el.parentNode.removeChild(activity.$decor.$el);
    }
    activity.$decor = null;
    activity.$finished = true;
    activity.$state = 'destroyed';

    // Deliver a result to the caller, then resume whatever is now on top.
    const caller = activity.$caller;
    const code = activity.$resultCode === undefined ? 0 : activity.$resultCode;
    const data = activity.$resultData || null;
    const next = this.activities[this.activities.length - 1];
    if (next) {
      if (next.$decor && next.$decor.$el) next.$decor.$el.style.display = '';
      try {
        if (next.$state === 'paused' || next.$state === 'stopped') {
          this._callLifecycle(next.$c, next, 'onRestart', '()V', []);
          this._callLifecycle(next.$c, next, 'onStart', '()V', []);
        }
        this._callLifecycle(next.$c, next, 'onResume', '()V', []);
        next.$state = 'resumed';
      } catch (e) { this.crash(e); }
    } else if (this.renderer.screen) {
      this.renderer.screen.innerHTML = '';
      this.renderer.screen.appendChild(emptyScreen('Activity finished'));
    }
    if (caller && caller.$requestCode !== undefined && !caller.$finished) {
      try {
        R.iv('Landroid/app/Activity;->onActivityResult(IILandroid/content/Intent;)V', caller, caller.$requestCode, code, data);
      } catch (e) { /* not overridden or threw — surfaced in logcat */ this.crash(e); }
      caller.$requestCode = undefined;
    }
    this.applyScreenTheme();
    this.emit('status', 'Activity finished');
  }
  recreate(activity) {
    if (!activity) return;
    const name = this.R.classNameOf(activity).replace(/\./g, '.');
    this.log('I', 'ActivityManager', `RECREATE ${name}`);
    const i = this.activities.indexOf(activity);
    if (i >= 0) this.activities.splice(i, 1);
    this.launch(name, activity.$intent);
  }
  startActivity(intent, from, requestCode) {
    if (!intent) return;
    const R = this.R;
    const clsObj = intent.$cls;
    let target = intent.$clsName;
    if (!target && clsObj && clsObj['Ljava/lang/Class;->desc:Ljava/lang/String;']) {
      target = clsObj['Ljava/lang/Class;->desc:Ljava/lang/String;'].slice(1, -1).replace(/\//g, '.');
    }
    const action = intent.$action;
    if (!target && action) {
      if (action === 'android.intent.action.VIEW' && intent.$data) {
        const url = intent.$data.$u;
        this.log('I', 'Intent', `ACTION_VIEW ${url} → opening in a new tab`);
        try { window.open(url, '_blank', 'noopener'); } catch { this.log('W', 'Intent', 'popup blocked'); }
        return;
      }
      this.log('W', 'Intent', `No activity resolves action ${action} in the browser sandbox`);
      return;
    }
    if (!target) { this.log('W', 'Intent', 'startActivity with no target component'); return; }
    this.post(() => this.launch(target, intent, from, requestCode));
  }
  setTitle(activity, t) {
    this.emit('title', t);
    if (this.titleEl) this.titleEl.textContent = t || '';
    activity.$title = t;
  }
  setSubtitle(t) { this.emit('subtitle', t); }
  setStatusBarColor(c) { this.statusBarColor = c; this.emit('chrome', { status: c }); }
  setNavBarColor(c) { this.navBarColor = c; this.emit('chrome', { nav: c }); }

  /* ================================================================== */
  /*  Theme attribute resolution                                         */
  /* ================================================================== */
  /** Current theme resource id (activity override → manifest → dark default). */
  themeId() {
    const act = this.activities[this.activities.length - 1];
    if (act && act.$themeId) return act.$themeId;
    if (this.manifest && this.manifest.themeResId) return this.manifest.themeResId;
    const a = this.manifest && this.manifest.activities.find((x) => x.name === (this.manifest.launcherName || ''));
    if (a && a.theme) return a.theme;
    return 0;
  }
  /** Walk a style bag (and its parent chain) looking for an attr resource id. */
  _styleLookup(styleId, attrId, depth = 0) {
    if (!this.rt || !styleId || depth > 8) return null;
    const e = this.rt.get(styleId >>> 0);
    if (!e) return null;
    if (e.complex && e.values) {
      for (const v of e.values) if ((v.name >>> 0) === (attrId >>> 0)) return v;
    }
    if (e.parent) return this._styleLookup(e.parent, attrId, depth + 1);
    return null;
  }
  /**
   * Implements Resources.Theme.resolveAttribute: fills a TypedValue from the
   * app's theme/style bags in resources.arsc.
   */
  resolveThemeAttribute(attrId, out, resolveRefs, themeObj) {
    if (!this.rt || !out) return false;
    const theme = (themeObj && themeObj.$styles && themeObj.$styles.length)
      ? themeObj.$styles[themeObj.$styles.length - 1] : this.themeId();
    let v = this._styleLookup(theme, attrId);
    if (!v && themeObj && themeObj.$styles) {
      for (let i = themeObj.$styles.length - 1; i >= 0 && !v; i--) v = this._styleLookup(themeObj.$styles[i], attrId);
    }
    if (!v) return false;
    const K = 'Landroid/util/TypedValue;->';
    let type = v.dataType, data = v.data >>> 0;
    let resourceId = (type === TYPE.REFERENCE) ? data : 0;
    if (resolveRefs && type === TYPE.REFERENCE) {
      const resolved = this.rt.resolveValue(data);
      if (resolved) { type = resolved.dataType; data = resolved.data >>> 0; }
    }
    out[K + 'type:I'] = type;
    out[K + 'data:I'] = data;
    out[K + 'resourceId:I'] = resourceId;
    out[K + 'density:I'] = 160;
    if (type === TYPE.STRING) out[K + 'string:Ljava/lang/CharSequence;'] = this.rt.string(data);
    return true;
  }
  /** Build a TypedArray for obtainStyledAttributes(set, attrs, ...). */
  obtainStyledAttributes(aset, ids, themeObj) {
    const R = this.R;
    const c = R.klass('Landroid/content/res/TypedArray;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    const vals = [];
    const node = aset && aset.$node ? aset.$node : null;
    for (const rawId of (ids || [])) {
      const id = rawId | 0;
      let xmlAttr = null;
      if (node) for (const a of node.attrs || []) if ((a.resourceId >>> 0) === (id >>> 0)) { xmlAttr = a; break; }
      if (xmlAttr) { vals.push(this._typedValueFor(xmlAttr)); continue; }
      const out = R.newInstanceObj(c.$c ? R.klass('Landroid/util/TypedValue;') : R.klass('Landroid/util/TypedValue;'));
      if (this.resolveThemeAttribute(id, out, true, themeObj)) {
        const K = 'Landroid/util/TypedValue;->';
        const type = out[K + 'type:I'], data = out[K + 'data:I'];
        vals.push(this._typedValueFromPair(type, data, out[K + 'string:Ljava/lang/CharSequence;']));
      } else vals.push(null);
    }
    o.$vals = vals;
    return o;
  }
  _typedValueFor(a) {
    switch (a.dataType) {
      case TYPE.STRING: return a.rawValue !== null && a.rawValue !== undefined ? a.rawValue : a.value;
      case TYPE.REFERENCE: {
        if (!this.rt) return null;
        const e = this.rt.resolveValue(a.data);
        if (!e) return this.resDrawable(a.data) || null;
        if (e.typeName === 'drawable' || e.typeName === 'mipmap') return this.resDrawable(a.data);
        if (e.typeName === 'layout' || e.typeName === 'id' || e.typeName === 'menu' || e.typeName === 'anim' || e.typeName === 'xml' || e.typeName === 'raw' || e.typeName === 'style' || e.typeName === 'array' || e.typeName === 'plurals') return a.data | 0;
        return this._typedValueFromPair(e.dataType, e.data, e.str);
      }
      case TYPE.DIMENSION: { const d = unpackDimension(a.data); return dimToPx(d.value, d.unit, 1); }
      case TYPE.FLOAT: return a.value;
      case TYPE.INT_BOOLEAN: return a.data ? 1 : 0;
      case TYPE.INT_DEC: case TYPE.INT_HEX: return a.data | 0;
      default:
        if (a.dataType >= TYPE.INT_COLOR_ARGB8 && a.dataType <= TYPE.INT_COLOR_RGB4) return a.data | 0;
        return (a.value && typeof a.value === 'object' && a.value.text) ? a.value.text : a.value;
    }
  }
  _typedValueFromPair(type, data, str) {
    if (type === TYPE.STRING) return str !== undefined && str !== null ? str : (this.rt ? this.rt.string(data) : null);
    if (type === TYPE.DIMENSION) { const d = unpackDimension(data); return dimToPx(d.value, d.unit, 1); }
    if (type === TYPE.FLOAT) { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, data >>> 0); return b.getFloat32(0); }
    if (type === TYPE.INT_BOOLEAN) return data ? 1 : 0;
    if (type >= TYPE.INT_COLOR_ARGB8 && type <= TYPE.INT_COLOR_RGB4) return data | 0;
    if (type === TYPE.REFERENCE) return this.resDrawable(data) || (data | 0);
    return data | 0;
  }

  /* ================================================================== */
  /*  Layout inflation                                                   */
  /* ================================================================== */
  inflateSync(layoutId, root, attach) {
    const path = this.layoutPath(layoutId);
    if (!path) { this.log('E', 'Dex2Web', `layout resource 0x${(layoutId >>> 0).toString(16)} not found`); return null; }
    let doc;
    try { doc = parseAxml(this.zip.dataSync(path)); }
    catch (e) { this.log('E', 'Dex2Web', `failed to parse ${path}: ${e.message}`); return null; }
    const rootTag = (doc.root.children || [])[0];
    if (!rootTag) return null;
    return this.inflateNode(rootTag, root || null, !!attach, path);
  }
  inflate(layoutId, root, attach) { return this.inflateSync(layoutId, root, attach); }

  inflateNode(node, parent, attach, sourcePath) {
    if (node.tag === 'requestFocus' || node.tag === 'tag' || node.tag === 'eat-comment') return null;
    if (node.tag === 'merge') {
      for (const c of node.children || []) { const v = this.inflateNode(c, parent, true, sourcePath); if (v && parent) this.renderer.addView(parent, v, -1); }
      return parent;
    }
    if (node.tag === 'include') {
      const la = attr(node, 'layout');
      if (la && la.dataType === TYPE.REFERENCE) {
        const v = this.inflateSync(la.data, parent, false);
        if (v) this.applyAttrs(v, node, parent);
        return v;
      }
      return null;
    }
    if (node.tag === 'fragment') {
      return this.inflateFragment(node, parent, sourcePath);
    }

    const desc = this.viewDescriptor(node.tag);
    const ctx = (parent && parent.$ctx) || this.currentActivity();
    let v;
    try { v = this.createView(desc, ctx, node); }
    catch (e) { this.log('E', 'Dex2Web', `cannot create <${node.tag}> (${desc}): ${this.R.messageOf(e)}`); return null; }
    if (!v) return null;
    this.applyAttrs(v, node, parent);

    for (const c of node.children || []) {
      const child = this.inflateNode(c, v, true, sourcePath);
      if (child && child !== v) this.renderer.addView(v, child, -1);
    }
    return v;
  }

  viewDescriptor(tag) {
    if (tag.includes('.')) {
      let d = 'L' + tag.replace(/\./g, '/') + ';';
      if (this.R.classes.has(d)) return d;
      // androidx / material aliases
      const alias = { 'Landroidx/appcompat/widget/AppCompatTextView;': d };
      return alias[d] || d;
    }
    return SHORT_VIEWS[tag] || `Landroid/widget/${tag};`;
  }

  createView(desc, ctx, node) {
    const R = this.R;
    if (!R.classes.has(desc)) {
      const fallback = SHORT_VIEWS[desc.split('/').pop().replace(';', '')];
      if (fallback && R.classes.has(fallback)) { this.log('W', 'Dex2Web', `unknown view ${desc} → falling back to ${fallback}`); desc = fallback; }
      else { this.log('W', 'Dex2Web', `unknown view class ${desc}, rendering as a plain container`); desc = 'Landroid/view/ViewGroup;'; }
    }
    const cls = R.klass(desc);
    R.initClass(cls);
    const obj = cls.hooks.create ? cls.hooks.create(R, cls) : R.newInstanceObj(cls);
    obj.$ctx = ctx;
    const attrSet = node ? this.makeAttributeSet(node) : null;
    let m = R.findMethod(cls, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V');
    if (m) R.callMethod(m, [obj, ctx, attrSet]);
    else {
      m = R.findMethod(cls, '<init>(Landroid/content/Context;)V');
      if (m) R.callMethod(m, [obj, ctx]);
      else {
        m = R.findMethod(cls, '<init>()V');
        if (m) R.callMethod(m, [obj]);
        else this.renderer.ensureView(obj, guessKind(desc));
      }
    }
    this.renderer.ensureView(obj, obj.$kind || guessKind(desc));
    return obj;
  }

  makeAttributeSet(node) {
    const R = this.R;
    const c = R.klass('Landroid/util/AttributeSet;');
    const o = R.newInstanceObj(c);
    o.$node = node;
    return o;
  }

  /* ================================================================== */
  /*  Fragments                                                          */
  /* ================================================================== */
  fragBeginTransaction() {
    const R = this.R;
    const c = R.klass('Landroidx/fragment/app/FragmentTransaction;');
    R.initClass(c);
    const tx = R.newInstanceObj(c);
    tx.$ops = [];
    return tx;
  }
  /** Run a fragment through attach → create → createView → viewCreated → start → resume. */
  runFragment(frag, activity, container) {
    const R = this.R;
    const cls = frag.$c;
    if (frag.$started) return frag.$view || null;
    frag.$activity = activity;
    frag.$started = true;
    try {
      const m0 = R.findMethod(cls, '<init>()V');
      if (m0 && !frag.$constructed) { R.callMethod(m0, [frag]); frag.$constructed = true; }
      this._callLifecycle(cls, frag, 'onAttach', '(Landroid/app/Activity;)V', [activity]) ||
        this._callLifecycle(cls, frag, 'onAttach', '(Landroid/content/Context;)V', [activity]);
      this._callLifecycle(cls, frag, 'onCreate', '(Landroid/os/Bundle;)V', [null]);
      let view = frag.$view || null;
      const mv = R.findMethod(cls, 'onCreateView(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;');
      if (mv && !view) view = R.callMethod(mv, [frag, this.layoutInflater(activity), container || null, null]);
      frag.$view = view;
      if (view) this._callLifecycle(cls, frag, 'onViewCreated', '(Landroid/view/View;Landroid/os/Bundle;)V', [view, null]);
      this._callLifecycle(cls, frag, 'onStart', '()V', []);
      this._callLifecycle(cls, frag, 'onResume', '()V', []);
    } catch (e) { this.crash(e); }
    return frag.$view || null;
  }
  fragCommit(tx) {
    const R = this.R;
    const activity = this.activities[this.activities.length - 1];
    if (!activity || !tx || !tx.$ops) return 0;
    for (const op of tx.$ops) {
      try {
        if (op.kind === 'add' || op.kind === 'replace') {
          if (op.kind === 'replace' && op.containerId) {
            for (const [tag, f] of Object.entries(activity.$fragByTag || {})) {
              if (f.$containerId === op.containerId) this.fragDetach(f, activity);
            }
          }
          const container = op.containerId ? this.findViewById(activity, op.containerId) : null;
          const view = this.runFragment(op.frag, activity, container);
          op.frag.$containerId = op.containerId;
          if (op.tag) { activity.$fragByTag = activity.$fragByTag || {}; activity.$fragByTag[op.tag] = op.frag; }
          if (op.containerId) { activity.$fragById = activity.$fragById || {}; activity.$fragById[op.containerId] = op.frag; }
          activity.$fragments = (activity.$fragments || []).concat([op.frag]);
          if (view && view.$el) {
            if (container && container.$el) this.renderer.addView(container, view, -1);
            else if (activity.$contentView && activity.$contentView.$el) this.renderer.addView(activity.$contentView, view, -1);
          }
        } else if (op.kind === 'remove') {
          this.fragDetach(op.frag, activity);
        } else if (op.kind === 'hide' && op.frag.$view) {
          op.frag.$view.$vis = 4; this.renderer.applyVisibility(op.frag.$view);
        } else if (op.kind === 'show' && op.frag.$view) {
          op.frag.$view.$vis = 0; this.renderer.applyVisibility(op.frag.$view);
        }
      } catch (e) { this.crash(e); }
    }
    tx.$ops = [];
    this.emit('status', 'fragment transaction committed');
    return 1;
  }
  fragDetach(frag, activity) {
    const R = this.R;
    if (!frag) return;
    try {
      this._callLifecycle(frag.$c, frag, 'onPause', '()V', []);
      this._callLifecycle(frag.$c, frag, 'onStop', '()V', []);
      this._callLifecycle(frag.$c, frag, 'onDestroyView', '()V', []);
    } catch (e) { /* tolerate */ }
    if (frag.$view && frag.$view.$parent) this.renderer.removeView(frag.$view.$parent, frag.$view);
    if (activity) {
      if (activity.$fragByTag) for (const k of Object.keys(activity.$fragByTag)) if (activity.$fragByTag[k] === frag) delete activity.$fragByTag[k];
      if (activity.$fragById) for (const k of Object.keys(activity.$fragById)) if (activity.$fragById[k] === frag) delete activity.$fragById[k];
      activity.$fragments = (activity.$fragments || []).filter((f) => f !== frag);
    }
    frag.$started = false;
    frag.$view = null;
  }
  fragFind(activity, tag, id) {
    if (!activity) return null;
    if (tag && activity.$fragByTag && activity.$fragByTag[tag]) return activity.$fragByTag[tag];
    if (id !== undefined && id !== null && activity.$fragById && activity.$fragById[id >>> 0]) return activity.$fragById[id >>> 0];
    return null;
  }
  makeBundle(R) {
    const c = R.klass('Landroid/os/Bundle;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$m = new Map();
    return o;
  }

  inflateFragment(node, parent, sourcePath) {
    const R = this.R;
    const nameAttr = attr(node, 'name') || attr(node, 'class');
    const name = nameAttr ? String(nameAttr.value ?? nameAttr.rawValue) : null;
    if (!name) return null;
    const desc = 'L' + name.replace(/\./g, '/') + ';';
    if (!R.classes.has(desc)) { this.log('W', 'Dex2Web', `fragment ${name} not in this APK`); return null; }
    const cls = R.klass(desc);
    R.initClass(cls);
    const frag = R.newInstanceObj(cls);
    frag.$constructed = true;
    const view = this.runFragment(frag, this.currentActivity(), parent);
    return view;
  }

  inflateStub(v) {
    if (!v || !v.$layoutRes) return null;
    const made = this.inflateSync(v.$layoutRes, v.$parent || null, false);
    if (made && v.$parent) {
      const i = v.$parent.$children.indexOf(v);
      this.renderer.removeView(v.$parent, v);
      this.renderer.addView(v.$parent, made, i < 0 ? -1 : i);
    }
    return made;
  }

  /* ---- attribute application ---- */
  applyAttrs(v, node, parent) {
    const st = this._attrState(v, parent);
    // Explicit style="…" bags are applied first; XML attributes then override.
    const styleAttr = (node.attrs || []).find((a) => a.name === 'style' && a.dataType === TYPE.REFERENCE);
    if (styleAttr) this.applyStyleBag(v, styleAttr.data >>> 0, parent, st);
    for (const a of (node.attrs || [])) this.applyOne(v, a, parent, st);
    this._finishAttrs(v, parent, st);
  }
  _attrState(v, parent) {
    return {
      lp: v.$lp || null,
      margins: [0, 0, 0, 0],
      haveMargin: false,
      isVGroupParent: !!(parent && (parent.$kind === 'LinearLayout' || parent.$kind === 'RadioGroup')),
    };
  }
  _finishAttrs(v, parent, st) {
    const R = this.R, ren = this.renderer;
    if (st.haveMargin) { if (!st.lp) st.lp = mkLp(R, st.isVGroupParent); st.lp.$m = st.margins; v.$margin = st.margins; }
    if (st.lp) { v.$lp = st.lp; ren.applyLayoutParams(v); }
    // RelativeLayout children need explicit positioning
    if (parent && parent.$kind === 'RelativeLayout' && v.$el) applyRelativeRules(parent, v);
  }
  applyOne(v, a, parent, st) {
    const R = this.R, ren = this.renderer;
    const isAndroid = !a.ns || a.ns === ANDROID_NS;
    const name = isAndroid ? a.name : a.name;
    const raw = a.rawValue !== null && a.rawValue !== undefined ? a.rawValue : undefined;
    const val = a.value;
    const refId = a.dataType === TYPE.REFERENCE ? (a.data >>> 0) : null;
    if (a.dataType === TYPE.ATTRIBUTE) {
      const rv = this.resolveThemeAttrValue(a.data >>> 0);
      if (!rv) return;
      a = Object.assign({}, a, rv);
      return this.applyOne(v, a, parent, st);
    }
    try {
    switch (name) {
      case 'id': if (refId !== null) { v.$id = refId; if (v.$el) v.$el.dataset.id = refId; } break;
      case 'layout_width': { const w = sizeVal(a, this); if (!st.lp) st.lp = mkLp(R, st.isVGroupParent); st.lp.$w = w; break; }
      case 'layout_height': { const h = sizeVal(a, this); if (!st.lp) st.lp = mkLp(R, st.isVGroupParent); st.lp.$h = h; break; }
      case 'layout_weight': { if (!st.lp) st.lp = mkLp(R, true); st.lp.$weight = numVal(a); break; }
      case 'layout_gravity': { if (!st.lp) st.lp = mkLp(R, st.isVGroupParent); st.lp.$gravity = intVal(a); ren.applyLayoutParams(v); break; }
      case 'gravity': call(R, v, 'setGravity(I)V', [intVal(a)]); break;
      case 'layout_margin': { const m = dimVal(a, this); st.margins[0] = st.margins[1] = st.margins[2] = st.margins[3] = m; st.haveMargin = true; break; }
      case 'layout_marginLeft': case 'layout_marginStart': st.margins[0] = dimVal(a, this); st.haveMargin = true; break;
      case 'layout_marginTop': st.margins[1] = dimVal(a, this); st.haveMargin = true; break;
      case 'layout_marginRight': case 'layout_marginEnd': st.margins[2] = dimVal(a, this); st.haveMargin = true; break;
      case 'layout_marginBottom': st.margins[3] = dimVal(a, this); st.haveMargin = true; break;
      case 'padding': { const p = dimVal(a, this); ren.applyPadding(v, p, p, p, p); break; }
      case 'paddingLeft': case 'paddingStart': ren.applyPadding(v, dimVal(a, this), (v.$pad || [0, 0, 0, 0])[1], (v.$pad || [0, 0, 0, 0])[2], (v.$pad || [0, 0, 0, 0])[3]); break;
      case 'paddingTop': ren.applyPadding(v, (v.$pad || [0, 0, 0, 0])[0], dimVal(a, this), (v.$pad || [0, 0, 0, 0])[2], (v.$pad || [0, 0, 0, 0])[3]); break;
      case 'paddingRight': case 'paddingEnd': ren.applyPadding(v, (v.$pad || [0, 0, 0, 0])[0], (v.$pad || [0, 0, 0, 0])[1], dimVal(a, this), (v.$pad || [0, 0, 0, 0])[3]); break;
      case 'paddingBottom': ren.applyPadding(v, (v.$pad || [0, 0, 0, 0])[0], (v.$pad || [0, 0, 0, 0])[1], (v.$pad || [0, 0, 0, 0])[2], dimVal(a, this)); break;
      case 'text': ren.setText(v, this._attrText(a)); break;
      case 'hint': ren.setHint(v, this._attrText(a)); break;
      case 'textColor': ren.setTextColor(v, colorVal(a, this)); break;
      case 'textSize': ren.setTextSize(v, dimVal(a, this)); break;
      case 'textAppearance': {
        const sz = TEXT_APPEARANCE_SIZES[intVal(a) >>> 0];
        if (sz) ren.setTextSize(v, sz);
        break;
      }
      case 'textStyle': v.$style = intVal(a); ren.applyTextStyle(v); break;
      case 'textAllCaps': v.$caps = boolVal(a); ren.applyTextStyle(v); break;
      case 'fontFamily': if (v.$el) (v.$el._label || v.$el).style.fontFamily = String(raw || val); break;
      case 'background': {
        if (refId !== null) { v.$bgRes = refId; ren.applyResourceBg(v); }
        else if (isColorType(a)) ren.applyBackground(Object.assign(v, { $bg: colorVal(a, this) }));
        else if (a.dataType === TYPE.STRING) { v.$bg = parseCssColor(String(raw ?? val)) ?? 0; ren.applyBackground(v); }
        break;
      }
      case 'foreground': break;
      case 'visibility': { const s = String(raw ?? val); ren.applyVisibility(Object.assign(v, { $vis: s === 'gone' ? GONE : s === 'invisible' ? INVISIBLE : intOr(a, s === 'visible' ? VISIBLE : VISIBLE) })); break; }
      case 'orientation': call(R, v, 'setOrientation(I)V', [String(raw ?? val) === 'vertical' ? 1 : intVal(a)]); break;
      case 'weightSum': call(R, v, 'setWeightSum(F)V', [Math.fround(numVal(a))]); break;
      case 'enabled': ren.applyEnabled(Object.assign(v, { $enabled: boolVal(a) ? 1 : 0 })); break;
      case 'clickable': v.$clickable = boolVal(a) ? 1 : 0; ren.applyClickable(v); break;
      case 'longClickable': break;
      case 'focusable': case 'focusableInTouchMode': break;
      case 'src': case 'srcCompat': {
        if (refId !== null) ren.setImageResource(v, refId);
        else if (isColorType(a)) ren.setImageDrawable(v, colorDrawable(R, colorVal(a, this)));
        break;
      }
      case 'scaleType': v.$scaleType = { $c: R.klass('Landroid/widget/ImageView$ScaleType;'), $name: camelUpper(String(raw ?? val)) }; ren.applyImageFit(v); break;
      case 'adjustViewBounds': v.$adjust = boolVal(a); break;
      case 'tint': ren.setImageTint(v, colorVal(a, this)); break;
      case 'contentDescription': v.$desc = this._attrText(a); if (v.$el) v.$el.title = v.$desc; break;
      case 'alpha': ren.applyTransform(Object.assign(v, { $alpha: numVal(a) })); if (v.$el) v.$el.style.opacity = String(numVal(a)); break;
      case 'rotation': v.$rot = numVal(a); ren.applyTransform(v); break;
      case 'elevation': if (v.$el) v.$el.style.boxShadow = `0 2px ${Math.max(2, numVal(a))}px rgba(0,0,0,.25)`; break;
      case 'maxLines': ren.setLines(v, v.$minLines ?? null, intVal(a)); break;
      case 'minLines': ren.setLines(v, intVal(a), v.$maxLines ?? null); break;
      case 'lines': ren.setLines(v, intVal(a), intVal(a)); break;
      case 'singleLine': if (boolVal(a)) ren.setLines(v, 1, 1); break;
      case 'maxEms': case 'minEms': case 'ems': break;
      case 'ellipsize': v.$ellipsize = String(raw ?? val); break;
      case 'inputType': ren.setInputType(v, intVal(a)); break;
      case 'imeOptions': break;
      case 'checked': ren.setChecked(v, boolVal(a)); break;
      case 'button': break;
      case 'max': ren.setMax(v, intVal(a)); break;
      case 'min': v.$min = intVal(a); break;
      case 'progress': ren.setProgress(v, intVal(a)); break;
      case 'indeterminate': ren.setIndeterminate(v, boolVal(a)); break;
      case 'style': break;
      case 'theme': break;
      case 'numColumns': v.$cols = intVal(a); break;
      case 'entries': if (refId !== null) setEntriesFromResource(R, this, v, refId); break;
      case 'fillViewport': break;
      case 'baselineAligned': break;
      case 'layout_centerInParent': case 'layout_centerHorizontal': case 'layout_centerVertical':
      case 'layout_alignParentTop': case 'layout_alignParentBottom': case 'layout_alignParentLeft':
      case 'layout_alignParentRight': case 'layout_alignParentStart': case 'layout_alignParentEnd':
      case 'layout_below': case 'layout_above': case 'layout_toLeftOf': case 'layout_toRightOf':
      case 'layout_toStartOf': case 'layout_toEndOf': case 'layout_alignLeft': case 'layout_alignRight':
      case 'layout_alignTop': case 'layout_alignBottom': case 'layout_alignStart': case 'layout_alignEnd':
      case 'layout_alignBaseline':
        rlRule(v, name, a);
        break;
      case 'clipToPadding': case 'clipChildren': case 'animateLayoutChanges':
      case 'scrollbars': case 'scrollbarStyle': case 'fadeScrollbars': case 'overScrollMode':
      case 'descendantFocusability': case 'addStatesFromChildren': case 'duplicateParentState':
      case 'baseline': case 'isScrollContainer': case 'keepScreenOn': case 'hapticFeedbackEnabled':
      case 'soundEffectsEnabled': case 'saveEnabled': case 'importantForAccessibility':
      case 'accessibilityTraversalBefore': case 'labelFor': case 'nextFocusDown': case 'nextFocusUp':
      case 'nextFocusForward': case 'nextFocusLeft': case 'nextFocusRight': case 'onClick':
      case 'prompt': case 'spinnerMode': case 'dropDownWidth': case 'cursorVisible':
      case 'autoLink': case 'linksClickable': case 'freezesText': case 'shadowColor':
      case 'shadowRadius': case 'shadowDx': case 'shadowDy': case 'drawableLeft': case 'drawableStart':
      case 'drawableRight': case 'drawableEnd': case 'drawableTop': case 'drawableBottom':
      case 'drawablePadding': case 'lineSpacingExtra': case 'lineSpacingMultiplier':
      case 'textAppearance': case 'textColorHint': case 'textIsSelectable': case 'editorExtras':
      case 'privateImeOptions': case 'imeActionId': case 'imeActionLabel': case 'numeric':
      case 'digits': case 'phoneNumber': case 'password': case 'bufferType': case 'selectAllOnFocus':
      case 'marqueeRepeatLimit': case 'width': case 'height': case 'x': case 'y':
      case 'tag': case 'transitionName': case 'splitMotionEvents': case 'alwaysDrawnWithCache':
      case 'animationCache': case 'drawingCacheQuality': case 'filterTouchesWhenObscured':
      case 'fitsSystemWindows': case 'layoutAnimation': case 'persistentDrawingCache':
      case 'measureAllChildren': case 'foregroundGravity': case 'columnCount': case 'rowCount':
      case 'useDefaultMargins': case 'alignmentMode': case 'columnOrderPreserved': case 'rowOrderPreserved':
      case 'layout_column': case 'layout_row': case 'layout_columnSpan': case 'layout_rowSpan':
      case 'stretchColumns': case 'shrinkColumns': case 'collapseColumns': case 'layout_span':
      case 'divider': case 'dividerHeight': case 'dividerPadding': case 'showDividers':
      case 'stackFromBottom': case 'transcriptMode': case 'cacheColorHint': case 'fastScrollEnabled':
      case 'choiceMode': case 'drawSelectorOnTop': case 'listSelector': case 'smoothScrollbar':
      case 'layoutMode': case 'clipToOutline': case 'outlineProvider': case 'stateListAnimator':
      case 'backgroundTint': case 'backgroundTintMode': case 'foregroundTint': case 'progressTint':
      case 'indeterminateTint': case 'thumb': case 'thumbTint': case 'tickMark': case 'splitTrack':
      case 'maxHeight': case 'maxWidth': case 'minHeight': case 'minWidth': case 'firstBaselineToTopHeight':
      case 'lastBaselineToBottomHeight': case 'lineHeight': case 'autoSizeTextType': case 'autoSizeMinTextSize':
      case 'autoSizeMaxTextSize': case 'autoSizeStepGranularity': case 'autoSizePresetSizes':
      case 'letterSpacing': case 'textDirection': case 'textAlignment': case 'breakStrategy':
      case 'hyphenationFrequency': case 'justificationMode': case 'elegantTextHeight': case 'fontFeatureSettings':
      case 'includeFontPadding': case 'scrollHorizontally': case 'allowUndo': case 'textLocale':
        break;
      default:
        if (isAndroid && !name.startsWith('layout_')) { /* custom/app attrs — ignored */ }
        break;
    }
    } catch (e) {
      this.log('W', 'Dex2Web', `attribute ${name} failed: ${e.message}`);
    }
  }

  /** Expand a style resource bag (with its parent chain) into attribute apps. */
  applyStyleBag(v, styleId, parent, st, depth = 0) {
    if (!this.rt || depth > 6 || !styleId) return;
    const e = this.rt.get(styleId >>> 0);
    if (!e) return;
    if (e.parent) this.applyStyleBag(v, e.parent >>> 0, parent, st, depth + 1);
    if (!e.complex || !e.values) return;
    for (const val of e.values) {
      const name = this.attrName(val.name >>> 0);
      if (!name) continue;
      const synthetic = {
        name, ns: ANDROID_NS, dataType: val.dataType, data: val.data >>> 0,
        value: val.value, rawValue: val.dataType === TYPE.STRING ? (this.rt.string(val.data) ?? undefined) : undefined,
        resourceId: val.name >>> 0,
      };
      this.applyOne(v, synthetic, parent, st);
    }
  }
  /** Resolve a ?attr/… reference through the active theme bag. */
  resolveThemeAttrValue(attrId) {
    if (!this.rt) return null;
    const theme = this.themeId();
    const hit = this._styleLookup(theme, attrId >>> 0);
    if (!hit) return null;
    return { dataType: hit.dataType, data: hit.data >>> 0, value: hit.value, rawValue: hit.dataType === TYPE.STRING ? (this.rt.string(hit.data) ?? undefined) : undefined };
  }
  /** attr resource-id → name, harvested from every AXML resource map in the APK. */
  attrName(id) {
    if (!this._attrMap) this._buildAttrMap();
    return this._attrMap.get(id >>> 0) || null;
  }
  _buildAttrMap() {
    this._attrMap = new Map();
    if (!this.zip) return;
    for (const n of this.resFiles) {
      if (!/\.xml$/i.test(n)) continue;
      let doc;
      try { doc = this.axmlSync(n); } catch { continue; }
      if (!doc || !doc.resourceMap || !doc.pool) continue;
      for (let i = 0; i < doc.resourceMap.length; i++) {
        const rid = doc.resourceMap[i];
        if (rid && !this._attrMap.has(rid)) this._attrMap.set(rid, doc.pool.get(i));
      }
    }
  }
  axmlSync(path) {
    if (this._axmlCache.has(path)) return this._axmlCache.get(path);
    const doc = this.zip.has(path) ? parseAxml(this.zip.dataSync(path)) : null;
    this._axmlCache.set(path, doc);
    return doc;
  }

  /* ================================================================== */
  /*  Menus / dialogs / toasts                                           */
  /* ================================================================== */
  inflateMenu(resId, menu) {
    const path = this.layoutPathLike(resId, 'menu');
    if (!path) { this.log('W', 'Menu', `menu resource 0x${(resId >>> 0).toString(16)} not found`); return; }
    let doc;
    try { doc = parseAxml(this.zip.dataSync(path)); } catch { return; }
    const items = findAll(doc.root, 'item');
    menu.$items = [];
    for (const it of items) {
      const idA = attr(it, 'id'), titleA = attr(it, 'title'), iconA = attr(it, 'icon');
      const mi = {
        $c: this.R.klass('Landroid/view/MenuItem;'),
        $id: idA && idA.dataType === TYPE.REFERENCE ? idA.data : 0,
        $title: titleA ? this._attrText(titleA) : '',
        $icon: iconA && iconA.dataType === TYPE.REFERENCE ? iconA.data : 0,
        $visible: true,
      };
      menu.$items.push(mi);
    }
    this.emit('menu', menu.$items);
  }
  layoutPathLike(resId, type) {
    const e = this.rt && this.rt.get(resId | 0);
    if (e && e.str && this.zip.has(e.str)) return e.str;
    if (e) { const c = this.resFiles.filter((n) => n.startsWith(`res/${type}`) && n.endsWith('/' + e.key + '.xml')); if (c.length) return c[0]; }
    return null;
  }
  showPopup(popup) {
    if (!popup || !popup.$menu || !popup.$menu.$items) return;
    this.showMenuPopup(popup.$menu.$items, (mi) => {
      if (popup.$listener) { try { this.R.iv('Landroid/widget/PopupMenu$OnMenuItemClickListener;->onMenuItemClick(Landroid/view/MenuItem;)Z', popup.$listener, mi); } catch (e) { this.crash(e); } }
    });
  }
  showPopupAt(popup, anchor) { this.showPopup(popup); }
  dismissPopup() { this.closeOverlay(); }
  showMenuPopup(items, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'd2w-popup';
    for (const mi of items) {
      const b = document.createElement('button');
      b.textContent = mi.$title || '(untitled)';
      b.onclick = () => { this.closeOverlay(); onPick(mi); };
      wrap.appendChild(b);
    }
    this.overlay(wrap, false);
  }
  showDialog(d) {
    if (!d) return;
    d.$showing = true;
    const wrap = document.createElement('div');
    wrap.className = 'd2w-dialog';
    if (d.$title) { const h = document.createElement('h3'); h.textContent = d.$title; wrap.appendChild(h); }
    if (d.$msg) { const p = document.createElement('p'); p.textContent = d.$msg; wrap.appendChild(p); }
    if (d.$kind === 'date' || d.$kind === 'time') {
      const inp = document.createElement('input');
      inp.type = d.$kind === 'date' ? 'date' : 'time';
      inp.value = d.$kind === 'date' ? new Date().toISOString().slice(0, 10) : '12:00';
      wrap.appendChild(inp);
      d.$input = inp;
    }
    const btns = document.createElement('div');
    btns.className = 'd2w-dialog-btns';
    const R = this.R;
    const mkBtn = (label, listener, dismiss) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => {
        if (dismiss) this.closeOverlay();
        d.$showing = false;
        if (listener) {
          try { R.iv('Landroid/content/DialogInterface$OnClickListener;->onClick(Landroid/content/DialogInterface;I)V', listener, d, dismiss === 'pos' ? -1 : -2); }
          catch (e) { this.crash(e); }
        }
      };
      return b;
    };
    if (d.$neg) btns.appendChild(mkBtn(d.$neg[0] || 'Cancel', d.$neg[1], 'neg'));
    if (d.$neu) btns.appendChild(mkBtn(d.$neu[0] || 'Neutral', d.$neu[1], 'neu'));
    if (d.$pos) btns.appendChild(mkBtn(d.$pos[0] || 'OK', d.$pos[1], 'pos'));
    if (!btns.children.length) { const b = document.createElement('button'); b.textContent = 'OK'; b.onclick = () => this.closeOverlay(); btns.appendChild(b); }
    wrap.appendChild(btns);
    this.overlay(wrap, true);
  }
  dismissDialog(d) { if (d) d.$showing = false; this.closeOverlay(); }
  overlay(el, dim) {
    this.closeOverlay();
    const scrim = document.createElement('div');
    scrim.className = 'd2w-scrim' + (dim ? ' dim' : '');
    scrim.appendChild(el);
    scrim.addEventListener('click', (ev) => { if (ev.target === scrim) this.closeOverlay(); });
    (this.renderer.screen || document.body).appendChild(scrim);
    this.dialogEl = scrim;
  }
  closeOverlay() { if (this.dialogEl && this.dialogEl.parentNode) this.dialogEl.parentNode.removeChild(this.dialogEl); this.dialogEl = null; }
  toast(text, duration) {
    const host = this.renderer.screen || document.body;
    if (this.toastEl && this.toastEl.parentNode) this.toastEl.parentNode.removeChild(this.toastEl);
    const t = document.createElement('div');
    t.className = 'd2w-toast';
    t.textContent = text === null || text === undefined ? '' : String(text);
    host.appendChild(t);
    this.toastEl = t;
    this.emit('toast', text);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); if (this.toastEl === t) this.toastEl = null; }, duration === 1 ? 3500 : 2000);
  }

  /* ================================================================== */
  /*  SharedPreferences                                                  */
  /* ================================================================== */
  prefs(name) {
    const R = this.R;
    const key = name || 'default';
    if (this.prefsStore.has(key)) return this.prefsStore.get(key);
    const c = R.klass('Landroid/content/SharedPreferences;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$m = new Map();
    o.$name = key;
    try {
      const saved = localStorage.getItem('d2w:' + this.packageName + ':' + key);
      if (saved) for (const [k, v] of Object.entries(JSON.parse(saved))) o.$m.set(k, v);
    } catch { /* storage unavailable */ }
    this.prefsStore.set(key, o);
    return o;
  }
  persistPrefs(name, map) {
    try {
      const obj = {};
      for (const [k, v] of map) obj[k] = v;
      localStorage.setItem('d2w:' + this.packageName + ':' + (name || 'default'), JSON.stringify(obj));
    } catch { /* ignore */ }
  }
  clipboardWrite(text) {
    try { if (navigator.clipboard && text != null) navigator.clipboard.writeText(String(text)).catch(() => {}); } catch {}
    this.toast('Copied to clipboard', 0);
  }

  /* ================================================================== */
  /*  Media / WebView / GL                                               */
  /* ================================================================== */
  mediaEl(player) {
    if (player && player.$el) return player.$el;
    if (player) { player.$el = (typeof Audio !== 'undefined') ? new Audio() : null; if (player.$el) player.$el.preload = 'auto'; }
    this.media = player ? player.$el : this.media;
    return player ? player.$el : this.media;
  }
  mediaPrepare(player, async) {
    const el = this.mediaEl(player);
    if (!el || !player.$url) return;
    el.src = this.mediaSrc(player.$url);
    const fire = () => { if (player.$onPrepared) { try { this.R.iv('Landroid/media/MediaPlayer$OnPreparedListener;->onPrepared(Landroid/media/MediaPlayer;)V', player.$onPrepared, player); } catch (e) { this.crash(e); } } };
    if (async) el.addEventListener('loadedmetadata', fire, { once: true });
    else fire();
  }
  mediaSrc(url) {
    // asset:/file:// inside the package are served from the zip
    const m = /^(?:asset:|file:\/\/\/)?(?:android_asset\/)?(.+)$/.exec(String(url || ''));
    if (m && !/^https?:/i.test(url) && this.zip) {
      const cand = ['assets/' + m[1], m[1]];
      for (const c of cand) if (this.zip.has(c)) return this.dataUri(c);
    }
    return url;
  }
  attachMediaSurface(player, view) {
    if (!view || !view.$el) return;
    let video = view.$el.tagName === 'VIDEO' ? view.$el : view.$el.querySelector ? view.$el.querySelector('video') : null;
    if (!video) {
      video = document.createElement('video');
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
      video.setAttribute('playsinline', '');
      view.$el.innerHTML = '';
      view.$el.appendChild(video);
    }
    player.$el = video;
    if (player.$url) video.src = this.mediaSrc(player.$url);
    video.loop = !!player.$loop;
    video.addEventListener('ended', () => { if (player.$onComplete) { try { this.R.iv('Landroid/media/MediaPlayer$OnCompletionListener;->onCompletion(Landroid/media/MediaPlayer;)V', player.$onComplete, player); } catch (e) { this.crash(e); } } });
    video.addEventListener('error', () => { if (player.$onError) { try { this.R.iv('Landroid/media/MediaPlayer$OnErrorListener;->onError(Landroid/media/MediaPlayer;II)Z', player.$onError, player, 1, 0); } catch (e) { this.crash(e); } } else this.log('E', 'MediaPlayer', `media error: ${player.$url}`); });
  }
  mediaPlay(player) {
    try {
      const url = typeof player === 'string' ? player : player && player.$url;
      const el = typeof player === 'string' ? (this.media || (this.media = new Audio())) : this.mediaEl(player);
      if (!el) return;
      if (url && el.src !== this.mediaSrc(url)) el.src = this.mediaSrc(url);
      if (player && player.$loop) el.loop = true;
      const p = el.play();
      if (p && p.catch) p.catch(() => this.log('W', 'MediaPlayer', 'playback blocked by the browser autoplay policy'));
    } catch (e) { this.log('W', 'MediaPlayer', e.message); }
  }
  mediaPause(player) { try { const el = player ? player.$el : this.media; if (el) el.pause(); } catch {} }
  mediaPlaying(player) { const el = player ? player.$el : this.media; return el && !el.paused; }
  mediaDuration(player) { const el = player ? player.$el : this.media; return el && isFinite(el.duration) ? Math.round(el.duration * 1000) : 0; }
  mediaPosition(player) { const el = player ? player.$el : this.media; return el ? Math.round(el.currentTime * 1000) : 0; }
  mediaSeek(player, ms) { try { const el = player ? player.$el : this.media; if (el) el.currentTime = (ms | 0) / 1000; } catch {} }
  mediaRelease(player) { try { if (player && player.$el) { player.$el.pause(); player.$el.src = ''; } } catch {} }
  webviewLoad(view, url) {
    view.$url = url;
    const f = view.$el;
    if (!f || f.tagName !== 'IFRAME') return;
    this.log('I', 'WebView', `loadUrl(${url})`);
    // file:///android_asset/… lives inside the APK, so serve it from the zip.
    const m = /^file:\/\/\/android_asset\/(.*)$/.exec(String(url || ''));
    if (m) {
      const path = 'assets/' + decodeURIComponent(m[1]).replace(/^\/+/, '');
      if (this.zip.has(path)) { f.srcdoc = this.assetDocument(path); return; }
      this.log('W', 'WebView', `asset not found: ${path}`);
      return;
    }
    if (/^file:\/\/\//.test(String(url || ''))) { this.log('W', 'WebView', `cannot open ${url} outside the package`); return; }
    try { f.src = url; } catch (e) { this.log('W', 'WebView', e.message); }
  }
  /** Inline an asset HTML page, rewriting relative refs to data: URIs. */
  assetDocument(path) {
    const base = path.slice(0, path.lastIndexOf('/') + 1);
    let html = this.decodeUtf8Safe(this.zip.dataSync(path));
    const mimeOf = (p) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', html: 'text/html', htm: 'text/html', json: 'application/json', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }[p.split('.').pop().toLowerCase()] || 'application/octet-stream');
    return html.replace(/(src|href)=(["'])([^"']+)/g, (all, attr, q, ref) => {
      if (/^(https?:|data:|#|mailto:|javascript:)/i.test(ref)) return all;
      const target = base + ref.replace(/^\.?\//, '');
      if (!this.zip.has(target)) return all;
      const bytes = this.zip.dataSync(target);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return `${attr}=${q}data:${mimeOf(target)};base64,${this.b64(bin)}${q}`;
    });
  }
  b64(bin) {
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(bin, 'binary').toString('base64');
  }
  decodeUtf8Safe(bytes) {
    try { return new TextDecoder('utf-8').decode(bytes); } catch { return ''; }
  }
  webviewData(view, html) {
    const f = view.$el;
    if (!f || f.tagName !== 'IFRAME') return;
    f.srcdoc = String(html || '');
  }
  makeCanvas(bitmap) {
    const c = document.createElement('canvas');
    c.width = (bitmap && bitmap.$w) || 300;
    c.height = (bitmap && bitmap.$h) || 150;
    const ctx = c.getContext('2d');
    if (bitmap) bitmap.$canvas = c;
    return ctx;
  }
  redrawSurface(v) { /* canvas views draw imperatively */ }
  startGLRenderer(view, renderer) {
    view.$glRenderer = renderer;
    const e = view.$el;
    if (!e || e.tagName !== 'CANVAS') return;
    const sizeCanvas = () => { e.width = e.clientWidth || 300; e.height = e.clientHeight || 150; };
    sizeCanvas();
    this.log('I', 'GL', `GL renderer attached (${e.width}×${e.height}). WebGL calls are emulated as a 2D canvas.`);
    const R = this.R;
    const gl = new GLShim(e);
    view.$gl = gl;
    try {
      R.iv('Landroid/opengl/GLSurfaceView$Renderer;->onSurfaceCreated(Ljavax/microedition/khronos/opengles/GL10;Ljavax/opengl/EGLConfig;)V', renderer, gl.gl10, gl.eglConfig);
      R.iv('Landroid/opengl/GLSurfaceView$Renderer;->onSurfaceChanged(Ljavax/microedition/khronos/opengles/GL10;II)V', renderer, gl.gl10, e.width, e.height);
    } catch (err) { this.crash(err); }
    const loop = () => {
      if (view.$glStopped) return;
      view.$glRaf = requestAnimationFrame(loop);
      this.glRender(view);
    };
    if (view.$renderMode !== 0) view.$glRaf = requestAnimationFrame(loop);
  }
  stopGLRenderer(view) { view.$glStopped = true; if (view.$glRaf) cancelAnimationFrame(view.$glRaf); }
  glRender(view) {
    if (!view || !view.$glRenderer || !view.$gl) return;
    try { this.R.iv('Landroid/opengl/GLSurfaceView$Renderer;->onDrawFrame(Ljavax/microedition/khronos/opengles/GL10;)V', view.$glRenderer, view.$gl.gl10); }
    catch (e) { this.stopGLRenderer(view); this.crash(e); }
    view.$gl.present();
  }
  lockCanvas(view) { return this.renderer.lockCanvas(view); }
  surfaceCreated(view, cb) { this.renderer.surfaceCreated(view, cb); }
  surfaceRect(view) { return this.renderer.surfaceRect(view); }

  /* ================================================================== */
  /*  RecyclerView adapter                                               */
  /* ================================================================== */
  setRecyclerAdapter(rv, adapter) {
    if (!rv || !adapter) return;
    rv.$adapter = adapter;
    adapter.$bound = rv;
    this.renderer.ensureView(rv, 'LinearLayout');
    const R = this.R;
    const el = rv.$el;
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.overflowY = 'auto';
    el.innerHTML = '';
    rv.$children = [];
    let n = 0;
    try { n = R.iv('Landroidx/recyclerview/widget/RecyclerView$Adapter;->getItemCount()I', adapter) | 0; } catch (e) { this.crash(e); return; }
    const horizontal = rv.$lm && /Horizontal/.test(this.R.classNameOf(rv.$lm));
    if (horizontal) { el.style.flexDirection = 'row'; el.style.overflowX = 'auto'; el.style.overflowY = 'hidden'; }
    for (let i = 0; i < Math.min(n, 500); i++) {
      let holder = null, itemView = null;
      try {
        const type = R.iv('Landroidx/recyclerview/widget/RecyclerView$Adapter;->getItemViewType(I)I', adapter, i) | 0;
        holder = R.iv('Landroidx/recyclerview/widget/RecyclerView$Adapter;->onCreateViewHolder(Landroid/view/ViewGroup;I)Landroidx/recyclerview/widget/RecyclerView$ViewHolder;', adapter, rv, type);
        if (holder) {
          holder.$pos = i;
          itemView = holder.$itemView || holder['Landroidx/recyclerview/widget/RecyclerView$ViewHolder;->itemView:Landroid/view/View;'];
          if (itemView) R.iv('Landroidx/recyclerview/widget/RecyclerView$Adapter;->onBindViewHolder(Landroidx/recyclerview/widget/RecyclerView$ViewHolder;I)V', adapter, holder, i);
        }
      } catch (e) { this.crash(e); }
      if (!itemView) itemView = this.renderer.makeLabelView(`item ${i}`);
      this.renderer.ensureView(itemView, itemView.$kind || 'View');
      itemView.$el.classList.add('av-listitem');
      el.appendChild(itemView.$el);
      rv.$children.push(itemView);
      itemView.$parent = rv;
    }
    this.emit('status', `RecyclerView rendered ${n} items`);
  }

  /* ================================================================== */
  /*  Boot                                                               */
  /* ================================================================== */
  async boot() {
    if (!this.manifest || !this.manifest.launcherName) {
      const err = new Error('This APK declares no launcher <activity> — it is a service / tile / widget-only package.');
      err.noLauncher = true;
      throw err;
    }
    this.startedAt = performance.now();
    this.R._callStack = [];
    const t0 = performance.now();
    await this.launch(this.manifest.launcherName);
    const dt = performance.now() - t0;
    this.log('I', 'Dex2Web', `Activity displayed in ${dt.toFixed(1)} ms`);
    this.emit('status', `Running ${this.manifest.launcherName}`);
    return dt;
  }

  /** Invoke an arbitrary method from the console panel. */
  invokeRaw(ownerDesc, sig, args) {
    const R = this.R;
    const cls = R.klass(ownerDesc);
    R.initClass(cls);
    const m = R.findMethod(cls, sig);
    if (!m) throw new Error(`no such method ${ownerDesc}->${sig}`);
    return R.callMethod(m, args);
  }

  /* ---- plurals ---- */
  plural(id, n) {
    if (!this.rt) return '';
    const e = this.rt.get(id | 0);
    if (!e || !e.complex || !e.values || !e.values.length) return this.resString(id);
    const pick = (mod) => e.values.find((v) => ((v.name >>> 0) & 0xff) === mod) || e.values[e.values.length - 1];
    const v = n === 1 ? pick(4) : pick(6);
    if (!v) return '';
    if (v.dataType === TYPE.STRING) return this.rt.valuePool ? (this.rt.valuePool.get(v.data) ?? '') : '';
    return this.rt.describe({ dataType: v.dataType, data: v.data, value: v.value });
  }

  /* ---- res/anim tween animations → CSS ---- */
  loadAnim(id) {
    const R = this.R;
    const c = R.klass('Landroid/view/animation/Animation;');
    R.initClass(c);
    const a = R.newInstanceObj(c);
    a.$ops = [];
    a.$dur = 300;
    const path = this.layoutPathLike(id, 'anim');
    if (path) {
      try {
        const doc = parseAxml(this.zip.dataSync(path));
        const walk = (node) => {
          for (const ch of node.children || []) {
            const g = (nm) => { const at = attr(ch, nm); return at ? at : null; };
            const dur = g('duration'); const interp = g('interpolator');
            if (dur) a.$dur = this._dimOrInt(dur);
            const op = { tag: ch.tag };
            for (const at of ch.attrs || []) {
              const vv = at.dataType === TYPE.DIMENSION ? unpackDimension(at.data) : null;
              op[at.name] = vv ? vv.value : (typeof at.value === 'number' ? at.value : parseFloat(String(at.rawValue ?? at.value ?? '')) || 0);
              if (at.name === 'fromAlpha' || at.name === 'toAlpha') op[at.name] = parseFloat(String(at.rawValue ?? at.value)) || 0;
            }
            a.$ops.push(op);
            walk(ch);
          }
        };
        walk(doc.root);
      } catch (e) { this.log('W', 'Animation', `cannot parse anim ${path}: ${e.message}`); }
    }
    return a;
  }
  _dimOrInt(at) {
    if (at.dataType === TYPE.DIMENSION) { const d = unpackDimension(at.data); return dimToPx(d.value, d.unit, 1); }
    if (typeof at.value === 'number') return at.value;
    return parseInt(String(at.rawValue ?? at.value ?? '300'), 10) || 300;
  }
  runViewAnimation(view, anim) {
    if (!view || !view.$el || !anim) return;
    const el = view.$el;
    const dur = anim.$dur || 300;
    let transform = '';
    let opacity = null;
    for (const op of (anim.$ops || [])) {
      if (op.tag === 'alpha') opacity = op.toAlpha === undefined ? 1 : op.toAlpha;
      if (op.tag === 'translate') transform += `translate(${op.toXDelta || 0}px, ${op.toYDelta || 0}px) `;
      if (op.tag === 'scale') transform += `scale(${op.toXScale === undefined ? 1 : op.toXScale}, ${op.toYScale === undefined ? 1 : op.toYScale}) `;
      if (op.tag === 'rotate') transform += `rotate(${op.toDegrees || 0}deg) `;
    }
    const listen = anim.$listener;
    const R = this.R;
    if (listen) { try { R.iv('Landroid/view/animation/Animation$AnimationListener;->onAnimationStart(Landroid/view/animation/Animation;)V', listen, anim); } catch (e) { this.crash(e); } }
    el.style.transition = `transform ${dur}ms ease, opacity ${dur}ms ease`;
    requestAnimationFrame(() => {
      if (transform) el.style.transform = transform.trim();
      if (opacity !== null) el.style.opacity = String(opacity);
    });
    setTimeout(() => {
      el.style.transition = '';
      if (!anim.$fill) { el.style.transform = ''; if (opacity !== null) el.style.opacity = ''; }
      if (listen) { try { R.iv('Landroid/view/animation/Animation$AnimationListener;->onAnimationEnd(Landroid/view/animation/Animation;)V', listen, anim); } catch (e) { this.crash(e); } }
    }, dur + 30);
  }

  /* ---- sensors ---- */
  registerSensor(listener, type, rate) {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    this._sensorListeners = this._sensorListeners || new Map();
    if (this._sensorListeners.has(listener)) return;
    const R = this.R;
    const evName = (type === 4 || type === 40) ? 'deviceorientation' : 'devicemotion';
    const handler = (ev) => {
      const c = R.klass('Landroid/hardware/SensorEvent;');
      const se = R.newInstanceObj(c);
      const vals = evName === 'devicemotion'
        ? [(ev.accelerationIncludingGravity && ev.accelerationIncludingGravity.x) || 0, (ev.accelerationIncludingGravity && ev.accelerationIncludingGravity.y) || 0, (ev.accelerationIncludingGravity && ev.accelerationIncludingGravity.z) || 0]
        : [ev.alpha || 0, ev.beta || 0, ev.gamma || 0];
      const arr = vals.map((x) => Math.fround(x));
      arr[ARR_CLASS] = R.klass('[F');
      se['Landroid/hardware/SensorEvent;->values:[F'] = arr;
      se.$values = arr;
      se['Landroid/hardware/SensorEvent;->timestamp:J'] = Date.now();
      try { R.iv('Landroid/hardware/SensorEventListener;->onSensorChanged(Landroid/hardware/SensorEvent;)V', listener, se); }
      catch (e) { this.crash(e); this.unregisterSensor(listener); }
    };
    window.addEventListener(evName, handler);
    this._sensorListeners.set(listener, { evName, handler });
    this.log('I', 'SensorManager', `listening for ${evName} (sensor type ${type})`);
  }
  unregisterSensor(listener) {
    const e = this._sensorListeners && this._sensorListeners.get(listener);
    if (e && typeof window !== 'undefined') window.removeEventListener(e.evName, e.handler);
    if (this._sensorListeners) this._sensorListeners.delete(listener);
  }
  geoAvailable() { return typeof navigator !== 'undefined' && !!navigator.geolocation; }
  lastLocation() {
    if (!this._lastLoc) return null;
    return this._lastLoc;
  }
  watchLocation(listener, once) {
    if (!this.geoAvailable()) { this.log('W', 'Location', 'geolocation unavailable in this browser context'); return; }
    const R = this.R;
    const mk = (pos) => {
      const c = R.klass('Landroid/location/Location;');
      R.initClass(c);
      const o = R.newInstanceObj(c);
      o.$provider = 'network';
      o.$lat = pos.coords.latitude; o.$lon = pos.coords.longitude;
      o.$acc = pos.coords.accuracy || 0; o.$alt = pos.coords.altitude || 0;
      o.$time = pos.timestamp;
      this._lastLoc = o;
      return o;
    };
    const ok = (pos) => {
      const loc = mk(pos);
      try { R.iv('Landroid/location/LocationListener;->onLocationChanged(Landroid/location/Location;)V', listener, loc); }
      catch (e) { this.crash(e); this.unwatchLocation(listener); }
      if (once) this.unwatchLocation(listener);
    };
    const err = () => { try { R.iv('Landroid/location/LocationListener;->onProviderDisabled(Ljava/lang/String;)V', listener, 'network'); } catch { /* optional */ } };
    const id = navigator.geolocation.watchPosition(ok, err, { enableHighAccuracy: true, maximumAge: 5000 });
    this._geoWatches = this._geoWatches || new Map();
    this._geoWatches.set(listener, id);
    this.log('I', 'Location', 'geolocation watch started (permission prompt may appear)');
  }
  unwatchLocation(listener) {
    const id = this._geoWatches && this._geoWatches.get(listener);
    if (id !== undefined && this.geoAvailable()) navigator.geolocation.clearWatch(id);
    if (this._geoWatches) this._geoWatches.delete(listener);
  }

  /* ---- vibration / sound / clipboard ---- */
  canVibrate() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; }
  vibrate(ms) { try { if (this.canVibrate()) navigator.vibrate(Math.max(0, Math.min(5000, ms | 0))); } catch { /* denied */ } }
  vibratePattern(pat) { try { if (this.canVibrate()) navigator.vibrate(Array.from(pat || []).map((x) => Math.max(0, Math.min(5000, x | 0)))); } catch { /* denied */ } }
  resRawUri(id) {
    const e = this.rt && this.rt.get(id | 0);
    if (e && e.str && this.zip.has(e.str)) return this.dataUri(e.str);
    return null;
  }
  playSound(uri, loop) {
    if (!uri || typeof Audio === 'undefined') return;
    try {
      const a = new Audio(uri);
      a.loop = !!loop;
      this._sounds = this._sounds || new Set();
      this._sounds.add(a);
      const p = a.play();
      if (p && p.catch) p.catch(() => this.log('W', 'SoundPool', 'playback blocked by autoplay policy'));
    } catch (e) { this.log('W', 'SoundPool', e.message); }
  }
  stopSounds() { for (const a of this._sounds || []) { try { a.pause(); } catch { /* noop */ } } if (this._sounds) this._sounds.clear(); }
  clipboardWrite(text) {
    this._clip = text === null || text === undefined ? null : String(text);
    try { if (navigator.clipboard && this._clip != null) navigator.clipboard.writeText(this._clip).catch(() => {}); } catch { /* denied */ }
  }
  clipboardRead() {
    const R = this.R;
    const c = R.klass('Landroid/content/ClipData;');
    R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$text = this._clip || '';
    return o;
  }
  clipboardText() { return this._clip === undefined ? null : this._clip; }

  /* ---- services, receivers, work manager ---- */
  startServiceInstance(intent, from) {
    const R = this.R;
    const name = intent && (intent.$clsName || (intent.$cls && intent.$cls['Ljava/lang/Class;->desc:Ljava/lang/String;'] ? intent.$cls['Ljava/lang/Class;->desc:Ljava/lang/String;'].slice(1, -1).replace(/\//g, '.') : null));
    if (!name) { this.log('W', 'Service', 'startService with no component'); return null; }
    const desc = 'L' + name.replace(/\./g, '/') + ';';
    if (!R.classes.has(desc)) { this.log('W', 'Service', `service ${name} not in this APK`); return null; }
    this._services = this._services || new Map();
    let svc = this._services.get(desc);
    if (!svc) {
      const cls = R.klass(desc); R.initClass(cls);
      svc = R.newInstanceObj(cls);
      this._services.set(desc, svc);
      try {
        const ci = R.findMethod(cls, '<init>()V'); if (ci) R.callMethod(ci, [svc]);
        this._callLifecycle(cls, svc, 'onCreate', '()V', []);
      } catch (e) { this.crash(e); }
    }
    try { this._callLifecycle(cls, svc, 'onStartCommand', '(Landroid/content/Intent;II)I', [intent, 0, (this._serviceIds = (this._serviceIds || 0) + 1)]); }
    catch (e) { this.crash(e); }
    this.log('I', 'ActivityManager', `service started: ${name}`);
    const cn = R.newInstanceObj(R.klass('Landroid/content/ComponentName;'));
    cn.$p = this.packageName; cn.$n = name;
    return cn;
  }
  stopServiceInstance(intent) {
    const R = this.R;
    const name = intent && intent.$clsName;
    if (!name || !this._services) return 0;
    const desc = 'L' + name.replace(/\./g, '/') + ';';
    const svc = this._services.get(desc);
    if (!svc) return 0;
    try { this._callLifecycle(svc.$c, svc, 'onDestroy', '()V', []); } catch (e) { this.crash(e); }
    this._services.delete(desc);
    return 1;
  }
  registerReceiverInstance(recv, filter) {
    this._receivers = this._receivers || [];
    this._receivers.push({ recv, actions: (filter && filter.$actions) || [] });
    return null;
  }
  sendBroadcastInternal(intent) {
    const R = this.R;
    const action = intent && intent.$action;
    this.log('I', 'Broadcast', `sendBroadcast ${action || '(none)'}`);
    for (const r of (this._receivers || []).slice()) {
      if (!r.actions.length || r.actions.includes(action)) {
        try { R.iv('Landroid/content/BroadcastReceiver;->onReceive(Landroid/content/Context;Landroid/content/Intent;)V', r.recv, this.applicationContext(), intent); }
        catch (e) { this.crash(e); }
      }
    }
    for (const name of (this.manifest ? this.manifest.receivers : [])) {
      const desc = 'L' + name.replace(/\./g, '/') + ';';
      if (!R.classes.has(desc)) continue;
      const cls = R.klass(desc); R.initClass(cls);
      const recv = R.newInstanceObj(cls);
      try {
        const ci = R.findMethod(cls, '<init>()V'); if (ci) R.callMethod(ci, [recv]);
        R.iv('Landroid/content/BroadcastReceiver;->onReceive(Landroid/content/Context;Landroid/content/Intent;)V', recv, this.applicationContext(), intent);
      } catch (e) { this.crash(e); }
    }
  }
  enqueueWork(request) {
    const R = this.R;
    const worker = request && request.$workerCls ? R.ni(request.$workerCls) : null;
    const delay = (request && request.$delay) || 0;
    this.postDelayed(() => {
      if (!worker) return;
      try {
        const res = R.iv('Landroidx/work/ListenableWorker;->startWork()Lcom/google/common/util/concurrent/ListenableFuture;', worker) ;
      } catch {
        try { R.iv('Landroidx/work/Worker;->doWork()Landroidx/work/ListenableWorker$Result;', worker); }
        catch (e) { this.crash(e); }
      }
    }, delay);
    this.log('I', 'WorkManager', `work enqueued (delay ${delay} ms)`);
    return mkUuid(R);
  }

  /* ---- options menu in the title bar ---- */
  showActivityMenu(activity) {
    const R = this.R;
    const menu = R.newInstanceObj(R.klass('Landroid/view/Menu;'));
    menu.$items = [];
    let created = false;
    try { created = !!this._callLifecycle(activity.$c, activity, 'onCreateOptionsMenu', '(Landroid/view/Menu;)Z', [menu]); } catch (e) { this.crash(e); }
    if (!created || !menu.$items.length) return;
    activity.$menu = menu;
    const tb = typeof document !== 'undefined' ? document.querySelector('.titlebar') : null;
    if (!tb) return;
    tb.classList.add('on');
    let btn = tb.querySelector('.d2w-overflow');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'd2w-overflow';
      btn.textContent = '⋮';
      btn.style.cssText = 'position:absolute;right:6px;top:4px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer;padding:4px 10px;';
      tb.appendChild(btn);
      btn.addEventListener('click', () => {
        this.showMenuPopup(menu.$items, (mi) => {
          try { R.iv('Landroid/app/Activity;->onOptionsItemSelected(Landroid/view/MenuItem;)Z', activity, mi); } catch (e) { this.crash(e); }
        });
      });
    }
  }

  /* ---- resource qualifiers from the browser environment ---- */
  resConfig() {
    if (this._resCfg) return this._resCfg;
    let lang = 'en', dark = false;
    try { lang = (navigator.language || 'en').slice(0, 2); } catch { /* noop */ }
    try { dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch { /* noop */ }
    this._resCfg = { lang, dark };
    return this._resCfg;
  }

  /* ---- hardware keyboard → KeyEvent dispatch ---- */
  attachKeyInput(el) {
    if (!el || el.__keysBound) return;
    el.__keysBound = true;
    const KEYCODES = { Escape: 4, Enter: 66, Backspace: 67, Tab: 61, ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, Home: 3, Menu: 82, Delete: 112, ' ': 62 };
    const mk = (action, ev) => {
      const R = this.R;
      const c = R.klass('Landroid/view/KeyEvent;');
      R.initClass(c);
      const o = R.newInstanceObj(c);
      o.$action = action;
      o.$code = KEYCODES[ev.key] || (ev.key && ev.key.length === 1 ? ev.key.toUpperCase().charCodeAt(0) : 0);
      o.$ch = ev.key && ev.key.length === 1 ? ev.key.charCodeAt(0) : 0;
      o.$chars = ev.key && ev.key.length === 1 ? ev.key : null;
      return o;
    };
    const dispatch = (action, ev) => {
      const R = this.R;
      const act = this.activities[this.activities.length - 1];
      if (!act) return;
      const ke = mk(action, ev);
      const focused = typeof document !== 'undefined' && document.activeElement && document.activeElement.__view ? document.activeElement.__view : null;
      try {
        if (focused && focused.$onKey) {
          const handled = R.iv('Landroid/view/View$OnKeyListener;->onKey(Landroid/view/View;ILandroid/view/KeyEvent;)Z', focused.$onKey, focused, ke.$code, ke);
          if (handled) { ev.preventDefault(); return; }
        }
        const sig = action === 0 ? 'onKeyDown(ILandroid/view/KeyEvent;)Z' : 'onKeyUp(ILandroid/view/KeyEvent;)Z';
        const handled = R.iv(`Landroid/app/Activity;->${sig}`, act, ke.$code, ke);
        if (handled) ev.preventDefault();
      } catch (e) { this.crash(e); }
    };
    el.addEventListener('keydown', (ev) => {
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return; // let text fields eat their keys
      dispatch(0, ev);
    });
    el.addEventListener('keyup', (ev) => {
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      dispatch(1, ev);
    });
  }

  /* ---- notifications / downloads / providers / remote views ---- */
  notify(tag, id, n) {
    const title = n && n.$title ? String(n.$title) : '';
    const text = n && n.$text ? String(n.$text) : '';
    this.log('I', 'Notification', `#${id}${tag ? ' [' + tag + ']' : ''}: ${title} ${text}`.trim());
    this.toast(`${title}${text ? ' — ' + text : ''}`, 1);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(title || this.manifest.label || 'Notification', { body: text });
    } catch { /* sandboxed */ }
  }
  download(url, title) {
    this._downloads = this._downloads || new Map();
    const id = (this._downloadSeq = (this._downloadSeq || 0) + 1);
    this._downloads.set(id, url);
    this.log('I', 'DownloadManager', `enqueue #${id}: ${url}`);
    try {
      if (typeof document !== 'undefined' && url && /^https?:/i.test(url)) {
        const a = document.createElement('a');
        a.href = url; a.download = title || ''; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch { /* blocked */ }
    return id;
  }
  downloadUri(id) { return (this._downloads && this._downloads.get(id | 0)) || null; }
  providerFor(uri) {
    const auth = uri && uri.$u ? (uri.$u.split('/')[2] || '') : '';
    for (const p of (this._providers || [])) if (p.authority === auth) return p.instance;
    return null;
  }
  ensureProviders() {
    if (this._providers) return;
    this._providers = [];
    const R = this.R;
    for (const name of (this.manifest ? this.manifest.providers : [])) {
      const desc = 'L' + name.replace(/\./g, '/') + ';';
      if (!R.classes.has(desc)) continue;
      const cls = R.klass(desc); R.initClass(cls);
      const inst = R.newInstanceObj(cls);
      try {
        const ci = R.findMethod(cls, '<init>()V'); if (ci) R.callMethod(ci, [inst]);
        inst.$ctx = this.applicationContext();
        R.iv('Landroid/content/ContentProvider;->onCreate()Z', inst);
      } catch (e) { this.crash(e); }
      const authority = inst['Landroid/content/ContentProvider;->authority:Ljava/lang/String;'] || name.toLowerCase();
      this._providers.push({ authority, instance: inst });
    }
  }
  providerQuery(uri, proj, sel, sargs, order) {
    this.ensureProviders();
    const p = this.providerFor(uri);
    if (!p) { this.log('W', 'ContentResolver', `no provider for ${uri && uri.$u}`); return null; }
    try { return this.R.iv('Landroid/content/ContentProvider;->query(Landroid/net/Uri;[Ljava/lang/String;Ljava/lang/String;[Ljava/lang/String;Ljava/lang/String;)Landroid/database/Cursor;', p, uri, proj, sel, sargs, order); }
    catch (e) { this.crash(e); return null; }
  }
  providerInsert(uri, cv) { this.ensureProviders(); const p = this.providerFor(uri); if (!p) return null; try { return this.R.iv('Landroid/content/ContentProvider;->insert(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;', p, uri, cv); } catch (e) { this.crash(e); return null; } }
  providerUpdate(uri, cv, sel, sargs) { this.ensureProviders(); const p = this.providerFor(uri); if (!p) return 0; try { return this.R.iv('Landroid/content/ContentProvider;->update(Landroid/net/Uri;Landroid/content/ContentValues;Ljava/lang/String;[Ljava/lang/String;)I', p, uri, cv, sel, sargs); } catch (e) { this.crash(e); return 0; } }
  providerDelete(uri, sel, sargs) { this.ensureProviders(); const p = this.providerFor(uri); if (!p) return 0; try { return this.R.iv('Landroid/content/ContentProvider;->delete(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)I', p, uri, sel, sargs); } catch (e) { this.crash(e); return 0; } }
  applyRemoteViews(rv, ctx, parent, existing) {
    const R = this.R;
    let root = existing || null;
    if (!root && rv.$layout) root = this.inflateSync(rv.$layout, parent || null, false);
    if (!root) return null;
    for (const act of (rv.$actions || [])) {
      const target = this.renderer.findViewById(root, act[1]);
      if (!target) continue;
      if (act[0] === 'text') this.renderer.setText(target, act[2]);
      else if (act[0] === 'vis') { target.$vis = act[2]; this.renderer.applyVisibility(target); }
      else if (act[0] === 'img') this.renderer.setImageResource(target, act[2]);
      else if (act[0] === 'prog') this.renderer.setProgress(target, act[3]);
      else if (act[0] === 'click') this.renderer.applyClickable(Object.assign(target, { $onClick: { $c: R.klass('Landroid/view/View$OnClickListener;'), $pending: act[2], onClick: (v) => { try { R.iv('Landroid/app/PendingIntent;->send()V', act[2]); } catch (e) { this.crash(e); } } } }));
    }
    return root;
  }
  refreshChoice(list) {
    const els = list.$el ? list.$el.children : [];
    for (let i = 0; i < els.length; i++) els[i].classList.toggle('av-selected', !!(list.$checkedSet && list.$checkedSet.has(i)));
  }

  initView(v, kind) { return this.renderer.ensureView(v, kind); }
  viewSetBackground(v, c) { v.$bg = c | 0; this.renderer.applyBackground(v); }
  viewSetPadding(v, l, t, r, b) { this.renderer.applyPadding(v, l, t, r, b); }

  /* ---- a tiny in-memory /data/data filesystem ---- */
  get vfs() { return this._vfs || (this._vfs = new Map()); }
  openFileInput(name) {
    const R = this.R;
    const data = this.vfs.get(name);
    if (data === undefined) throw R.newException('Ljava/io/FileNotFoundException;', name);
    const c = R.klass('Ljava/io/ByteArrayInputStream;'); R.initClass(c);
    const o = R.newInstanceObj(c);
    const b = Array.from(data); b[ARR_CLASS] = R.klass('[B');
    o.$b = b; o.$p = 0; o.$name = name;
    return o;
  }
  openFileOutput(name) {
    const R = this.R;
    const c = R.klass('Ljava/io/ByteArrayOutputStream;'); R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$b = []; o.$name = name;
    const self = this;
    o.$onClose = () => { const b = arrOf(R, o.$b); self.vfs.set(name, b); };
    return o;
  }

  reset() {
    this.halt();
    this.taskExecutions = 0;
    this._budgetWarned = false;
    this._postCounts = new WeakMap();
    for (const a of this.activities.slice()) { a.$caller = null; this.finish(a); }
    this.activities = [];
    this.closeOverlay();
    if (this.renderer.screen) this.renderer.screen.innerHTML = '';
    if (this.media) { try { this.media.pause(); } catch {} }
  }
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
/** android:TextAppearance* framework styles → sizes in sp (1sp = 1px here). */
const TEXT_APPEARANCE_SIZES = {
  0x01030000: 16, 0x01030001: 16,
  0x01030040: 22, 0x01030041: 18, 0x01030042: 14,
  0x01030043: 22, 0x01030044: 18, 0x01030045: 14,
  0x01030160: 20, 0x01030161: 15, 0x01030162: 17, 0x01030163: 14,
  0x01030164: 34, 0x01030165: 45, 0x01030166: 56, 0x01030167: 112,
  0x01030168: 14, 0x01030169: 24,
};
function luminance(argb) {
  const r = ((argb >>> 16) & 0xff) / 255, g = ((argb >>> 8) & 0xff) / 255, b = (argb & 0xff) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function shade(argb, amt) {
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return `rgb(${f((argb >>> 16) & 0xff)},${f((argb >>> 8) & 0xff)},${f(argb & 0xff)})`;
}

function guessKind(desc) {
  const n = desc.split('/').pop().replace(';', '');
  if (/^(TextView|Button|EditText|CheckBox|RadioButton|Switch|ToggleButton)$/.test(n)) return n;
  if (/^(ImageView|ImageButton|ProgressBar|SeekBar|Spinner|SurfaceView|WebView|ListView|GridView|ScrollView|LinearLayout|RelativeLayout|FrameLayout)$/.test(n)) return n;
  if (/Layout|Group|ScrollView|ListView|GridView|RecyclerView|ViewPager|DrawerLayout|CoordinatorLayout|CardView|Toolbar/.test(n)) return 'ViewGroup';
  if (/TextView|Button|EditText|CheckBox|RadioButton|Switch/.test(n)) return 'TextView';
  if (/ImageView/.test(n)) return 'ImageView';
  return 'ViewGroup';
}
function call(R, v, sig, args) {
  const cls = v && v.$c ? v.$c : null;
  if (!cls) return;
  const m = R.findMethod(cls, sig);
  if (m) R.callMethod(m, [v, ...args]);
}
function mkLp(R, linear) {
  const c = R.klass(linear ? 'Landroid/widget/LinearLayout$LayoutParams;' : 'Landroid/view/ViewGroup$MarginLayoutParams;');
  const o = { $c: c, $w: WRAP_CONTENT, $h: WRAP_CONTENT, $weight: 0 };
  if (linear) o.$gravity = undefined;
  return o;
}
function arrOf(R, items) { const a = items.slice(); a[ARR_CLASS] = R.klass('[B'); return a; }
function makeIntent(R) { const c = R.klass('Landroid/content/Intent;'); R.initClass(c); const o = R.newInstanceObj(c); o.$extras = new Map(); return o; }
function launcherIntent(R, activityName, pkg) {
  const i = makeIntent(R);
  i.$action = 'android.intent.action.MAIN';
  i.$categories = ['android.intent.category.LAUNCHER'];
  i.$clsName = activityName;
  const cn = R.newInstanceObj(R.klass('Landroid/content/ComponentName;'));
  cn.$p = pkg; cn.$n = activityName;
  i.$component = cn;
  return i;
}
function makeBundle(R) { const c = R.klass('Landroid/os/Bundle;'); R.initClass(c); const o = R.newInstanceObj(c); o.$m = new Map(); return o; }
function makeWindow(R, activity) { const c = R.klass('Landroid/view/Window;'); R.initClass(c); const o = R.newInstanceObj(c); o.$activity = activity; return o; }
function camelUpper(s) { return String(s).replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase()).replace(/^fitXY$/i, 'FIT_XY').toUpperCase(); }

function isColorType(a) { return a.dataType >= TYPE.INT_COLOR_ARGB8 && a.dataType <= TYPE.INT_COLOR_RGB4; }
function intVal(a) {
  if (a.dataType === TYPE.INT_BOOLEAN) return a.data ? 1 : 0;
  if (a.dataType === TYPE.INT_DEC || a.dataType === TYPE.INT_HEX) return a.data | 0;
  if (a.dataType === TYPE.REFERENCE) return a.data | 0;
  if (typeof a.value === 'number') return a.value | 0;
  if (typeof a.value === 'boolean') return a.value ? 1 : 0;
  const n = parseInt(String(a.rawValue ?? a.value ?? ''), 10);
  return isNaN(n) ? 0 : n;
}
function intOr(a, dflt) { const n = intVal(a); return n === 0 && dflt !== undefined && String(a.rawValue ?? '') === '' ? dflt : n; }
function numVal(a) {
  if (a.dataType === TYPE.FLOAT) return a.value;
  if (a.dataType === TYPE.DIMENSION) { const d = unpackDimension(a.data); return dimToPx(d.value, d.unit); }
  if (typeof a.value === 'number') return a.value;
  const n = parseFloat(String(a.rawValue ?? a.value ?? ''));
  return isNaN(n) ? 0 : n;
}
function boolVal(a) {
  if (a.dataType === TYPE.INT_BOOLEAN) return a.data !== 0;
  if (typeof a.value === 'boolean') return a.value;
  const s = String(a.rawValue ?? a.value ?? '');
  return s === 'true' || s === '1';
}
function dimVal(a, host) {
  if (a.dataType === TYPE.DIMENSION) { const d = unpackDimension(a.data); return dimToPx(d.value, d.unit, 1); }
  if (a.dataType === TYPE.REFERENCE) return host.resDimen(a.data);
  if (a.dataType === TYPE.FLOAT) return a.value;
  if (typeof a.value === 'number') return a.value;
  const s = String(a.rawValue ?? a.value ?? '0');
  const m = /^(-?[\d.]+)\s*(dp|dip|sp|px|pt|in|mm)?$/.exec(s);
  if (m) return dimToPx(parseFloat(m[1]), { px: 0, dp: 1, dip: 1, sp: 2, pt: 3, in: 4, mm: 5 }[m[2] || 'dp'] ?? 1, 1);
  return 0;
}
function colorVal(a, host) {
  if (isColorType(a)) return a.data | 0;
  if (a.dataType === TYPE.INT_DEC || a.dataType === TYPE.INT_HEX) return a.data | 0;
  if (a.dataType === TYPE.REFERENCE) return host.resColor(a.data) | 0;
  const s = String(a.rawValue ?? (a.value && a.value.color ? a.value.text : a.value) ?? '');
  const c = parseCssColor(s);
  return c === null ? 0xff000000 | 0 : c;
}
function sizeVal(a, host) {
  const s = String(a.rawValue ?? a.value ?? '');
  if (s === 'match_parent' || s === 'fill_parent') return MATCH_PARENT;
  if (s === 'wrap_content') return WRAP_CONTENT;
  if (a.dataType === TYPE.DIMENSION) { const d = unpackDimension(a.data); return dimToPx(d.value, d.unit, 1); }
  if (a.dataType === TYPE.REFERENCE) return host.resDimen(a.data);
  if (typeof a.value === 'number') return a.value;
  const m = /^(-?[\d.]+)/.exec(s);
  return m ? parseFloat(m[1]) : WRAP_CONTENT;
}
function colorDrawable(R, c) {
  const cls = R.klass('Landroid/graphics/drawable/ColorDrawable;');
  R.initClass(cls);
  const o = R.newInstanceObj(cls);
  o.$color = c | 0;
  return o;
}
function setEntriesFromResource(R, host, v, resId) {
  const items = host.resStringArray(resId);
  if (!items) return;
  const cls = R.klass('Landroid/widget/ArrayAdapter;');
  R.initClass(cls);
  const adapter = R.newInstanceObj(cls);
  adapter.$items = items.slice();
  adapter.$ctx = host.currentActivity();
  R.iv('Landroid/widget/Spinner;->setAdapter(Landroid/widget/SpinnerAdapter;)V', v, adapter);
}
function parseCssColor(s) {
  if (!s) return null;
  s = String(s).trim();
  const named = { white: 0xffffffff, black: 0xff000000, red: 0xffff0000, green: 0xff00ff00, blue: 0xff0000ff, gray: 0xff888888, grey: 0xff888888, transparent: 0, yellow: 0xffffff00, cyan: 0xff00ffff, magenta: 0xffff00ff };
  if (named[s.toLowerCase()] !== undefined) return named[s.toLowerCase()] | 0;
  if (s[0] === '#') {
    const h = s.slice(1);
    if (h.length === 6) return (0xff000000 | parseInt(h, 16)) | 0;
    if (h.length === 8) return parseInt(h, 16) | 0;
    if (h.length === 3) return (0xff000000 | parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16)) | 0;
  }
  const rgba = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s);
  if (rgba) {
    const a = rgba[4] === undefined ? 255 : Math.round(parseFloat(rgba[4]) * 255);
    return ((a << 24) | (parseInt(rgba[1], 10) << 16) | (parseInt(rgba[2], 10) << 8) | parseInt(rgba[3], 10)) | 0;
  }
  return null;
}
function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dimOf(v) { if (v && typeof v === 'object' && v.dim !== undefined) return v.dim; const n = parseFloat(v); return isNaN(n) ? null : n; }
function shapeSvg(size, corners, stroke, inner) {
  const w = size ? dimOf(attr(size, 'width')) || 48 : 48;
  const h = size ? dimOf(attr(size, 'height')) || 48 : 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}
function rectAttrs(size, corners) {
  const w = size ? (dimOf(attr(size, 'width')) || 48) : 48;
  const h = size ? (dimOf(attr(size, 'height')) || 48) : 48;
  const r = corners ? (dimOf(attr(corners, 'radius')) || 0) : 0;
  return `x="0.5" y="0.5" width="${Math.max(0, w - 1)}" height="${Math.max(0, h - 1)}" rx="${r}" ry="${r}"`;
}
function strokeAttrs(stroke) {
  if (!stroke) return '';
  const w = dimOf(attr(stroke, 'width')) || 1;
  const c = attr(stroke, 'color');
  const css = c && c.value && c.value.color ? c.value.color : (c && typeof c.value === 'number' ? argbToCss(c.value >>> 0, TYPE.INT_COLOR_ARGB8) : '#000');
  return `stroke="${css}" stroke-width="${w}"`;
}
function stripSvgWrapper(svg) {
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg);
  return m ? m[1] : '';
}
function rlRule(v, name, a) {
  v.$rules = v.$rules || {};
  const key = name.replace('layout_', '');
  v.$rules[key] = a.dataType === TYPE.REFERENCE ? (a.data >>> 0) : (boolVal(a) ? -1 : 0);
}
function applyRelativeRules(parent, v) {
  const e = v.$el;
  if (!e) return;
  const r = v.$rules || {};
  e.style.position = '';
  if (r.centerInParent || (r.centerHorizontal && r.centerVertical)) { e.style.margin = 'auto'; }
  else if (r.centerHorizontal) { e.style.marginLeft = 'auto'; e.style.marginRight = 'auto'; }
  else if (r.centerVertical) { e.style.marginTop = 'auto'; e.style.marginBottom = 'auto'; }
  if (r.alignParentRight || r.alignParentEnd) { e.style.marginLeft = 'auto'; }
  if (r.alignParentBottom) { e.style.marginTop = 'auto'; }
}
function emptyScreen(msg) {
  const d = document.createElement('div');
  d.className = 'd2w-empty';
  d.textContent = msg;
  return d;
}

/* A very small GL10 stand-in: real WebGL is out of scope, but the renderer
 * callbacks still fire so apps that draw with GL at least get a surface. */
class GLShim {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gl10 = { $c: null, glClear: () => { this.ctx.clearRect(0, 0, canvas.width, canvas.height); }, glClearColor: () => {} };
    this.eglConfig = { $c: null };
    const self = this;
    const noop = () => {};
    this.gl10 = new Proxy(this.gl10, { get: (t, k) => (k in t ? t[k] : noop) });
  }
  present() { /* the 2D context draws directly to the visible canvas */ }
}
