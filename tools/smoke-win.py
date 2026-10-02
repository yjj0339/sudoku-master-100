# 补充测试：过关流程 + 顶栏复查 + 桌面
from playwright.sync_api import sync_playwright
import os

URL = 'http://127.0.0.1:8917/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shots')
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(**pw.devices['iPhone 14'], locale='zh-CN')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(400)

    # 100 关顶栏复查
    page.evaluate("window.__startLevel(100)")
    page.wait_for_timeout(300)
    page.tap('#m-go')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/m12-hell-top.png')

    # 过关流程：进第 1 关，JS 预填全部答案但留一个用户格，再手动填它触发 win
    page.evaluate("window.__startLevel(1)")
    page.wait_for_timeout(300)
    page.evaluate("""() => {
      const cur = window.__getCur();
      for (let i = 0; i < 81; i++) cur.grid[i] = cur.solution[i];
      // 找一个非 given 格清空作为最后手填格
      window.__lastCell = [...Array(81).keys()].find(i => !cur.given[i]);
      cur.grid[window.__lastCell] = 0;
      cur.selected = window.__lastCell;
    }""")
    page.wait_for_timeout(200)
    last_cell = page.evaluate("window.__lastCell")
    last_digit = page.evaluate(f"window.__getCur().solution[{last_cell}]")
    page.locator('#board .cell').nth(last_cell).tap()
    page.locator('#numpad .num-btn').nth(last_digit - 1).tap()
    page.wait_for_timeout(900)
    page.screenshot(path=f'{OUT}/m13-win.png')
    # 下一关按钮
    if page.locator('#m-next').count() > 0:
        page.tap('#m-next')
        page.wait_for_timeout(500)
        page.screenshot(path=f'{OUT}/m14-next-level.png')
    ctx.close()

    dctx = b.new_context(viewport={'width': 1280, 'height': 800}, locale='zh-CN')
    pd = dctx.new_page()
    pd.on('pageerror', lambda e: errors.append(str(e)))
    pd.goto(URL)
    pd.wait_for_timeout(400)
    pd.screenshot(path=f'{OUT}/d1-home.png')
    dctx.close()
    b.close()

print('errors:', len(errors))
for e in errors[:10]: print(' !', e[:200])
print('done')
