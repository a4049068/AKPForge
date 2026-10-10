# Dex2Web — transpile Android APKs into browser-native JavaScript

Drop an `.apk` on the page. Dex2Web unzips it, decodes `resources.arsc` and the binary
`AndroidManifest.xml`, parses every DEX, and **transpiles Dalvik bytecode into real
JavaScript** that executes against a browser-native Android runtime — views, layouts,
resource resolution, activity lifecycle, logcat and all. Everything runs client-side:
no server, no upload, no emulator, no dependencies.

```
your.apk ─▶ ZIP ─▶ AXML ─▶ ARSC ─▶ DEX ─▶ Dalvik CFG ─▶ JavaScript closures ─▶ Android shim ─▶ live DOM
```

## Run it

Any static file server works:

```bash
cd apkforge && python3 -m http.server 8000     # then open http://127.0.0.1:8000/
```

Three tiny real F-Droid APKs are base64-inlined in `js/samples.js` so the one-click demo
works with zero network access. Drop any other APK onto the page to transpile it instead.

## What's inside

| File | Role |
|---|---|
| `js/binary.js` | binary reader, MUTF-8, CRC32, and a hand-written raw-DEFLATE inflater (RFC 1951) |
| `js/zip.js` | ZIP/APK reader: EOCD + ZIP64, central directory, local headers, `DecompressionStream('deflate-raw')` fast path |
| `js/axml.js` | binary Android XML parser (string pools, resource maps, typed values) + AXML→XML serialiser |
| `js/arsc.js` | `resources.arsc` table parser: packages, type/key string pools, configs, entries, bags, reference resolution |
| `js/dexops.js` | the full Dalvik opcode table (224 opcodes, 20 instruction formats) + decoder + switch/fill payloads |
| `js/dex.js` | DEX container: header, id tables, `class_data_item`, `code_item`, try/catch handler lists, encoded values, `debug_info` state machine (line numbers + local names) |
| `js/transpile.js` | **the transpiler**: basic-block construction, trampoline codegen, lazy per-method JIT, AOT bundle export |
| `js/runtime.js` | the VM: class registry, Java method resolution, object model, numeric semantics, exception dispatch |
| `js/framework.js` / `js/framework2.js` | ~1,500 shimmed members of `java.*`, `android.*`, `androidx.*`, `org.json.*` |
| `js/ui.js` | `android.view` / `android.widget` implemented on the DOM; layout inflation, gestures, animation, surfaces |
| `js/host.js` | the "Android": resources, drawables (PNG/WebP **and** vector→SVG), layout inflation, activities, prefs, media, dialogs |
| `js/app.js` | the website: pipeline, workbench panels, logcat, Java console |

## How the transpilation works

**Registers → locals.** A method's `registers_size` becomes `var v0, v1, … vN`; incoming
parameters are copied from `arguments` into the tail registers exactly as Dalvik lays them out.

**Control flow → basic-block trampoline.** Leader sets are computed from branches, switch
targets, fallthroughs and try boundaries; each block becomes a `case` in a
`for(;;) switch(bb)` loop, so arbitrary `goto`s, loops and switches are legal by construction.
A step counter turns runaway bytecode into a catchable `VMError` instead of a hung tab.

**Exceptions → real `throw`.** `throw`/`move-exception` map onto JS exceptions; the
dispatch loop's `catch` consults the method's dex try table (`startAddr..endAddr` → handler
block) and tests handler types with genuine `instanceof` semantics over the class hierarchy.
Stacks are captured as Java frames, so crashes print real traces like
`at com.santiagorodriguez.countaway.ui.MainActivity->onCreate(Landroid/os/Bundle;)V`.

**Laziness as a feature.** Method bodies compile on first invocation, so a 3,200-class APK
boots in milliseconds; the *Transpile report* panel shows the opcode histogram growing as the
app runs, and **AOT** eagerly emits one self-contained, downloadable `bundle.js`.

**Dalvik's null convention.** In a reference register the constant `0` *is* `null`; every
reference-consuming operation (`check-cast`, `instance-of`, field access, virtual dispatch)
treats a zero register accordingly — matching ART's verifier.

## Verified against real APKs

`tools/t_*.mjs` run the whole pipeline headlessly (with a DOM stub) over 12 F-Droid
packages; `tools/uitest*.py` drive the actual site in headless Chromium and screenshot it.

| APK | classes | methods | result |
|---|---:|---:|---|
| tk.al54.dev.badpixels | 14 | 22 | ✅ boots, layout + strings + gesture interaction work |
| org.vi_server.red_screen | 6 | 8 | ✅ boots, theme + window flags honoured |
| com.github.mrrar.gps_locker | 21 | 50 | ✅ boots, compound widgets rendered |
| ru.zxalexis.ugaday | 1,228 | 8,985 | ✅ boots, Kotlin UI rendered |
| biz.binarysolutions.weatherusa | 898 | 4,743 | ✅ boots, 138-view layout inflated |
| com.santiagorodriguez.countaway | 201 | 810 | ✅ boots, vector-drawable empty state rendered |
| ademar.textlauncher | 5 | 31 | ✅ boots (launcher finishes by design) |
| com.martinmimigames.tinymusicplayer | 7 | 33 | ✅ boots (awaits a file picker intent) |
| io.github.ebraminio.bouncy | 20 | 48 | ✅ boots, surface rendered |
| net.basov.lws.qr.fdroid | 4 | 15 | ✅ boots, WebView shim active |
| fr.smarquis.sleeptimer | 24 | 85 | ⚠️ no launcher activity (tile-only package) — reported gracefully |
| dk.cocode.chess | 2,592 | 11,576 | ⚠️ application + activity + lifecycle + fragments run; UI is Jetpack Compose, engine is native `.so` |
| com.octave.app (Octave, user-supplied) | 9,670 | 43,543 | ⚠️ application/activity/coroutines run; UI is Compose, media is native — see ROADMAP |

## Honest limitations

* **Native code** — `lib/*.so` would need an x86/ARM translator. JNI natives return
  type-correct defaults and are logged in the transpile report.
* **Jetpack Compose** UIs boot their activity but paint nothing: Compose is a second UI toolkit (composition + slot table + its own canvas) — XML-view apps render, Compose apps report a clean boundary warning via `screencheck`.
* **Longs** are JS numbers (exact below 2⁵³); bitwise/mul/div/rem on longs go through BigInt.
* No real OpenGL ES, camera, sensors, telephony, multi-process or Binder IPC.
* Signature verification, DRM and Play Integrity are not attempted.
* Framework themes ship as a contrast-aware approximation (the platform `resources.arsc`
  is never inside an APK), plus a table of the common `android:TextAppearance*` sizes.

## Tests

```bash
node tools/t_inflate.mjs                 # DEFLATE vs DecompressionStream on 208 real entries
node tools/t_dex.mjs test/*.apk          # parser sweep
node tools/t_run.mjs test/xyz.apk        # headless boot + view-tree dump + logcat
node tools/screencheck.mjs               # structural screen oracle (no browser needed)
python3 tools/screencheck.py             # pixel oracle: real Chromium screenshots of #screen
python3 tools/uitest.py                  # browser: every panel, screenshots, console errors
```

### screencheck — a visual oracle for the transpiled screen

Log and DOM assertions can pass while the phone shows a flat white rectangle,
so `screencheck` looks at the screen the way a user would:

* **pixel mode** (`screencheck.py`) screenshots `#screen` in headless Chromium and
  measures quantised palette size, dominant-colour share, edge density, luminance
  mean/σ, plus in-page WCAG contrast of every visible text node against its
  effective background (this is what catches dark-on-dark text).
* **structural mode** (`screencheck.mjs`) boots each APK against a DOM stub and
  censuses the screen tree — views, texts, images, inputs, canvases, painted
  backgrounds, contrast — with no browser installed.

Verdicts: `FAIL blank-default` (nothing attached), `FAIL flat-no-content`
(a uniform surface and the app painted nothing of its own), `WARN` for
explained cases (solid-colour utilities, canvas/WebView content, Compose UIs,
apps that immediately delegate to an external intent), `SKIP` for packages with
no launcher activity. Negative-controlled: re-breaking `setContentView` flips
apps to FAIL, and forcing dark text on a dark app flips them to WARN with the
offending nodes and contrast ratios listed.
