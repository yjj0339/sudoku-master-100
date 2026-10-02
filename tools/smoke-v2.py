# v2 冒烟测试：手机竖屏 + 桌面宽屏，全流程截图 + console 错误收集
from playwright.sync_api import sync_playwright
import os

URL = 'http://127.0.0.1:8917/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shots')
os.makedirs(OUT, exist_ok=True)
errors = []

def run(pw):
    browser = pw.chromium.launch()

    # ---- 手机竖屏 ----
    ctx = browser.new_context(**pw.devices['iPhone 14'], locale='zh-CN')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto(URL)
    page.wait_for_timeout(900)
    page.screenshot(path=f'{OUT}/v2-m1-home.png')

    # 每日挑战（生成+进入）
    page.evaluate("window.__startDaily()")
    page.wait_for_timeout(1600)
    page.screenshot(path=f'{OUT}/v2-m2-daily.png')
    # 回主页（用 back 键路径：游戏页返回按钮去 levels，直接 evaluate 走 win 之外的路径——直接刷新重来）
    page.reload()
    page.wait_for_timeout(700)

    # 关卡页
    page.tap('#btn-levels')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/v2-m3-levels.png')

    # 进第 1 关（呼吸动画导致不稳定，force 点击）
    page.tap('.lv-cell.current', force=True)
    page.wait_for_timeout(900)
    page.screenshot(path=f'{OUT}/v2-m4-game.png')

    # 填对一格 + 连击/波纹（快速填 3 个正确格）
    cells = page.locator('#board .cell')
    nums = page.locator('#numpad .num-btn')
    for idx in (2, 0, 1):
        cells.nth(idx).tap()
        page.wait_for_timeout(120)
        digit = page.evaluate(f"window.__getCur().solution[{idx}]")
        nums.nth(digit - 1).tap()
        page.wait_for_timeout(350)
    page.screenshot(path=f'{OUT}/v2-m5-combo.png')

    # 笔记
    page.tap('#tool-note')
    cells.nth(3).tap()
    nums.nth(0).tap(); nums.nth(1).tap()
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/v2-m6-notes.png')
    page.tap('#tool-note')

    # 提示
    page.tap('#tool-hint')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/v2-m7-hint.png')
    try:
        page.tap('#m-justlook', timeout=1500)
    except Exception:
        page.evaluate("document.getElementById('modal-root').classList.add('hidden')")
    page.wait_for_timeout(300)

    # AI sheet
    page.tap('#tool-ai')
    page.wait_for_timeout(800)
    page.tap('#ai-explain')
    page.wait_for_timeout(1400)
    page.screenshot(path=f'{OUT}/v2-m8-ai.png')
    page.tap('#ai-close')
    page.wait_for_timeout(600)

    # 过关（含 confetti）
    page.evaluate("""() => {
      const cur = window.__getCur();
      for (let i = 0; i < 81; i++) cur.grid[i] = cur.solution[i];
      const cell = [...Array(81).keys()].find(i => !cur.given[i]);
      cur.grid[cell] = 0; cur.selected = cell;
      window.__c = cell; window.__d = cur.solution[cell];
    }""")
    cell = page.evaluate("window.__c")
    digit = page.evaluate("window.__d")
    cells.nth(cell).tap()
    nums.nth(digit - 1).tap()
    page.wait_for_timeout(1000)
    page.screenshot(path=f'{OUT}/v2-m9-win.png')
    ctx.close()

    # ---- 桌面宽屏 ----
    dctx = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='zh-CN')
    pd = dctx.new_page()
    pd.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pd.on('pageerror', lambda e: errors.append(str(e)))
    pd.goto(URL)
    pd.wait_for_timeout(800)
    pd.screenshot(path=f'{OUT}/v2-d1-home.png')
    pd.evaluate("window.__startLevel(1)")
    pd.wait_for_timeout(900)
    pd.screenshot(path=f'{OUT}/v2-d2-game.png')
    # 键盘操作：方向键 + 数字
    pd.keyboard.press('ArrowRight')
    pd.keyboard.press('ArrowDown')
    dig = pd.evaluate("window.__getCur().solution[41]")
    pd.keyboard.press(str(dig))
    pd.wait_for_timeout(400)
    pd.screenshot(path=f'{OUT}/v2-d3-keyboard.png')
    # AI sheet 桌面
    pd.keyboard.press('a')
    pd.wait_for_timeout(800)
    pd.screenshot(path=f'{OUT}/v2-d4-ai.png')
    dctx.close()
    browser.close()

with sync_playwright() as pw:
    run(pw)

print('errors:', len(errors))
for e in errors[:20]:
    print('  !', e[:200])
print('done')
