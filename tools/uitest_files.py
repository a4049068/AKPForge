import asyncio, os, sys
os.environ.setdefault('HOME', '/tmp')
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APKS = sys.argv[1:] or ['com.santiagorodriguez.countaway_10.apk','ru.zxalexis.ugaday_15.apk','biz.binarysolutions.weatherusa_25.apk','io.github.ebraminio.bouncy_1.apk']
URL = 'http://127.0.0.1:8765/index.html'

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for apk in APKS:
            page = await b.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda e: errs.append(apk + ': ' + str(e)))
            await page.goto(URL, wait_until='load'); await page.wait_for_timeout(300)
            await page.set_input_files('#file', os.path.join(ROOT, 'test', apk))
            try:
                await page.wait_for_selector('#workbench.on', timeout=60000)
            except Exception as e:
                print(f'{apk}: LOAD FAILED {e}'); await page.close(); continue
            await page.wait_for_timeout(400)
            await page.click('#runBtn'); await page.wait_for_timeout(2500)
            info = await page.evaluate("""() => ({
              app: document.querySelector('#appName').textContent,
              views: document.querySelectorAll('#screen .av').length,
              texts: [...document.querySelectorAll('#screen .av')].map(v=>v.textContent.trim()).filter(t=>t&&t.length<60).slice(0,6),
              engine: document.querySelector('#enginePill').textContent.trim(),
              compiled: [...document.querySelectorAll('#repStats .stat')].map(s=>s.textContent).join(' | ').slice(0,80),
            })""")
            print(f'{apk}\n   {info}')
            clip = await page.evaluate("()=>{const r=document.querySelector('.phone').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}")
            await page.screenshot(path=f'{ROOT}/shots/f-{apk.split("_")[0]}.png', clip=clip)
            await page.close()
        await b.close()
    print('page errors:', len(errs), errs[:4])

asyncio.run(main())
