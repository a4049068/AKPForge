import asyncio, os
os.environ.setdefault('HOME', '/tmp')
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'http://127.0.0.1:8765/index.html'

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for i, name in enumerate(['Bad Pixels', 'Red Screen', 'GPS Locker']):
            page = await b.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda e: errs.append(str(e)))
            await page.goto(URL, wait_until='load')
            await page.wait_for_timeout(400)
            await page.click(f'.sample-btn:has-text("{name}")')
            await page.wait_for_selector('#workbench.on', timeout=30000)
            await page.click('#runBtn')
            await page.wait_for_timeout(1500)
            info = await page.evaluate("""() => ({
              app: document.querySelector('#appName').textContent,
              screenLen: document.querySelector('#screen').innerHTML.length,
              views: document.querySelectorAll('#screen .av').length,
              texts: [...document.querySelectorAll('#screen .av')].map(v=>v.textContent).filter(t=>t&&t.trim()).slice(0,5),
              engine: document.querySelector('#enginePill').textContent.trim(),
            })""")
            print(f'{name}: {info}')
            clip = await page.evaluate("()=>{const r=document.querySelector('.phone').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}")
            await page.screenshot(path=f'{ROOT}/shots/s{i}-phone.png', clip=clip)
            await page.close()
        await b.close()
    print('page errors:', errs[:5], len(errs))

asyncio.run(main())
