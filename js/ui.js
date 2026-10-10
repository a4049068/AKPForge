/* ui.js — android.view / android.widget implemented on top of the DOM.
 *
 * Every Java View object owns exactly one DOM element. Property setters mutate
 * that element in place, so a transpiled Activity that calls setText() or
 * addView() produces an immediate, incremental repaint — no diffing pass. */

import { ARR_CLASS } from './runtime.js';
import { TYPE, argbToCss } from './axml.js';

/* ---- Gravity constants ---- */
export const GRAVITY = {
  NO_GRAVITY: 0, AXIS_X: 0x07, AXIS_Y: 0x70,
  LEFT: 0x03, RIGHT: 0x05, CENTER_HORIZONTAL: 0x01, FILL_HORIZONTAL: 0x07,
  TOP: 0x30, BOTTOM: 0x50, CENTER_VERTICAL: 0x10, FILL_VERTICAL: 0x70,
  CENTER: 0x11, FILL: 0x77, START: 0x00800003, END: 0x00800005,
};
export const MATCH_PARENT = -1, WRAP_CONTENT = -2;
export const VISIBLE = 0, INVISIBLE = 4, GONE = 8;

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
const APP_NS = 'http://schemas.android.com/apk/res-auto';

/* dimension unit conversion → CSS px at density 1 */
export function dimToPx(value, unit, density = 1) {
  switch (unit) {
    case 0: return value;                              // px
    case 1: return value * density;                    // dp
    case 2: return value * density;                    // sp
    case 3: return value * (160 / 72) * density;       // pt
    case 4: return value * 160 * density;              // in
    case 5: return value * (160 / 25.4) * density;     // mm
    default: return value;
  }
}
/** Decode a packed Res_value dimension (radix-encoded 24-bit mantissa). */
export function unpackDimension(data) {
  const unit = data & 0x0f;
  const radix = (data >> 4) & 0x03;
  let mant = (data >> 8) & 0xffffff;
  if (mant & 0x800000) mant -= 0x1000000;
  const mult = [1, 1 / 128, 1 / (128 * 128), 1 / (128 * 128 * 128)][radix];
  return { value: mant * mult, unit };
}

function gravityMain(g, vertical) {
  const bits = vertical ? (g & 0x70) : (g & 0x07);
  if (vertical) {
    if (bits === 0x10) return 'center';
    if (bits === 0x30) return 'flex-start';
    if (bits === 0x50) return 'flex-end';
    if (bits === 0x70) return 'stretch';
  } else {
    if (bits === 0x01) return 'center';
    if (bits === 0x03) return 'flex-start';
    if (bits === 0x05) return 'flex-end';
    if (bits === 0x07) return 'stretch';
  }
  return null;
}
function gravityText(g) {
  const bits = g & 0x07;
  if (bits === 0x01) return 'center';
  if (bits === 0x05) return 'right';
  if (bits === 0x03) return 'left';
  return null;
}
function gravityVertText(g) {
  const bits = g & 0x70;
  if (bits === 0x10) return 'center';
  if (bits === 0x50) return 'flex-end';
  if (bits === 0x30) return 'flex-start';
  return null;
}

/* ================================================================== */
export function installWidgets(R, H) {
  const D = H.renderer;   // the DOM renderer

  /* ---------- helpers shared by the shim ---------- */
  const el = (v) => (v && v.$el ? v.$el : null);
  const txt = (x) => (x === null || x === undefined ? '' : (typeof x === 'string' ? x : R.str(x)));
  const cssColor = (c) => (typeof c === 'number' ? argbToCss(c, c >>> 24 === 0xff ? TYPE.INT_COLOR_RGB8 : TYPE.INT_COLOR_ARGB8) : String(c));

  function ensure(v, kind) { return D.ensureView(v, kind); }

  /* ---------- android.view.View ---------- */
  const viewMethods = {
    '<init>(Landroid/content/Context;)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'View'); },
    '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'View'); },
    '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'View'); },
    '<init>()V': (s) => { D.ensureView(s, 'View'); },
    'getId()I': (s) => (s.$id === undefined ? -1 : s.$id),
    'setId(I)V': (s, id) => { s.$id = id | 0; const e = el(s); if (e) e.dataset.id = id | 0; },
    'getVisibility()I': (s) => (s.$vis === undefined ? VISIBLE : s.$vis),
    'setVisibility(I)V': (s, v) => { s.$vis = v | 0; D.applyVisibility(s); },
    'isEnabled()Z': (s) => (s.$enabled === undefined ? 1 : s.$enabled),
    'setEnabled(Z)V': (s, v) => { s.$enabled = v ? 1 : 0; D.applyEnabled(s); },
    'setClickable(Z)V': (s, v) => { s.$clickable = v ? 1 : 0; },
    'isClickable()Z': (s) => (s.$clickable ? 1 : 0),
    'setFocusable(Z)V': () => {},
    'setFocusableInTouchMode(Z)V': () => {},
    'setSelected(Z)V': (s, v) => { s.$selected = v ? 1 : 0; D.applySelected(s); },
    'isSelected()Z': (s) => (s.$selected ? 1 : 0),
    'setActivated(Z)V': () => {},
    'setOnClickListener(Landroid/view/View$OnClickListener;)V': (s, l) => { s.$onClick = l; D.applyClickable(s); },
    'setOnLongClickListener(Landroid/view/View$OnLongClickListener;)V': (s, l) => { s.$onLongClick = l; },
    'setOnTouchListener(Landroid/view/View$OnTouchListener;)V': (s, l) => { s.$onTouch = l; D.applyTouch(s); },
    'performClick()Z': (s) => (s.$onClick ? (D.fireClick(s), 1) : 0),
    'setBackgroundColor(I)V': (s, c) => { s.$bg = c | 0; D.applyBackground(s); },
    'setBackground(Landroid/graphics/drawable/Drawable;)V': (s, d) => { s.$bgDrawable = d; D.applyDrawableBg(s); },
    'setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)V': (s, d) => { s.$bgDrawable = d; D.applyDrawableBg(s); },
    'getBackground()Landroid/graphics/drawable/Drawable;': (s) => s.$bgDrawable || null,
    'setBackgroundResource(I)V': (s, id) => { s.$bgRes = id | 0; D.applyResourceBg(s); },
    'setPadding(IIII)V': (s, l, t, r, b) => D.applyPadding(s, l, t, r, b),
    'setPaddingRelative(IIII)V': (s, l, t, r, b) => D.applyPadding(s, l, t, r, b),
    'getPaddingLeft()I': (s) => (s.$pad ? s.$pad[0] : 0),
    'getPaddingTop()I': (s) => (s.$pad ? s.$pad[1] : 0),
    'getPaddingRight()I': (s) => (s.$pad ? s.$pad[2] : 0),
    'getPaddingBottom()I': (s) => (s.$pad ? s.$pad[3] : 0),
    'getWidth()I': (s) => (el(s) ? el(s).offsetWidth : 0),
    'getHeight()I': (s) => (el(s) ? el(s).offsetHeight : 0),
    'getMeasuredWidth()I': (s) => (el(s) ? el(s).offsetWidth : 0),
    'getMeasuredHeight()I': (s) => (el(s) ? el(s).offsetHeight : 0),
    'measure(II)V': () => {},
    'layout(IIII)V': () => {},
    'requestLayout()V': (s) => D.relayout(s),
    'invalidate()V': (s) => D.invalidate(s),
    'postInvalidate()V': (s) => D.invalidate(s),
    'post(Ljava/lang/Runnable;)Z': (s, r) => { H.post(() => D.runSafe(r)); return 1; },
    'postDelayed(Ljava/lang/Runnable;J)Z': (s, r, d) => { H.postDelayed(() => D.runSafe(r), Number(d)); return 1; },
    'removeCallbacks(Ljava/lang/Runnable;)V': () => {},
    'getHandler()Landroid/os/Handler;': () => ({ $c: R.klass('Landroid/os/Handler;') }),
    'getContext()Landroid/content/Context;': (s) => s.$ctx || H.currentActivity(),
    'getResources()Landroid/content/res/Resources;': () => H.resources(),
    'findViewById(I)Landroid/view/View;': (s, id) => D.findViewById(s, id | 0),
    'getTag()Ljava/lang/Object;': (s) => (s.$tag === undefined ? null : s.$tag),
    'setTag(Ljava/lang/Object;)V': (s, t) => { s.$tag = t; },
    'setTag(ILjava/lang/Object;)V': (s, k, t) => { s.$tags = s.$tags || new Map(); s.$tags.set(k | 0, t); },
    'getTag(I)Ljava/lang/Object;': (s, k) => {
      if (s.$tags && s.$tags.has(k | 0)) return s.$tags.get(k | 0);
      // androidx ViewTree*Owner lookups walk up the parent chain; a view that
      // is not attached yet (Compose checks before setContentView) must still
      // resolve against the window decor, exactly as it would once attached.
      let p = s.$parent;
      while (p) { if (p.$tags && p.$tags.has(k | 0)) return p.$tags.get(k | 0); p = p.$parent; }
      const act = H.currentActivity && H.currentActivity();
      const decor = act && act.$decor;
      if (decor && decor.$tags && decor.$tags.has(k | 0)) return decor.$tags.get(k | 0);
      if (H.tagRegistry && H.tagRegistry.has(k | 0)) return H.tagRegistry.get(k | 0);
      if (H.synthesizeTag) { const syn = H.synthesizeTag(k | 0); if (syn) return syn; }
      return null;
    },
    'getParent()Landroid/view/ViewParent;': (s) => s.$parent || null,
    'getLayoutParams()Landroid/view/ViewGroup$LayoutParams;': (s) => s.$lp || D.makeLayoutParams(R),
    'setLayoutParams(Landroid/view/ViewGroup$LayoutParams;)V': (s, lp) => { s.$lp = lp; D.applyLayoutParams(s); },
    'getDrawingTime()J': () => Date.now(),
    'setAlpha(F)V': (s, a) => { s.$alpha = a; const e = el(s); if (e) e.style.opacity = String(Math.max(0, Math.min(1, a))); },
    'getAlpha()F': (s) => Math.fround(s.$alpha === undefined ? 1 : s.$alpha),
    'setTranslationX(F)V': (s, v) => { s.$tx = v; D.applyTransform(s); },
    'setTranslationY(F)V': (s, v) => { s.$ty = v; D.applyTransform(s); },
    'getTranslationX()F': (s) => Math.fround(s.$tx || 0),
    'getTranslationY()F': (s) => Math.fround(s.$ty || 0),
    'setScaleX(F)V': (s, v) => { s.$sx = v; D.applyTransform(s); },
    'setScaleY(F)V': (s, v) => { s.$sy = v; D.applyTransform(s); },
    'setRotation(F)V': (s, v) => { s.$rot = v; D.applyTransform(s); },
    'getRotation()F': (s) => Math.fround(s.$rot || 0),
    'setPivotX(F)V': () => {}, 'setPivotY(F)V': () => {},
    'animate()Landroid/view/ViewPropertyAnimator;': (s) => D.animator(s),
    'startAnimation(Landroid/view/animation/Animation;)V': () => {},
    'clearAnimation()V': () => {},
    'getLocationOnScreen([I)V': (s, out) => { const e = el(s); if (e && out) { const r = e.getBoundingClientRect(); out[0] = Math.round(r.left); out[1] = Math.round(r.top); } },
    'getLocationInWindow([I)V': (s, out) => { const e = el(s); if (e && out) { const r = e.getBoundingClientRect(); out[0] = Math.round(r.left); out[1] = Math.round(r.top); } },
    'getGlobalVisibleRect(Landroid/graphics/Rect;)Z': () => 1,
    'setClipToOutline(Z)V': () => {},
    'setOutlineProvider(Landroid/view/ViewOutlineProvider;)V': () => {},
    'setElevation(F)V': (s, v) => { const e = el(s); if (e) e.style.boxShadow = v > 0 ? `0 ${Math.max(1, v / 4)}px ${v}px rgba(0,0,0,.25)` : ''; },
    'getElevation()F': () => Math.fround(0),
    'setMinimumWidth(I)V': (s, w) => { const e = el(s); if (e) e.style.minWidth = w + 'px'; },
    'setMinimumHeight(I)V': (s, h) => { const e = el(s); if (e) e.style.minHeight = h + 'px'; },
    'setKeepScreenOn(Z)V': () => {},
    'setLongClickable(Z)V': () => {},
    'setSoundEffectsEnabled(Z)V': () => {},
    'setHapticFeedbackEnabled(Z)V': () => {},
    'setOnCreateContextMenuListener(Landroid/view/View$OnCreateContextMenuListener;)V': () => {},
    'setWillNotDraw(Z)V': () => {},
    'onDraw(Landroid/graphics/Canvas;)V': () => {},
    'dispatchTouchEvent(Landroid/view/MotionEvent;)Z': (s, e) => (s.$onTouch ? (R.iv('Landroid/view/View$OnTouchListener;->onTouch(Landroid/view/View;Landroid/view/MotionEvent;)Z', s.$onTouch, s, e) ? 1 : 0) : 0),
    'onTouchEvent(Landroid/view/MotionEvent;)Z': () => 0,
    'requestFocus()Z': (s) => { const e = el(s); if (e && e.focus) { e.focus(); return 1; } return 0; },
    'clearFocus()V': (s) => { const e = el(s); if (e && e.blur) e.blur(); },
    'hasFocus()Z': () => 0,
    'isFocused()Z': (s) => { const e = el(s); return e && document.activeElement === e ? 1 : 0; },
    'getViewTreeObserver()Landroid/view/ViewTreeObserver;': (s) => s.$vto || (s.$vto = { $c: R.klass('Landroid/view/ViewTreeObserver;'), $v: s }),
    'getRootView()Landroid/view/View;': (s) => { let v = s; while (v && v.$parent) v = v.$parent; return v; },
    'getDrawingCache()Landroid/graphics/Bitmap;': () => null,
    'setDrawingCacheEnabled(Z)V': () => {},
    'destroyDrawingCache()V': () => {},
    'overScrollBy(IIIIIIIIZ)Z': () => 0,
    'scrollTo(II)V': (s, x, y) => { const e = el(s); if (e) { e.scrollLeft = x; e.scrollTop = y; } },
    'scrollBy(II)V': (s, x, y) => { const e = el(s); if (e) { e.scrollLeft += x; e.scrollTop += y; } },
    'getScrollX()I': (s) => (el(s) ? el(s).scrollLeft : 0),
    'getScrollY()I': (s) => (el(s) ? el(s).scrollTop : 0),
    'setSystemUiVisibility(I)V': () => {},
    'setFitsSystemWindows(Z)V': () => {},
    'setNextFocusForwardId(I)V': () => {},
    'getContentDescription()Ljava/lang/CharSequence;': (s) => s.$desc || null,
    'setContentDescription(Ljava/lang/CharSequence;)V': (s, d) => { s.$desc = txt(d); const e = el(s); if (e) e.title = s.$desc; },
    'setTooltipText(Ljava/lang/CharSequence;)V': () => {},
    'setForeground(Landroid/graphics/drawable/Drawable;)V': () => {},
    'getForeground()Landroid/graphics/drawable/Drawable;': () => null,
    'toString()Ljava/lang/String;': (s) => `${R.classNameOf(s)}{${s.$id !== undefined ? 'id=' + s.$id : ''}}`,
  };

  R.def('Landroid/view/View;', { access: 0x21, sup: 'Ljava/lang/Object;', m: viewMethods, sm: { 'inflate(Landroid/content/Context;ILandroid/view/ViewGroup;)Landroid/view/View;': () => null } });
  R.def('Landroid/view/View$OnClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { 'onClick(Landroid/view/View;)V': () => {} } });
  R.def('Landroid/view/View$OnLongClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnTouchListener;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { 'onTouch(Landroid/view/View;Landroid/view/MotionEvent;)Z': () => 0 } });
  R.def('Landroid/view/View$OnCreateContextMenuListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnKeyListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$OnScrollChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/View$MeasureSpec;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { 'makeMeasureSpec(II)I': (s, m) => (s & 0xffffff) | (m << 24), 'getSize(I)I': (s) => s & 0xffffff, 'getMode(I)I': (s) => (s >>> 24) & 0x3 } });
  R.def('Landroid/view/ViewParent;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/ViewOutlineProvider;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/ViewPropertyAnimator;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      'alpha(F)Landroid/view/ViewPropertyAnimator;': (s, a) => { s.$ops.push(['alpha', a]); return s; },
      'translationX(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['tx', v]); return s; },
      'translationY(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['ty', v]); return s; },
      'rotation(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['rot', v]); return s; },
      'scaleX(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['sx', v]); return s; },
      'scaleY(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['sy', v]); return s; },
      'x(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['x', v]); return s; },
      'y(F)Landroid/view/ViewPropertyAnimator;': (s, v) => { s.$ops.push(['y', v]); return s; },
      'setDuration(J)Landroid/view/ViewPropertyAnimator;': (s, d) => { s.$dur = Number(d); return s; },
      'setStartDelay(J)Landroid/view/ViewPropertyAnimator;': (s, d) => { s.$delay = Number(d); return s; },
      'setInterpolator(Landroid/view/animation/Interpolator;)Landroid/view/ViewPropertyAnimator;': (s) => s,
      'setListener(Landroid/animation/AnimatorListenerAdapter;)Landroid/view/ViewPropertyAnimator;': (s, l) => { s.$listener = l; return s; },
      'withEndAction(Ljava/lang/Runnable;)Landroid/view/ViewPropertyAnimator;': (s, r) => { s.$end = r; return s; },
      'start()V': (s) => D.runAnimator(s),
      'cancel()V': (s) => D.cancelAnimator(s),
    },
  });
  R.def('Landroid/view/animation/Interpolator;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/animation/AnimatorListenerAdapter;', { access: 0x421, sup: 'Ljava/lang/Object;', m: { 'onAnimationEnd(Landroid/animation/Animator;)V': () => {}, 'onAnimationStart(Landroid/animation/Animator;)V': () => {} } });
  R.def('Landroid/animation/Animator;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/animation/ObjectAnimator;', { access: 0x21, sup: 'Landroid/animation/Animator;' });
  R.def('Landroid/animation/ValueAnimator;', { access: 0x21, sup: 'Landroid/animation/Animator;' });

  /* ---------- ViewGroup ---------- */
  R.def('Landroid/view/ViewGroup;', {
    access: 0x421, sup: 'Landroid/view/View;',
    m: {
      '<init>(Landroid/content/Context;)V': (s, ctx) => { s.$ctx = ctx; s.$children = []; D.ensureView(s, 'ViewGroup'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, ctx) => { s.$ctx = ctx; s.$children = []; D.ensureView(s, 'ViewGroup'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, ctx) => { s.$ctx = ctx; s.$children = []; D.ensureView(s, 'ViewGroup'); },
      '<init>()V': (s) => { s.$children = []; D.ensureView(s, 'ViewGroup'); },
      'addView(Landroid/view/View;)V': (s, v) => D.addView(s, v, -1),
      'addView(Landroid/view/View;I)V': (s, v, i) => D.addView(s, v, i | 0),
      'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (s, v, lp) => { v.$lp = lp; D.addView(s, v, -1); },
      'addView(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V': (s, v, i, lp) => { v.$lp = lp; D.addView(s, v, i | 0); },
      'addView(Landroid/view/View;II)V': (s, v, w, h) => { v.$lp = D.makeLayoutParams(R, w, h); D.addView(s, v, -1); },
      'addViews([Landroid/view/View;)V': (s, vs) => { for (const v of vs || []) D.addView(s, v, -1); },
      'removeView(Landroid/view/View;)V': (s, v) => D.removeView(s, v),
      'removeViewAt(I)V': (s, i) => { const c = (s.$children || [])[i | 0]; if (c) D.removeView(s, c); },
      'removeViewInLayout(Landroid/view/View;)V': (s, v) => D.removeView(s, v),
      'removeAllViews()V': (s) => D.removeAllViews(s),
      'removeAllViewsInLayout()V': (s) => D.removeAllViews(s),
      'removeViews(II)V': (s, st, n) => { for (let i = 0; i < n; i++) { const c = (s.$children || [])[st]; if (c) D.removeView(s, c); } },
      'getChildCount()I': (s) => (s.$children ? s.$children.length : 0),
      'getChildAt(I)Landroid/view/View;': (s, i) => (s.$children && s.$children[i | 0] ? s.$children[i | 0] : null),
      'indexOfChild(Landroid/view/View;)I': (s, v) => (s.$children ? s.$children.indexOf(v) : -1),
      'getChildId(I)J': (s, i) => (s.$children && s.$children[i] && s.$children[i].$id !== undefined ? s.$children[i].$id : -1),
      'setLayoutTransition(Landroid/animation/LayoutTransition;)V': () => {},
      'setClipChildren(Z)V': () => {},
      'setClipToPadding(Z)V': () => {},
      'setOnHierarchyChangeListener(Landroid/view/ViewGroup$OnHierarchyChangeListener;)V': () => {},
      'dispatchDraw(Landroid/graphics/Canvas;)V': () => {},
      'onLayout(ZIIII)V': () => {},
      'addTouchables(Ljava/util/ArrayList;)V': () => {},
      'bringChildToFront(Landroid/view/View;)V': (s, v) => { if (!s.$children) return; const i = s.$children.indexOf(v); if (i >= 0) { s.$children.splice(i, 1); s.$children.push(v); D.resyncChildren(s); } },
    },
  });
  R.def('Landroid/view/ViewGroup$LayoutParams;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    fields: [['width', 'I'], ['height', 'I']],
    m: {
      '<init>(II)V': (s, w, h) => { s.$w = w | 0; s.$h = h | 0; },
      '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (s, o) => { s.$w = o ? o.$w : -2; s.$h = o ? o.$h : -2; },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s) => { s.$w = -2; s.$h = -2; },
    },
  });
  R.def('Landroid/view/ViewGroup$MarginLayoutParams;', { access: 0x21, sup: 'Landroid/view/ViewGroup$LayoutParams;', m: { '<init>(II)V': (s, w, h) => { s.$w = w | 0; s.$h = h | 0; }, '<init>(Landroid/view/ViewGroup$MarginLayoutParams;)V': (s, o) => Object.assign(s, o), 'setMargins(IIII)V': (s, l, t, r, b) => { s.$m = [l, t, r, b]; } } });
  R.def('Landroid/view/LayoutInflater;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      '<init>()V': () => {},
      'inflate(ILandroid/view/ViewGroup;)Landroid/view/View;': (s, id, root) => D.inflate(id, root, false),
      'inflate(ILandroid/view/ViewGroup;Z)Landroid/view/View;': (s, id, root, attach) => D.inflate(id, root, !!attach),
      'inflate(Lorg/xmlpull/v1/XmlPullParser;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
      'inflate(Lorg/xmlpull/v1/XmlPullParser;Landroid/view/ViewGroup;Z)Landroid/view/View;': () => null,
      'cloneInContext(Landroid/content/Context;)Landroid/view/LayoutInflater;': (s) => s,
      'setFactory(Landroid/view/LayoutInflater$Factory;)V': () => {},
      'setFactory2(Landroid/view/LayoutInflater$Factory2;)V': () => {},
    },
    sm: { 'from(Landroid/content/Context;)Landroid/view/LayoutInflater;': (ctx) => H.layoutInflater(ctx) },
  });
  R.def('Landroid/view/LayoutInflater$Factory;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/LayoutInflater$Factory2;', { access: 0x601, sup: 'Landroid/view/LayoutInflater$Factory;' });
  R.def('Lorg/xmlpull/v1/XmlPullParser;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/util/AttributeSet;', { access: 0x601, sup: 'Ljava/lang/Object;', m: { 'getAttributeCount()I': () => 0, 'getAttributeName(I)Ljava/lang/String;': () => null, 'getAttributeValue(I)Ljava/lang/String;': () => null } });

  R.def('Landroid/view/MotionEvent;', {
    access: 0x31, sup: 'Landroid/view/InputEvent;',
    m: {
      'getX()F': (s) => Math.fround(s.$x || 0), 'getY()F': (s) => Math.fround(s.$y || 0),
      'getX(I)F': (s) => Math.fround(s.$x || 0), 'getY(I)F': (s) => Math.fround(s.$y || 0),
      'getRawX()F': (s) => Math.fround(s.$rx || s.$x || 0), 'getRawY()F': (s) => Math.fround(s.$ry || s.$y || 0),
      'getAction()I': (s) => s.$action | 0, 'getActionMasked()I': (s) => (s.$action | 0) & 0xff,
      'getPointerCount()I': (s) => (s.$pointers ? s.$pointers.length : 1),
      'getPointerId(I)I': (s, i) => (s.$pointers && s.$pointers[i | 0] ? s.$pointers[i | 0].id : i | 0),
      'getPointerIndex(I)I': (s, id) => (s.$pointers ? s.$pointers.findIndex((p) => p.id === (id | 0)) : 0),
      'getX(I)F': (s, i) => Math.fround(s.$pointers && s.$pointers[i | 0] ? s.$pointers[i | 0].x : (s.$x || 0)),
      'getY(I)F': (s, i) => Math.fround(s.$pointers && s.$pointers[i | 0] ? s.$pointers[i | 0].y : (s.$y || 0)),
      'getActionIndex()I': (s) => ((s.$action | 0) >> 8) & 0xff,
      'getEventTime()J': () => Date.now(), 'getDownTime()J': () => Date.now(),
      'getHistorySize()I': () => 0, 'getMetaState()I': () => 0,
      'getPressure()F': () => Math.fround(1), 'getSize()F': () => Math.fround(1),
      'recycle()V': () => {}, 'getDevice()Landroid/view/InputDevice;': () => null,
    },
    sm: {
      'obtain(JJIFFFFIFFI)Landroid/view/MotionEvent;': () => ({ $c: R.klass('Landroid/view/MotionEvent;'), $action: 0, $x: 0, $y: 0 }),
      'obtain(JJIFFFFIFFILandroid/view/MotionEvent;)Landroid/view/MotionEvent;': () => ({ $c: R.klass('Landroid/view/MotionEvent;'), $action: 0, $x: 0, $y: 0 }),
      'obtain(Landroid/view/MotionEvent;)Landroid/view/MotionEvent;': (e) => e,
      'obtainNoHistory(Landroid/view/MotionEvent;)Landroid/view/MotionEvent;': (e) => e,
    },
  });
  R.def('Landroid/view/InputEvent;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/InputDevice;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/KeyEvent;', { access: 0x31, sup: 'Landroid/view/InputEvent;', m: { 'getKeyCode()I': (s) => s.$code | 0, 'getAction()I': (s) => s.$action | 0, 'getUnicodeChar()I': (s) => (s.$ch || 0) } });
  R.def('Landroid/view/Gravity;', { access: 0x11, sup: 'Ljava/lang/Object;', statics: Object.fromEntries(Object.entries(GRAVITY).map(([k, v]) => [`Landroid/view/Gravity;->${k}:I`, v])) });
  R.def('Landroid/view/Display;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { 'getWidth()I': () => H.screenWidth(), 'getHeight()I': () => H.screenHeight(), 'getMetrics(Landroid/util/DisplayMetrics;)V': (s, m) => { if (m) { m.$w = H.screenWidth(); m.$h = H.screenHeight(); } }, 'getRealMetrics(Landroid/util/DisplayMetrics;)V': (s, m) => { if (m) { m.$w = H.screenWidth(); m.$h = H.screenHeight(); } } } });
  R.def('Landroid/view/Sound;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/animation/LayoutTransition;', { access: 0x21, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/animation/AnimationSet;', { access: 0x21, sup: 'Landroid/view/animation/Animation;' });
  R.def('Landroid/view/animation/TranslateAnimation;', { access: 0x21, sup: 'Landroid/view/animation/Animation;' });
  R.def('Landroid/view/animation/RotateAnimation;', { access: 0x21, sup: 'Landroid/view/animation/Animation;' });
  R.def('Landroid/view/animation/ScaleAnimation;', { access: 0x21, sup: 'Landroid/view/animation/Animation;' });
  R.def('Landroid/view/animation/LinearInterpolator;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/view/animation/Interpolator;'] });
  R.def('Landroid/view/animation/AccelerateInterpolator;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/view/animation/Interpolator;'] });
  R.def('Landroid/view/animation/DecelerateInterpolator;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/view/animation/Interpolator;'] });
  R.def('Landroid/view/GestureDetector;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      '<init>(Landroid/content/Context;Landroid/view/GestureDetector$OnGestureListener;)V': (s, c, l) => { s.$l = l; },
      '<init>(Landroid/content/Context;Landroid/view/GestureDetector$OnGestureListener;Landroid/os/Handler;)V': (s, c, l) => { s.$l = l; },
      '<init>(Landroid/view/GestureDetector$OnGestureListener;)V': (s, l) => { s.$l = l; },
      '<init>(Landroid/content/Context;Landroid/view/GestureDetector$SimpleOnGestureListener;)V': (s, c, l) => { s.$l = l; },
      'onTouchEvent(Landroid/view/MotionEvent;)Z': (s, e) => {
        if (!s.$l) return 0;
        const a = (e.$action | 0) & 0xff;
        try {
          if (a === 0) R.iv('Landroid/view/GestureDetector$OnGestureListener;->onDown(Landroid/view/MotionEvent;)Z', s.$l, e);
          if (a === 1) R.iv('Landroid/view/GestureDetector$OnGestureListener;->onSingleTapUp(Landroid/view/MotionEvent;)Z', s.$l, e);
          if (a === 2) R.iv('Landroid/view/GestureDetector$OnGestureListener;->onScroll(Landroid/view/MotionEvent;Landroid/view/MotionEvent;FF)Z', s.$l, s.$last || e, e, 0, 0);
        } catch (err) { /* listener may not implement these */ }
        s.$last = e;
        return 1;
      },
      'setOnDoubleTapListener(Landroid/view/GestureDetector$OnDoubleTapListener;)V': (s, l) => { s.$dt = l; },
      'setIsLongpressEnabled(Z)V': () => {},
      'isLongpressEnabled()Z': () => 1,
    },
  });
  R.def('Landroid/view/GestureDetector$OnGestureListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/GestureDetector$SimpleOnGestureListener;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/view/GestureDetector$OnGestureListener;', 'Landroid/view/GestureDetector$OnDoubleTapListener;'], m: { '<init>()V': () => {}, 'onDown(Landroid/view/MotionEvent;)Z': () => 1, 'onSingleTapUp(Landroid/view/MotionEvent;)Z': () => 0, 'onSingleTapConfirmed(Landroid/view/MotionEvent;)Z': () => 0, 'onDoubleTap(Landroid/view/MotionEvent;)Z': () => 0, 'onDoubleTapEvent(Landroid/view/MotionEvent;)Z': () => 0, 'onLongPress(Landroid/view/MotionEvent;)V': () => {}, 'onFling(Landroid/view/MotionEvent;Landroid/view/MotionEvent;FF)Z': () => 0, 'onScroll(Landroid/view/MotionEvent;Landroid/view/MotionEvent;FF)Z': () => 0, 'onShowPress(Landroid/view/MotionEvent;)V': () => {} } });
  R.def('Landroid/view/GestureDetector$OnDoubleTapListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/ScaleGestureDetector;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { '<init>(Landroid/content/Context;Landroid/view/ScaleGestureDetector$OnScaleGestureListener;)V': () => {}, 'onTouchEvent(Landroid/view/MotionEvent;)Z': () => 1, 'getScaleFactor()F': () => Math.fround(1) } });
  R.def('Landroid/view/ScaleGestureDetector$OnScaleGestureListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/view/VelocityTracker;', { access: 0x31, sup: 'Ljava/lang/Object;', sm: { 'obtain()Landroid/view/VelocityTracker;': () => ({ $c: R.klass('Landroid/view/VelocityTracker;') }) }, m: { 'addMovement(Landroid/view/MotionEvent;)V': () => {}, 'computeCurrentVelocity(I)V': () => {}, 'getXVelocity()F': () => Math.fround(0), 'getYVelocity()F': () => Math.fround(0), 'recycle()V': () => {} } });
  R.def('Landroid/view/ViewConfiguration;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { 'get(Landroid/content/Context;)Landroid/view/ViewConfiguration;': () => ({ $c: R.klass('Landroid/view/ViewConfiguration;') }) }, m: { 'getScaledTouchSlop()I': () => 8, 'getScaledMinimumFlingVelocity()I': () => 50, 'getScaledMaximumFlingVelocity()I': () => 8000 } });
  R.def('Landroid/view/ViewGroup$OnHierarchyChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---------- TextView & friends ---------- */
  R.def('Landroid/widget/TextView;', {
    access: 0x21, sup: 'Landroid/view/View;',
    m: Object.assign({}, viewMethods, {
      '<init>(Landroid/content/Context;)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'TextView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'TextView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'TextView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;II)V': (s, ctx) => { s.$ctx = ctx; D.ensureView(s, 'TextView'); },
      'setText(Ljava/lang/CharSequence;)V': (s, t) => D.setText(s, txt(t)),
      'setText(I)V': (s, id) => D.setText(s, txt(H.resString(id | 0))),
      'setText([CII)V': (s, c, a, b) => D.setText(s, String.fromCharCode.apply(null, Array.prototype.slice.call(c || [], a, b))),
      'setText(Ljava/lang/CharSequence;Landroid/widget/TextView$BufferType;)V': (s, t) => D.setText(s, txt(t)),
      'append(Ljava/lang/CharSequence;)V': (s, t) => D.setText(s, (s.$text || '') + txt(t)),
      'append(Ljava/lang/CharSequence;II)V': (s, t, a, b) => D.setText(s, (s.$text || '') + txt(t).slice(a, b)),
      'getText()Ljava/lang/CharSequence;': (s) => D.getText(s),
      'length()I': (s) => (D.getText(s) || '').length,
      'setTextColor(I)V': (s, c) => D.setTextColor(s, c | 0),
      'setTextColor(Landroid/content/res/ColorStateList;)V': (s, c) => D.setTextColor(s, c && c.$color !== undefined ? c.$color : 0xff000000),
      'getCurrentTextColor()I': (s) => (s.$color === undefined ? 0xff000000 : s.$color),
      'setTextSize(F)V': (s, v) => D.setTextSize(s, v),
      'setTextSize(IF)V': (s, u, v) => D.setTextSize(s, dimToPx(v, u === 2 ? 2 : 1)),
      'getTextSize()F': (s) => Math.fround(s.$size === undefined ? 14 : s.$size),
      'setTypeface(Landroid/graphics/Typeface;)V': (s, t) => { s.$tf = t; },
      'setTypeface(Landroid/graphics/Typeface;I)V': (s, t, style) => { s.$tf = t; s.$style = style | 0; D.applyTextStyle(s); },
      'setTextStyle(I)V': (s, st) => { s.$textStyle = st | 0; D.applyTextStyle(s); },
      'setGravity(I)V': (s, g) => D.setGravity(s, g | 0),
      'getGravity()I': (s) => (s.$gravity === undefined ? 0 : s.$gravity),
      'setLines(I)V': (s, n) => D.setLines(s, n | 0, n | 0),
      'setMaxLines(I)V': (s, n) => D.setLines(s, null, n | 0),
      'setMinLines(I)V': (s, n) => D.setLines(s, n | 0, null),
      'setSingleLine()V': (s) => D.setLines(s, 1, 1),
      'setSingleLine(Z)V': (s, b) => { if (b) D.setLines(s, 1, 1); },
      'setEllipsize(Landroid/text/TextUtils$TruncateAt;)V': (s, t) => D.setEllipsize(s, t),
      'getLineCount()I': (s) => 1,
      'setAllCaps(Z)V': (s, b) => { s.$caps = !!b; D.applyTextStyle(s); },
      'setLetterSpacing(F)V': () => {},
      'setLineSpacing(FI)V': (s, add, mult) => D.setLineSpacing(s, add, mult),
      'setCompoundDrawables(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': () => {},
      'setCompoundDrawablesWithIntrinsicBounds(IIII)V': () => {},
      'setCompoundDrawablesWithIntrinsicBounds(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': () => {},
      'setHint(Ljava/lang/CharSequence;)V': (s, h) => D.setHint(s, txt(h)),
      'setHint(I)V': (s, id) => D.setHint(s, txt(H.resString(id | 0))),
      'getHint()Ljava/lang/CharSequence;': (s) => s.$hint || null,
      'setSelected(Z)V': (s, v) => { s.$selected = v ? 1 : 0; D.applySelected(s); },
      'getPaint()Landroid/text/TextPaint;': () => ({ $c: R.klass('Landroid/text/TextPaint;'), $size: 14 }),
      'getLayout()Landroid/text/Layout;': () => null,
      'setMovementMethod(Landroid/text/method/MovementMethod;)V': () => {},
      'setTransformationMethod(Landroid/text/method/TransformationMethod;)V': (s, t) => { s.$transform = t; D.refreshText(s); },
      'setAutoLinkMask(I)V': () => {},
      'setLinksClickable(Z)V': () => {},
      'setError(Ljava/lang/CharSequence;)V': (s, e) => D.setError(s, txt(e)),
      'setImeOptions(I)V': () => {},
      'setRawInputType(I)V': () => {},
      'setInputType(I)V': (s, t) => D.setInputType(s, t | 0),
      'getInputType()I': (s) => (s.$inputType || 0),
      'addTextChangedListener(Landroid/text/TextWatcher;)V': (s, w) => { s.$watchers = s.$watchers || []; s.$watchers.push(w); D.applyEditable(s); },
      'removeTextChangedListener(Landroid/text/TextWatcher;)V': (s, w) => { if (s.$watchers) s.$watchers = s.$watchers.filter((x) => x !== w); },
      'getSelectionStart()I': () => 0,
      'getSelectionEnd()I': () => 0,
      'setSelection(I)V': (s, i) => { const e = D.editableEl(s); if (e && e.setSelectionRange) try { e.setSelectionRange(i, i); } catch {} },
      'setSelection(II)V': (s, a, b) => { const e = D.editableEl(s); if (e && e.setSelectionRange) try { e.setSelectionRange(a, b); } catch {} },
      'getTextColors()Landroid/content/res/ColorStateList;': () => null,
      'onTouchEvent(Landroid/view/MotionEvent;)Z': (s, e) => (s.$onTouch ? R.iv('Landroid/view/View$OnTouchListener;->onTouch(Landroid/view/View;Landroid/view/MotionEvent;)Z', s.$onTouch, s, e) : 0),
    }),
  });
  R.def('Landroid/widget/TextView$BufferType;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/text/TextUtils$TruncateAt;', { access: 0x4011, sup: 'Ljava/lang/Enum;' });
  R.def('Landroid/text/TextPaint;', { access: 0x21, sup: 'Landroid/graphics/Paint;' });
  R.def('Landroid/text/Layout;', { access: 0x421, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/text/method/MovementMethod;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/text/method/TransformationMethod;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/text/method/ScrollingMovementMethod;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { 'getInstance()Landroid/text/method/MovementMethod;': () => ({ $c: R.klass('Landroid/text/method/MovementMethod;') }) } });
  R.def('Landroid/text/method/PasswordTransformationMethod;', { access: 0x21, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/text/method/TransformationMethod;'], sm: { 'getInstance()Landroid/text/method/PasswordTransformationMethod;': () => ({ $c: R.klass('Landroid/text/method/PasswordTransformationMethod;'), $password: true }) }, m: { 'getTransformation(Ljava/lang/CharSequence;Landroid/view/View;)Ljava/lang/CharSequence;': (s, c) => ({ $c: R.klass('Landroid/text/SpannableString;'), $t: '•'.repeat(String(c || '').length) }) } });
  R.def('Landroid/text/method/SingleLineTransformationMethod;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { 'getInstance()Landroid/text/method/SingleLineTransformationMethod;': () => ({ $c: R.klass('Landroid/text/method/SingleLineTransformationMethod;') }) } });
  R.def('Landroid/text/method/LinkMovementMethod;', { access: 0x21, sup: 'Ljava/lang/Object;', sm: { 'getInstance()Landroid/text/method/MovementMethod;': () => ({ $c: R.klass('Landroid/text/method/MovementMethod;') }) } });

  R.def('Landroid/widget/Button;', { access: 0x21, sup: 'Landroid/widget/TextView;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Button'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Button'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Button'); } } });
  R.def('Landroid/widget/ImageButton;', { access: 0x21, sup: 'Landroid/widget/ImageView;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ImageButton'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ImageButton'); } } });
  R.def('Landroid/widget/EditText;', {
    access: 0x21, sup: 'Landroid/widget/TextView;',
    m: Object.assign({}, {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'EditText'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'EditText'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'EditText'); },
      'getText()Landroid/text/Editable;': (s) => D.editable(s),
      'setText(Ljava/lang/CharSequence;)V': (s, t) => D.setText(s, txt(t)),
      'setText(I)V': (s, id) => D.setText(s, txt(H.resString(id | 0))),
      'setSelectAllOnFocus(Z)V': () => {},
      'selectAll()V': () => {},
      'setCursorVisible(Z)V': () => {},
      'setFilters([Landroid/text/InputFilter;)V': () => {},
      'setOnEditorActionListener(Landroid/widget/TextView$OnEditorActionListener;)V': (s, l) => { s.$editorAction = l; },
    }),
  });
  R.def('Landroid/text/InputFilter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/text/InputFilter$LengthFilter;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { '<init>(I)V': () => {} } });
  R.def('Landroid/widget/TextView$OnEditorActionListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/MultiAutoCompleteTextView;', { access: 0x21, sup: 'Landroid/widget/EditText;' });
  R.def('Landroid/widget/AutoCompleteTextView;', { access: 0x21, sup: 'Landroid/widget/EditText;' });

  R.def('Landroid/widget/ImageView;', {
    access: 0x21, sup: 'Landroid/view/View;',
    m: Object.assign({}, viewMethods, {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ImageView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ImageView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ImageView'); },
      'setImageResource(I)V': (s, id) => D.setImageResource(s, id | 0),
      'setImageDrawable(Landroid/graphics/drawable/Drawable;)V': (s, d) => D.setImageDrawable(s, d),
      'setImageBitmap(Landroid/graphics/Bitmap;)V': (s, b) => D.setImageBitmap(s, b),
      'setImageURI(Landroid/net/Uri;)V': (s, u) => D.setImageUri(s, u),
      'setImageAlpha(I)V': (s, a) => { const e = el(s); if (e) e.style.opacity = String(a / 255); },
      'setImageLevel(I)V': () => {},
      'setAdjustViewBounds(Z)V': (s, b) => { s.$adjust = !!b; D.applyImageFit(s); },
      'setScaleType(Landroid/widget/ImageView$ScaleType;)V': (s, t) => { s.$scaleType = t; D.applyImageFit(s); },
      'getScaleType()Landroid/widget/ImageView$ScaleType;': (s) => s.$scaleType || null,
      'setMaxWidth(I)V': () => {}, 'setMaxHeight(I)V': () => {},
      'setColorFilter(I)V': (s, c) => D.setImageTint(s, c),
      'getDrawable()Landroid/graphics/drawable/Drawable;': (s) => s.$drawable || null,
    }),
  });
  R.def('Landroid/widget/ImageView$ScaleType;', {
    access: 0x4011, sup: 'Ljava/lang/Enum;',
    statics: {},
  });
  for (const st of ['FIT_CENTER', 'CENTER_CROP', 'CENTER_INSIDE', 'CENTER', 'FIT_XY', 'FIT_START', 'FIT_END', 'MATRIX']) {
    R.klass('Landroid/widget/ImageView$ScaleType;').statics[`Landroid/widget/ImageView$ScaleType;->${st}:Landroid/widget/ImageView$ScaleType;`] = { $c: R.klass('Landroid/widget/ImageView$ScaleType;'), $name: st };
  }

  /* ---------- layouts ---------- */
  const groupInit = (kind) => ({
    '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; s.$children = []; D.ensureView(s, kind); },
    '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; s.$children = []; D.ensureView(s, kind); },
    '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; s.$children = []; D.ensureView(s, kind); },
    '<init>()V': (s) => { s.$children = []; D.ensureView(s, kind); },
  });
  R.def('Landroid/widget/LinearLayout;', {
    access: 0x21, sup: 'Landroid/view/ViewGroup;',
    m: Object.assign(groupInit('LinearLayout'), {
      'setOrientation(I)V': (s, o) => D.setOrientation(s, o | 0),
      'getOrientation()I': (s) => (s.$orientation || 0),
      'setGravity(I)V': (s, g) => D.setGroupGravity(s, g | 0),
      'getGravity()I': (s) => (s.$groupGravity || 0),
      'setWeightSum(F)V': (s, w) => { s.$weightSum = w; },
      'setBaselineAligned(Z)V': () => {},
      'setHorizontalGravity(I)V': (s, g) => D.setGroupGravity(s, (s.$groupGravity || 0) & 0x70 | (g & 0x07)),
      'setVerticalGravity(I)V': (s, g) => D.setGroupGravity(s, (s.$groupGravity || 0) & 0x07 | (g & 0x70)),
      'setDividerDrawable(Landroid/graphics/drawable/Drawable;)V': () => {},
      'setShowDividers(I)V': () => {},
      'measureChildWithMargins(Landroid/view/View;IIII)V': () => {},
    }),
  });
  R.def('Landroid/widget/LinearLayout$LayoutParams;', {
    access: 0x21, sup: 'Landroid/view/ViewGroup$MarginLayoutParams;',
    fields: [['width', 'I'], ['height', 'I'], ['weight', 'F'], ['gravity', 'I']],
    m: {
      '<init>(II)V': (s, w, h) => { s.$w = w | 0; s.$h = h | 0; s.$weight = 0; },
      '<init>(IIF)V': (s, w, h, wt) => { s.$w = w | 0; s.$h = h | 0; s.$weight = wt; },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s) => { s.$w = -2; s.$h = -2; s.$weight = 0; },
      '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (s, o) => Object.assign(s, o || {}),
    },
  });
  R.def('Landroid/widget/FrameLayout;', {
    access: 0x21, sup: 'Landroid/view/ViewGroup;',
    m: Object.assign(groupInit('FrameLayout'), {
      'setForegroundGravity(I)V': (s, g) => D.setGroupGravity(s, g | 0),
      'getForegroundGravity()I': (s) => s.$groupGravity || 0,
      'setMeasureAllChildren(Z)V': () => {},
    }),
  });
  R.def('Landroid/widget/FrameLayout$LayoutParams;', { access: 0x21, sup: 'Landroid/view/ViewGroup$MarginLayoutParams;', fields: [['gravity', 'I']], m: { '<init>(II)V': (s, w, h) => { s.$w = w | 0; s.$h = h | 0; }, '<init>(III)V': (s, w, h, g) => { s.$w = w | 0; s.$h = h | 0; s.$gravity = g; }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s) => { s.$w = -2; s.$h = -2; } } });
  R.def('Landroid/widget/RelativeLayout;', {
    access: 0x21, sup: 'Landroid/view/ViewGroup;',
    m: Object.assign(groupInit('RelativeLayout'), {
      'setGravity(I)V': (s, g) => D.setGroupGravity(s, g | 0),
      'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (s, v, lp) => { v.$lp = lp; D.addView(s, v, -1); },
      'setHorizontalGravity(I)V': () => {}, 'setVerticalGravity(I)V': () => {},
    }),
  });
  R.def('Landroid/widget/RelativeLayout$LayoutParams;', {
    access: 0x29, sup: 'Landroid/view/ViewGroup$MarginLayoutParams;',
    m: {
      '<init>(II)V': (s, w, h) => { s.$w = w | 0; s.$h = h | 0; s.$rules = new Map(); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s) => { s.$w = -2; s.$h = -2; s.$rules = new Map(); },
      '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (s, o) => Object.assign(s, o || {}, { $rules: new Map() }),
      'addRule(I)V': (s, r) => { s.$rules = s.$rules || new Map(); s.$rules.set(r | 0, -1); },
      'addRule(II)V': (s, r, v) => { s.$rules = s.$rules || new Map(); s.$rules.set(r | 0, v | 0); },
      'removeRule(I)V': (s, r) => { if (s.$rules) s.$rules.delete(r | 0); },
      'getRules()[I': () => [],
      'setAlignWithParent(Z)V': () => {},
    },
  });
  R.def('Landroid/widget/TableLayout;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: groupInit('TableLayout') });
  R.def('Landroid/widget/TableRow;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: groupInit('TableRow') });
  R.def('Landroid/widget/TableLayout$LayoutParams;', { access: 0x21, sup: 'Landroid/widget/LinearLayout$LayoutParams;' });
  R.def('Landroid/widget/GridLayout;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: groupInit('GridLayout') });
  R.def('Landroid/widget/ScrollView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: Object.assign(groupInit('ScrollView'), { 'setFillViewport(Z)V': () => {}, 'isFillViewport()Z': () => 0, 'smoothScrollTo(II)V': (s, x, y) => { const e = el(s); if (e) e.scrollTo({ top: y, behavior: 'smooth' }); }, 'scrollTo(II)V': (s, x, y) => { const e = el(s); if (e) { e.scrollTop = y; e.scrollLeft = x; } }, 'fullScroll(I)Z': () => 1 }) });
  R.def('Landroid/widget/HorizontalScrollView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: Object.assign(groupInit('HorizontalScrollView'), { 'smoothScrollTo(II)V': (s, x, y) => { const e = el(s); if (e) e.scrollTo({ left: x, behavior: 'smooth' }); } }) });
  R.def('Landroid/widget/ViewSwitcher;', { access: 0x21, sup: 'Landroid/widget/ViewAnimator;', m: groupInit('ViewSwitcher') });
  R.def('Landroid/widget/ViewAnimator;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: Object.assign(groupInit('ViewAnimator'), { 'setDisplayedChild(I)V': (s, i) => D.showChild(s, i | 0), 'getDisplayedChild()I': (s) => s.$shown || 0, 'showNext()V': (s) => D.showChild(s, ((s.$shown || 0) + 1) % Math.max(1, (s.$children || []).length)), 'showPrevious()V': () => {} }) });
  R.def('Landroid/widget/ViewFlipper;', { access: 0x21, sup: 'Landroid/widget/ViewAnimator;', m: Object.assign(groupInit('ViewFlipper'), { 'startFlipping()V': () => {}, 'stopFlipping()V': () => {}, 'setFlipInterval(I)V': () => {}, 'setAutoStart(Z)V': () => {} }) });

  /* ---------- compound widgets ---------- */
  R.def('Landroid/widget/CheckBox;', { access: 0x21, sup: 'Landroid/widget/CompoundButton;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'CheckBox'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'CheckBox'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'CheckBox'); } } });
  R.def('Landroid/widget/RadioButton;', { access: 0x21, sup: 'Landroid/widget/CompoundButton;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'RadioButton'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'RadioButton'); } } });
  R.def('Landroid/widget/RadioGroup;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: Object.assign(groupInit('RadioGroup'), { 'check(I)V': (s, id) => D.radioCheck(s, id | 0), 'getCheckedRadioButtonId()I': (s) => (s.$checkedId === undefined ? -1 : s.$checkedId), 'setOnCheckedChangeListener(Landroid/widget/RadioGroup$OnCheckedChangeListener;)V': (s, l) => { s.$onChecked = l; }, 'clearCheck()V': (s) => { s.$checkedId = -1; } }) });
  R.def('Landroid/widget/RadioGroup$OnCheckedChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/RadioGroup$LayoutParams;', { access: 0x29, sup: 'Landroid/widget/LinearLayout$LayoutParams;' });
  R.def('Landroid/widget/ToggleButton;', { access: 0x21, sup: 'Landroid/widget/CompoundButton;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ToggleButton'); } } });
  R.def('Landroid/widget/Switch;', { access: 0x21, sup: 'Landroid/widget/CompoundButton;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Switch'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Switch'); } } });
  R.def('Landroidx/appcompat/widget/SwitchCompat;', { access: 0x21, sup: 'Landroid/widget/Switch;' });
  R.def('Landroid/widget/CompoundButton;', {
    access: 0x421, sup: 'Landroid/widget/Button;',
    m: Object.assign({}, viewMethods, {
      'setChecked(Z)V': (s, b) => D.setChecked(s, !!b),
      'isChecked()Z': (s) => (s.$checked ? 1 : 0),
      'toggle()V': (s) => D.setChecked(s, !s.$checked),
      'setOnCheckedChangeListener(Landroid/widget/CompoundButton$OnCheckedChangeListener;)V': (s, l) => { s.$onCheckedChange = l; },
      'setButtonDrawable(I)V': () => {},
      'getText()Ljava/lang/CharSequence;': (s) => D.getText(s),
      'setText(Ljava/lang/CharSequence;)V': (s, t) => D.setText(s, txt(t)),
    }),
  });
  R.def('Landroid/widget/CompoundButton$OnCheckedChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  R.def('Landroid/widget/ProgressBar;', {
    access: 0x21, sup: 'Landroid/view/View;',
    m: Object.assign({}, viewMethods, {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ProgressBar'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ProgressBar'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ProgressBar'); },
      'setProgress(I)V': (s, p) => D.setProgress(s, p | 0),
      'getProgress()I': (s) => (s.$progress || 0),
      'setMax(I)V': (s, m) => D.setMax(s, m | 0),
      'getMax()I': (s) => (s.$max === undefined ? 100 : s.$max),
      'setSecondaryProgress(I)V': () => {},
      'setIndeterminate(Z)V': (s, b) => D.setIndeterminate(s, !!b),
      'isIndeterminate()Z': (s) => (s.$indeterminate ? 1 : 0),
      'incrementProgressBy(I)V': (s, d) => D.setProgress(s, (s.$progress || 0) + (d | 0)),
    }),
  });
  R.def('Landroid/widget/SeekBar;', {
    access: 0x21, sup: 'Landroid/widget/AbsSeekBar;',
    m: {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SeekBar'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SeekBar'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SeekBar'); },
      'setOnSeekBarChangeListener(Landroid/widget/SeekBar$OnSeekBarChangeListener;)V': (s, l) => { s.$onSeek = l; D.bindSeek(s); },
      'setProgress(I)V': (s, p) => D.setProgress(s, p | 0),
      'setProgress(IZ)V': (s, p, fromUser) => D.setProgress(s, p | 0, !!fromUser),
      'getProgress()I': (s) => (s.$progress || 0),
      'setMax(I)V': (s, m) => D.setMax(s, m | 0),
      'getMax()I': (s) => (s.$max === undefined ? 100 : s.$max),
      'incrementProgressBy(I)V': (s, d) => D.setProgress(s, (s.$progress || 0) + (d | 0)),
    },
  });
  R.def('Landroid/widget/AbsSeekBar;', { access: 0x421, sup: 'Landroid/widget/ProgressBar;' });
  R.def('Landroid/widget/SeekBar$OnSeekBarChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/RatingBar;', { access: 0x21, sup: 'Landroid/widget/AbsSeekBar;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SeekBar'); }, 'setRating(F)V': (s, r) => D.setProgress(s, Math.round(r)), 'getRating()F': (s) => Math.fround(s.$progress || 0), 'setNumStars(I)V': (s, n) => D.setMax(s, n | 0) } });

  R.def('Landroid/widget/Spinner;', {
    access: 0x21, sup: 'Landroid/widget/AbsSpinner;',
    m: Object.assign({}, viewMethods, groupInit('Spinner'), {
      'setAdapter(Landroid/widget/SpinnerAdapter;)V': (s, a) => D.setSpinnerAdapter(s, a),
      'getAdapter()Landroid/widget/SpinnerAdapter;': (s) => s.$adapter || null,
      'setSelection(I)V': (s, i) => D.setSpinnerSelection(s, i | 0),
      'getSelectedItemPosition()I': (s) => (s.$sel || 0),
      'getSelectedItem()Ljava/lang/Object;': (s) => (s.$adapter ? D.adapterItem(s.$adapter, s.$sel || 0) : null),
      'setOnItemSelectedListener(Landroid/widget/AdapterView$OnItemSelectedListener;)V': (s, l) => { s.$onSel = l; D.bindSpinner(s); },
      'setPrompt(Ljava/lang/CharSequence;)V': (s, p) => D.setHint(s, txt(p)),
    }),
  });
  R.def('Landroid/widget/AbsSpinner;', { access: 0x421, sup: 'Landroid/widget/AdapterView;' });
  R.def('Landroid/widget/AdapterView;', { access: 0x421, sup: 'Landroid/view/ViewGroup;' });
  R.def('Landroid/widget/AdapterView$OnItemSelectedListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/Adapter;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/SpinnerAdapter;', { access: 0x601, sup: 'Landroid/widget/Adapter;' });
  R.def('Landroid/widget/ListAdapter;', { access: 0x601, sup: 'Landroid/widget/Adapter;' });
  R.def('Landroid/widget/BaseAdapter;', {
    access: 0x421, sup: 'Ljava/lang/Object;', ifaces: ['Landroid/widget/ListAdapter;', 'Landroid/widget/SpinnerAdapter;'],
    m: {
      '<init>()V': () => {},
      'notifyDataSetChanged()V': (s) => { if (s.$boundTo) for (const v of s.$boundTo) { if (v.$kind === 'Spinner') D.setSpinnerAdapter(v, s); else D.setListAdapter(v, s); } },
      'notifyDataSetInvalidated()V': () => {},
      'getCount()I': () => 0, 'getItem(I)Ljava/lang/Object;': () => null, 'getItemId(I)J': (s, i) => i | 0,
      'hasStableIds()Z': () => 0, 'isEmpty()Z': (s) => BOOL0(R.iv('Landroid/widget/BaseAdapter;->getCount()I', s) === 0),
      'getItemViewType(I)I': () => 0, 'getViewTypeCount()I': () => 1, 'areAllItemsEnabled()Z': () => 1, 'isEnabled(I)Z': () => 1,
      'getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': () => null,
      'getDropDownView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': (s, i, cv, p) => R.iv('Landroid/widget/BaseAdapter;->getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;', s, i, cv, p),
      'setDropDownViewResource(I)V': (s, id) => { s.$dropRes = id | 0; },
    },
  });
  const BOOL0 = (b) => (b ? 1 : 0);
  R.def('Landroid/widget/ArrayAdapter;', {
    access: 0x21, sup: 'Landroid/widget/BaseAdapter;',
    m: {
      '<init>(Landroid/content/Context;I)V': (s, c, res) => { s.$items = []; s.$res = res | 0; s.$ctx = c; },
      '<init>(Landroid/content/Context;II)V': (s, c, res, tv) => { s.$items = []; s.$res = res | 0; s.$textRes = tv | 0; s.$ctx = c; },
      '<init>(Landroid/content/Context;I[Ljava/lang/Object;)V': (s, c, res, items) => { s.$items = (items || []).slice(); s.$res = res | 0; s.$ctx = c; },
      '<init>(Landroid/content/Context;II[Ljava/lang/Object;)V': (s, c, res, tv, items) => { s.$items = (items || []).slice(); s.$res = res | 0; s.$textRes = tv | 0; s.$ctx = c; },
      '<init>(Landroid/content/Context;ILjava/util/List;)V': (s, c, res, list) => { s.$items = (list && list.$a ? list.$a : []).slice(); s.$res = res | 0; s.$ctx = c; },
      '<init>(Landroid/content/Context;IILjava/util/List;)V': (s, c, res, tv, list) => { s.$items = (list && list.$a ? list.$a : []).slice(); s.$res = res | 0; s.$textRes = tv | 0; s.$ctx = c; },
      'add(Ljava/lang/Object;)V': (s, o) => { s.$items.push(o); if (s.$boundTo) D.refreshAdapters(s); },
      'addAll([Ljava/lang/Object;)V': (s, a) => { for (const x of a || []) s.$items.push(x); if (s.$boundTo) D.refreshAdapters(s); },
      'addAll(Ljava/util/Collection;)V': (s, c) => { for (const x of (c && c.$a) || []) s.$items.push(x); if (s.$boundTo) D.refreshAdapters(s); },
      'insert(Ljava/lang/Object;I)V': (s, o, i) => { s.$items.splice(i, 0, o); if (s.$boundTo) D.refreshAdapters(s); },
      'remove(Ljava/lang/Object;)V': (s, o) => { const i = s.$items.indexOf(o); if (i >= 0) s.$items.splice(i, 1); if (s.$boundTo) D.refreshAdapters(s); },
      'clear()V': (s) => { s.$items.length = 0; if (s.$boundTo) D.refreshAdapters(s); },
      'getCount()I': (s) => s.$items.length,
      'getItem(I)Ljava/lang/Object;': (s, i) => (s.$items[i | 0] === undefined ? null : s.$items[i | 0]),
      'getPosition(Ljava/lang/Object;)I': (s, o) => s.$items.indexOf(o),
      'setDropDownViewResource(I)V': (s, id) => { s.$dropRes = id | 0; },
      'getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': (s, i, cv, p) => D.adapterDefaultView(R, s, i | 0, cv, p),
      'getDropDownView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;': (s, i, cv, p) => D.adapterDefaultView(R, s, i | 0, cv, p),
      'setNotifyOnChange(Z)V': () => {},
      'notifyDataSetChanged()V': (s) => { if (s.$boundTo) D.refreshAdapters(s); },
      'sort(Ljava/util/Comparator;)V': (s, c) => { s.$items.sort((a, b) => R.iv('Ljava/util/Comparator;->compare(Ljava/lang/Object;Ljava/lang/Object;)I', c, a, b)); },
    },
    sm: {
      'createFromResource(Landroid/content/Context;II)Landroid/widget/ArrayAdapter;': (c, arrRes, tvRes) => {
        const items = H.resStringArray(arrRes | 0) || [];
        const o = { $c: R.klass('Landroid/widget/ArrayAdapter;'), $items: items.slice(), $res: arrRes | 0, $textRes: tvRes | 0, $ctx: c };
        return o;
      },
    },
  });
  R.def('Landroid/widget/SimpleAdapter;', { access: 0x21, sup: 'Landroid/widget/BaseAdapter;', m: { '<init>(Landroid/content/Context;Ljava/util/List;I[Ljava/lang/String;[I)V': (s, c, data, res, from, to) => { s.$data = (data && data.$a) || []; s.$from = from || []; s.$to = to || []; s.$res = res; } , 'getCount()I': (s) => s.$data.length, 'getItem(I)Ljava/lang/Object;': (s, i) => s.$data[i | 0] } });
  R.def('Landroid/widget/SimpleCursorAdapter;', { access: 0x21, sup: 'Landroid/widget/BaseAdapter;' });
  R.def('Landroid/widget/ListView;', {
    access: 0x21, sup: 'Landroid/widget/AbsListView;',
    m: Object.assign({}, viewMethods, groupInit('ListView'), {
      'setAdapter(Landroid/widget/ListAdapter;)V': (s, a) => D.setListAdapter(s, a),
      'getAdapter()Landroid/widget/ListAdapter;': (s) => s.$adapter || null,
      'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (s, l) => { s.$onItemClick = l; },
      'setOnItemLongClickListener(Landroid/widget/AdapterView$OnItemLongClickListener;)V': (s, l) => { s.$onItemLongClick = l; },
      'addHeaderView(Landroid/view/View;)V': (s, v) => { s.$headers = s.$headers || []; s.$headers.push(v); D.relayout(s); },
      'addFooterView(Landroid/view/View;)V': (s, v) => { s.$footers = s.$footers || []; s.$footers.push(v); D.relayout(s); },
      'setSelection(I)V': () => {}, 'setDivider(Landroid/graphics/drawable/Drawable;)V': () => {},
      'setDividerHeight(I)V': () => {}, 'setChoiceMode(I)V': () => {},
      'setEmptyView(Landroid/view/View;)V': () => {},
    }),
  });
  R.def('Landroid/widget/GridView;', { access: 0x21, sup: 'Landroid/widget/AbsListView;', m: Object.assign({}, viewMethods, groupInit('GridView'), { 'setAdapter(Landroid/widget/ListAdapter;)V': (s, a) => D.setListAdapter(s, a, true), 'setNumColumns(I)V': (s, n) => { s.$cols = n | 0; D.relayout(s); }, 'setOnItemClickListener(Landroid/widget/AdapterView$OnItemClickListener;)V': (s, l) => { s.$onItemClick = l; } }) });
  R.def('Landroid/widget/AbsListView;', { access: 0x421, sup: 'Landroid/widget/AdapterView;' });
  R.def('Landroid/widget/AdapterView$OnItemClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/AdapterView$OnItemLongClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/ExpandableListView;', { access: 0x21, sup: 'Landroid/widget/ListView;' });
  R.def('Landroid/widget/Space;', { access: 0x21, sup: 'Landroid/view/View;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Space'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'Space'); } } });
  R.def('Landroid/widget/ViewStub;', { access: 0x31, sup: 'Landroid/view/View;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ViewStub'); }, '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'ViewStub'); }, 'inflate()Landroid/view/View;': (s) => D.inflateStub(s), 'setVisibility(I)V': (s, v) => { if (v === VISIBLE) D.inflateStub(s); else D.applyVisibility(s); }, 'setLayoutResource(I)V': (s, id) => { s.$layoutRes = id | 0; } } });
  R.def('Landroid/widget/DatePicker;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: Object.assign(groupInit('FrameLayout'), { 'getYear()I': () => new Date().getFullYear(), 'getMonth()I': () => new Date().getMonth(), 'getDayOfMonth()I': () => new Date().getDate(), 'init(IIILandroid/widget/DatePicker$OnDateChangedListener;)V': () => {} }) });
  R.def('Landroid/widget/DatePicker$OnDateChangedListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/TimePicker;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: Object.assign(groupInit('FrameLayout'), { 'getCurrentHour()Ljava/lang/Integer;': () => R.box('Ljava/lang/Integer;', new Date().getHours()), 'getCurrentMinute()Ljava/lang/Integer;': () => R.box('Ljava/lang/Integer;', new Date().getMinutes()) }) });
  R.def('Landroid/widget/Chronometer;', { access: 0x21, sup: 'Landroid/widget/TextView;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'TextView'); }, 'start()V': (s) => D.chronometerStart(s), 'stop()V': (s) => D.chronometerStop(s), 'setBase(J)V': (s, b) => { s.$base = Number(b); } } });
  R.def('Landroid/widget/AnalogClock;', { access: 0x21, sup: 'Landroid/view/View;', m: groupInit('View') });
  R.def('Landroid/widget/TextClock;', { access: 0x21, sup: 'Landroid/widget/TextView;', m: { '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'TextView'); } } });
  R.def('Landroid/widget/NumberPicker;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: Object.assign(groupInit('LinearLayout'), { 'setMinValue(I)V': (s, v) => { s.$min = v | 0; }, 'setMaxValue(I)V': (s, v) => { s.$max = v | 0; D.numberPicker(s); }, 'setValue(I)V': (s, v) => { s.$val = v | 0; D.numberPicker(s); }, 'getValue()I': (s) => s.$val || 0, 'setDisplayedValues([Ljava/lang/String;)V': (s, a) => { s.$labels = a; D.numberPicker(s); }, 'setOnValueChangeListener(Landroid/widget/NumberPicker$OnValueChangeListener;)V': () => {} }) });
  R.def('Landroid/widget/NumberPicker$OnValueChangeListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/SlidingDrawer;', { access: 0x21, sup: 'Landroid/view/ViewGroup;', m: groupInit('ViewGroup') });
  R.def('Landroid/widget/TabHost;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: groupInit('FrameLayout') });
  R.def('Landroid/widget/ZoomControls;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: groupInit('LinearLayout') });
  R.def('Landroid/widget/CalendarView;', { access: 0x21, sup: 'Landroid/widget/FrameLayout;', m: groupInit('FrameLayout') });
  R.def('Landroid/widget/VideoView;', { access: 0x21, sup: 'Landroid/view/SurfaceView;', m: Object.assign(groupInit('SurfaceView'), { 'setVideoURI(Landroid/net/Uri;)V': (s, u) => { s.$url = u && u.$u; }, 'setVideoPath(Ljava/lang/String;)V': (s, p) => { s.$url = p; }, 'start()V': (s) => H.mediaPlay(s.$url), 'pause()V': () => H.mediaPause(), 'stopPlayback()V': () => H.mediaPause(), 'setOnPreparedListener(Landroid/media/MediaPlayer$OnPreparedListener;)V': () => {}, 'setOnCompletionListener(Landroid/media/MediaPlayer$OnCompletionListener;)V': () => {}, 'getDuration()I': () => H.mediaDuration(), 'getCurrentPosition()I': () => H.mediaPosition(), 'seekTo(I)V': (s, p) => H.mediaSeek(p) }) });
  R.def('Landroid/widget/SearchView;', { access: 0x21, sup: 'Landroid/widget/LinearLayout;', m: Object.assign(groupInit('LinearLayout'), { 'setQuery(Ljava/lang/CharSequence;Z)V': (s, q) => { s.$q = txt(q); }, 'getQuery()Ljava/lang/CharSequence;': (s) => s.$q || '', 'setOnQueryTextListener(Landroid/widget/SearchView$OnQueryTextListener;)V': (s, l) => { s.$onQuery = l; D.bindSearch(s); }, 'setIconified(Z)V': () => {}, 'setIconifiedByDefault(Z)V': () => {}, 'setQueryHint(Ljava/lang/CharSequence;)V': () => {} }) });
  R.def('Landroid/widget/SearchView$OnQueryTextListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/PopupMenu;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { '<init>(Landroid/content/Context;Landroid/view/View;)V': (s) => { s.$menu = { $c: R.klass('Landroid/view/Menu;') }; }, 'getMenu()Landroid/view/Menu;': (s) => s.$menu, 'inflate(I)V': (s, id) => H.inflateMenu(id | 0, s.$menu), 'show()V': (s) => H.showPopup(s), 'setOnMenuItemClickListener(Landroid/widget/PopupMenu$OnMenuItemClickListener;)V': (s, l) => { s.$listener = l; } } });
  R.def('Landroid/widget/PopupMenu$OnMenuItemClickListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/widget/PopupWindow;', { access: 0x21, sup: 'Ljava/lang/Object;', m: { '<init>()V': () => {}, '<init>(Landroid/view/View;II)V': (s, v) => { s.$v = v; }, '<init>(Landroid/content/Context;)V': () => {}, 'showAsDropDown(Landroid/view/View;)V': (s, a) => H.showPopupAt(s, a), 'showAtLocation(Landroid/view/View;III)V': (s, a) => H.showPopupAt(s, a), 'dismiss()V': () => H.dismissPopup(), 'setContentView(Landroid/view/View;)V': (s, v) => { s.$v = v; }, 'setFocusable(Z)V': () => {}, 'setOutsideTouchable(Z)V': () => {}, 'setWidth(I)V': () => {}, 'setHeight(I)V': () => {} } });
  R.def('Landroid/app/DatePickerDialog;', { access: 0x21, sup: 'Landroid/app/AlertDialog;', m: { '<init>(Landroid/content/Context;Landroid/app/DatePickerDialog$OnDateSetListener;III)V': (s, c, l, y, m, d) => { s.$kind = 'date'; s.$title = 'Select date'; s.$listener = l; s.$y = y; s.$m = m; s.$d = d; } } });
  R.def('Landroid/app/DatePickerDialog$OnDateSetListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });
  R.def('Landroid/app/TimePickerDialog;', { access: 0x21, sup: 'Landroid/app/AlertDialog;', m: { '<init>(Landroid/content/Context;Landroid/app/TimePickerDialog$OnTimeSetListener;IIZ)V': (s, c, l, h, m) => { s.$kind = 'time'; s.$title = 'Select time'; s.$listener = l; } } });
  R.def('Landroid/app/TimePickerDialog$OnTimeSetListener;', { access: 0x601, sup: 'Ljava/lang/Object;' });

  /* ---------- SurfaceView / custom draw views ---------- */
  R.def('Landroid/view/SurfaceView;', {
    access: 0x21, sup: 'Landroid/view/View;',
    m: Object.assign({}, viewMethods, {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SurfaceView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SurfaceView'); },
      'getHolder()Landroid/view/SurfaceHolder;': (s) => s.$holder || (s.$holder = { $c: R.klass('Landroid/view/SurfaceHolder;'), $view: s }),
      'setZOrderOnTop(Z)V': () => {}, 'setZOrderMediaOverlay(Z)V': () => {},
    }),
  });
  R.def('Landroid/opengl/GLSurfaceView;', {
    access: 0x21, sup: 'Landroid/view/SurfaceView;',
    m: Object.assign({}, viewMethods, {
      '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SurfaceView'); },
      '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; D.ensureView(s, 'SurfaceView'); },
      'setRenderer(Landroid/opengl/GLSurfaceView$Renderer;)V': (s, r) => { s.$renderer = r; H.startGLRenderer(s, r); },
      'setRenderMode(I)V': (s, m) => { s.$renderMode = m | 0; },
      'requestRender()V': (s) => H.glRender(s),
      'queueEvent(Ljava/lang/Runnable;)V': (s, r) => H.post(() => D.runSafe(r)),
      'setEGLContextClientVersion(I)V': () => {},
      'onPause()V': () => H.stopGLRenderer(s), 'onResume()V': () => { if (s.$renderer) H.startGLRenderer(s, s.$renderer); },
      'getHolder()Landroid/view/SurfaceHolder;': (s) => s.$holder || (s.$holder = { $c: R.klass('Landroid/view/SurfaceHolder;'), $view: s }),
    }),
  });

  /* ---------- fragments ---------- */
  R.def('Landroid/app/Fragment;', {
    access: 0x21, sup: 'Ljava/lang/Object;',
    m: {
      '<init>()V': () => {},
      'onCreate(Landroid/os/Bundle;)V': () => {},
      'onCreateView(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;': () => null,
      'onViewCreated(Landroid/view/View;Landroid/os/Bundle;)V': () => {},
      'onStart()V': () => {}, 'onResume()V': () => {}, 'onPause()V': () => {}, 'onStop()V': () => {}, 'onDestroy()V': () => {}, 'onDestroyView()V': () => {},
      'onAttach(Landroid/app/Activity;)V': () => {}, 'onDetach()V': () => {},
      'onSaveInstanceState(Landroid/os/Bundle;)V': () => {},
      'getActivity()Landroid/app/Activity;': (s) => s.$activity || null,
      'getContext()Landroid/content/Context;': (s) => s.$activity || null,
      'getView()Landroid/view/View;': (s) => s.$view || null,
      'getArguments()Landroid/os/Bundle;': (s) => s.$args || null,
      'setArguments(Landroid/os/Bundle;)V': (s, b) => { s.$args = b; },
      'getResources()Landroid/content/res/Resources;': () => H.resources(),
      'getString(I)Ljava/lang/String;': (s, id) => H.resString(id | 0),
      'getFragmentManager()Landroid/app/FragmentManager;': (s) => (s.$activity ? R.iv('Landroid/app/Activity;->getFragmentManager()Landroid/app/FragmentManager;', s.$activity) : null),
      'isAdded()Z': (s) => BOOL0(!!s.$activity),
      'isVisible()Z': () => 1,
      'getLayoutInflater(Landroid/os/Bundle;)Landroid/view/LayoutInflater;': () => H.layoutInflater(H.currentActivity()),
      'startActivity(Landroid/content/Intent;)V': (s, i) => H.startActivity(i),
      'setRetainInstance(Z)V': () => {},
      'requestPermissions([Ljava/lang/String;I)V': () => {},
      'getLifecycle()Landroidx/lifecycle/Lifecycle;': () => ({ $c: R.klass('Landroidx/lifecycle/Lifecycle;') }),
      'requireActivity()Landroidx/fragment/app/FragmentActivity;': (s) => s.$activity || null,
      'requireContext()Landroid/content/Context;': (s) => s.$activity || null,
      'requireView()Landroid/view/View;': (s) => s.$view || null,
      'requireArguments()Landroid/os/Bundle;': (s) => s.$args || { $c: R.klass('Landroid/os/Bundle;'), $m: new Map() },
    },
  });
  R.def('Landroidx/fragment/app/Fragment;', { access: 0x21, sup: 'Landroid/app/Fragment;', m: { 'getChildFragmentManager()Landroidx/fragment/app/FragmentManager;': () => ({ $c: R.klass('Landroidx/fragment/app/FragmentManager;') }), 'getParentFragment()Landroidx/fragment/app/Fragment;': () => null } });

  /* ---------- appcompat widget aliases ---------- */
  const aliases = [
    ['Landroidx/appcompat/widget/AppCompatTextView;', 'Landroid/widget/TextView;', 'TextView'],
    ['Landroidx/appcompat/widget/AppCompatButton;', 'Landroid/widget/Button;', 'Button'],
    ['Landroidx/appcompat/widget/AppCompatEditText;', 'Landroid/widget/EditText;', 'EditText'],
    ['Landroidx/appcompat/widget/AppCompatImageView;', 'Landroid/widget/ImageView;', 'ImageView'],
    ['Landroidx/appcompat/widget/AppCompatCheckBox;', 'Landroid/widget/CheckBox;', 'CheckBox'],
    ['Landroidx/appcompat/widget/AppCompatRadioButton;', 'Landroid/widget/RadioButton;', 'RadioButton'],
    ['Landroidx/appcompat/widget/AppCompatSeekBar;', 'Landroid/widget/SeekBar;', 'SeekBar'],
    ['Landroidx/appcompat/widget/AppCompatSpinner;', 'Landroid/widget/Spinner;', 'Spinner'],
    ['Landroidx/appcompat/widget/AppCompatAutoCompleteTextView;', 'Landroid/widget/AutoCompleteTextView;', 'EditText'],
    ['Landroidx/appcompat/widget/AppCompatMultiAutoCompleteTextView;', 'Landroid/widget/MultiAutoCompleteTextView;', 'EditText'],
    ['Landroid/widget/MaterialButton;', 'Landroid/widget/Button;', 'Button'],
  ];
  for (const [desc, sup, kind] of aliases) {
    R.def(desc, {
      access: 0x21, sup,
      m: {
        '<init>(Landroid/content/Context;)V': (s, c) => { s.$ctx = c; s.$children = s.$children || []; D.ensureView(s, kind); },
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;)V': (s, c) => { s.$ctx = c; s.$children = s.$children || []; D.ensureView(s, kind); },
        '<init>(Landroid/content/Context;Landroid/util/AttributeSet;I)V': (s, c) => { s.$ctx = c; s.$children = s.$children || []; D.ensureView(s, kind); },
      },
    });
  }

  return { cssColor, txt };
}

/* ================================================================== */
/*  Renderer: the DOM side of the view system                          */
/* ================================================================== */
export class Renderer {
  constructor(R, host, screenEl) {
    this.R = R;
    this.host = host;
    this.screen = screenEl;
    this.contentEl = null;
    this.density = 1;
    this._anims = new Map();
    this._chronos = new Map();
    this.scale = 1;
  }

  get log() { return this.host.log.bind(this.host); }
  runSafe(runnable) {
    if (!runnable) return;
    try { this.R.iv('Ljava/lang/Runnable;->run()V', runnable); }
    catch (e) { this.host.crash(e); }
  }

  /* ---------- element construction ---------- */
  elementFor(kind) {
    switch (kind) {
      case 'EditText': { const e = document.createElement('textarea'); e.rows = 1; return e; }
      case 'SeekBar': { const e = document.createElement('input'); e.type = 'range'; return e; }
      case 'CheckBox': case 'RadioButton': case 'Switch': case 'ToggleButton': {
        const w = document.createElement('label'); w.className = 'av-compound';
        const i = document.createElement('input'); i.type = kind === 'RadioButton' ? 'radio' : 'checkbox';
        const t = document.createElement('span'); t.className = 'av-compound-text';
        w.appendChild(i); w.appendChild(t); w._input = i; w._label = t;
        return w;
      }
      case 'SurfaceView': return document.createElement('canvas');
      case 'WebView': { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups'); return f; }
      case 'ProgressBar': { const w = document.createElement('div'); w.className = 'av-progress'; const b = document.createElement('div'); b.className = 'av-progress-bar'; w.appendChild(b); w._bar = b; return w; }
      case 'Spinner': { const w = document.createElement('select'); w.className = 'av-spinner'; return w; }
      case 'ImageView': case 'ImageButton': return document.createElement('img');
      default: return document.createElement('div');
    }
  }

  /** Make sure the view has a DOM element of the right kind. */
  ensureView(v, kind) {
    if (!v) return;
    if (v.$el) {
      if (v.$kind === kind) return;
      // Never downgrade an element that is already more specific than the
      // generic View / ViewGroup request coming from a superclass constructor.
      if (kind === 'View' || kind === 'ViewGroup') {
        if (!v.$children) v.$children = [];
        return;
      }
    }
    const e = this.elementFor(kind);
    e.className = `av av-${kind}`;
    const oldEl = v.$el;
    v.$el = e;
    v.$kind = kind;
    e.__view = v;
    if (!v.$children) v.$children = [];
    if (oldEl && oldEl.parentNode) oldEl.parentNode.replaceChild(e, oldEl);
    for (const c of v.$children) if (c && c.$el) e.appendChild(c.$el);
    this.applyBase(v);
    if (kind === 'EditText') this.applyEditable(v);
    if (kind === 'SeekBar') this.bindSeek(v);
    if (kind === 'CheckBox' || kind === 'RadioButton' || kind === 'Switch' || kind === 'ToggleButton') this.bindCompound(v);
    this.applyClickable(v);
    if (this.needsDrawPass(v)) this.setupDraw(v);
    return e;
  }

  applyEditable(v) {
    const e = v.$el;
    if (!e || e.__editBound) return;
    e.__editBound = true;
    e.addEventListener('input', () => {
      v.$text = e.value;
      for (const w of (v.$watchers || [])) {
        try {
          this.R.iv('Landroid/text/TextWatcher;->onTextChanged(Ljava/lang/CharSequence;III)V', w, e.value, 0, 0, 0);
          this.R.iv('Landroid/text/TextWatcher;->afterTextChanged(Landroid/text/Editable;)V', w, this.editable(v));
        } catch (err) { this.host.crash(err); }
      }
    });
    e.addEventListener('focus', () => { for (const w of (v.$watchers || [])) { try { this.R.iv('Landroid/text/TextWatcher;->beforeTextChanged(Ljava/lang/CharSequence;III)V', w, e.value, 0, 0, 0); } catch {} } });
    e.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && v.$editorAction) {
        ev.preventDefault();
        try { this.R.iv('Landroid/widget/TextView$OnEditorActionListener;->onEditorAction(Landroid/widget/TextView;ILandroid/view/KeyEvent;)Z', v.$editorAction, v, 6, null); }
        catch (err) { this.host.crash(err); }
      }
    });
  }

  applyBase(v) {
    const e = v.$el; if (!e) return;
    if (v.$id !== undefined) e.dataset.id = String(v.$id);
    e.style.boxSizing = 'border-box';
    if (this.isTextKind(v.$kind)) {
      e.style.color = v.$color === undefined ? '' : argbToCss(v.$color, TYPE.INT_COLOR_ARGB8);
      e.style.fontSize = (v.$size === undefined ? 14 : v.$size) + 'px';
      if (v.$text !== undefined) e.textContent = v.$text;
    }
    if (v.$children) for (const c of v.$children) if (c && c.$el && c.$el.parentNode !== e) e.appendChild(c.$el);
    this.applyLayoutParams(v);
    this.applyBackground(v);
    this.applyVisibility(v);
    this.applyEnabled(v);
  }
  isTextKind(k) { return k === 'TextView' || k === 'Button' || k === 'EditText' || k === 'CheckBox' || k === 'RadioButton' || k === 'Switch' || k === 'ToggleButton'; }

  textNode(v) {
    if (!v.$el) return null;
    if (v.$kind === 'EditText') return v.$el;
    if (v.$el._label) return v.$el._label;
    return v.$el;
  }
  editableEl(v) { return v.$el; }
  editable(v) {
    const R = this.R;
    const c = R.klass('Landroid/text/Editable;');
    const self = this;
    return {
      $c: c,
      toString() { return String((v.$el && v.$el.value !== undefined) ? v.$el.value : (v.$text || '')); },
      length() { return this.toString().length; },
    };
  }

  setText(v, s) {
    v.$text = s;
    if (!v.$el) return;
    const html = (s && typeof s === 'object' && s.$html !== undefined) ? s.$html : null;
    const plain = html !== null ? s.$t : s;
    if (v.$kind === 'EditText') { if (v.$el.value !== plain) v.$el.value = plain; }
    else if (v.$el._label) { if (html !== null) v.$el._label.innerHTML = sanitizeHtml(html); else v.$el._label.textContent = plain; }
    else if (this.isTextKind(v.$kind)) { if (html !== null) v.$el.innerHTML = sanitizeHtml(html); else v.$el.textContent = plain; }
  }
  getText(v) {
    if (v.$kind === 'EditText' && v.$el) return v.$el.value;
    return v.$text === undefined ? '' : v.$text;
  }
  refreshText(v) {
    const t = this.getText(v);
    const tr = v.$transform && v.$transform.$password ? '•'.repeat(t.length) : t;
    if (v.$el && this.isTextKind(v.$kind) && v.$kind !== 'EditText') {
      if (v.$el._label) v.$el._label.textContent = tr; else v.$el.textContent = tr;
    }
  }
  setHint(v, s) { v.$hint = s; if (v.$el) { if (v.$kind === 'EditText') v.$el.placeholder = s; else v.$el.title = s; } }
  setError(v, s) { v.$error = s; if (v.$el) v.$el.classList.toggle('av-error', !!s); if (s) this.host.toast(s, 0); }
  setTextColor(v, c) { v.$color = c; if (v.$el) { const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el); t.style.color = argbToCss(c, TYPE.INT_COLOR_ARGB8); } }
  setTextSize(v, px) { v.$size = px; if (v.$el) { const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el); t.style.fontSize = px + 'px'; } }
  applyTextStyle(v) {
    if (!v.$el) return;
    const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el);
    const st = v.$style || v.$textStyle || 0;
    t.style.fontWeight = (st & 1) ? 'bold' : '';
    t.style.fontStyle = (st & 2) ? 'italic' : '';
    t.style.textTransform = v.$caps ? 'uppercase' : '';
    this.refreshText(v);
  }
  setLines(v, min, max) {
    v.$minLines = min; v.$maxLines = max;
    if (!v.$el) return;
    const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el);
    if (max === 1) { t.style.whiteSpace = 'nowrap'; t.style.overflow = 'hidden'; t.style.textOverflow = 'ellipsis'; }
    else { t.style.whiteSpace = ''; t.style.overflow = ''; t.style.webkitLineClamp = max ? String(max) : ''; }
    if (v.$kind === 'EditText') { if (min) v.$el.rows = min; }
  }
  setLineSpacing(v, add, mult) { if (v.$el) { const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el); t.style.lineHeight = mult ? String(mult) : ''; } }
  setEllipsize(v, t) { v.$ellipsize = t; }
  setInputType(v, t) {
    v.$inputType = t;
    if (v.$el && v.$kind === 'EditText') {
      const isPassword = !!(t & 0x121) || !!(t & 0x80) || !!(t & 0x100);
      if (isPassword && v.$el.type !== 'password') { v.$el.type = 'password'; }
      else if ((t & 0xf) === 2 && v.$el.type !== 'number') { v.$el.type = 'number'; }
    }
  }

  setGravity(v, g) {
    v.$gravity = g;
    if (!v.$el) return;
    const t = v.$kind === 'EditText' ? v.$el : (v.$el._label || v.$el);
    const h = gravityText(g), vv = gravityVertText(g);
    t.style.textAlign = h || '';
    if (this.isTextKind(v.$kind)) {
      v.$el.style.display = 'flex';
      v.$el.style.alignItems = vv === 'center' ? 'center' : vv === 'flex-end' ? 'flex-end' : vv === 'flex-start' ? 'flex-start' : '';
      if (v.$kind !== 'EditText') { v.$el.style.justifyContent = h === 'center' ? 'center' : h === 'right' ? 'flex-end' : h === 'left' ? 'flex-start' : ''; }
      else v.$el.style.textAlign = h || '';
    }
  }
  setGroupGravity(v, g) {
    v.$groupGravity = g;
    if (!v.$el) return;
    const mh = gravityMain(g, false), mv = gravityMain(g, true);
    const vertical = v.$orientation === 1;
    v.$el.style.justifyContent = (vertical ? mv : mh) === 'stretch' ? '' : (vertical ? mv : mh) || '';
    v.$el.style.alignItems = (vertical ? mh : mv) === 'stretch' ? 'stretch' : (vertical ? mh : mv) || '';
  }
  setOrientation(v, o) {
    v.$orientation = o;
    if (v.$el) v.$el.style.flexDirection = o === 1 ? 'column' : 'row';
    this.setGroupGravity(v, v.$groupGravity || 0);
  }

  /* ---------- layout params ---------- */
  makeLayoutParams(R, w, h) {
    const c = R.klass('Landroid/widget/LinearLayout$LayoutParams;');
    return { $c: c, $w: w === undefined ? -2 : w, $h: h === undefined ? -2 : h, $weight: 0 };
  }
  applyLayoutParams(v) {
    const e = v.$el; if (!e) return;
    const lp = v.$lp;
    const w = lp ? lp.$w : undefined;
    const h = lp ? lp.$h : undefined;
    const weight = lp ? (lp.$weight || 0) : 0;
    const verticalParent = v.$parent && v.$parent.$orientation === 1;
    const flexParent = v.$parent && (v.$parent.$kind === 'LinearLayout' || v.$parent.$kind === 'RadioGroup' || v.$parent.$kind === 'TableRow');
    // Inside a flex column/row, match_parent must stretch rather than take
    // 100% of the parent box (otherwise margins push the child outside).
    if (w === MATCH_PARENT) {
      if (flexParent && verticalParent) { e.style.width = 'auto'; e.style.alignSelf = 'stretch'; }
      else { e.style.width = '100%'; }
    }
    else if (w === WRAP_CONTENT || w === undefined) e.style.width = '';
    else e.style.width = (w * this.density) + 'px';
    if (h === MATCH_PARENT) {
      if (flexParent && !verticalParent) { e.style.height = 'auto'; e.style.alignSelf = 'stretch'; }
      else { e.style.height = '100%'; }
    }
    else if (h === WRAP_CONTENT || h === undefined) e.style.height = '';
    else e.style.height = (h * this.density) + 'px';
    if (weight) { e.style.flexGrow = String(weight); e.style.flexBasis = (verticalParent ? '0%' : '0px'); if (verticalParent) e.style.height = '0'; else e.style.width = '0'; }
    else { e.style.flexGrow = ''; e.style.flexBasis = ''; }
    if (lp && lp.$gravity !== undefined) e.style.alignSelf = this.selfAlign(lp.$gravity, verticalParent);
    if (lp && lp.$m) { const m = lp.$m; e.style.margin = `${m[1]}px ${m[2]}px ${m[3]}px ${m[0]}px`; }
    else if (v.$margin) { const m = v.$margin; e.style.margin = `${m[1]}px ${m[2]}px ${m[3]}px ${m[0]}px`; }
  }
  selfAlign(g, verticalParent) {
    const mh = gravityMain(g, false), mv = gravityMain(g, true);
    const cross = verticalParent ? mh : mv;
    return cross === 'stretch' ? 'stretch' : cross || '';
  }

  applyVisibility(v) {
    const e = v.$el; if (!e) return;
    const vis = v.$vis === undefined ? VISIBLE : v.$vis;
    e.style.display = vis === GONE ? 'none' : (e.__display || '');
    if (vis === INVISIBLE) e.style.visibility = 'hidden'; else e.style.visibility = '';
  }
  applyEnabled(v) {
    const e = v.$el; if (!e) return;
    const on = v.$enabled === undefined || v.$enabled;
    e.classList.toggle('av-disabled', !on);
    if (e.disabled !== undefined) e.disabled = !on;
    if (e._input) e._input.disabled = !on;
  }
  applySelected(v) { if (v.$el) v.$el.classList.toggle('av-selected', !!v.$selected); }
  applyBackground(v) {
    const e = v.$el; if (!e) return;
    if (v.$bg !== undefined) e.style.backgroundColor = argbToCss(v.$bg, TYPE.INT_COLOR_ARGB8);
  }
  applyDrawableBg(v) {
    const e = v.$el; if (!e) return;
    let d = v.$bgDrawable;
    if (d && d.$ninePatch) {
      e.style.borderImage = `url("${d.$uri}") 1 fill / 2px stretch`;
      e.style.backgroundImage = '';
      return;
    }
    e.style.borderImage = '';
    if (d && d.$selector && this.host && this.host.selectorFor) d = this.host.selectorFor(d, v) || d.$fallback;
    if (!d) { e.style.backgroundImage = ''; if (v.$bgDrawable && v.$bgDrawable.$selector) e.style.backgroundColor = ''; return; }
    if (d.$color !== undefined) e.style.backgroundColor = argbToCss(d.$color, TYPE.INT_COLOR_ARGB8);
    // Android draws a background drawable stretched to the view bounds.
    if (d.$uri || d.$svg) {
      e.style.backgroundRepeat = 'no-repeat';
      e.style.backgroundPosition = 'center';
      e.style.backgroundSize = '100% 100%';
    }
    if (d.$uri) e.style.backgroundImage = `url("${d.$uri}")`;
    if (d.$svg) { e.style.backgroundImage = `url("${svgUri(d.$svg)}")`; }
    if (d.$radius) e.style.borderRadius = d.$radius + 'px';
  }
  applyResourceBg(v) {
    const e = v.$el; if (!e) return;
    if (v.$bgRes === 0) { e.style.backgroundImage = ''; e.style.backgroundColor = ''; return; }
    const d = this.host.resDrawable(v.$bgRes);
    if (!d) return;
    v.$bgDrawable = d;
    this.applyDrawableBg(v);
  }
  applyPadding(v, l, t, r, b) {
    v.$pad = [l, t, r, b];
    if (v.$el) v.$el.style.padding = `${t}px ${r}px ${b}px ${l}px`;
  }
  applyTransform(v) {
    const e = v.$el; if (!e) return;
    const parts = [];
    if (v.$tx) parts.push(`translateX(${v.$tx}px)`);
    if (v.$ty) parts.push(`translateY(${v.$ty}px)`);
    if (v.$sx !== undefined && v.$sx !== 1) parts.push(`scaleX(${v.$sx})`);
    if (v.$sy !== undefined && v.$sy !== 1) parts.push(`scaleY(${v.$sy})`);
    if (v.$rot) parts.push(`rotate(${v.$rot}deg)`);
    e.style.transform = parts.join(' ');
  }
  applyImageFit(v) {
    const e = v.$el; if (!e) return;
    const st = v.$scaleType ? v.$scaleType.$name : null;
    e.style.objectFit = ({ FIT_XY: 'fill', CENTER_CROP: 'cover', CENTER_INSIDE: 'contain', FIT_CENTER: 'contain', FIT_START: 'contain', FIT_END: 'contain', CENTER: 'none' })[st] || 'contain';
  }
  applyClickable(v) {
    const e = v.$el; if (!e) return;
    if (v.$onClick || v.$clickable) { e.classList.add('av-clickable'); if (!e.__clickBound) { e.__clickBound = true; e.addEventListener('click', (ev) => { ev.stopPropagation(); this.fireClick(v); }); } }
    else e.classList.remove('av-clickable');
    if (v.$onTouch && !e.__touchBound) { e.__touchBound = true; this.bindTouch(v, e); }
  }
  applyTouch(v) {
    const e = v.$el; if (!e || e.__touchBound) return;
    e.__touchBound = true; this.bindTouch(v, e);
  }
  bindTouch(v, e) {
    const pointers = new Map();
    const mk = (action, ev, pointerId = 0) => {
      const r = e.getBoundingClientRect();
      const c = this.R.klass('Landroid/view/MotionEvent;');
      const pts = [];
      for (const [id, p] of pointers) pts.push({ id, x: (p.clientX - r.left) / this.scale, y: (p.clientY - r.top) / this.scale });
      if (!pts.some((p) => p.id === pointerId)) pts.push({ id: pointerId, x: (ev.clientX - r.left) / this.scale, y: (ev.clientY - r.top) / this.scale });
      const me = {
        $c: c, $action: action | (pointerId << 8), $pointerIndex: 0,
        $x: (ev.clientX - r.left) / this.scale, $y: (ev.clientY - r.top) / this.scale,
        $rx: ev.clientX / this.scale, $ry: ev.clientY / this.scale,
        $pointers: pts,
      };
      return me;
    };
    let down = null;
    const setPressed = (on) => {
      if (!!v.$pressed === !!on) return;
      v.$pressed = !!on;
      if (v.$el) v.$el.classList.toggle('av-pressed', !!on);
      if (v.$bgDrawable && v.$bgDrawable.$selector) this.applyDrawableBg(v);
      if (v.$drawable && v.$drawable.$selector) this.applyImageSrc(v);
    };
    const send = (action, ev) => {
      if (!v.$onTouch) return false;
      try { return !!this.R.iv('Landroid/view/View$OnTouchListener;->onTouch(Landroid/view/View;Landroid/view/MotionEvent;)Z', v.$onTouch, v, mk(action, ev)); }
      catch (err) { this.host.crash(err); return false; }
    };
    const pt = (ev) => (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
    e.addEventListener('pointerdown', (ev) => {
      pointers.set(ev.pointerId, ev);
      down = pt(ev);
      setPressed(true);
      send(pointers.size > 1 ? 5 : 0, pt(ev), ev.pointerId);   // ACTION_POINTER_DOWN : ACTION_DOWN
    });
    e.addEventListener('pointermove', (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, ev);
      if (down) { send(2, pt(ev), ev.pointerId); if (ev.cancelable) ev.preventDefault(); }
    });
    const up = (ev) => {
      const multi = pointers.size > 1;
      pointers.delete(ev.pointerId);
      if (down) { send(multi ? 6 : 1, pt(ev), ev.pointerId); down = pointers.size ? down : null; }
      if (!pointers.size) { down = null; setPressed(false); }
    };
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', (ev) => { pointers.delete(ev.pointerId); if (down) { send(3, pt(ev), ev.pointerId); down = null; setPressed(false); } });
    e.addEventListener('touchstart', (ev) => { if (ev.touches[0]) send(0, ev.touches[0]); }, { passive: true });
    e.addEventListener('touchmove', (ev) => { if (ev.touches[0]) send(2, ev.touches[0]); }, { passive: true });
    e.addEventListener('touchend', (ev) => { if (ev.changedTouches[0]) send(1, ev.changedTouches[0]); }, { passive: true });
  }
  fireClick(v) {
    if (!v || !v.$onClick) return;
    try { this.R.iv('Landroid/view/View$OnClickListener;->onClick(Landroid/view/View;)V', v.$onClick, v); }
    catch (e) { this.host.crash(e); }
  }

  /* ---------- tree ops ---------- */
  addView(parent, child, index) {
    if (!parent || !child) return;
    this.ensureView(parent, parent.$kind || 'ViewGroup');
    this.ensureView(child, child.$kind || 'View');
    if (!parent.$children) parent.$children = [];
    const prev = child.$parent;
    if (prev && prev !== parent) this.removeView(prev, child);
    if (index === undefined || index < 0 || index >= parent.$children.length) parent.$children.push(child);
    else parent.$children.splice(index, 0, child);
    child.$parent = parent;
    if (!child.$lp) child.$lp = this.makeLayoutParams(this.R);
    this.applyLayoutParams(child);
    if (index === undefined || index < 0) parent.$el.appendChild(child.$el);
    else parent.$el.insertBefore(child.$el, parent.$el.children[index] || null);
    if (this.needsDrawPass(child)) this.setupDraw(child);
  }
  removeView(parent, child) {
    if (!parent || !parent.$children) return;
    const i = parent.$children.indexOf(child);
    if (i >= 0) parent.$children.splice(i, 1);
    if (child.$el && child.$el.parentNode === parent.$el) parent.$el.removeChild(child.$el);
    child.$parent = null;
  }
  removeAllViews(parent) {
    if (!parent) return;
    for (const c of (parent.$children || []).slice()) this.removeView(parent, c);
    parent.$children = [];
    if (parent.$el) parent.$el.innerHTML = '';
  }
  resyncChildren(parent) {
    if (!parent.$el) return;
    for (const c of parent.$children) if (c && c.$el) parent.$el.appendChild(c.$el);
  }
  showChild(v, i) {
    v.$shown = i;
    (v.$children || []).forEach((c, k) => { if (c.$el) c.$el.style.display = k === i ? '' : 'none'; });
  }
  relayout(v) { /* CSS handles layout; nothing structural to do */ }
  invalidate(v) {
    if (v && v.$el && v.$el.tagName === 'CANVAS') this.host.redrawSurface(v);
    if (v && v.$drawPass) this.scheduleDraw(v);
  }

  /* ---------- custom-draw pass --------------------------------------
   * A dex subclass of View that overrides onDraw(Canvas) paints into a real
   * 2D canvas layered behind its DOM children, so hand-drawn widgets, game
   * boards and chart views actually appear instead of an empty box. */
  needsDrawPass(v) {
    if (v.$drawPass !== undefined) return v.$drawPass;
    const R = this.R;
    let c = v.$c, guard = 0;
    while (c && guard++ < 40) {
      if (c.native) break;                       // stop at shimmed widgets
      const m = c.methods.get('onDraw(Landroid/graphics/Canvas;)V');
      if (m && !m.stub && !(m.accessFlags & 0x100)) { v.$drawPass = true; return true; }
      c = R.sup(c);
    }
    v.$drawPass = false;
    return false;
  }
  setupDraw(v) {
    if (v.$drawEl || !v.$el) return;
    const e = document.createElement('canvas');
    e.className = 'av-drawpass';
    e.style.position = 'absolute';
    e.style.inset = '0';
    e.style.width = '100%';
    e.style.height = '100%';
    e.style.pointerEvents = 'none';
    e.style.zIndex = '0';
    v.$el.style.position = v.$el.style.position || 'relative';
    v.$el.insertBefore(e, v.$el.firstChild || null);
    v.$drawEl = e;
    this._drawViews = this._drawViews || new Set();
    this._drawViews.add(v);
    this.scheduleDraw(v);
    this.startDrawLoop();
  }
  scheduleDraw(v) { v.$drawDirty = true; }
  startDrawLoop() {
    if (this._drawTimer) return;
    this._drawTimer = setInterval(() => {
      if (!this._drawViews || !this._drawViews.size) return;
      for (const v of [...this._drawViews]) {
        if (v.$drawDirty) { v.$drawDirty = false; this.drawPass(v); }
      }
    }, 33);
  }
  drawPass(v) {
    const R = this.R;
    const e = v.$drawEl;
    if (!e || !v.$el) return;
    const w = v.$el.clientWidth || 300;
    const h = v.$el.clientHeight || 150;
    if (e.width !== w) e.width = w;
    if (e.height !== h) e.height = h;
    const ctx = e.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const cobj = { $c: R.klass('Landroid/graphics/Canvas;'), $ctx: ctx, $el: e };
    try {
      R.iv('Landroid/view/View;->onDraw(Landroid/graphics/Canvas;)V', v, cobj);
    } catch (err) {
      v.$drawPass = false;
      if (this._drawViews) this._drawViews.delete(v);
      this.host.crash(err);
    }
    ctx.restore();
  }

  findViewById(root, id) {
    if (!root) return null;
    if (root.$id === id) return root;
    for (const c of (root.$children || [])) { const f = this.findViewById(c, id); if (f) return f; }
    return null;
  }

  /* ---------- compound / progress / seek ---------- */
  bindCompound(v) {
    const e = v.$el; if (!e || !e._input || e.__compoundBound) return;
    e.__compoundBound = true;
    e._input.addEventListener('change', () => {
      v.$checked = e._input.checked;
      if (v.$onCheckedChange) {
        try { this.R.iv('Landroid/widget/CompoundButton$OnCheckedChangeListener;->onCheckedChanged(Landroid/widget/CompoundButton;Z)V', v.$onCheckedChange, v, v.$checked ? 1 : 0); }
        catch (err) { this.host.crash(err); }
      }
      if (v.$kind === 'RadioButton' && v.$parent && v.$parent.$kind === 'RadioGroup') this.radioCheck(v.$parent, v.$id);
    });
  }
  setChecked(v, b) {
    v.$checked = !!b;
    if (v.$el && v.$el._input) v.$el._input.checked = !!b;
  }
  radioCheck(group, id) {
    group.$checkedId = id;
    for (const c of (group.$children || [])) {
      const on = c.$id === id;
      this.setChecked(c, on);
    }
    if (group.$onChecked) {
      try { this.R.iv('Landroid/widget/RadioGroup$OnCheckedChangeListener;->onCheckedChanged(Landroid/widget/RadioGroup;I)V', group.$onChecked, group, id); }
      catch (e) { this.host.crash(e); }
    }
  }
  setProgress(v, p, fromUser) {
    const max = v.$max === undefined ? 100 : v.$max;
    p = Math.max(0, Math.min(max, p));
    v.$progress = p;
    if (v.$el) {
      if (v.$el._bar) v.$el._bar.style.width = (max ? (p / max) * 100 : 0) + '%';
      else if (v.$el.type === 'range') v.$el.value = String(p);
    }
    if (fromUser && v.$onSeek) {
      try { this.R.iv('Landroid/widget/SeekBar$OnSeekBarChangeListener;->onProgressChanged(Landroid/widget/SeekBar;IZ)V', v.$onSeek, v, p, 1); }
      catch (e) { this.host.crash(e); }
    }
  }
  setMax(v, m) { v.$max = m; if (v.$el) { if (v.$el.type === 'range') v.$el.max = String(m); } }
  setIndeterminate(v, b) { v.$indeterminate = !!b; if (v.$el) v.$el.classList.toggle('av-indeterminate', !!b); }
  bindSeek(v) {
    const e = v.$el; if (!e || e.type !== 'range' || e.__seekBound) return;
    e.__seekBound = true;
    if (v.$max === undefined) { v.$max = 100; e.max = '100'; }
    e.addEventListener('input', () => this.setProgress(v, parseInt(e.value, 10) || 0, true));
    e.addEventListener('change', () => {
      if (v.$onSeek) {
        const p = parseInt(e.value, 10) || 0;
        try { this.R.iv('Landroid/widget/SeekBar$OnSeekBarChangeListener;->onStopTrackingTouch(Landroid/widget/SeekBar;)V', v.$onSeek, v); } catch {}
      }
    });
  }
  setSpinnerAdapter(v, a) {
    v.$adapter = a;
    if (!a) return;
    a.$boundTo = a.$boundTo || new Set(); a.$boundTo.add(v);
    if (!v.$el) return;
    const n = this.R.iv('Landroid/widget/BaseAdapter;->getCount()I', a) | 0;
    v.$el.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const opt = document.createElement('option');
      opt.textContent = String(this.adapterItemLabel(a, i));
      v.$el.appendChild(opt);
    }
    v.$el.selectedIndex = v.$sel || 0;
    if (!v.$el.__bound) { v.$el.__bound = true; v.$el.addEventListener('change', () => this.setSpinnerSelection(v, v.$el.selectedIndex, true)); }
  }
  adapterItem(a, i) { try { return this.R.iv('Landroid/widget/BaseAdapter;->getItem(I)Ljava/lang/Object;', a, i); } catch { return null; } }
  adapterItemLabel(a, i) {
    const o = this.adapterItem(a, i);
    if (o === null || o === undefined) return '';
    if (typeof o === 'string') return o;
    return this.R.str(o);
  }
  setSpinnerSelection(v, i, fromUser) {
    v.$sel = i;
    if (v.$el) v.$el.selectedIndex = i;
    if (fromUser !== false && v.$onSel) {
      try { this.R.iv('Landroid/widget/AdapterView$OnItemSelectedListener;->onItemSelected(Landroid/widget/AdapterView;Landroid/view/View;IJ)V', v.$onSel, v, v, i, i); }
      catch (e) { this.host.crash(e); }
    }
  }
  bindSpinner(v) { /* listener wired in setSpinnerAdapter */ }
  refreshAdapters(a) { if (a.$boundTo) for (const v of a.$boundTo) { if (v.$kind === 'Spinner') this.setSpinnerAdapter(v, a); else this.setListAdapter(v, a, v.$kind === 'GridView'); } }
  bindSearch(v) { /* SearchView is rendered as a static box */ }

  setListAdapter(list, adapter, grid) {
    list.$adapter = adapter;
    if (!adapter) return;
    adapter.$boundTo = adapter.$boundTo || new Set(); adapter.$boundTo.add(list);
    this.ensureView(list, list.$kind);
    const e = list.$el;
    e.style.display = grid ? 'grid' : 'flex';
    e.style.flexDirection = 'column';
    e.style.overflowY = 'auto';
    if (grid) { e.style.gridTemplateColumns = `repeat(${list.$cols || 2}, 1fr)`; e.style.gap = '4px'; }
    e.innerHTML = '';
    list.$children = [];
    let n = this.R.iv('Landroid/widget/BaseAdapter;->getCount()I', adapter) | 0;
    if (n < 0 || n > 5000) {
      this.host.log('W', 'Dex2Web', `adapter reported ${n} items — capping list inflation at 500 to keep the tab responsive`);
      n = Math.min(Math.max(0, n), 500);
    }
    for (let i = 0; i < n; i++) {
      let itemView = null;
      try { itemView = this.R.iv('Landroid/widget/BaseAdapter;->getView(ILandroid/view/View;Landroid/view/ViewGroup;)Landroid/view/View;', adapter, i, null, list); }
      catch (err) { this.host.crash(err); }
      if (!itemView) {
        itemView = this.makeLabelView(this.adapterItemLabel(adapter, i));
      }
      this.ensureView(itemView, itemView.$kind || 'TextView');
      itemView.$el.classList.add('av-listitem');
      const idx = i;
      itemView.$el.addEventListener('click', () => {
        if (list.$onItemClick) {
          try { this.R.iv('Landroid/widget/AdapterView$OnItemClickListener;->onItemClick(Landroid/widget/AdapterView;Landroid/view/View;IJ)V', list.$onItemClick, list, itemView, idx, idx); }
          catch (err) { this.host.crash(err); }
        }
      });
      e.appendChild(itemView.$el);
      list.$children.push(itemView);
      itemView.$parent = list;
    }
  }
  makeLabelView(text) {
    const R = this.R;
    const c = R.klass('Landroid/widget/TextView;');
    R.initClass(c);
    const v = R.newInstanceObj(c);
    v.$ctx = this.host.currentActivity();
    this.ensureView(v, 'TextView');
    this.setText(v, text);
    return v;
  }
  adapterDefaultView(R, adapter, i, convertView, parent) {
    const item = this.adapterItemLabel(adapter, i);
    const v = this.makeLabelView(item);
    v.$el.style.padding = '10px 12px';
    return v;
  }

  numberPicker(v) {
    this.ensureView(v, 'LinearLayout');
    const e = v.$el;
    e.innerHTML = '';
    const min = v.$min || 0, max = v.$max === undefined ? 10 : v.$max;
    const labels = v.$labels;
    const sel = document.createElement('select');
    for (let i = min; i <= max; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = labels && labels[i - min] !== undefined ? String(labels[i - min]) : String(i);
      sel.appendChild(o);
    }
    sel.value = String(v.$val || min);
    sel.addEventListener('change', () => { v.$val = parseInt(sel.value, 10); });
    e.appendChild(sel);
  }
  chronometerStart(v) {
    const base = v.$base === undefined ? Date.now() : v.$base;
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - base) / 1000));
      this.setText(v, `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    };
    tick();
    this._chronos.set(v, setInterval(tick, 1000));
  }
  chronometerStop(v) { const h = this._chronos.get(v); if (h) { clearInterval(h); this._chronos.delete(v); } }

  /* ---------- images ---------- */
  setImageResource(v, id) {
    if (!v.$el) return;
    const d = this.host.resDrawable(id);
    v.$drawable = d;
    this.applyImageSrc(v);
  }
  setImageDrawable(v, d) { v.$drawable = d; this.applyImageSrc(v); }
  setImageBitmap(v, b) { v.$drawable = b && b.$uri ? { $uri: b.$uri } : null; this.applyImageSrc(v); }
  setImageUri(v, u) { v.$drawable = u ? { $uri: u.$u } : null; this.applyImageSrc(v); }
  setImageTint(v, c) { v.$tint = c; if (v.$el) v.$el.style.filter = c === undefined ? '' : 'brightness(0.8)'; }
  applyImageSrc(v) {
    const e = v.$el; if (!e) return;
    let d = v.$drawable;
    if (d && d.$selector && this.host && this.host.selectorFor) d = this.host.selectorFor(d, v) || d.$fallback;
    if (e.tagName === 'IMG') {
      e.src = d && d.$uri ? d.$uri : svgUri(placeholderSvg());
      e.alt = '';
      if (d && d.$svg) e.src = svgUri(d.$svg);
      this.applyImageFit(v);
    } else if (d && d.$uri) {
      e.style.backgroundImage = `url("${d.$uri}")`;
      e.style.backgroundSize = 'contain';
      e.style.backgroundRepeat = 'no-repeat';
      e.style.backgroundPosition = 'center';
    } else if (d && d.$color !== undefined) {
      e.style.backgroundColor = argbToCss(d.$color, TYPE.INT_COLOR_ARGB8);
    }
  }

  /* ---------- animation ---------- */
  animator(v) {
    const c = this.R.klass('Landroid/view/ViewPropertyAnimator;');
    return { $c: c, $view: v, $ops: [], $dur: 250, $delay: 0 };
  }
  runAnimator(a) {
    const v = a.$view, e = v && v.$el;
    if (!e) return;
    e.style.transition = `all ${a.$dur}ms ${a.$delay}ms ease`;
    for (const [k, val] of a.$ops) {
      if (k === 'alpha') { v.$alpha = val; e.style.opacity = String(val); }
      else if (k === 'tx') { v.$tx = val; }
      else if (k === 'ty') { v.$ty = val; }
      else if (k === 'rot') { v.$rot = val; }
      else if (k === 'sx') { v.$sx = val; }
      else if (k === 'sy') { v.$sy = val; }
      else if (k === 'x') { v.$tx = val; }
      else if (k === 'y') { v.$ty = val; }
    }
    this.applyTransform(v);
    const done = () => { if (a.$end) this.runSafe(a.$end); if (a.$listener) { try { this.R.iv('Landroid/animation/AnimatorListenerAdapter;->onAnimationEnd(Landroid/animation/Animator;)V', a.$listener, a); } catch {} } };
    setTimeout(done, a.$dur + a.$delay + 16);
  }
  cancelAnimator(a) { const v = a.$view; if (v && v.$el) v.$el.style.transition = ''; }

  /* ---------- surfaces ---------- */
  lockCanvas(v) {
    const e = v && v.$el;
    if (!e || e.tagName !== 'CANVAS') return null;
    if (!e.width || !e.height) { e.width = e.clientWidth || 300; e.height = e.clientHeight || 150; }
    const ctx = e.getContext('2d');
    const c = this.R.klass('Landroid/graphics/Canvas;');
    return { $c: c, $ctx: ctx, $el: e };
  }
  surfaceRect(v) {
    const e = v && v.$el;
    const c = this.R.klass('Landroid/graphics/Rect;');
    return { $c: c, $l: 0, $t: 0, $r: e ? (e.clientWidth || 300) : 300, $b: e ? (e.clientHeight || 150) : 150 };
  }
  surfaceCreated(v, cb) {
    if (!v || !v.$el || !cb) return;
    const holder = { $c: this.R.klass('Landroid/view/SurfaceHolder;'), $view: v };
    const finish = () => {
      try { this.R.iv('Landroid/view/SurfaceHolder$Callback;->surfaceCreated(Landroid/view/SurfaceHolder;)V', cb, holder); }
      catch (e) { this.host.crash(e); }
      try { this.R.iv('Landroid/view/SurfaceHolder$Callback;->surfaceChanged(Landroid/view/SurfaceHolder;III)V', cb, holder, 0, v.$el.clientWidth, v.$el.clientHeight); } catch {}
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
  }
}

const ALLOWED_TAGS = /^(b|i|u|em|strong|br|p|div|span|ul|ol|li|a|font|small|big|sub|sup|blockquote|h[1-6]|hr|img)$/i;
export function sanitizeHtml(html) {
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\s*([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => (ALLOWED_TAGS.test(tag) ? `<${tag.toLowerCase()}${attrs}>` : ''))
    .replace(/<\s*\/\s*([a-z0-9]+)\s*>/gi, (m, tag) => (ALLOWED_TAGS.test(tag) ? `</${tag.toLowerCase()}>` : ''));
}

export function svgUri(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
export function placeholderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="8" fill="#2b2f3a"/><path d="M14 30l7-9 5 6 4-5 4 8z" fill="#5b6478"/><circle cx="18" cy="19" r="3" fill="#5b6478"/></svg>`;
}
