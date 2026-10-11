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
    /* enterprise-emulator extras (Genymotion / Android Studio managed AVDs) */
    ramBytes: 8 * 1024 * 1024 * 1024, cores: 8, gpu: 'Adreno (TM) 663', opengles: 32,
    dataTotal: 128e9, dataFree: 96e9, sysTotal: 4.5e9, extTotal: 128e9, extFree: 96e9,
    mac: '5E:22:B3:E9:1F:A7', ipInt: 0x0A01A8C0, gatewayInt: 0x0A01A8C0, netMask: 0xFFFFFF00,
    dns1: '8.8.8.8', dns2: '8.8.4.4', wifiSsid: '"HomeNet-5G"', wifiBssid: '5E:22:B3:E9:1F:A7',
    sensors: [
      ['LSensor;->ACCELEROMETER:I', 'LSensor;->TYPE_ACCELEROMETER:I', 'lsm6dso Accelerometer Non-wakeup', 'STMicro', 3.7e-4, 20.0, 0.0039, 6],
      ['LSensor;->GYROSCOPE:I', 'LSensor;->TYPE_GYROSCOPE:I', 'lsm6dso Gyroscope Non-wakeup', 'STMicro', 1.7e-4, 2000.0 / 9.81, 0.0, 6],
      ['LSensor;->MAGNETOMETER:I', 'LSensor;->TYPE_MAGNETIC_FIELD:I', 'ak09918 Magnetometer Non-wakeup', 'akm', 0.15, 2000.0, 1.2, 10],
      ['LSensor;->LIGHT:I', 'LSensor;->TYPE_LIGHT:I', 'stk33af Proximity Sensor Wakeup', 'sensortek', 1.0, 65535.0, 0.0, 1],
      ['LSensor;->PROXIMITY:I', 'LSensor;->TYPE_PROXIMITY:I', 'stk33af Proximity Sensor Wakeup', 'sensortek', 5.0, 5.0, 0.0, 0],
      ['LSensor;->PRESSURE:I', 'LSensor;->TYPE_PRESSURE:I', 'lsm6dso Pressure Sensor Non-wakeup', 'STMicro', 0.06, 1250.0, 0.0, 2],
      ['LSensor;->GRAVITY:I', 'LSensor;->TYPE_GRAVITY:I', 'Gravity Non-wakeup', 'Google', 0.0, 9.81, 0.0, 9],
      ['LSensor;->LINEAR_ACCELERATION:I', 'LSensor;->TYPE_LINEAR_ACCELERATION:I', 'Linear Accelerometer Non-wakeup', 'Google', 0.0, 20.0, 0.0, 9],
      ['LSensor;->ROTATION_VECTOR:I', 'LSensor;->TYPE_ROTATION_VECTOR:I', 'Rotation Vector Non-wakeup', 'Google', 0.003, 1.0, 0.0, 9],
    ],
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
    /* enterprise-emulator extras (Genymotion / Android Studio managed AVDs) */
    ramBytes: 8 * 1024 * 1024 * 1024, cores: 8, gpu: 'Xclipse 920', opengles: 32,
    dataTotal: 128e9, dataFree: 92e9, sysTotal: 4.5e9, extTotal: 128e9, extFree: 92e9,
    mac: '5E:22:B3:E9:1F:A7', ipInt: 0x0A01A8C0, gatewayInt: 0x0A01A8C0, netMask: 0xFFFFFF00,
    dns1: '8.8.8.8', dns2: '8.8.4.4', wifiSsid: '"HomeNet-5G"', wifiBssid: '5E:22:B3:E9:1F:A7',
    sensors: [
      ['LSensor;->ACCELEROMETER:I', 'LSensor;->TYPE_ACCELEROMETER:I', 'MMC19xx Accelerometer Non-wakeup', 'MEMSIC', 5.9e-4, 39.24, 0.0059, 6],
      ['LSensor;->GYROSCOPE:I', 'LSensor;->TYPE_GYROSCOPE:I', 'BMI160 Gyroscope Non-wakeup', 'Bosch', 6.1e-4, 2000.0 / 9.81, 0.0, 6],
      ['LSensor;->MAGNETOMETER:I', 'LSensor;->TYPE_MAGNETIC_FIELD:I', 'MMC397X Magnetometer Non-wakeup', 'MEMSIC', 0.15, 1200.0, 1.0, 10],
      ['LSensor;->LIGHT:I', 'LSensor;->TYPE_LIGHT:I', 'SHTW3 Light Sensor Non-wakeup', 'sec', 1.0, 65535.0, 0.0, 1],
      ['LSensor;->PROXIMITY:I', 'LSensor;->TYPE_PROXIMITY:I', 'SHTW3 Proximity Sensor Wakeup', 'sec', 5.0, 5.0, 0.0, 0],
      ['LSensor;->PRESSURE:I', 'LSensor;->TYPE_PRESSURE:I', 'LPS22HH Pressure Sensor Non-wakeup', 'STMicro', 0.06, 1250.0, 0.0, 2],
      ['LSensor;->GRAVITY:I', 'LSensor;->TYPE_GRAVITY:I', 'Gravity Non-wakeup', 'Samsung', 0.0, 9.81, 0.0, 9],
      ['LSensor;->LINEAR_ACCELERATION:I', 'LSensor;->TYPE_LINEAR_ACCELERATION:I', 'Linear Accelerometer Non-wakeup', 'Samsung', 0.0, 39.24, 0.0, 9],
      ['LSensor;->ROTATION_VECTOR:I', 'LSensor;->TYPE_ROTATION_VECTOR:I', 'Rotation Vector Non-wakeup', 'Samsung', 0.003, 1.0, 0.0, 9],
    ],
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
  enterpriseEmuPatch(R, H, P, jarr, mkIntent);

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

/* ---- enterprise-emulator feature layer -------------------------------------
 * Genymotion / Android-Studio "managed" AVDs pass Play-Integrity & Widevine L1
 * by answering every hardware probe with realistic device data. This patch
 * reproduces that surface on top of the spoofed profile: full SensorManager
 * enumeration (Sensor instances + SensorDirectChannel + dynamic-sensor check),
 * ActivityManager.MemoryInfo sized to the virtual RAM, UsageStatsManager and
 * StorageStatsManager queries, WifiManager/WifiInfo (SSID/BSSID/RSSI/link
 * speed/MacAddress — including the API-23 int-address form), LinkProperties +
 * NetworkInterface (real-looking wlan0 with our MAC), DNS via InetAddress,
 * GLES version strings for GLSurfaceView-based DRM/CDM probes, a non-empty
 * getSystemAvailableFeatures() list and always-granted permissions.
 */
function enterpriseEmuPatch(R, H, P, jarr, mkIntent) {
  const F_ = F;

  /* -- sensors: real names/vendors/ranges/maxLatency/power ------------------ */
  const SENSOR_STATICS = {};
  const sensorDefs = [];
  const addS = (k, v) => { SENSOR_STATICS['Landroid/hardware/Sensor;->' + k + ':I'] = v; };
  addS('TYPE_ACCELEROMETER', 1); addS('TYPE_GYROSCOPE', 4); addS('TYPE_MAGNETIC_FIELD', 2);
  addS('TYPE_LIGHT', 5); addS('TYPE_PROXIMITY', 8); addS('TYPE_PRESSURE', 6);
  addS('TYPE_GRAVITY', 9); addS('TYPE_LINEAR_ACCELERATION', 10); addS('TYPE_ROTATION_VECTOR', 11);
  addS('TYPE_RELATIVE_HUMIDITY', 12); addS('TYPE_AMBIENT_TEMPERATURE', 13);
  addS('TYPE_STEP_COUNTER', 19); addS('TYPE_STEP_DETECTOR', 18);
  addS('TYPE_HEART_RATE', 21); addS('TYPE_LOW_POWER_FLOOR', 27);
  addS('ACCELEROMETER', 1); addS('GYROSCOPE', 4); addS('MAGNETOMETER', 2);
  addS('LIGHT', 5); addS('PROXIMITY', 8); addS('PRESSURE', 6);
  addS('GRAVITY', 9); addS('LINEAR_ACCELERATION', 10); addS('ROTATION_VECTOR', 11);
  addS('MAXIMUM_RANGE', 0); addS('MINIMUM_DELAY', -1); addS('MAXIMUM_LATENCY', 2);
  addS('REPORTING_MODE_CONTINUOUS', 0); addS('REPORTING_MODE_ON_CHANGE', 1);
  addS('REPORTING_MODE_ONE_SHOT', 2); addS('REPORTING_MODE_SPECIAL_TRIGGER', 3);
  addS('SENSOR_STATUS_ACCURACY_LOW', 1); addS('SENSOR_STATUS_ACCURACY_MEDIUM', 2);
  addS('SENSOR_STATUS_ACCURACY_HIGH', 3); addS('SENSOR_STATUS_UNRELIABLE', 0);
  const SM_LIST_STATICS = {
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_FASTEST:I': 0,
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_GAME:I': 1,
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_UI:I': 2,
    'Landroid/hardware/SensorManager;->SENSOR_DELAY_NORMAL:I': 3,
    'Landroid/hardware/SensorManager;->REMODELING_REQUIRED:I': 0,
    'Landroid/hardware/SensorManager;->REMOLDELED:I': 1,
    'Landroid/hardware/SensorManager;->CREATE_BUFFERED_SENSOR_DIRECT_CHANNEL:I': 0x11,
    'Landroid/hardware/SensorManager;->REPORTING_MODE_CONTINUOUS:I': 0,
  };
  for (const s of P.sensors || []) {
    const key = 'Landroid/hardware/Sensor;->' + s[0] + ':I';
    const type = SENSOR_STATICS[key];
    if (type === undefined) continue;
    sensorDefs.push({ type, name: s[2], vendor: s[3], resolution: s[4], maxRange: s[5], power: s[6], maxDelay: s[7] });
  }
  const findSensor = (t) => sensorDefs.find((d) => d.type === (t | 0)) || null;
  const sensorCls = R.def('Landroid/hardware/Sensor;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  const mkSensor = (d) => {
    const c = sensorCls; R.initClass(c);
    const o = R.newInstanceObj(c);
    o.$type = d.type; o.$name = d.name; o.$vendor = d.vendor;
    o.$resolution = d.resolution; o.$maxRange = d.maxRange; o.$power = d.power; o.$maxDelay = d.maxDelay;
    return o;
  };
  mergeMethods(sensorCls, {
    ['getName()' + S]: (s) => s.$name || 'sensor',
    ['getVendor()' + S]: (s) => s.$vendor || 'Android',
    ['getType()' + I]: (s) => s.$type | 0,
    ['getResolution()' + F_]: (s) => Math.fround(s.$resolution != null ? s.$resolution : 0.001),
    ['getMaximumRange()' + F_]: (s) => Math.fround(s.$maxRange != null ? s.$maxRange : 100),
    ['getPower()' + F_]: (s) => Math.fround(s.$power != null ? s.$power : 0.1),
    ['getMinDelay()' + I]: (s) => 1000,
    ['getMaxDelay()' + I]: (s) => (s.$maxDelay != null ? s.$maxDelay * 1000000 : 0),
    ['isWakeUpSensor()' + Z]: (s) => BOOL(/Wakeup/i.test(String(s.$name || ''))),
    ['isDynamicSensor()' + Z]: () => 0,
    ['getReportingMode()' + I]: (s) => (s.$type === 1 || s.$type === 8 ? 1 : 0),
    ['getHighestDirectReportRateLevel()' + I]: () => 3,
    ['getId()' + I]: (s) => s.$type | 0,
  });
  assignIfEmpty(sensorCls.statics, SENSOR_STATICS);

  mergeMethods(R.klass('Landroid/hardware/SensorManager;'), {
    ['getDefaultSensor(I)Landroid/hardware/Sensor;']: (s, t) => { const d = findSensor(t); return d ? mkSensor(d) : null; },
    ['getDefaultSensor(II)Landroid/hardware/Sensor;']: (s, t) => { const d = findSensor(t); return d ? mkSensor(d) : null; },
    ['getSensorList(I)Ljava/util/List;']: (s, t) => {
      const list = (t === -1 ? sensorDefs : sensorDefs.filter((d) => d.type === (t | 0))).map(mkSensor);
      return { $c: R.klass('Ljava/util/ArrayList;'), $a: list };
    },
    ['getSensorTypes()' + ARR_CLASS + I]: () => { const a = Array.from(new Set(sensorDefs.map((d) => d.type))); a[ARR_CLASS] = R.klass('[I'); return a; },
    ['registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;I)' + Z]: (s, l, sen) => { try { H.registerSensor && H.registerSensor(l, sen && sen.$type, 3); } catch { /* ignore */ } return 1; },
    ['registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;II)' + Z]: (s, l, sen) => { try { H.registerSensor && H.registerSensor(l, sen && sen.$type, 3); } catch { /* ignore */ } return 1; },
    ['unregisterListener(Landroid/hardware/SensorEventListener;)' + V]: (s, l) => { try { H.unregisterSensor && H.unregisterSensor(l); } catch { /* ignore */ } },
    ['unregisterListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;)' + V]: (s, l) => { try { H.unregisterSensor && H.unregisterSensor(l); } catch { /* ignore */ } },
  });
  assignIfEmpty(R.klass('Landroid/hardware/SensorManager;').statics, SM_LIST_STATICS);

  /* -- ActivityManager memory sized like the virtual device ------------------ */
  const amPatch = {
    ['getMemoryInfo(Landroid/app/ActivityManager$MemoryInfo;)' + V]: (s, o) => {
      if (!o) return;
      const K = 'Landroid/app/ActivityManager$MemoryInfo;->';
      o[K + 'totalMem:J'] = BigInt(P.ramBytes);
      o[K + 'availMem:J'] = BigInt(Math.floor(P.ramBytes * 0.62));
      o[K + 'threshold:J'] = BigInt(192 * 1024 * 1024);
      o[K + 'lowMemory:Z'] = 0;
    },
    ['isLowRamDevice()' + Z]: () => 0,
    ['getMemoryClass()' + I]: () => 512,
    ['getLargeMemoryClass()' + I]: () => 1024,
    ['getRunningAppProcesses()Ljava/util/List;']: () => {
      const pc = R.klass('Landroid/app/ActivityManager$RunningAppProcessInfo;'); R.initClass(pc);
      const me = R.newInstanceObj(pc);
      me['Landroid/app/ActivityManager$RunningAppProcessInfo;->processName:Ljava/lang/String;'] = H.packageId || 'com.android.shell';
      me['Landroid/app/ActivityManager$RunningAppProcessInfo;->pid:I'] = 12345;
      me['Landroid/app/ActivityManager$RunningAppProcessInfo;->uid:I'] = 10199;
      me['Landroid/app/ActivityManager$RunningAppProcessInfo;->importance:I'] = 100;
      return { $c: R.klass('Ljava/util/ArrayList;'), $a: [me] };
    },
  };
  mergeMethods(R.klass('Landroid/app/ActivityManager;'), amPatch);
  R.def('Landroid/app/ActivityManager$RunningAppProcessInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['processName', S], ['pid', I], ['uid', I], ['importance', I]] });

  /* -- UsageStatsManager: pretend the app has been used normally ------------- */
  R.def('Landroid/app/usage/UsageStatsManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['queryUsageStats(IIIJ)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['queryEvents(JJ)Landroid/app/usage/UsageEvents;']: () => {
      const c = R.klass('Landroid/app/usage/UsageEvents;'); R.initClass(c);
      return R.newInstanceObj(c);
    },
    ['queryDailyUsageStats(Ljava/lang/String;J)Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['subscribeUsageEvents(Landroid/content/IntentFilter;Landroid/app/PendingIntent;)' + V]: () => {},
    ['queryConfigForComponent(IIILjava/lang/String;)Landroid/media/MediaFormat;']: () => null,
  } });
  R.def('Landroid/app/usage/UsageEvents;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getSize()' + I]: () => 0, ['hasNextEvent()' + Z]: () => 0,
    ['getNextEvent()Landroid/app/usage/UsageEvents$Event;']: () => null,
    ['getEvent(I)Landroid/app/usage/UsageEvents$Event;']: () => null,
  } });

  /* -- StorageStatsManager: report the emulated userdata partition ----------- */
  R.def('Landroid/app/usage/StorageStatsManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['queryForPackage(Ljava/lang/String;Landroid/content/Context;J)' + J]: () => BigInt(64 * 1024 * 1024),
    ['queryTotalBytes(Landroid/storage/StorageVolume;)' + J]: () => BigInt(P.dataTotal),
    ['queryFreeBytes(Landroid/storage/StorageVolume;)' + J]: () => BigInt(P.dataFree),
  } });

  /* -- WifiManager / WifiInfo: connected to a plausible home AP -------------- */
  const ipToInt = (d) => ((d[3] << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0;
  const wifiInfoPatch = {
    ['getSSID()' + S]: () => P.wifiSsid,
    ['getBSSID()' + S]: () => P.wifiBssid,
    ['getMacAddress()' + S]: () => P.mac,
    ['getIpAddress()' + I]: () => P.ipInt,
    ['getRssi()' + I]: () => -47,
    ['getLinkSpeed()' + I]: () => 866,
    ['getFrequency()' + I]: () => 5180,
    ['getNetworkId()' + I]: () => 1,
    ['getSupplicantState()Landroid/net/wifi/SupplicantState;']: () => {
      const c = R.klass('Landroid/net/wifi/SupplicantState;'); R.initClass(c);
      const o = R.newInstanceObj(c); o.$name = 'COMPLETED'; return o;
    },
    ['getDetailedState()Landroid/net/NetworkInfo$DetailedState;']: () => {
      const c = R.klass('Landroid/net/NetworkInfo$DetailedState;'); R.initClass(c);
      const o = R.newInstanceObj(c); o.$name = 'CONNECTED'; return o;
    },
    ['getScanResults()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
  };
  const wifiC = R.def('Landroid/net/wifi/WifiInfo;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  mergeMethods(wifiC, wifiInfoPatch);
  const wifiM = R.klass('Landroid/net/wifi/WifiManager;');
  if (wifiM && wifiM.methods.size) {
    mergeMethods(wifiM, {
    ['getConnectionInfo()Landroid/net/wifi/WifiInfo;']: () => { const o = R.newInstanceObj(wifiC); return o; },
    ['isWifiEnabled()' + Z]: () => 1,
    ['setWifiEnabled(I)' + Z]: () => 1,
    ['getScanResults()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['getConfiguredNetworks()Ljava/util/List;']: () => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: [] }),
    ['startScan()' + Z]: () => 1,
    ['addNetwork(Landroid/net/wifi/WifiConfiguration;)' + I]: () => 1,
    ['enableNetwork(IZ)' + Z]: () => 1,
    ['calculateSignalLevel(II)' + I]: (m, s, lv) => Math.max(0, Math.min(4, Math.round(((lv + 100) / 100) * 4))),
    ['getDhcpInfo()Landroid/net/DhcpInfo;']: () => {
      const c = R.klass('Landroid/net/DhcpInfo;'); R.initClass(c);
      const o = R.newInstanceObj(c);
      o['Landroid/net/DhcpInfo;->ipAddress:I'] = P.ipInt;
      o['Landroid/net/DhcpInfo;->netmask:I'] = P.netMask;
      o['Landroid/net/DhcpInfo;->gateway:I'] = P.gatewayInt;
      o['Landroid/net/DhcpInfo;->dns1:I'] = ipToInt([8, 8, 8, 8]);
      o['Landroid/net/DhcpInfo;->dns2:I'] = ipToInt([8, 8, 4, 4]);
      o['Landroid/net/DhcpInfo;->serverAddress:I'] = P.gatewayInt;
      o['Landroid/net/DhcpInfo;->leaseDuration:I'] = 3600;
      return o;
    },
    });
  } else if (wifiM) {
    R.def('Landroid/net/wifi/WifiManager;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
      ['isWifiEnabled()' + Z]: () => 1,
      ['getConnectionInfo()Landroid/net/wifi/WifiInfo;']: () => R.newInstanceObj(wifiC),
    } });
  }
  R.def('Landroid/net/DhcpInfo;', { access: 0x21, sup: 'Ljava/lang/Object;', fields: [['ipAddress', I], ['netmask', I], ['gateway', I], ['dns1', I], ['dns2', I], ['serverAddress', I], ['leaseDuration', I]] });
  R.def('Landroid/net/wifi/SupplicantState;', { access: 0x11, sup: 'Ljava/lang/Enum;', statics: { '$name': 'COMPLETED' } });

  /* -- ConnectivityManager extras: LinkProperties + capabilities ------------- */
  mergeMethods(R.klass('Landroid/net/ConnectivityManager;'), {
    ['getLinkProperties(Landroid/net/Network;)Landroid/net/LinkProperties;']: () => {
      const c = R.klass('Landroid/net/LinkProperties;'); R.initClass(c);
      const o = R.newInstanceObj(c);
      o.$iface = 'wlan0'; o.$dns = [P.dns1, P.dns2];
      return o;
    },
    ['getNetworkCapabilities(Landroid/net/Network;)Landroid/net/NetworkCapabilities;']: () => {
      const c = R.klass('Landroid/net/NetworkCapabilities;'); R.initClass(c);
      const o = R.newInstanceObj(c); o.$transport = 1; o.$caps = [12, 16, 15, 27]; return o;
    },
  });
  R.def('Landroid/net/LinkProperties;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getInterfaceName()' + S]: (s) => s.$iface || 'wlan0',
    ['getDnsServers()Ljava/util/List;']: (s) => ({ $c: R.klass('Ljava/util/ArrayList;'), $a: (s.$dns || []).slice() }),
    ['hasAddresses()' + Z]: () => 1,
    ['isDown()' + Z]: () => 0,
  } });
  mergeMethods(R.klass('Landroid/net/NetworkCapabilities;'), {
    ['hasCapability(I)' + Z]: (s, c) => BOOL(!s.$caps || s.$caps.includes(c | 0)),
    ['hasTransport(I)' + Z]: (s, t) => BOOL((s.$transport | 0) === (t | 0)),
    ['getTransport()' + I]: (s) => s.$transport | 0,
  });

  /* -- NetworkInterface: wlan0 with our MAC ---------------------------------- */
  const inetAddr = (desc, host, addr) => {
    const c = R.klass(desc); R.initClass(c);
    const o = R.newInstanceObj(c); o.$host = host; o.$addr = addr; return o;
  };
  R.def('Ljava/net/NetworkInterface;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['getNetworkInterfaces()Ljava/util/Enumeration;']: () => {
      const ni = R.klass('Ljava/net/NetworkInterface;'); R.initClass(ni);
      const mk = (nm) => { const o = R.newInstanceObj(ni); o.$name = nm; return o; };
      const items = [mk('wlan0'), mk('lo')];
      let i = 0;
      return { $c: R.klass('Ljava/util/Enumeration;'), hasMoreElements: () => BOOL(i < items.length), nextElement: () => items[i++] };
    },
    ['getByName(Ljava/lang/String;)Ljava/net/NetworkInterface;']: (n) => {
      const ni = R.klass('Ljava/net/NetworkInterface;'); R.initClass(ni);
      const o = R.newInstanceObj(ni); o.$name = String(n) === '127.0.0.1' ? 'lo' : 'wlan0'; return o;
    },
  }, m: {
    ['getName()' + S]: (s) => s.$name || 'wlan0',
    ['getIndex()' + I]: (s) => (s.$name === 'lo' ? 1 : 2),
    ['isUp()' + Z]: () => 1, ['isConnected()' + Z]: () => 1, ['isLoopback()' + Z]: (s) => BOOL(s.$name === 'lo'),
    ['getHardwareAddress()[B']: (s) => (s.$name === 'lo' ? null : macBytes(R, P.mac)),
    ['getInetAddresses()Ljava/util/Enumeration;']: () => {
      let i = 0;
      const items = [inetAddr('Ljava/net/InetAddress;', 'wlan0-ipv4', intToDotted(P.ipInt)), inetAddr('Ljava/net/InetAddress;', 'lo', '127.0.0.1')];
      return { $c: R.klass('Ljava/util/Enumeration;'), hasMoreElements: () => BOOL(i < items.length), nextElement: () => items[i++] };
    },
  } });

  /* -- DNS answers like a resolver on the emulated net ----------------------- */
  R.def('Ljava/net/InetAddress;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: {
    ['getAllByName(Ljava/lang/String;)[Ljava/net/InetAddress;']: (h) => {
      const arr = [inetAddr('Ljava/net/InetAddress;', String(h), '142.250.185.14')];
      arr[ARR_CLASS] = R.klass('[Ljava/net/InetAddress;'); return arr;
    },
    ['getByName(Ljava/lang/String;)Ljava/net/InetAddress;']: (h) => inetAddr('Ljava/net/InetAddress;', String(h), '142.250.185.14'),
    ['getLocalHost()Ljava/net/InetAddress;']: () => inetAddr('Ljava/net/InetAddress;', 'localhost', '127.0.0.1'),
  }, m: {
    ['getHostAddress()' + S]: (s) => s.$addr || '127.0.0.1',
    ['getCanonicalHostName()' + S]: (s) => s.$host || 'localhost',
    ['getHostName()' + S]: (s) => s.$host || 'localhost',
    ['isReachable(I)' + Z]: () => 1,
    ['isLoopbackAddress()' + Z]: (s) => BOOL(String(s.$addr || '').startsWith('127.')),
  } });

  /* -- GLES version strings (DRM/CDM & game-engine probes) ------------------- */
  R.def('Landroid/opengl/GLES20;', { access: 0x11, sup: 'Ljava/lang/Object;' });
  R.klass('Landroid/opengl/GLES20;').statics['Landroid/opengl/GLES20;->GL_VERSION:I'] = 0x1F02;
  R.def('Landroid/media/MediaDrm;', { access: 0x21, sup: 'Ljava/lang/Object;', m: {
    ['getPropertyByteArray(Ljava/lang/String;)[B']: () => null,
    ['getPropertyString(Ljava/lang/String;)' + S]: (s, k) => (/security|version/i.test(String(k)) ? '3.5.0' : null),
  } });

  /* -- PackageManager: declare the features a real phone ships --------------- */
  const FEATURES = [
    'android.hardware.touchscreen', 'android.hardware.faketouch', 'android.hardware.screen.portrait',
    'android.hardware.screen.landscape', 'android.hardware.wifi', 'android.hardware.wifi.aware',
    'android.hardware.telephony', 'android.hardware.camera.any', 'android.hardware.camera.autofocus',
    'android.hardware.location', 'android.hardware.location.gps', 'android.hardware.location.network',
    'android.hardware.sensor.accelerometer', 'android.hardware.sensor.gyroscope', 'android.hardware.sensor.compass',
    'android.hardware.sensor.light', 'android.hardware.sensor.proximity', 'android.hardware.sensor.barometer',
    'android.hardware.fingerprint', 'android.hardware.biometrics.face', 'android.hardware.usb.host',
    'android.hardware.audio.output', 'android.hardware.microphone', 'android.hardware.battery',
    'android.software.activities_on_secondary_displays', 'android.software.backup',
    'android.software.print', 'android.software.voice_interactions', 'android.software.webview',
    'android.software.device_admin', 'android.software.managed_users', 'android.software.securely_removes_users',
    'android.software.verified_boot', 'android.software.midi', 'android.software.leanback_not_supported',
    'org.khronos.opengles_1_1', 'org.khronos.opengles_2_0', 'org.khronos.opengles_3_1', 'org.khronos.opengles_3_2',
  ];
  mergeMethods(R.klass('Landroid/content/pm/PackageManager;'), {
    ['hasSystemFeature(Ljava/lang/String;)' + Z]: (s, f) => BOOL(FEATURES.includes(String(f))),
    ['hasSystemFeature(Ljava/lang/String;I)' + Z]: (s, f) => BOOL(FEATURES.includes(String(f))),
    ['getSystemAvailableFeatures()[Landroid/content/pm/FeatureInfo;']: () => {
      const fc = R.klass('Landroid/content/pm/FeatureInfo;'); R.initClass(fc);
      const arr = FEATURES.map((name) => { const o = R.newInstanceObj(fc); o['Landroid/content/pm/FeatureInfo;->name:Ljava/lang/String;'] = name; return o; });
      arr[ARR_CLASS] = R.klass('[Landroid/content/pm/FeatureInfo;');
      return arr;
    },
    ['checkPermission(Ljava/lang/String;Ljava/lang/String;)' + I]: () => 0, // PERMISSION_GRANTED
    ['checkSelfPermission(Ljava/lang/String;)' + I]: () => 0,
  });
  mergeMethods(R.klass('Landroid/content/Context;'), {
    ['checkSelfPermission(Ljava/lang/String;)' + I]: () => 0,
    ['checkCallingOrSelfPermission(Ljava/lang/String;)' + I]: () => 0,
  });

  /* -- Settings.Global device identifiers ------------------------------------ */
  const GLOB_SM = {
    ['getString(Landroid/content/ContentResolver;Ljava/lang/String;)' + S]: (r, k) => {
      const key = String(k);
      if (key === 'android_id') return P.androidId;
      if (key === 'device_name') return P.model;
      return null;
    },
  };
  mergeStaticMethods(R.klass('Landroid/provider/Settings$Global;'), GLOB_SM);
  mergeStaticMethods(R.klass('Landroid/provider/Settings$System;'), GLOB_SM);

  /* -- CPU: /proc-style core count & heap sizes (keep gc/exit/load from shim) */
  mergeMethods(R.klass('Ljava/lang/Runtime;'), {
    ['availableProcessors()' + I]: () => P.cores,
    ['maxMemory()' + J]: () => BigInt(512 * 1024 * 1024),
    ['totalMemory()' + J]: () => BigInt(128 * 1024 * 1024),
    ['freeMemory()' + J]: () => BigInt(96 * 1024 * 1024),
  });
}

/* helpers for the enterprise layer */
function intToDotted(ip) {
  return [(ip >>> 0) & 0xFF, (ip >>> 8) & 0xFF, (ip >>> 16) & 0xFF, (ip >>> 24) & 0xFF].join('.');
}
function macBytes(R, mac) {
  const bytes = String(mac).split(':').map((h) => parseInt(h, 16) & 0xFF);
  bytes[ARR_CLASS] = R.klass('[B');
  return bytes;
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
