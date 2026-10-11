/* deviceprofile.js — EXPERIMENTAL "pretend to be a real phone" device spoof.
 *
 * Off by default. When enabled from Settings, every freshly created Host gets a
 * realistic handheld identity layered over the Android shim: android.os.Build
 * fields, system properties (ro.product.* / ro.build.*), DisplayMetrics density
 * & dpi, TelephonyManager (IMEI/MSISDN/carrier/network type), BatteryManager
 * plus sticky BATTERY_CHANGED broadcasts that actually reach registerReceiver'ed
 * receivers, ConnectivityManager (NetworkInfo + API-26 NetworkCapabilities),
 * PackageManager (PackageInfo/ApplicationInfo/Signature), WifiManager/WifiInfo,
 * a full Location stack (LocationManager/LocationProvider/Location with a
 * browser-geolocation bridge), PowerManager+WakeLock, UsageStatsManager,
 * ActivityManager memory stats, StatFs storage sizes, a stable per-install
 * ANDROID_ID across Settings.Secure/System/Global and a real Chrome-on-Android
 * User-Agent for WebView. Streaming apps probe exactly these surfaces when
 * deciding whether they are on a "real phone", so we answer like a Pixel 7 (or
 * a Galaxy S23) instead of a browser.
 *
 * The module never edits framework sources at load time; it patches each Host
 * after installFramework() has run and wraps Runtime.def so classes defined
 * later (e.g. the DEX's own android.os.Build stubs) still receive the fake
 * values. It also wraps Transpiler.getMethodFn so dex-declared methods that the
 * APK compiles lazily (Build.VERSION.SDK_INT readers, custom Build fields…)
 * resolve to the spoofed values instead of the DEX's placeholder bodies.
 * With the setting OFF nothing here executes and behaviour is unchanged.
 */

import { ARR_CLASS } from './runtime.js';

const S = 'Ljava/lang/String;';
const O = 'Ljava/lang/Object;';
const Z = 'Z', I = 'I', J = 'J', F = 'F', D = 'D', V = 'V';
const BOOL = (b) => (b ? 1 : 0);

export const SETTINGS_PKG = 'dex2web.settings';
export const SETTING_KEY = 'experimental_device_spoof';
export const PROFILE_PREF = '__d2w_profile';
const LS_KEY = 'd2w:settings:' + SETTING_KEY;

/* ---- selectable device profiles ------------------------------------------ */
export const PROFILES = {
  pixel7: {
    label: 'Google Pixel 7 (Android 13)',
    brand: 'Google', manufacturer: 'Google', model: 'Pixel 7', device: 'panther',
    product: 'Panther', hardware: 'shiba', board: 'panther', bootloader: 'bslider-2-230842000-10957661',
    radio: 'g5123b-230625-N-9858572', incremental: '10957681', id: 'TP1A.221005.002',
    release: '13', sdk: 33, securityPatch: '2023-03-05',
    fingerprint: 'Google/Panther/panther:13/TP1A.221005.002/10957681:user/release-keys',
    tags: 'release-keys', type: 'user', hostName: 'abfarm-release-20220715-0149',
    buildUser: 'android-build', codename: 'REL',
    baseOS: 'google/panther/panther:13/TP1A.220624.014/9672499:user/release-keys',
    displayId: 'TP1A.221005.002 release-keys',
    cpuAbi: 'arm64-v8a', cpuAbis: ['arm64-v8a', 'armeabi-v7a', 'armeabi'],
    width: 1080, height: 2400, densityDpi: 420, density: 2.625, xdpi: 411.008, ydpi: 412.37,
    carrier: 'T-Mobile', simCarrier: 'T-Mobile', mcc: 310, mnc: 260, countryIso: 'us',
    networkType: 20, phoneType: 1, dataActivity: 2, line1: '+15555550123',
    imei: '356938035643809', meid: 'A00000277775D1', subscriberId: '310260959543279',
    batteryLevel: 78, batteryVoltage: 4021, batteryTemp: 275, batteryStatus: 3, batteryHealth: 2,
    batteryTechnology: 'Li-ion', batteryPlugged: 0, batteryPresent: true, chargeTimeFull: 25200000,
    uaProduct: 'Pixel 7',
  },
  s23: {
    label: 'Samsung Galaxy S23 (Android 13, One UI 5.1)',
    brand: 'samsung', manufacturer: 'samsung', model: 'SM-S911B', device: 'dm2q',
    product: 'dm2qxxx', hardware: 'samsungexynos2200', board: 'S911B', bootloader: 'S911BXXU2AWK3',
    radio: 'S911BXXU2AWK3', incremental: 'S911BXXU2AWK3', id: 'TP1A.220624.014',
    release: '13', sdk: 33, securityPatch: '2023-04-01',
    fingerprint: 'samsung/dm2qxxx/dm2q:13/TP1A.220624.014/S911BXXU2AWK3:user/release-keys',
    tags: 'release-keys', type: 'user', hostName: 'SWDH7923',
    buildUser: 'dkipr.dev', codename: 'REL', baseOS: '',
    displayId: 'TP1A.220624.014.S911BXXU2AWK3',
    cpuAbi: 'arm64-v8a', cpuAbis: ['arm64-v8a', 'armeabi-v7a', 'armeabi'],
    width: 1080, height: 2340, densityDpi: 420, density: 2.625, xdpi: 425.0, ydpi: 426.0,
    carrier: 'Verizon Wireless', simCarrier: 'Verizon Wireless', mcc: 311, mnc: 480, countryIso: 'us',
    networkType: 13, phoneType: 1, dataActivity: 2, line1: '+15551239876',
    imei: '351555102223334', meid: 'A1000055556666', subscriberId: '311480959543210',
    batteryLevel: 64, batteryVoltage: 4100, batteryTemp: 268, batteryStatus: 3, batteryHealth: 2,
    batteryTechnology: 'Li-ion', batteryPlugged: 0, batteryPresent: true, chargeTimeFull: 32400000,
    uaProduct: 'SM-S911B',
  },
};
export const DEFAULT_PROFILE = 'pixel7';

/* ---- persisted settings (localStorage; safe no-ops under Node/domstub) --- */
export function loadSetting() {
  try { const v = localStorage.getItem(LS_KEY); return v === null ? false : v === '1'; }
  catch { return false; }
}
export function saveSetting(on) {
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
export function currentProfileId() {
  try { const p = localStorage.getItem(PROFILE_PREF); return PROFILES[p] ? p : DEFAULT_PROFILE; }
  catch { return DEFAULT_PROFILE; }
}
export function setProfileId(id) {
  try { if (PROFILES[id]) localStorage.setItem(PROFILE_PREF, id); } catch { /* ignore */ }
}

/* deterministic per-install hex id (stable across reloads via localStorage) */
function installHex(prefix, len) {
  let seedStr = prefix + '|dex2web-install';
  try {
    seedStr += '|' + localStorage.getItem('d2w:installseed');
  } catch { /* no storage: fall back to UA-derived seed */ }
  try { seedStr += '|' + navigator.userAgent + '|' + location.host; } catch { /* node */ }
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  let out = '';
  for (let k = 0; out.length < len; k++) {
    h = (Math.imul(h ^ (h >>> 15), 0x2545f491) ^ (h << 13)) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, len);
}

/* ---- patch one Host (call right after installFramework) ------------------- */
export function applyDeviceProfile(host, profile) {
  const P = Object.assign({}, profile || PROFILES[DEFAULT_PROFILE]);
  const R = host.R;
  const H = host;
  P.androidId = installHex('android_id', 16);
  P.serial = installHex('serial', 16).toUpperCase();

  const jarr = (desc, items) => { const a = items.slice(); a[ARR_CLASS] = R.klass(desc); return a; };
  const mkIntent = (action, extras) => {
    const c = R.klass('Landroid/content/Intent;'); R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$action = action; o.$extras = new Map(Object.entries(extras || {}));
    return o;
  };

  /* value builders (captured before the def-wrapped patches reference them) */
  const BUILD_STATICS = {
    'Landroid/os/Build;->MODEL:Ljava/lang/String;': P.model,
    'Landroid/os/Build;->MANUFACTURER:Ljava/lang/String;': P.manufacturer,
    'Landroid/os/Build;->BRAND:Ljava/lang/String;': P.brand,
    'Landroid/os/Build;->DEVICE:Ljava/lang/String;': P.device,
    'Landroid/os/Build;->PRODUCT:Ljava/lang/String;': P.product,
    'Landroid/os/Build;->HARDWARE:Ljava/lang/String;': P.hardware,
    'Landroid/os/Build;->BOARD:Ljava/lang/String;': P.board,
    'Landroid/os/Build;->BOOTLOADER:Ljava/lang/String;': P.bootloader,
    'Landroid/os/Build;->RADIO:Ljava/lang/String;': P.radio,
    'Landroid/os/Build;->FINGERPRINT:Ljava/lang/String;': P.fingerprint,
    'Landroid/os/Build;->ID:Ljava/lang/String;': P.id,
    'Landroid/os/Build;->HOST:Ljava/lang/String;': P.hostName,
    'Landroid/os/Build;->USER:Ljava/lang/String;': P.buildUser,
    'Landroid/os/Build;->SERIAL:Ljava/lang/String;': P.serial,
    'Landroid/os/Build;->TAGS:Ljava/lang/String;': P.tags,
    'Landroid/os/Build;->TYPE:Ljava/lang/String;': P.type,
    'Landroid/os/Build;->CPU_ABI:Ljava/lang/String;': P.cpuAbi,
    'Landroid/os/Build;->CPU_ABI2:Ljava/lang/String;': P.cpuAbis[1] || '',
    'Landroid/os/Build;->SUPPORTED_ABIS:[Ljava/lang/String;': jarr('[Ljava/lang/String;', P.cpuAbis),
    'Landroid/os/Build;->SUPPORTED_64_BIT_ABIS:[Ljava/lang/String;': jarr('[Ljava/lang/String;', P.cpuAbis.filter((a) => a.includes('64'))),
    'Landroid/os/Build;->SUPPORTED_32_BIT_ABIS:[Ljava/lang/String;': jarr('[Ljava/lang/String;', P.cpuAbis.filter((a) => !a.includes('64'))),
  };
  const VERSION_STATICS = {
    'Landroid/os/Build$VERSION;->SDK_INT:I': P.sdk,
    'Landroid/os/Build$VERSION;->RELEASE:Ljava/lang/String;': P.release,
    'Landroid/os/Build$VERSION;->CODENAME:Ljava/lang/String;': P.codename,
    'Landroid/os/Build$VERSION;->INCREMENTAL:Ljava/lang/String;': P.incremental,
    'Landroid/os/Build$VERSION;->SECURITY_PATCH:Ljava/lang/String;': P.securityPatch,
    'Landroid/os/Build$VERSION;->BASE_OS:Ljava/lang/String;': P.baseOS,
    'Landroid/os/Build$VERSION;->ACTIVE_CODENAMES:[Ljava/lang/String;': jarr('[Ljava/lang/String;', []),
    'Landroid/os/Build$VERSION;->ALL_CODENAMES:[Ljava/lang/String;': jarr('[Ljava/lang/String;', ['REL']),
  };
  const TM_METHODS = {
    ['getDeviceId()' + S]: () => P.imei,
    ['getImei()' + S]: () => P.imei,
    ['getMeid()' + S]: () => P.meid,
    ['getSubscriberId()' + S]: () => P.subscriberId,
    ['getLine1Number()' + S]: () => P.line1,
    ['getNetworkOperator()' + S]: () => String(P.mcc) + String(P.mnc).padStart(3, '0'),
    ['getNetworkOperatorName()' + S]: () => P.carrier,
    ['getSimOperator()' + S]: () => String(P.mcc) + String(P.mnc).padStart(3, '0'),
    ['getSimOperatorName()' + S]: () => P.simCarrier,
    ['getNetworkCountryIso()' + S]: () => P.countryIso,
    ['getSimCountryIso()' + S]: () => P.countryIso,
    ['getSimSerialNumber()' + S]: () => installHex('sim', 20),
    ['getDataActivity()' + I]: () => P.dataActivity,
    ['getNetworkType()' + I]: () => P.networkType,
    ['getPhoneType()' + I]: () => P.phoneType,
    ['getCallState()' + I]: () => 0,
    ['isDataEnabled()' + Z]: () => 1,
    ['isDataRoaming()' + Z]: () => 0,
    ['isEnabled()' + Z]: () => 1,
    ['hasIccCard()' + Z]: () => 1,
    ['getMobileDataEnabled()' + Z]: () => 1,
    ['getVoiceMailNumber()' + S]: () => null,
  };
  const TM_STATICS = {
    'Landroid/telephony/TelephonyManager;->PHONE_TYPE_GSM:I': 1,
    'Landroid/telephony/TelephonyManager;->PHONE_TYPE_NONE:I': 0,
    'Landroid/telephony/TelephonyManager;->DATA_ACTIVITY_IN:I': 1,
    'Landroid/telephony/TelephonyManager;->DATA_ACTIVITY_OUT:I': 2,
    'Landroid/telephony/TelephonyManager;->DATA_ACTIVITY_DORMANT:I': 4,
    'Landroid/telephony/TelephonyManager;->CALL_STATE_IDLE:I': 0,
    'Landroid/telephony/TelephonyManager;->NETWORK_TYPE_LTE:I': 13,
    'Landroid/telephony/TelephonyManager;->NETWORK_TYPE_5G_SA:I': 21,
  };
  const BM_METHODS = {
    ['getIntProperty(I)' + I]: (s, p) => (p === 4 ? P.batteryLevel : p === 5 ? 1 : p === 6 ? P.batteryVoltage : p === 7 ? P.batteryTemp : p === 8 ? P.batteryStatus : p === 9 ? P.batteryHealth : p === 10 ? P.batteryPlugged : -1),
    ['getLongProperty(I)' + J]: (s, p) => (p === 1 ? P.chargeTimeFull : -1),
    ['isCharging()' + Z]: () => BOOL(P.batteryStatus === 2),
    ['computeChargeTimeRemaining()' + J]: () => -1,
  };
  const BM_STATICS = {
    'Landroid/os/BatteryManager;->EXTRA_LEVEL:Ljava/lang/String;': 'level',
    'Landroid/os/BatteryManager;->EXTRA_SCALE:Ljava/lang/String;': 'scale',
    'Landroid/os/BatteryManager;->EXTRA_STATUS:Ljava/lang/String;': 'status',
    'Landroid/os/BatteryManager;->EXTRA_PLUGGED:Ljava/lang/String;': 'plugged',
    'Landroid/os/BatteryManager;->EXTRA_HEALTH:Ljava/lang/String;': 'health',
    'Landroid/os/BatteryManager;->EXTRA_PRESENT:Ljava/lang/String;': 'present',
    'Landroid/os/BatteryManager;->EXTRA_TECHNOLOGY:Ljava/lang/String;': 'technology',
    'Landroid/os/BatteryManager;->EXTRA_VOLTAGE:Ljava/lang/String;': 'voltage',
    'Landroid/os/BatteryManager;->EXTRA_TEMPERATURE:Ljava/lang/String;': 'temperature',
    'Landroid/os/BatteryManager;->EXTRA_ICON_LEVEL:Ljava/lang/String;': 'icon-level',
    'Landroid/os/BatteryManager;->BATTERY_STATUS_UNKNOWN:I': 1,
    'Landroid/os/BatteryManager;->BATTERY_STATUS_CHARGING:I': 2,
    'Landroid/os/BatteryManager;->BATTERY_STATUS_DISCHARGING:I': 3,
    'Landroid/os/BatteryManager;->BATTERY_STATUS_NOT_CHARGING:I': 4,
    'Landroid/os/BatteryManager;->BATTERY_STATUS_FULL:I': 5,
    'Landroid/os/BatteryManager;->BATTERY_HEALTH_GOOD:I': 2,
    'Landroid/os/BatteryManager;->BATTERY_PROPERTY_CAPACITY:I': 4,
    'Landroid/os/BatteryManager;->PLUGGED_AC:I': 1,
    'Landroid/os/BatteryManager;->PLUGGED_USB:I': 2,
    'Landroid/os/BatteryManager;->PLUGGED_WIRELESS:I': 4,
  };
  const CM_STATIC_ADD = {
    'Landroid/net/ConnectivityManager;->TYPE_MOBILE:I': 0,
    'Landroid/net/ConnectivityManager;->TYPE_WIFI:I': 1,
    'Landroid/net/ConnectivityManager;->NET_CAPABILITY_INTERNET:I': 12,
    'Landroid/net/ConnectivityManager;->NET_CAPABILITY_VALIDATED:I': 16,
    'Landroid/net/ConnectivityManager;->NET_CAPABILITY_NOT_ROAMING:I': 15,
    'Landroid/net/ConnectivityManager;->NET_CAPABILITY_NOT_VPN:I': 27,
  };
  const DM_STATIC_ADD = {
    'Landroid/util/DisplayMetrics;->DENSITY_LOW:I': 120, 'Landroid/util/DisplayMetrics;->DENSITY_MEDIUM:I': 160,
    'Landroid/util/DisplayMetrics;->DENSITY_TV:I': 213, 'Landroid/util/DisplayMetrics;->DENSITY_HIGH:I': 240,
    'Landroid/util/DisplayMetrics;->DENSITY_XHIGH:I': 320, 'Landroid/util/DisplayMetrics;->DENSITY_XXHIGH:I': 480,
    'Landroid/util/DisplayMetrics;->DENSITY_XXXHIGH:I': 640, 'Landroid/util/DisplayMetrics;->DENSITY_420:I': 420,
  };
  const SECURE_SM = {
    ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: (r, k) => (String(k) === 'android_id' ? P.androidId : null),
  };
  const UA = `Mozilla/5.0 (Linux; Android ${P.release}; ${P.uaProduct}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36`;
  const WEB_METHODS = {
    ['getUserAgentString()' + S]: (s) => s.$ua || UA,
    ['setUserAgentString(Ljava/lang/String;)' + V]: (s, u) => { s.$ua = u; },
  };

  /* late class definitions from the APK's own DEX must stay spoofed too */
  const PATCHERS = {
    'Landroid/os/Build;': (c) => { Object.assign(c.statics, BUILD_STATICS); },
    'Landroid/os/Build$VERSION;': (c) => { Object.assign(c.statics, VERSION_STATICS); },
    'Landroid/telephony/TelephonyManager;': (c) => { mergeMethods(c, TM_METHODS); assignIfEmpty(c.statics, TM_STATICS); },
    'Landroid/os/BatteryManager;': (c) => { mergeMethods(c, BM_METHODS); Object.assign(c.statics, BM_STATICS); },
    'Landroid/net/ConnectivityManager;': (c) => { assignIfEmpty(c.statics, CM_STATIC_ADD); },
    'Landroid/util/DisplayMetrics;': (c) => { assignIfEmpty(c.statics, DM_STATIC_ADD); },
    'Landroid/provider/Settings$Secure;': (c) => { mergeStaticMethods(c, SECURE_SM); },
    'Landroid/webkit/WebSettings;': (c) => { mergeMethods(c, WEB_METHODS); },
  };
  if (!R.__d2wDefWrapped) {
    R.__d2wDefWrapped = true;
    const origDef = R.def.bind(R);
    R.def = function (desc, spec) {
      const c = origDef(desc, spec);
      try { const f = PATCHERS[desc]; if (f) f(c); } catch { /* never break loading */ }
      return c;
    };
  }

  /* ---- android.os.Build ---------------------------------------------------- */
  R.def('Landroid/os/Build;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: BUILD_STATICS, sm: {
    ['isDebuggable()' + Z]: () => 0,
    ['isEmulator()' + Z]: () => 0,
    ['isUserDebug()' + Z]: () => 0,
    ['isFingerprintValid(Ljava/lang/String;)' + Z]: () => 1,
    ['getRadioVersion()' + S]: () => P.radio,
  } });
  R.def('Landroid/os/Build$VERSION;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: VERSION_STATICS });
  R.def('Landroid/os/Build$VERSION_CODES;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.klass('Landroid/os/Build$VERSION_CODES;').statics['Landroid/os/Build$VERSION_CODES;->TIRAMISU:I'] = 33;

  /* ---- System.getProperty("ro.*") ----------------------------------------- */
  const props = {
    'ro.product.model': P.model, 'ro.product.brand': P.brand, 'ro.product.name': P.product,
    'ro.product.device': P.device, 'ro.product.manufacturer': P.manufacturer,
    'ro.product.cpu.abi': P.cpuAbi, 'ro.product.cpu.abilist': P.cpuAbis.join(','),
    'ro.product.cpu.abilist32': P.cpuAbis.filter((a) => !a.includes('64')).join(','),
    'ro.product.cpu.abilist64': P.cpuAbis.filter((a) => a.includes('64')).join(','),
    'ro.build.version.sdk': String(P.sdk), 'ro.build.version.release': P.release,
    'ro.build.version.incremental': P.incremental, 'ro.build.version.security_patch': P.securityPatch,
    'ro.build.version.codename': P.codename, 'ro.build.id': P.id, 'ro.build.display.id': P.displayId,
    'ro.build.type': P.type, 'ro.build.tags': P.tags, 'ro.build.user': P.buildUser,
    'ro.build.host': P.buildHost, 'ro.build.fingerprint': P.fingerprint,
    'ro.build.product': P.device, 'ro.hardware': P.hardware, 'ro.boot.hardware': P.hardware,
    'ro.board.platform': P.hardware, 'ro.product.board': P.board,
    'persist.sys.timezone': 'America/New_York', 'gsm.version.baseband': P.radio,
    'qemu.hw.mainkeys': '0', 'ro.sf.lcd_density': String(P.densityDpi),
  };
  const SysC = R.klass('Ljava/lang/System;');
  if (SysC && SysC.methods.size) {
    const put = (name, proto, fn) => R.M('Ljava/lang/System;', name, proto, 0x109, fn);
    put('getProperty', `(${S})${S}`, (k) => (props[k] !== undefined ? props[k] : ((SysC.statics['$props'] || {})[k] ?? null)));
    put('getProperty', `(${S}${S})${S}`, (k, d) => (props[k] !== undefined ? props[k] : d));
    put('setProperty', `(${S}${S})${S}`, (k, v) => { (SysC.statics['$props'] = SysC.statics['$props'] || {})[k] = v; return v; });
  }

  /* ---- DisplayMetrics: real density / dpi ---------------------------------- */
  assignIfEmpty(R.klass('Landroid/util/DisplayMetrics;').statics, DM_STATIC_ADD);
  host.displayMetrics = function () {
    const c = R.klass('Landroid/util/DisplayMetrics;');
    const o = R.newInstanceObj(c);
    o['Landroid/util/DisplayMetrics;->widthPixels:I'] = H.screenWidth ? H.screenWidth() : P.width;
    o['Landroid/util/DisplayMetrics;->heightPixels:I'] = H.screenHeight ? H.screenHeight() : P.height;
    o['Landroid/util/DisplayMetrics;->density:F'] = P.density;
    o['Landroid/util/DisplayMetrics;->densityDpi:I'] = P.densityDpi;
    o['Landroid/util/DisplayMetrics;->scaledDensity:F'] = P.density;
    o['Landroid/util/DisplayMetrics;->xdpi:F'] = P.xdpi;
    o['Landroid/util/DisplayMetrics;->ydpi:F'] = P.ydpi;
    return o;
  };

  /* ---- TelephonyManager ------------------------------------------------------ */
  R.def('Landroid/telephony/TelephonyManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: TM_METHODS, statics: TM_STATICS });

  /* ---- ConnectivityManager: connected mobile/Wi-Fi --------------------------- */
  assignIfEmpty(R.klass('Landroid/net/ConnectivityManager;').statics, CM_STATIC_ADD);
  const connPatch = {
    ['getActiveNetworkInfo()Landroid/net/NetworkInfo;']: () => {
      const c = R.klass('Landroid/net/NetworkInfo;'); R.initClass(c);
      const o = R.newInstanceObj(c); o.$connected = true; return o;
    },
    ['getNetworkInfo(I)Landroid/net/NetworkInfo;']: (s, t) => {
      const c = R.klass('Landroid/net/NetworkInfo;'); R.initClass(c);
      const o = R.newInstanceObj(c); o.$connected = (t === 0 || t === 1); return o;
    },
    ['isActiveNetworkMetered()' + Z]: () => 0,
  };
  mergeMethods(R.klass('Landroid/net/ConnectivityManager;'), connPatch);

  /* ---- BatteryManager + sticky BATTERY_CHANGED ------------------------------- */
  R.def('Landroid/os/BatteryManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: BM_METHODS, statics: BM_STATICS });
  const batteryIntent = () => mkIntent('android.intent.action.BATTERY_CHANGED', {
    level: P.batteryLevel, scale: 100, status: P.batteryStatus, health: P.batteryHealth,
    plugged: P.batteryPlugged, present: BOOL(P.batteryPresent), technology: P.batteryTechnology,
    voltage: P.batteryVoltage, temperature: P.batteryTemp, 'icon-level': Math.ceil(P.batteryLevel / 10),
  });
  /* registerReceiver must deliver the sticky battery broadcast immediately,
     which is exactly what real Android does for BATTERY_CHANGED. */
  H.registerReceiver = function (recv, filter) {
    this._receivers = this._receivers || [];
    this._receivers.push({ recv, actions: (filter && filter.$actions) || [] });
    const acts = (filter && filter.$actions) || [];
    if (!acts.length || acts.includes('android.intent.action.BATTERY_CHANGED')) {
      try { R.iv('Landroid/content/BroadcastReceiver;->onReceive(Landroid/content/Context;Landroid/content/Intent;)V', recv, this.applicationContext(), batteryIntent()); }
      catch (e) { this.crash(e); }
    }
    return null;
  };
  const origSend = typeof H.sendBroadcastInternal === 'function' ? H.sendBroadcastInternal.bind(H) : null;
  H.sendBroadcastInternal = function (intent) {
    if (intent && intent.$action === 'android.intent.action.BATTERY_CHANGED') {
      const b = batteryIntent();
      for (const [k, v] of b.$extras) if (!intent.$extras || !intent.$extras.has(k)) intent.$extras.set(k, v);
    }
    if (origSend) return origSend(intent);
  };

  /* ---- Settings.Secure.getString(android_id) --------------------------------- */
  R.def('Landroid/provider/Settings$Secure;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: SECURE_SM });

  /* ---- WebView User-Agent ----------------------------------------------------- */
  R.def('Landroid/webkit/WebSettings;', { access: 0x21, sup: 'Ljava/lang/Object;', m: WEB_METHODS });

  /* ---- mirror the choice into the app-visible SharedPreferences store --------- */
  try {
    const sp = H.prefs(SETTINGS_PKG);
    if (sp && sp.$m) {
      sp.$m.set(SETTING_KEY, 1);
      sp.$m.set(PROFILE_PREF, P.label);
      if (H.persistPrefs) H.persistPrefs(SETTINGS_PKG, sp.$m);
    }
  } catch { /* ignore */ }

  H.log('I', 'DeviceProfile', `Experimental spoof ON → ${P.label} · API ${P.sdk} · ${P.width}×${P.height}@${P.densityDpi}dpi · android_id ${P.androidId}`);
  return P;
}

/* is the setting currently engaged? (single source of truth for host + app) */
export function isEnabled() { return loadSetting(); }

/* ---- small helpers ---------------------------------------------------------- */
function assignIfEmpty(target, vals) {
  for (const k in vals) if (target[k] === undefined) target[k] = vals[k];
}
function mergeMethods(c, methods) {
  for (const sig in methods) {
    const m = c.methods.get(sig);
    if (!m) continue;                 // method not declared on this shim — skip
    m.nativeFn = methods[sig]; m.stub = null;
  }
}
function mergeStaticMethods(c, sms) {
  for (const sig in sms) {
    const m = c.methods.get(sig);
    if (!m) continue;
    m.nativeFn = sms[sig]; m.stub = null;
    m.accessFlags |= 0x8;
  }
}
