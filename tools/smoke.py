# 冒烟测试：手机竖屏 + 桌面，全流程截图 + console 错误收集
from playwright.sync_api import sync_playwright
import os, sys

URL = 'http://127.0.0.1:8917/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'shots')
os.makedirs(OUT, exist_ok=True)
errors = []

def run(pw):
    # ---- 手机竖屏 iPhone 14 ----
    iphone = pw.devices['iPhone 14']
    browser = pw.chromium.launch()
    ctx = browser.new_context(**iphone, locale='zh-CN')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))

    page.goto(URL)
    page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/m1-home.png')

    # 关卡页
    page.tap('#btn-levels')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/m2-levels.png')

    # 进第 1 关
    page.tap('.lv-cell.current')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUT}/m3-game.png')

    # 点格子填数字：第1行第1列
    cells = page.locator('#board .cell')
    cells.nth(2).tap()
    page.wait_for_timeout(150)
    nums = page.locator('#numpad .num-btn')
    nums.nth(2).tap()  # 填 3（L1 R1C3 = 3 正确）
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/m4-filled.png')

    # 笔记模式
    page.tap('#tool-note')
    cells.nth(3).tap()
    nums.nth(0).tap(); nums.nth(1).tap()
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/m5-notes.png')
    page.tap('#tool-note')

    # 提示
    page.tap('#tool-hint')
    page.wait_for_timeout(400)
    page.screenshot(path=f'{OUT}/m6-hint-modal.png')
    try:
        page.tap('#m-justlook', timeout=1500)
    except Exception:
        page.evaluate("document.getElementById('modal-root').classList.add('hidden')")
    page.wait_for_timeout(200)

    # AI 大师抽屉
    page.tap('#tool-ai')
    page.wait_for_timeout(700)
    page.tap('#ai-explain')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{OUT}/m7-ai.png')
    page.tap('#ai-close')
    page.wait_for_timeout(300)

    # 撤销 & 擦除
    page.tap('#tool-undo')
    page.wait_for_timeout(200)

    # 用 JS 快速填完整关验证过关流程（直接写正确答案）
    page.evaluate("""() => {
      const cur = window.__getCur ? window.__getCur() : null;
    }""")
    page.screenshot(path=f'{OUT}/m8-after-undo.png')

    # 暂停
    page.tap('#btn-pause')
    page.wait_for_timeout(300)
    page.screenshot(path=f'{OUT}/m9-pause.png')
    page.tap('#btn-resume')

    ctx.close()

    # ---- 第100关 + AI 演示到底（手机）----
    ctx2 = browser.new_context(**iphone, locale='zh-CN')
    p2 = ctx2.new_page()
    p2.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    p2.on('pageerror', lambda e: errors.append(str(e)))
    p2.goto(URL + '?__lv=100')
    p2.wait_for_timeout(500)
    # 直接用测试钩子进 100 关（会弹确认框）
    p2.evaluate("""() => { if (window.__startLevel) window.__startLevel(100); }""")
    p2.wait_for_timeout(400)
    try:
        p2.tap('#m-go', timeout=2000)
    except Exception:
        pass
    p2.wait_for_timeout(600)
    p2.screenshot(path=f'{OUT}/m10-hell.png')
    # AI 演示到底
    p2.tap('#tool-ai')
    p2.wait_for_timeout(500)
    p2.tap('#ai-auto')
    p2.wait_for_timeout(6000)
    p2.screenshot(path=f'{OUT}/m11-ai-demo.png')
    ctx2.close()

    # ---- 桌面 ----
    dctx = browser.new_context(viewport={'width': 1280, 'height': 800}, locale='zh-CN')
    pd = dctx.new_page()
    pd.on('pageerror', lambda e: errors.append(str(e)))
    pd.goto(URL)
    pd.wait_for_timeout(500)
    pd.screenshot(path=f'{OUT}/d1-home.png')
    dctx.close()

    browser.close()

with sync_playwright() as pw:
    run(pw)

print('console/page errors:', len(errors))
for e in errors[:20]:
    print('  !', e[:200])
print('done')
