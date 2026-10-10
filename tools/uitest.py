#!/usr/bin/env python3
"""Browser smoke test: serve the site, load a real sample APK, exercise every
panel, capture screenshots and report console errors."""
import asyncio, os, sys, json
os.environ.setdefault('HOME', '/tmp')
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
URL = os.environ.get('D2W_URL', 'http://127.0.0.1:8765/index.html')
os.makedirs(SHOTS, exist_ok=True)

async def main():
    errors, logs = [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
        page.on('console', lambda m: (logs.append((m.type, m.text)), errors.append(m.text) if m.type == 'error' else None))
        page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e) + '\n' + (getattr(e,'stack','') or '')[:900]))

        await page.goto(URL, wait_until='load')
        await page.wait_for_timeout(700)
        await page.screenshot(path=f'{SHOTS}/01-hero.png')

        # ---- load the first sample ----
        await page.click('.sample-btn')
        await page.wait_for_selector('#workbench.on', timeout=30000)
        await page.wait_for_timeout(900)
        await page.screenshot(path=f'{SHOTS}/02-overview.png')
        meta = await page.evaluate("""() => ({
            name: document.querySelector('#appName').textContent,
            pkg: document.querySelector('#appPkg').textContent,
            chips: [...document.querySelectorAll('#appChips .chip')].map(c=>c.textContent.trim()),
            stats: [...document.querySelectorAll('#ovStats .stat')].map(s=>s.querySelector('.v').textContent+' '+s.querySelector('.k').textContent),
            stages: [...document.querySelectorAll('.stage')].map(s=>s.className),
            iconOk: document.querySelector('#appIcon').src.startsWith('data:image'),
        })""")
        print('APP:', json.dumps(meta, indent=1))

        # ---- manifest ----
        await page.click('.tab[data-p="manifest"]'); await page.wait_for_timeout(250)
        await page.screenshot(path=f'{SHOTS}/03-manifest.png')
        print('manifest chars:', await page.evaluate("()=>document.querySelector('#manifestCode').textContent.length"))

        # ---- resources ----
        await page.click('.tab[data-p="resources"]'); await page.wait_for_timeout(350)
        rows = await page.evaluate("()=>document.querySelectorAll('#resTable tbody tr').length")
        print('resource rows (first type):', rows)
        await page.screenshot(path=f'{SHOTS}/04-resources.png')
        # switch to drawable/mipmap if present to see thumbnails
        tabs = await page.evaluate("()=>[...document.querySelectorAll('.res-tab')].map(t=>t.dataset.t)")
        print('resource types:', tabs)
        for want in ('mipmap', 'drawable', 'string'):
            if want in tabs:
                await page.click(f'.res-tab[data-t="{want}"]'); await page.wait_for_timeout(300)
                await page.screenshot(path=f'{SHOTS}/05-resources-{want}.png')
                break

        # ---- classes & code ----
        await page.click('.tab[data-p="code"]'); await page.wait_for_timeout(400)
        cls = await page.evaluate("()=>document.querySelectorAll('#clsList .row[data-d]').length")
        print('classes listed:', cls)
        # pick a class that has real code
        picked = await page.evaluate("""() => {
            const rows=[...document.querySelectorAll('#clsList .row[data-d]')];
            const target = rows.find(r=>/MainActivity|Activity/.test(r.dataset.d)) || rows[0];
            target.click(); return target.dataset.d;
        }""")
        await page.wait_for_timeout(700)
        print('selected class:', picked)
        ms = await page.evaluate("()=>document.querySelectorAll('#mList .row[data-m]').length")
        print('methods listed:', ms)
        await page.screenshot(path=f'{SHOTS}/06-code.png', full_page=False)
        # try each method until one has generated JS
        n = await page.evaluate("""() => {
            const rows=[...document.querySelectorAll('#mList .row[data-m]')];
            for (const r of rows) { r.click(); }
            return rows.length;
        }""")
        await page.wait_for_timeout(400)
        jslen = await page.evaluate("()=>document.querySelectorAll('#codePanels pre.code').length")
        print('code panes after cycling methods:', jslen)
        # select a method with a decent body
        await page.evaluate("""() => {
            const rows=[...document.querySelectorAll('#mList .row[data-m]')];
            const best = rows.find(r=>/onCreate|onFling|onTouch|onResume/.test(r.textContent)) || rows[rows.length-1];
            if (best) best.click();
        }""")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f'{SHOTS}/07-code-method.png')
        snippet = await page.evaluate("()=>{const p=document.querySelectorAll('#codePanels pre.code'); return p.length?p[p.length-1].textContent.slice(0,700):'(none)'}")
        print('--- generated JS (head) ---'); print(snippet[:700]); print('---')

        # ---- run ----
        await page.click('#runBtn'); await page.wait_for_timeout(1600)
        await page.screenshot(path=f'{SHOTS}/08-run.png')
        runstate = await page.evaluate("""() => ({
            engine: document.querySelector('#enginePill').textContent.trim(),
            screenChildren: document.querySelector('#screen').children.length,
            screenHtmlLen: document.querySelector('#screen').innerHTML.length,
            logLines: document.querySelectorAll('#logcat .ln').length,
            toast: !!document.querySelector('.d2w-toast'),
        })""")
        print('RUN:', json.dumps(runstate))
        await page.screenshot(path=f'{SHOTS}/09-phone.png', clip=await page.evaluate("()=>{const r=document.querySelector('.phone').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}"))

        # ---- interaction proof: tap the app, background must change ----
        PAINTED = "()=>{const cs=[...document.querySelectorAll('#screen .av')].map(e=>getComputedStyle(e).backgroundColor);return cs.find(c=>c&&c!=='rgba(0, 0, 0, 0)')||'(none)'}"
        before = await page.evaluate(PAINTED)
        box = await page.evaluate("()=>{const r=document.querySelector('#screen').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}")
        await page.mouse.move(box['x'], box['y']); await page.mouse.down(); await page.mouse.move(box['x']+60, box['y']+10, steps=4); await page.mouse.up()
        await page.wait_for_timeout(500)
        after = await page.evaluate(PAINTED)
        print('INTERACTION: bg before', before, '→ after', after, '(changed' , before != after, ')')
        await page.screenshot(path=f'{SHOTS}/09b-after-tap.png', clip=await page.evaluate("()=>{const r=document.querySelector('.phone').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}"))
        hscroll = await page.evaluate("()=>document.documentElement.scrollWidth > document.documentElement.clientWidth")
        print('horizontal overflow:', hscroll)

        # ---- report ----
        await page.click('.tab[data-p="report"]'); await page.wait_for_timeout(400)
        await page.screenshot(path=f'{SHOTS}/10-report.png')
        print('opcode rows:', await page.evaluate("()=>document.querySelectorAll('#repOpcodes .bar-row').length"))

        # ---- archive ----
        await page.click('.tab[data-p="archive"]'); await page.wait_for_timeout(300)
        print('zip rows:', await page.evaluate("()=>document.querySelectorAll('#zipTable tbody tr').length"))
        await page.screenshot(path=f'{SHOTS}/11-archive.png')

        # ---- console command ----
        await page.click('.tab[data-p="run"]'); await page.wait_for_timeout(200)
        await page.fill('#jcmd', 'stats'); await page.click('#jrun'); await page.wait_for_timeout(300)
        print('console out:', (await page.evaluate("()=>{const l=document.querySelectorAll('#logcat .ln');return l.length?l[l.length-1].textContent:''}"))[:400])

        # ---- AOT ----
        await page.click('.tab[data-p="report"]'); await page.click('#aotBtn')
        await page.wait_for_function("()=>!document.querySelector('#aotBtn').disabled", timeout=120000)
        await page.wait_for_timeout(400)
        print('AOT:', await page.evaluate("()=>document.querySelector('#aotProgress').textContent"))
        await page.screenshot(path=f'{SHOTS}/12-report-aot.png')

        await browser.close()

    print('\n=== console errors:', len(errors))
    for e in errors[:20]: print('  !', e[:300])

asyncio.run(main())
