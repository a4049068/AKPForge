#!/usr/bin/env python3
"""screencheck — a visual oracle for the transpiled app screen.

DOM/log assertions can pass while the phone shows a flat white or black
rectangle, so this tool looks at the *pixels* of the rendered screen:

  • palette        — quantised distinct colours; a blank screen has ~1-3
  • dominant share — % of pixels in the single biggest colour bucket
  • edge density   — % of pixels that differ from their right neighbour
                     (structure: text, icons, borders, widgets)
  • luminance      — mean / std-dev (catches all-black and all-white)
  • contrast       — in-page WCAG contrast of every visible text node against
                     its effective background (catches dark-on-dark text)
  • dom census     — app-created views, non-empty texts, images, canvases

Verdicts
  FAIL  blank-default     nothing was attached; the screen is still the
                          pristine white (or idle gradient) surface
  FAIL  flat-no-content   >=99.5% one colour and the app drew no background,
                          text or image of its own  → a critical bug ate the UI
  WARN  solid-by-design   >=99.5% one colour but the app explicitly painted a
                          background (e.g. a "red screen" utility) → intended
  WARN  low-contrast      N text nodes are (near-)invisible on their background
  PASS  otherwise

Usage:
  python3 tools/screencheck.py                       # all test/*.apk + samples
  python3 tools/screencheck.py test/foo.apk ...      # specific packages
  D2W_URL=http://host:port/index.html python3 tools/screencheck.py
Exit code: 0 = no FAIL, 1 = at least one FAIL.
"""
import os, re, sys, io, glob, json, threading, functools, http.server, socketserver

os.environ.setdefault('HOME', '/tmp')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots', 'screencheck')
os.makedirs(SHOTS, exist_ok=True)

from PIL import Image
try:
    from playwright.sync_api import sync_playwright
except ModuleNotFoundError:
    sys.stderr.write(
        "screencheck pixel mode needs a real browser:\n"
        "    pip install playwright && python3 -m playwright install chromium\n"
        "For a browser-free structural check of the same screen tree, run:\n"
        "    node tools/screencheck.mjs\n")
    sys.exit(2)

PORT = 8791
URL = os.environ.get('D2W_URL', f'http://127.0.0.1:{PORT}/index.html')

# apps whose whole point is a flat fill — pixel heuristics must not FAIL them
SOLID_BY_DESIGN = {'org.vi_server.red_screen_3.apk'}

DOM_STATS_JS = """() => {
  const screen = document.querySelector('#screen');
  if (!screen) return null;
  const views = screen.querySelectorAll('.av');
  const texts = [];
  const bgSet = new Set();
  let imgs = 0, canvases = 0, iframes = 0; let inputsCount = 0;
  const lum = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null;
    const p = m[1].split(',').map(parseFloat);
    if (p.length === 4 && p[3] === 0) return null;
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  };
  const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); return m ? m[1].split(',').map(parseFloat) : null; };
  const effBg = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const p = parse(bg);
      if (p && !(p.length === 4 && p[3] === 0)) return bg;
      n = n.parentElement;
    }
    return 'rgb(255,255,255)';
  };
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); if (la === null || lb === null) return 99;
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
  let lowContrast = 0; const lowContrastSamples = [];
  for (const v of views) {
    const st = getComputedStyle(v);
    if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)') bgSet.add(st.backgroundColor);
    if (st.backgroundImage && st.backgroundImage !== 'none') bgSet.add('image:' + st.backgroundImage.slice(0, 40));
  }
  for (const el of screen.querySelectorAll('img, canvas, iframe')) {
    if (el.tagName === 'IMG' && el.src) imgs++;
    else if (el.tagName === 'CANVAS') canvases++;
    else if (el.tagName === 'IFRAME' && (el.srcdoc || el.src)) iframes++;
  }
  for (const v of views) {
    const st = getComputedStyle(v);
    if (v.tagName === 'INPUT' || v.tagName === 'TEXTAREA' || v.tagName === 'SELECT') inputsCount++;
    const direct = Array.from(v.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    const label = v.querySelector ? v.querySelector('.av-compound-text') : null;
    const t = (direct || (label ? label.textContent : '') || '').trim();
    if (t) {
      texts.push(t.slice(0, 40));
      const target = label || v;
      const c = contrast(getComputedStyle(target).color, effBg(target));
      if (c < 1.35) { lowContrast++; if (lowContrastSamples.length < 4) lowContrastSamples.push(t.slice(0, 24) + ' @' + c.toFixed(2)); }
    }
  }
  const screenBg = getComputedStyle(screen).backgroundColor;
  return {
    views: views.length, texts, imgs, canvases, iframes, inputs: inputsCount,
    explicitBgs: bgSet.size, screenBg, lowContrast, lowContrastSamples,
    textInk: texts.join(' ').length,
  };
}"""


def pixel_metrics(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    # quantise to 4 bits/channel so antialiasing doesn't explode the palette
    buckets = {}
    lum_sum = 0.0
    lum_sq = 0.0
    edges = 0
    n = w * h
    for y in range(h):
        prev = None
        for x in range(w):
            r, g, b = px[x, y]
            key = (r >> 4, g >> 4, b >> 4)
            buckets[key] = buckets.get(key, 0) + 1
            L = 0.2126 * r + 0.7152 * g + 0.0722 * b
            lum_sum += L
            lum_sq += L * L
            if prev is not None:
                if abs(r - prev[0]) > 24 or abs(g - prev[1]) > 24 or abs(b - prev[2]) > 24:
                    edges += 1
            prev = (r, g, b)
    mean = lum_sum / n
    var = max(0.0, lum_sq / n - mean * mean)
    dom = max(buckets.values()) / n
    return {
        'colors': len(buckets),
        'dominant': dom,
        'edge': edges / n,
        'lum_mean': mean,
        'lum_std': var ** 0.5,
        'size': (w, h),
    }


def verdict(dom, px, name, host=None):
    reasons = []
    flat = px['dominant'] >= 0.995
    if dom['views'] == 0:
        if host and host.get('noLauncher'):
            return 'SKIP', ['no launcher <activity> in the manifest (service/tile/widget-only package)']
        return 'FAIL', ['blank-default: no app view was ever attached to the screen']
    embedded = dom['canvases'] >= 1 or dom['iframes'] >= 1
    explained = bool(host and (host.get('compose') or host.get('deferred')))
    if not (dom['texts'] or dom['imgs'] or dom['inputs'] or dom['explicitBgs'] or embedded or explained):
        return 'FAIL', ['flat-no-content: screen has views but no text, image, input, canvas or painted background']
    if flat and embedded:
        reasons.append('screen is a uniform surface but content is painted on a canvas/WebView layer')
        v = 'WARN'
    elif flat and explained:
        v = 'WARN'
    elif flat:
        if name in SOLID_BY_DESIGN or dom['explicitBgs'] >= 1 or dom['imgs'] >= 1:
            reasons.append(f"uniform fill ({px['dominant']*100:.1f}%) but the app painted a background/image itself → intended")
            v = 'WARN'
        else:
            return 'FAIL', [f"flat-no-content: {px['dominant']*100:.2f}% of pixels are one colour and the app set no background/text/image"]
    else:
        v = 'PASS'
    if px['edge'] < 0.004 and not flat:
        reasons.append(f"very little structure (edge density {px['edge']*100:.2f}%)")
        if v == 'PASS':
            v = 'WARN'
    if dom['lowContrast']:
        reasons.append(f"{dom['lowContrast']} text node(s) nearly invisible: " + '; '.join(dom['lowContrastSamples']))
        if v == 'PASS':
            v = 'WARN'
    if embedded and not dom['texts'] and not dom['imgs']:
        reasons.append('content is custom onDraw()/WebView output — pixel palette only sees the base layer')
        if v == 'PASS':
            v = 'WARN'
    if host and host.get('compose'):
        reasons.append('UI is Jetpack Compose (its own toolkit, not XML views) — out of scope for the view renderer')
        v = 'WARN'
    if host and host.get('deferred'):
        reasons.append(f"app immediately delegated to an external intent ({host['deferred']}) and shows no UI of its own")
        v = 'WARN'
    if px['colors'] <= 2 and dom['textInk'] > 0:
        reasons.append('text present but palette has <=2 colours — glyphs may not be painting')
        v = 'FAIL' if v == 'PASS' else v
    return v, reasons


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main():
    apks = [a for a in sys.argv[1:] if a.endswith('.apk')]
    if not apks:
        apks = sorted(glob.glob(os.path.join(ROOT, 'test', '*.apk')))
    rows = []
    fails = 0
    httpd = None
    if URL.startswith(f'http://127.0.0.1:{PORT}'):
        httpd = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for apk in apks:
            name = os.path.basename(apk)
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            try:
                page.goto(URL, wait_until='load')
                page.wait_for_timeout(300)
                page.set_input_files('#file', apk if os.path.isabs(apk) else os.path.join(ROOT, apk))
                page.wait_for_selector('#workbench.on', timeout=60000)
                page.wait_for_timeout(300)
                page.click('#runBtn')
                page.wait_for_timeout(2200)
                dom = page.evaluate(DOM_STATS_JS)
                extra = page.evaluate("""() => ({
                  compose: [...window.Dex2Web.host.transpiler._byDesc.keys()].some(d => d.includes('androidx/compose/ui'))
                           || window.Dex2Web.host.logs.some(l => /ViewTreeLifecycleOwner not found|AndroidComposeView/.test(l.msg || '')),
                  deferred: (window.Dex2Web.host.logs.find(l => /No activity resolves action (.+) in the browser/.test(l.msg || '')) || {}).msg || null,
                  noLauncher: !!window.Dex2Web.host.lastNoLauncher,
                })""")
                extra['deferred'] = (re.search(r'action (.+) in', extra['deferred'] or '') or [None, None])[1]
                shot = os.path.join(SHOTS, name.replace('.apk', '') + '.png')
                page.locator('#screen').screenshot(path=shot)
                px = pixel_metrics(shot)
                v, reasons = verdict(dom, px, name, extra)
                if v == 'FAIL':
                    fails += 1
                rows.append((name, v, dom, px, reasons, errors))
            except Exception as e:
                fails += 1
                rows.append((name, 'FAIL', {'views': 0, 'texts': [], 'imgs': 0, 'canvases': 0, 'iframes': 0,
                                            'explicitBgs': 0, 'lowContrast': 0, 'lowContrastSamples': [],
                                            'textInk': 0, 'screenBg': '?'},
                             {'colors': 0, 'dominant': 1.0, 'edge': 0.0, 'lum_mean': 0.0, 'lum_std': 0.0, 'size': (0, 0)},
                             [f'harness error: {e}'], []))
            finally:
                page.close()
        browser.close()
    if httpd:
        httpd.shutdown()

    hdr = f"{'package':42s} {'verdict':6s} {'views':>5s} {'txt':>4s} {'img':>3s} {'cols':>5s} {'dom%':>6s} {'edge%':>6s} {'lum':>13s} {'contrast':>8s}"
    print('\n' + hdr)
    print('-' * len(hdr))
    for name, v, dom, px, reasons, errors in rows:
        print(f"{name[:42]:42s} {v:6s} {dom['views']:5d} {len(dom['texts']):4d} {dom['imgs']:3d} "
              f"{px['colors']:5d} {px['dominant']*100:6.2f} {px['edge']*100:6.2f} "
              f"{px['lum_mean']:6.1f}±{px['lum_std']:<6.1f} {dom['lowContrast']:8d}")
        for r in reasons:
            print(f"{'':44s}└ {r}")
        for e in errors[:2]:
            print(f"{'':44s}└ pageerror: {e[:110]}")
    print('-' * len(hdr))
    print(f"{len(rows) - fails}/{len(rows)} screens look alive · {fails} FAIL · screenshots in shots/screencheck/")
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
