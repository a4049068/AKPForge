# Dex2Web — unimplemented features & roadmap

Living inventory of what the transpiler/runtime does **not** do yet, ordered by
(user-visible value ÷ effort). Items are checked off as they land; the status
column is verified by `node tools/screencheck.mjs` / `tools/bench.mjs` after
each batch.

## A. Runtime & VM correctness
- [x] Dalvik `aput*` operand order, basic-block terminator bookkeeping, `const-class` mirror, hierarchy-cache invalidation (fixed after chess log review)
- [ ] **Suspension-aware coroutines** (partial: Handler/executor-backed dispatch works; native blockers don't): `runBlocking`/`Dispatchers.IO` bodies execute on the main loop; a `suspend` function that parks on a native blocker (not a Handler post) returns `COROUTINE_SUSPENDED` into non-suspend callers
- [ ] `long` precision above 2^53 (BigInt-backed registers instead of doubles)
- [ ] Multi-touch `MotionEvent` (pointer count > 1) (pointer count > 1, `getPointerId`, `ACTION_POINTER_*`)
- [x] `SparseArray` family: `SparseBoolean/SparseInt/SparseLong/LongSparseArray` (`SparseBooleanArray`, `SparseIntArray`, `SparseLongArray`)
- [ ] `System.arraycopy` overlap is safe; `java.lang.Cloneable` deep-clone semantics for arrays of arrays

## B. Application framework
- [x] Manifest-declared `Application` subclass instantiation + `onCreate`
- [x] Window decor view with `android.R.id.content` container (fixes `<merge>` roots)
- [x] Fragments: transactions, lifecycle, tag/id lookup, `FragmentManager`
- [x] `java.lang.reflect` constructors/methods/fields that really invoke
- [x] **Activity back stack & results**: pause/hide previous, `onActivityResult`, decor per activity: `startActivityForResult` → `onActivityResult`, proper pause/stop/restart on navigation, task affinity
- [x] **Options menu rendered in the title bar** (overflow button → popup → `onOptionsItemSelected`) (overflow button, `onOptionsItemSelected`, `MenuItem` state)
- [x] **Style & theme attribute resolution**: `style=` bags with parent chains, `?attr/` refs, `textAppearance` sizes (`style="…"`, theme default styles per widget, `?attr/…` references)
- [x] **Resource qualifiers**: locale + dark-preference aware config selection: pick configs by browser locale / dark preference / viewport instead of always default
- [x] `Service` lifecycle: `onCreate`/`onStartCommand`/`onDestroy`, `bindService` callback (bind/start, `onStartCommand`) on the task loop
- [x] `BroadcastReceiver` registration + in-app `sendBroadcast` delivery (runtime + manifest receivers)
- [x] `ContentResolver` + `Cursor` subset (in-app providers still stubbed): `ContentResolver.query/insert/update/delete` against in-app providers
- [ ] `AppWidget` `RemoteViews` rendering (actions parsed, not painted) into DOM
- [ ] `LoaderManager` / `AsyncTaskLoader`
- [ ] `WorkManager` scheduling onto timers

## C. View system & graphics
- [x] Custom `View.onDraw(Canvas)` draw-pass onto a 2D canvas layer
- [x] Vector drawables & adaptive icons → SVG
- [x] **Bitmap decoding**: `BitmapFactory.decode*` → real `<img>` pixels, async sizes: `BitmapFactory.decode*` → real pixels (createImageBitmap), `drawBitmap(Rect,Rect,…)`, `getPixel`
- [x] **`Path` → Path2D** (move/line/quad/cubic/arc/rect/oval/close) so `Canvas.drawPath` paints (charts, icons drawn in code)
- [x] **Paint shaders**: linear/radial/sweep gradients + bitmap patterns: `LinearGradient`/`RadialGradient`/`SweepGradient` → canvas gradients
- [ ] **Nine-patch (`.9.png`) stretching** with optical bounds
- [x] **StateListDrawable/selector** with pressed/enabled/checked/focused states reacting to pressed/enabled/checked + ripple feedback
- [x] **Animation**: `ValueAnimator`/`ObjectAnimator`/`AnimatorSet` on rAF, `res/anim` tweens → CSS: `ObjectAnimator`/`ValueAnimator`/`AnimatorSet`, `res/anim` tween sets (`loadAnimation` + `startAnimation`)
- [ ] `RecyclerView` item decorators, `ItemTouchHelper`, nested scrolling
- [ ] `ListView` choice modes / multi-select, `ExpandableListView` groups
- [ ] `EditText` input filters, IME actions beyond Enter, composing text
- [x] `Html.fromHtml` rendered (sanitised) into text views; plurals via `getQuantityString`, `ClickableSpan`, `Spannable` styles
- [ ] `ScrollView` smooth-scroll callbacks, `NestedScrolling` chain
- [ ] `ViewOutlineProvider`/elevation shadows beyond box-shadow approximation
- [x] Hardware keyboard → `KeyEvent` dispatch to focused view then activity (`onKeyDown/onKeyUp/onKeyLongPress`, key chords)

## D. Device & platform bridges
- [x] `WebView` incl. `file:///android_asset/` served from the zip
- [x] Virtual `/data/data/…` filesystem (openFileInput/Output, File, AtomicFile)
- [x] SharedPreferences persisted to localStorage
- [x] **Sensors → DeviceMotion/DeviceOrientation** with real `SensorEvent` delivery (`SensorManager.registerListener`)
- [x] **Geolocation → `LocationManager`** watch/single-update/last-known (with permission prompt UX)
- [x] **Vibrator → `navigator.vibrate`**, `SoundPool` → pooled `Audio`, clipboard read → pooled `Audio` elements
- [ ] Clipboard **read** path (`ClipData` from navigator.clipboard)
- [ ] `Camera`/`CameraX` → `getUserMedia` preview into SurfaceView/TextureView
- [ ] `MediaPlayer` video surface, `ExoPlayer`-style buffering events
- [ ] Notifications via the Notification API where the sandbox allows
- [ ] `DownloadManager` → browser downloads
- [ ] Battery/telephony/connectivity real values (`BatteryManager`, `NetworkInfo` from `navigator.onLine`)

## E. Data & persistence
- [x] **SQLite subset**: CREATE/DROP/INSERT/UPDATE/DELETE/SELECT(where·order·limit), `SQLiteOpenHelper`, statements, cursors, JSON-persisted in the VFS: `SQLiteOpenHelper` + `SQLiteDatabase` over an in-browser engine (WASM sqlite or a SQL-subset store), cursors that stream
- [ ] `DataStore` (protobuf/preferences) on top of the VFS
- [ ] `Room`-generated code works only insofar as SQLite does (depends on previous)

## F. Out of scope by architecture (documented, not planned)
- Native `.so` code (needs an x86/ARM→WASM translator)
- Jetpack Compose rendering (second UI toolkit: composition, slot table, compose canvas)
- Multi-process / Binder IPC / AIDL
- APK signature verification, Play Integrity, DRM
- Real OpenGL ES (GLSurfaceView gets a 2D-canvas stand-in + lifecycle callbacks)

## G. Performance (continuous)
- [x] Lazy per-method JIT; AOT export on demand
- [x] Memoised method resolution (per-call-site inline caches for all four invoke kinds) for static/direct/super/interface dispatch
- [x] Memoised resource lookups (`ResourceTable.get/resolveValue`, host res caches) (`ResourceTable.get/resolveValue`, host `resString/resColor/resDimen`)
- [ ] Rest-args allocation removal (deferred: V8 escape-analysis makes it marginal) on hot invoke paths (arity-specialised invokers)
- [ ] Inflation dispatch tables (deferred)
- [ ] Renderer: batch style writes, avoid layout thrash on addView bursts
- [ ] Parallel DEX parse across `classes*.dex` (deferred) across `classes*.dex`
